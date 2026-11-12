import sql from "mssql";
import { db, getPool } from "../config/db.js";
import { calculatePromotions, normalizeCode } from "../services/promotionService.js";
import { activeProductSql } from "../utils/productLifecycle.js";
import { normalizeRecipients, sendPromotionCampaignEmail } from "../services/emailService.js";

const effectiveStatus = (row) => row.is_archived ? "archived" : row.requires_reapproval ? "needs_review" : row.status === "paused" ? "paused" : row.status === "draft" ? "draft" : new Date(row.start_at) > new Date() ? "scheduled" : row.end_at && new Date(row.end_at) <= new Date() ? "expired" : (row.usage_limit_total && row.used_count >= row.usage_limit_total) || (row.budget_total && Number(row.budget_reserved) + Number(row.budget_spent) >= Number(row.budget_total)) ? "exhausted" : "active";
const slugify = (value) => String(value || "sale").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 150);

const promotionDiscount = (body, price) => body.discountType === "percentage"
  ? Math.floor(price * Number(body.discountValue || 0) / 100)
  : body.discountType === "fixed_amount" ? Math.min(price, Number(body.discountValue || 0)) : 0;

const validatePromotion = (body) => {
  const errors = [];
  const maxEffectiveDiscount = Number(body.maxEffectiveDiscount || 25);
  if (!String(body.name || "").trim()) errors.push("Tên chương trình là bắt buộc.");
  if (!['percentage','fixed_amount','free_shipping','shipping_amount'].includes(body.discountType)) errors.push("Loại ưu đãi không hợp lệ.");
  if (Number(body.discountValue || 0) < 0 || (body.discountType === 'percentage' && Number(body.discountValue) > 100)) errors.push("Giá trị ưu đãi không hợp lệ.");
  if (!body.startAt || Number.isNaN(new Date(body.startAt).getTime())) errors.push("Thời gian bắt đầu không hợp lệ.");
  if (body.endAt && new Date(body.endAt) <= new Date(body.startAt)) errors.push("Thời gian kết thúc phải sau thời gian bắt đầu.");
  if (body.budgetTotal && Number(body.budgetTotal) <= 0) errors.push("Ngân sách phải lớn hơn 0.");
  if (body.status === 'active' && body.approvalStatus !== 'approved') errors.push("Chương trình phải được phê duyệt trước khi kích hoạt.");
  if (maxEffectiveDiscount <= 0 || maxEffectiveDiscount > 35) errors.push("Tổng mức giảm hiệu dụng phải từ 1% đến tối đa 35%.");
  if (body.discountType === 'percentage' && Number(body.discountValue || 0) > maxEffectiveDiscount) errors.push("Mức giảm của chương trình đang vượt trần giảm hiệu dụng đã chọn.");
  if (maxEffectiveDiscount > 25 && !String(body.deepDiscountReasonCode || '').trim()) errors.push("Giảm sâu trên 25% cần chọn lý do.");
  if (maxEffectiveDiscount > 25 && body.deepDiscountReasonCode === 'other' && !String(body.deepDiscountReasonNote || '').trim()) errors.push("Lý do khác cần có mô tả chi tiết.");
  return errors;
};

export async function previewPromotion(req, res) {
  try {
    const items = [];
    for (const raw of req.body.items || []) {
      const product = await (await import("../config/db.js")).db.getProductById(raw.id);
      if (!product) throw new Error("Một sản phẩm trong giỏ không còn tồn tại.");
      const variant = raw.variantId ? product.variants.find((entry) => entry.id === raw.variantId) : null;
      items.push({ ...raw, price: Number(variant?.price ?? product.price), floorPrice: Number(variant?.floorPrice || 0), stock: variant?.stock, lowStockThreshold: variant?.lowStockThreshold, quantity: Math.max(1, Number(raw.quantity) || 1), category: product.category, productType: product.productType, subcategory: product.subcategory, audience: product.audience, gender: product.gender, variantId: variant?.id || raw.variantId, variantSku: variant?.sku || raw.variantSku });
    }
    const pricing = await calculatePromotions({ items, code: req.body.code, customerId: req.user?.role === "customer" ? req.user.id : null, shippingFee: Number(req.body.shippingFee || 0) });
    return res.json({ success: true, pricing });
  } catch (error) { return res.status(400).json({ success: false, error: error.message }); }
}

export async function catalogPromotionPrices(req, res) {
  try {
    const { db } = await import("../config/db.js");
    const products = await db.getAllProducts();
    const items = products.flatMap((product) => (product.variants?.length ? product.variants : [null]).map((variant) => ({ id: product.id, price: Number(variant?.price ?? product.price), floorPrice: Number(variant?.floorPrice || 0), quantity: 1, category: product.category, productType: product.productType, subcategory: product.subcategory, audience: product.audience, gender: product.gender, variantId: variant?.id || null, variantSku: variant?.sku || null })));
    const pricing = await calculatePromotions({ items });
    const prices = pricing.items.reduce((result, item) => {
      const discountPercent = item.originalUnitPrice > 0 ? item.automaticDiscount / item.originalUnitPrice : 0;
      const current = result[item.id];
      if (!current || discountPercent > current.discountPercent) result[item.id] = { originalPrice: item.originalUnitPrice, salePrice: item.finalLineTotal, discount: item.automaticDiscount, discountPercent, promotionName: item.automaticPromotion?.name || null, variantId: item.variantId, variantSku: item.variantSku };
      return result;
    }, {});
    return res.json({ success: true, prices });
  } catch (error) { return res.status(500).json({ success: false, error: error.message }); }
}

export async function myPromotionOffers(req, res) {
  const result = await getPool().request().input("user_id", sql.NVarChar, req.user.id).query(`
    SELECT pc.id code_id,pc.code,pc.distribution_type,pc.display_description,pc.usage_limit,pc.used_count,
      p.id promotion_id,p.name,p.description,p.discount_type,p.discount_value,p.maximum_discount,
      p.minimum_order_value,p.start_at,p.end_at,p.stacking_policy,p.usage_limit_per_customer,
      a.status assignment_status,a.assigned_at,a.used_at,
      CASE WHEN EXISTS(SELECT 1 FROM PromotionUsages u WHERE u.promotion_code_id=pc.id AND u.customer_id=@user_id AND u.status='consumed') THEN 1 ELSE 0 END used_by_customer
    FROM PromotionCodes pc JOIN Promotions p ON p.id=pc.promotion_id
    LEFT JOIN PromotionCodeAssignments a ON a.promotion_code_id=pc.id AND a.user_id=@user_id
    WHERE pc.is_active=1 AND p.is_archived=0 AND p.status='active' AND p.approval_status='approved'
      AND p.start_at<=SYSUTCDATETIME() AND (p.end_at IS NULL OR p.end_at>SYSUTCDATETIME())
      AND (p.usage_limit_total IS NULL OR p.used_count<p.usage_limit_total)
      AND (pc.usage_limit IS NULL OR pc.used_count<pc.usage_limit)
      AND (pc.distribution_type='public' OR (pc.distribution_type='targeted' AND a.status IN ('available','used')))
    ORDER BY CASE WHEN pc.distribution_type='targeted' THEN 0 ELSE 1 END,p.end_at,pc.id DESC
  `);
  await getPool().request().input("user_id",sql.NVarChar,req.user.id).query("UPDATE PromotionCodeAssignments SET viewed_at=COALESCE(viewed_at,GETDATE()) WHERE user_id=@user_id AND status='available'");
  return res.json({ success:true, offers:result.recordset });
}

export async function listPromotions(req, res) {
  const pool = getPool();
  await releaseExpiredReservationHolds(pool);
  const rows = await pool.request().query(`SELECT p.*,
    (SELECT STRING_AGG(CONCAT(target_type,':',target_value),', ') FROM PromotionTargets WHERE promotion_id=p.id AND is_excluded=0) targets,
    (SELECT STRING_AGG(CONCAT(target_type,':',target_value),', ') FROM PromotionTargets WHERE promotion_id=p.id AND is_excluded=1) excluded_targets,
    (SELECT STRING_AGG(code,', ') FROM PromotionCodes WHERE promotion_id=p.id AND is_active=1) codes,
    (SELECT SUM(used_count) FROM PromotionCodes WHERE promotion_id=p.id AND is_active=1) code_used_count,
    (SELECT SUM(usage_limit) FROM PromotionCodes WHERE promotion_id=p.id AND is_active=1 AND usage_limit IS NOT NULL) code_usage_limit,
    (SELECT COUNT(*) FROM PromotionSkuReservations WHERE promotion_id=p.id AND status IN ('reserved','active','paused_hold')) reserved_sku_count,
    (SELECT MIN(hold_expires_at) FROM PromotionSkuReservations WHERE promotion_id=p.id AND status='paused_hold') reservation_hold_expires_at
    FROM Promotions p ORDER BY p.created_at DESC`);
  return res.json({ success: true, promotions: rows.recordset.map((row) => ({ ...row, effective_status: effectiveStatus(row) })) });
}

export async function listPromotionTemplates(req, res) {
  const result = await getPool().request().query("SELECT * FROM PromotionTemplates WHERE is_archived=0 ORDER BY is_active DESC,id");
  return res.json({ success: true, templates: result.recordset });
}

