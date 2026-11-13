import process from "node:process";
import { connectDB, getPool } from "../server/config/db.js";

try {
  await connectDB();
  const pool = getPool();
  const summary = (await pool.request().query(`
    SELECT
      (SELECT COUNT(*) FROM Products WHERE is_active=1) AS products,
      (SELECT COUNT(*) FROM ProductVariants WHERE is_active=1) AS skus,
      (SELECT COUNT(*) FROM Orders) AS orders,
      (SELECT COUNT(*) FROM SkuDailyBusinessMetrics) AS metric_rows,
      (SELECT COUNT(*) FROM PromotionTemplates WHERE is_active=1 AND is_archived=0) AS templates,
      (SELECT COUNT(*) FROM Promotions WHERE is_archived=0) AS promotions,
      (SELECT COUNT(*) FROM PromotionCodes WHERE is_active=1) AS codes
  `)).recordset[0];
  await pool.close();

  const checks = [
    ["sản phẩm hiện hành", Number(summary.products) > 0],
    ["SKU hiện hành", Number(summary.skus) > 0],
    ["đơn hàng báo cáo", Number(summary.orders) > 0],
    ["dòng chỉ số SKU", Number(summary.metric_rows) > 0],
    ["mẫu đợt sale", Number(summary.templates) >= 5],
    ["chương trình khuyến mãi", Number(summary.promotions) > 0],
    ["mã ưu đãi", Number(summary.codes) > 0],
  ];
  console.table(summary);
  const failed = checks.filter(([, passed]) => !passed).map(([name]) => name);
  if (failed.length) {
    throw new Error(`Dữ liệu demo chưa đầy đủ: ${failed.join(", ")}. Chạy npm run setup (máy mới) hoặc npm run db:reset-demo (môi trường demo đã lệch).`);
  }
  console.log("[Demo dataset] OK — catalog, KPI, khuyến mãi và mã ưu đãi đã sẵn sàng.");
} catch (error) {
  console.error("[Demo dataset] FAILED:", error.message);
  process.exitCode = 1;
}
