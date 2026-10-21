import { Router } from "express";
import type { Response } from "express";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { pool } from "../db.js";
import { authenticateToken, requireAdmin } from "../middleware/auth.js";
import type { AuthenticatedRequest } from "../middleware/auth.js";
import { logAudit } from "../utils/audit.js";

const router = Router();

// Hàm tạo mã OTP 6 chữ số an toàn
function generateClaimCode(): string {
  return crypto.randomInt(100000, 999999).toString();
}

// 1. Người dùng gửi yêu cầu nhận lại đồ (Luồng C)
router.post("/", authenticateToken, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { found_item_id, proof_description, proof_contact } = req.body;

    if (!found_item_id || isNaN(Number(found_item_id))) {
      res.status(400).json({ success: false, message: "ID món đồ không hợp lệ" });
      return;
    }

    if (!proof_description || typeof proof_description !== "string" || !proof_description.trim()) {
      res.status(400).json({
        success: false,
        message: "Vui lòng cung cấp mô tả đặc điểm nhận dạng hoặc bằng chứng sở hữu",
      });
      return;
    }

    // Kiểm tra món đồ có tồn tại và còn trong trạng thái chưa trao trả không
    const itemCheck = await pool.query(
      "SELECT id, item_name, status, slot_id FROM found_items WHERE id = $1",
      [Number(found_item_id)]
    );

    if (itemCheck.rows.length === 0) {
      res.status(404).json({ success: false, message: "Không tìm thấy món đồ thất lạc" });
      return;
    }

    const item = itemCheck.rows[0];
    if (item.status === "returned") {
      res.status(400).json({
        success: false,
        message: "Món đồ này đã được trao trả cho chủ nhân trước đó",
      });
      return;
    }

    // Kiểm tra xem người này đã gửi yêu cầu cho món đồ này đang pending không
    const existingClaim = await pool.query(
      "SELECT id FROM found_item_claims WHERE found_item_id = $1 AND user_id = $2 AND status IN ('pending', 'approved')",
      [Number(found_item_id), userId]
    );

    if (existingClaim.rows.length > 0) {
      res.status(400).json({
        success: false,
        message: "Bạn đã gửi yêu cầu nhận lại món đồ này và đang được xử lý",
      });
      return;
    }

    const result = await pool.query(
      `INSERT INTO found_item_claims (found_item_id, user_id, proof_description, proof_contact, status)
       VALUES ($1, $2, $3, $4, 'pending')
       RETURNING id, found_item_id, user_id, proof_description, proof_contact, status, created_at`,
      [Number(found_item_id), userId, proof_description.trim(), proof_contact || null]
    );

    await logAudit(userId!, "CLAIM_REQUESTED", {
      claim_id: result.rows[0].id,
      found_item_id: Number(found_item_id),
    });

    res.status(201).json({
      success: true,
      message: "Đã gửi yêu cầu nhận đồ thành công. Quản trị viên sẽ sớm đối chiếu và xác minh.",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Create claim error:", error);
    res.status(500).json({ success: false, message: "Lỗi hệ thống khi gửi yêu cầu nhận đồ" });
  }
});

// 2. Lấy danh sách yêu cầu nhận đồ của người dùng hiện tại
router.get("/my", authenticateToken, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const result = await pool.query(
      `SELECT 
         c.id,
         c.found_item_id,
         c.proof_description,
         c.proof_contact,
         c.status,
         c.claim_code,
         c.code_expires_at,
         c.rejection_reason,
         c.claimed_at,
         c.created_at,
         f.item_name,
         f.category,
         f.found_location,
         f.image_url,
         s.slot_code,
         l.locker_code
       FROM found_item_claims c
       JOIN found_items f ON c.found_item_id = f.id
       LEFT JOIN locker_slots s ON f.slot_id = s.id
       LEFT JOIN lockers l ON s.locker_id = l.id
       WHERE c.user_id = $1
       ORDER BY c.id DESC`,
      [userId]
    );

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error("Get my claims error:", error);
    res.status(500).json({ success: false, message: "Không thể lấy danh sách yêu cầu của bạn" });
  }
});