export async function savePromotionTemplate(req, res) {
  const body = req.body || {};
  if (!String(body.name || "").trim()) return res.status(400).json({ success: false, error: "Tên mẫu là bắt buộc." });
  const request = getPool().request()
    .input("name", sql.NVarChar, String(body.name).trim())
    .input("type", sql.NVarChar, String(body.campaignType || "custom"))
    .input("description", sql.NVarChar, body.description || null)
    .input("discount", sql.Decimal(5,2), Number(body.discountPercent || 10))
    .input("days", sql.Int, Math.max(1, Number(body.durationDays || 7)))
    .input("budget", sql.Decimal(18,0), body.defaultBudget || null)
    .input("title", sql.NVarChar, body.publicTitle || body.name)
    .input("public_description", sql.NVarChar, body.publicDescription || body.description || null)
    .input("banner", sql.NVarChar, body.bannerUrl || null);
  if (req.params.id) {
    await request.input("id", sql.Int, Number(req.params.id)).query("UPDATE PromotionTemplates SET name=@name,campaign_type=@type,description=@description,default_discount_percent=@discount,default_duration_days=@days,default_budget=@budget,public_title=@title,public_description=@public_description,banner_url=@banner,updated_at=GETDATE() WHERE id=@id AND is_archived=0");
    return res.json({ success: true });
  }
  const inserted = await request.query("INSERT INTO PromotionTemplates(name,campaign_type,description,default_discount_percent,default_duration_days,default_budget,public_title,public_description,banner_url) OUTPUT INSERTED.id VALUES(@name,@type,@description,@discount,@days,@budget,@title,@public_description,@banner)");
  return res.status(201).json({ success: true, id: inserted.recordset[0].id });
}

export async function publicCampaigns(req, res) {
  const result = await getPool().request().query(`
    SELECT p.id,p.name,p.slug,p.public_title,p.public_description,p.banner_url,p.campaign_type,
      p.discount_type,p.discount_value,p.start_at,p.end_at,p.usage_limit_total,p.used_count,
      (SELECT STRING_AGG(target_product_id,',') FROM (
        SELECT DISTINCT CASE WHEN pt.target_type='product' THEN pt.target_value WHEN pt.target_type='variant' THEN CONVERT(NVARCHAR(40),pv.product_id) END target_product_id
        FROM PromotionTargets pt LEFT JOIN ProductVariants pv ON pt.target_type='variant' AND pt.target_value IN (pv.id,pv.sku)
        WHERE pt.promotion_id=p.id AND pt.is_excluded=0
      ) campaign_products WHERE target_product_id IS NOT NULL) product_ids,
      (SELECT STRING_AGG(CASE WHEN pt.target_type='variant' THEN pt.target_value END,',') FROM PromotionTargets pt WHERE pt.promotion_id=p.id AND pt.is_excluded=0) variant_values
    FROM Promotions p
    WHERE p.is_archived=0 AND p.is_public=1 AND p.is_automatic=1 AND p.status='active' AND p.approval_status='approved'
      AND p.start_at<=SYSUTCDATETIME() AND (p.end_at IS NULL OR p.end_at>SYSUTCDATETIME())
      AND (p.usage_limit_total IS NULL OR p.used_count<p.usage_limit_total)
      AND (p.budget_total IS NULL OR p.budget_reserved+p.budget_spent<p.budget_total)
    ORDER BY p.priority DESC,p.start_at DESC
  `);
  return res.json({ success: true, campaigns: result.recordset });
}

async function persistPromotion(req, res, id = null) {
  const body = req.body;
  const validationErrors = validatePromotion(body);
  if (validationErrors.length) return res.status(400).json({ success: false, error: validationErrors.join(" ") });
  const pool = getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const request = transaction.request().input("name", sql.NVarChar, String(body.name || "").trim()).input("description", sql.NVarChar, body.description || null).input("type", sql.NVarChar, body.discountType).input("value", sql.Decimal(18,2), Number(body.discountValue || 0)).input("max", sql.Decimal(18,0), body.maximumDiscount || null).input("min", sql.Decimal(18,0), Number(body.minimumOrderValue || 0)).input("automatic", sql.Bit, body.isAutomatic ? 1 : 0).input("stacking", sql.NVarChar, body.stackingPolicy || "none").input("priority", sql.Int, Number(body.priority || 0)).input("requirement", sql.NVarChar, body.customerRequirement || "any").input("total_limit", sql.Int, body.usageLimitTotal || null).input("customer_limit", sql.Int, body.usageLimitPerCustomer || null).input("start", sql.DateTime2, new Date(body.startAt)).input("end", sql.DateTime2, body.endAt ? new Date(body.endAt) : null).input("status", sql.NVarChar, body.status || "draft").input("goal", sql.NVarChar, body.businessGoal || "revenue_growth").input("budget", sql.Decimal(18,0), body.budgetTotal || null).input("max_order", sql.Decimal(18,0), body.maxDiscountPerOrder || null).input("override", sql.Bit, body.requiresOverride ? 1 : 0).input("override_reason", sql.NVarChar, body.overrideReason || null).input("template", sql.Int, body.templateId || null).input("slug", sql.NVarChar, slugify(body.slug || body.name)).input("campaign_type", sql.NVarChar, body.campaignType || "manual").input("is_public", sql.Bit, body.isPublic === false ? 0 : 1).input("public_title", sql.NVarChar, body.publicTitle || body.name).input("public_description", sql.NVarChar, body.publicDescription || body.description || null).input("banner", sql.NVarChar, body.bannerUrl || null).input("effective_cap", sql.Decimal(5,2), Number(body.maxEffectiveDiscount || 25)).input("deep_reason", sql.NVarChar, body.deepDiscountReasonCode || null).input("deep_note", sql.NVarChar, body.deepDiscountReasonNote || null).input("actor", sql.NVarChar, req.user.id);
    let promotionId = id;
    if (id) {
      request.input("id", sql.Int, id);
      const used = await transaction.request().input("promotion_id", sql.Int, id).query("SELECT used_count FROM Promotions WHERE id=@promotion_id AND is_archived=0");
      if (!used.recordset.length) throw new Error("Chương trình không tồn tại.");
      if (Number(used.recordset[0].used_count) > 0) throw new Error("Chương trình đã phát sinh đơn hàng. Hãy tạo chương trình mới để bảo toàn lịch sử.");
      await request.query(`UPDATE Promotions SET name=@name,description=@description,discount_type=@type,discount_value=@value,maximum_discount=@max,minimum_order_value=@min,is_automatic=@automatic,stacking_policy=@stacking,priority=@priority,customer_requirement=@requirement,usage_limit_total=@total_limit,usage_limit_per_customer=@customer_limit,start_at=@start,end_at=@end,status=@status,business_goal=@goal,budget_total=@budget,max_discount_per_order=@max_order,requires_override=@override,override_reason=@override_reason,template_id=@template,slug=@slug,campaign_type=@campaign_type,is_public=@is_public,public_title=@public_title,public_description=@public_description,banner_url=@banner,max_effective_discount=@effective_cap,deep_discount_reason_code=@deep_reason,deep_discount_reason_note=@deep_note,approval_status='pending',approved_by=NULL,approved_at=NULL,requires_reapproval=0,updated_by=@actor,updated_at=GETDATE() WHERE id=@id AND is_archived=0`);
      await transaction.request().input("id", sql.Int, id).query("UPDATE PromotionSkuReservations SET status='released',released_at=GETDATE(),release_reason=N'Chương trình được chỉnh sửa và cần phê duyệt lại' WHERE promotion_id=@id AND status IN ('reserved','active','paused_hold')");
      await transaction.request().input("id", sql.Int, id).query("DELETE FROM PromotionTargets WHERE promotion_id=@id");
    } else {
      const inserted = await request.query(`INSERT INTO Promotions(name,description,discount_type,discount_value,maximum_discount,minimum_order_value,is_automatic,stacking_policy,priority,customer_requirement,usage_limit_total,usage_limit_per_customer,start_at,end_at,status,business_goal,budget_total,max_discount_per_order,requires_override,override_reason,template_id,slug,campaign_type,is_public,public_title,public_description,banner_url,max_effective_discount,deep_discount_reason_code,deep_discount_reason_note,approval_status,created_by,updated_by) OUTPUT INSERTED.id VALUES(@name,@description,@type,@value,@max,@min,@automatic,@stacking,@priority,@requirement,@total_limit,@customer_limit,@start,@end,@status,@goal,@budget,@max_order,@override,@override_reason,@template,@slug,@campaign_type,@is_public,@public_title,@public_description,@banner,@effective_cap,@deep_reason,@deep_note,'pending',@actor,@actor)`);
      promotionId = inserted.recordset[0].id;
    }
    const targets = Array.isArray(body.targets) && body.targets.length ? body.targets : [{ type: "store", value: "all" }];
    for (const target of targets) await transaction.request().input("id", sql.Int, promotionId).input("type", sql.NVarChar, target.type).input("value", sql.NVarChar, String(target.value)).input("excluded", sql.Bit, target.excluded ? 1 : 0).input("source", sql.NVarChar, target.selectionSource || "admin").input("fit", sql.Decimal(5,2), target.fitScore ?? null).input("need", sql.Decimal(5,2), target.needScore ?? null).input("suggested", sql.Decimal(5,2), target.suggestedDiscount ?? null).input("approved", sql.Decimal(5,2), target.approvedDiscount ?? body.discountValue ?? null).input("reason", sql.NVarChar, target.selectionReason || null).input("exception", sql.NVarChar, target.exceptionReason || null).query("INSERT INTO PromotionTargets(promotion_id,target_type,target_value,is_excluded,selection_source,fit_score,need_score,suggested_discount,approved_discount,selection_reason,exception_reason) VALUES(@id,@type,@value,@excluded,@source,@fit,@need,@suggested,@approved,@reason,@exception)");
    if (!id && body.code) {
      const distribution = ["public","targeted","private"].includes(body.codeDistribution) ? body.codeDistribution : "public";
      const insertedCode = await transaction.request().input("id", sql.Int, promotionId).input("code", sql.NVarChar, normalizeCode(body.code)).input("limit", sql.Int, body.codeUsageLimit || null).input("distribution",sql.NVarChar,distribution).input("display",sql.NVarChar,body.codeDescription || body.description || null).query("INSERT INTO PromotionCodes(promotion_id,code,usage_limit,distribution_type,display_description) OUTPUT INSERTED.id VALUES(@id,@code,@limit,@distribution,@display)");
      if (distribution === "targeted") {
        const emails=[...new Set(String(body.assignedCustomerEmails||"").split(/[;,\\n]/).map((value)=>value.trim().toLowerCase()).filter(Boolean))];
        if (!emails.length) throw new Error("Mã được gán riêng cần ít nhất một email khách hàng.");
        for (const email of emails) {
          const user=await transaction.request().input("email",sql.NVarChar,email).query("SELECT id FROM Users WHERE LOWER(email)=@email AND role='customer' AND is_active=1");
          if (!user.recordset.length) throw new Error(`Không tìm thấy khách hàng đang hoạt động: ${email}`);
          await transaction.request().input("code_id",sql.Int,insertedCode.recordset[0].id).input("user_id",sql.NVarChar,user.recordset[0].id).input("actor",sql.NVarChar,`${req.user.name} (${req.user.role})`).query("INSERT INTO PromotionCodeAssignments(promotion_code_id,user_id,assigned_by) VALUES(@code_id,@user_id,@actor)");
        }
      }
    }
    await transaction.request().input("id", sql.Int, promotionId).input("action", sql.NVarChar, id ? "updated" : "created").input("data", sql.NVarChar, JSON.stringify(body)).input("actor", sql.NVarChar, `${req.user.name} (${req.user.role})`).query("INSERT INTO PromotionAuditLogs(promotion_id,action,new_data,performed_by) VALUES(@id,@action,@data,@actor)");
    await transaction.commit();
    return res.status(id ? 200 : 201).json({ success: true, id: promotionId });
  } catch (error) { await transaction.rollback(); return res.status(400).json({ success: false, error: error.message }); }
}

