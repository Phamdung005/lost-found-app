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