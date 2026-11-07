import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useCart } from "../hooks/useCart";
import { useStore } from "../hooks/useStore";
import useDocumentTitle from "../hooks/useDocumentTitle";
import { allProducts as catalogProducts } from "../data/products";
import ProductCard from "../components/ProductCard";
import ProductReviews from "../components/ProductReviews";
import { useFavorites } from "../context/FavoritesContext";
import { useAuth } from "../context/AuthContext";
import { useLocation, useNavigate } from "react-router-dom";

const money = (value) => `${Number(value).toLocaleString("vi-VN")}đ`;

function materialProfile(product) {
  const name = product.name.toLowerCase();
  if (/baby cashmere/.test(name)) return "Baby cashmere";
  if (/cashmere.*cotton|cotton.*cashmere/.test(name)) return "Cashmere and cotton blend";
  if (/cashmere.*wool|wool.*cashmere/.test(name)) return "Cashmere and wool blend";
  if (/cashmere/.test(name)) return "Cashmere";
  if (/suede/.test(name)) return "Suede";
  if (/calfskin/.test(name)) return "Calfskin leather";
  if (/canvas.*leather|leather.*canvas/.test(name)) return "Canvas and leather";
  if (/linen.*cotton|cotton.*linen/.test(name)) return "Linen and cotton blend";
  if (/linen/.test(name)) return "Linen";
  if (/silk/.test(name)) return "Silk blend";
  if (/merino/.test(name)) return "Merino wool";
  if (/wool/.test(name)) return "Wool";
  if (/cotton/.test(name)) return "Cotton";
  if (/leather/.test(name)) return "Leather";
  if (/acetate/.test(name)) return "Acetate";
  if (/titanium/.test(name)) return "Titanium";
  if (/nylon/.test(name)) return "Technical nylon";
  return "Maison Rue selected materials";
}

function constructionDetails(product) {
  const name = product.name.toLowerCase();
  const material = materialProfile(product);

  if (product.productType === "Footwear") return [
    `${material} upper`,
    /loafer/.test(name) ? "Slip-on loafer construction" : "Refined everyday footwear silhouette",
    "Designed for considered, everyday wear",
  ];
  if (product.productType === "Accessories") return [
    `${material} construction`,
    /bag|tote|duffle|backpack|crossbody/.test(name) ? "Designed to carry daily essentials" : "A considered finishing piece for everyday wear",
    "Made to develop character through use",
  ];
  if (/knit|sweater|cardigan|crewneck|half-zip|vest|polo|beanie|scarf|dress/.test(name)) return [
    `${material} knit`,
    /zip/.test(name) ? "Half-zip neckline" : /cardigan/.test(name) ? "Button-through cardigan construction" : "Ribbed trims for a neat finish",
    `${product.fit} silhouette`,
  ];
  if (/shirt|blouse|dress/.test(name)) return [
    `${material} fabric`,
    "Tailored for ease of movement",
    `${product.fit} silhouette`,
  ];
  if (/trouser|pants|chino|short|skirt/.test(name)) return [
    `${material} fabric`,
    "Designed with a clean, considered line",
    `${product.fit} silhouette`,
  ];
  return [
    `${material} construction`,
    "Made with a focus on proportion and everyday versatility",
    `${product.fit} silhouette`,
  ];
}

function modelFitDetails(product) {
  if (product.audience === "women") return "The model is 178 cm tall, weighs 56 kg, measures 84–62–90 cm, and wears size S.";
  if (product.audience === "kids") return "The model is 110 cm tall and wears the age-5 size.";
  return "The model is 188 cm tall, weighs 78 kg, measures 98–78–96 cm, and wears size M.";
}

function styleRole(product) {
  const name = product.name.toLowerCase();
  if (product.productType === "Footwear") return "footwear";
  if (product.productType === "Accessories") return "accessory";
  if (/coat|jacket|blazer|trench|overshirt/.test(name)) return "outerwear";
  if (/shirt|blouse|tank|polo|tee|bodysuit|romper|sleepsuit/.test(name)) return "top";
  if (/trouser|pants|chino|short|skirt|leggings/.test(name)) return "bottom";
  if (/dress/.test(name)) return "dress";
  return "knitwear";
}

