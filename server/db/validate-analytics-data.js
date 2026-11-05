import { connectDB, getPool } from "../config/db.js";

await connectDB();
const pool = getPool();
try {
  const result = await pool.request().query(`
    SELECT COUNT(*) orders,
      SUM(CASE WHEN order_status='delivered' THEN 1 ELSE 0 END) delivered,
      SUM(CASE WHEN order_status='cancelled' THEN 1 ELSE 0 END) cancelled,
      SUM(CASE WHEN order_status NOT IN ('delivered','cancelled') THEN 1 ELSE 0 END) in_progress,
      SUM(CASE WHEN promotion_code IS NOT NULL THEN 1 ELSE 0 END) discounted,
      SUM(CASE WHEN recognized_at IS NOT NULL THEN total_amount ELSE 0 END) recognized_revenue
    FROM Orders WHERE data_origin='simulated';

    SELECT payment_method,COUNT(*) orders
    FROM Payments p JOIN Orders o ON o.id=p.order_id
    WHERE o.data_origin='simulated' GROUP BY payment_method;

    SELECT FORMAT(recognized_at,'yyyy-MM') month,COUNT(*) orders,SUM(total_amount) revenue
    FROM Orders WHERE data_origin='simulated' AND recognized_at IS NOT NULL
    GROUP BY FORMAT(recognized_at,'yyyy-MM') ORDER BY month;

    SELECT SUM(net_merchandise_revenue) revenue,SUM(cost_of_goods_sold) cogs,SUM(gross_profit) profit,
      CAST(SUM(gross_profit)*100.0/NULLIF(SUM(net_merchandise_revenue),0) AS DECIMAL(6,2)) margin
    FROM SkuDailyBusinessMetrics WHERE metric_date>=DATEADD(day,-89,CONVERT(date,GETDATE()));

    SELECT COUNT(*) reviews,MIN(created_at) first_review,MAX(created_at) last_review
    FROM ProductReviews WHERE order_id LIKE 'SIM-BI-%';
  `);
  console.log(JSON.stringify({orders:result.recordsets[0][0],payments:result.recordsets[1],months:result.recordsets[2],metrics:result.recordsets[3][0],reviews:result.recordsets[4][0]},null,2));
} finally {
  await pool.close();
}
