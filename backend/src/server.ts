import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import { pool } from "./db.js";
import authRouter from "./routes/auth.js";
import foundItemsRouter from "./routes/found_items.js";
import claimsRouter from "./routes/claims.js";
import deviceRouter from "./routes/device.js";
import notificationsRouter from "./routes/notifications.js";
import uploadsRouter from "./routes/uploads.js";
import { runAuthMigration } from "./migrations/init_auth.js";
import { runBusinessMigration } from "./migrations/init_business.js";
import { runDeviceMigration } from "./migrations/init_device.js";
import { authenticateToken, requireAdmin } from "./middleware/auth.js";
import type { AuthenticatedRequest } from "./middleware/auth.js";
import { createNotification } from "./utils/notifications.js";
import { parseHardwareConfig } from "./utils/hardware-config.js";
import { getGeminiStatus, matchLostReportAgainstFoundItems, scanOpenLostReports } from "./services/lost-item-matching.js";
import { logAudit } from "./utils/audit.js";
import { createObjectReadUrls } from "./services/object-storage.js";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(cors());
app.use(express.json());

// Routes
app.use("/api/auth", authRouter);
app.use("/api/found-items", foundItemsRouter);
app.use("/api/claims", claimsRouter);
app.use("/api/device", deviceRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/uploads", uploadsRouter);

function isAdminRequest(req: express.Request): boolean {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return false;

  try {
    const token = authHeader.slice("Bearer ".length);
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "findbox_super_secret_jwt_key_2026_demo",
    ) as { role?: string };
    return decoded.role === "admin";
  } catch {
    return false;
  }
}

app.get("/api/db-check", async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        current_database() AS database,
        NOW() AS server_time
    `);

    res.json({
      success: true,
      message: "PostgreSQL connected successfully",
      data: result.rows[0],
    });

  } catch (error) {
    console.error("Database connection failed:", error);
    res.status(500).json({
      success: false,
      message: "Cannot connect to PostgreSQL",
    });
  }
});

app.get("/api/lost-reports/:id/matches", authenticateToken, async (req, res) => {
  try {
    const reportResult = await pool.query(
      "SELECT user_id FROM lost_reports WHERE id = $1",
      [Number(req.params.id)],
    );
    if (reportResult.rowCount === 0) {
      res.status(404).json({ success: false, message: "Không tìm thấy báo cáo mất đồ" });
      return;
    }

    const currentUser = (req as AuthenticatedRequest).user;
    if (currentUser?.role !== "admin" && reportResult.rows[0].user_id !== currentUser?.id) {
      res.status(403).json({ success: false, message: "Bạn không có quyền xem kết quả đối chiếu này" });
      return;
    }

    const result = await pool.query(
      `SELECT lrm.*, fi.item_name, fi.category, fi.description, fi.found_location,
             fi.tracking_code, fi.status AS found_item_status, fi.image_object_keys
       FROM lost_report_matches lrm
       JOIN found_items fi ON fi.id = lrm.found_item_id
       WHERE lrm.lost_report_id = $1
       ORDER BY lrm.score DESC, lrm.created_at DESC`,
      [Number(req.params.id)],
    );
    const canViewImages = (req as AuthenticatedRequest).user?.role === "admin";
    const matches = await Promise.all(result.rows.map(async (match) => {
      const imageUrls = canViewImages ? await createObjectReadUrls(match.image_object_keys) : [];
      return {
        ...match,
        image_object_keys: undefined,
        image_urls: imageUrls,
        image_url: imageUrls[0] || null,
      };
    }));
    res.json({ success: true, data: matches });
  } catch (error) {
    console.error("Get lost report matches failed:", error);
    res.status(500).json({ success: false, message: "Không thể lấy kết quả đối chiếu" });
  }
});

app.get("/api/lockers", async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        id,
        locker_code,
        location,
        status
      FROM lockers
      ORDER BY id
    `);

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error("Get lockers failed:", error);
    res.status(500).json({
      success: false,
      message: "Không thể lấy danh sách tủ",
    });
  }
});