export const createPromotion = (req, res) => persistPromotion(req, res);
export const updatePromotion = (req, res) => persistPromotion(req, res, Number(req.params.id));

async function releaseExpiredReservationHolds(poolOrTransaction = getPool()) {
  await poolOrTransaction.request().query(`
    UPDATE r SET status='released',released_at=GETDATE(),release_reason=N'Tạm dừng quá 24 giờ'
    FROM PromotionSkuReservations r
    WHERE r.status='paused_hold' AND r.hold_expires_at<=GETDATE();
    UPDATE p SET requires_reapproval=1,approval_status='pending',status='paused',updated_at=GETDATE()
    FROM Promotions p WHERE p.id IN (
      SELECT DISTINCT promotion_id FROM PromotionSkuReservations WHERE status='released' AND release_reason=N'Tạm dừng quá 24 giờ'
    ) AND p.is_archived=0;
  `);
}

async function reservePromotionSkus(transaction, promotionId, actor) {
  await releaseExpiredReservationHolds(transaction);
  const promotionResult = await transaction.request().input("id", sql.Int, promotionId).query("SELECT id,start_at,end_at,discount_type,discount_value,maximum_discount,max_discount_per_order FROM Promotions WITH (UPDLOCK,HOLDLOCK) WHERE id=@id AND is_archived=0");
  if (!promotionResult.recordset.length) throw new Error("Chương trình không tồn tại.");
  const promotion = promotionResult.recordset[0];
  if (!promotion.end_at) throw new Error("Cần có thời gian kết thúc rõ ràng trước khi phê duyệt và giữ SKU.");
  const variants = await transaction.request().input("id", sql.Int, promotionId).query(`
    SELECT DISTINCT v.id,v.sku,v.stock_quantity,v.low_stock_threshold,v.price,v.cost_price,v.floor_price
    FROM PromotionTargets pt
    JOIN ProductVariants v ON v.is_active=1
    JOIN Products p ON p.id=v.product_id AND ${activeProductSql("p")}
    WHERE pt.promotion_id=@id AND pt.is_excluded=0 AND (
      pt.target_type='store' OR
      (pt.target_type='product' AND pt.target_value=CONVERT(NVARCHAR(100),p.id)) OR
      (pt.target_type='variant' AND pt.target_value IN (v.id,v.sku)) OR
      (pt.target_type='category' AND pt.target_value=p.category) OR
      (pt.target_type='audience' AND pt.target_value=p.gender)
    )
  `);
  if (!variants.recordset.length) throw new Error("Chương trình chưa có SKU hợp lệ để giữ chỗ.");
  const invalid = variants.recordset.filter((row) => Number(row.price || 0) <= 0 || Number(row.cost_price || 0) <= 0 || Number(row.floor_price || 0) <= 0);
  if (invalid.length) throw new Error(`Không thể duyệt vì ${invalid.length} SKU chưa có đủ giá bán, giá vốn hoặc giá sàn. Ví dụ: ${invalid.slice(0, 5).map((row) => row.sku).join(", ")}.`);
  const belowFloor = variants.recordset.filter((row) => {
    let discount = promotion.discount_type === "percentage"
      ? Math.floor(Number(row.price) * Number(promotion.discount_value || 0) / 100)
      : promotion.discount_type === "fixed_amount" ? Number(promotion.discount_value || 0) : 0;
    if (promotion.maximum_discount != null) discount = Math.min(discount, Number(promotion.maximum_discount));
    if (promotion.max_discount_per_order != null) discount = Math.min(discount, Number(promotion.max_discount_per_order));
    return Number(row.price) - discount < Number(row.floor_price);
  });
  if (belowFloor.length) throw new Error(`Không thể duyệt vì giá sau giảm thấp hơn giá sàn ở ${belowFloor.length} SKU. Ví dụ: ${belowFloor.slice(0, 5).map((row) => row.sku).join(", ")}. Hãy giảm mức ưu đãi hoặc loại các SKU này.`);
  const conflictRequest = transaction.request().input("promotion_id", sql.Int, promotionId).input("start", sql.DateTime2, promotion.start_at).input("end", sql.DateTime2, promotion.end_at);
  const conflicts = await conflictRequest.query(`
    SELECT r.variant_id,p.name,r.reserved_from,r.reserved_until FROM PromotionSkuReservations r WITH (UPDLOCK,HOLDLOCK)
    JOIN Promotions p ON p.id=r.promotion_id
    WHERE r.promotion_id<>@promotion_id AND r.variant_id IN (
      SELECT DISTINCT v.id FROM PromotionTargets pt
      JOIN ProductVariants v ON v.is_active=1
      JOIN Products product ON product.id=v.product_id AND ${activeProductSql("product")}
      WHERE pt.promotion_id=@promotion_id AND pt.is_excluded=0 AND (
        pt.target_type='store' OR
        (pt.target_type='product' AND pt.target_value=CONVERT(NVARCHAR(100),product.id)) OR
        (pt.target_type='variant' AND pt.target_value IN (v.id,v.sku)) OR
        (pt.target_type='category' AND pt.target_value=product.category) OR
        (pt.target_type='audience' AND pt.target_value=product.gender)
      )
    )
      AND r.status IN ('reserved','active','paused_hold')
      AND @start<r.reserved_until AND r.reserved_from<@end
  `);
  if (conflicts.recordset.length) {
    const labels = conflicts.recordset.slice(0, 5).map((row) => `${row.variant_id} (${row.name})`).join(", ");
    throw new Error(`SKU đang được chương trình khác giữ trong thời gian chồng lấn: ${labels}.`);
  }
  await transaction.request().input("id", sql.Int, promotionId).query("UPDATE PromotionSkuReservations SET status='released',released_at=GETDATE(),release_reason=N'Phê duyệt lại chương trình' WHERE promotion_id=@id AND status IN ('reserved','active','paused_hold')");
  for (const variant of variants.recordset) {
    const quantity = Math.max(0, Number(variant.stock_quantity) - Number(variant.low_stock_threshold));
    if (quantity <= 0) throw new Error(`${variant.sku} đã chạm mức tồn tối thiểu và không thể đưa vào sale.`);
    await transaction.request().input("promotion_id", sql.Int, promotionId).input("variant", sql.NVarChar, variant.id).input("start", sql.DateTime2, promotion.start_at).input("end", sql.DateTime2, promotion.end_at).input("quantity", sql.Int, quantity).input("actor", sql.NVarChar, actor).query("INSERT INTO PromotionSkuReservations(promotion_id,variant_id,reserved_from,reserved_until,quantity_reserved,status,reserved_by) VALUES(@promotion_id,@variant,@start,@end,@quantity,'reserved',@actor)");
  }
  return variants.recordset.length;
}

export async function updatePromotionStatus(req, res) {
  const status = String(req.body.status || "");
  if (!["draft","active","paused"].includes(status)) return res.status(400).json({ success: false, error: "Trạng thái không hợp lệ." });
  await releaseExpiredReservationHolds();
  const result = await getPool().request().input("id", sql.Int, Number(req.params.id)).query("SELECT approval_status,budget_total,budget_reserved,budget_spent,requires_reapproval FROM Promotions WHERE id=@id AND is_archived=0");
  if (!result.recordset.length) return res.status(404).json({ success: false, error: "Chương trình không tồn tại." });
  const promotion = result.recordset[0];
  if (status === "active" && promotion.approval_status !== "approved") return res.status(400).json({ success: false, error: "Chương trình phải được phê duyệt trước khi kích hoạt." });
  if (status === "active" && promotion.requires_reapproval) return res.status(400).json({ success: false, error: "Reservation đã hết thời gian giữ. Cần phân tích và phê duyệt lại chương trình." });
  if (status === "active" && promotion.budget_total && Number(promotion.budget_reserved) + Number(promotion.budget_spent) >= Number(promotion.budget_total)) return res.status(400).json({ success: false, error: "Ngân sách chương trình đã hết." });
  await getPool().request().input("id", sql.Int, Number(req.params.id)).input("status", sql.NVarChar, status).input("actor", sql.NVarChar, req.user.id).query(`
    UPDATE Promotions SET status=@status,paused_at=CASE WHEN @status='paused' THEN GETDATE() ELSE NULL END,updated_by=@actor,updated_at=GETDATE() WHERE id=@id AND is_archived=0;
    UPDATE PromotionSkuReservations SET status=CASE WHEN @status='active' THEN 'active' ELSE 'paused_hold' END,
      hold_expires_at=CASE WHEN @status='paused' THEN DATEADD(hour,24,GETDATE()) ELSE NULL END
    WHERE promotion_id=@id AND status IN ('reserved','active','paused_hold');
  `);
  return res.json({ success: true });
}

