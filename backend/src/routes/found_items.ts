import { Router } from "express";
import type { Request, Response } from "express";
import jwt from "jsonwebtoken";
import { pool } from "../db.js";
import { authenticateToken } from "../middleware/auth.js";
import type { AuthenticatedRequest } from "../middleware/auth.js";
import { logAudit } from "../utils/audit.js";
import { createNotification } from "../utils/notifications.js";

const router = Router();

// Hàm tạo mã ngẫu nhiên duy nhất FND-XXXXXX
function generateTrackingCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "FND-";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// 1. Tạo bản ghi đồ nhặt được (Luồng A)
router.post("/", async (req: Request, res: Response): Promise<void> => {
  const client = await pool.connect();
  try {
    const {
      item_name,
      category,
      description,
      found_location,
      found_at,
      image_url,
      finder_contact,
      slot_id,
      slot_code,
      locker_code,
    } = req.body;

    if (!item_name || typeof item_name !== "string" || !item_name.trim()) {
      res.status(400).json({ success: false, message: "Tên đồ vật là bắt buộc" });
      return;
    }

    if (!found_location || typeof found_location !== "string" || !found_location.trim()) {
      res.status(400).json({ success: false, message: "Địa điểm nhặt được là bắt buộc" });
      return;
    }

    await client.query("BEGIN");

    let finalSlotId: number | null = null;
    let targetSlotCode: string | null = null;
    let targetLockerId: number | null = null;
    let initialStatus = "reported"; // Mới ghi nhận thông tin

    // Nếu người dùng chọn gửi trực tiếp vào ngăn tủ (truyền slot_id hoặc slot_code như A01)
    if (slot_id) {
      const slotNum = Number(slot_id);
      const slotCheck = await client.query(
        "SELECT id, slot_code, occupancy_status, status, locker_id FROM locker_slots WHERE id = $1 FOR UPDATE",
        [slotNum]
      );

      if (slotCheck.rows.length === 0) {
        await client.query("ROLLBACK");
        res.status(404).json({ success: false, message: "Ngăn tủ không tồn tại" });
        return;
      }

      const slot = slotCheck.rows[0];
      const occ = (slot.occupancy_status || slot.status || "").toLowerCase();
      if (occ !== "empty") {
        await client.query("ROLLBACK");
        res.status(400).json({
          success: false,
          message: `Ngăn ${slot.slot_code} hiện không còn trống (${occ}). Vui lòng chọn ngăn khác.`,
        });
        return;
      }

      finalSlotId = slot.id;
      targetSlotCode = slot.slot_code;
      targetLockerId = slot.locker_id;
    } else if (slot_code) {
      const lCode = locker_code || "L-001";
      const slotCheck = await client.query(
        `SELECT s.id, s.slot_code, s.occupancy_status, s.status, s.locker_id 
         FROM locker_slots s 
         JOIN lockers l ON s.locker_id = l.id 
         WHERE l.locker_code = $1 AND s.slot_code = $2 FOR UPDATE`,
        [lCode, slot_code]
      );

      if (slotCheck.rows.length === 0) {
        await client.query("ROLLBACK");
        res.status(404).json({ success: false, message: `Ngăn tủ ${slot_code} không tồn tại` });
        return;
      }

      const slot = slotCheck.rows[0];
      const occ = (slot.occupancy_status || slot.status || "").toLowerCase();
      if (occ !== "empty") {
        await client.query("ROLLBACK");
        res.status(400).json({
          success: false,
          message: `Ngăn ${slot.slot_code} hiện không còn trống (${occ}). Vui lòng chọn ngăn khác.`,
        });
        return;
      }

      finalSlotId = slot.id;
      targetSlotCode = slot.slot_code;
      targetLockerId = slot.locker_id;
    }

    if (finalSlotId) {
      // Đánh dấu ngăn đã có đồ
      await client.query(
        `UPDATE locker_slots 
         SET occupancy_status = 'occupied', status = 'occupied', updated_at = now() 
         WHERE id = $1`,
        [finalSlotId]
      );

      initialStatus = "in_locker"; // Đang được lưu trong tủ

      // Kích hoạt mở ngăn tủ phần cứng cho người dùng cất đồ
      if (targetLockerId) {
        await client.query(
          `INSERT INTO locker_commands (locker_id, slot_id, command_type, status, parameters)
           VALUES ($1, $2, 'OPEN_SLOT', 'pending', $3)`,
          [targetLockerId, finalSlotId, JSON.stringify({ duration_ms: 10000, reason: "DEPOSIT_ITEM" })]
        );
      }

      // Ghi log mở/sử dụng ngăn an toàn
      try {
        await client.query(
          `INSERT INTO access_logs (slot_id, action, actor, success, reason)
           VALUES ($1, 'DEPOSIT_ITEM', $2, true, 'Người dùng cất đồ nhặt được vào ngăn')`,
          [finalSlotId, finder_contact || "Anonymous Finder"]
        );
      } catch (logErr) {
        console.warn("Could not insert access_log:", logErr);
      }
    }

    const trackingCode = generateTrackingCode();

    // Kiểm tra xem bảng found_items hiện có các cột nào (slot_id, locker_slot_id) để insert an toàn 100%
    const colCheck = await client.query(
      `SELECT column_name FROM information_schema.columns 
       WHERE table_name = 'found_items' AND column_name IN ('slot_id', 'locker_slot_id')`
    );
    const existingCols = colCheck.rows.map((r: any) => r.column_name);

    let insertQuery = "";
    let insertParams: any[] = [];

    if (existingCols.includes("slot_id") && existingCols.includes("locker_slot_id")) {
      insertQuery = `INSERT INTO found_items 
        (item_name, category, description, found_location, found_at, image_url, 
         finder_contact, slot_id, locker_slot_id, status, tracking_code)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING id, item_name, category, description, found_location, found_at,
                  image_url, finder_contact, status, tracking_code`;
      insertParams = [
        item_name.trim(),
        category || "other",
        description || null,
        found_location.trim(),
        found_at || new Date(),
        image_url || null,
        finder_contact || null,
        finalSlotId,
        finalSlotId,
        initialStatus,
        trackingCode,
      ];
    } else if (existingCols.includes("slot_id")) {
      insertQuery = `INSERT INTO found_items 
        (item_name, category, description, found_location, found_at, image_url, 
         finder_contact, slot_id, status, tracking_code)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id, item_name, category, description, found_location, found_at,
                  image_url, finder_contact, status, tracking_code`;
      insertParams = [
        item_name.trim(),
        category || "other",
        description || null,
        found_location.trim(),
        found_at || new Date(),
        image_url || null,
        finder_contact || null,
        finalSlotId,
        initialStatus,
        trackingCode,
      ];
    } else {
      insertQuery = `INSERT INTO found_items 
        (item_name, category, description, found_location, found_at, image_url, 
         finder_contact, locker_slot_id, status, tracking_code)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id, item_name, category, description, found_location, found_at,
                  image_url, finder_contact, status, tracking_code`;
      insertParams = [
        item_name.trim(),
        category || "other",
        description || null,
        found_location.trim(),
        found_at || new Date(),
        image_url || null,
        finder_contact || null,
        finalSlotId,
        initialStatus,
        trackingCode,
      ];
    }

    const insertResult = await client.query(insertQuery, insertParams);

    await client.query("COMMIT");

    const createdItem = insertResult.rows[0];
    await logAudit(null, "FOUND_ITEM_CREATED", {
      id: createdItem.id,
      tracking_code: trackingCode,
      has_slot: !!finalSlotId,
      slot_code: targetSlotCode,
    });

    // Trích xuất userId nếu có token
    let creatorUserId: number | null = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      try {
        const parts = authHeader.split(" ");
        const token = parts[1];
        if (token) {
          const secret = process.env.JWT_SECRET || "findbox_super_secret_jwt_key_2026_demo";
          const decoded = jwt.verify(token, secret) as any;
          if (decoded?.id) creatorUserId = Number(decoded.id);
        }
      } catch {}
    }

    // Gửi thông báo cho Admin
    if (finalSlotId) {
      await createNotification({
        role: "admin",
        title: `📦 Đồ mới gửi vào ngăn ${targetSlotCode}`,
        message: `Món đồ "${createdItem.item_name}" vừa được cất vào ngăn ${targetSlotCode}. Mã theo dõi: ${trackingCode}`,
        type: "locker",
      });
    } else {
      await createNotification({
        role: "admin",
        title: "📝 Thông tin đồ nhặt được mới",
        message: `Người dùng báo nhặt được "${createdItem.item_name}" tại "${createdItem.found_location}". Mã: ${trackingCode}`,
        type: "info",
      });
    }

    // Gửi thông báo cho người tìm thấy (nếu có tài khoản)
    if (creatorUserId) {
      await createNotification({
        userId: creatorUserId,
        title: finalSlotId ? "✅ Gửi đồ vào tủ thành công" : "✅ Đã ghi nhận thông tin đồ nhặt",
        message: finalSlotId
          ? `Bạn đã gửi thành công "${createdItem.item_name}" vào ngăn ${targetSlotCode}. Mã theo dõi: ${trackingCode}`
          : `Hệ thống đã lưu thông tin món đồ "${createdItem.item_name}". Cảm ơn hành động đẹp của bạn!`,
        type: "success",
      });
    }

    res.status(201).json({
      success: true,
      message: finalSlotId
        ? `Đã tiếp nhận đồ và mở ngăn ${targetSlotCode} để cất đồ thành công`
        : "Đã ghi nhận thông tin đồ nhặt được (chưa gửi vào ngăn tủ)",
      data: {
        ...createdItem,
        slot_code: targetSlotCode,
      },
    });
  } catch (error: any) {
    await client.query("ROLLBACK");
    console.error("Create found item error:", error);
    res.status(500).json({ 
      success: false, 
      message: error.message ? `Lỗi hệ thống: ${error.message}` : "Lỗi hệ thống khi tạo bản ghi đồ nhặt được" 
    });
  } finally {
    client.release();
  }
});