// 3. Admin lấy toàn bộ danh sách yêu cầu nhận đồ
router.get("/", authenticateToken, requireAdmin, async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const result = await pool.query(
      `SELECT 
         c.id,
         c.found_item_id,
         c.user_id,
         c.proof_description,
         c.proof_contact,
         c.status,
         c.claim_code,
         c.code_expires_at,
         c.rejection_reason,
         c.claimed_at,
         c.created_at,
         u.full_name as user_name,
         u.email as user_email,
         u.phone as user_phone,
         f.item_name,
         f.category,
         f.found_location,
         f.description as item_secret_description,
         f.image_url,
         s.slot_code,
         l.locker_code
       FROM found_item_claims c
       JOIN users u ON c.user_id = u.id
       JOIN found_items f ON c.found_item_id = f.id
       LEFT JOIN locker_slots s ON f.slot_id = s.id
       LEFT JOIN lockers l ON s.locker_id = l.id
       ORDER BY c.id DESC`
    );

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error("Get all claims error:", error);
    res.status(500).json({ success: false, message: "Không thể lấy danh sách yêu cầu nhận đồ" });
  }
});

// 4. Admin duyệt hoặc từ chối yêu cầu (Luồng xác minh & cấp mã OTP 1 lần)
router.post("/:id/verify", authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const adminId = req.user?.id;
    const claimId = Number(req.params.id);
    const { action, rejection_reason } = req.body; // action: 'approve' | 'reject'

    if (!["approve", "reject"].includes(action)) {
      res.status(400).json({ success: false, message: "Hành động xác minh không hợp lệ" });
      return;
    }

    const claimCheck = await pool.query(
      "SELECT id, found_item_id, user_id, status FROM found_item_claims WHERE id = $1",
      [claimId]
    );

    if (claimCheck.rows.length === 0) {
      res.status(404).json({ success: false, message: "Yêu cầu không tồn tại" });
      return;
    }

    const claim = claimCheck.rows[0];
    if (claim.status !== "pending") {
      res.status(400).json({
        success: false,
        message: `Yêu cầu này đã được xử lý trước đó với trạng thái: ${claim.status}`,
      });
      return;
    }

    if (action === "reject") {
      await pool.query(
        `UPDATE found_item_claims 
         SET status = 'rejected', rejection_reason = $1, verified_by = $2, updated_at = now()
         WHERE id = $3`,
        [rejection_reason || "Thông tin đối chiếu không trùng khớp", adminId, claimId]
      );

      await logAudit(adminId!, "CLAIM_REJECTED", { claim_id: claimId, reason: rejection_reason });

      res.json({
        success: true,
        message: "Đã từ chối yêu cầu nhận đồ",
      });
      return;
    }

    // Nếu Action là 'approve': Sinh mã OTP 1 lần có hiệu lực trong 30 phút
    const otpCode = generateClaimCode();
    const otpHash = await bcrypt.hash(otpCode, 8);
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 phút

    await pool.query(
      `UPDATE found_item_claims 
       SET status = 'approved', 
           claim_code = $1, 
           claim_code_hash = $2, 
           code_expires_at = $3, 
           verified_by = $4, 
           updated_at = now()
       WHERE id = $5`,
      [otpCode, otpHash, expiresAt, adminId, claimId]
    );

    await logAudit(adminId!, "CLAIM_APPROVED", {
      claim_id: claimId,
      expires_at: expiresAt,
    });

    res.json({
      success: true,
      message: "Đã phê duyệt yêu cầu và cấp mã nhận đồ 1 lần (hiệu lực 30 phút)",
      data: {
        claim_id: claimId,
        claim_code: otpCode,
        expires_at: expiresAt,
      },
    });
  } catch (error) {
    console.error("Verify claim error:", error);
    res.status(500).json({ success: false, message: "Lỗi hệ thống khi xác minh yêu cầu" });
  }
});