app.get("/api/lockers/:lockerCode/slots", async (req, res) => {
  try {
    const result = await pool.query(
      `
        SELECT
          s.id,
          l.locker_code,
          s.slot_code,
          COALESCE(s.occupancy_status, s.status, 'empty') AS occupancy_status,
          COALESCE(s.door_status, 'closed') AS door_status,
          COALESCE(s.device_status, 'online') AS device_status,
          s.hardware_enabled,
          s.servo_pin,
          s.sensor_pin,
          s.status
        FROM lockers l
        JOIN locker_slots s ON s.locker_id = l.id
        WHERE l.locker_code = $1
        ORDER BY s.slot_code
      `,
      [req.params.lockerCode]
    );

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error("Get locker slots failed:", error);
    res.status(500).json({
      success: false,
      message: "Không thể lấy danh sách ngăn tủ",
    });
  }
});

// 1. Thêm ngăn tủ mới (Admin)
app.post(
  "/api/lockers/:lockerCode/slots",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const { lockerCode } = req.params;
      let { slot_code } = req.body;
      let hardwareConfig;
      try {
        hardwareConfig = parseHardwareConfig(req.body);
      } catch (error) {
        res.status(400).json({ success: false, message: error instanceof Error ? error.message : "Cấu hình phần cứng không hợp lệ" });
        return;
      }

      const lockerRes = await pool.query(
        "SELECT id FROM lockers WHERE locker_code = $1",
        [lockerCode]
      );
      if (lockerRes.rowCount === 0) {
        res.status(404).json({ success: false, message: "Không tìm thấy tủ" });
        return;
      }
      const lockerId = lockerRes.rows[0].id;

      // Nếu không nhập slot_code, tự động sinh mã kế tiếp (A01, A02 -> A03...)
      if (typeof slot_code !== "string" || !slot_code.trim()) {
        const existingSlots = await pool.query(
          "SELECT slot_code FROM locker_slots WHERE locker_id = $1 ORDER BY id DESC",
          [lockerId]
        );
        const count = existingSlots.rowCount || 0;
        const nextNum = (count + 1).toString().padStart(2, "0");
        slot_code = `A${nextNum}`;
      } else {
        slot_code = slot_code.trim().toUpperCase();
      }

      if (!/^[A-Z][A-Z0-9_-]{0,49}$/.test(slot_code)) {
        res.status(400).json({ success: false, message: "Mã ngăn chỉ gồm chữ cái, số, gạch ngang hoặc gạch dưới" });
        return;
      }

      // Kiểm tra trùng mã ngăn
      const dupCheck = await pool.query(
        "SELECT id FROM locker_slots WHERE locker_id = $1 AND slot_code = $2",
        [lockerId, slot_code]
      );
      if ((dupCheck.rowCount || 0) > 0) {
        res.status(400).json({
          success: false,
          message: `Ngăn tủ ${slot_code} đã tồn tại trong tủ này`,
        });
        return;
      }

      const insertRes = await pool.query(
        `INSERT INTO locker_slots (
           locker_id, slot_code, status, occupancy_status, door_status, device_status,
           hardware_enabled, servo_pin, sensor_pin
         )
         VALUES ($1, $2, 'empty', 'empty', 'closed', 'online', $3, $4, $5)
         RETURNING id, locker_id, slot_code, status, occupancy_status, door_status, device_status,
                   hardware_enabled, servo_pin, sensor_pin`,
        [lockerId, slot_code, hardwareConfig.hardwareEnabled, hardwareConfig.servoPin, hardwareConfig.sensorPin]
      );

      res.status(201).json({
        success: true,
        message: `Đã thêm ngăn tủ ${slot_code} thành công`,
        data: insertRes.rows[0],
      });
    } catch (error: any) {
      if (error?.code === "23505") {
        res.status(400).json({ success: false, message: "GPIO đã được sử dụng bởi một ngăn phần cứng khác" });
        return;
      }
      console.error("Add slot failed:", error);
      res.status(500).json({ success: false, message: "Lỗi khi thêm ngăn tủ" });
    }
  }
);

