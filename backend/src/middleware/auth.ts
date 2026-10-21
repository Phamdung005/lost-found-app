import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export interface AuthenticatedUser {
  id: number;
  email: string;
  role: "admin" | "user";
  full_name: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

const JWT_SECRET = process.env.JWT_SECRET || "findbox_super_secret_jwt_key_2026_demo";

export function authenticateToken(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.startsWith("Bearer ") ? authHeader.split(" ")[1] : null;

  if (!token) {
    res.status(401).json({
      success: false,
      message: "Yêu cầu đăng nhập để truy cập tài nguyên này",
    });
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthenticatedUser;
    req.user = decoded;
    next();
  } catch (error) {
    res.status(403).json({
      success: false,
      message: "Phiên đăng nhập không hợp lệ hoặc đã hết hạn",
    });
  }
}

export function requireRole(allowedRoles: ("admin" | "user")[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: "Chưa xác thực người dùng",
      });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        message: "Bạn không có quyền thực hiện hành động này",
      });
      return;
    }

    next();
  };
}

export const requireAdmin = requireRole(["admin"]);