// 2. Danh sách đồ nhặt được (Áp dụng chính sách bảo mật thông tin tối thiểu cho User)
router.get("/", async (req: Request, res: Response): Promise<void> => {
  try {
    const { search, category, status } = req.query;

    // Kiểm tra xem có token của Admin hay không
    let isAdmin = false;
    const authHeader = req.headers["authorization"];
    if (authHeader && authHeader.startsWith("Bearer ")) {
      try {
        const token = authHeader.split(" ")[1];
        if (token) {
          const decoded = jwt.verify(
            token,
            process.env.JWT_SECRET || "findbox_super_secret_jwt_key_2026_demo"
          ) as any;
          if (decoded?.role === "admin") {
            isAdmin = true;
          }
        }
      } catch {
        // Token không hợp lệ thì coi như khách/user thường
      }
    }

    let query = `
      SELECT 
        f.id,
        f.item_name,
        f.category,
        f.found_location,
        f.found_at,
        CASE WHEN f.status = 'stored' THEN 'in_locker' ELSE f.status END as status,
        f.tracking_code,
        f.image_url,
        f.slot_id,
        s.slot_code,
        l.locker_code,
        ${isAdmin ? "f.description, f.finder_contact," : "NULL as description, NULL as finder_contact,"}
        COALESCE(f.found_at, now()) as created_at
      FROM found_items f
      LEFT JOIN locker_slots s ON f.slot_id = s.id
      LEFT JOIN lockers l ON s.locker_id = l.id
      WHERE 1=1
    `;

    const params: any[] = [];

    if (search && typeof search === "string" && search.trim()) {
      params.push(`%${search.trim().toLowerCase()}%`);
      query += ` AND (LOWER(f.item_name) LIKE $${params.length} OR LOWER(f.found_location) LIKE $${params.length})`;
    }

    if (category && typeof category === "string" && category !== "all") {
      params.push(category);
      query += ` AND f.category = $${params.length}`;
    }

    if (status && typeof status === "string" && status !== "all") {
      params.push(status);
      query += ` AND f.status = $${params.length}`;
    }

    query += ` ORDER BY f.id DESC`;

    const result = await pool.query(query, params);

    // Xử lý dữ liệu trả về cho User: ẩn mã ngăn chi tiết A01/A02, chỉ hiển thị tên tủ tổng quan
    const safeData = result.rows.map((row) => {
      if (!isAdmin) {
        return {
          ...row,
          slot_code: row.slot_code ? "Đang bảo quản trong tủ" : "Chưa gửi vào tủ",
          slot_id: undefined, // Ẩn ID ngăn chi tiết
        };
      }
      return row;
    });

    res.json({
      success: true,
      data: safeData,
    });
  } catch (error) {
    console.error("Get found items error:", error);
    res.status(500).json({ success: false, message: "Không thể lấy danh sách đồ tìm thấy" });
  }
});

