import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { connectDB, getPool } from "../config/db.js";

const directory = path.dirname(fileURLToPath(import.meta.url));
await connectDB();
const pool = getPool();
try {
  for (const file of ["023_promotion_campaign_templates.sql", "024_promotion_rules_and_reservations.sql"]) {
    const source = fs.readFileSync(path.join(directory, "migrations", file), "utf8");
    for (const batch of source.split(/^\s*GO\s*$/gim).map((item) => item.trim()).filter(Boolean)) await pool.request().query(batch);
  }
  console.log("Đã áp dụng cấu trúc chiến dịch khuyến mãi.");
} finally {
  await pool.close();
}
