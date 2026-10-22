import { pool } from "../db.js";

export async function runBusinessMigration() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Tạo bảng lockers nếu chưa tồn tại
    await client.query(`
      CREATE TABLE IF NOT EXISTS lockers (
        id SERIAL PRIMARY KEY,
        locker_code VARCHAR(50) NOT NULL UNIQUE,
        location VARCHAR(255) NOT NULL DEFAULT 'Khu vực Trung tâm',
        status VARCHAR(50) NOT NULL DEFAULT 'active',
        device_token VARCHAR(255) DEFAULT 'esp32_smart_locker_secret_token_2026',
        last_heartbeat TIMESTAMPTZ,
        ip_address VARCHAR(50),
        firmware_version VARCHAR(50) DEFAULT 'v1.0.0',
        wifi_rssi INT,
        is_simulation_mode BOOLEAN DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    // Tạo tủ mẫu L-001 nếu chưa có
    await client.query(`
      INSERT INTO lockers (locker_code, location, status, device_token)
      VALUES ('L-001', 'Khu vực Trung tâm', 'active', 'esp32_smart_locker_secret_token_2026')
      ON CONFLICT (locker_code) DO NOTHING;
    `);

    // 2. Tạo bảng locker_slots nếu chưa tồn tại
    await client.query(`
      CREATE TABLE IF NOT EXISTS locker_slots (
        id SERIAL PRIMARY KEY,
        locker_id INT NOT NULL REFERENCES lockers(id) ON DELETE CASCADE,
        slot_code VARCHAR(50) NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'empty',
        occupancy_status VARCHAR(20) DEFAULT 'empty',
        door_status VARCHAR(20) DEFAULT 'closed',
        device_status VARCHAR(20) DEFAULT 'online',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE(locker_id, slot_code)
      );
    `);

    // Cập nhật các cột an toàn cho locker_slots nếu đã tồn tại từ trước
    await client.query(`
      ALTER TABLE locker_slots 
      ADD COLUMN IF NOT EXISTS occupancy_status VARCHAR(20) DEFAULT 'empty',
      ADD COLUMN IF NOT EXISTS door_status VARCHAR(20) DEFAULT 'closed',
      ADD COLUMN IF NOT EXISTS device_status VARCHAR(20) DEFAULT 'online',
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
    `);

    // Khởi tạo 2 ngăn A01, A02 mẫu cho tủ L-001 nếu chưa có
    await client.query(`
      INSERT INTO locker_slots (locker_id, slot_code, status, occupancy_status, door_status, device_status)
      SELECT l.id, s.code, 'empty', 'empty', 'closed', 'online'
      FROM lockers l
      CROSS JOIN (VALUES ('A01'), ('A02')) AS s(code)
      WHERE l.locker_code = 'L-001'
      ON CONFLICT (locker_id, slot_code) DO NOTHING;
    `);

    // 3. Tạo bảng found_items
    await client.query(`
      CREATE TABLE IF NOT EXISTS found_items (
        id SERIAL PRIMARY KEY,
        item_name VARCHAR(255) NOT NULL,
        category VARCHAR(50) DEFAULT 'other',
        description TEXT,
        found_location VARCHAR(255) NOT NULL,
        found_at TIMESTAMPTZ DEFAULT now(),
        image_url TEXT,
        finder_contact VARCHAR(100),
        tracking_code VARCHAR(50) UNIQUE,
        status VARCHAR(50) NOT NULL DEFAULT 'reported',
        locker_slot_id INT REFERENCES locker_slots(id) ON DELETE SET NULL,
        created_by INT REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
      );
    `);

    // Đảm bảo cả slot_id và locker_slot_id đều tồn tại trên found_items
    await client.query(`
      ALTER TABLE found_items 
      ADD COLUMN IF NOT EXISTS slot_id INT REFERENCES locker_slots(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS locker_slot_id INT REFERENCES locker_slots(id) ON DELETE SET NULL;
      UPDATE found_items SET status = 'in_locker' WHERE status = 'stored';
    `);

    // 4. Tạo bảng lost_reports
    await client.query(`
      CREATE TABLE IF NOT EXISTS lost_reports (
        id SERIAL PRIMARY KEY,
        item_name VARCHAR(255) NOT NULL,
        category VARCHAR(50) DEFAULT 'other',
        description TEXT,
        lost_location VARCHAR(255) NOT NULL,
        lost_at TIMESTAMPTZ DEFAULT now(),
        reporter_contact VARCHAR(100),
        status VARCHAR(50) NOT NULL DEFAULT 'searching',
        user_id INT REFERENCES users(id) ON DELETE SET NULL,
        image_url TEXT,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
      );
    `);

    // 5. Tạo bảng found_item_claims
    await client.query(`
      CREATE TABLE IF NOT EXISTS found_item_claims (
        id SERIAL PRIMARY KEY,
        found_item_id INT NOT NULL REFERENCES found_items(id) ON DELETE CASCADE,
        user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        proof_description TEXT NOT NULL,
        proof_contact VARCHAR(100),
        status VARCHAR(30) NOT NULL DEFAULT 'pending',
        claim_code VARCHAR(20),
        claim_code_hash VARCHAR(255),
        code_expires_at TIMESTAMPTZ,
        verified_by INT REFERENCES users(id) ON DELETE SET NULL,
        rejection_reason TEXT,
        claimed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    // 6. Tạo bảng access_logs nếu chưa tồn tại
    await client.query(`
      CREATE TABLE IF NOT EXISTS access_logs (
        id SERIAL PRIMARY KEY,
        slot_id INT,
        action VARCHAR(50),
        actor VARCHAR(50),
        success BOOLEAN DEFAULT true,
        reason TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    // 7. Tạo indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_found_items_category ON found_items(category);
      CREATE INDEX IF NOT EXISTS idx_found_items_status ON found_items(status);
      CREATE INDEX IF NOT EXISTS idx_found_items_tracking ON found_items(tracking_code);
      CREATE INDEX IF NOT EXISTS idx_lost_reports_category ON lost_reports(category);
      CREATE INDEX IF NOT EXISTS idx_claims_status ON found_item_claims(status);
      CREATE INDEX IF NOT EXISTS idx_claims_user_id ON found_item_claims(user_id);
      CREATE INDEX IF NOT EXISTS idx_claims_item_id ON found_item_claims(found_item_id);
      CREATE INDEX IF NOT EXISTS idx_claims_claim_code ON found_item_claims(claim_code);
    `);

    await client.query("COMMIT");
    console.log("Business schema migration completed successfully (lockers, slots, items created).");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Business migration failed:", err);
    throw err;
  } finally {
    client.release();
  }
}