// 5. Xác minh mã OTP mở tủ lấy đồ (Luồng hoàn tất nhận đồ)
router.post("/redeem", authenticateToken, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const client = await pool.connect();
  try {
    const userId = req.user?.id;
    const { claim_id, claim_code } = req.body;

    if (!claim_id || !claim_code) {
      res.status(400).json({ success: false, message: "Mã nhận đồ và ID yêu cầu là bắt buộc" });
      return;
    }

    await client.query("BEGIN");

    const claimRes = await client.query(
      `SELECT c.id, c.user_id, c.found_item_id, c.status, c.claim_code, c.code_expires_at,
              f.item_name, f.slot_id, s.slot_code, s.locker_id, l.locker_code
       FROM found_item_claims c
       JOIN found_items f ON c.found_item_id = f.id
       LEFT JOIN locker_slots s ON f.slot_id = s.id
       LEFT JOIN lockers l ON s.locker_id = l.id
       WHERE c.id = $1 FOR UPDATE OF c`,
      [Number(claim_id)]
    );

    if (claimRes.rows.length === 0) {
      await client.query("ROLLBACK");
      res.status(404).json({ success: false, message: "Không tìm thấy yêu cầu nhận đồ" });
      return;
    }

    const claim = claimRes.rows[0];

    // Kiểm tra quyền sở hữu yêu cầu (hoặc admin có thể hỗ trợ mở)
    if (claim.user_id !== userId && req.user?.role !== "admin") {
      await client.query("ROLLBACK");
      res.status(403).json({ success: false, message: "Bạn không có quyền sử dụng mã nhận đồ này" });
      return;
    }

    if (claim.status !== "approved") {
      await client.query("ROLLBACK");
      res.status(400).json({
        success: false,
        message: `Yêu cầu không ở trạng thái sẵn sàng nhận đồ (Trạng thái hiện tại: ${claim.status})`,
      });
      return;
    }

    // Kiểm tra hạn sử dụng
    if (new Date() > new Date(claim.code_expires_at)) {
      await client.query(
        "UPDATE found_item_claims SET status = 'expired', updated_at = now() WHERE id = $1",
        [claim.id]
      );
      await client.query("COMMIT");
      res.status(400).json({
        success: false,
        message: "Mã nhận đồ đã hết hiệu lực (quá 30 phút). Vui lòng liên hệ Admin để cấp lại.",
      });
      return;
    }

    // Kiểm tra mã OTP khớp
    if (String(claim.claim_code).trim() !== String(claim_code).trim()) {
      await client.query("ROLLBACK");
      res.status(400).json({ success: false, message: "Mã nhận đồ không chính xác" });
      return;
    }

    // Nếu hợp lệ: Cập nhật hoàn tất trao trả
    const now = new Date();
    await client.query(
      `UPDATE found_item_claims 
       SET status = 'completed', claimed_at = $1, claim_code = NULL, updated_at = $1
       WHERE id = $2`,
      [now, claim.id]
    );

    // Cập nhật trạng thái đồ vật: returned
    await client.query(
      "UPDATE found_items SET status = 'returned', updated_at = $1 WHERE id = $2",
      [now, claim.found_item_id]
    );

    // Giải phóng ngăn tủ (nếu đồ có lưu trong ngăn)
    if (claim.slot_id) {
      await client.query(
        `UPDATE locker_slots 
         SET occupancy_status = 'empty', status = 'empty', updated_at = $1 
         WHERE id = $2`,
        [now, claim.slot_id]
      );

      // Ghi access_logs
      await client.query(
        `INSERT INTO access_logs (slot_id, action, actor, success, reason)
         VALUES ($1, 'RETRIEVE_ITEM', $2, true, 'Người dùng đã dùng mã OTP nhận đồ thành công')`,
        [claim.slot_id, req.user?.email || "User"]
      );
    }

    await client.query("COMMIT");

    await logAudit(userId!, "ITEM_RETRIEVED_SUCCESS", {
      claim_id: claim.id,
      item_name: claim.item_name,
      slot_code: claim.slot_code,
    });

    res.json({
      success: true,
      message: `Xác nhận mã nhận đồ thành công! Ngăn ${claim.slot_code || "lưu trữ"} đã được mở để quý khách nhận đồ.`,
      data: {
        slot_code: claim.slot_code,
        locker_code: claim.locker_code,
        item_name: claim.item_name,
      },
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Redeem claim error:", error);
    res.status(500).json({ success: false, message: "Lỗi hệ thống khi xác nhận mã nhận đồ" });
  } finally {
    client.release();
  }
});

export default router;
