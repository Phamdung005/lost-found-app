import { pool } from "../db.js";

export async function runBusinessMigration() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Cập nhật an toàn bảng locker_slots
    await client.query(`
      ALTER TABLE locker_slots 
      ADD COLUMN IF NOT EXISTS occupancy_status VARCHAR(20) DEFAULT 'empty',
      ADD COLUMN IF NOT EXISTS door_status VARCHAR(20) DEFAULT 'closed',
      ADD COLUMN IF NOT EXISTS device_status VARCHAR(20) DEFAULT 'online',
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
    `);

    // Đồng bộ trạng thái status cũ sang occupancy_status nếu chưa set
    await client.query(`
      UPDATE locker_slots 
      SET occupancy_status = CASE 
        WHEN status ILIKE '%empty%' THEN 'empty'
        WHEN status ILIKE '%occupied%' THEN 'occupied'
        ELSE status
      END
      WHERE occupancy_status IS NULL OR occupancy_status = 'empty';
    `);

    // 2. Cập nhật an toàn bảng found_items
    await client.query(`
      ALTER TABLE found_items 
      ADD COLUMN IF NOT EXISTS category VARCHAR(50) DEFAULT 'other',
      ADD COLUMN IF NOT EXISTS image_url TEXT,
      ADD COLUMN IF NOT EXISTS finder_contact VARCHAR(100),
      ADD COLUMN IF NOT EXISTS tracking_code VARCHAR(50),
      ADD COLUMN IF NOT EXISTS created_by INT REFERENCES users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now(),
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
    `);

    // 3. Cập nhật an toàn bảng lost_reports
    await client.query(`
      ALTER TABLE lost_reports 
      ADD COLUMN IF NOT EXISTS category VARCHAR(50) DEFAULT 'other',
      ADD COLUMN IF NOT EXISTS user_id INT REFERENCES users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS image_url TEXT,
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
    `);

    // 4. Tạo bảng found_item_claims (Yêu cầu nhận lại đồ và mã OTP 1 lần)
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

    // 5. Tạo indexes
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
    console.log("Business schema migration completed successfully.");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Business migration failed:", err);
    throw err;
  } finally {
    client.release();
  }
}
