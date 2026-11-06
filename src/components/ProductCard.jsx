import { Link, useLocation, useNavigate } from "react-router-dom";
import { useStore } from "../hooks/useStore";
import { useFavorites } from "../context/FavoritesContext";

function materialLabel(product) {
  if (product.collection === "Heritage Cashmere") return "Cashmere";

  const name = product.name.toLowerCase();
  if (/canvas.*leather|leather.*canvas/.test(name)) return "Canvas & Leather";
  if (/linen.*cotton|cotton.*linen/.test(name)) return "Linen & Cotton";
  if (/merino.*cotton|cotton.*merino/.test(name)) return "Merino & Cotton";
  if (/suede/.test(name)) return "Suede";
  if (/calfskin/.test(name)) return "Calfskin";
  if (/cashmere/.test(name)) return "Cashmere";
  if (/merino/.test(name)) return "Merino Wool";
  if (/wool/.test(name)) return "Wool";
  if (/linen/.test(name)) return "Linen";
  if (/silk/.test(name)) return "Silk";
  if (/cotton/.test(name)) return "Cotton";
  if (/leather/.test(name)) return "Leather";
  if (/canvas/.test(name)) return "Canvas";
  if (/acetate/.test(name)) return "Acetate";
  if (/titanium/.test(name)) return "Titanium";
  if (/nylon/.test(name)) return "Nylon";
  return "Maison Rue Essentials";
}

export default function ProductCard({ product }) {
  const { getProductStock } = useStore();
  const { isFavorite, toggleFavorite } = useFavorites();
  const navigate = useNavigate();
  const location = useLocation();
  const stock = getProductStock(product.id);
  const isOutOfStock = stock === 0;
  const modelImage = product.images?.find((image) => image.toLowerCase().includes("model"));
  // Curate model covers for roughly one third of cards so the catalog keeps visual rhythm.
  const coverImage = modelImage && product.id % 3 === 0 ? modelImage : product.images?.[0];

  return (
    <article className="product-card" style={{ position: "relative" }}>
      <button type="button" aria-label={isFavorite(product.id) ? "Remove from wishlist" : "Add to wishlist"} aria-pressed={isFavorite(product.id)} onClick={async () => { const result = await toggleFavorite(product.id); if (result?.requiresLogin) navigate(`/login?returnTo=${encodeURIComponent(location.pathname)}`); }} style={{ position: "absolute", top: 18, right: 18, zIndex: 12, width: 24, height: 24, padding: 0, border: 0, background: "transparent", color: isFavorite(product.id) ? "#9B2C2C" : "#4E342E", cursor: "pointer", fontSize: 20, lineHeight: 1 }}><i className={isFavorite(product.id) ? "fas fa-heart" : "far fa-heart"} /></button>
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
          SOLD OUT
        </span>
      )}
      <div className="product-image">
        <img src={`/${coverImage}`} alt={product.name} />
      </div>
      <div className="product-card-meta">{materialLabel(product)}</div>
      <h3>{product.name}</h3>
      <p className="product-card-fit">{product.subcategory}</p>
      {product.promotionDiscount > 0 ? <div className="product-price-sale"><span>{product.price.toLocaleString("vi-VN")}đ</span><strong>{Number(product.promotionPrice).toLocaleString("vi-VN")}đ</strong></div> : <p className="product-price">{product.price.toLocaleString("vi-VN")}đ</p>}
      {product.colorOptions && <div className="card-swatches">{product.colorOptions.slice(0, 4).map((color) => <span key={color.name} title={color.name} style={{ background: color.hex }} />)}</div>}
      </Link>
    </article>
  );
}
