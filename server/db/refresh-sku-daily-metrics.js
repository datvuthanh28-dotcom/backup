import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { connectDB, getPool } from "../config/db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DAYS = Math.max(30, Math.min(730, Number(process.argv[2] || 180)));

await connectDB();
const pool = getPool();

try {
  const migration = fs.readFileSync(path.join(__dirname, "migrations", "013_sku_daily_business_metrics.sql"), "utf8");
  for (const batch of migration.split(/^\s*GO\s*$/gim).map((value) => value.trim()).filter(Boolean)) {
    await pool.request().query(batch);
  }

  const result = await pool.request().input("days", DAYS).query(`
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    BEGIN TRANSACTION;

    DELETE FROM SkuDailyBusinessMetrics
    WHERE metric_date >= DATEADD(day, 1-@days, CONVERT(date, GETDATE()));

    ;WITH dates AS (
      SELECT DATEADD(day, 1-@days, CONVERT(date, GETDATE())) metric_date
      UNION ALL
      SELECT DATEADD(day, 1, metric_date) FROM dates WHERE metric_date < CONVERT(date, GETDATE())
    ), variant_base AS (
      SELECT v.id variant_id, v.product_id, p.product_code, v.sku,
             p.name product_name, p.gender audience, p.category, CAST(NULL AS NVARCHAR(100)) subcategory,
             v.color_name, v.size_name, v.price list_price, v.cost_price, v.floor_price,
             v.stock_quantity, v.low_stock_threshold, v.max_stock_threshold,
             ROW_NUMBER() OVER (PARTITION BY v.product_id ORDER BY v.id) product_variant_rank,
             COUNT(*) OVER (PARTITION BY v.product_id) product_variant_count
      FROM ProductVariants v
      JOIN Products p ON p.id=v.product_id
      WHERE v.is_active=1 AND p.is_active=1
    ), base AS (
      SELECT d.metric_date,v.* FROM dates d CROSS JOIN variant_base v
    ), recognized AS (
      SELECT CONVERT(date,o.recognized_at) metric_date,
             COALESCE(oi.variant_id, v.id) variant_id,
             COUNT(DISTINCT o.id) orders_recognized,
             COUNT(DISTINCT o.customer_id) distinct_customers,
             SUM(oi.quantity) units_sold,
             SUM(COALESCE(oi.original_unit_price,oi.unit_price)*oi.quantity) gross_value,
             SUM(COALESCE(oi.original_unit_price,oi.unit_price)*oi.quantity-COALESCE(oi.final_line_total,oi.total_price)) discount_value,
             SUM(COALESCE(oi.final_line_total,oi.total_price)) net_revenue,
             SUM(COALESCE(oi.unit_cost_snapshot,v.cost_price,0)*oi.quantity) cogs,
             SUM(CASE WHEN COALESCE(oi.unit_cost_snapshot,v.cost_price) IS NULL THEN 1 ELSE 0 END) missing_cost,
             SUM(CASE WHEN COALESCE(o.product_discount_total,0)+COALESCE(o.code_discount_total,0)>0 THEN 1 ELSE 0 END) promotion_units,
             COUNT(DISTINCT CASE WHEN COALESCE(o.product_discount_total,0)+COALESCE(o.code_discount_total,0)>0 THEN o.id END) promotion_orders,
             SUM(CASE WHEN COALESCE(o.product_discount_total,0)+COALESCE(o.code_discount_total,0)>0
                      THEN COALESCE(oi.original_unit_price,oi.unit_price)*oi.quantity-COALESCE(oi.final_line_total,oi.total_price) ELSE 0 END) promotion_discount,
             SUM(CASE WHEN COALESCE(o.product_discount_total,0)+COALESCE(o.code_discount_total,0)>0
                      THEN COALESCE(oi.final_line_total,oi.total_price) ELSE 0 END) promotion_revenue
      FROM Orders o
      JOIN OrderItems oi ON oi.order_id=o.id
      LEFT JOIN ProductVariants v ON v.id=oi.variant_id OR (oi.variant_id IS NULL AND v.sku=oi.variant_sku)
      WHERE o.recognized_at >= DATEADD(day,1-@days,CONVERT(date,GETDATE()))
      GROUP BY CONVERT(date,o.recognized_at), COALESCE(oi.variant_id,v.id)
    ), created AS (
      SELECT CONVERT(date,o.created_at) metric_date, COALESCE(oi.variant_id,v.id) variant_id,
             COUNT(DISTINCT o.id) orders_created, SUM(oi.quantity) units_ordered,
             SUM(CASE WHEN o.order_status='cancelled' THEN oi.quantity ELSE 0 END) units_cancelled
      FROM Orders o JOIN OrderItems oi ON oi.order_id=o.id
      LEFT JOIN ProductVariants v ON v.id=oi.variant_id OR (oi.variant_id IS NULL AND v.sku=oi.variant_sku)
      WHERE o.created_at >= DATEADD(day,1-@days,CONVERT(date,GETDATE()))
      GROUP BY CONVERT(date,o.created_at), COALESCE(oi.variant_id,v.id)
    ), movements AS (
      SELECT CONVERT(date,created_at) metric_date, variant_id,
             SUM(CASE WHEN quantity_change>0 THEN quantity_change ELSE 0 END) stock_received,
             SUM(CASE WHEN movement_type IN ('manual_adjustment','threshold_adjustment') THEN quantity_change ELSE 0 END) stock_adjusted
      FROM InventoryMovements
      WHERE variant_id IS NOT NULL AND created_at >= DATEADD(day,1-@days,CONVERT(date,GETDATE()))
      GROUP BY CONVERT(date,created_at),variant_id
    ), favorite_daily AS (
      SELECT CONVERT(date,e.created_at) metric_date,e.product_id,
             SUM(CASE WHEN e.event_type='added' THEN 1 ELSE 0 END) adds,
             SUM(CASE WHEN e.event_type='removed' THEN 1 ELSE 0 END) removes
      FROM ProductFavoriteEvents e
      WHERE e.created_at >= DATEADD(day,1-@days,CONVERT(date,GETDATE()))
      GROUP BY CONVERT(date,e.created_at),e.product_id
    ), favorite_active AS (
      SELECT product_id,COUNT(*) active_count FROM ProductFavorites WHERE is_active=1 GROUP BY product_id
    ), review_daily AS (
      SELECT CONVERT(date,r.created_at) metric_date,r.product_id,COUNT(*) reviews_created,SUM(CONVERT(int,r.rating)) rating_sum
      FROM ProductReviews r
      WHERE r.status='published' AND r.created_at >= DATEADD(day,1-@days,CONVERT(date,GETDATE()))
      GROUP BY CONVERT(date,r.created_at),r.product_id
    )
    INSERT INTO SkuDailyBusinessMetrics (
      metric_date,variant_id,product_id,product_code,sku,product_name,audience,category,subcategory,color_name,size_name,
      list_price,cost_price,floor_price,opening_stock,closing_stock,min_stock,max_stock,stock_received,stock_adjusted,
      orders_created,orders_recognized,distinct_customers,units_ordered,units_sold,units_cancelled,
      gross_merchandise_value,product_discount,net_merchandise_revenue,cost_of_goods_sold,gross_profit,
      product_views,add_to_cart_events,checkout_started_events,favorite_adds,favorite_removes,active_favorites_allocated,
      reviews_created,rating_sum,promotion_orders,promotion_units,promotion_discount,promotion_revenue,
      data_source,contains_synthetic_funnel,financial_data_complete,inventory_data_complete,generated_at
    )
    SELECT b.metric_date,b.variant_id,b.product_id,b.product_code,b.sku,b.product_name,b.audience,b.category,b.subcategory,b.color_name,b.size_name,
      b.list_price,b.cost_price,b.floor_price,
      CASE WHEN b.metric_date=CONVERT(date,GETDATE()) THEN b.stock_quantity ELSE NULL END,
      CASE WHEN b.metric_date=CONVERT(date,GETDATE()) THEN b.stock_quantity ELSE NULL END,
      b.low_stock_threshold,b.max_stock_threshold,COALESCE(m.stock_received,0),COALESCE(m.stock_adjusted,0),
      COALESCE(c.orders_created,0),COALESCE(r.orders_recognized,0),COALESCE(r.distinct_customers,0),
      COALESCE(c.units_ordered,0),COALESCE(r.units_sold,0),COALESCE(c.units_cancelled,0),
      COALESCE(r.gross_value,0),COALESCE(r.discount_value,0),COALESCE(r.net_revenue,0),COALESCE(r.cogs,0),
      COALESCE(r.net_revenue-r.cogs,0),
      -- Deterministic, non-financial funnel estimates. Actual sales and favorites influence the baseline.
      8 + ABS(CHECKSUM(b.metric_date,b.variant_id))%35 + COALESCE(c.units_ordered,0)*18
        + CASE WHEN COALESCE(fd.adds,0)>0 THEN 12 ELSE 0 END,
      1 + ABS(CHECKSUM('cart',b.metric_date,b.variant_id))%5 + COALESCE(c.units_ordered,0)*2,
      CASE WHEN 1 + ABS(CHECKSUM('checkout',b.metric_date,b.variant_id))%3 + COALESCE(c.orders_created,0)
                > 1 + ABS(CHECKSUM('cart',b.metric_date,b.variant_id))%5 + COALESCE(c.units_ordered,0)*2
           THEN 1 + ABS(CHECKSUM('cart',b.metric_date,b.variant_id))%5 + COALESCE(c.units_ordered,0)*2
           ELSE 1 + ABS(CHECKSUM('checkout',b.metric_date,b.variant_id))%3 + COALESCE(c.orders_created,0) END,
      CASE WHEN b.product_variant_rank <= COALESCE(fd.adds,0)%NULLIF(b.product_variant_count,0) THEN CEILING(COALESCE(fd.adds,0)*1.0/b.product_variant_count)
           ELSE FLOOR(COALESCE(fd.adds,0)*1.0/b.product_variant_count) END,
      CASE WHEN b.product_variant_rank <= COALESCE(fd.removes,0)%NULLIF(b.product_variant_count,0) THEN CEILING(COALESCE(fd.removes,0)*1.0/b.product_variant_count)
           ELSE FLOOR(COALESCE(fd.removes,0)*1.0/b.product_variant_count) END,
      CASE WHEN b.metric_date=CONVERT(date,GETDATE())
           THEN FLOOR(COALESCE(fa.active_count,0)*1.0/b.product_variant_count)
                + CASE WHEN b.product_variant_rank<=COALESCE(fa.active_count,0)%b.product_variant_count THEN 1 ELSE 0 END ELSE 0 END,
      CASE WHEN b.product_variant_rank <= COALESCE(rv.reviews_created,0)%NULLIF(b.product_variant_count,0) THEN CEILING(COALESCE(rv.reviews_created,0)*1.0/b.product_variant_count)
           ELSE FLOOR(COALESCE(rv.reviews_created,0)*1.0/b.product_variant_count) END,
      CASE WHEN COALESCE(rv.reviews_created,0)=0 THEN 0 ELSE ROUND(COALESCE(rv.rating_sum,0)*1.0/b.product_variant_count,0) END,
      COALESCE(r.promotion_orders,0),COALESCE(r.promotion_units,0),COALESCE(r.promotion_discount,0),COALESCE(r.promotion_revenue,0),
      'mixed',1,CASE WHEN COALESCE(r.missing_cost,0)=0 THEN 1 ELSE 0 END,
      CASE WHEN b.metric_date=CONVERT(date,GETDATE()) THEN 1 ELSE 0 END,GETDATE()
    FROM base b
    LEFT JOIN recognized r ON r.metric_date=b.metric_date AND r.variant_id=b.variant_id
    LEFT JOIN created c ON c.metric_date=b.metric_date AND c.variant_id=b.variant_id
    LEFT JOIN movements m ON m.metric_date=b.metric_date AND m.variant_id=b.variant_id
    LEFT JOIN favorite_daily fd ON fd.metric_date=b.metric_date AND fd.product_id=b.product_id
    LEFT JOIN favorite_active fa ON fa.product_id=b.product_id
    LEFT JOIN review_daily rv ON rv.metric_date=b.metric_date AND rv.product_id=b.product_id
    OPTION (MAXRECURSION 0);

    COMMIT TRANSACTION;

    SELECT COUNT(*) rows_created,
           COUNT(DISTINCT variant_id) sku_count,
           MIN(metric_date) date_from,MAX(metric_date) date_to,
           SUM(net_merchandise_revenue) net_revenue,
           SUM(cost_of_goods_sold) cogs,SUM(gross_profit) gross_profit,
           SUM(product_views) product_views,SUM(add_to_cart_events) cart_events,
           SUM(checkout_started_events) checkout_events,
           SUM(favorite_adds) favorite_adds,SUM(reviews_created) reviews_created,
           SUM(CASE WHEN financial_data_complete=0 THEN 1 ELSE 0 END) incomplete_financial_rows
    FROM SkuDailyBusinessMetrics
    WHERE metric_date >= DATEADD(day,1-@days,CONVERT(date,GETDATE()));
  `);

  console.table(result.recordset);
  console.log(`Đã làm mới kho dữ liệu phân tích ${DAYS} ngày. Dữ liệu tài chính giữ nguyên từ đơn hàng; phễu hành vi được gắn nhãn mô phỏng.`);
} finally {
  await pool.close();
}

