import process from "node:process";
import { db, getPool } from "../server/config/db.js";

try {
  const report = await db.getRevenueReport({});
  const products = await db.getAllProductsAdmin();
  const dataset = (await getPool().request().query(`
    SELECT
      (SELECT COUNT(*) FROM PromotionTemplates WHERE is_active=1 AND is_archived=0) templates,
      (SELECT COUNT(*) FROM Promotions WHERE is_archived=0) promotions,
      (SELECT COUNT(*) FROM PromotionCodes WHERE is_active=1) codes,
      (SELECT COUNT(*) FROM SkuDailyBusinessMetrics) metric_rows
  `)).recordset[0];
  console.log("\n[Maison Rue Doctor]");
  console.log(`Database: OK`);
  console.log(`Products: ${products.length}`);
  console.log(`Orders: ${report.totalOrders || 0}`);
  console.log(`Units sold: ${report.unitsSold || 0}`);
  console.log(`Revenue trend points: ${report.trend?.length || 0}`);
  console.log(`Promotion templates: ${dataset.templates || 0}`);
  console.log(`Promotions: ${dataset.promotions || 0}`);
  console.log(`Promotion codes: ${dataset.codes || 0}`);
  console.log(`SKU metric rows: ${dataset.metric_rows || 0}`);
  console.log("Database structure and reporting data are available.\n");
  process.exit(0);
} catch (error) {
  console.error("\n[Maison Rue Doctor] FAILED");
  console.error(error.message);
  console.error("Run `npm run setup` on a new machine, then restart `npm run dev`.\n");
  process.exit(1);
}
