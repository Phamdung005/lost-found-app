import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { pool } from "./db.js";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(cors());
app.use(express.json());

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
          l.locker_code,
          s.slot_code,
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

app.listen(PORT, () => {
  console.log(`Smart Locker API running at http://localhost:${PORT}`);
});