import process from "node:process";
import { connectDB, getPool } from "../server/config/db.js";
import { allProducts } from "../src/data/products.js";

try {
  await connectDB();
  const pool = getPool();
  const expectedProducts = allProducts.length;
  const expectedSkus = allProducts.reduce((total, product) => total + product.variants.length, 0);
  const summary = (await pool.request().query(`
    SELECT
      (SELECT COUNT(*) FROM Products WHERE is_active=1) AS products,
      (SELECT COUNT(*) FROM ProductVariants WHERE is_active=1) AS skus,
      (SELECT COUNT(*) FROM Products
        WHERE is_active=1
          AND product_code LIKE 'MR-%'
          AND TRY_CONVERT(INT, SUBSTRING(product_code, 4, 10)) <= 105) AS active_legacy_products,
      (SELECT COUNT(*) FROM ProductVariants v
        JOIN Products p ON p.id=v.product_id
        WHERE v.is_active=1 AND p.is_active=1
          AND (v.cost_price IS NULL OR v.floor_price IS NULL)) AS skus_missing_costs,
      (SELECT COUNT(*) FROM Products
        WHERE is_active=1 AND (images_json IS NULL OR images_json=N'[]')) AS products_missing_images,
      (SELECT COUNT(*) FROM Orders) AS orders,
      (SELECT COUNT(*) FROM Orders WHERE data_origin='simulated') AS simulated_orders,
      (SELECT COUNT(*) FROM ProductFavorites WHERE is_active=1) AS favorites,
      (SELECT COUNT(*) FROM ProductReviews WHERE status='published') AS published_reviews,
      (SELECT COUNT(*) FROM SkuDailyBusinessMetrics) AS metric_rows,
      (SELECT COUNT(*) FROM PromotionTemplates WHERE is_active=1 AND is_archived=0) AS templates,
      (SELECT COUNT(*) FROM Promotions WHERE is_archived=0) AS promotions,
      (SELECT COUNT(*) FROM PromotionCodes WHERE is_active=1) AS codes,
      (SELECT COUNT(*) FROM Promotions WHERE slug='maison-rue-seasonal-edit' AND is_archived=0) AS canonical_promotions,
      (SELECT COUNT(*) FROM PromotionCodes WHERE normalized_code='RUE10' AND is_active=1) AS canonical_codes
  `)).recordset[0];
  await pool.close();

  const checks = [
    [`đủ ${expectedProducts} sản phẩm hiện hành`, Number(summary.products) === expectedProducts],
    [`đủ ${expectedSkus} SKU hiện hành`, Number(summary.skus) === expectedSkus],
    ["không kích hoạt sản phẩm MR-001 đến MR-105", Number(summary.active_legacy_products) === 0],
    ["mọi SKU có giá vốn và giá sàn", Number(summary.skus_missing_costs) === 0],
    ["mọi sản phẩm có ảnh", Number(summary.products_missing_images) === 0],
    ["đơn hàng báo cáo", Number(summary.orders) > 0],
    ["đơn mô phỏng phục vụ báo cáo", Number(summary.simulated_orders) > 0],
    ["dữ liệu yêu thích", Number(summary.favorites) > 0],
    ["dữ liệu đánh giá", Number(summary.published_reviews) > 0],
    ["dòng chỉ số SKU", Number(summary.metric_rows) > 0],
    ["mẫu đợt sale", Number(summary.templates) >= 5],
    ["chương trình khuyến mãi", Number(summary.promotions) > 0],
    ["mã ưu đãi", Number(summary.codes) > 0],
    ["chương trình canonical", Number(summary.canonical_promotions) === 1],
    ["mã RUE10 canonical", Number(summary.canonical_codes) === 1],
  ];
  console.table(summary);
  const failed = checks.filter(([, passed]) => !passed).map(([name]) => name);
  if (failed.length) {
    throw new Error(`Dữ liệu demo chưa đầy đủ: ${failed.join(", ")}. Chạy npm run setup (máy mới) hoặc npm run db:reset-demo (môi trường demo đã lệch).`);
  }
  console.log("[Demo dataset] OK — catalog, SKU, tồn kho, báo cáo, tương tác và khuyến mãi đã đồng bộ.");
} catch (error) {
  console.error("[Demo dataset] FAILED:", error.message);
  process.exitCode = 1;
}
