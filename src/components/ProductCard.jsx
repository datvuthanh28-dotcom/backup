import { Link, useLocation, useNavigate } from "react-router-dom";
import { useStore } from "../hooks/useStore";
import { useFavorites } from "../context/FavoritesContext";

export default function ProductCard({ product }) {
  const { getProductStock } = useStore();
  const { isFavorite, toggleFavorite } = useFavorites();
  const navigate = useNavigate();
  const location = useLocation();
  const stock = getProductStock(product.id);
  const isOutOfStock = stock === 0;
  const stockLabel = isOutOfStock ? "Hết hàng" : stock <= 3 ? `Sắp hết · còn ${stock}` : "Còn hàng";
  const modelImage = product.images?.find((image) => image.toLowerCase().includes("model"));
  // Curate model covers for roughly one third of cards so the catalog keeps visual rhythm.
  const coverImage = modelImage && product.id % 3 === 0 ? modelImage : product.images?.[0];

  return (
    <article className="product-card" style={{ position: "relative" }}>
      <button type="button" aria-label={isFavorite(product.id) ? "Bỏ khỏi danh sách yêu thích" : "Thêm vào danh sách yêu thích"} aria-pressed={isFavorite(product.id)} onClick={async () => { const result = await toggleFavorite(product.id); if (result?.requiresLogin) navigate(`/login?returnTo=${encodeURIComponent(location.pathname)}`); }} style={{ position: "absolute", top: 18, right: 18, zIndex: 12, width: 24, height: 24, padding: 0, border: 0, background: "transparent", color: isFavorite(product.id) ? "#9B2C2C" : "#4E342E", cursor: "pointer", fontSize: 20, lineHeight: 1 }}><i className={isFavorite(product.id) ? "fas fa-heart" : "far fa-heart"} /></button>
      <Link to={`/product/${product.id}`} style={{ color: "inherit", textDecoration: "none" }}>
      {isOutOfStock && (
        <span
          style={{
            position: "absolute",
            top: "12px",
            left: "12px",
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
      <div className="product-card-meta">{product.productType || product.category}</div>
      <h3>{product.name}</h3>
      <p className="product-card-fit">{product.subcategory} · {stockLabel}</p>
      <p className="product-price">{product.price.toLocaleString("vi-VN")}đ</p>
      {product.colorOptions && <div className="card-swatches">{product.colorOptions.slice(0, 4).map((color) => <span key={color.name} title={color.name} style={{ background: color.hex }} />)}</div>}
      </Link>
    </article>
  );
}
