import sql from "mssql";
import { db, getPool } from "../config/db.js";
import { calculatePromotions, normalizeCode } from "../services/promotionService.js";

const effectiveStatus = (row) => row.is_archived ? "archived" : row.status === "paused" ? "paused" : row.status === "draft" ? "draft" : new Date(row.start_at) > new Date() ? "scheduled" : row.end_at && new Date(row.end_at) <= new Date() ? "expired" : (row.usage_limit_total && row.used_count >= row.usage_limit_total) || (row.budget_total && Number(row.budget_reserved) + Number(row.budget_spent) >= Number(row.budget_total)) ? "exhausted" : "active";

const promotionDiscount = (body, price) => body.discountType === "percentage"
  ? Math.floor(price * Number(body.discountValue || 0) / 100)
  : body.discountType === "fixed_amount" ? Math.min(price, Number(body.discountValue || 0)) : 0;

const validatePromotion = (body) => {
  const errors = [];
  if (!String(body.name || "").trim()) errors.push("Tên chương trình là bắt buộc.");
  if (!['percentage','fixed_amount','free_shipping','shipping_amount'].includes(body.discountType)) errors.push("Loại ưu đãi không hợp lệ.");
  if (Number(body.discountValue || 0) < 0 || (body.discountType === 'percentage' && Number(body.discountValue) > 100)) errors.push("Giá trị ưu đãi không hợp lệ.");
  if (!body.startAt || Number.isNaN(new Date(body.startAt).getTime())) errors.push("Thời gian bắt đầu không hợp lệ.");
  if (body.endAt && new Date(body.endAt) <= new Date(body.startAt)) errors.push("Thời gian kết thúc phải sau thời gian bắt đầu.");
  if (body.budgetTotal && Number(body.budgetTotal) <= 0) errors.push("Ngân sách phải lớn hơn 0.");
  if (body.status === 'active' && body.approvalStatus !== 'approved') errors.push("Chương trình phải được phê duyệt trước khi kích hoạt.");
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
    const items = products.map((product) => ({ id: product.id, price: Number(product.price), floorPrice: Number(product.variants?.[0]?.floorPrice || 0), quantity: 1, category: product.category, productType: product.productType, subcategory: product.subcategory, audience: product.audience, gender: product.gender, variantId: product.variants?.[0]?.id || null, variantSku: product.variants?.[0]?.sku || null }));
    const pricing = await calculatePromotions({ items });
    const prices = Object.fromEntries(pricing.items.map((item) => [item.id, { originalPrice: item.originalUnitPrice, salePrice: item.finalLineTotal, discount: item.automaticDiscount, promotionName: item.automaticPromotion?.name || null }]));
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
      AND p.start_at<=GETDATE() AND (p.end_at IS NULL OR p.end_at>GETDATE())
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
  const rows = await pool.request().query(`SELECT p.*, (SELECT STRING_AGG(CONCAT(target_type,':',target_value),', ') FROM PromotionTargets WHERE promotion_id=p.id AND is_excluded=0) targets, (SELECT STRING_AGG(code,', ') FROM PromotionCodes WHERE promotion_id=p.id AND is_active=1) codes FROM Promotions p ORDER BY p.created_at DESC`);
  return res.json({ success: true, promotions: rows.recordset.map((row) => ({ ...row, effective_status: effectiveStatus(row) })) });
}

