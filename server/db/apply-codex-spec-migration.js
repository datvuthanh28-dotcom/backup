import fs from "node:fs";
import path from "node:path";
import sql from "mssql";
import { fileURLToPath } from "node:url";
import { connectDB, getPool } from "../config/db.js";

const here = path.dirname(fileURLToPath(import.meta.url));

try {
  await connectDB();
  const source = fs.readFileSync(
    path.join(here, "migrations", "021_codex_spec_enhancements.sql"),
    "utf8"
  );
  const batches = source
    .split(/^\s*GO\s*$/gim)
    .map((part) => part.trim())
    .filter(Boolean);

  for (const batch of batches) {
    await getPool().request().query(batch);
  }

  console.log("[Migration] Product, SKU, and review audit enhancements are ready.");
} finally {
  await sql.close();
}
