import { Router } from "express";
import type { Response } from "express";
import { pool } from "../db.js";
import { authenticateToken } from "../middleware/auth.js";
import type { AuthenticatedRequest } from "../middleware/auth.js";

const router = Router();

// Lấy danh sách thông báo cho người dùng hoặc Admin đang đăng nhập
router.get("/", authenticateToken, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const role = req.user?.role;

    let query = "";
    let params: any[] = [];

    if (role === "admin") {
      // Admin nhận thông báo dành cho role='admin', hoặc gửi đích danh cho admin đó, hoặc thông báo chung
      query = `
        SELECT id, user_id, role, title, message, type, is_read, created_at
        FROM notifications
        WHERE role = 'admin' OR user_id = $1 OR (role IS NULL AND user_id IS NULL)
        ORDER BY created_at DESC
        LIMIT 50
      `;
      params = [userId];
    } else {
      // Người dùng thông thường nhận thông báo gửi đích danh cho mình hoặc role='user'
      query = `
        SELECT id, user_id, role, title, message, type, is_read, created_at
        FROM notifications
        WHERE user_id = $1 OR (role = 'user' AND user_id IS NULL)
        ORDER BY created_at DESC
        LIMIT 50
      `;
      params = [userId];
    }

    const result = await pool.query(query, params);

    // Đếm số lượng thông báo chưa đọc
    const unreadCount = result.rows.filter((r) => !r.is_read).length;

    res.json({
      success: true,
      unread_count: unreadCount,
      data: result.rows,
    });
  } catch (error) {
    console.error("Get notifications error:", error);
    res.status(500).json({ success: false, message: "Không thể tải danh sách thông báo" });
  }
});

// Đánh dấu 1 thông báo là đã đọc
router.patch("/:id/read", authenticateToken, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const notifId = Number(req.params.id);
    const userId = req.user?.id;
    const role = req.user?.role;

    let query = `UPDATE notifications SET is_read = true WHERE id = $1`;
    let params: any[] = [notifId];

    // Đảm bảo người dùng chỉ sửa thông báo của mình nếu không phải admin
    if (role !== "admin") {
      query += ` AND (user_id = $2 OR (role = 'user' AND user_id IS NULL))`;
      params.push(userId);
    }

    const result = await pool.query(query, params);
    if (result.rowCount === 0) {
      res.status(404).json({ success: false, message: "Không tìm thấy thông báo hoặc không có quyền" });
      return;
    }

    res.json({ success: true, message: "Đã đánh dấu thông báo là đã đọc" });
  } catch (error) {
    console.error("Mark read error:", error);
    res.status(500).json({ success: false, message: "Lỗi khi cập nhật trạng thái thông báo" });
  }
});

// Đánh dấu tất cả thông báo là đã đọc
router.post("/read-all", authenticateToken, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const role = req.user?.role;

    if (role === "admin") {
      await pool.query(
        `UPDATE notifications SET is_read = true 
         WHERE (role = 'admin' OR user_id = $1 OR (role IS NULL AND user_id IS NULL)) AND is_read = false`,
        [userId]
      );
    } else {
      await pool.query(
        `UPDATE notifications SET is_read = true 
         WHERE (user_id = $1 OR (role = 'user' AND user_id IS NULL)) AND is_read = false`,
        [userId]
      );
    }

    res.json({ success: true, message: "Đã đánh dấu tất cả thông báo là đã đọc" });
  } catch (error) {
    console.error("Read all error:", error);
    res.status(500).json({ success: false, message: "Lỗi khi đánh dấu đã đọc tất cả" });
  }
});

export default router;