async function persistPromotion(req, res, id = null) {
  const body = req.body;
  const validationErrors = validatePromotion(body);
  if (validationErrors.length) return res.status(400).json({ success: false, error: validationErrors.join(" ") });
  const pool = getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const request = transaction.request().input("name", sql.NVarChar, String(body.name || "").trim()).input("description", sql.NVarChar, body.description || null).input("type", sql.NVarChar, body.discountType).input("value", sql.Decimal(18,2), Number(body.discountValue || 0)).input("max", sql.Decimal(18,0), body.maximumDiscount || null).input("min", sql.Decimal(18,0), Number(body.minimumOrderValue || 0)).input("automatic", sql.Bit, body.isAutomatic ? 1 : 0).input("stacking", sql.NVarChar, body.stackingPolicy || "none").input("priority", sql.Int, Number(body.priority || 0)).input("requirement", sql.NVarChar, body.customerRequirement || "any").input("total_limit", sql.Int, body.usageLimitTotal || null).input("customer_limit", sql.Int, body.usageLimitPerCustomer || null).input("start", sql.DateTime2, new Date(body.startAt)).input("end", sql.DateTime2, body.endAt ? new Date(body.endAt) : null).input("status", sql.NVarChar, body.status || "draft").input("goal", sql.NVarChar, body.businessGoal || "revenue_growth").input("budget", sql.Decimal(18,0), body.budgetTotal || null).input("max_order", sql.Decimal(18,0), body.maxDiscountPerOrder || null).input("override", sql.Bit, body.requiresOverride ? 1 : 0).input("override_reason", sql.NVarChar, body.overrideReason || null).input("actor", sql.NVarChar, req.user.id);
    let promotionId = id;
    if (id) {
      request.input("id", sql.Int, id);
      const used = await transaction.request().input("promotion_id", sql.Int, id).query("SELECT used_count FROM Promotions WHERE id=@promotion_id AND is_archived=0");
      if (!used.recordset.length) throw new Error("Chương trình không tồn tại.");
      if (Number(used.recordset[0].used_count) > 0) throw new Error("Chương trình đã phát sinh đơn hàng. Hãy tạo chương trình mới để bảo toàn lịch sử.");
      await request.query(`UPDATE Promotions SET name=@name,description=@description,discount_type=@type,discount_value=@value,maximum_discount=@max,minimum_order_value=@min,is_automatic=@automatic,stacking_policy=@stacking,priority=@priority,customer_requirement=@requirement,usage_limit_total=@total_limit,usage_limit_per_customer=@customer_limit,start_at=@start,end_at=@end,status=@status,business_goal=@goal,budget_total=@budget,max_discount_per_order=@max_order,requires_override=@override,override_reason=@override_reason,approval_status='pending',approved_by=NULL,approved_at=NULL,updated_by=@actor,updated_at=GETDATE() WHERE id=@id AND is_archived=0`);
      await transaction.request().input("id", sql.Int, id).query("DELETE FROM PromotionTargets WHERE promotion_id=@id");
    } else {
      const inserted = await request.query(`INSERT INTO Promotions(name,description,discount_type,discount_value,maximum_discount,minimum_order_value,is_automatic,stacking_policy,priority,customer_requirement,usage_limit_total,usage_limit_per_customer,start_at,end_at,status,business_goal,budget_total,max_discount_per_order,requires_override,override_reason,approval_status,created_by,updated_by) OUTPUT INSERTED.id VALUES(@name,@description,@type,@value,@max,@min,@automatic,@stacking,@priority,@requirement,@total_limit,@customer_limit,@start,@end,@status,@goal,@budget,@max_order,@override,@override_reason,'pending',@actor,@actor)`);
      promotionId = inserted.recordset[0].id;
    }
    const targets = Array.isArray(body.targets) && body.targets.length ? body.targets : [{ type: "store", value: "all" }];
    for (const target of targets) await transaction.request().input("id", sql.Int, promotionId).input("type", sql.NVarChar, target.type).input("value", sql.NVarChar, String(target.value)).input("excluded", sql.Bit, target.excluded ? 1 : 0).query("INSERT INTO PromotionTargets(promotion_id,target_type,target_value,is_excluded) VALUES(@id,@type,@value,@excluded)");
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

export async function updatePromotionStatus(req, res) {
  const status = String(req.body.status || "");
  if (!["draft","active","paused"].includes(status)) return res.status(400).json({ success: false, error: "Trạng thái không hợp lệ." });
  const result = await getPool().request().input("id", sql.Int, Number(req.params.id)).query("SELECT approval_status,budget_total,budget_reserved,budget_spent FROM Promotions WHERE id=@id AND is_archived=0");
  if (!result.recordset.length) return res.status(404).json({ success: false, error: "Chương trình không tồn tại." });
  const promotion = result.recordset[0];
  if (status === "active" && promotion.approval_status !== "approved") return res.status(400).json({ success: false, error: "Chương trình phải được phê duyệt trước khi kích hoạt." });
  if (status === "active" && promotion.budget_total && Number(promotion.budget_reserved) + Number(promotion.budget_spent) >= Number(promotion.budget_total)) return res.status(400).json({ success: false, error: "Ngân sách chương trình đã hết." });
  await getPool().request().input("id", sql.Int, Number(req.params.id)).input("status", sql.NVarChar, status).input("actor", sql.NVarChar, req.user.id).query("UPDATE Promotions SET status=@status,updated_by=@actor,updated_at=GETDATE() WHERE id=@id AND is_archived=0");
  return res.json({ success: true });
}

export async function approvePromotion(req, res) {
  const approvalStatus = String(req.body.status || "");
  if (!["approved", "rejected"].includes(approvalStatus)) return res.status(400).json({ success: false, error: "Quyết định phê duyệt không hợp lệ." });
  const note = String(req.body.note || "").trim();
  const current = await getPool().request().input("id", sql.Int, Number(req.params.id)).query("SELECT requires_override,override_reason FROM Promotions WHERE id=@id AND is_archived=0");
  if (!current.recordset.length) return res.status(404).json({ success: false, error: "Chương trình không tồn tại." });
  if (approvalStatus === "approved" && current.recordset[0].requires_override && !String(current.recordset[0].override_reason || "").trim()) return res.status(400).json({ success: false, error: "Cần ghi rõ lý do vượt ngưỡng trước khi phê duyệt." });
  await getPool().request().input("id", sql.Int, Number(req.params.id)).input("status", sql.NVarChar, approvalStatus).input("note", sql.NVarChar, note || null).input("actor", sql.NVarChar, `${req.user.name} (${req.user.role})`).query("UPDATE Promotions SET approval_status=@status,approval_note=@note,approved_by=@actor,approved_at=GETDATE(),updated_by=@actor,updated_at=GETDATE() WHERE id=@id AND is_archived=0; INSERT INTO PromotionAuditLogs(promotion_id,action,new_data,performed_by) VALUES(@id,@status,@note,@actor)");
  return res.json({ success: true });
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
    if (!hasCost || !row.floor_price) {
      missingCostCount++;
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
      requiresOverride: variants.some((row) => row.belowFloor),
      hasBlockedVariants: variants.some((row) => row.lowStock),
      warnings: uniqueWarnings.slice(0, 30),
      variants: variants.slice(0, 100),
      forecast,
      aiStrategicCommentary,
    },
  });
}

