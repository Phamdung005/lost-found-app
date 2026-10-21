import { Router } from "express";
import type { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { pool } from "../db.js";
import { authenticateToken } from "../middleware/auth.js";
import type { AuthenticatedRequest } from "../middleware/auth.js";
import { logAudit } from "../utils/audit.js";

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || "findbox_super_secret_jwt_key_2026_demo";

// 1. Đăng ký tài khoản
router.post("/register", async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password, full_name, phone } = req.body;

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

    const normalizedEmail = email.trim().toLowerCase();

    // Kiểm tra trùng email
    const existing = await pool.query("SELECT id FROM users WHERE email = $1", [normalizedEmail]);
    if (existing.rows.length > 0) {
      res.status(400).json({ success: false, message: "Email này đã được đăng ký" });
      return;
    }

    // Luôn gán role 'user', người dùng không được tự ý gửi role 'admin'
    const passwordHash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, full_name, phone, role)
       VALUES ($1, $2, $3, $4, 'user')
       RETURNING id, email, full_name, phone, role, is_active, created_at`,
      [normalizedEmail, passwordHash, full_name.trim(), phone ? String(phone).trim() : null]
    );

    const newUser = result.rows[0];

    const token = jwt.sign(
      { id: newUser.id, email: newUser.email, role: newUser.role, full_name: newUser.full_name },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    await logAudit(newUser.id, "USER_REGISTER", { email: newUser.email }, req.ip || null);

    res.status(201).json({
      success: true,
      message: "Đăng ký tài khoản thành công",
      data: {
        token,
        user: newUser,
      },
    });
  } catch (error) {
    console.error("Register error:", error);
    res.status(500).json({ success: false, message: "Lỗi hệ thống khi đăng ký tài khoản" });
  }
});

// 2. Đăng nhập
router.post("/login", async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ success: false, message: "Vui lòng nhập email và mật khẩu" });
      return;
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    const result = await pool.query(
      `SELECT id, email, password_hash, full_name, phone, role, is_active, created_at
       FROM users WHERE email = $1`,
      [normalizedEmail]
    );

    if (result.rows.length === 0) {
      res.status(401).json({ success: false, message: "Email hoặc mật khẩu không chính xác" });
      return;
    }

    const user = result.rows[0];

    if (!user.is_active) {
      res.status(403).json({ success: false, message: "Tài khoản của bạn đã bị vô hiệu hóa" });
      return;
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      res.status(401).json({ success: false, message: "Email hoặc mật khẩu không chính xác" });
      return;
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, full_name: user.full_name },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    await logAudit(user.id, "USER_LOGIN", { email: user.email, role: user.role }, req.ip || null);

    // Không trả về password_hash
    const { password_hash, ...safeUser } = user;

    res.json({
      success: true,
      message: "Đăng nhập thành công",
      data: {
        token,
        user: safeUser,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ success: false, message: "Lỗi hệ thống khi đăng nhập" });
  }
});

// 3. Lấy thông tin tài khoản hiện tại (Me)
router.get("/me", authenticateToken, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const result = await pool.query(
      `SELECT id, email, full_name, phone, role, is_active, created_at
       FROM users WHERE id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: "Không tìm thấy người dùng" });
      return;
    }

    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Get /me error:", error);
    res.status(500).json({ success: false, message: "Lỗi khi lấy thông tin người dùng" });
  }
});

// 4. Đổi mật khẩu
router.post("/change-password", authenticateToken, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { current_password, new_password } = req.body;

    if (!current_password || !new_password) {
      res.status(400).json({ success: false, message: "Vui lòng nhập mật khẩu hiện tại và mật khẩu mới" });
      return;
    }

    if (typeof new_password !== "string" || new_password.length < 6) {
      res.status(400).json({ success: false, message: "Mật khẩu mới phải có ít nhất 6 ký tự" });
      return;
    }

    const userResult = await pool.query("SELECT password_hash FROM users WHERE id = $1", [userId]);
    if (userResult.rows.length === 0) {
      res.status(404).json({ success: false, message: "Người dùng không tồn tại" });
      return;
    }

    const isMatch = await bcrypt.compare(current_password, userResult.rows[0].password_hash);
    if (!isMatch) {
      res.status(400).json({ success: false, message: "Mật khẩu hiện tại không đúng" });
      return;
    }

    const newHash = await bcrypt.hash(new_password, 10);
    await pool.query("UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2", [newHash, userId]);

    await logAudit(userId!, "PASSWORD_CHANGED", {}, req.ip || null);

    res.json({
      success: true,
      message: "Đổi mật khẩu thành công",
    });
  } catch (error) {
    console.error("Change password error:", error);
    res.status(500).json({ success: false, message: "Lỗi hệ thống khi đổi mật khẩu" });
  }
});

export default router;
