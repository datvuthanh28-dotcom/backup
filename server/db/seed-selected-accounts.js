import bcrypt from "bcryptjs";
import { connectDB, db } from "../config/db.js";

const accounts = [
  ["usr_admin_01", "Quản Trị Viên Maison Rue", "vanhung29993@gmail.com", "admin123", "admin"],
  ["usr_staff_01", "Nhân Viên Maison Rue", "staffmaisonrue@gmail.com", "staff123", "staff"],
  ["usr_staff_02", "Nhân Viên Maison Rue 2", "maisonruestaff2@gmail.com", "staff123", "staff"],
  ["usr_cust_01", "Khách Hàng Maison Rue", "vudat9532@gmail.com", "customer123", "customer"],
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
