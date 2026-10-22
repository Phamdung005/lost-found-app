import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { pool } from "../db.js";
import { authenticateToken, requireAdmin } from "../middleware/auth.js";
import type { AuthenticatedRequest } from "../middleware/auth.js";
import { logAudit } from "../utils/audit.js";
import { createNotification } from "../utils/notifications.js";

const router = Router();

// Middleware xác thực ESP32 Device bằng token
async function authenticateDevice(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token =
    (req.headers["x-device-token"] as string) ||
    (req.headers["authorization"]?.startsWith("Bearer ")
      ? req.headers["authorization"].split(" ")[1]
      : null);

  if (!token) {
    res.status(401).json({ success: false, message: "Yêu cầu X-Device-Token của thiết bị" });
    return;
  }

  try {
    const result = await pool.query(
      "SELECT id, locker_code, is_simulation_mode FROM lockers WHERE device_token = $1",
      [token]
    );

    if (result.rows.length === 0) {
      res.status(403).json({ success: false, message: "Token thiết bị không hợp lệ" });
      return;
    }

    (req as any).device = result.rows[0];
    next();
  } catch (error) {
    console.error("Device auth error:", error);
    res.status(500).json({ success: false, message: "Lỗi xác thực thiết bị" });
  }
}

// 1. ESP32 Gửi Heartbeat định kỳ (Mỗi 5-10 giây)
router.post("/heartbeat", authenticateDevice, async (req: Request, res: Response): Promise<void> => {
  try {
    const lockerId = (req as any).device.id;
    const { wifi_rssi, firmware_version, slots } = req.body;
    const ip = req.ip || req.socket.remoteAddress || null;

    // Cập nhật trạng thái tủ
    await pool.query(
      `UPDATE lockers 
       SET last_heartbeat = now(), 
           ip_address = $1, 
           wifi_rssi = $2, 
           firmware_version = COALESCE($3, firmware_version),
           status = 'online'
       WHERE id = $4`,
      [ip, wifi_rssi || null, firmware_version || null, lockerId]
    );

    // Cập nhật cảm biến cửa từ các ngăn nếu có gửi lên
    if (Array.isArray(slots)) {
      for (const s of slots) {
        if (s.slot_code && s.door_status) {
          await pool.query(
            `UPDATE locker_slots 
             SET door_status = $1, device_status = 'online', updated_at = now() 
             WHERE locker_id = $2 AND slot_code = $3`,
            [s.door_status, lockerId, s.slot_code]
          );
        }
      }
    }

    res.json({
      success: true,
      message: "Heartbeat acknowledged",
      server_time: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Device heartbeat error:", error);
    res.status(500).json({ success: false, message: "Heartbeat failed" });
  }
});

// 2. ESP32 Polling lấy lệnh tiếp theo (Pending)
router.get("/commands/next", authenticateDevice, async (req: Request, res: Response): Promise<void> => {
  const client = await pool.connect();
  try {
    const lockerId = (req as any).device.id;

    await client.query("BEGIN");

    // Tìm lệnh pending chưa hết hạn, sắp xếp theo thời gian cũ nhất trước
    const cmdResult = await client.query(
      `SELECT c.id, c.command_type, c.parameters, c.slot_id, s.slot_code
       FROM locker_commands c
       LEFT JOIN locker_slots s ON c.slot_id = s.id
       WHERE c.locker_id = $1 
         AND c.status = 'pending' 
         AND (c.expires_at IS NULL OR c.expires_at > now())
       ORDER BY c.created_at ASC
       LIMIT 1
       FOR UPDATE OF c`,
      [lockerId]
    );

    if (cmdResult.rows.length === 0) {
      await client.query("COMMIT");
      res.json({
        success: true,
        has_command: false,
      });
      return;
    }

    const command = cmdResult.rows[0];

    // Chuyển trạng thái sang executing để ESP32 xử lý, tránh gửi trùng lặp
    await client.query(
      "UPDATE locker_commands SET status = 'executing', updated_at = now() WHERE id = $1",
      [command.id]
    );

    await client.query("COMMIT");

    // Xác định GPIO dựa vào slot_code (A01 -> GPIO 18, A02 -> GPIO 19)
    const gpioPin = command.slot_code === "A01" ? 18 : command.slot_code === "A02" ? 19 : 18;

    res.json({
      success: true,
      has_command: true,
      command: {
        id: command.id,
        command_type: command.command_type,
        slot_code: command.slot_code,
        gpio: gpioPin,
        parameters: command.parameters || {},
      },
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Device get next command error:", error);
    res.status(500).json({ success: false, message: "Lỗi khi lấy lệnh cho thiết bị" });
  } finally {
    client.release();
  }
});

// 3. ESP32 Gửi xác nhận (ACK) kết quả thực thi lệnh
router.post("/commands/:id/ack", authenticateDevice, async (req: Request, res: Response): Promise<void> => {
  const client = await pool.connect();
  try {
    const lockerId = (req as any).device.id;
    const commandId = Number(req.params.id);
    const { status, result_message, door_status } = req.body; // status: 'success' | 'failed'

    await client.query("BEGIN");

    const cmdCheck = await client.query(
      `SELECT c.id, c.slot_id, s.slot_code, c.command_type
       FROM locker_commands c
       LEFT JOIN locker_slots s ON c.slot_id = s.id
       WHERE c.id = $1 AND c.locker_id = $2
       FOR UPDATE OF c`,
      [commandId, lockerId]
    );

    if (cmdCheck.rows.length === 0) {
      await client.query("ROLLBACK");
      res.status(404).json({ success: false, message: "Không tìm thấy lệnh tương ứng" });
      return;
    }

    const command = cmdCheck.rows[0];
    const isSuccess = status === "success";

    // Cập nhật trạng thái lệnh
    await client.query(
      `UPDATE locker_commands 
       SET status = $1, result_message = $2, executed_at = now(), updated_at = now()
       WHERE id = $3`,
      [isSuccess ? "success" : "failed", result_message || (isSuccess ? "Thiết bị thực thi thành công" : "Thực thi thất bại"), commandId]
    );

    // Cập nhật door_status cho ngăn tủ nếu mở thành công
    if (command.slot_id) {
      const finalDoorStatus = door_status || (isSuccess ? "open" : "closed");
      await client.query(
        `UPDATE locker_slots 
         SET door_status = $1, device_status = 'online', updated_at = now() 
         WHERE id = $2`,
        [finalDoorStatus, command.slot_id]
      );

      // Ghi nhật ký access_logs (an toàn)
      try {
        await client.query(
          `INSERT INTO access_logs (slot_id, action, actor, success, reason)
           VALUES ($1, $2, 'ESP32_SERVO', $3, $4)`,
          [
            command.slot_id,
            command.command_type,
            isSuccess,
            result_message || (isSuccess ? "Mở khóa thành công bằng servo" : "Lỗi servo"),
          ]
        );
      } catch (logErr) {
        console.warn("Could not insert access_log:", logErr);
      }
    }

    await client.query("COMMIT");

    res.json({
      success: true,
      message: "Lệnh đã được cập nhật thành công từ thiết bị",
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Device ack command error:", error);
    res.status(500).json({ success: false, message: "Lỗi ghi nhận ACK từ thiết bị" });
  } finally {
    client.release();
  }
});

// ==========================================
// CÁC ENDPOINT DÀNH CHO DASHBOARD ADMIN
// ==========================================

// 4. Admin lấy trạng thái thời gian thực của thiết bị & ngăn tủ
router.get("/status", async (_req: Request, res: Response): Promise<void> => {
  try {
    const lockerRes = await pool.query(`
      SELECT 
        id, locker_code, location, status, last_heartbeat, 
        ip_address, firmware_version, wifi_rssi, is_simulation_mode,
        CASE 
          WHEN last_heartbeat IS NOT NULL AND last_heartbeat > (now() - INTERVAL '60 seconds') THEN true
          ELSE false
        END AS is_online
      FROM lockers
      WHERE locker_code = 'L-001'
    `);

    if (lockerRes.rows.length === 0) {
      res.status(404).json({ success: false, message: "Không tìm thấy tủ L-001" });
      return;
    }

    const locker = lockerRes.rows[0];

    const slotsRes = await pool.query(`
      SELECT 
        id, slot_code, 
        COALESCE(occupancy_status, status, 'empty') as occupancy_status,
        COALESCE(door_status, 'closed') as door_status,
        COALESCE(device_status, 'online') as device_status,
        updated_at
      FROM locker_slots
      WHERE locker_id = $1
      ORDER BY slot_code
    `, [locker.id]);

    res.json({
      success: true,
      data: {
        locker,
        is_online: Boolean(locker.is_online),
        last_heartbeat: locker.last_heartbeat,
        last_seen_at: locker.last_heartbeat,
        ip_address: locker.ip_address,
        wifi_rssi: locker.wifi_rssi,
        slots: slotsRes.rows,
        hardware_info: {
          microcontroller: "ESP32",
          slot_a01: { gpio: 18, type: "Servo SG90 + Door Sensor" },
          slot_a02: { gpio: 19, type: "Servo SG90 + Door Sensor" },
        },
      },
    });
  } catch (error) {
    console.error("Get device status error:", error);
    res.status(500).json({ success: false, message: "Không thể lấy trạng thái thiết bị" });
  }
});

// 5. Admin gửi lệnh mở ngăn từ Dashboard
router.post("/commands", authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const adminId = req.user?.id;
    const { slot_code, command_type, duration_ms, release_item } = req.body;

    if (!slot_code || !["A01", "A02"].includes(slot_code)) {
      res.status(400).json({ success: false, message: "Mã ngăn phải là A01 hoặc A02" });
      return;
    }

    // Lấy thông tin tủ L-001 và slot
    const slotRes = await pool.query(`
      SELECT s.id, s.locker_id, l.locker_code, l.is_simulation_mode,
             CASE WHEN l.last_heartbeat > (now() - INTERVAL '35 seconds') THEN true ELSE false END as is_online
      FROM locker_slots s
      JOIN lockers l ON s.locker_id = l.id
      WHERE l.locker_code = 'L-001' AND s.slot_code = $1
    `, [slot_code]);

    if (slotRes.rows.length === 0) {
      res.status(404).json({ success: false, message: "Không tìm thấy ngăn tủ" });
      return;
    }

    const slot = slotRes.rows[0];

    // Tạo lệnh trong hàng đợi
    const cmdRes = await pool.query(`
      INSERT INTO locker_commands 
      (locker_id, slot_id, command_type, status, parameters, created_by, is_simulation)
      VALUES ($1, $2, $3, 'pending', $4, $5, $6)
      RETURNING id, locker_id, slot_id, command_type, status, created_at, expires_at
    `, [
      slot.locker_id,
      slot.id,
      command_type || "OPEN_SLOT",
      JSON.stringify({ 
        duration_ms: duration_ms || 5000, 
        gpio: slot_code === "A01" ? 18 : 19,
        release_item: !!release_item
      }),
      adminId,
      slot.is_simulation_mode,
    ]);

    // Nếu Admin chọn "Mở ngăn & Lấy đồ ra" -> Cập nhật đồ đã trả và giải phóng ngăn tủ về Trống
    if (release_item === true) {
      // 1. Cập nhật đồ vật trong ngăn sang 'returned'
      await pool.query(
        `UPDATE found_items 
         SET status = 'returned', updated_at = now() 
         WHERE (slot_id = $1 OR locker_slot_id = $1) AND status IN ('in_locker', 'stored', 'reported')`,
        [slot.id]
      );

      // 2. Cập nhật các yêu cầu nhận đồ (nếu có)
      await pool.query(
        `UPDATE found_item_claims 
         SET status = 'claimed', claimed_at = now(), updated_at = now() 
         WHERE found_item_id IN (
           SELECT id FROM found_items WHERE (slot_id = $1 OR locker_slot_id = $1)
         ) AND status IN ('pending', 'approved')`,
        [slot.id]
      );

      // 3. Giải phóng ngăn tủ về trống
      await pool.query(
        `UPDATE locker_slots 
         SET occupancy_status = 'empty', status = 'empty', updated_at = now() 
         WHERE id = $1`,
        [slot.id]
      );
    }

    await logAudit(adminId!, "ADMIN_COMMAND_ISSUED", {
      command_id: cmdRes.rows[0].id,
      slot_code,
      command_type: command_type || "OPEN_SLOT",
      release_item: !!release_item,
    });

    await createNotification({
      role: "admin",
      title: release_item ? `⚡ Lệnh mở ngăn ${slot_code} & Lấy đồ ra` : `🔓 Lệnh mở ngăn ${slot_code} kiểm tra`,
      message: release_item
        ? `Admin đã mở ngăn ${slot_code} và đánh dấu đồ vật đã trao trả. Ngăn tủ đã về Trống.`
        : `Admin đã gửi lệnh mở ngăn ${slot_code} vào hàng đợi ESP32 để kiểm tra kỹ thuật.`,
      type: release_item ? "warning" : "info",
    });

    let successMsg = `Đã gửi lệnh mở ngăn ${slot_code} vào hàng đợi ESP32`;
    if (release_item) {
      successMsg = `Đã mở ngăn ${slot_code} và đánh dấu đồ vật đã trao trả (ngăn tủ trở về Trống)`;
    }

    res.status(201).json({
      success: true,
      message: successMsg,
      data: {
        command: cmdRes.rows[0],
        is_online: slot.is_online,
      },
    });
  } catch (error) {
    console.error("Issue command error:", error);
    res.status(500).json({ success: false, message: "Không thể tạo lệnh mở ngăn" });
  }
});

// 6. Admin lấy danh sách lịch sử lệnh điều khiển
router.get("/commands", authenticateToken, requireAdmin, async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const result = await pool.query(`
      SELECT 
        c.id, c.command_type, c.status, c.parameters, c.result_message,
        c.is_simulation, c.created_at, c.executed_at,
        s.slot_code, l.locker_code,
        u.full_name as creator_name
      FROM locker_commands c
      LEFT JOIN locker_slots s ON c.slot_id = s.id
      JOIN lockers l ON c.locker_id = l.id
      LEFT JOIN users u ON c.created_by = u.id
      ORDER BY c.id DESC
      LIMIT 30
    `);

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error("Get commands history error:", error);
    res.status(500).json({ success: false, message: "Không thể lấy lịch sử lệnh" });
  }
});

// 7. Bật / Tắt Chế độ Mô phỏng (Simulation Mode)
router.post("/simulation-mode", authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { enabled } = req.body;
    await pool.query(
      "UPDATE lockers SET is_simulation_mode = $1 WHERE locker_code = 'L-001'",
      [!!enabled]
    );

    res.json({
      success: true,
      message: enabled
        ? "Đã bật Chế độ Mô phỏng (Dùng để demo khi chưa cắm ESP32)"
        : "Đã chuyển sang Chế độ Thiết bị Thật (Yêu cầu kết nối ESP32)",
      is_simulation_mode: !!enabled,
    });
  } catch (error) {
    console.error("Toggle simulation mode error:", error);
    res.status(500).json({ success: false, message: "Không thể chuyển chế độ mô phỏng" });
  }
});

