export function numberValue(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function getOrderItemUnitPrice(item) {
  return numberValue(item?.unit_price ?? item?.price);
}

export function getOrderItemOriginalUnitPrice(item) {
  return numberValue(item?.original_unit_price, getOrderItemUnitPrice(item));
}

export function getOrderItemFinalTotal(item) {
  const stored = item?.final_line_total ?? item?.total_price;
  if (stored !== null && stored !== undefined && Number.isFinite(Number(stored))) {
    return Number(stored);
  }
  return getOrderItemUnitPrice(item) * numberValue(item?.quantity, 1);
}

export function getOrderItemDiscount(item) {
  const quantity = numberValue(item?.quantity, 1);
  const originalTotal = getOrderItemOriginalUnitPrice(item) * quantity;
  return Math.max(0, originalTotal - getOrderItemFinalTotal(item));
}

export function getOrderItemImage(item) {
  const image = String(item?.image_url || item?.image || "").trim();
  if (!image) return "/image/hero-image/hero-image.png";
  if (/^(https?:)?\/\//i.test(image) || image.startsWith("data:") || image.startsWith("blob:")) return image;
  return image.startsWith("/") ? image : `/${image}`;
}

export function getOrderItemSku(item) {
  return item?.variant_sku || item?.sku || "Chưa có SKU";
}

export function getOrderItemSize(item) {
  return item?.selected_size || item?.selectedSize || "ONE SIZE";
}

export function getOrderItemColor(item) {
  return item?.selected_color || item?.selectedColor || "Tiêu chuẩn";
}

export function getOrderFinancials(order) {
  return {
    originalSubtotal: numberValue(order?.original_subtotal, numberValue(order?.total_amount ?? order?.totalAmount)),
    productDiscount: numberValue(order?.product_discount_total),
    codeDiscount: numberValue(order?.code_discount_total),
    shippingOriginal: numberValue(order?.shipping_fee_original, numberValue(order?.shipping_fee)),
    shippingDiscount: numberValue(order?.shipping_discount_total),
    shippingFee: numberValue(order?.shipping_fee),
    total: numberValue(order?.total_amount ?? order?.totalAmount),
  };
}
