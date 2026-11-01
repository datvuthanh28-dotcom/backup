import bcrypt from "bcryptjs";
import { db } from "../config/db.js";
import { generateToken, setAuthCookie, clearAuthCookie } from "../middleware/auth.js";

// Customer Login (/login)
export async function customerLogin(req, res) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, error: "Vui lòng nhập đầy đủ email và mật khẩu." });
    }

    const user = await db.findUserByEmail(email);
    if (!user) {
      return res.status(401).json({ success: false, error: "Email hoặc mật khẩu không chính xác." });
    }

    // Strict role check for Customer Portal
    if (user.role !== "customer") {
      return res.status(403).json({
        success: false,
        error: `Tài khoản này có vai trò "${user.role.toUpperCase()}". Vui lòng đăng nhập đúng tại Cổng ${
          user.role === "staff" ? "Nhân Viên (/staff/login)" : "Quản Trị Viên (/admin/login)"
        }.`,
      });
    }

    if (user.is_active === false) {
      return res.status(403).json({ success: false, error: "Tài khoản của bạn đã bị tạm khóa. Vui lòng liên hệ hỗ trợ." });
    }

    const isValidPassword = bcrypt.compareSync(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ success: false, error: "Email hoặc mật khẩu không chính xác." });
    }

    const token = generateToken(user);
    setAuthCookie(res, token);

    return res.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone,
      },
      portalDestination: "/account/orders",
    });
  } catch (err) {
    console.error("[Auth Customer] Error:", err);
    return res.status(500).json({ success: false, error: "Lỗi hệ thống khi xử lý đăng nhập khách hàng." });
  }
}

// Staff Login (/staff/login)
export async function staffLogin(req, res) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, error: "Vui lòng nhập email và mật khẩu nhân viên." });
    }

    const user = await db.findUserByEmail(email);
    if (!user) {
      return res.status(401).json({ success: false, error: "Thông tin xác thực nhân viên không chính xác." });
    }

    // Strict role check for Staff Portal
    if (user.role !== "staff") {
      if (user.role === "customer") {
        return res.status(403).json({
          success: false,
          error: "Tài khoản Khách hàng không có đặc quyền truy cập Cổng Nhân Viên Vận Hành.",
        });
      }
      if (user.role === "admin") {
        return res.status(403).json({
          success: false,
          error: "Tài khoản Quản trị viên vui lòng đăng nhập tại Cổng Quản Trị (/admin/login).",
        });
      }
    }

    // Disabled staff check
    if (user.is_active === false) {
      return res.status(403).json({
        success: false,
        error: "Tài khoản nhân viên của bạn đã bị vô hiệu hóa bởi Quản trị viên. Truy cập bị chặn.",
      });
    }

    const isValidPassword = bcrypt.compareSync(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ success: false, error: "Thông tin xác thực nhân viên không chính xác." });
    }

    const token = generateToken(user);
    setAuthCookie(res, token);

    return res.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone,
      },
      portalDestination: "/staff",
    });
  } catch (err) {
    console.error("[Auth Staff] Error:", err);
    return res.status(500).json({ success: false, error: "Lỗi hệ thống khi xử lý đăng nhập nhân viên." });
  }
}

// Admin Login (/admin/login)
export async function adminLogin(req, res) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, error: "Vui lòng nhập email và mật khẩu quản trị viên." });
    }

    const user = await db.findUserByEmail(email);
    if (!user) {
      return res.status(401).json({ success: false, error: "Thông tin xác thực quản trị viên không chính xác." });
    }

    // Strict role check for Admin Portal
    if (user.role !== "admin") {
      return res.status(403).json({
        success: false,
        error: "Truy cập bị từ chối nghiêm ngặt. Chỉ Quản trị viên cấp cao (Admin) mới có quyền truy cập cổng này.",
      });
    }

    if (user.is_active === false) {
      return res.status(403).json({
        success: false,
        error: "Tài khoản quản trị viên đã bị khóa.",
      });
    }

    const isValidPassword = bcrypt.compareSync(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ success: false, error: "Thông tin xác thực quản trị viên không chính xác." });
    }

    const token = generateToken(user);
    setAuthCookie(res, token);

    return res.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone,
      },
      portalDestination: "/admin",
    });
  } catch (err) {
    console.error("[Auth Admin] Error:", err);
    return res.status(500).json({ success: false, error: "Lỗi hệ thống khi xử lý đăng nhập quản trị viên." });
  }
}

// Customer Public Registration (Customer only)
export async function registerCustomer(req, res) {
  try {
    const { name, email, password, phone } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, error: "Họ tên, email và mật khẩu là bắt buộc." });
    }

    const trimmedEmail = email.trim().toLowerCase();
    const existing = await db.findUserByEmail(trimmedEmail);
    if (existing) {
      return res.status(400).json({ success: false, error: "Email này đã được đăng ký tài khoản trên hệ thống." });
    }

    // Role is FORCED server-side to customer - never trust client input!
    const password_hash = bcrypt.hashSync(password, 10);
    const newCustomer = {
      id: `usr_cust_${Date.now()}`,
      name: name.trim(),
      email: trimmedEmail,
      password_hash,
      role: "customer",
      phone: (phone || "").trim(),
      is_active: true,
    };

    await db.createUser(newCustomer);

    const token = generateToken(newCustomer);
    setAuthCookie(res, token);

    return res.status(201).json({
      success: true,
      user: {
        id: newCustomer.id,
        name: newCustomer.name,
        email: newCustomer.email,
        role: newCustomer.role,
        phone: newCustomer.phone,
      },
      portalDestination: "/account/orders",
    });
  } catch (err) {
    console.error("[Auth Register] Error:", err);
    return res.status(500).json({ success: false, error: "Lỗi hệ thống khi đăng ký tài khoản." });
  }
}

// Logout
export function logout(req, res) {
  clearAuthCookie(res);
  return res.json({ success: true, message: "Đăng xuất thành công." });
}

// Current User Session (getMe)
export function getMe(req, res) {
  if (!req.user) {
    return res.status(401).json({ success: false, error: "Chưa đăng nhập." });
  }
  return res.json({ success: true, user: req.user });
}