// 3. Chi tiết một món đồ tìm thấy
router.get("/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    if (!id || isNaN(id)) {
      res.status(400).json({ success: false, message: "ID không hợp lệ" });
      return;
    }

    let isAdmin = false;
    const authHeader = req.headers["authorization"];
    if (authHeader && authHeader.startsWith("Bearer ")) {
      try {
        const token = authHeader.split(" ")[1];
        if (token) {
          const decoded = jwt.verify(
            token,
            process.env.JWT_SECRET || "findbox_super_secret_jwt_key_2026_demo"
          ) as any;
          if (decoded?.role === "admin") {
            isAdmin = true;
          }
        }
      } catch {
        // Khách
      }
    }

    const query = `
      SELECT 
        f.id,
        f.item_name,
        f.category,
        f.found_location,
        f.found_at,
        CASE WHEN f.status = 'stored' THEN 'in_locker' ELSE f.status END as status,
        f.tracking_code,
        f.image_url,
        f.slot_id,
        s.slot_code,
        l.locker_code,
        ${isAdmin ? "f.description, f.finder_contact," : "NULL as description, NULL as finder_contact,"}
        COALESCE(f.found_at, now()) as created_at
      FROM found_items f
      LEFT JOIN locker_slots s ON f.slot_id = s.id
      LEFT JOIN lockers l ON s.locker_id = l.id
      WHERE f.id = $1
    `;

    const result = await pool.query(query, [id]);
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: "Không tìm thấy đồ vật" });
      return;
    }

    const item = result.rows[0];
    if (!isAdmin) {
      item.slot_code = item.slot_code ? "Đang bảo quản trong tủ" : "Chưa gửi vào tủ";
      item.slot_id = undefined;
    }

    res.json({
      success: true,
      data: item,
    });
  } catch (error) {
    console.error("Get found item detail error:", error);
    res.status(500).json({ success: false, message: "Lỗi khi lấy chi tiết đồ vật" });
  }
});

export default router;
