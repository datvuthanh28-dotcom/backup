import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { connectDB, getPool } from "../config/db.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const script = fs.readFileSync(path.join(here, "migrations", "025_review_replies.sql"), "utf8");
await connectDB();
const pool = getPool();
try {
  for (const batch of script.split(/^\s*GO\s*$/gim).map((value) => value.trim()).filter(Boolean)) await pool.request().batch(batch);
  console.log("Đã áp dụng cấu trúc phản hồi đánh giá.");
} finally {
  await pool.close();
}