// 2. Cập nhật cấu hình phần cứng của ngăn (Admin)
app.patch(
  "/api/lockers/slots/:slotId/config",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      let hardwareConfig;
      try {
        hardwareConfig = parseHardwareConfig(req.body);
      } catch (error) {
        res.status(400).json({ success: false, message: error instanceof Error ? error.message : "Cấu hình phần cứng không hợp lệ" });
        return;
      }

      const slotRes = await pool.query(
        "SELECT id, slot_code, occupancy_status FROM locker_slots WHERE id = $1",
        [req.params.slotId]
      );
      if (slotRes.rowCount === 0) {
        res.status(404).json({ success: false, message: "Không tìm thấy ngăn tủ" });
        return;
      }
      if (slotRes.rows[0].occupancy_status === "occupied") {
        res.status(400).json({ success: false, message: `Ngăn ${slotRes.rows[0].slot_code} đang chứa đồ, không thể đổi cấu hình phần cứng` });
        return;
      }

      const result = await pool.query(
        `UPDATE locker_slots
         SET hardware_enabled = $1, servo_pin = $2, sensor_pin = $3, updated_at = now()
         WHERE id = $4
         RETURNING id, slot_code, hardware_enabled, servo_pin, sensor_pin`,
        [hardwareConfig.hardwareEnabled, hardwareConfig.servoPin, hardwareConfig.sensorPin, req.params.slotId]
      );

      res.json({ success: true, message: `Đã cập nhật cấu hình phần cứng cho ngăn ${result.rows[0].slot_code}`, data: result.rows[0] });
    } catch (error: any) {
      if (error?.code === "23505") {
        res.status(400).json({ success: false, message: "GPIO đã được sử dụng bởi một ngăn phần cứng khác" });
        return;
      }
      console.error("Update slot hardware config failed:", error);
      res.status(500).json({ success: false, message: "Lỗi khi cập nhật cấu hình phần cứng" });
    }
  }
);

// 2. Xóa ngăn tủ (Admin - An toàn, chỉ xóa khi ngăn trống)
app.delete(
  "/api/lockers/slots/:slotId",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const { slotId } = req.params;

      const slotRes = await pool.query(
        "SELECT id, slot_code, occupancy_status FROM locker_slots WHERE id = $1",
        [slotId]
      );
      if (slotRes.rowCount === 0) {
        res.status(404).json({ success: false, message: "Không tìm thấy ngăn tủ" });
        return;
      }

      const slot = slotRes.rows[0];

      // Không cho xóa nếu ngăn đang chứa đồ
      if (slot.occupancy_status === "occupied") {
        res.status(400).json({
          success: false,
          message: `Ngăn ${slot.slot_code} đang chứa đồ! Vui lòng lấy đồ ra trước khi xóa.`,
        });
        return;
      }

      // Kiểm tra xem có đồ thất lạc nào đang gắn với ngăn này không
      const itemCheck = await pool.query(
        "SELECT id FROM found_items WHERE locker_slot_id = $1 AND status != 'claimed'",
        [slotId]
      );
      if ((itemCheck.rowCount || 0) > 0) {
        res.status(400).json({
          success: false,
          message: `Ngăn ${slot.slot_code} đang liên kết với đồ thất lạc chưa giải quyết!`,
        });
        return;
      }

      await pool.query("DELETE FROM locker_slots WHERE id = $1", [slotId]);

      res.json({
        success: true,
        message: `Đã xóa ngăn tủ ${slot.slot_code} thành công`,
      });
    } catch (error) {
      console.error("Delete slot failed:", error);
      res.status(500).json({ success: false, message: "Lỗi khi xóa ngăn tủ" });
    }
  }
);

