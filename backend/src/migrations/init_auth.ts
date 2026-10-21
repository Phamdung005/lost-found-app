import bcrypt from "bcryptjs";
import { pool } from "../db.js";

export async function runAuthMigration() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Tạo bảng users
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        full_name VARCHAR(150) NOT NULL,
        phone VARCHAR(50),
        role VARCHAR(20) NOT NULL DEFAULT 'user',
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    // 2. Tạo bảng audit_logs
    await client.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id SERIAL PRIMARY KEY,
        user_id INT REFERENCES users(id) ON DELETE SET NULL,
        action VARCHAR(100) NOT NULL,
        details JSONB,
        ip_address VARCHAR(100),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    // 3. Tạo index cho users và audit_logs nếu chưa có
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
    `);

    // 4. Seed tài khoản Admin nếu chưa có
    const adminCheck = await client.query("SELECT id FROM users WHERE email = $1", ["admin@findbox.vn"]);
    if (adminCheck.rows.length === 0) {
      const hashedAdminPassword = await bcrypt.hash("Admin@123456", 10);
      await client.query(`
        INSERT INTO users (email, password_hash, full_name, phone, role)
        VALUES ($1, $2, $3, $4, 'admin')
      `, ["admin@findbox.vn", hashedAdminPassword, "Quản trị viên FindBox", "0900000001"]);
      console.log("Seeded default admin account: admin@findbox.vn / Admin@123456");
    }

    // 5. Seed tài khoản User mẫu nếu chưa có
    const userCheck = await client.query("SELECT id FROM users WHERE email = $1", ["user@findbox.vn"]);
    if (userCheck.rows.length === 0) {
      const hashedUserPassword = await bcrypt.hash("User@123456", 10);
      await client.query(`
        INSERT INTO users (email, password_hash, full_name, phone, role)
        VALUES ($1, $2, $3, $4, 'user')
      `, ["user@findbox.vn", hashedUserPassword, "Nguyễn Văn A (Demo)", "0912345678"]);
      console.log("Seeded demo user account: user@findbox.vn / User@123456");
    }

    await client.query("COMMIT");
    console.log("Auth schema migration completed successfully.");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Auth migration failed:", err);
    throw err;
  } finally {
    client.release();
  }
}
