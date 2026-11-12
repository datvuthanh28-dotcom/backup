import crypto from "crypto";
import bcrypt from "bcryptjs";
import { db } from "../config/db.js";
import { generateToken, setAuthCookie, clearAuthCookie } from "../middleware/auth.js";
import { sendPasswordResetOtpEmail, sendAccountCreatedEmail } from "../services/emailService.js";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function hashResetOtp(userId, otp) {
  const secret = process.env.JWT_SECRET || "maison_rue_otp_fallback";
  return crypto.createHmac("sha256", secret).update(`${userId}:${String(otp).trim()}`).digest("hex");
}

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

    const trimmedEmail = String(email).trim().toLowerCase();
    if (!EMAIL_REGEX.test(trimmedEmail)) {
      return res.status(400).json({ success: false, error: "Địa chỉ email không hợp lệ." });
    }

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
    const createdUser = (await db.findUserById(newCustomer.id)) || newCustomer;
    const registeredEmail = String(createdUser.email || trimmedEmail).trim().toLowerCase();

    const token = generateToken(createdUser);
    setAuthCookie(res, token);

    // Fire welcome email strictly to the exact registered account email in DB
    await sendAccountCreatedEmail({
      userId: createdUser.id,
      name: createdUser.name,
      email: registeredEmail,
    }).catch((err) => {
      console.error("[Auth Register] Account created email error:", err?.message || err);
    });

    return res.status(201).json({
      success: true,
      user: {
        id: createdUser.id,
        name: createdUser.name,
        email: registeredEmail,
        role: createdUser.role,
        phone: createdUser.phone || "",
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

// Customer Forgot Password (send 6-digit OTP via email)
export async function forgotPassword(req, res) {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    if (!email || !EMAIL_REGEX.test(email)) {
      return res.status(400).json({ success: false, error: "Please enter a valid email address." });
    }

    const user = await db.findUserByEmail(email);
    if (!user || user.role !== "customer" || user.is_active === false) {
      return res.json({
        success: true,
        message: "If an active client account exists for this email, a 6-digit verification code has been sent.",
      });
    }

    const otp = String(crypto.randomInt(100000, 1000000));
    const otpHash = hashResetOtp(user.id, otp);
    await db.createPasswordResetOtp({
      userId: user.id,
      email: user.email,
      otpHash,
      expiresInMinutes: 15,
      maxAttempts: 5,
    });

    const emailResult = await sendPasswordResetOtpEmail({
      userId: user.id,
      email: user.email,
      name: user.name,
      otp,
      expiresInMinutes: 15,
    });

    if (!emailResult?.success && !emailResult?.skipped) {
      return res.status(502).json({
        success: false,
        error: "Unable to send the verification email right now. Please try again shortly.",
      });
    }

    return res.json({
      success: true,
      message: "If an active client account exists for this email, a 6-digit verification code has been sent.",
    });
  } catch (err) {
    console.error("[Auth Forgot Password] Error:", err);
    return res.status(500).json({ success: false, error: "Unable to process password reset request." });
  }
}

// Customer Reset Password with 6-digit OTP (auto-invalidates all previous JWT cookies/sessions)
export async function resetPassword(req, res) {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const otp = String(req.body?.otp || "").trim();
    const newPassword = String(req.body?.newPassword || "");

    if (!email || !EMAIL_REGEX.test(email)) {
      return res.status(400).json({ success: false, error: "Please enter a valid email address." });
    }
    if (!/^\d{6}$/.test(otp)) {
      return res.status(400).json({ success: false, error: "Please enter the 6-digit verification code." });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, error: "New password must be at least 6 characters." });
    }

    const user = await db.findUserByEmail(email);
    if (!user || user.role !== "customer" || user.is_active === false) {
      return res.status(400).json({ success: false, error: "Invalid or expired verification code." });
    }

    const activeOtp = await db.getLatestActivePasswordResetOtp(email);
    if (!activeOtp || activeOtp.user_id !== user.id) {
      return res.status(400).json({ success: false, error: "Verification code is invalid or has expired." });
    }

    if (Number(activeOtp.attempts || 0) >= Number(activeOtp.max_attempts || 5)) {
      return res.status(400).json({ success: false, error: "Too many incorrect attempts. Please request a new code." });
    }

    const candidateHash = hashResetOtp(user.id, otp);
    const matches =
      candidateHash.length === activeOtp.otp_hash.length &&
      crypto.timingSafeEqual(Buffer.from(candidateHash, "hex"), Buffer.from(activeOtp.otp_hash, "hex"));

    if (!matches) {
      const updatedOtp = await db.incrementPasswordResetOtpAttempts(activeOtp.id);
      const remaining = Math.max(0, Number(updatedOtp?.max_attempts || 5) - Number(updatedOtp?.attempts || 0));
      return res.status(400).json({
        success: false,
        error:
          remaining > 0
            ? `Incorrect verification code. ${remaining} attempt(s) remaining.`
            : "Too many incorrect attempts. Please request a new verification code.",
      });
    }

    const passwordHash = bcrypt.hashSync(newPassword, 10);
    const completion = await db.completePasswordResetWithOtp({
      otpId: activeOtp.id,
      userId: user.id,
      passwordHash,
    });

    if (!completion?.completed) {
      return res.status(400).json({ success: false, error: "Verification code is no longer valid. Please request a new one." });
    }

    clearAuthCookie(res);
    return res.json({
      success: true,
      message: "Your password has been reset and all previous sessions have been signed out. Please sign in with your new password.",
    });
  } catch (err) {
    console.error("[Auth Reset Password] Error:", err);
    return res.status(500).json({ success: false, error: "Unable to reset password." });
  }
}