// 8. Mô phỏng thực thi lệnh (Dùng cho Demo khi bật chế độ mô phỏng)
router.post("/simulate-execute/:id", authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const client = await pool.connect();
  try {
    const commandId = Number(req.params.id);

    await client.query("BEGIN");

    const cmdCheck = await client.query(
      `SELECT c.id, c.slot_id, s.slot_code, c.command_type
       FROM locker_commands c
       LEFT JOIN locker_slots s ON c.slot_id = s.id
       WHERE c.id = $1
       FOR UPDATE OF c`,
      [commandId]
    );

    if (cmdCheck.rows.length === 0) {
      await client.query("ROLLBACK");
      res.status(404).json({ success: false, message: "Lệnh không tồn tại" });
      return;
    }

    const command = cmdCheck.rows[0];

    // Cập nhật trạng thái lệnh thành công (mô phỏng)
    await client.query(`
      UPDATE locker_commands
      SET status = 'success',
          result_message = '[MÔ PHỎNG] Đã mô phỏng mở servo thành công',
          is_simulation = true,
          executed_at = now(),
          updated_at = now()
      WHERE id = $1
    `, [commandId]);

    if (command.slot_id) {
      await client.query(`
        UPDATE locker_slots
        SET door_status = 'open', updated_at = now()
        WHERE id = $1
      `, [command.slot_id]);

      await client.query(`
        INSERT INTO access_logs (slot_id, action, actor, success, reason)
        VALUES ($1, $2, 'SIMULATION_TESTER', true, '[MÔ PHỎNG] Mô phỏng mở ngăn tủ thành công')
      `, [command.slot_id, command.command_type]);
    }

    await client.query("COMMIT");

    res.json({
      success: true,
      message: `[MÔ PHỎNG] Lệnh #${commandId} (Ngăn ${command.slot_code}) đã được mô phỏng mở thành công!`,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Simulate command error:", error);
    res.status(500).json({ success: false, message: "Lỗi mô phỏng lệnh" });
  } finally {
    client.release();
  }
});

// 6. ESP32 Gửi mã OTP nhập từ bàn phím Keypad để mở tủ nhận đồ
router.post("/verify-otp", authenticateDevice, async (req: Request, res: Response): Promise<void> => {
  const client = await pool.connect();
  try {
    const { otp, claim_code } = req.body;
    const inputCode = (otp || claim_code || "").toString().trim();

    if (!inputCode) {
      res.status(400).json({ success: false, message: "Vui lòng cung cấp mã OTP" });
      return;
    }

    await client.query("BEGIN");

    // Tìm claim đang approved và khớp mã OTP
    const claimRes = await client.query(
      `SELECT c.id, c.found_item_id, c.user_id, c.status, c.claim_code, c.code_expires_at,
              f.item_name, f.locker_slot_id, s.slot_code, l.locker_code
       FROM found_item_claims c
       JOIN found_items f ON c.found_item_id = f.id
       LEFT JOIN locker_slots s ON f.locker_slot_id = s.id
       LEFT JOIN lockers l ON s.locker_id = l.id
       WHERE (c.claim_code = $1 OR c.claim_code_hash = $1)
         AND c.status = 'approved'
       FOR UPDATE OF c`,
      [inputCode]
    );

    if (claimRes.rows.length === 0) {
      await client.query("ROLLBACK");
      res.status(404).json({
        success: false,
        message: "Mã OTP không đúng hoặc chưa được phê duyệt",
      });
      return;
    }

    const claim = claimRes.rows[0];

    // Kiểm tra hạn OTP nếu có
    if (claim.code_expires_at && new Date() > new Date(claim.code_expires_at)) {
      await client.query("ROLLBACK");
      res.status(400).json({
        success: false,
        message: "Mã OTP đã hết hạn sử dụng",
      });
      return;
    }

    const slotCode = claim.slot_code || "A01";
    const { slot_code: reqSlotCode } = req.body;
    if (reqSlotCode && reqSlotCode.toString().trim().toUpperCase() !== slotCode.toUpperCase()) {
      await client.query("ROLLBACK");
      res.status(400).json({
        success: false,
        message: `OTP nay thuoc ngan ${slotCode}, khong phai ngan ${reqSlotCode}`,
      });
      return;
    }
    const slotId = claim.locker_slot_id;

    // Đánh dấu yêu cầu đã hoàn tất
    await client.query(
      `UPDATE found_item_claims 
       SET status = 'claimed', claimed_at = now(), updated_at = now()
       WHERE id = $1`,
      [claim.id]
    );

    // Cập nhật món đồ thành đã trao trả
    await client.query(
      `UPDATE found_items
       SET status = 'returned', updated_at = now()
       WHERE id = $1`,
      [claim.found_item_id]
    );

    // Cập nhật ngăn tủ về trạng thái trống
    if (slotId) {
      await client.query(
        `UPDATE locker_slots
         SET occupancy_status = 'empty', status = 'empty', door_status = 'open', updated_at = now()
         WHERE id = $1`,
        [slotId]
      );
    }

    await client.query("COMMIT");

    // Thông báo cho User
    if (claim.user_id) {
      await createNotification({
        userId: claim.user_id,
        title: "🎁 Mở tủ tại Keypad thành công",
        message: `Mã OTP [${inputCode}] đã được nhập tại bàn phím tủ. Ngăn ${slotCode} đã mở để bạn lấy lại "${claim.item_name}".`,
        type: "success",
      });
    }

    // Thông báo cho Admin
    await createNotification({
      role: "admin",
      title: `🔑 Mở tủ bằng Keypad thành công (${slotCode})`,
      message: `Người dùng vừa nhập OTP [${inputCode}] tại bàn phím phần cứng. Ngăn ${slotCode} đã mở và trao trả món đồ "${claim.item_name}".`,
      type: "locker",
    });

    res.json({
      success: true,
      message: `Xác thực thành công! Mở ngăn ${slotCode}`,
      data: {
        slot_code: slotCode,
        item_name: claim.item_name,
      },
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Device verify OTP error:", error);
    res.status(500).json({ success: false, message: "Lỗi hệ thống khi kiểm tra OTP" });
  } finally {
    client.release();
  }
});

export default router;