export async function approvePromotion(req, res) {
  const approvalStatus = String(req.body.status || "");
  if (!["approved", "rejected"].includes(approvalStatus)) return res.status(400).json({ success: false, error: "Quyết định phê duyệt không hợp lệ." });
  const note = String(req.body.note || "").trim();
  const current = await getPool().request().input("id", sql.Int, Number(req.params.id)).query("SELECT requires_override,override_reason,max_effective_discount,deep_discount_reason_code,deep_discount_reason_note FROM Promotions WHERE id=@id AND is_archived=0");
  if (!current.recordset.length) return res.status(404).json({ success: false, error: "Chương trình không tồn tại." });
  if (approvalStatus === "approved" && current.recordset[0].requires_override && !String(current.recordset[0].override_reason || "").trim()) return res.status(400).json({ success: false, error: "Cần ghi rõ lý do vượt ngưỡng trước khi phê duyệt." });
  if (approvalStatus === "approved" && Number(current.recordset[0].max_effective_discount) > 25 && !String(current.recordset[0].deep_discount_reason_code || "").trim()) return res.status(400).json({ success: false, error: "Giảm sâu trên 25% cần chọn lý do trước khi phê duyệt." });
  if (approvalStatus === "approved" && current.recordset[0].deep_discount_reason_code === "other" && !String(current.recordset[0].deep_discount_reason_note || "").trim()) return res.status(400).json({ success: false, error: "Lý do khác cần có mô tả chi tiết." });
  const pool = getPool(); const transaction = new sql.Transaction(pool); await transaction.begin();
  try {
    const actor = `${req.user.name} (${req.user.role})`;
    let reservedSkuCount = 0;
    if (approvalStatus === "approved") reservedSkuCount = await reservePromotionSkus(transaction, Number(req.params.id), actor);
    else await transaction.request().input("id", sql.Int, Number(req.params.id)).query("UPDATE PromotionSkuReservations SET status='released',released_at=GETDATE(),release_reason=N'Chương trình bị từ chối' WHERE promotion_id=@id AND status IN ('reserved','active','paused_hold')");
    await transaction.request().input("id", sql.Int, Number(req.params.id)).input("status", sql.NVarChar, approvalStatus).input("note", sql.NVarChar, note || null).input("actor", sql.NVarChar, actor).input("data",sql.NVarChar,JSON.stringify({ note,reservedSkuCount })).query("UPDATE Promotions SET approval_status=@status,approval_note=@note,approved_by=@actor,approved_at=GETDATE(),requires_reapproval=0,updated_by=@actor,updated_at=GETDATE() WHERE id=@id AND is_archived=0; INSERT INTO PromotionAuditLogs(promotion_id,action,new_data,performed_by) VALUES(@id,@status,@data,@actor)");
    await transaction.commit(); return res.json({ success: true, reservedSkuCount });
  } catch (error) { await transaction.rollback(); return res.status(400).json({ success:false,error:error.message }); }
}

export async function simulatePromotion(req, res) {
  const body = req.body || {};
  const errors = validatePromotion({ ...body, status: "draft" });
  if (errors.length) return res.status(400).json({ success: false, error: errors.join(" ") });

  const products = await db.getAllProducts();
  const rows = products.flatMap((product) => (product.variants || []).map((variant) => ({
    product_id: product.id,
    name: product.name,
    category: product.category,
    audience: product.audience,
    product_type: product.productType,
    subcategory: product.subcategory,
    collection_name: product.collection,
    variant_id: variant.id,
    sku: variant.sku,
    color_name: variant.color,
    size_name: variant.size,
    price: Number(variant.price),
    cost_price: variant.costPrice != null ? Number(variant.costPrice) : null,
    floor_price: variant.floorPrice != null ? Number(variant.floorPrice) : null,
    stock_quantity: Number(variant.stock || 0),
    low_stock_threshold: Number(variant.lowStockThreshold || 0),
    max_stock_threshold: Number(variant.maxStockThreshold || 0),
  })));

  const targets = Array.isArray(body.targets) && body.targets.length ? body.targets : [{ type: "store", value: "all" }];
  const matches = (row, target) => target.type === "store" || (target.type === "product" && String(row.product_id) === String(target.value)) || (target.type === "variant" && [String(row.variant_id), String(row.sku)].includes(String(target.value))) || (target.type === "category" && [row.category,row.product_type,row.subcategory].includes(target.value)) || (target.type === "audience" && row.audience === target.value);
  const included = targets.filter((target) => !target.excluded);
  const excluded = targets.filter((target) => target.excluded);
  const selected = rows.filter((row) => (included.length === 0 || included.some((target) => matches(row, target))) && !excluded.some((target) => matches(row, target)));

  let estimatedExposure = 0;
  const warnings = [];

  // Duration in days
  let durationDays = 14;
  if (body.startAt && body.endAt) {
    const diffDays = Math.ceil((new Date(body.endAt).getTime() - new Date(body.startAt).getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays > 0 && diffDays <= 90) durationDays = diffDays;
  }

  // Monthly holding cost rate: 1.5% per month on stock inventory value (avoidable holding / capital costs)
  const dailyHoldingRate = 0.015 / 30;

  let missingCostCount = 0;
  let totalBaselineUnits = 0;
  let totalBaselineRevenue = 0;
  let totalBaselineCost = 0;
  let totalBaselineEndingStock = 0;
  let totalBaselineHoldingCost = 0;

  let totalPromoUnits = 0;
  let totalPromoRevenue = 0;
  let totalPromoCost = 0;
  let totalPromoEndingStock = 0;
  let totalPromoHoldingCost = 0;

  const variants = selected.map((row) => {
    let discount = promotionDiscount(body, Number(row.price));
    if (body.maximumDiscount) discount = Math.min(discount, Number(body.maximumDiscount));
    if (body.maxDiscountPerOrder) discount = Math.min(discount, Number(body.maxDiscountPerOrder));

    const floor = Number(row.floor_price || 0);
    const calculatedPrice = Number(row.price) - discount;
    const belowFloor = floor > 0 && calculatedPrice < floor;
    if (belowFloor) warnings.push(`${row.sku}: giá sau giảm thấp hơn giá sàn ${floor.toLocaleString("vi-VN")}đ.`);
    if (row.stock_quantity <= row.low_stock_threshold) warnings.push(`${row.sku}: đang sắp hết hoặc hết hàng, không nên giảm thêm.`);

    const lowStock = row.stock_quantity <= row.low_stock_threshold;
    const safeDiscount = lowStock ? 0 : floor > 0 ? Math.min(discount, Math.max(0, Number(row.price) - floor)) : discount;
    estimatedExposure += safeDiscount * Number(row.stock_quantity || 0);

    const hasCost = row.cost_price != null && row.cost_price > 0;
    const missingFloor = !row.floor_price || Number(row.floor_price) <= 0;
    if (!hasCost || missingFloor) {
      missingCostCount++;
      warnings.push(`${row.sku}: thiếu giá vốn hoặc giá sàn, không thể phê duyệt khuyến mãi.`);
    }

    const unitPrice = row.price;
    const discountedPrice = Math.max(0, unitPrice - safeDiscount);
    const unitCost = hasCost ? row.cost_price : 0;
    const sellableStock = Math.max(0, row.stock_quantity - row.low_stock_threshold);

    // Conservative baseline sales over duration
    const baselineUnits = Math.min(sellableStock, Math.max(1, Math.round((durationDays / 14) * 2)));

    // Demand uplift factor based on discount percentage
    const discountPercent = unitPrice > 0 ? (safeDiscount / unitPrice) * 100 : 0;
    const upliftFactor = discountPercent >= 30 ? 2.8 : discountPercent >= 20 ? 2.1 : discountPercent >= 10 ? 1.6 : 1.25;
    const promoUnits = safeDiscount > 0 ? Math.min(sellableStock, Math.max(1, Math.round(baselineUnits * upliftFactor))) : baselineUnits;

    // Baseline metrics
    const baseRevenue = baselineUnits * unitPrice;
    const baseCost = baselineUnits * unitCost;
    const baseEndingStock = Math.max(0, row.stock_quantity - baselineUnits);
    const baseHoldingCost = baseEndingStock * unitCost * dailyHoldingRate * durationDays;

    totalBaselineUnits += baselineUnits;
    totalBaselineRevenue += baseRevenue;
    totalBaselineCost += baseCost;
    totalBaselineEndingStock += baseEndingStock;
    totalBaselineHoldingCost += baseHoldingCost;

    // Promotion metrics
    const promoRevenue = promoUnits * discountedPrice;
    const promoCost = promoUnits * unitCost;
    const promoEndingStock = Math.max(0, row.stock_quantity - promoUnits);
    const promoHoldingCost = promoEndingStock * unitCost * dailyHoldingRate * durationDays;

    totalPromoUnits += promoUnits;
    totalPromoRevenue += promoRevenue;
    totalPromoCost += promoCost;
    totalPromoEndingStock += promoEndingStock;
    totalPromoHoldingCost += promoHoldingCost;

    return {
      productId: row.product_id,
      productName: row.name,
      variantId: row.variant_id,
      sku: row.sku,
      color: row.color_name,
      size: row.size_name,
      price: unitPrice,
      costPrice: row.cost_price || 0,
      floorPrice: floor,
      stock: row.stock_quantity,
      proposedPrice: discountedPrice,
      discount: safeDiscount,
      belowFloor,
      lowStock,
      hasCost,
      missingFloor,
      hardBlocked: lowStock || !hasCost || missingFloor,
    };
  });

  const uniqueWarnings = [...new Set(warnings)];

  // Totals & Comparison
  const baselineGrossProfit = totalBaselineRevenue - totalBaselineCost;
  const promoGrossProfit = totalPromoRevenue - totalPromoCost;
  const avoidedHoldingCost = Math.max(0, totalBaselineHoldingCost - totalPromoHoldingCost);
  const netFinancialDelta = (promoGrossProfit - baselineGrossProfit) + avoidedHoldingCost;

  // Missing data flag and note
  const hasMissingCostData = missingCostCount > 0;
  const missingDataNotice = hasMissingCostData
    ? `Cảnh báo: Có ${missingCostCount} SKU chưa được thiết lập giá vốn hoặc giá sàn. Hệ thống tính toán trên dữ liệu hiện có và không tự tạo số liệu chi phí hoặc khẳng định mức lợi nhuận giả định.`
    : null;

  // Deterministic financial forecast object
  const forecast = {
    durationDays,
    hasMissingCostData,
    missingCostCount,
    missingDataNotice,
    baseline: {
      projectedUnits: totalBaselineUnits,
      projectedRevenue: totalBaselineRevenue,
      projectedCost: totalBaselineCost,
      projectedGrossProfit: baselineGrossProfit,
      grossMarginPercent: totalBaselineRevenue > 0 ? Number(((baselineGrossProfit / totalBaselineRevenue) * 100).toFixed(1)) : 0,
      projectedEndingStock: totalBaselineEndingStock,
      projectedHoldingCost: Math.round(totalBaselineHoldingCost),
    },
    promotion: {
      projectedUnits: totalPromoUnits,
      projectedRevenue: totalPromoRevenue,
      projectedCost: totalPromoCost,
      projectedGrossProfit: promoGrossProfit,
      grossMarginPercent: totalPromoRevenue > 0 ? Number(((promoGrossProfit / totalPromoRevenue) * 100).toFixed(1)) : 0,
      cashFlowGenerated: totalPromoRevenue,
      projectedEndingStock: totalPromoEndingStock,
      projectedHoldingCost: Math.round(totalPromoHoldingCost),
      avoidedHoldingCost: Math.round(avoidedHoldingCost),
      netBenefitVsBaseline: Math.round(netFinancialDelta),
    },
    costBreakdown: {
      fixedOverheadCost: 0,
      avoidableInventoryHoldingCost: Math.round(avoidedHoldingCost),
      noDoubleCountingVerified: true,
    },
  };

  // AI Strategic Explanation (using only the deterministic numbers)
  let aiStrategicCommentary = `Chương trình dự kiến mang lại dòng tiền ${forecast.promotion.cashFlowGenerated.toLocaleString("vi-VN")}đ với ${forecast.promotion.projectedUnits} sản phẩm bán ra. ` +
    (netFinancialDelta >= 0
      ? `Lợi ích tài chính tổng hợp sau khi tính chi phí giải phóng tồn kho tăng thêm ${Math.round(netFinancialDelta).toLocaleString("vi-VN")}đ so với giữ nguyên giá.`
      : `Lưu ý mức giảm giá làm biên lợi nhuận gộp nén lại so với giữ giá; cần cân nhắc giữa mục tiêu đẩy nhanh thanh lý kho và tối đa hóa biên lãi.`);

  const apiKey = process.env.OPENAI_API_KEY || process.env.VITE_CHAT_API_KEY;
  if (apiKey) {
    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content:
                "You are Maison Rue's luxury fashion business analyst. Analyze this promotion simulation. " +
                "You MUST NOT invent new financial figures; only interpret the provided exact numbers. " +
                "Write 2-3 concise, professional sentences in Vietnamese focusing on: revenue vs profit tradeoff, inventory velocity, and cashflow.",
            },
            {
              role: "user",
              content: JSON.stringify({
                goal: body.businessGoal,
                durationDays,
                baselineRevenue: forecast.baseline.projectedRevenue,
                promoRevenue: forecast.promotion.projectedRevenue,
                baselineProfit: forecast.baseline.projectedGrossProfit,
                promoProfit: forecast.promotion.projectedGrossProfit,
                cashFlow: forecast.promotion.cashFlowGenerated,
                avoidedHoldingCost: forecast.promotion.avoidedHoldingCost,
                hasMissingCostData,
              }),
            },
          ],
          temperature: 0.2,
          max_tokens: 200,
        }),
      });

      if (response.ok) {
        const resJson = await response.json();
        const content = resJson.choices?.[0]?.message?.content?.trim();
        if (content) aiStrategicCommentary = content;
      }
    } catch (aiErr) {
      console.warn("[Promotion Simulation] AI commentary fallback:", aiErr.message);
    }
  }

  return res.json({
    success: true,
    simulation: {
      productCount: new Set(variants.map((row) => row.productId)).size,
      variantCount: variants.length,
      estimatedExposure,
      budgetTotal: Number(body.budgetTotal || 0),
      overBudget: Boolean(body.budgetTotal && estimatedExposure > Number(body.budgetTotal)),
      requiresOverride: false,
      hasBlockedVariants: variants.some((row) => row.hardBlocked),
      warnings: uniqueWarnings.slice(0, 30),
      variants: variants.slice(0, 100),
      forecast,
      aiStrategicCommentary,
    },
  });
}

