import sql from "mssql";
import { getPool } from "../config/db.js";

const roundMoney = (value) => Math.max(0, Math.floor(Number(value || 0)));
export const normalizeCode = (value) => String(value || "").trim().toUpperCase();

const targetMatches = (promotion, item) => {
  const targets = promotion.targets || [];
  const included = targets.filter((target) => !target.is_excluded);
  const excluded = targets.filter((target) => target.is_excluded);
  const matches = (target) => target.target_type === "store" ||
    (target.target_type === "product" && String(item.id) === target.target_value) ||
    (target.target_type === "variant" && [String(item.variantId || ""), String(item.variantSku || item.sku || "")].includes(target.target_value)) ||
    (target.target_type === "category" && [item.category, item.productType, item.subcategory].includes(target.target_value)) ||
    (target.target_type === "audience" && [item.audience, item.gender].includes(target.target_value));
  return (included.length === 0 || included.some(matches)) && !excluded.some(matches);
};

const productDiscount = (promotion, item) => {
  const lineTotal = roundMoney(item.price * item.quantity);
  if (promotion.discount_type === "percentage") {
    const discount = roundMoney(lineTotal * Number(promotion.discount_value) / 100);
    return promotion.maximum_discount ? Math.min(discount, Number(promotion.maximum_discount)) : discount;
  }
  if (promotion.discount_type === "fixed_amount") return Math.min(lineTotal, roundMoney(promotion.discount_value) * item.quantity);
  return 0;
};

const hasPromotionStockHeadroom = (item) => {
  if (item.stock == null || item.lowStockThreshold == null) return true;
  return Number(item.stock) - Number(item.quantity || 1) >= Number(item.lowStockThreshold);
};

export async function loadPromotion(poolOrTransaction, normalizedCode = "") {
  const request = poolOrTransaction.request();
  request.input("code", sql.NVarChar, normalizedCode || null);
  const result = await request.query(`
    SELECT DISTINCT p.*,pc.id promotion_code_id,pc.code,pc.usage_limit code_usage_limit,pc.used_count code_used_count,pc.is_active code_is_active,pc.distribution_type
    FROM Promotions p LEFT JOIN PromotionCodes pc ON pc.promotion_id=p.id AND pc.normalized_code=@code
    WHERE p.is_archived=0 AND p.status='active' AND p.approval_status='approved' AND p.start_at<=GETDATE() AND (p.end_at IS NULL OR p.end_at>GETDATE())
      AND (p.usage_limit_total IS NULL OR p.used_count<p.usage_limit_total)
      AND (p.budget_total IS NULL OR p.budget_reserved+p.budget_spent<p.budget_total)
      AND (p.is_automatic=1 OR pc.id IS NOT NULL)`);
  const promotions = result.recordset;
  if (!promotions.length) return [];
  const ids = promotions.map((item) => item.id);
  const targetResult = await poolOrTransaction.request().query(`SELECT * FROM PromotionTargets WHERE promotion_id IN (${ids.join(",")})`);
  return promotions.map((promotion) => ({ ...promotion, targets: targetResult.recordset.filter((target) => target.promotion_id === promotion.id) }));
}