function paletteFamilies(product) {
  const colours = (product.colors || []).map((colour) => colour.toLowerCase());
  const neutral = new Set(["white", "beige", "brown", "black", "navy", "grey", "gray", "camel", "cream", "deep teal"]);
  return colours.map((colour) => neutral.has(colour) ? "neutral" : colour);
}

function materialFamily(product) {
  const name = product.name.toLowerCase();
  if (/cashmere|merino|wool/.test(name)) return "knit";
  if (/linen/.test(name)) return "linen";
  if (/suede/.test(name)) return "suede";
  if (/calfskin|leather/.test(name)) return "leather";
  if (/silk/.test(name)) return "silk";
  if (/cotton/.test(name)) return "cotton";
  return "other";
}

function complementaryRoles(product) {
  const role = styleRole(product);
  const roles = {
    knitwear: ["bottom", "outerwear", "footwear"],
    top: ["bottom", "outerwear", "footwear"],
    bottom: ["top", "outerwear", "footwear"],
    outerwear: ["knitwear", "bottom", "footwear"],
    footwear: ["top", "bottom", "outerwear"],
    accessory: ["top", "bottom", "footwear"],
    dress: ["outerwear", "footwear", "accessory"],
  };
  return roles[role] || ["top", "bottom", "footwear"];
}

function completeTheLook(product, products) {
  const desiredRoles = complementaryRoles(product);
  const currentPalette = new Set(paletteFamilies(product));
  const currentMaterial = materialFamily(product);
  const candidates = products.filter((item) => item.id !== product.id && item.audience === product.audience);
  const score = (item, rolePriority) => {
    const sharedPalette = paletteFamilies(item).some((family) => currentPalette.has(family));
    const sameMaterial = materialFamily(item) === currentMaterial;
    return (styleRole(item) === desiredRoles[rolePriority] ? 100 : 0)
      + (sharedPalette ? 25 : 8)
      + (sameMaterial ? 20 : 0)
      + (item.collection === product.collection ? 12 : 0)
      + (item.productType !== product.productType ? 8 : 0);
  };
  const selected = [];
  for (let index = 0; index < desiredRoles.length; index += 1) {
    const match = candidates
      .filter((item) => !selected.some((chosen) => chosen.id === item.id) && styleRole(item) === desiredRoles[index])
      .sort((a, b) => score(b, index) - score(a, index))[0];
    if (match) selected.push(match);
  }
  return selected.length === 3 ? selected : candidates
    .filter((item) => !selected.some((chosen) => chosen.id === item.id))
    .sort((a, b) => score(b, desiredRoles.length) - score(a, desiredRoles.length))
    .slice(0, 3 - selected.length)
    .concat(selected);
}

