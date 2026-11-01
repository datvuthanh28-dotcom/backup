import { Link } from "react-router-dom";
import { useCart } from "../hooks/useCart";
import { useStore } from "../hooks/useStore";
import useDocumentTitle from "../hooks/useDocumentTitle";

function formatPrice(v) {
  return v.toLocaleString("vi-VN") + "đ";
}

export default function Cart() {
  useDocumentTitle("Giỏ Hàng");
  const { cart, removeFromCart, updateQuantity, cartCount, cartTotal } = useCart();
  const { getProductStock } = useStore();

  if (cart.length === 0) {
    return (
      <main id="cart-container">
        <div className="empty-cart">
          <h2>Giỏ Hàng Trống</h2>
          <p>Hãy thêm sản phẩm vào giỏ hàng của bạn để trải nghiệm dịch vụ</p>
          <Link to="/" className="btn-primary">Tiếp Tục Mua Sắm</Link>
        </div>
      </main>
    );
  }

  // Check if any cart item has insufficient stock
  let hasStockIssue = false;
  const itemStockStatus = cart.map((item) => {
    const stock = getProductStock(item.id);
    const insufficient = item.quantity > stock;
    if (insufficient) hasStockIssue = true;
    return { ...item, availableStock: stock, insufficient };
  });

  return (
    <main id="cart-container">
      <div className="cart-content">
        <div className="cart-items">
          {itemStockStatus.map((item) => {
            const image =
              item.selectedColor && item.colorImages
                ? item.colorImages[item.selectedColor][0]
                : item.images[0];
            return (
              <div className="cart-item" key={item.cartItemId}>
                <div className="cart-item-image">
                  <img src={`/${image}`} alt={item.name} />
                </div>

                <div className="cart-item-info">
                  <h3>{item.name}</h3>
                  <p className="cart-item-category">{item.category.toUpperCase()}</p>
                  {item.selectedColor && (
                    <p className="cart-item-color">Màu: {item.selectedColor}</p>
                  )}
                  <p className="cart-item-price">{formatPrice(item.price)}</p>

                  {/* Stock validation badge */}
                  {item.availableStock === 0 ? (
                    <div style={{ color: "#D9534F", fontSize: "12px", marginTop: "4px", fontWeight: "600" }}>
                      ⚠️ Sản phẩm này đã hết hàng trong kho
                    </div>
                  ) : item.insufficient ? (
                    <div style={{ color: "#D9534F", fontSize: "12px", marginTop: "4px", fontWeight: "600" }}>
                      ⚠️ Chỉ còn {item.availableStock} sản phẩm (bạn chọn {item.quantity})
                    </div>
                  ) : item.availableStock <= 5 ? (
                    <div style={{ color: "#B8860B", fontSize: "12px", marginTop: "4px" }}>
                      ⚡ Kho chỉ còn {item.availableStock} sản phẩm
                    </div>
                  ) : (
                    <div style={{ color: "#2E8B57", fontSize: "12px", marginTop: "4px" }}>
                      ✓ Sẵn hàng ({item.availableStock} sản phẩm)
                    </div>
                  )}
                </div>

                <div className="cart-item-quantity">
                  <label>Số Lượng:</label>
                  <div className="quantity-controls">
                    <button onClick={() => updateQuantity(item.cartItemId, Math.max(1, item.quantity - 1))}>−</button>
                    <input
                      type="number"
                      min="1"
                      max={item.availableStock || 99}
                      value={item.quantity}
                      onChange={(e) => updateQuantity(item.cartItemId, Math.max(1, Number(e.target.value)))}
                    />
                    <button
                      onClick={() => {
                        if (item.quantity < item.availableStock) {
                          updateQuantity(item.cartItemId, item.quantity + 1);
                        }
                      }}
                      disabled={item.quantity >= item.availableStock}
                      style={item.quantity >= item.availableStock ? { opacity: 0.4, cursor: "not-allowed" } : {}}
                    >
                      +
                    </button>
                  </div>
                </div>

                <div className="cart-item-total">
                  <p>{formatPrice(item.price * item.quantity)}</p>
                </div>

                <button className="btn-remove" onClick={() => removeFromCart(item.cartItemId)} title="Xóa khỏi giỏ">
                  <i className="fas fa-trash"></i>
                </button>
              </div>
            );
          })}
        </div>

        <div className="cart-summary">
          <div className="summary-row">
            <span>Tổng Số Sản Phẩm:</span>
            <span>{cartCount}</span>
          </div>
          <div className="summary-row">
            <span>Vận chuyển cao cấp:</span>
            <span style={{ color: "#2E8B57", fontWeight: "600" }}>MIỄN PHÍ</span>
          </div>
          <div className="summary-row total">
            <span>Tổng Tiền:</span>
            <span>{formatPrice(cartTotal)}</span>
          </div>

          {hasStockIssue && (
            <div
              style={{
                backgroundColor: "#FFF0F0",
                color: "#D9534F",
                border: "1px solid #F5C6CB",
                padding: "10px",
                borderRadius: "5px",
                fontSize: "12.5px",
                marginBottom: "15px",
                lineHeight: "1.4",
              }}
            >
              Một số sản phẩm vượt quá số lượng tồn kho khả dụng. Vui lòng cập nhật lại số lượng trước khi đặt hàng.
            </div>
          )}

          {hasStockIssue ? (
            <button
              className="btn-primary btn-large"
              disabled
              style={{ opacity: 0.5, cursor: "not-allowed" }}
            >
              Chưa thể thanh toán
            </button>
          ) : (
            <Link
              to="/checkout"
              className="btn-primary btn-large"
              style={{ display: "block", textAlign: "center", textDecoration: "none" }}
            >
              Tiến Hành Đặt Hàng
            </Link>
          )}

          <Link
            to="/"
            className="btn-secondary"
            style={{ textAlign: "center", textDecoration: "none" }}
          >
            Tiếp Tục Mua Sắm
          </Link>
        </div>
      </div>
    </main>
  );
}
