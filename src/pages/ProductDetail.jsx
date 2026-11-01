import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { getProductById } from "../data/products";
import { useCart } from "../hooks/useCart";
import { useStore } from "../hooks/useStore";
import useDocumentTitle from "../hooks/useDocumentTitle";

export default function ProductDetail() {
  const { id } = useParams();
  const product = getProductById(id);
  const { addToCart } = useCart();
  const { getProductStock } = useStore();
  useDocumentTitle(product ? product.name : "Sản phẩm");

  const [selectedColor, setSelectedColor] = useState(product?.colors[0]);
  const [quantity, setQuantity] = useState(1);
  const [activeImage, setActiveImage] = useState(0);
  const [added, setAdded] = useState(false);

  if (!product) {
    return (
      <main id="product-detail-container">
        <p>Sản phẩm không tồn tại.</p>
        <Link to="/">Về trang chủ</Link>
      </main>
    );
  }

  const currentStock = getProductStock(product.id);
  const isOutOfStock = currentStock === 0;
  const isLowStock = currentStock > 0 && currentStock <= 5;

  const images = product.colorImages[selectedColor] || product.images;

  function prevImage() {
    setActiveImage((i) => (i - 1 + images.length) % images.length);
  }
  function nextImage() {
    setActiveImage((i) => (i + 1) % images.length);
  }

  function handleAddToCart() {
    if (isOutOfStock) return;
    const finalQuantity = Math.min(quantity, currentStock);
    addToCart(product, finalQuantity, selectedColor);
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  }

  return (
    <main id="product-detail-container">
      <div className="product-detail">
        <div className="product-gallery">
          <div className="gallery-main">
            <img src={`/${images[activeImage] || images[0]}`} alt={product.name} />
            {images.length > 1 && (
              <>
                <button className="gallery-btn prev" onClick={prevImage}>‹</button>
                <button className="gallery-btn next" onClick={nextImage}>›</button>
                <span className="image-counter">{activeImage + 1} / {images.length}</span>
              </>
            )}
          </div>
        </div>

        <div className="product-info">
          <p className="product-category">{product.category}</p>
          <h1>{product.name}</h1>
          <p className="product-price">{product.price.toLocaleString("vi-VN")}đ</p>

          {/* Stock Availability Indicator */}
          <div style={{ marginBottom: "20px" }}>
            {isOutOfStock ? (
              <span
                style={{
                  display: "inline-block",
                  backgroundColor: "#FFF0F0",
                  color: "#D9534F",
                  padding: "5px 12px",
                  borderRadius: "4px",
                  fontSize: "13px",
                  fontWeight: "600",
                  border: "1px solid #F5C6CB",
                }}
              >
                <i className="fas fa-times-circle" style={{ marginRight: "6px" }}></i>
                Tạm thời hết hàng
              </span>
            ) : isLowStock ? (
              <span
                style={{
                  display: "inline-block",
                  backgroundColor: "#FFF8DC",
                  color: "#B8860B",
                  padding: "5px 12px",
                  borderRadius: "4px",
                  fontSize: "13px",
                  fontWeight: "600",
                  border: "1px solid #FFE4B5",
                }}
              >
                <i className="fas fa-exclamation-triangle" style={{ marginRight: "6px" }}></i>
                Chỉ còn {currentStock} sản phẩm trong kho
              </span>
            ) : (
              <span
                style={{
                  display: "inline-block",
                  backgroundColor: "#F0FFF0",
                  color: "#2E8B57",
                  padding: "5px 12px",
                  borderRadius: "4px",
                  fontSize: "13px",
                  fontWeight: "600",
                  border: "1px solid #C3E6CB",
                }}
              >
                <i className="fas fa-check-circle" style={{ marginRight: "6px" }}></i>
                Còn hàng ({currentStock} sản phẩm sẵn sàng giao)
              </span>
            )}
          </div>

          <div className="product-description">
            <h3>Mô tả sản phẩm</h3>
            <p>{product.description}</p>
          </div>

          {product.colors.length > 1 && (
            <div className="product-colors">
              <h3>Màu: {selectedColor}</h3>
              <div className="color-options">
                {product.colors.map((c) => (
                  <button
                    key={c}
                    className="color-tag"
                    style={c === selectedColor ? { background: "#B8A894", color: "#fff" } : undefined}
                    onClick={() => { setSelectedColor(c); setActiveImage(0); }}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="product-actions">
            {!isOutOfStock && (
              <div className="quantity-selector">
                <label>Số lượng</label>
                <div className="quantity-controls">
                  <button onClick={() => setQuantity((q) => Math.max(1, q - 1))}>-</button>
                  <input readOnly value={quantity} />
                  <button onClick={() => setQuantity((q) => Math.min(currentStock, q + 1))}>+</button>
                </div>
              </div>
            )}

            <button
              className="btn-primary btn-large"
              onClick={handleAddToCart}
              disabled={isOutOfStock}
              style={isOutOfStock ? { opacity: 0.5, cursor: "not-allowed", backgroundColor: "#767676" } : {}}
            >
              {isOutOfStock
                ? "Tạm Hết Hàng"
                : added
                ? "Đã thêm vào giỏ ✓"
                : "Thêm vào giỏ hàng"}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
