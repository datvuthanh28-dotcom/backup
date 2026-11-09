import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useStore } from "../hooks/useStore";
import { useFavorites } from "../context/FavoritesContext";

function materialLabel(product) {
  if (product.material) return product.material.split(/[.;]/)[0].trim();
  if (product.collection === "Heritage Cashmere") return "Cashmere";

  const name = (product.name || "").toLowerCase();
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
  if (product.productType === "Footwear") return "Footwear";
  if (product.productType === "Accessories") return "Accessories";
  return "Maison Rue Essentials";
}

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
  const firstColor = product.colors?.[0] || product.colorOptions?.[0]?.name || "";
  const [selectedColor, setSelectedColor] = useState(firstColor);
  const selectedImages = product.colorImages?.[selectedColor]?.length
    ? product.colorImages[selectedColor]
    : product.images || [];
  const coverImage = selectedImages.find((image) => image.toLowerCase().includes("front"))
    || selectedImages[0]
    || product.images?.[0];
  const hoverImage = selectedImages.find((image) => image.toLowerCase().includes("model-outfit"))
    || selectedImages.find((image) => image.toLowerCase().includes("model-detail"))
    || null;

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
        <div className="product-card-meta">{materialLabel(product)}</div>
        <h3>{product.name}</h3>
        <p className="product-card-fit">{product.subcategory}</p>
        {product.promotionDiscount > 0 ? (
          <div className="product-price-sale">
            <span>{product.price.toLocaleString("vi-VN")}đ</span>
            <strong>{Number(product.promotionPrice).toLocaleString("vi-VN")}đ</strong>
          </div>
        ) : (
          <p className="product-price">{product.price.toLocaleString("vi-VN")}đ</p>
        )}
      </div>
    </Link>
    {product.colorOptions && (
      <div className="card-swatches" aria-label="Available colours">
        {product.colorOptions.slice(0, 4).map((color) => (
          <button
            type="button"
            key={color.name}
            title={color.name}
            aria-label={`Show ${color.name}`}
            aria-pressed={selectedColor === color.name}
            className={selectedColor === color.name ? "active" : ""}
            style={{ background: color.hex }}
            onClick={() => setSelectedColor(color.name)}
          />
        ))}
      </div>
    )}
  </article>
);
}
