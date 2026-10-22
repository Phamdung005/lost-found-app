import { pool } from "../db.js";

export async function runDeviceMigration() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Cập nhật bảng lockers để lưu thông tin kết nối ESP32
    await client.query(`
      ALTER TABLE lockers
      ADD COLUMN IF NOT EXISTS device_token VARCHAR(255) DEFAULT 'esp32_smart_locker_secret_token_2026',
      ADD COLUMN IF NOT EXISTS last_heartbeat TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS ip_address VARCHAR(50),
      ADD COLUMN IF NOT EXISTS firmware_version VARCHAR(50) DEFAULT 'v1.0.0',
      ADD COLUMN IF NOT EXISTS wifi_rssi INT,
      ADD COLUMN IF NOT EXISTS is_simulation_mode BOOLEAN DEFAULT false;
    `);

    // Gán token mặc định cho tủ L-001 nếu chưa có
    await client.query(`
      UPDATE lockers 
      SET device_token = 'esp32_smart_locker_secret_token_2026' 
      WHERE locker_code = 'L-001' AND (device_token IS NULL OR device_token = '');
    `);

    // 2. Tạo bảng locker_commands (Hàng đợi lệnh điều khiển thiết bị)
    await client.query(`
      CREATE TABLE IF NOT EXISTS locker_commands (
        id SERIAL PRIMARY KEY,
        locker_id INT NOT NULL REFERENCES lockers(id) ON DELETE CASCADE,
        slot_id INT REFERENCES locker_slots(id) ON DELETE SET NULL,
        command_type VARCHAR(50) NOT NULL,
        status VARCHAR(30) NOT NULL DEFAULT 'pending',
        parameters JSONB DEFAULT '{}',
        result_message TEXT,
        is_simulation BOOLEAN DEFAULT false,
        created_by INT REFERENCES users(id) ON DELETE SET NULL,
        expires_at TIMESTAMPTZ DEFAULT (now() + INTERVAL '5 minutes'),
        executed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    // 3. Tạo index cho việc polling lệnh nhanh từ ESP32
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_commands_locker_status ON locker_commands(locker_id, status);
      CREATE INDEX IF NOT EXISTS idx_commands_status_created ON locker_commands(status, created_at ASC);
    `);

    await client.query("COMMIT");
    console.log("Device & Commands migration completed successfully.");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Device migration failed:", err);
    throw err;
  } finally {
    client.release();
  }
}
