import { Link, useLocation, useNavigate } from "react-router-dom";
import { useStore } from "../hooks/useStore";
import { useFavorites } from "../context/FavoritesContext";

function HeartIcon({ filled = false }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="product-card-heart-icon">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78Z" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
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
  const hoverImage = product.images?.[1] && product.images[1] !== coverImage ? product.images[1] : null;

  return (
    <article className="product-card">
      <button className="product-card-favorite" type="button" aria-label={isFavorite(product.id) ? "Remove from wishlist" : "Add to wishlist"} aria-pressed={isFavorite(product.id)} onClick={async () => { const result = await toggleFavorite(product.id); if (result?.requiresLogin) navigate(`/login?returnTo=${encodeURIComponent(location.pathname)}`); }}>
        <HeartIcon filled={isFavorite(product.id)} />
      </button>
      <Link to={`/product/${product.id}`} className="product-card-link">
        <div className="product-image">
          {isOutOfStock && <span className="product-card-sold-out">Sold out</span>}
          <img className="product-image-primary" src={`/${coverImage}`} alt={product.name} />
          {hoverImage && <img className="product-image-hover" src={`/${hoverImage}`} alt="" aria-hidden="true" />}
        </div>
        <div className="product-card-copy">
          <h3>{product.name}</h3>
          {product.promotionDiscount > 0 ? <div className="product-price-sale"><span>{product.price.toLocaleString("vi-VN")}đ</span><strong>{Number(product.promotionPrice).toLocaleString("vi-VN")}đ</strong></div> : <p className="product-price">{product.price.toLocaleString("vi-VN")}đ</p>}
        </div>
      </Link>
    </article>
  );
}
