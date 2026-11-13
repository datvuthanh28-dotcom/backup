import sql from "mssql";
import { connectDB, getPool } from "../config/db.js";

// A small, deterministic campaign that makes a fresh Maison Rue database
// demonstrably complete. It is intentionally separate from any campaign an
// administrator creates in the UI, and can safely be re-run after every pull.
const CANONICAL_SLUG = "maison-rue-seasonal-edit";
const CANONICAL_CODE = "RUE10";
const CAMPAIGN_NAME = "Maison Rue Seasonal Edit — Ưu đãi 10%";

await connectDB();
const pool = getPool();
const transaction = new sql.Transaction(pool);

try {
  await transaction.begin();
  const request = () => new sql.Request(transaction);

  const targetRows = (await request().query(`
    SELECT TOP 8 v.id
    FROM ProductVariants v
    JOIN Products p ON p.id=v.product_id
    WHERE v.is_active=1 AND p.is_active=1
      AND TRY_CONVERT(INT, RIGHT(LTRIM(RTRIM(p.product_code)),
          PATINDEX('%[^0-9]%', REVERSE(LTRIM(RTRIM(p.product_code))) + 'X') - 1)) > 105
      AND v.stock_quantity > v.low_stock_threshold
      AND v.cost_price IS NOT NULL AND v.floor_price IS NOT NULL
    ORDER BY p.id, v.id
  `)).recordset;

  if (!targetRows.length) {
    throw new Error("Không có SKU hiện hành đủ điều kiện để tạo chiến dịch demo chuẩn.");
  }

  const template = (await request().query(`
    SELECT TOP 1 id FROM PromotionTemplates
    WHERE campaign_type='clearance' AND is_active=1 AND is_archived=0
    ORDER BY id
  `)).recordset[0];

  const existing = (await request().input("slug", sql.NVarChar, CANONICAL_SLUG).query(`
    SELECT TOP 1 id FROM Promotions WHERE slug=@slug AND is_archived=0 ORDER BY id
  `)).recordset[0];

  let promotionId = existing?.id;
  const campaignRequest = request()
    .input("name", sql.NVarChar, CAMPAIGN_NAME)
    .input("description", sql.NVarChar, "Ưu đãi mẫu được đồng bộ cùng dữ liệu demo Maison Rue.")
    .input("slug", sql.NVarChar, CANONICAL_SLUG)
    .input("template", sql.Int, template?.id || null)
    .input("actor", sql.NVarChar, "system_demo_seed");

  if (promotionId) {
    await campaignRequest.input("id", sql.Int, promotionId).query(`
      UPDATE Promotions SET name=@name,description=@description,discount_type='percentage',discount_value=10,
        maximum_discount=800000,minimum_order_value=0,is_automatic=1,stacking_policy='none',priority=20,
        customer_requirement='any',usage_limit_total=100,usage_limit_per_customer=1,
        start_at=DATEADD(day,-1,GETDATE()),end_at=DATEADD(day,30,GETDATE()),status='active',
        business_goal='inventory_clearance',budget_total=8000000,max_discount_per_order=800000,
        template_id=@template,campaign_type='clearance',is_public=1,public_title=@name,
        public_description=N'Ưu đãi 10% trên những SKU được tuyển chọn.',max_effective_discount=10,
        approval_status='approved',approved_by=@actor,approved_at=GETDATE(),updated_by=@actor,updated_at=GETDATE()
      WHERE id=@id;
    `);
  } else {
    const inserted = await campaignRequest.query(`
      INSERT INTO Promotions(name,description,discount_type,discount_value,maximum_discount,minimum_order_value,
        is_automatic,stacking_policy,priority,customer_requirement,usage_limit_total,usage_limit_per_customer,
        start_at,end_at,status,business_goal,budget_total,max_discount_per_order,template_id,slug,campaign_type,
        is_public,public_title,public_description,max_effective_discount,approval_status,approved_by,approved_at,
        created_by,updated_by)
      OUTPUT INSERTED.id
      VALUES(@name,@description,'percentage',10,800000,0,1,'none',20,'any',100,1,
        DATEADD(day,-1,GETDATE()),DATEADD(day,30,GETDATE()),'active','inventory_clearance',8000000,800000,@template,@slug,
        'clearance',1,@name,N'Ưu đãi 10% trên những SKU được tuyển chọn.',10,'approved',@actor,GETDATE(),@actor,@actor);
    `);
    promotionId = inserted.recordset[0].id;
  }

  await request().input("promotion", sql.Int, promotionId).query(`
    DELETE FROM PromotionSkuReservations WHERE promotion_id=@promotion;
    DELETE FROM PromotionTargets WHERE promotion_id=@promotion;
  `);
  for (const [index, row] of targetRows.entries()) {
    await request().input("promotion", sql.Int, promotionId).input("variant", sql.NVarChar, row.id).input("score", sql.Decimal(5, 2), 70 + index).query(`
      INSERT INTO PromotionTargets(promotion_id,target_type,target_value,is_excluded,selection_source,fit_score,need_score,suggested_discount,approved_discount,selection_reason)
      VALUES(@promotion,'variant',@variant,0,'system',@score,@score,10,10,N'SKU mẫu đủ tồn, có giá vốn và còn dư địa giảm giá.');
    `);
  }

  const code = (await request().input("code", sql.NVarChar, CANONICAL_CODE).query(`
    SELECT TOP 1 id,promotion_id FROM PromotionCodes WHERE normalized_code=UPPER(@code)
  `)).recordset[0];
  if (code && Number(code.promotion_id) !== Number(promotionId)) {
    throw new Error(`Mã ${CANONICAL_CODE} đang thuộc chương trình khác; không tự động ghi đè dữ liệu quản trị.`);
  }
  if (code) {
    await request().input("id", sql.Int, code.id).query(`
      UPDATE PromotionCodes SET usage_limit=100,is_active=1,distribution_type='public',
        display_description=N'Giảm 10% tối đa 800.000đ cho các SKU được chọn.',updated_at=GETDATE() WHERE id=@id;
    `);
  } else {
    await request().input("promotion", sql.Int, promotionId).input("code", sql.NVarChar, CANONICAL_CODE).query(`
      INSERT INTO PromotionCodes(promotion_id,code,usage_limit,is_active,distribution_type,display_description)
      VALUES(@promotion,@code,100,1,'public',N'Giảm 10% tối đa 800.000đ cho các SKU được chọn.');
    `);
  }

  await transaction.commit();
  console.log(`Đã đồng bộ chiến dịch demo: ${CAMPAIGN_NAME} (${targetRows.length} SKU, mã ${CANONICAL_CODE}).`);
} catch (error) {
  if (transaction._aborted !== true) await transaction.rollback();
  console.error("Không thể đồng bộ chiến dịch demo chuẩn:", error.message);
  process.exitCode = 1;
} finally {
  await pool.close();
}