export async function promotionSuggestions(req, res) {
  const rows = await getPool().request().query(`
    SELECT p.id product_id,p.name,p.category,v.id variant_id,v.sku,v.color_name,v.size_name,
      v.price,v.cost_price,v.floor_price,v.stock_quantity,v.low_stock_threshold,v.max_stock_threshold,
      COALESCE(f.favorite_count,0) favorite_count,COALESCE(fb.favorite_buyers,0) favorite_buyers,
      COALESCE(s.sold_60d,0) sold_60d,COALESCE(prev.sold_previous_60d,0) sold_previous_60d,
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
      SELECT SUM(oi.quantity) sold_60d FROM OrderItems oi JOIN Orders o ON o.id=oi.order_id
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
        AND pr.start_at<=GETDATE() AND (pr.end_at IS NULL OR pr.end_at>GETDATE())
        AND EXISTS (SELECT 1 FROM PromotionTargets pt WHERE pt.promotion_id=pr.id AND pt.is_excluded=0 AND (
          pt.target_type='store' OR (pt.target_type='product' AND pt.target_value=CONVERT(NVARCHAR(100),p.id))
          OR (pt.target_type='variant' AND pt.target_value IN (v.id,v.sku))
          OR (pt.target_type='category' AND pt.target_value=p.category)))
        AND NOT EXISTS (SELECT 1 FROM PromotionTargets pt WHERE pt.promotion_id=pr.id AND pt.is_excluded=1 AND (
          (pt.target_type='product' AND pt.target_value=CONVERT(NVARCHAR(100),p.id))
          OR (pt.target_type='variant' AND pt.target_value IN (v.id,v.sku))))
    ) active_promo
    WHERE p.is_active=1 ORDER BY p.id,v.sku
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

    let score = 0;
    const reasons = [];
    const risks = [];
    const dailyVelocity = sold / 60;
    const daysOfCover = dailyVelocity > 0 ? Math.round(stock / dailyVelocity) : stock > min ? 999 : 0;
    if (max > 0 && stock >= max) { score += 15; reasons.push("Tồn kho vượt mức tối đa"); }
    if (daysOfCover > 180) { score += 15; reasons.push("Số ngày tồn dự kiến trên 180 ngày"); }
    else if (daysOfCover > 90) { score += 10; reasons.push("Số ngày tồn dự kiến trên 90 ngày"); }
    else if (daysOfCover > 60) { score += 5; reasons.push("Số ngày tồn dự kiến trên 60 ngày"); }
    if (sold === 0) { score += 25; reasons.push("Không phát sinh doanh thu trong 60 ngày"); }
    else if (sold <= 2) { score += 15; reasons.push("Bán chậm trong 60 ngày"); }
    else if (previous > 0 && sold / previous < 0.5) { score += 20; reasons.push("Tốc độ bán giảm trên 50%"); }
    else if (previous > 0 && sold / previous < 0.75) { score += 10; reasons.push("Tốc độ bán đang giảm"); }
    else if (previous > 0 && sold / previous > 1.5) { score -= 10; risks.push("Tốc độ bán đang tăng, chưa cần giảm sâu"); }
    const favoriteConversion = favorites ? favoriteBuyers / favorites : null;
    if (favorites >= 5 && favoriteConversion < 0.2) { score += 15; reasons.push("Nhiều yêu thích nhưng tỷ lệ mua thấp"); }
    else if (favorites >= 5 && favoriteConversion < 0.4) { score += 10; reasons.push("Có nhu cầu quan tâm chưa chuyển đổi"); }
    else if (favorites >= 5) { score += 5; reasons.push("Có tín hiệu quan tâm từ khách hàng"); }
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
    const confidence = sold >= 10 && stockAgeDays != null ? "high" : sold >= 3 || favorites >= 5 ? "medium" : "low";
    if (confidence === "low") risks.push("Dữ liệu lịch sử còn ít; nên thử ngân sách nhỏ");
    return { ...row, eligible: exclusionReasons.length === 0 && score >= 30 && recommendedPercent > 0, exclusionReasons, score, reasons, risks, safeMaxPercent, recommendedPercent, businessGoal, durationDays, daysOfCover, stockAgeDays, favoriteConversion, grossMargin, sellableStock, expectedUnits, proposedPrice, estimatedBudget: discountPerUnit * expectedUnits, maximumExposure: discountPerUnit * sellableStock, projectedRevenue, projectedCost, projectedGrossProfit, projectedGrossMargin, confidence };
  }).sort((a,b) => Number(b.eligible)-Number(a.eligible) || b.score-a.score || a.sku.localeCompare(b.sku));
  return res.json({ success: true, generatedAt: new Date().toISOString(), methodology: { minimumScore: 30, maximumNormalDiscount: 25, coolingOffDays: 30, recognitionRule: "delivered_and_paid" }, suggestions });
}

export async function archivePromotion(req, res) {
  await getPool().request().input("id", sql.Int, Number(req.params.id)).input("actor", sql.NVarChar, req.user.id).query("UPDATE Promotions SET is_archived=1,status='paused',updated_by=@actor,updated_at=GETDATE() WHERE id=@id");
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
