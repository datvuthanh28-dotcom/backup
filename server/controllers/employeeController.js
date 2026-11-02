import bcrypt from "bcryptjs";
import { db } from "../config/db.js";

export async function getAllEmployees(req, res) {
  try {
    const staff = await db.getAllStaff();
    return res.json({ success: true, staff });
  } catch (err) {
    console.error("[Get Employees] Error:", err);
    return res.status(500).json({ success: false, error: "Không thể lấy danh sách nhân viên." });
  }
}

export async function createEmployee(req, res) {
  try {
    const { name, email, phone, password } = req.body;

    if (!name || !email) {
      return res.status(400).json({ success: false, error: "Họ tên và email là bắt buộc." });
    }

    const trimmedEmail = email.trim().toLowerCase();
    const existing = await db.findUserByEmail(trimmedEmail);
    if (existing) {
      return res.status(400).json({ success: false, error: "Email này đã tồn tại trong hệ thống." });
    }

    const rawPassword = password || "staff123";
    const password_hash = bcrypt.hashSync(rawPassword, 10);

    const newStaff = {
      id: `usr_staff_${Date.now()}`,
      name: name.trim(),
      email: trimmedEmail,
      password_hash,
      role: "staff", // Enforced server-side
      phone: (phone || "").trim(),
      is_active: true,
    };

    const created = await db.createUser(newStaff);
    const safeStaff = { ...created };
    delete safeStaff.password_hash;

    return res.status(201).json({
      success: true,
      staff: safeStaff,
      message: `Đã tạo thành công tài khoản nhân viên ${name}.`,
    });
  } catch (err) {
    console.error("[Create Employee] Error:", err);
    return res.status(500).json({ success: false, error: "Lỗi hệ thống khi tạo tài khoản nhân viên." });
  }
}

export async function updateEmployee(req, res) {
  try {
    const { name, phone } = req.body;
    const staffId = req.params.id;

    const existing = await db.findUserById(staffId);
    if (!existing || existing.role !== "staff") {
      return res.status(404).json({ success: false, error: "Không tìm thấy nhân viên." });
    }

    const updated = await db.updateUser(staffId, {
      name: name ? name.trim() : existing.name,
      phone: phone ? phone.trim() : existing.phone,
    });

    const safeStaff = { ...updated };
    delete safeStaff.password_hash;
    return res.json({ success: true, staff: safeStaff, message: "Cập nhật thông tin nhân viên thành công." });
  } catch (err) {
    console.error("[Update Employee] Error:", err);
    return res.status(500).json({ success: false, error: "Lỗi khi cập nhật thông tin nhân viên." });
  }
}

export async function toggleEmployeeStatus(req, res) {
  try {
    const staffId = req.params.id;
    const existing = await db.findUserById(staffId);

    if (!existing || existing.role !== "staff") {
      return res.status(404).json({ success: false, error: "Không tìm thấy nhân viên." });
    }

    const newStatus = !existing.is_active;
    await db.updateUser(staffId, { is_active: newStatus });

    return res.json({
      success: true,
      active: newStatus,
      message: `Đã ${newStatus ? "kích hoạt" : "vô hiệu hóa"} tài khoản của ${existing.name}.${
        !newStatus ? " Nhân viên sẽ bị tước quyền đăng nhập và thao tác ngay lập tức." : ""
      }`,
    });
  } catch (err) {
    console.error("[Toggle Status] Error:", err);
    return res.status(500).json({ success: false, error: "Lỗi khi thay đổi trạng thái nhân viên." });
  }
}

