import { pool } from "../db.js";

export async function logAudit(
  userId: number | null,
  action: string,
  details: Record<string, any> = {},
  ipAddress: string | null = null
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO audit_logs (user_id, action, details, ip_address)
       VALUES ($1, $2, $3, $4)`,
      [userId, action, JSON.stringify(details), ipAddress]
    );
  } catch (error) {
    console.error("Failed to write audit log:", error);
  }
}