export default function ProductDetail() {
  const { id } = useParams();
  const { products } = useStore();
  const product = products.find((item) => Number(item.id) === Number(id));
  const { addToCart, cartCount, cartTotal } = useCart();
  const { isFavorite, toggleFavorite } = useFavorites();
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  useDocumentTitle(product ? product.name : "Product");
  const [selectedColor, setSelectedColor] = useState(product?.colors?.[0] || "");
  const [selectedSize, setSelectedSize] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [activeImage, setActiveImage] = useState(0);
  const [added, setAdded] = useState(false);
  const [cartNoticeOpen, setCartNoticeOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [sizeGuideOpen, setSizeGuideOpen] = useState(false);
  const [measurement, setMeasurement] = useState({ chest: "", waist: "", footLength: "" });
  const [variantLoading, setVariantLoading] = useState(false);

  const variants = product?.variants || [];
  const normalizeOption = (value) => String(value || "").trim().toLocaleLowerCase("en");
  const colorVariants = variants.filter(
    (variant) => normalizeOption(variant.color) === normalizeOption(selectedColor)
  );
  const selectedVariant = colorVariants.find((variant) => variant.size === selectedSize);
  const currentStock = selectedVariant?.stock || 0;
  const lowStockThreshold = selectedVariant?.lowStockThreshold ?? 3;
  const quantityLimit = selectedVariant ? currentStock : Math.max(0, ...colorVariants.map((variant) => variant.stock));
  const quantityExceedsStock = Boolean(selectedVariant && quantity > currentStock);
const selectedColorImageKey = Object.keys(product?.colorImages || {}).find(
  (color) => normalizeOption(color) === normalizeOption(selectedColor)
);
const selectedColorImages = selectedColorImageKey
  ? product.colorImages[selectedColorImageKey] || []
  : [];
// Never mix another colour into the selected colour's gallery. A generic
// product image is the only safe fallback when that colour has no media yet.
const galleryImages = (selectedColorImages.length
  ? selectedColorImages
  : (product?.images || []).slice(0, 1)
).map((image) => ({ image, color: selectedColor }));
const liveProductsById = new Map(products.map((item) => [Number(item.id), item]));
const recommendationCatalog = catalogProducts.map((catalogProduct) => ({ ...catalogProduct, ...liveProductsById.get(catalogProduct.id) }));
const relatedProducts = product ? completeTheLook(product, recommendationCatalog) : [];
  const isFootwear = product?.productType === "Footwear";
  const detailItems = product ? constructionDetails(product) : [];
  const material = product ? materialProfile(product) : "";

  if (!product) return <main id="product-detail-container"><p>Product not found.</p><Link to="/">Back to home</Link></main>;

  const chooseColor = (color) => {
    setVariantLoading(true);
    setSelectedColor(color); setSelectedSize(""); setQuantity(1); setActiveImage(0); setMessage("");
    window.setTimeout(() => setVariantLoading(false), 150);
  };

  const chooseSize = (size) => {
    setVariantLoading(true);
    setSelectedSize(size); setQuantity(1); setMessage("");
    window.setTimeout(() => setVariantLoading(false), 150);
  };

  const chooseImage = (index) => {
    const galleryItem = galleryImages[index];
    if (!galleryItem) return;
    setActiveImage(index);
  };

  const handleAddToCart = () => {
    if (!selectedSize) return setMessage("Please select a size before adding this item to your bag.");
    if (!selectedVariant || currentStock < 1) return setMessage("This variant is currently out of stock.");
    if (quantityExceedsStock) return setMessage("Please adjust your quantity before adding this item to your bag.");
    addToCart(product, quantity, selectedColor, selectedSize, selectedVariant);
    setMessage(""); setAdded(true); setCartNoticeOpen(true); setTimeout(() => setAdded(false), 2000);
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
      {cartNoticeOpen && <div className="cart-added-overlay" role="dialog" aria-modal="true" aria-labelledby="cart-added-title" onClick={() => setCartNoticeOpen(false)}><section className="cart-added-modal" onClick={(event) => event.stopPropagation()}><button type="button" className="cart-added-close" aria-label="Close notification" onClick={() => setCartNoticeOpen(false)}>×</button><p className="eyebrow">Maison Rue · The art of quiet luxury</p><h2 id="cart-added-title">Added to your bag</h2><p className="cart-added-product">{product.name} <span>{selectedColor}{selectedSize ? ` · ${selectedSize}` : ""} · Qty {quantity}</span></p><div className="cart-added-summary"><span>{cartCount} items in your bag</span><strong>{money(cartTotal)}</strong></div><p className="cart-added-note">Your selection is ready for the next step.</p><div className="cart-added-actions"><button type="button" className="cart-added-primary" onClick={() => navigate("/cart")}>View bag</button><button type="button" className="cart-added-secondary" onClick={() => setCartNoticeOpen(false)}>Continue shopping</button></div></section></div>}
          <div className="product-breadcrumb"><Link to={product.audience === "kids" ? "/kids" : product.gender === "nam" ? "/men" : product.gender === "nữ" ? "/women" : "/"}>{product.audience === "kids" ? "Kids" : product.gender === "nam" ? "Men" : product.gender === "nữ" ? "Women" : "Home"}</Link><span>/</span><span>{product.subcategory}</span><span>/</span><span>{product.name}</span></div>
      <div className="product-detail">
          <div className="product-gallery">
          <div className={`product-media-grid${variantLoading ? " is-loading" : ""}`}>
            {galleryImages.map((item, index) => <button key={`${item.color}-${item.image}`} className={activeImage === index ? "active" : ""} onClick={() => chooseImage(index)} aria-label={`View ${item.color} image ${index + 1}`}><img src={`/${item.image}`} alt={`${product.name} — ${item.color}`} /></button>)}
          </div>
        </div>
        <div className="product-info">
          <p className="product-category">{product.collection}</p><div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start" }}><h1>{product.name}</h1><button type="button" className="product-wishlist-button" aria-label={isFavorite(product.id) ? "Remove from wishlist" : "Add to wishlist"} aria-pressed={isFavorite(product.id)} onClick={async () => { const result = await toggleFavorite(product.id); if (result?.requiresLogin || currentUser?.role !== "customer") navigate(`/login?returnTo=${encodeURIComponent(location.pathname)}`); }}><i className={isFavorite(product.id) ? "fas fa-heart" : "far fa-heart"} /></button></div>
          <p className="product-subtitle">{product.fit} · {product.material}</p>{product.promotionDiscount > 0 ? <div className="detail-promotion-price"><span>{money(product.price)}</span><strong>{money(product.promotionPrice)}</strong><small>{product.promotionName} · Applied automatically</small></div> : <p className="product-price">{money(product.price)}</p>}
          <div className="detail-selector"><div className="selector-heading"><strong>Colour</strong><span aria-live="polite">{selectedColor}</span></div><div className="color-swatches">{product.colorOptions.map((color) => <button key={color.name} className={selectedColor === color.name ? "active" : ""} onClick={() => chooseColor(color.name)} title={color.name} aria-label={`Choose colour ${color.name}`} aria-pressed={selectedColor === color.name}><span style={{ background: color.hex }} /></button>)}</div></div>
          <div className="detail-selector"><div className="selector-heading"><strong>Size</strong>{product.sizeGuide?.length > 0 && <button className="text-button" onClick={() => setSizeGuideOpen(true)}>Find my size · Size guide</button>}</div><div className="size-options">{colorVariants.map((variant) => <button key={variant.id} disabled={variant.stock < 1} className={selectedSize === variant.size ? "active" : ""} onClick={() => chooseSize(variant.size)}>{variant.size}</button>)}</div></div>
          <div className={`variant-status${selectedSize && currentStock > 0 && currentStock <= lowStockThreshold ? " low" : ""}`} aria-live="polite">
            {!selectedSize
              ? "Select a size to view availability"
              : currentStock < 1
                ? "Out of stock"
                : currentStock <= lowStockThreshold
                  ? `Only ${currentStock} ${currentStock === 1 ? "item" : "items"} left`
                  : `In stock · ${currentStock} items available`}
          </div>
          {message && <p className="product-validation">{message}</p>}
          <div className="product-actions refined-actions"><div className="quantity-controls"><button type="button" aria-label="Decrease quantity" disabled={quantity <= 1} onClick={() => setQuantity((q) => Math.max(1, q - 1))}>−</button><input readOnly value={quantity} aria-label="Quantity" /><button type="button" aria-label="Increase quantity" disabled={quantityLimit < 1 || quantity >= 10} onClick={() => setQuantity((q) => Math.min(10, q + 1))}>+</button></div><button className="btn-primary btn-large" onClick={handleAddToCart}>{added ? "Added to bag ✓" : "Add to bag"}</button></div>
          {quantityExceedsStock && <p className="product-stock-notice" role="alert">Your selected quantity exceeds the current availability.</p>}
          <div className="service-notes"><span>Complimentary delivery</span><span>14-day exchange</span><span>Secure checkout</span></div>
        </div>
      </div>
      <section className="product-details-section">
        <details>
          <summary>Product details <span aria-hidden="true">+</span></summary>
          <ul>
            {detailItems.map((detail) => <li key={detail}>{detail}</li>)}
            <li>Material: {material}</li>
            <li>Care: Follow the care label to preserve the material and finish.</li>
            <li>Product code: {product.productCode}</li>
          </ul>
        </details>
        <details>
          <summary>Model & fit <span aria-hidden="true">+</span></summary>
          <p>{modelFitDetails(product)}</p>
        </details>
        <details>
          <summary>Care &amp; Maintenance <span aria-hidden="true">+</span></summary>
          <p>Handle this piece with care and follow the care label for material-specific instructions. Allow natural fibres to rest between wears, keep the item away from prolonged heat and direct light, and store it clean and dry. For delicate materials such as cashmere, silk and suede, we recommend professional care when needed.</p>
        </details>
        <details>
          <summary>Returns &amp; Exchange <span aria-hidden="true">+</span></summary>
          <p>Submit a request within 14 calendar days of confirmed delivery. Promotional items are excluded from fit or change-of-mind requests, but incorrect, missing, damaged or faulty items can still be reviewed. Maison Rue inspects each returned item in person before completing any refund or exchange. Photos are not required to submit a request. <Link to="/returns">Read our full Returns &amp; Refunds policy</Link>.</p>
        </details>
      </section>
      {sizeGuideOpen && product.sizeGuide?.length > 0 && <div className="size-guide-overlay" role="dialog" aria-modal="true" aria-labelledby="size-guide-title" onClick={() => setSizeGuideOpen(false)}><div className="size-guide-modal" onClick={(event) => event.stopPropagation()}><button className="size-guide-close" onClick={() => setSizeGuideOpen(false)} aria-label="Close size guide">×</button><p className="eyebrow">Maison Rue fit service</p><h2 id="size-guide-title">Find your size</h2><p className="size-guide-intro">{isFootwear ? "Measure from the back of the heel to the longest toe." : "Measure over a light layer. Keep the tape relaxed and parallel to the floor."}</p><div className="measurement-grid">{isFootwear ? <label>Foot length (cm)<input type="number" min="0" step="0.1" value={measurement.footLength} onChange={(event) => setMeasurement((current) => ({ ...current, footLength: event.target.value }))} placeholder="e.g. 25.4" /></label> : <><label>Chest / bust (cm)<input type="number" min="0" value={measurement.chest} onChange={(event) => setMeasurement((current) => ({ ...current, chest: event.target.value }))} placeholder="e.g. 96" /></label><label>Waist (cm)<input type="number" min="0" value={measurement.waist} onChange={(event) => setMeasurement((current) => ({ ...current, waist: event.target.value }))} placeholder="e.g. 80" /></label></>}</div>{recommendedSize && <div className="size-recommendation"><strong>Recommended size: {recommendedSize}</strong><span>{isFootwear ? "If between sizes, choose the larger size." : "Choose the next size up if you prefer a relaxed fit."}</span></div>}<h3>How to measure</h3>{isFootwear ? <ol className="measure-steps"><li>Stand on a sheet of paper with your heel against a wall.</li><li>Mark the longest toe and measure the distance to the wall.</li><li>Measure both feet and use the larger measurement.</li></ol> : <ol className="measure-steps"><li><strong>Chest:</strong> measure around the fullest part.</li><li><strong>Waist:</strong> measure the narrowest part without pulling tight.</li><li><strong>Between sizes:</strong> size up for ease, size down for a closer fit.</li></ol>}<div className="size-table-wrap"><table><thead><tr><th>Size</th>{isFootwear ? <th>Foot length</th> : <><th>Chest</th><th>Waist</th><th>Length</th></>}</tr></thead><tbody>{product.sizeGuide.map((row) => <tr key={row.size}><td>{row.size}</td>{isFootwear ? <td>{row.footLength} cm</td> : <><td>{row.chest} cm</td><td>{row.waist} cm</td><td>{row.length} cm</td></>}</tr>)}</tbody></table></div></div></div>}
      {relatedProducts.length > 0 && <section className="related-section"><p className="eyebrow">Curated for you</p><h2>Complete the Look</h2><div className="related-grid">{relatedProducts.map((item) => <ProductCard key={item.id} product={item} />)}</div></section>}
      <ProductReviews productId={product.id} />
    </main>
  );
}
