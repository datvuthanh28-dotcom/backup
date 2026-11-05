import { getOrderFinancials } from "../utils/orderDisplay";

export default function OrderFinancialBreakdown({ order, formatPrice, compact = false }) {
  const values = getOrderFinancials(order);
  const hasDiscount = values.productDiscount + values.codeDiscount + values.shippingDiscount > 0;
  return (
    <div style={{ marginTop: compact ? 8 : 14, padding: compact ? "10px 12px" : "13px 15px", border: "1px solid #E8E1D6", borderRadius: 6, background: "#FCFBF9", fontSize: compact ? 12 : 13 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 20 }}><span>Tạm tính hàng hóa</span><span>{formatPrice(values.originalSubtotal)}</span></div>
      {values.productDiscount > 0 && <div style={{ display: "flex", justifyContent: "space-between", gap: 20, color: "#2E7D50" }}><span>Khuyến mãi sản phẩm</span><span>−{formatPrice(values.productDiscount)}</span></div>}
      {values.codeDiscount > 0 && <div style={{ display: "flex", justifyContent: "space-between", gap: 20, color: "#2E7D50" }}><span>Mã {order.promotion_code || "khuyến mãi"}</span><span>−{formatPrice(values.codeDiscount)}</span></div>}
      <div style={{ display: "flex", justifyContent: "space-between", gap: 20 }}><span>Phí vận chuyển</span><span>{values.shippingOriginal > 0 ? formatPrice(values.shippingOriginal) : "Miễn phí"}</span></div>
      {values.shippingDiscount > 0 && <div style={{ display: "flex", justifyContent: "space-between", gap: 20, color: "#2E7D50" }}><span>Giảm phí vận chuyển</span><span>−{formatPrice(values.shippingDiscount)}</span></div>}
      <div style={{ display: "flex", justifyContent: "space-between", gap: 20, marginTop: hasDiscount ? 7 : 5, paddingTop: 7, borderTop: "1px solid #E8E1D6", fontWeight: 700 }}><span>Tổng thanh toán</span><span style={{ color: "#B89B5E" }}>{formatPrice(values.total)}</span></div>
    </div>
  );
}
