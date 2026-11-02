import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useCart } from "../hooks/useCart";
import { useStore } from "../hooks/useStore";
import useDocumentTitle from "../hooks/useDocumentTitle";
import ProductCard from "../components/ProductCard";

const money = (value) => `${Number(value).toLocaleString("vi-VN")}đ`;

export default function ProductDetail() {
  const { id } = useParams();
  const { products } = useStore();
  const product = products.find((item) => item.id === Number(id));
  const { addToCart } = useCart();
  useDocumentTitle(product ? product.name : "Sản phẩm");
  const [selectedColor, setSelectedColor] = useState(product?.colors?.[0] || "");
  const [selectedSize, setSelectedSize] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [activeImage, setActiveImage] = useState(0);
  const [added, setAdded] = useState(false);
  const [message, setMessage] = useState("");

  const variants = product?.variants || [];
  const colorVariants = variants.filter((variant) => variant.color === selectedColor);
  const selectedVariant = colorVariants.find((variant) => variant.size === selectedSize);
  const currentStock = selectedVariant?.stock || 0;
  const galleryImages = product?.colors?.flatMap((color) =>
    (product.colorImages?.[color] || []).map((image) => ({ image, color }))
  ) || (product?.images || []).map((image) => ({ image, color: selectedColor }));
  const activeGalleryItem = galleryImages[activeImage] || galleryImages[0];
  const relatedProducts = product ? products.filter((item) => item.id !== product.id && (item.collection === product.collection || item.subcategory === product.subcategory)).slice(0, 3) : [];

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

  return (
    <main id="product-detail-container">
      <div className="product-breadcrumb"><Link to={`/${product.gender === "nam" ? "men" : product.gender === "nữ" ? "women" : "unisex"}`}>{product.gender}</Link><span>/</span><span>{product.subcategory}</span><span>/</span><span>{product.name}</span></div>
      <div className="product-detail">
        <div className="product-gallery">
          <div className="gallery-main">
            <img src={`/${activeGalleryItem?.image}`} alt={`${product.name} — ${activeGalleryItem?.color || selectedColor}`} />
            {galleryImages.length > 1 && <><button className="gallery-btn prev" onClick={() => stepImage(-1)}>‹</button><button className="gallery-btn next" onClick={() => stepImage(1)}>›</button><span className="image-counter">{activeImage + 1} / {galleryImages.length}</span></>}
          </div>
          <div className="gallery-thumbnails">{galleryImages.map((item, index) => <button key={`${item.color}-${item.image}`} className={`${activeImage === index ? "active" : ""} ${selectedColor === item.color ? "selected-color" : ""}`} onClick={() => chooseImage(index)} title={item.color}><img src={`/${item.image}`} alt={`${product.name} — ${item.color}`} /></button>)}</div>
        </div>
        <div className="product-info">
          <p className="product-category">{product.collection}</p><h1>{product.name}</h1>
          <p className="product-subtitle">{product.fit} · {product.material}</p><p className="product-price">{money(product.price)}</p>
          <div className="detail-selector"><div className="selector-heading"><strong>Colour</strong><span>{selectedColor}</span></div><div className="color-swatches">{product.colorOptions.map((color) => <button key={color.name} className={selectedColor === color.name ? "active" : ""} onClick={() => chooseColor(color.name)} title={color.name}><span style={{ background: color.hex }} /></button>)}</div></div>
          <div className="detail-selector"><div className="selector-heading"><strong>Size</strong><button className="text-button" onClick={() => document.getElementById("size-guide")?.scrollIntoView({ behavior: "smooth" })}>Size guide</button></div><div className="size-options">{colorVariants.map((variant) => <button key={variant.id} disabled={variant.stock < 1} className={selectedSize === variant.size ? "active" : ""} onClick={() => { setSelectedSize(variant.size); setQuantity(1); setMessage(""); }}>{variant.size}</button>)}</div></div>
          <div className={`variant-status ${selectedVariant && currentStock <= 3 ? "low" : ""}`}>{!selectedSize ? "Select a size to view availability" : currentStock > 3 ? `In stock · ${currentStock} available` : currentStock > 0 ? `Low stock · only ${currentStock} remaining` : "Unavailable"}</div>
          {selectedVariant && <p className="variant-sku">SKU {selectedVariant.sku}</p>}{message && <p className="product-validation">{message}</p>}
          <div className="product-actions refined-actions"><div className="quantity-controls"><button onClick={() => setQuantity((q) => Math.max(1, q - 1))}>−</button><input readOnly value={quantity} aria-label="Quantity" /><button onClick={() => setQuantity((q) => Math.min(currentStock || 1, q + 1))}>+</button></div><button className="btn-primary btn-large" onClick={handleAddToCart}>{added ? "Added to bag ✓" : "Add to bag"}</button></div>
          <div className="service-notes"><span>Complimentary delivery</span><span>14-day exchange</span><span>Secure checkout</span></div>
        </div>
      </div>
      <section className="product-editorial"><p className="eyebrow">The Maison Rue Edit</p><h2>The Story</h2><p className="story-copy">{product.description} Created as part of the {product.collection} collection, this piece favours lasting material, restrained detail and an effortless silhouette over passing trends.</p><div className="detail-columns"><article><h3>Why you'll love it</h3><ul>{product.features.map((feature) => <li key={feature}>{feature}</li>)}</ul></article><article><h3>Material & care</h3><p>{product.material}</p><p>{product.care}</p></article><article><h3>Fit & measurements</h3><p>{product.fit}</p><p>{product.modelInfo}</p></article><article><h3>Delivery & returns</h3><p>{product.delivery}</p></article></div></section>
      {product.sizes[0] !== "ONE SIZE" && <section id="size-guide" className="size-guide-section"><p className="eyebrow">Fit notes</p><h2>Size Guide</h2><div className="size-table-wrap"><table><thead><tr><th>Size</th><th>Chest</th><th>Waist</th><th>Length</th></tr></thead><tbody>{product.sizeGuide.map((row) => <tr key={row.size}><td>{row.size}</td><td>{row.chest} cm</td><td>{row.waist} cm</td><td>{row.length} cm</td></tr>)}</tbody></table></div></section>}
      {relatedProducts.length > 0 && <section className="related-section"><p className="eyebrow">Curated for you</p><h2>Complete the Look</h2><div className="related-grid">{relatedProducts.map((item) => <ProductCard key={item.id} product={item} />)}</div></section>}
    </main>
  );
}