export async function calculatePromotions({ items, code = "", customerId = null, shippingFee = 0 }, poolOrTransaction = getPool()) {
  const normalizedCode = normalizeCode(code);
  const promotions = await loadPromotion(poolOrTransaction, normalizedCode);
  const automatic = promotions.filter((promotion) => promotion.is_automatic);
  const codePromotion = normalizedCode ? promotions.find((promotion) => promotion.promotion_code_id) : null;
  if (normalizedCode && !codePromotion) throw new Error("Mã giảm giá không tồn tại, đã hết hạn hoặc đã hết lượt sử dụng.");
  if (codePromotion?.customer_requirement === "authenticated" && !customerId) throw new Error("Mã giảm giá này yêu cầu đăng nhập.");
  if (codePromotion?.distribution_type === "targeted") {
    if (!customerId) throw new Error("Mã ưu đãi này được cấp riêng và yêu cầu đăng nhập.");
    const assignment = await poolOrTransaction.request().input("code_id", sql.Int, codePromotion.promotion_code_id).input("customer_id", sql.NVarChar, customerId).query("SELECT status FROM PromotionCodeAssignments WHERE promotion_code_id=@code_id AND user_id=@customer_id");
    if (!assignment.recordset.length || assignment.recordset[0].status !== "available") throw new Error("Mã ưu đãi này không được cấp cho tài khoản của bạn hoặc đã được sử dụng.");
  }
  if (codePromotion?.distribution_type === "private" && !customerId) throw new Error("Mã ưu đãi riêng tư yêu cầu đăng nhập.");
  if (codePromotion?.code_usage_limit && codePromotion.code_used_count >= codePromotion.code_usage_limit) throw new Error("Mã giảm giá đã hết lượt sử dụng.");
  if (codePromotion?.usage_limit_per_customer && customerId) {
    const usage = await poolOrTransaction.request().input("customer_id", sql.NVarChar, customerId).input("promotion_id", sql.Int, codePromotion.id).query("SELECT COUNT(*) total FROM PromotionUsages WHERE customer_id=@customer_id AND promotion_id=@promotion_id AND status='consumed'");
    if (usage.recordset[0].total >= codePromotion.usage_limit_per_customer) throw new Error("Bạn đã sử dụng hết số lượt cho phép của mã này.");
  }

  const pricedItems = items.map((item) => {
    const originalLineTotal = roundMoney(item.price * item.quantity);
    const candidates = automatic.filter((promotion) => hasPromotionStockHeadroom(item) && targetMatches(promotion, item) && ["percentage", "fixed_amount"].includes(promotion.discount_type)).map((promotion) => {
      let discount = productDiscount(promotion, item);
      if (promotion.max_discount_per_order) discount = Math.min(discount, Number(promotion.max_discount_per_order));
      const floor = Number(item.floorPrice || 0);
      if (floor > 0) discount = Math.min(discount, Math.max(0, originalLineTotal - floor * item.quantity));
      return { promotion, discount };
    });
    candidates.sort((a, b) => b.discount - a.discount || b.promotion.priority - a.promotion.priority || a.promotion.id - b.promotion.id);
    const winner = candidates[0] || null;
    return { ...item, originalUnitPrice: item.price, originalLineTotal, automaticDiscount: winner?.discount || 0, automaticPromotion: winner?.promotion || null, orderDiscountAllocated: 0 };
  });
  const originalSubtotal = pricedItems.reduce((sum, item) => sum + item.originalLineTotal, 0);
  const productDiscountTotal = pricedItems.reduce((sum, item) => sum + item.automaticDiscount, 0);
  const afterAutomatic = originalSubtotal - productDiscountTotal;
  if (codePromotion && afterAutomatic < Number(codePromotion.minimum_order_value || 0)) throw new Error(`Đơn hàng cần đạt tối thiểu ${Number(codePromotion.minimum_order_value).toLocaleString("vi-VN")}đ để dùng mã này.`);

  let codeDiscountTotal = 0;
  let shippingDiscountTotal = 0;
  if (codePromotion) {
    if (["free_shipping", "shipping_amount"].includes(codePromotion.discount_type)) {
      const activeAutomatic = pricedItems.map((item) => item.automaticPromotion).filter(Boolean);
      const shippingCanStack = activeAutomatic.length === 0 || (["allowed", "shipping_only"].includes(codePromotion.stacking_policy) && activeAutomatic.every((promotion) => ["allowed", "shipping_only"].includes(promotion.stacking_policy)));
      if (!shippingCanStack) throw new Error("Mã vận chuyển không thể kết hợp với khuyến mãi hiện tại.");
      shippingDiscountTotal = codePromotion.discount_type === "free_shipping" ? shippingFee : Math.min(shippingFee, roundMoney(codePromotion.discount_value));
    } else {
      const eligible = pricedItems.filter((item) => hasPromotionStockHeadroom(item) && targetMatches(codePromotion, item) && (!item.automaticPromotion || (codePromotion.stacking_policy === "allowed" && item.automaticPromotion.stacking_policy === "allowed")));
      const eligibleTotal = eligible.reduce((sum, item) => sum + item.originalLineTotal - item.automaticDiscount, 0);
      if (!eligibleTotal) throw new Error("Mã này không áp dụng cho sản phẩm trong giỏ hàng.");
      codeDiscountTotal = codePromotion.discount_type === "percentage" ? roundMoney(eligibleTotal * Number(codePromotion.discount_value) / 100) : Math.min(eligibleTotal, roundMoney(codePromotion.discount_value));
      if (codePromotion.maximum_discount) codeDiscountTotal = Math.min(codeDiscountTotal, Number(codePromotion.maximum_discount));
      if (codePromotion.max_discount_per_order) codeDiscountTotal = Math.min(codeDiscountTotal, Number(codePromotion.max_discount_per_order));
      const floorHeadroom = eligible.reduce((sum, item) => sum + Math.max(0, item.originalLineTotal - item.automaticDiscount - Number(item.floorPrice || 0) * item.quantity), 0);
      if (eligible.some((item) => Number(item.floorPrice || 0) > 0)) codeDiscountTotal = Math.min(codeDiscountTotal, floorHeadroom);
      let allocated = 0;
      eligible.forEach((item, index) => {
        const base = item.originalLineTotal - item.automaticDiscount;
        const share = index === eligible.length - 1 ? codeDiscountTotal - allocated : Math.floor(codeDiscountTotal * base / eligibleTotal);
        item.orderDiscountAllocated = share; allocated += share;
      });
    }
  }
  const finalItems = pricedItems.map((item) => ({ ...item, finalLineTotal: item.originalLineTotal - item.automaticDiscount - item.orderDiscountAllocated }));
  return { items: finalItems, originalSubtotal, productDiscountTotal, codeDiscountTotal, shippingFeeOriginal: shippingFee, shippingDiscountTotal, finalTotal: Math.max(0, afterAutomatic - codeDiscountTotal + shippingFee - shippingDiscountTotal), code: normalizedCode || null, codePromotion, automaticPromotions: [...new Map(finalItems.filter((item) => item.automaticPromotion).map((item) => [item.automaticPromotion.id, item.automaticPromotion])).values()] };
}
