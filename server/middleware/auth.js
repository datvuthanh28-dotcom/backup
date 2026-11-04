import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import { db } from "../config/db.js";

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || "maison_rue_super_secret_jwt_key_2026_luxury_old_money";

export function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
    },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

export function setAuthCookie(res, token) {
  res.cookie("maison_rue_token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: "/",
  });
}

export function clearAuthCookie(res) {
  res.clearCookie("maison_rue_token", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });
}

// Authenticate token middleware
export async function authenticateToken(req, res, next) {
  let token = req.cookies?.maison_rue_token;

  // Fallback to Bearer authorization header if cookie is absent
  if (!token && req.headers.authorization?.startsWith("Bearer ")) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      error: "Yêu cầu đăng nhập. Phiên làm việc không tồn tại hoặc đã hết hạn.",
    });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await db.findUserById(decoded.id);

    if (!user) {
      clearAuthCookie(res);
      return res.status(401).json({
        success: false,
        error: "Tài khoản không tồn tại trên hệ thống.",
      });
    }

    if (user.is_active === false) {
      clearAuthCookie(res);
      return res.status(403).json({
        success: false,
        error: "Tài khoản của bạn đã bị vô hiệu hóa bởi Quản trị viên.",
      });
    }

    req.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      phone: user.phone,
    };

    next();
  } catch {
    clearAuthCookie(res);
    return res.status(401).json({
      success: false,
      error: "Mã phiên đăng nhập không hợp lệ hoặc đã hết hạn.",
    });
  }
}

export async function optionalAuthenticateToken(req, res, next) {
  let token = req.cookies?.maison_rue_token;
  if (!token && req.headers.authorization?.startsWith("Bearer ")) token = req.headers.authorization.split(" ")[1];
  if (!token) return next();
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await db.findUserById(decoded.id);
    if (user?.is_active !== false) req.user = { id: user.id, name: user.name, email: user.email, role: user.role, phone: user.phone };
  } catch { /* A preview remains available as guest when an optional session is invalid. */ }
  next();
}

// Server-side role authorization middleware
export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: "Yêu cầu đăng nhập để truy cập tài nguyên này.",
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: `Truy cập bị từ chối. Tài khoản vai trò "${req.user.role}" không có quyền truy cập chức năng này (Yêu cầu: ${allowedRoles.join(" hoặc ")}).`,
        requiredRoles: allowedRoles,
        userRole: req.user.role,
      });
    }

    next();
  };
}

