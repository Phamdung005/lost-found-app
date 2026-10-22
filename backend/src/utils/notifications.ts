import { pool } from "../db.js";

export async function createNotification({
  userId = null,
  role = null,
  title,
  message,
  type = "info",
}: {
  userId?: number | null;
  role?: "admin" | "user" | null;
  title: string;
  message: string;
  type?: "info" | "success" | "warning" | "error" | "claim" | "locker";
}): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO notifications (user_id, role, title, message, type)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, role, title, message, type]
    );
  } catch (err) {
    console.warn("Failed to create notification:", err);
  }
}
