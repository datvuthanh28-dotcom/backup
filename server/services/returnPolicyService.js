const REASONS = new Set([
  "wrong_item",
  "wrong_color",
  "wrong_size_sent",
  "missing_item",
  "damaged_on_arrival",
  "manufacturing_defect",
  "size_does_not_fit",
  "changed_mind",
  "other",
]);

const STORE_FAULT_REASONS = new Set([
  "wrong_item",
  "wrong_color",
  "wrong_size_sent",
  "missing_item",
  "damaged_on_arrival",
  "manufacturing_defect",
]);

export function evaluateReturnRequest({ order, orderItem, request }) {
  const reason = String(request.reasonCode || "").trim();
  if (!REASONS.has(reason)) return { status: "manual_review", decisionReason: "Reason requires Client Care review." };
  if (!order || !orderItem) return { status: "auto_declined", decisionReason: "The order item could not be verified." };
  if (order.order_status !== "delivered" || !order.delivered_at) return { status: "manual_review", decisionReason: "Delivery date is not confirmed; Client Care will verify eligibility." };

  const deliveredAt = new Date(order.delivered_at);
  const deadline = new Date(deliveredAt.getTime() + 14 * 24 * 60 * 60 * 1000);
  if (Date.now() > deadline.getTime()) return { status: "auto_declined", decisionReason: "The request was submitted more than 14 calendar days after delivery.", deadline };

  const quantity = Number(request.quantity || 0);
  const purchasedQuantity = Number(orderItem.quantity || 0);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > purchasedQuantity) {
    return { status: "auto_declined", decisionReason: "Requested quantity is not valid for this order item.", deadline };
  }

  const refundAmount = Number(orderItem.final_line_total ?? orderItem.total_price ?? 0);
  const requestedAmount = Math.round(refundAmount * quantity / Math.max(purchasedQuantity, 1));
  let promotionSnapshot = {};
  try { promotionSnapshot = JSON.parse(orderItem.promotion_snapshot_json || "{}"); } catch { /* legacy order */ }
  let orderPromotionSnapshot = {};
  try { orderPromotionSnapshot = JSON.parse(order.promotion_snapshot_json || "{}"); } catch { /* legacy order */ }
  const discounted = Number(orderItem.automatic_discount_total || 0) > 0
    || Number(orderItem.order_discount_allocated || 0) > 0
    || Boolean(promotionSnapshot.id)
    || Boolean(orderPromotionSnapshot.codePromotion)
    || (Array.isArray(orderPromotionSnapshot.automaticPromotions) && orderPromotionSnapshot.automaticPromotions.length > 0);
  const storeFault = STORE_FAULT_REASONS.has(reason);

  // A sale exclusion never blocks claims about incorrect, missing, damaged or faulty goods.
  if (discounted && !storeFault) {
    return { status: "auto_declined", decisionReason: "Promotional items are not eligible for fit, preference or change-of-mind returns.", deadline, requestedAmount };
  }
  if (requestedAmount >= 10_000_000 || quantity >= 3) {
    return { status: "manual_review", decisionReason: requestedAmount >= 10_000_000 ? "Requested refund is at least VND 10,000,000." : "Three or more units are included in this request.", deadline, requestedAmount };
  }
  if (storeFault) return { status: "auto_approved", decisionReason: "The reported reason is a Maison Rue or manufacturer fulfilment/product fault. Physical inspection is still required before refund or exchange.", deadline, requestedAmount };

  const conditionConfirmed = request.conditionConfirmed === true;
  if (!conditionConfirmed) return { status: "manual_review", decisionReason: "Customer must confirm the item is unused, unwashed and unaltered before a fit or preference return can be authorised.", deadline, requestedAmount };
  return { status: "auto_approved", decisionReason: "Within the return window and eligible for a change-of-mind, fit or size return, subject to physical inspection.", deadline, requestedAmount };
}

export const RETURN_REASON_OPTIONS = [
  { value: "wrong_item", label: "Wrong item received" },
  { value: "wrong_color", label: "Wrong colour received" },
  { value: "wrong_size_sent", label: "Wrong size received" },
  { value: "missing_item", label: "An item is missing" },
  { value: "damaged_on_arrival", label: "Damaged on arrival" },
  { value: "manufacturing_defect", label: "Possible manufacturing defect" },
  { value: "size_does_not_fit", label: "The size does not fit" },
  { value: "changed_mind", label: "I changed my mind" },
  { value: "other", label: "Other" },
];
