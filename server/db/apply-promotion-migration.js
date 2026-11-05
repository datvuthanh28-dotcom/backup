import fs from "node:fs";
import path from "node:path";
import sql from "mssql";
import { fileURLToPath } from "node:url";
import { connectDB, getPool } from "../config/db.js";

const here = path.dirname(fileURLToPath(import.meta.url));
try {
  await connectDB();
  for (const file of ["008_product_collection_material.sql", "009_product_collection_tags.sql", "009_promotions.sql", "010_promotion_business_rules.sql", "011_revenue_reporting.sql"]) {
    const source = fs.readFileSync(path.join(here, "migrations", file), "utf8");
    for (const batch of source.split(/^\s*GO\s*$/gim).map((part) => part.trim()).filter(Boolean)) await getPool().request().query(batch);
    console.log(`[Migration] Applied ${file}.`);
  }
  console.log("[Migration] Promotion rules, budgets and approval controls are ready.");
} finally { await sql.close(); }