export async function promotionSuggestions(req, res) {
  if (req.query.refresh !== "1") {
    const cached = await getPool().request().query(`
      SELECT payload_json,generated_at FROM PromotionRecommendationSnapshot
      WHERE id=1 AND generated_at>DATEADD(hour,-1,GETDATE())
    `).catch(() => ({ recordset: [] }));
    if (cached.recordset.length) {
      const payload = JSON.parse(cached.recordset[0].payload_json);
      return res.json({ ...payload, cached: true, refresh: { ...(payload.refresh || {}), nextAutomaticRefreshAt: new Date(new Date(cached.recordset[0].generated_at).getTime() + 3600000).toISOString(), mode: "hourly_or_manual" } });
    }
  }
  const refreshState = await getPool().request().query(`
    SELECT COUNT(*) pending_count, MIN(created_at) oldest_change_at,
      STRING_AGG(reason,' · ') reasons
    FROM (SELECT DISTINCT TOP 12 reason,created_at FROM PromotionRecommendationRefreshEvents WHERE processed_at IS NULL ORDER BY created_at) pending
  `).catch(() => ({ recordset: [{ pending_count: 0, oldest_change_at: null, reasons: null }] }));
  if (req.query.refresh === "1") {
    await getPool().request().input("actor", sql.NVarChar, req.user?.id || "admin").query(`
      INSERT INTO PromotionRecommendationRefreshEvents(source_type,entity_id,reason)
      VALUES('manual',@actor,N'Admin yêu cầu làm mới đề xuất')
    `).catch(() => null);
  }
  const rows = await getPool().request().query(`
    SELECT p.id product_id,p.name,p.category,p.launched_at,p.is_classic,p.is_bestseller,
      p.season_tags,p.occasion_tags,p.material_tags,p.lifecycle,p.giftable,
      v.id variant_id,v.sku,v.color_name,v.size_name,
      v.price,v.cost_price,v.floor_price,v.stock_quantity,v.low_stock_threshold,v.max_stock_threshold,
      COALESCE(f.favorite_count,0) favorite_count,COALESCE(fb.favorite_buyers,0) favorite_buyers,
      COALESCE(s.sold_60d,0) sold_60d,COALESCE(s.actual_sold_60d,0) actual_sold_60d,
      COALESCE(s.simulated_sold_60d,0) simulated_sold_60d,
      COALESCE(prev.sold_previous_60d,0) sold_previous_60d,
      COALESCE(cancelled.cancelled_60d,0) cancelled_60d,
      movement.oldest_stock_at,last_promo.last_promotion_at,
      CASE WHEN active_promo.promotion_id IS NULL THEN 0 ELSE 1 END has_active_promotion
    FROM Products p
    JOIN ProductVariants v ON v.product_id=p.id AND v.is_active=1
    OUTER APPLY (
      SELECT COUNT(*) favorite_count
      FROM ProductFavorites pf WHERE pf.product_id=p.id AND pf.is_active=1
    ) f
    OUTER APPLY (
      SELECT COUNT(DISTINCT pf.user_id) favorite_buyers
      FROM ProductFavorites pf
      WHERE pf.product_id=p.id AND pf.is_active=1 AND EXISTS (
        SELECT 1 FROM Orders o JOIN OrderItems oi ON oi.order_id=o.id
        WHERE o.customer_id=pf.user_id AND oi.product_id=p.id AND o.recognized_at IS NOT NULL
      )
    ) fb
    OUTER APPLY (
      SELECT SUM(oi.quantity) sold_60d,
        SUM(CASE WHEN COALESCE(o.data_origin,'actual')='actual' THEN oi.quantity ELSE 0 END) actual_sold_60d,
        SUM(CASE WHEN o.data_origin='simulated' THEN oi.quantity ELSE 0 END) simulated_sold_60d
      FROM OrderItems oi JOIN Orders o ON o.id=oi.order_id
      WHERE oi.variant_id=v.id AND o.recognized_at>=DATEADD(day,-60,GETDATE())
    ) s
    OUTER APPLY (
      SELECT SUM(oi.quantity) sold_previous_60d FROM OrderItems oi JOIN Orders o ON o.id=oi.order_id
      WHERE oi.variant_id=v.id AND o.recognized_at>=DATEADD(day,-120,GETDATE()) AND o.recognized_at<DATEADD(day,-60,GETDATE())
    ) prev
    OUTER APPLY (
      SELECT SUM(oi.quantity) cancelled_60d FROM OrderItems oi JOIN Orders o ON o.id=oi.order_id
      WHERE oi.variant_id=v.id AND o.order_status='cancelled' AND o.updated_at>=DATEADD(day,-60,GETDATE())
    ) cancelled
    OUTER APPLY (
      SELECT MIN(im.created_at) oldest_stock_at FROM InventoryMovements im
      WHERE im.variant_id=v.id AND im.quantity_change>0
    ) movement
    OUTER APPLY (
      SELECT MAX(pu.used_at) last_promotion_at FROM PromotionUsages pu
      JOIN OrderItems oi ON oi.order_id=pu.order_id WHERE oi.variant_id=v.id
    ) last_promo
    OUTER APPLY (
      SELECT TOP 1 pr.id promotion_id FROM Promotions pr
      WHERE pr.is_archived=0 AND pr.status='active' AND pr.approval_status='approved'
        AND pr.start_at<=SYSUTCDATETIME() AND (pr.end_at IS NULL OR pr.end_at>SYSUTCDATETIME())
        AND EXISTS (SELECT 1 FROM PromotionTargets pt WHERE pt.promotion_id=pr.id AND pt.is_excluded=0 AND (
          pt.target_type='store' OR (pt.target_type='product' AND pt.target_value=CONVERT(NVARCHAR(100),p.id))
          OR (pt.target_type='variant' AND pt.target_value IN (v.id,v.sku))
          OR (pt.target_type='category' AND pt.target_value=p.category)))
        AND NOT EXISTS (SELECT 1 FROM PromotionTargets pt WHERE pt.promotion_id=pr.id AND pt.is_excluded=1 AND (
          (pt.target_type='product' AND pt.target_value=CONVERT(NVARCHAR(100),p.id))
          OR (pt.target_type='variant' AND pt.target_value IN (v.id,v.sku))))
    ) active_promo
    WHERE ${activeProductSql("p")} ORDER BY p.id,v.sku
  `);

  const pointsToDiscount = (score) => score >= 90 ? 25 : score >= 80 ? 20 : score >= 65 ? 15 : score >= 50 ? 10 : score >= 30 ? 5 : 0;
  const suggestions = rows.recordset.map((row) => {
    const stock = Number(row.stock_quantity || 0), min = Number(row.low_stock_threshold || 0), max = Number(row.max_stock_threshold || 0);
    const sold = Number(row.sold_60d || 0), previous = Number(row.sold_previous_60d || 0), cancelled = Number(row.cancelled_60d || 0);
    const favorites = Number(row.favorite_count || 0), favoriteBuyers = Number(row.favorite_buyers || 0);
    const price = Number(row.price || 0), cost = Number(row.cost_price || 0), floor = Number(row.floor_price || 0);
    const safeMaxPercent = price > 0 ? Math.max(0, Math.floor((price - floor) / price * 100)) : 0;
    const exclusionReasons = [];
    if (stock <= 0) exclusionReasons.push("SKU đã hết hàng");
    else if (stock <= min) exclusionReasons.push("Tồn kho đã chạm mức tối thiểu");
    if (!cost || !floor) exclusionReasons.push("Chưa đủ giá vốn hoặc giá sàn");
    if (safeMaxPercent < 5) exclusionReasons.push("Không còn dư địa giảm giá an toàn");
    if (row.has_active_promotion) exclusionReasons.push("Đang nằm trong chương trình khuyến mãi khác");
    if (row.is_classic) exclusionReasons.push("Sản phẩm thuộc dòng Classic");
    if (row.is_bestseller) exclusionReasons.push("Sản phẩm đang bán chạy");
    const launchAgeDays = row.launched_at
      ? Math.floor((Date.now() - new Date(row.launched_at).getTime()) / 86400000)
      : null;
    if (launchAgeDays != null && launchAgeDays < 60) exclusionReasons.push("Sản phẩm mới ra mắt trong 60 ngày");

    let score = 0;
    const reasons = [];
    const risks = [];
    const dailyVelocity = sold / 60;
    const daysOfCover = dailyVelocity > 0 ? Math.round(stock / dailyVelocity) : stock > min ? 999 : 0;
    if (max > 0 && stock >= max) { score += 15; reasons.push("Tồn kho vượt mức tối đa"); }
    if (daysOfCover > 180) { score += 15; reasons.push("Dự kiến trên 180 ngày để bán hết"); }
    else if (daysOfCover > 90) { score += 10; reasons.push("Dự kiến trên 90 ngày để bán hết"); }
    else if (daysOfCover > 60) { score += 5; reasons.push("Dự kiến trên 60 ngày để bán hết"); }
    if (sold === 0) { score += 25; reasons.push("Không phát sinh doanh thu trong 60 ngày"); }
    else if (sold <= 2) { score += 15; reasons.push("Bán chậm trong 60 ngày"); }
    else if (previous > 0 && sold / previous < 0.5) { score += 20; reasons.push("Tốc độ bán giảm trên 50%"); }
    else if (previous > 0 && sold / previous < 0.75) { score += 10; reasons.push("Tốc độ bán đang giảm"); }
    else if (previous > 0 && sold / previous > 1.5) { score -= 10; risks.push("Tốc độ bán đang tăng, chưa cần giảm sâu"); }
    const favoriteConversion = favorites ? favoriteBuyers / favorites : null;
    if (favorites >= 5 && favoriteConversion < 0.2) { score += 15; reasons.push(`${favorites} lượt yêu thích, tỷ lệ mua thấp`); }
    else if (favorites >= 5 && favoriteConversion < 0.4) { score += 10; reasons.push(`${favorites} lượt yêu thích chưa chuyển đổi tốt`); }
    else if (favorites >= 5) { score += 5; reasons.push(`${favorites} lượt yêu thích từ khách hàng`); }
    const grossMargin = price > 0 ? (price - cost) / price * 100 : 0;
    if (grossMargin > 65) score += 20;
    else if (grossMargin > 55) score += 15;
    else if (grossMargin > 45) score += 8;
    const stockAgeDays = row.oldest_stock_at ? Math.floor((Date.now() - new Date(row.oldest_stock_at).getTime()) / 86400000) : null;
    if (stockAgeDays > 180) { score += 10; reasons.push("Tồn kho trên 180 ngày"); }
    else if (stockAgeDays > 90) { score += 6; reasons.push("Tồn kho trên 90 ngày"); }
    else if (stockAgeDays > 60) { score += 3; reasons.push("Tồn kho trên 60 ngày"); }
    const cancellationRate = sold + cancelled > 0 ? cancelled / (sold + cancelled) : 0;
    if (cancellationRate > 0.2) { score -= 20; risks.push("Tỷ lệ hủy cao, cần kiểm tra trước khi khuyến mãi"); }
    const daysSincePromotion = row.last_promotion_at ? Math.floor((Date.now() - new Date(row.last_promotion_at).getTime()) / 86400000) : null;
    if (daysSincePromotion != null && daysSincePromotion < 30) { score -= 15; risks.push("SKU vừa tham gia khuyến mãi trong 30 ngày"); }
    const hasStrongBusinessSignal = (max > 0 && stock >= max) || stockAgeDays > 90 || (favorites >= 5 && favoriteConversion < 0.4) || (previous >= 3 && sold / previous < 0.75);
    if (!hasStrongBusinessSignal) exclusionReasons.push("Chưa có tín hiệu kinh doanh đủ mạnh để khuyến mãi");
    score = Math.max(0, Math.min(100, score));
    if (score < 75) exclusionReasons.push("Mức ưu tiên chưa đủ cao để mở khuyến mãi");

    const requestedPercent = pointsToDiscount(score);
    const recommendedPercent = exclusionReasons.length ? 0 : Math.min(requestedPercent, safeMaxPercent, 25);
    const businessGoal = (stock >= max || daysOfCover > 180 || sold <= 2) ? "inventory_clearance" : "revenue_growth";
    const durationDays = score >= 80 ? 14 : score >= 65 ? 10 : 7;
    const sellableStock = Math.max(0, stock - min);
    const uplift = recommendedPercent >= 20 ? 1.75 : recommendedPercent >= 15 ? 1.5 : recommendedPercent >= 10 ? 1.3 : 1.15;
    const baselineUnits = dailyVelocity > 0 ? dailyVelocity * durationDays : businessGoal === "inventory_clearance" ? durationDays / 7 : 0;
    const expectedUnits = recommendedPercent ? Math.min(sellableStock, Math.max(1, Math.ceil(baselineUnits * uplift))) : 0;
    const proposedPrice = Math.round(price * (1 - recommendedPercent / 100));
    const projectedRevenue = proposedPrice * expectedUnits;
    const projectedCost = cost * expectedUnits;
    const projectedGrossProfit = projectedRevenue - projectedCost;
    const projectedGrossMargin = projectedRevenue > 0 ? projectedGrossProfit / projectedRevenue * 100 : 0;
    const discountPerUnit = price - proposedPrice;
    const baselineUnitsInPeriod = Math.min(sellableStock, Math.max(0, Math.round(baselineUnits)));
    const baselineRevenue = baselineUnitsInPeriod * price;
    const baselineCost = baselineUnitsInPeriod * cost;
    const baselineGrossProfit = baselineRevenue - baselineCost;
    const baselineEndingStock = Math.max(0, stock - baselineUnitsInPeriod);
    const promotionEndingStock = Math.max(0, stock - expectedUnits);

    // Business-friendly inventory carrying assumptions. They are deliberately
    // separated so the admin UI can explain the estimate without exposing formulas.
    const periodRatio = durationDays / 365;
    const holdingRates = { capital: 0.12, storage: 0.06, risk: 0.08 };
    const holdingBreakdown = (endingStock) => ({
      capital: Math.round(endingStock * cost * holdingRates.capital * periodRatio),
      storage: Math.round(endingStock * cost * holdingRates.storage * periodRatio),
      risk: Math.round(endingStock * cost * holdingRates.risk * periodRatio),
    });
    const baselineHolding = holdingBreakdown(baselineEndingStock);
    const promotionHolding = holdingBreakdown(promotionEndingStock);
    const baselineHoldingTotal = baselineHolding.capital + baselineHolding.storage + baselineHolding.risk;
    const promotionHoldingTotal = promotionHolding.capital + promotionHolding.storage + promotionHolding.risk;
    const avoidedHoldingCost = Math.max(0, baselineHoldingTotal - promotionHoldingTotal);
    const discountCost = discountPerUnit * expectedUnits;
    const netBenefitVsBaseline = (projectedGrossProfit - promotionHoldingTotal) - (baselineGrossProfit - baselineHoldingTotal);
    const profitPerPromoUnit = Math.max(0, proposedPrice - cost);
    const breakEvenUnits = profitPerPromoUnit > 0
      ? Math.ceil(Math.max(0, baselineGrossProfit - avoidedHoldingCost) / profitPerPromoUnit)
      : null;
    const lowUnits = expectedUnits ? Math.max(baselineUnitsInPeriod, Math.floor(expectedUnits * 0.75)) : 0;
    const highUnits = expectedUnits ? Math.min(sellableStock, Math.ceil(expectedUnits * 1.25)) : 0;
    const actualUnits = Number(row.actual_sold_60d || 0);
    const simulatedUnits = Number(row.simulated_sold_60d || 0);
    const sourceTotal = actualUnits + simulatedUnits;
    const actualDataPercent = sourceTotal > 0 ? Math.round(actualUnits / sourceTotal * 100) : 0;
    const confidence = sold >= 10 && stockAgeDays != null ? "high" : sold >= 3 || favorites >= 5 ? "medium" : "low";
    if (confidence === "low") risks.push("Dữ liệu lịch sử còn ít; nên thử ngân sách nhỏ");

    // Keep the admin explanation short and decision-oriented. Scoring still uses
    // every signal above; this list only selects the most useful facts to show.
    const displayReasons = [];
    if (sold === 0) displayReasons.push("Không bán được trong 60 ngày");
    else if (sold <= 2) displayReasons.push(`Chỉ bán ${sold} sản phẩm trong 60 ngày`);
    else if (previous > 0 && sold / previous < 0.5) displayReasons.push("Sức bán giảm trên 50%");
    else if (previous > 0 && sold / previous < 0.75) displayReasons.push("Sức bán đang giảm");

    if (favorites >= 5 && favoriteConversion < 0.2) {
      displayReasons.push(`${favorites} lượt yêu thích, chỉ ${favoriteBuyers} khách đã mua`);
    } else if (favorites >= 5 && favoriteConversion < 0.4) {
      displayReasons.push(`${favorites} lượt yêu thích, tỷ lệ mua ${Math.round(favoriteConversion * 100)}%`);
    }

    let inventoryReason = stockAgeDays > 60 ? `Đã nằm kho ${stockAgeDays} ngày` : "";
    if (max > 0 && stock >= max && daysOfCover > 60) {
      const excess = Math.max(0, stock - max);
      const coverLabel = daysOfCover > 180 ? "trên 180 ngày" : daysOfCover > 90 ? "trên 90 ngày" : "trên 60 ngày";
      const stockLabel = excess > 0 ? `vượt mức ${excess} sản phẩm` : "đang ở mức tồn tối đa";
      inventoryReason = stockAgeDays > 60
        ? `${inventoryReason}, ${stockLabel}`
        : `${stockLabel.charAt(0).toUpperCase() + stockLabel.slice(1)}, dự kiến ${coverLabel} để bán hết`;
    } else if (max > 0 && stock >= max) {
      const excess = Math.max(0, stock - max);
      const stockLabel = excess > 0 ? `vượt mức ${excess} sản phẩm` : "đang ở mức tồn tối đa";
      inventoryReason = stockAgeDays > 60
        ? `${inventoryReason}, ${stockLabel}`
        : stockLabel.charAt(0).toUpperCase() + stockLabel.slice(1);
    } else if (daysOfCover > 60) {
      inventoryReason ||= `Dự kiến ${daysOfCover > 180 ? "trên 180 ngày" : daysOfCover > 90 ? "trên 90 ngày" : "trên 60 ngày"} để bán hết`;
    }
    if (inventoryReason) displayReasons.push(inventoryReason);

    if (grossMargin > 45) {
      displayReasons.push(`Biên lợi nhuận ${grossMargin.toFixed(1).replace(".", ",")}% còn dư địa giảm`);
    }
    const recommendationLabel = netBenefitVsBaseline > 0
      ? (confidence === "low" || actualDataPercent < 30 ? "Nên thử với số lượng nhỏ" : "Nên mở khuyến mãi")
      : "Cần cân nhắc thêm";
    const decisionSummary = netBenefitVsBaseline > 0
      ? `Dự kiến thu ${Math.round(projectedRevenue).toLocaleString("vi-VN")}đ, giảm tồn từ ${stock} xuống khoảng ${promotionEndingStock} sản phẩm và có lợi hơn giữ giá khoảng ${Math.round(netBenefitVsBaseline).toLocaleString("vi-VN")}đ.`
      : `Khuyến mãi giúp thu hồi tiền nhanh hơn nhưng lợi ích dự kiến chưa cao hơn phương án giữ giá. Nên giảm mức ưu đãi hoặc giới hạn số lượng.`;

    const merchandisingText = `${row.name || ""} ${row.season_tags || ""} ${row.occasion_tags || ""} ${row.material_tags || ""}`.toLowerCase();
    const campaignFitScores = {
      black_friday: Math.min(100,
        (favorites >= 5 && favoriteConversion < 0.4 ? 25 : favorites >= 5 ? 10 : 0) +
        (grossMargin > 55 ? 20 : grossMargin > 45 ? 10 : 0) +
        (sellableStock >= 10 ? 15 : sellableStock >= 5 ? 8 : 0) +
        (previous > 0 && sold / previous < 0.75 ? 15 : sold <= 2 ? 10 : 0) +
        (["Clothing","Accessories","Footwear"].includes(row.category) ? 10 : 5) +
        (stock > min ? 10 : 0) + (sourceTotal >= 3 ? 5 : 0)),
      tet: Math.min(100,
        (/(holiday|gifting|formal)/.test(merchandisingText) ? 25 : 5) +
        (row.giftable ? 15 : 0) +
        (stock > min + 5 ? 15 : stock > min ? 8 : 0) +
        (favorites >= 5 ? 15 : favorites >= 2 ? 8 : 0) +
        (grossMargin > 55 ? 15 : grossMargin > 45 ? 8 : 0) +
        (/(shirt|trouser|dress|bag|scarf|wallet|belt)/.test(merchandisingText) ? 10 : 4) +
        (sellableStock >= 5 ? 5 : 0)),
      summer_sale: Math.min(100,
        (/(summer|linen|cotton|short)/.test(merchandisingText) ? 30 : 0) +
        (stockAgeDays > 90 ? 20 : stockAgeDays > 60 ? 10 : 0) +
        (max > 0 && stock >= max ? 15 : stock > min + 5 ? 8 : 0) +
        (sold <= 2 ? 15 : previous > 0 && sold / previous < 0.75 ? 10 : 0) +
        (grossMargin > 55 ? 10 : grossMargin > 45 ? 5 : 0) +
        (favorites >= 5 && favoriteConversion < 0.4 ? 10 : 0)),
      year_end: Math.min(100,
        (stockAgeDays > 180 ? 25 : stockAgeDays > 90 ? 18 : stockAgeDays > 60 ? 10 : 0) +
        (daysOfCover > 180 ? 20 : daysOfCover > 90 ? 14 : daysOfCover > 60 ? 7 : 0) +
        (previous > 0 && sold / previous < 0.75 ? 15 : sold <= 2 ? 10 : 0) +
        (["seasonal","end_of_season","discontinued"].includes(row.lifecycle) ? 15 : 5) +
        (grossMargin > 55 ? 10 : grossMargin > 45 ? 5 : 0) +
        (favorites >= 5 && favoriteConversion < 0.4 ? 10 : 0) +
        (sellableStock > 0 && sellableStock < 5 ? 5 : 0)),
      clearance: Math.min(100,
        (stockAgeDays > 180 ? 30 : stockAgeDays > 90 ? 22 : stockAgeDays > 60 ? 12 : 0) +
        (max > 0 && stock >= max ? 25 : stock > min + 5 ? 12 : 0) +
        (daysOfCover > 180 ? 20 : daysOfCover > 90 ? 14 : daysOfCover > 60 ? 7 : 0) +
        (sold === 0 ? 15 : sold <= 2 ? 10 : 0) +
        (baselineHoldingTotal > 0 ? 10 : 0)),
    };

    return {
      ...row,
      eligible: exclusionReasons.length === 0 && score >= 75 && recommendedPercent > 0 && netBenefitVsBaseline > 0,
      exclusionReasons, score, reasons, displayReasons: displayReasons.slice(0, 4), risks, safeMaxPercent, recommendedPercent,
      businessGoal, durationDays, daysOfCover, stockAgeDays, launchAgeDays, favoriteConversion,
      grossMargin, sellableStock, expectedUnits, proposedPrice,
      estimatedBudget: discountCost,
      maximumExposure: discountPerUnit * sellableStock,
      projectedRevenue, projectedCost, projectedGrossProfit, projectedGrossMargin, confidence,
      recommendationLabel,
      decisionSummary,
      financialSummary: {
        baseline: {
          units: baselineUnitsInPeriod,
          revenue: Math.round(baselineRevenue),
          grossProfit: Math.round(baselineGrossProfit),
          endingStock: baselineEndingStock,
          holdingCost: baselineHoldingTotal,
          holdingBreakdown: baselineHolding,
        },
        promotion: {
          units: expectedUnits,
          revenue: Math.round(projectedRevenue),
          revenueRange: {
            low: Math.round(lowUnits * proposedPrice),
            high: Math.round(highUnits * proposedPrice),
          },
          grossProfit: Math.round(projectedGrossProfit),
          endingStock: promotionEndingStock,
          holdingCost: promotionHoldingTotal,
          holdingBreakdown: promotionHolding,
          discountCost: Math.round(discountCost),
        },
        avoidedHoldingCost,
        netBenefitVsBaseline: Math.round(netBenefitVsBaseline),
        breakEvenUnits,
        assumptions: {
          capitalRateAnnual: 12,
          storageRateAnnual: 6,
          riskRateAnnual: 8,
        },
      },
      campaignFitScores,
      dataQuality: {
        actualUnits,
        simulatedUnits,
        actualDataPercent,
        label: sourceTotal === 0 ? "Chưa có lịch sử bán" : actualDataPercent >= 60 ? "Chủ yếu dữ liệu thực tế" : actualDataPercent > 0 ? "Kết hợp dữ liệu thực tế và mô phỏng" : "Chủ yếu dữ liệu mô phỏng",
      },
    };
  }).sort((a,b) => Number(b.eligible)-Number(a.eligible) || b.score-a.score || a.sku.localeCompare(b.sku));
  const generatedAt = new Date().toISOString();
  await getPool().request().query("UPDATE PromotionRecommendationRefreshEvents SET processed_at=GETDATE() WHERE processed_at IS NULL").catch(() => null);
  const responsePayload = { success: true, generatedAt, cached: false, refresh: { pendingChanges: Number(refreshState.recordset[0]?.pending_count || 0), oldestChangeAt: refreshState.recordset[0]?.oldest_change_at || null, reasons: refreshState.recordset[0]?.reasons || null, nextAutomaticRefreshAt: new Date(Date.now() + 3600000).toISOString(), mode: "hourly_or_manual" }, methodology: { minimumScore: 75, maximumNormalDiscount: 25, coolingOffDays: 30, recognitionRule: "delivered_and_paid" }, suggestions };
  await getPool().request()
    .input("payload", sql.NVarChar(sql.MAX), JSON.stringify(responsePayload))
    .input("actor", sql.NVarChar, req.user?.id || "system")
    .query(`MERGE PromotionRecommendationSnapshot AS target USING (SELECT CAST(1 AS TINYINT) id) source ON target.id=source.id
      WHEN MATCHED THEN UPDATE SET payload_json=@payload,generated_at=GETDATE(),generated_by=@actor
      WHEN NOT MATCHED THEN INSERT(id,payload_json,generated_at,generated_by) VALUES(1,@payload,GETDATE(),@actor);`).catch(() => null);
  return res.json(responsePayload);
}

