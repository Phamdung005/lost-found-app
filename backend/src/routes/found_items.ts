import { Router } from "express";
import type { Request, Response } from "express";
import jwt from "jsonwebtoken";
import { pool } from "../db.js";
import { authenticateToken } from "../middleware/auth.js";
import type { AuthenticatedRequest } from "../middleware/auth.js";
import { logAudit } from "../utils/audit.js";

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
    let initialStatus = "reported"; // Mới ghi nhận thông tin

    // Nếu người dùng chọn gửi trực tiếp vào ngăn tủ
    if (slot_id) {
      const slotNum = Number(slot_id);
      const slotCheck = await client.query(
        "SELECT id, slot_code, occupancy_status, status FROM locker_slots WHERE id = $1 FOR UPDATE",
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

      // Đánh dấu ngăn đã có đồ
      await client.query(
        `UPDATE locker_slots 
         SET occupancy_status = 'occupied', status = 'occupied', updated_at = now() 
         WHERE id = $1`,
        [slotNum]
      );

      finalSlotId = slotNum;
      initialStatus = "stored"; // Đã được đưa vào tủ

      // Ghi log mở/sử dụng ngăn
      await client.query(
        `INSERT INTO access_logs (slot_id, action, actor, success, reason)
         VALUES ($1, 'DEPOSIT_ITEM', $2, true, 'Người dùng cất đồ nhặt được vào ngăn')`,
        [slotNum, finder_contact || "Anonymous Finder"]
      );
    }

    const trackingCode = generateTrackingCode();

    const insertResult = await client.query(
      `INSERT INTO found_items 
       (item_name, category, description, found_location, found_at, image_url, 
        finder_contact, slot_id, status, tracking_code)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, item_name, category, description, found_location, found_at,
                 image_url, finder_contact, slot_id, status, tracking_code`,
      [
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
      ]
    );

    await client.query("COMMIT");

    const createdItem = insertResult.rows[0];
    await logAudit(null, "FOUND_ITEM_CREATED", {
      id: createdItem.id,
      tracking_code: trackingCode,
      has_slot: !!finalSlotId,
    });

    res.status(201).json({
      success: true,
      message: finalSlotId
        ? "Đã lưu thông tin và tiếp nhận đồ vào ngăn tủ thành công"
        : "Đã ghi nhận thông tin đồ nhặt được (chưa gửi vào ngăn tủ)",
      data: createdItem,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Create found item error:", error);
    res.status(500).json({ success: false, message: "Lỗi hệ thống khi tạo bản ghi đồ nhặt được" });
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
        f.status,
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
        f.status,
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
