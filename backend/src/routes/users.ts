import { Router } from "express";
import type { Response } from "express";
import bcrypt from "bcryptjs";
import { pool } from "../db.js";
import { authenticateToken, requireAdmin } from "../middleware/auth.js";
import type { AuthenticatedRequest } from "../middleware/auth.js";
import { logAudit } from "../utils/audit.js";

const router = Router();

// Tất cả các route bên dưới đều yêu cầu quyền Quản trị viên (Admin)
router.use(authenticateToken, requireAdmin);

// 1. Lấy danh sách người dùng (kèm tìm kiếm, lọc theo vai trò & trạng thái)
router.get("/", async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { search, role, status } = req.query;

    const conditions: string[] = [];
    const params: (string | boolean)[] = [];

    if (typeof search === "string" && search.trim()) {
      params.push(`%${search.trim().toLowerCase()}%`);
      const idx = params.length;
      conditions.push(`(LOWER(u.email) LIKE $${idx} OR LOWER(u.full_name) LIKE $${idx} OR LOWER(COALESCE(u.phone, '')) LIKE $${idx})`);
    }

    if (typeof role === "string" && ["admin", "user"].includes(role)) {
      params.push(role);
      conditions.push(`u.role = $${params.length}`);
    }

    if (typeof status === "string") {
      if (status === "active") {
        params.push(true);
        conditions.push(`u.is_active = $${params.length}`);
      } else if (status === "inactive") {
        params.push(false);
        conditions.push(`u.is_active = $${params.length}`);
      }
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const query = `
      SELECT 
        u.id, 
        u.email, 
        u.full_name, 
        u.phone, 
        u.role, 
        u.is_active, 
        u.created_at, 
        u.updated_at,
        (SELECT COUNT(*)::int FROM lost_reports lr WHERE lr.user_id = u.id) AS lost_reports_count,
        (SELECT COUNT(*)::int FROM found_item_claims fic WHERE fic.user_id = u.id) AS claims_count
      FROM users u
      ${whereClause}
      ORDER BY u.created_at DESC
    `;

    const result = await pool.query(query, params);

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error("Get users error:", error);
    res.status(500).json({ success: false, message: "Lỗi hệ thống khi lấy danh sách người dùng" });
  }
});