export async function archivePromotion(req, res) {
  await getPool().request().input("id", sql.Int, Number(req.params.id)).input("actor", sql.NVarChar, req.user.id).query("UPDATE Promotions SET is_archived=1,status='paused',updated_by=@actor,updated_at=GETDATE() WHERE id=@id; UPDATE PromotionSkuReservations SET status='released',released_at=GETDATE(),release_reason=N'Chương trình đã lưu trữ' WHERE promotion_id=@id AND status IN ('reserved','active','paused_hold')");
  return res.json({ success: true });
}

export async function promotionReport(req, res) {
  const result = await getPool().request().query(`SELECT p.id,p.name,p.discount_type,p.used_count,p.budget_total,p.budget_reserved,p.budget_spent,
    COUNT(u.id) usage_count,COALESCE(SUM(u.discount_amount),0) discount_total,COALESCE(SUM(u.shipping_discount),0) shipping_discount_total,
    COALESCE(SUM(o.original_subtotal),0) attributed_original_revenue,COALESCE(SUM(o.total_amount),0) attributed_net_revenue,
    COALESCE(SUM(costs.cost_total),0) attributed_cost,
    COALESCE(SUM(o.total_amount),0)-COALESCE(SUM(costs.cost_total),0) estimated_margin
    FROM Promotions p LEFT JOIN PromotionUsages u ON u.promotion_id=p.id AND u.status='consumed'
    LEFT JOIN Orders o ON o.id=u.order_id
    OUTER APPLY (SELECT SUM(COALESCE(oi.unit_cost_snapshot,0)*oi.quantity) cost_total FROM OrderItems oi WHERE oi.order_id=o.id) costs
    GROUP BY p.id,p.name,p.discount_type,p.used_count,p.budget_total,p.budget_reserved,p.budget_spent ORDER BY discount_total DESC`);
  return res.json({ success: true, report: result.recordset });
}

