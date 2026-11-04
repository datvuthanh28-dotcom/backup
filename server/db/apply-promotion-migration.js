import fs from "node:fs";
import path from "node:path";
import sql from "mssql";
import { fileURLToPath } from "node:url";
import { connectDB, getPool } from "../config/db.js";

const here = path.dirname(fileURLToPath(import.meta.url));
try {
  await connectDB();
  const source = fs.readFileSync(path.join(here, "migrations", "009_promotions.sql"), "utf8");
  for (const batch of source.split(/^\s*GO\s*$/gim).map((part) => part.trim()).filter(Boolean)) await getPool().request().query(batch);
  console.log("[Migration] Promotion tables and order snapshots are ready.");
} finally { await sql.close(); }
