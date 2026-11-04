import sql from "mssql";
import { getPool } from "../config/db.js";
import { calculatePromotions, normalizeCode } from "../services/promotionService.js";

const effectiveStatus = (row) => row.is_archived ? "archived" : row.status === "paused" ? "paused" : row.status === "draft" ? "draft" : new Date(row.start_at) > new Date() ? "scheduled" : row.end_at && new Date(row.end_at) <= new Date() ? "expired" : row.usage_limit_total && row.used_count >= row.usage_limit_total ? "exhausted" : "active";

export async function previewPromotion(req, res) {
  try {
    const items = [];
    for (const raw of req.body.items || []) {
      const product = await (await import("../config/db.js")).db.getProductById(raw.id);
      if (!product) throw new Error("Một sản phẩm trong giỏ không còn tồn tại.");
      const variant = raw.variantId ? product.variants.find((entry) => entry.id === raw.variantId) : null;
      items.push({ ...raw, price: Number(variant?.price ?? product.price), quantity: Math.max(1, Number(raw.quantity) || 1), category: product.category, productType: product.productType, subcategory: product.subcategory, audience: product.audience, gender: product.gender, variantId: variant?.id || raw.variantId });
    }
    const pricing = await calculatePromotions({ items, code: req.body.code, customerId: req.user?.role === "customer" ? req.user.id : null, shippingFee: Number(req.body.shippingFee || 0) });
    return res.json({ success: true, pricing });
  } catch (error) { return res.status(400).json({ success: false, error: error.message }); }
}

export async function catalogPromotionPrices(req, res) {
  try {
    const { db } = await import("../config/db.js");
    const products = await db.getAllProducts();
    const items = products.map((product) => ({ id: product.id, price: Number(product.price), quantity: 1, category: product.category, productType: product.productType, subcategory: product.subcategory, audience: product.audience, gender: product.gender, variantId: product.variants?.[0]?.id || null }));
    const pricing = await calculatePromotions({ items });
    const prices = Object.fromEntries(pricing.items.map((item) => [item.id, { originalPrice: item.originalUnitPrice, salePrice: item.finalLineTotal, discount: item.automaticDiscount, promotionName: item.automaticPromotion?.name || null }]));
    return res.json({ success: true, prices });
  } catch (error) { return res.status(500).json({ success: false, error: error.message }); }
}

export async function listPromotions(req, res) {
  const pool = getPool();
  const rows = await pool.request().query(`SELECT p.*, (SELECT STRING_AGG(CONCAT(target_type,':',target_value),', ') FROM PromotionTargets WHERE promotion_id=p.id AND is_excluded=0) targets, (SELECT STRING_AGG(code,', ') FROM PromotionCodes WHERE promotion_id=p.id AND is_active=1) codes FROM Promotions p ORDER BY p.created_at DESC`);
  return res.json({ success: true, promotions: rows.recordset.map((row) => ({ ...row, effective_status: effectiveStatus(row) })) });
}