export async function getPromotionEmailAudience(req, res) {
  const [subscribers, customers] = await Promise.all([
    db.getActiveNewsletterSubscribers(),
    db.getActiveCustomerEmails(),
  ]);
  const combined = normalizeRecipients([
    ...subscribers.map((s) => s.email),
    ...customers.map((c) => c.email),
  ]);
  return res.json({
    success: true,
    audience: {
      newsletterCount: subscribers.length,
      customerCount: customers.length,
      combinedCount: combined.length,
      newsletterEmails: subscribers.map((s) => s.email),
      customerEmails: customers.map((c) => c.email),
    },
  });
}

function formatPromotionEmailDefaults(promoRow) {
  if (!promoRow) {
    return {
      promoTitle: "An Exclusive Privilege From Maison Rue",
      promoDescription: "Enjoy a curated private privilege across our latest luxury collections.",
      discountLabel: "Exclusive Promotional Privilege",
      minimumOrderText: "",
      validUntilText: "",
    };
  }
  const value = Number(promoRow.discount_value || 0);
  const discountLabel =
    promoRow.discount_type === "percentage"
      ? `${value}% OFF`
      : promoRow.discount_type === "free_shipping"
      ? "Complimentary Shipping"
      : `${value.toLocaleString("en-US")} VND OFF`;
  const minOrder = Number(promoRow.minimum_order_value || 0);
  const minimumOrderText = minOrder > 0 ? `Minimum order of ${minOrder.toLocaleString("en-US")} VND` : "No minimum order required";
  const validUntilText = promoRow.end_at
    ? new Date(promoRow.end_at).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
    : "While supplies last";

  return {
    promoTitle: promoRow.public_title || promoRow.name || "An Exclusive Privilege From Maison Rue",
    promoDescription:
      promoRow.display_description ||
      promoRow.public_description ||
      promoRow.description ||
      "Enjoy a curated private privilege across our latest luxury collections.",
    discountLabel,
    minimumOrderText,
    validUntilText,
  };
}

