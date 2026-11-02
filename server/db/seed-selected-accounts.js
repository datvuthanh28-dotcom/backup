import bcrypt from "bcryptjs";
import { connectDB, db } from "../config/db.js";

const accounts = [
  ["usr_admin_01", "Quản Trị Viên Maison Rue", "admin@maisonrue.com", "admin123", "admin"],
  ["usr_staff_01", "Nhân Viên Maison Rue", "staff@maisonrue.com", "staff123", "staff"],
  ["usr_staff_02", "Nhân Viên Maison Rue 2", "staff2@maisonrue.com", "staff123", "staff"],
  ["usr_cust_01", "Khách Hàng Maison Rue", "customer@gmail.com", "customer123", "customer"],
];

await connectDB();

for (const [id, name, email, password, role] of accounts) {
  const existing = await db.findUserByEmail(email);
  if (!existing) {
    await db.createUser({
      id,
      name,
      email,
      password_hash: bcrypt.hashSync(password, 10),
      role,
      phone: null,
      is_active: true,
    });
  }
}

console.log("Four requested web accounts are ready.");
process.exit(0);
