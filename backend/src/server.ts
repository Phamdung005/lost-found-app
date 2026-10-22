import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { pool } from "./db.js";
import authRouter from "./routes/auth.js";
import foundItemsRouter from "./routes/found_items.js";
import claimsRouter from "./routes/claims.js";
import deviceRouter from "./routes/device.js";
import { runAuthMigration } from "./migrations/init_auth.js";
import { runBusinessMigration } from "./migrations/init_business.js";
import { runDeviceMigration } from "./migrations/init_device.js";
import { authenticateToken, requireAdmin } from "./middleware/auth.js";

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
      if (!slot_code || !slot_code.trim()) {
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
        `INSERT INTO locker_slots (locker_id, slot_code, status, occupancy_status, door_status, device_status)
         VALUES ($1, $2, 'empty', 'empty', 'closed', 'online')
         RETURNING id, locker_id, slot_code, status, occupancy_status, door_status, device_status`,
        [lockerId, slot_code]
      );

      res.status(201).json({
        success: true,
        message: `Đã thêm ngăn tủ ${slot_code} thành công`,
        data: insertRes.rows[0],
      });
    } catch (error) {
      console.error("Add slot failed:", error);
      res.status(500).json({ success: false, message: "Lỗi khi thêm ngăn tủ" });
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
      SELECT id, item_name, category, description, lost_location,
             lost_at, reporter_contact, status, created_at
      FROM lost_reports
      WHERE 1=1
    `;
    const params: any[] = [];

    if (search && typeof search === "string" && search.trim()) {
      params.push(`%${search.trim().toLowerCase()}%`);
      query += ` AND (LOWER(item_name) LIKE $${params.length} OR LOWER(lost_location) LIKE $${params.length})`;
    }

    if (category && typeof category === "string" && category !== "all") {
      params.push(category);
      query += ` AND category = $${params.length}`;
    }

    query += ` ORDER BY created_at DESC`;

    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error("Get lost reports failed:", error);
    res.status(500).json({
      success: false,
      message: "Không thể lấy danh sách báo mất đồ",
    });
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

    const result = await pool.query(
      `INSERT INTO lost_reports
       (item_name, category, description, lost_location, lost_at, reporter_contact)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, item_name, category, description, lost_location,
                 lost_at, reporter_contact, status, created_at`,
      [
        item_name.trim(),
        category || "other",
        description || null,
        lost_location.trim(),
        lost_at || null,
        reporter_contact || null,
      ]
    );

    res.status(201).json({
      success: true,
      message: "Đã ghi nhận báo cáo mất đồ",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Create lost report failed:", error);
    res.status(500).json({
      success: false,
      message: "Không thể tạo báo cáo mất đồ",
    });
  }
});

// Endpoint kiểm tra quyền Admin
app.get("/api/admin/check", authenticateToken, requireAdmin, (req, res) => {
  res.json({
    success: true,
    message: "Xác thực Admin hợp lệ",
    admin: (req as any).user,
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
  });
}

startServer();