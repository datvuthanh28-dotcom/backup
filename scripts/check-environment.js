import process from "node:process";
import { db } from "../server/config/db.js";

try {
  const report = await db.getRevenueReport({});
  const products = await db.getAllProductsAdmin();
  console.log("\n[Maison Rue Doctor]");
  console.log(`Database: OK`);
  console.log(`Products: ${products.length}`);
  console.log(`Orders: ${report.totalOrders || 0}`);
  console.log(`Units sold: ${report.unitsSold || 0}`);
  console.log(`Revenue trend points: ${report.trend?.length || 0}`);
  console.log("Database structure and reporting data are available.\n");
  process.exit(0);
} catch (error) {
  console.error("\n[Maison Rue Doctor] FAILED");
  console.error(error.message);
  console.error("Run `npm run setup` on a new machine, then restart `npm run dev`.\n");
  process.exit(1);
}