export async function sendPromotionEmailCampaign(req, res) {
  const body = req.body || {};
  const promoCode = normalizeCode(body.promoCode || body.code || "");
  if (!promoCode) {
    return res.status(400).json({ success: false, error: "Vui lòng nhập hoặc chọn mã ưu đãi (Promotion Code)." });
  }

  const audience = String(body.audience || "both").trim().toLowerCase();
  const rawCustom = String(body.customEmails || "")
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  let recipientList = [];
  if (audience === "newsletter" || audience === "both") {
    const subscribers = await db.getActiveNewsletterSubscribers();
    recipientList.push(...subscribers.map((s) => s.email));
  }
  if (audience === "customers" || audience === "both") {
    const customers = await db.getActiveCustomerEmails();
    recipientList.push(...customers.map((c) => c.email));
  }
  if (audience === "custom" || rawCustom.length > 0) {
    recipientList.push(...rawCustom);
  }

  const recipients = normalizeRecipients(recipientList);
  if (recipients.length === 0) {
    return res.status(400).json({
      success: false,
      error: "Không có email người nhận hợp lệ. Hãy kiểm tra danh sách Newsletter, Khách hàng hoặc nhập email nhận.",
    });
  }

  const promoLookup = await getPool()
    .request()
    .input("code", sql.NVarChar(80), promoCode)
    .query(`
      SELECT TOP 1 pc.code, pc.display_description, p.name, p.description, p.public_title, p.public_description,
        p.discount_type, p.discount_value, p.minimum_order_value, p.end_at
      FROM PromotionCodes pc
      JOIN Promotions p ON p.id = pc.promotion_id
      WHERE UPPER(pc.code) = @code
      ORDER BY pc.id DESC
    `);

  const defaults = formatPromotionEmailDefaults(promoLookup.recordset[0] || null);
  const promoTitle = String(body.promoTitle || "").trim() || defaults.promoTitle;
  const promoDescription = String(body.promoDescription || "").trim() || defaults.promoDescription;
  const discountLabel = String(body.discountLabel || "").trim() || defaults.discountLabel;
  const minimumOrderText = String(body.minimumOrderText || "").trim() || defaults.minimumOrderText;
  const validUntilText = String(body.validUntilText || "").trim() || defaults.validUntilText;

  let sentCount = 0;
  let failedCount = 0;
  const failedRecipients = [];

  for (const recipientEmail of recipients) {
    const result = await sendPromotionCampaignEmail({
      recipientEmail,
      promoCode,
      promoTitle,
      promoDescription,
      discountLabel,
      minimumOrderText,
      validUntilText,
    });
    if (result?.success) {
      sentCount++;
    } else {
      failedCount++;
      failedRecipients.push({ email: recipientEmail, error: result?.error || "Send failed" });
    }
  }

  return res.json({
    success: sentCount > 0,
    promoCode,
    totalRecipients: recipients.length,
    sentCount,
    failedCount,
    failedRecipients,
    message:
      failedCount === 0
        ? `Đã gửi email mã ưu đãi ${promoCode} thành công tới ${sentCount} khách hàng.`
        : `Đã gửi ${sentCount}/${recipients.length} email (${failedCount} email thất bại).`,
  });
}
