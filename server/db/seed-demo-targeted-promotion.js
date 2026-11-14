import sql from "mssql";
import { connectDB, getPool } from "../config/db.js";

const PROMOTION_SLUG = "customer-welcome-test-15";
const PROMOTION_CODE = "RUEVIP15";
// This is the documented customer account shown on the login screen, so every
// developer can reproduce the customer-side test after running the seed.
const PREFERRED_CUSTOMER_EMAIL = "vudat9532@gmail.com";
const PREFERRED_CUSTOMER_ID = "usr_cust_01";

await connectDB();
const pool = getPool();
const transaction = new sql.Transaction(pool);

try {
  await transaction.begin();
  const request = () => new sql.Request(transaction);
  const customer = (await request()
    .input("email", sql.NVarChar, PREFERRED_CUSTOMER_EMAIL)
    .input("preferred_id", sql.NVarChar, PREFERRED_CUSTOMER_ID)
    .query(`
    SELECT TOP 1 id,email FROM Users
    WHERE role='customer' AND is_active=1
    ORDER BY CASE WHEN id=@preferred_id THEN 0
                  WHEN LOWER(email)=LOWER(@email) THEN 1
                  WHEN email NOT LIKE '%@maisonrue.local' THEN 2 ELSE 3 END,
             created_at DESC
  `)).recordset[0];
  if (!customer) throw new Error("Database chưa có tài khoản khách hàng đang hoạt động để nhận mã thử nghiệm.");

  const existingPromotion = (await request().input("slug", sql.NVarChar, PROMOTION_SLUG).query(`
    SELECT TOP 1 id FROM Promotions WHERE slug=@slug AND is_archived=0 ORDER BY id DESC
  `)).recordset[0];
  let promotionId = existingPromotion?.id;
  const campaignRequest = request()
    .input("name", sql.NVarChar, "Ưu đãi riêng dành cho khách hàng thử nghiệm")
    .input("description", sql.NVarChar, `Mã thử nghiệm được gán riêng cho ${customer.email} để kiểm tra toàn bộ luồng khách hàng.`)
    .input("slug", sql.NVarChar, PROMOTION_SLUG)
    .input("actor", sql.NVarChar, "system_demo_seed");

  if (promotionId) {
    await campaignRequest.input("id", sql.Int, promotionId).query(`
      UPDATE Promotions SET name=@name,description=@description,discount_type='percentage',discount_value=15,
        maximum_discount=500000,minimum_order_value=2000000,is_automatic=0,stacking_policy='none',priority=30,
        customer_requirement='authenticated',usage_limit_total=20,usage_limit_per_customer=1,
        start_at=DATEADD(hour,-1,SYSUTCDATETIME()),end_at=DATEADD(day,14,SYSUTCDATETIME()),status='active',
        business_goal='customer_retention',budget_total=10000000,max_discount_per_order=500000,
        campaign_type='customer_care',is_public=0,public_title=@name,
        public_description=N'Giảm 15% tối đa 500.000đ cho đơn từ 2.000.000đ.',max_effective_discount=15,
        approval_status='approved',approved_by=@actor,approved_at=SYSUTCDATETIME(),updated_by=@actor,updated_at=SYSUTCDATETIME()
      WHERE id=@id;
    `);
  } else {
    const inserted = await campaignRequest.query(`
      INSERT INTO Promotions(name,description,discount_type,discount_value,maximum_discount,minimum_order_value,
        is_automatic,stacking_policy,priority,customer_requirement,usage_limit_total,usage_limit_per_customer,
        start_at,end_at,status,business_goal,budget_total,max_discount_per_order,slug,campaign_type,is_public,
        public_title,public_description,max_effective_discount,approval_status,approved_by,approved_at,created_by,updated_by)
      OUTPUT INSERTED.id
      VALUES(@name,@description,'percentage',15,500000,2000000,0,'none',30,'authenticated',20,1,
        DATEADD(hour,-1,SYSUTCDATETIME()),DATEADD(day,14,SYSUTCDATETIME()),'active','customer_retention',10000000,500000,
        @slug,'customer_care',0,@name,N'Giảm 15% tối đa 500.000đ cho đơn từ 2.000.000đ.',15,
        'approved',@actor,SYSUTCDATETIME(),@actor,@actor);
    `);
    promotionId = inserted.recordset[0].id;
  }

  const target = await request().input("promotion", sql.Int, promotionId).query(`
    SELECT TOP 1 id FROM PromotionTargets
    WHERE promotion_id=@promotion AND target_type='store' AND target_value='all' AND is_excluded=0
  `);
  if (!target.recordset.length) {
    await request().input("promotion", sql.Int, promotionId).query(`
      INSERT INTO PromotionTargets(promotion_id,target_type,target_value,is_excluded,selection_source,approved_discount,selection_reason)
      VALUES(@promotion,'store','all',0,'admin',15,N'Mã chăm sóc khách hàng thử nghiệm áp dụng toàn bộ sản phẩm đủ điều kiện.');
    `);
  }

  const existingCode = (await request().input("code", sql.NVarChar, PROMOTION_CODE).query(`
    SELECT TOP 1 id,promotion_id FROM PromotionCodes WHERE normalized_code=UPPER(@code)
  `)).recordset[0];
  if (existingCode && Number(existingCode.promotion_id) !== Number(promotionId)) throw new Error(`Mã ${PROMOTION_CODE} đang thuộc một chương trình khác.`);
  let codeId = existingCode?.id;
  if (codeId) {
    await request().input("id", sql.Int, codeId).query(`
      UPDATE PromotionCodes SET usage_limit=1,is_active=1,distribution_type='targeted',
        display_description=N'Giảm 15% tối đa 500.000đ cho đơn từ 2.000.000đ.',updated_at=SYSUTCDATETIME() WHERE id=@id;
    `);
  } else {
    codeId = (await request().input("promotion", sql.Int, promotionId).input("code", sql.NVarChar, PROMOTION_CODE).query(`
      INSERT INTO PromotionCodes(promotion_id,code,usage_limit,is_active,distribution_type,display_description)
      OUTPUT INSERTED.id VALUES(@promotion,@code,1,1,'targeted',N'Giảm 15% tối đa 500.000đ cho đơn từ 2.000.000đ.');
    `)).recordset[0].id;
  }

  // Keep this demo voucher genuinely personal. Old, unused assignments from a
  // previous seed target must not silently turn it into a multi-customer code.
  await request().input("code", sql.Int, codeId).input("user", sql.NVarChar, customer.id).query(`
    DELETE FROM PromotionCodeAssignments
    WHERE promotion_code_id=@code AND user_id<>@user AND status='available';
  `);

  const assignment = (await request().input("code", sql.Int, codeId).input("user", sql.NVarChar, customer.id).query(`
    SELECT TOP 1 id,status FROM PromotionCodeAssignments WHERE promotion_code_id=@code AND user_id=@user
  `)).recordset[0];
  if (!assignment) {
    await request().input("code", sql.Int, codeId).input("user", sql.NVarChar, customer.id).query(`
      INSERT INTO PromotionCodeAssignments(promotion_code_id,user_id,status,assigned_by)
      VALUES(@code,@user,'available','system_demo_seed');
    `);
  } else if (assignment.status !== "used") {
    await request().input("id", sql.BigInt, assignment.id).query("UPDATE PromotionCodeAssignments SET status='available',viewed_at=NULL,used_at=NULL WHERE id=@id");
  }

  await transaction.commit();
  console.log(`Đã tạo mã riêng ${PROMOTION_CODE} cho ${customer.email} (${customer.id}).`);
} catch (error) {
  if (transaction._aborted !== true) await transaction.rollback();
  console.error("Không thể tạo mã ưu đãi thử nghiệm:", error.message);
  process.exitCode = 1;
} finally {
  await pool.close();
}
