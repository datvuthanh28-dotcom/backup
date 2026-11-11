import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { connectDB, getPool } from "../config/db.js";
import { legacyProductSql } from "../utils/productLifecycle.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));

export async function retireLegacyProducts() {
  await connectDB();
  const migration = await fs.readFile(
    path.join(scriptDir, "migrations", "027_retire_legacy_products.sql"),
    "utf8"
  );
  await getPool().request().query(migration);

  const result = await getPool().request().query(`
    SELECT COUNT(*) AS remaining_active
    FROM Products p
    WHERE ${legacyProductSql("p")} AND p.is_active = 1
  `);
  const remainingActive = Number(result.recordset[0]?.remaining_active || 0);
  if (remainingActive > 0) {
    throw new Error(`Có ${remainingActive} sản phẩm mã cũ vẫn đang hoạt động sau migration.`);
  }

  console.log("[Legacy Products] All products with numeric codes <= 105 are retired.");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  retireLegacyProducts()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("[Legacy Products] Retirement failed:", error);
      process.exit(1);
    });
}
