import { Link } from "react-router-dom";
import {
  getOrderItemColor,
  getOrderItemDiscount,
  getOrderItemFinalTotal,
  getOrderItemImage,
  getOrderItemOriginalUnitPrice,
  getOrderItemSize,
  getOrderItemSku,
  numberValue,
} from "../utils/orderDisplay";

const FALLBACK_IMAGE = "/image/hero-image/hero-image.png";

export default function OrderItemLine({ item, formatPrice, linkProduct = false, showImage = true, showCost = false }) {
  const productName = item.product_name || item.name || "Sản phẩm";
  const quantity = numberValue(item.quantity, 1);
  const originalTotal = getOrderItemOriginalUnitPrice(item) * quantity;
  const finalTotal = getOrderItemFinalTotal(item);
  const discount = getOrderItemDiscount(item);
  const productId = item.product_id || item.id;
  const name = linkProduct && productId
    ? <Link to={`/product/${productId}`} style={{ color: "inherit", textDecoration: "none" }}>{productName}</Link>
    : productName;

  return (
    <div className="order-item-line" style={{ display: "grid", gridTemplateColumns: showImage ? "58px minmax(0, 1fr) auto" : "minmax(0, 1fr) auto", gap: 14, alignItems: "center", padding: "12px 0", borderBottom: "1px dashed #E8E1D6" }}>
      {showImage && (
        <img
          src={getOrderItemImage(item)}
          alt={productName}
          onError={(event) => {
            if (!event.currentTarget.src.endsWith(FALLBACK_IMAGE)) event.currentTarget.src = FALLBACK_IMAGE;
          }}
          style={{ width: 58, height: 58, objectFit: "cover", borderRadius: 5, background: "#F5F0EA" }}
        />
      )}
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 600, color: "#2B211C", fontSize: 14 }}>{name}</div>
        <div style={{ marginTop: 3, fontSize: 12, color: "#6B5A4B", overflowWrap: "anywhere" }}>
          SKU: <strong>{getOrderItemSku(item)}</strong>
        </div>
        <div style={{ marginTop: 2, fontSize: 12.5, color: "#8A7350" }}>
          Màu: {getOrderItemColor(item)} · Size: {getOrderItemSize(item)} · Số lượng: {quantity}
        </div>
        {showCost && item.unit_cost_snapshot != null && (
          <div style={{ marginTop: 2, fontSize: 12, color: "#6B5A4B" }}>Giá vốn lưu tại thời điểm bán: {formatPrice(numberValue(item.unit_cost_snapshot) * quantity)}</div>
        )}
      </div>
      <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
        {discount > 0 && <div style={{ color: "#8A7350", fontSize: 12, textDecoration: "line-through" }}>{formatPrice(originalTotal)}</div>}
        <strong style={{ color: "#B89B5E", fontSize: 14 }}>{formatPrice(finalTotal)}</strong>
        {discount > 0 && <div style={{ color: "#2E7D50", fontSize: 11.5 }}>Đã giảm {formatPrice(discount)}</div>}
      </div>
    </div>
  );
}
