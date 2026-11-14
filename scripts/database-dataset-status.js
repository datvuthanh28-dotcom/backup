import crypto from "node:crypto";
import { connectDB, getPool } from "../server/config/db.js";

function fingerprint(rows) {
  const payload = rows
    .map((row) => Object.values(row).map((value) => value ?? "").join("|"))
    .join("\n");
  return crypto.createHash("sha256").update(payload).digest("hex").slice(0, 16);
}

try {
  await connectDB();
  const pool = getPool();
  const catalogRows = (await pool.request().query(`
    SELECT p.product_code,p.name,p.price,p.category,p.gender,p.is_active,
           v.sku,v.color_name,v.size_name,v.price AS sku_price,
           v.cost_price,v.floor_price,v.low_stock_threshold,v.max_stock_threshold,v.is_active AS sku_active
    FROM Products p
    LEFT JOIN ProductVariants v ON v.product_id=p.id
    WHERE p.product_code LIKE 'MR-%'
    ORDER BY p.product_code,v.sku
  `)).recordset;
  const summary = (await pool.request().query(`
    SELECT
      (SELECT COUNT(*) FROM Products WHERE is_active=1) products,
      (SELECT COUNT(*) FROM ProductVariants WHERE is_active=1) skus,
      (SELECT COUNT(*) FROM Orders) orders,
      (SELECT COUNT(*) FROM Orders WHERE data_origin='simulated') simulated_orders,
      (SELECT COUNT(*) FROM ProductFavorites WHERE is_active=1) favorites,
      (SELECT COUNT(*) FROM ProductReviews WHERE status='published') reviews,
      (SELECT COUNT(*) FROM SkuDailyBusinessMetrics) metric_rows,
      (SELECT COUNT(*) FROM PromotionTemplates WHERE is_active=1 AND is_archived=0) templates,
      (SELECT COUNT(*) FROM Promotions WHERE is_archived=0) promotions,
      (SELECT COUNT(*) FROM PromotionCodes WHERE is_active=1) promotion_codes
  `)).recordset[0];
  await pool.close();

  console.table({ ...summary, catalog_fingerprint: fingerprint(catalogRows) });
  console.log("Fingerprint chỉ bao gồm cấu trúc catalog/SKU, không bao gồm mật khẩu hoặc dữ liệu khách hàng.");
  console.log("Chạy `npm run db:verify-demo` để kiểm tra đầy đủ hợp đồng dữ liệu dùng chung.");
} catch (error) {
  console.error("[Database status] FAILED:", error.message);
  process.exitCode = 1;
}
