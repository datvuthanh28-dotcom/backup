import { Link } from "react-router-dom";
import { useStore } from "../hooks/useStore";

export default function ProductCard({ product }) {
  const { getProductStock } = useStore();
  const stock = getProductStock(product.id);
  const isOutOfStock = stock === 0;
  const modelImage = product.images?.find((image) => image.toLowerCase().includes("model"));
  // Curate model covers for roughly one third of cards so the catalog keeps visual rhythm.
  const coverImage = modelImage && product.id % 3 === 0 ? modelImage : product.images?.[0];

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
        <img src={`/${coverImage}`} alt={product.name} />
      </div>
      <div className="product-card-meta">{product.collection || product.productType}</div>
      <h3>{product.name}</h3>
      <p className="product-card-fit">{product.fit || product.gender}</p>
      <p className="product-price">{product.price.toLocaleString("vi-VN")}đ</p>
      {product.colorOptions && <div className="card-swatches">{product.colorOptions.slice(0, 4).map((color) => <span key={color.name} title={color.name} style={{ background: color.hex }} />)}</div>}
    </Link>
  );
}