// 3. Đổi trạng thái ngăn tủ (Trống <-> Bảo trì)
app.patch(
  "/api/lockers/slots/:slotId/status",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const { slotId } = req.params;
      const { status } = req.body;

      if (!["empty", "maintenance"].includes(status)) {
        res.status(400).json({ success: false, message: "Trạng thái không hợp lệ" });
        return;
      }

      const updateRes = await pool.query(
        `UPDATE locker_slots 
         SET occupancy_status = $1, status = $1, updated_at = now()
         WHERE id = $2
         RETURNING id, slot_code, occupancy_status, status`,
        [status, slotId]
      );

      if (updateRes.rowCount === 0) {
        res.status(404).json({ success: false, message: "Không tìm thấy ngăn tủ" });
        return;
      }

      res.json({
        success: true,
        message: `Đã chuyển ngăn ${updateRes.rows[0].slot_code} sang ${
          status === "maintenance" ? "Bảo trì" : "Hoạt động"
        }`,
        data: updateRes.rows[0],
      });
    } catch (error) {
      console.error("Update slot status failed:", error);
      res.status(500).json({ success: false, message: "Lỗi cập nhật trạng thái ngăn" });
    }
  }
);

app.get("/api/lost-reports", async (req, res) => {
  try {
    const { search, category } = req.query;
    let query = `
      SELECT lr.id, lr.item_name, lr.category, lr.description, lr.lost_location,
             lr.lost_at, lr.reporter_contact, lr.status, lr.user_id, lr.created_at,
             lr.image_object_keys,
             COUNT(lrm.id)::int AS match_count,
             MAX(lrm.score) AS best_match_score
      FROM lost_reports lr
      LEFT JOIN lost_report_matches lrm ON lrm.lost_report_id = lr.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (search && typeof search === "string" && search.trim()) {
      params.push(`%${search.trim().toLowerCase()}%`);
      query += ` AND (LOWER(lr.item_name) LIKE $${params.length} OR LOWER(lr.lost_location) LIKE $${params.length})`;
    }

    if (category && typeof category === "string" && category !== "all") {
      params.push(category);
      query += ` AND lr.category = $${params.length}`;
    }

    query += ` GROUP BY lr.id ORDER BY lr.created_at DESC`;

    const canViewImages = isAdminRequest(req);
    const result = await pool.query(query, params);
    const reports = await Promise.all(result.rows.map(async (report) => ({
      ...report,
      image_object_keys: undefined,
      image_urls: canViewImages ? await createObjectReadUrls(report.image_object_keys) : [],
    })));
    res.json({ success: true, data: reports });
  } catch (error) {
    console.error("Get lost reports failed:", error);
    res.status(500).json({
      success: false,
      message: "Không thể lấy danh sách báo mất đồ",
    });

  }
});

app.get("/api/lost-reports/my", authenticateToken, async (req, res) => {
  try {
    const userId = (req as AuthenticatedRequest).user?.id;
    const result = await pool.query(
      `SELECT lr.id, lr.item_name, lr.category, lr.description, lr.lost_location,
              lr.lost_at, lr.reporter_contact, lr.status, lr.created_at,
              lr.image_object_keys,
              COUNT(lrm.id)::int AS match_count,
              MAX(lrm.score) AS best_match_score,
              MAX(lrm.created_at) AS last_match_at
       FROM lost_reports lr
       LEFT JOIN lost_report_matches lrm ON lrm.lost_report_id = lr.id
       WHERE lr.user_id = $1
       GROUP BY lr.id
       ORDER BY lr.created_at DESC`,
      [userId],
    );
    const reports = await Promise.all(result.rows.map(async (report) => ({
      ...report,
      image_object_keys: undefined,
      image_urls: [],
    })));
    res.json({ success: true, data: reports });
  } catch (error) {
    console.error("Get my lost reports failed:", error);
    res.status(500).json({ success: false, message: "Không thể tải đơn báo mất của bạn" });
  }
});

app.post("/api/lost-reports", async (req, res) => {
  try {
    const {
      item_name,
      category,
      description,
      lost_location,
      lost_at,
      reporter_contact,
      image_object_keys,
    } = req.body;

    if (
      typeof item_name !== "string" ||
      !item_name.trim() ||
      typeof lost_location !== "string" ||
      !lost_location.trim()
    ) {
      res.status(400).json({
        success: false,
        message: "Tên đồ vật và địa điểm mất là bắt buộc",
      });
      return;
    }

    // Lấy user_id nếu có Bearer token
    let userId: number | null = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      try {
        const parts = authHeader.split(" ");
        const token = parts[1];
        if (token) {
          const secret = process.env.JWT_SECRET || "findbox_super_secret_jwt_key_2026_demo";
          const decoded = jwt.verify(token, secret) as any;
          if (decoded?.id) userId = Number(decoded.id);
        }
      } catch {}
    }

    const result = await pool.query(
      `INSERT INTO lost_reports
       (item_name, category, description, lost_location, lost_at, reporter_contact, user_id, status,
        image_object_key, image_object_keys)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'searching', $8, $9)
       RETURNING id, item_name, category, description, lost_location,
                 lost_at, reporter_contact, user_id, status, image_object_key, image_object_keys, created_at`,
      [
        item_name.trim(),
        category || "other",
        description || null,
        lost_location.trim(),
        lost_at || null,
        reporter_contact || null,
        userId,
        Array.isArray(image_object_keys) && image_object_keys.length > 0 ? image_object_keys[0] : null,
        JSON.stringify(Array.isArray(image_object_keys) ? image_object_keys.slice(0, 3) : []),
      ]
    );

    const report = result.rows[0];
    await logAudit(userId, "LOST_REPORT_CREATED", {
      lost_report_id: report.id,
      item_name: report.item_name,
      category: report.category,
    });

    if (report.id) {
      void matchLostReportAgainstFoundItems(Number(report.id)).catch((error) => {
        console.error("Lost report matching failed:", error);
      });
    }

    // Gửi thông báo cho Admin
    await createNotification({
      role: "admin",
      title: "🔍 Báo cáo mất đồ mới",
      message: `Người dùng ${reporter_contact || "vãng lai"} vừa báo mất món đồ "${item_name.trim()}" tại ${lost_location.trim()}`,
      type: "info",
    });

    // Gửi thông báo cho người dùng (nếu có tài khoản)
    if (userId) {
      await createNotification({
        userId,
        title: "📌 Đã ghi nhận báo cáo mất đồ",
        message: `Hệ thống đã lưu báo cáo mất "${item_name.trim()}". Chúng tôi sẽ thông báo cho bạn ngay khi có người tìm thấy!`,
        type: "success",
      });
    }

    res.status(201).json({
      success: true,
      message: "Đã ghi nhận báo cáo mất đồ",
      data: report,
    });
  } catch (error) {
    console.error("Create lost report failed:", error);
    res.status(500).json({
      success: false,
      message: "Không thể tạo báo cáo mất đồ",
    });
  }
});

// Cập nhật trạng thái báo cáo mất đồ (Dành cho Admin)
app.patch("/api/lost-reports/:id", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!["searching", "found", "closed"].includes(status)) {
      res.status(400).json({ success: false, message: "Trạng thái không hợp lệ (searching, found, closed)" });
      return;
    }

    const result = await pool.query(
      `UPDATE lost_reports SET status = $1, updated_at = now() WHERE id = $2 RETURNING *`,
      [status, id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: "Không tìm thấy báo cáo mất đồ" });
      return;
    }

    const report = result.rows[0];
    await logAudit((req as AuthenticatedRequest).user?.id ?? null, "LOST_REPORT_STATUS_UPDATED", {
      lost_report_id: report.id,
      status,
    });

    // Gửi thông báo cho người báo mất nếu có user_id
    if (report.user_id) {
      const statusText = status === "found" ? "Đã tìm thấy" : status === "closed" ? "Đã đóng" : "Đang tìm kiếm";
      await createNotification({
        userId: report.user_id,
        title: "🔔 Cập nhật báo cáo mất đồ",
        message: `Báo cáo mất "${report.item_name}" của bạn đã được Admin cập nhật sang trạng thái: [${statusText}].`,
        type: status === "found" ? "success" : "info",
      });
    }

    res.json({ success: true, message: "Đã cập nhật trạng thái báo cáo", data: report });
  } catch (error) {
    console.error("Update lost report error:", error);
    res.status(500).json({ success: false, message: "Lỗi khi cập nhật báo cáo" });
  }
});

// Xóa báo cáo mất đồ (Dành cho Admin)
app.delete("/api/lost-reports/:id", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query("DELETE FROM lost_reports WHERE id = $1 RETURNING id", [id]);
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: "Không tìm thấy báo cáo mất đồ" });
      return;
    }
    await logAudit((req as AuthenticatedRequest).user?.id ?? null, "LOST_REPORT_DELETED", {
      lost_report_id: Number(id),
    });
    res.json({ success: true, message: "Đã xóa báo cáo mất đồ thành công" });
  } catch (error) {
    console.error("Delete lost report error:", error);
    res.status(500).json({ success: false, message: "Lỗi khi xóa báo cáo" });
  }
});

// Endpoint làm sạch dữ liệu thử nghiệm (Chỉ giữ lại ngăn tủ A01, A02 và tài khoản người dùng)
app.post("/api/admin/clear-data", async (req, res) => {
  try {
    let isAuthorized = false;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      try {
        const parts = authHeader.split(" ");
        const token = parts[1];
        if (token) {
          const secret = process.env.JWT_SECRET || "findbox_super_secret_jwt_key_2026_demo";
          const decoded = jwt.verify(token, secret) as any;
          if (decoded?.role === "admin") isAuthorized = true;
        }
      } catch {}
    }
    if (req.query.secret === "findbox_reset_2026" || req.body?.secret === "findbox_reset_2026") {
      isAuthorized = true;
    }

    if (!isAuthorized) {
      res.status(403).json({ success: false, message: "Không có quyền thực hiện thao tác này" });
      return;
    }

    await pool.query(`
      TRUNCATE TABLE found_item_claims CASCADE;
      TRUNCATE TABLE found_items CASCADE;
      TRUNCATE TABLE lost_reports CASCADE;
      TRUNCATE TABLE access_logs CASCADE;
      TRUNCATE TABLE locker_commands CASCADE;
      TRUNCATE TABLE notifications CASCADE;
      UPDATE locker_slots 
      SET status = 'empty', 
          occupancy_status = 'empty', 
          door_status = 'closed', 
          device_status = 'online',
          updated_at = now();
    `);

    await createNotification({
      role: "admin",
      title: "🚀 Đã dọn sạch dữ liệu hệ thống",
      message: "Admin đã xóa toàn bộ dữ liệu đồ vật, báo cáo và yêu cầu thử nghiệm. Các ngăn tủ A01, A02 đã sẵn sàng hoạt động.",
      type: "success",
    });

    res.json({
      success: true,
      message: "Đã dọn dẹp toàn bộ dữ liệu thử nghiệm thành công! Các ngăn tủ A01, A02 và tài khoản người dùng được giữ nguyên.",
    });
  } catch (err) {
    console.error("Clear data error:", err);
    res.status(500).json({ success: false, message: "Lỗi hệ thống khi dọn dẹp dữ liệu" });
  }
});

// Endpoint kiểm tra quyền Admin
app.get("/api/admin/check", authenticateToken, requireAdmin, (req, res) => {
  res.json({
    success: true,
    message: "Xác thực Admin hợp lệ",
    admin: (req as any).user,
  });

  app.get("/api/admin/ai-status", authenticateToken, requireAdmin, (_req, res) => {
    res.json({ success: true, data: getGeminiStatus() });
  });
});

async function startServer() {
  try {
    await runAuthMigration();
    await runBusinessMigration();
    await runDeviceMigration();
  } catch (err) {
    console.warn("Migration warning at start:", err);
  }

  app.listen(PORT, () => {
    console.log(`Smart Locker API running at http://localhost:${PORT}`);
    const scan = () => {
      void scanOpenLostReports().catch((error) => {
        console.error("Scheduled lost report matching failed:", error);
      });
    };
    scan();
    setInterval(scan, 60_000);
  });
}

startServer();