import bcrypt from "bcryptjs";
import { connectDB, db, getPool } from "../config/db.js";

const accounts = [
  ["usr_admin_01", "Văn Hưng (Quản Trị Viên)", "vanhung29993@gmail.com", "admin123", "admin"],
  ["usr_staff_01", "Lê Hoàng Yến (Vận Hành)", "staffmaisonrue@gmail.com", "staff123", "staff"],
  ["usr_staff_02", "Trần Minh Khoa (Kho Vận)", "maisonruestaff2@gmail.com", "staff123", "staff"],
  ["usr_cust_01", "Vũ Thành Đạt", "vudat9532@gmail.com", "customer123", "customer"],
];

await connectDB();
const pool = getPool();

for (const [id, name, email, password, role] of accounts) {
  const existing = (await db.findUserById(id)) || (await db.findUserByEmail(email));
  const passwordHash = bcrypt.hashSync(password, 10);
  if (!existing) {
    await db.createUser({
      id,
      name,
      email,
      password_hash: passwordHash,
      role,
      phone: null,
      is_active: true,
    });
  } else {
    await pool.request()
      .input("id", id)
      .input("name", name)
      .input("email", email)
      .input("password_hash", passwordHash)
      .input("role", role)
      .query(`
        UPDATE Users
        SET name=@name, email=@email, password_hash=@password_hash,
            role=@role, is_active=1, updated_at=GETDATE()
        WHERE id=@id
      `);
  }
}

console.log("Four requested web accounts are ready.");
process.exit(0);
