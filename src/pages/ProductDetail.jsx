import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useCart } from "../hooks/useCart";
import { useStore } from "../hooks/useStore";
import useDocumentTitle from "../hooks/useDocumentTitle";
import ProductCard from "../components/ProductCard";
import ProductReviews from "../components/ProductReviews";
import { useFavorites } from "../context/FavoritesContext";
import { useAuth } from "../context/AuthContext";
import { useLocation, useNavigate } from "react-router-dom";

const money = (value) => `${Number(value).toLocaleString("vi-VN")}đ`;

export default function ProductDetail() {
  const { id } = useParams();
  const { products } = useStore();
  const product = products.find((item) => item.id === Number(id));
  const { addToCart } = useCart();
  const { isFavorite, toggleFavorite } = useFavorites();
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  useDocumentTitle(product ? product.name : "Sản phẩm");
  const [selectedColor, setSelectedColor] = useState(product?.colors?.[0] || "");
  const [selectedSize, setSelectedSize] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [activeImage, setActiveImage] = useState(0);
  const [added, setAdded] = useState(false);
  const [message, setMessage] = useState("");
  const [sizeGuideOpen, setSizeGuideOpen] = useState(false);
  const [measurement, setMeasurement] = useState({ chest: "", waist: "", footLength: "" });

  const variants = product?.variants || [];
  const colorVariants = variants.filter((variant) => variant.color === selectedColor);
  const selectedVariant = colorVariants.find((variant) => variant.size === selectedSize);
  const currentStock = selectedVariant?.stock || 0;
  const galleryImages = product?.colors?.flatMap((color) =>
    (product.colorImages?.[color] || []).map((image) => ({ image, color }))
  ) || (product?.images || []).map((image) => ({ image, color: selectedColor }));
  const activeGalleryItem = galleryImages[activeImage] || galleryImages[0];
  const relatedProducts = product ? products.filter((item) => item.id !== product.id && (item.collection === product.collection || item.subcategory === product.subcategory)).slice(0, 3) : [];
  const isFootwear = product?.productType === "Footwear";

  if (!product) return <main id="product-detail-container"><p>Sản phẩm không tồn tại.</p><Link to="/">Về trang chủ</Link></main>;

  const chooseColor = (color) => {
    const colorImageIndex = galleryImages.findIndex((item) => item.color === color);
    setSelectedColor(color); setSelectedSize(""); setQuantity(1); setActiveImage(Math.max(0, colorImageIndex)); setMessage("");
  };

  const chooseImage = (index) => {
    const galleryItem = galleryImages[index];
    if (!galleryItem) return;
    setActiveImage(index);
    if (galleryItem.color !== selectedColor) {
      setSelectedColor(galleryItem.color); setSelectedSize(""); setQuantity(1); setMessage("");
    }
  };

  const stepImage = (direction) => {
    const nextIndex = (activeImage + direction + galleryImages.length) % galleryImages.length;
    chooseImage(nextIndex);
  };

  const handleAddToCart = () => {
    if (!selectedSize) return setMessage("Vui lòng chọn kích thước trước khi thêm vào giỏ hàng.");
    if (!selectedVariant || currentStock < 1) return setMessage("Biến thể này hiện đã hết hàng.");
    addToCart(product, Math.min(quantity, currentStock), selectedColor, selectedSize, selectedVariant);
    setMessage(""); setAdded(true); setTimeout(() => setAdded(false), 2000);
  };

  const recommendedSize = (() => {
    const value = Number(isFootwear ? measurement.footLength : measurement.chest || measurement.waist);
    if (!value || !product.sizeGuide?.length) return null;
    const key = isFootwear ? "footLength" : measurement.chest ? "chest" : "waist";
    return product.sizeGuide.reduce((best, row) => {
      const distance = Math.abs(Number(row[key]) - value);
      return !best || distance < best.distance ? { size: row.size, distance } : best;
    }, null)?.size;
  })();

  return (
    <main id="product-detail-container">
          <div className="product-breadcrumb"><Link to={product.audience === "kids" ? "/kids" : product.gender === "nam" ? "/men" : product.gender === "nữ" ? "/women" : "/"}>{product.audience === "kids" ? "Kids" : product.gender}</Link><span>/</span><span>{product.subcategory}</span><span>/</span><span>{product.name}</span></div>
      <div className="product-detail">
          <div className="product-gallery">
            <div className="gallery-color-label" aria-live="polite"><span>Viewing colour</span><strong>{selectedColor}</strong></div>
          <div className="gallery-main">
            <img src={`/${activeGalleryItem?.image}`} alt={`${product.name} — ${activeGalleryItem?.color || selectedColor}`} />
            {galleryImages.length > 1 && <><button className="gallery-btn prev" onClick={() => stepImage(-1)}>‹</button><button className="gallery-btn next" onClick={() => stepImage(1)}>›</button><span className="image-counter">{activeImage + 1} / {galleryImages.length}</span></>}
          </div>
          <div className="gallery-thumbnails">{galleryImages.map((item, index) => <button key={`${item.color}-${item.image}`} className={`${activeImage === index ? "active" : ""} ${selectedColor === item.color ? "selected-color" : ""}`} onClick={() => chooseImage(index)} title={item.color}><img src={`/${item.image}`} alt={`${product.name} — ${item.color}`} /></button>)}</div>
        </div>
        <div className="product-info">
          <p className="product-category">{product.collection}</p><div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start" }}><h1>{product.name}</h1><button type="button" className="account-outline" aria-pressed={isFavorite(product.id)} onClick={async () => { const result = await toggleFavorite(product.id); if (result?.requiresLogin || currentUser?.role !== "customer") navigate(`/login?returnTo=${encodeURIComponent(location.pathname)}`); }}><i className={isFavorite(product.id) ? "fas fa-heart" : "far fa-heart"} /> {isFavorite(product.id) ? "Đã yêu thích" : "Yêu thích"}</button></div>
          <p className="product-subtitle">{product.fit} · {product.material}</p><p className="product-price">{money(product.price)}</p>
          <div className="detail-selector"><div className="selector-heading"><strong>Colour</strong><span aria-live="polite">{selectedColor}</span></div><div className="color-swatches">{product.colorOptions.map((color) => <button key={color.name} className={selectedColor === color.name ? "active" : ""} onClick={() => chooseColor(color.name)} title={color.name} aria-label={`Choose colour ${color.name}`} aria-pressed={selectedColor === color.name}><span style={{ background: color.hex }} /></button>)}</div></div>
          <div className="detail-selector"><div className="selector-heading"><strong>Size</strong>{product.sizeGuide?.length > 0 && <button className="text-button" onClick={() => setSizeGuideOpen(true)}>Find my size · Size guide</button>}</div><div className="size-options">{colorVariants.map((variant) => <button key={variant.id} disabled={variant.stock < 1} className={selectedSize === variant.size ? "active" : ""} onClick={() => { setSelectedSize(variant.size); setQuantity(1); setMessage(""); }}>{variant.size}</button>)}</div></div>
          <div className={`variant-status ${selectedVariant && currentStock <= 3 ? "low" : ""}`}>{!selectedSize ? "Select a size to view availability" : currentStock > 3 ? `In stock · ${currentStock} available` : currentStock > 0 ? `Low stock · only ${currentStock} remaining` : "Unavailable"}</div>
          {selectedVariant && <p className="variant-sku">SKU {selectedVariant.sku}</p>}{message && <p className="product-validation">{message}</p>}
          <div className="product-actions refined-actions"><div className="quantity-controls"><button onClick={() => setQuantity((q) => Math.max(1, q - 1))}>−</button><input readOnly value={quantity} aria-label="Quantity" /><button onClick={() => setQuantity((q) => Math.min(currentStock || 1, q + 1))}>+</button></div><button className="btn-primary btn-large" onClick={handleAddToCart}>{added ? "Added to bag ✓" : "Add to bag"}</button></div>
          <div className="service-notes"><span>Complimentary delivery</span><span>14-day exchange</span><span>Secure checkout</span></div>
        </div>
      </div>
      <section className="product-editorial"><p className="eyebrow">The Maison Rue Edit</p><h2>The Story</h2><p className="story-copy">{product.description} Created as part of the {product.collection} collection, this piece favours lasting material, restrained detail and an effortless silhouette over passing trends.</p><div className="detail-columns"><article><h3>Why you'll love it</h3><ul>{product.features.map((feature) => <li key={feature}>{feature}</li>)}</ul></article><article><h3>Material & care</h3><p>{product.material}</p><p>{product.care}</p></article><article><h3>Fit & measurements</h3><p>{product.fit}</p><p>{product.modelInfo}</p></article><article><h3>Delivery & returns</h3><p>{product.delivery}</p></article></div></section>
      {product.sizeGuide?.length > 0 && <section id="size-guide" className="size-guide-section"><p className="eyebrow">Fit notes</p><h2>Size Guide</h2><div className="size-table-wrap"><table><thead><tr><th>Size</th>{isFootwear ? <th>Foot length</th> : <><th>Chest</th><th>Waist</th><th>Length</th></>}</tr></thead><tbody>{product.sizeGuide.map((row) => <tr key={row.size}><td>{row.size}</td>{isFootwear ? <td>{row.footLength} cm</td> : <><td>{row.chest} cm</td><td>{row.waist} cm</td><td>{row.length} cm</td></>}</tr>)}</tbody></table></div></section>}
      {sizeGuideOpen && product.sizeGuide?.length > 0 && <div className="size-guide-overlay" role="dialog" aria-modal="true" aria-labelledby="size-guide-title" onClick={() => setSizeGuideOpen(false)}><div className="size-guide-modal" onClick={(event) => event.stopPropagation()}><button className="size-guide-close" onClick={() => setSizeGuideOpen(false)} aria-label="Close size guide">×</button><p className="eyebrow">Maison Rue fit service</p><h2 id="size-guide-title">Find your size</h2><p className="size-guide-intro">{isFootwear ? "Measure from the back of the heel to the longest toe." : "Measure over a light layer. Keep the tape relaxed and parallel to the floor."}</p><div className="measurement-grid">{isFootwear ? <label>Foot length (cm)<input type="number" min="0" step="0.1" value={measurement.footLength} onChange={(event) => setMeasurement((current) => ({ ...current, footLength: event.target.value }))} placeholder="e.g. 25.4" /></label> : <><label>Chest / bust (cm)<input type="number" min="0" value={measurement.chest} onChange={(event) => setMeasurement((current) => ({ ...current, chest: event.target.value }))} placeholder="e.g. 96" /></label><label>Waist (cm)<input type="number" min="0" value={measurement.waist} onChange={(event) => setMeasurement((current) => ({ ...current, waist: event.target.value }))} placeholder="e.g. 80" /></label></>}</div>{recommendedSize && <div className="size-recommendation"><strong>Recommended size: {recommendedSize}</strong><span>{isFootwear ? "If between sizes, choose the larger size." : "Choose the next size up if you prefer a relaxed fit."}</span></div>}<h3>How to measure</h3>{isFootwear ? <ol className="measure-steps"><li>Stand on a sheet of paper with your heel against a wall.</li><li>Mark the longest toe and measure the distance to the wall.</li><li>Measure both feet and use the larger measurement.</li></ol> : <ol className="measure-steps"><li><strong>Chest:</strong> measure around the fullest part.</li><li><strong>Waist:</strong> measure the narrowest part without pulling tight.</li><li><strong>Between sizes:</strong> size up for ease, size down for a closer fit.</li></ol>}<div className="size-table-wrap"><table><thead><tr><th>Size</th>{isFootwear ? <th>Foot length</th> : <><th>Chest</th><th>Waist</th><th>Length</th></>}</tr></thead><tbody>{product.sizeGuide.map((row) => <tr key={row.size}><td>{row.size}</td>{isFootwear ? <td>{row.footLength} cm</td> : <><td>{row.chest} cm</td><td>{row.waist} cm</td><td>{row.length} cm</td></>}</tr>)}</tbody></table></div></div></div>}
      {relatedProducts.length > 0 && <section className="related-section"><p className="eyebrow">Curated for you</p><h2>Complete the Look</h2><div className="related-grid">{relatedProducts.map((item) => <ProductCard key={item.id} product={item} />)}</div></section>}
      <ProductReviews productId={product.id} />
    </main>
  );
}