async function persistPromotion(req, res, id = null) {
  const body = req.body;
  const pool = getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const request = transaction.request().input("name", sql.NVarChar, String(body.name || "").trim()).input("description", sql.NVarChar, body.description || null).input("type", sql.NVarChar, body.discountType).input("value", sql.Decimal(18,2), Number(body.discountValue || 0)).input("max", sql.Decimal(18,0), body.maximumDiscount || null).input("min", sql.Decimal(18,0), Number(body.minimumOrderValue || 0)).input("automatic", sql.Bit, body.isAutomatic ? 1 : 0).input("stacking", sql.NVarChar, body.stackingPolicy || "none").input("priority", sql.Int, Number(body.priority || 0)).input("requirement", sql.NVarChar, body.customerRequirement || "any").input("total_limit", sql.Int, body.usageLimitTotal || null).input("customer_limit", sql.Int, body.usageLimitPerCustomer || null).input("start", sql.DateTime2, new Date(body.startAt)).input("end", sql.DateTime2, body.endAt ? new Date(body.endAt) : null).input("status", sql.NVarChar, body.status || "draft").input("actor", sql.NVarChar, req.user.id);
    let promotionId = id;
    if (id) {
      request.input("id", sql.Int, id);
      await request.query(`UPDATE Promotions SET name=@name,description=@description,discount_type=@type,discount_value=@value,maximum_discount=@max,minimum_order_value=@min,is_automatic=@automatic,stacking_policy=@stacking,priority=@priority,customer_requirement=@requirement,usage_limit_total=@total_limit,usage_limit_per_customer=@customer_limit,start_at=@start,end_at=@end,status=@status,updated_by=@actor,updated_at=GETDATE() WHERE id=@id AND is_archived=0`);
      await transaction.request().input("id", sql.Int, id).query("DELETE FROM PromotionTargets WHERE promotion_id=@id");
    } else {
      const inserted = await request.query(`INSERT INTO Promotions(name,description,discount_type,discount_value,maximum_discount,minimum_order_value,is_automatic,stacking_policy,priority,customer_requirement,usage_limit_total,usage_limit_per_customer,start_at,end_at,status,created_by,updated_by) OUTPUT INSERTED.id VALUES(@name,@description,@type,@value,@max,@min,@automatic,@stacking,@priority,@requirement,@total_limit,@customer_limit,@start,@end,@status,@actor,@actor)`);
      promotionId = inserted.recordset[0].id;
    }
    const targets = Array.isArray(body.targets) && body.targets.length ? body.targets : [{ type: "store", value: "all" }];
    for (const target of targets) await transaction.request().input("id", sql.Int, promotionId).input("type", sql.NVarChar, target.type).input("value", sql.NVarChar, String(target.value)).input("excluded", sql.Bit, target.excluded ? 1 : 0).query("INSERT INTO PromotionTargets(promotion_id,target_type,target_value,is_excluded) VALUES(@id,@type,@value,@excluded)");
    if (!id && body.code) await transaction.request().input("id", sql.Int, promotionId).input("code", sql.NVarChar, normalizeCode(body.code)).input("limit", sql.Int, body.codeUsageLimit || null).query("INSERT INTO PromotionCodes(promotion_id,code,usage_limit) VALUES(@id,@code,@limit)");
    await transaction.request().input("id", sql.Int, promotionId).input("action", sql.NVarChar, id ? "updated" : "created").input("data", sql.NVarChar, JSON.stringify(body)).input("actor", sql.NVarChar, `${req.user.name} (${req.user.role})`).query("INSERT INTO PromotionAuditLogs(promotion_id,action,new_data,performed_by) VALUES(@id,@action,@data,@actor)");
    await transaction.commit();
    return res.status(id ? 200 : 201).json({ success: true, id: promotionId });
  } catch (error) { await transaction.rollback(); return res.status(400).json({ success: false, error: error.message }); }
}

export const createPromotion = (req, res) => persistPromotion(req, res);
export const updatePromotion = (req, res) => persistPromotion(req, res, Number(req.params.id));

export async function updatePromotionStatus(req, res) {
  const status = String(req.body.status || "");
  if (!["draft","active","paused"].includes(status)) return res.status(400).json({ success: false, error: "Trạng thái không hợp lệ." });
  await getPool().request().input("id", sql.Int, Number(req.params.id)).input("status", sql.NVarChar, status).input("actor", sql.NVarChar, req.user.id).query("UPDATE Promotions SET status=@status,updated_by=@actor,updated_at=GETDATE() WHERE id=@id AND is_archived=0");
  return res.json({ success: true });
}

export async function archivePromotion(req, res) {
  await getPool().request().input("id", sql.Int, Number(req.params.id)).input("actor", sql.NVarChar, req.user.id).query("UPDATE Promotions SET is_archived=1,status='paused',updated_by=@actor,updated_at=GETDATE() WHERE id=@id");
  return res.json({ success: true });
}

export async function promotionReport(req, res) {
  const result = await getPool().request().query(`SELECT p.id,p.name,p.discount_type,p.used_count,COUNT(u.id) usage_count,COALESCE(SUM(u.discount_amount),0) discount_total,COALESCE(SUM(u.shipping_discount),0) shipping_discount_total FROM Promotions p LEFT JOIN PromotionUsages u ON u.promotion_id=p.id AND u.status='consumed' GROUP BY p.id,p.name,p.discount_type,p.used_count ORDER BY discount_total DESC`);
  return res.json({ success: true, report: result.recordset });
}