// 2. Thêm người dùng mới
router.post("/", async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { email, password, full_name, phone, role = "user", is_active = true } = req.body;

    if (!email || typeof email !== "string" || !email.includes("@")) {
      res.status(400).json({ success: false, message: "Email không hợp lệ" });
      return;
    }

    if (!password || typeof password !== "string" || password.length < 6) {
      res.status(400).json({ success: false, message: "Mật khẩu phải có ít nhất 6 ký tự" });
      return;
    }

    if (!full_name || typeof full_name !== "string" || !full_name.trim()) {
      res.status(400).json({ success: false, message: "Họ và tên là bắt buộc" });
      return;
    }

    if (!["admin", "user"].includes(role)) {
      res.status(400).json({ success: false, message: "Vai trò không hợp lệ (chỉ chấp nhận 'admin' hoặc 'user')" });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Kiểm tra trùng email
    const existing = await pool.query("SELECT id FROM users WHERE email = $1", [normalizedEmail]);
    if (existing.rows.length > 0) {
      res.status(400).json({ success: false, message: "Email này đã được sử dụng" });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO users (email, password_hash, full_name, phone, role, is_active)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, email, full_name, phone, role, is_active, created_at, updated_at`,
      [
        normalizedEmail,
        passwordHash,
        full_name.trim(),
        phone ? String(phone).trim() : null,
        role,
        Boolean(is_active),
      ]
    );

    const createdUser = result.rows[0];

    await logAudit(
      req.user?.id ?? null,
      "ADMIN_CREATE_USER",
      { created_user_id: createdUser.id, email: createdUser.email, role: createdUser.role },
      req.ip || null
    );

    res.status(201).json({
      success: true,
      message: "Tạo tài khoản người dùng thành công",
      data: createdUser,
    });
  } catch (error) {
    console.error("Create user error:", error);
    res.status(500).json({ success: false, message: "Lỗi hệ thống khi tạo người dùng" });
  }
});

// 3. Cập nhật thông tin & phân quyền người dùng
router.put("/:id", async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const targetUserId = Number(req.params.id);
    if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
      res.status(400).json({ success: false, message: "ID người dùng không hợp lệ" });
      return;
    }

    const { full_name, phone, role, is_active, password } = req.body;

    // Kiểm tra người dùng tồn tại
    const existingResult = await pool.query("SELECT id, email, role, is_active FROM users WHERE id = $1", [targetUserId]);
    if (existingResult.rows.length === 0) {
      res.status(404).json({ success: false, message: "Không tìm thấy người dùng" });
      return;
    }

    const existingUser = existingResult.rows[0];
    const currentAdminId = req.user?.id;

    // Quy tắc an toàn: Không cho phép Admin tự hạ quyền của chính mình
    if (currentAdminId === targetUserId && role !== undefined && role !== "admin") {
      res.status(400).json({ success: false, message: "Bạn không thể tự hạ quyền quản trị viên của chính mình" });
      return;
    }

    // Quy tắc an toàn: Không cho phép Admin tự vô hiệu hóa tài khoản của chính mình
    if (currentAdminId === targetUserId && is_active === false) {
      res.status(400).json({ success: false, message: "Bạn không thể tự khóa tài khoản của chính mình" });
      return;
    }

    // Chuẩn bị các trường cập nhật
    const updates: string[] = [];
    const values: any[] = [];

    if (full_name !== undefined) {
      if (typeof full_name !== "string" || !full_name.trim()) {
        res.status(400).json({ success: false, message: "Họ và tên không được để trống" });
        return;
      }
      values.push(full_name.trim());
      updates.push(`full_name = $${values.length}`);
    }

    if (phone !== undefined) {
      values.push(phone ? String(phone).trim() : null);
      updates.push(`phone = $${values.length}`);
    }

    if (role !== undefined) {
      if (!["admin", "user"].includes(role)) {
        res.status(400).json({ success: false, message: "Vai trò không hợp lệ" });
        return;
      }
      values.push(role);
      updates.push(`role = $${values.length}`);
    }

    if (is_active !== undefined) {
      values.push(Boolean(is_active));
      updates.push(`is_active = $${values.length}`);
    }

    if (password && typeof password === "string" && password.trim()) {
      if (password.length < 6) {
        res.status(400).json({ success: false, message: "Mật khẩu mới phải có ít nhất 6 ký tự" });
        return;
      }
      const newPasswordHash = await bcrypt.hash(password, 10);
      values.push(newPasswordHash);
      updates.push(`password_hash = $${values.length}`);
    }

    if (updates.length === 0) {
      res.status(400).json({ success: false, message: "Không có dữ liệu thay đổi" });
      return;
    }

    updates.push("updated_at = now()");
    values.push(targetUserId);

    const updateQuery = `
      UPDATE users 
      SET ${updates.join(", ")} 
      WHERE id = $${values.length}
      RETURNING id, email, full_name, phone, role, is_active, created_at, updated_at
    `;

    const updateResult = await pool.query(updateQuery, values);
    const updatedUser = updateResult.rows[0];

    await logAudit(
      currentAdminId ?? null,
      "ADMIN_UPDATE_USER",
      {
        target_user_id: targetUserId,
        changes: {
          role: role !== undefined ? role : undefined,
          is_active: is_active !== undefined ? is_active : undefined,
          password_reset: Boolean(password),
        },
      },
      req.ip || null
    );

    res.json({
      success: true,
      message: "Cập nhật thông tin người dùng thành công",
      data: updatedUser,
    });
  } catch (error) {
    console.error("Update user error:", error);
    res.status(500).json({ success: false, message: "Lỗi hệ thống khi cập nhật người dùng" });
  }
});

// 4. Xóa người dùng
router.delete("/:id", async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const targetUserId = Number(req.params.id);
    if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
      res.status(400).json({ success: false, message: "ID người dùng không hợp lệ" });
      return;
    }

    const currentAdminId = req.user?.id;

    // Không cho phép tự xóa chính mình
    if (currentAdminId === targetUserId) {
      res.status(400).json({ success: false, message: "Bạn không thể tự xóa tài khoản của chính mình" });
      return;
    }

    // Kiểm tra người dùng tồn tại
    const userRes = await pool.query("SELECT id, email, role FROM users WHERE id = $1", [targetUserId]);
    if (userRes.rows.length === 0) {
      res.status(404).json({ success: false, message: "Không tìm thấy người dùng" });
      return;
    }

    const targetUser = userRes.rows[0];

    // Nếu người bị xóa là Admin, kiểm tra xem có còn Admin nào khác đang hoạt động không
    if (targetUser.role === "admin") {
      const adminCountRes = await pool.query(
        "SELECT COUNT(*)::int AS count FROM users WHERE role = 'admin' AND is_active = true AND id != $1",
        [targetUserId]
      );
      const remainingAdmins = adminCountRes.rows[0]?.count || 0;
      if (remainingAdmins === 0) {
        res.status(400).json({ success: false, message: "Không thể xóa Quản trị viên duy nhất còn lại của hệ thống" });
        return;
      }
    }

    await pool.query("DELETE FROM users WHERE id = $1", [targetUserId]);

    await logAudit(
      currentAdminId ?? null,
      "ADMIN_DELETE_USER",
      { deleted_user_id: targetUserId, email: targetUser.email, role: targetUser.role },
      req.ip || null
    );

    res.json({
      success: true,
      message: `Đã xóa tài khoản "${targetUser.email}" thành công`,
    });
  } catch (error) {
    console.error("Delete user error:", error);
    res.status(500).json({ success: false, message: "Lỗi hệ thống khi xóa người dùng" });
  }
});

export default router;

