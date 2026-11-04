import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { connectDB, getPool } from "../config/db.js";

const here = path.dirname(fileURLToPath(import.meta.url));
await connectDB();
const pool = getPool();
const sql = fs.readFileSync(path.join(here, "migrations", "007_product_catalog_activation.sql"), "utf8");
for (const batch of sql.split(/^\s*GO\s*$/gim).map((part) => part.trim()).filter(Boolean)) {
  await pool.request().query(batch);
}
await import("./seed-catalog-only.js");
