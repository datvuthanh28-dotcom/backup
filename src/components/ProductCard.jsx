import { Link } from "react-router-dom";
import { useStore } from "../hooks/useStore";

export default function ProductCard({ product }) {
  const { getProductStock } = useStore();
  const stock = getProductStock(product.id);
  const isOutOfStock = stock === 0;

  return (
    <Link to={`/product/${product.id}`} className="product-card" style={{ position: "relative" }}>
      {isOutOfStock && (
        <span
          style={{
            position: "absolute",
            top: "12px",
            right: "12px",
            backgroundColor: "#2B211C",
            color: "#F8F5F0",
            padding: "4px 10px",
            fontSize: "11px",
            fontWeight: "700",
            letterSpacing: "1px",
            borderRadius: "4px",
            zIndex: 10,
          }}
        >
          HẾT HÀNG
        </span>
      )}
      <div className="product-image">
        <img src={`/${product.images[0]}`} alt={product.name} />
      </div>
      <h3>{product.name}</h3>
      <p className="product-price">{product.price.toLocaleString("vi-VN")}đ</p>
    </Link>
  );
}
