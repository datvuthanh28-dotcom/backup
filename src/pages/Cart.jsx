import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useCart } from "../hooks/useCart";
import { useStore } from "../hooks/useStore";
import useDocumentTitle from "../hooks/useDocumentTitle";

function formatPrice(v) {
  return v.toLocaleString("vi-VN") + "đ";
}

export default function Cart() {
  useDocumentTitle("Shopping Bag");
  const { cart, removeFromCart, updateQuantity, selectedCartCount, selectedCartTotal, selectedCartItemIds, toggleCartItemSelected, setAllCartItemsSelected, cartLoading, cartError } = useCart();
  const { getProductStock } = useStore();
  const [quantityDrafts, setQuantityDrafts] = useState({});

  useEffect(() => {
    setQuantityDrafts((drafts) => {
      const next = { ...drafts };
      for (const item of cart) {
        if (!(item.cartItemId in next)) next[item.cartItemId] = String(item.quantity);
      }
      for (const id of Object.keys(next)) {
        if (!cart.some((item) => item.cartItemId === id)) delete next[id];
      }
      return next;
    });
  }, [cart]);

  const commitQuantity = (item, rawValue) => {
    const parsed = Number.parseInt(rawValue, 10);
    const value = rawValue === "" || !Number.isFinite(parsed) ? 1 : Math.min(10, Math.max(1, parsed));
    updateQuantity(item.cartItemId, value);
    setQuantityDrafts((drafts) => ({ ...drafts, [item.cartItemId]: String(value) }));
  };

  if (cartLoading) {
    return <main id="cart-container"><div className="empty-cart"><p>Loading your bag...</p></div></main>;
  }

  if (cart.length === 0) {
    return (
      <main id="cart-container">
        <div className="empty-cart">
          {cartError && <p className="form-error">{cartError}</p>}
          <h2>Your Bag Is Empty</h2>
          <p>Add something to your bag and discover the Maison Rue experience.</p>
          <Link to="/" className="btn-primary">Continue Shopping</Link>
        </div>
      </main>
    );
  }

  // Check if any cart item has insufficient stock
  const itemStockStatus = cart.map((item) => {
    const stock = item.variantId ? item.variantStock : getProductStock(item.id);
    const insufficient = item.quantity > stock;
    return { ...item, availableStock: stock, insufficient };
  });
  const selectedIds = selectedCartItemIds === null ? cart.map((item) => item.cartItemId) : selectedCartItemIds;
  const allSelected = cart.length > 0 && selectedIds.length === cart.length;
  const selectedStockIssue = itemStockStatus.some((item) => selectedIds.includes(item.cartItemId) && item.insufficient);

  return (
    <main id="cart-container">
      <div className="cart-content">
        <div className="cart-items">
          <div className="cart-select-all"><label><input type="checkbox" checked={allSelected} onChange={(event) => setAllCartItemsSelected(event.target.checked)} /> <span>Select all</span></label><span>{selectedCartCount} items selected</span></div>
          {itemStockStatus.map((item) => {
            const image =
              item.selectedColor && item.colorImages
                ? item.colorImages[item.selectedColor][0]
                : item.images[0];
            return (
              <div className="cart-item" key={item.cartItemId}>
                <label className="cart-item-select"><input type="checkbox" aria-label={`Select ${item.name}`} checked={selectedIds.includes(item.cartItemId)} onChange={() => toggleCartItemSelected(item.cartItemId)} /></label>
                <div className="cart-item-image">
                  <img src={`/${image}`} alt={item.name} />
                </div>

                <div className="cart-item-info">
                  <h3>{item.name}</h3>
                  <p className="cart-item-category">{item.category.toUpperCase()}</p>
                  {item.selectedColor && (
                    <p className="cart-item-color">Colour: {item.selectedColor}</p>
                  )}
                  {item.selectedSize && <p className="cart-item-color">Size: {item.selectedSize} · {item.sku}</p>}
                  <p className="cart-item-price">{formatPrice(item.price)}</p>
                  {item.availableStock === 0 ? (
                    <p className="cart-stock-notice" role="alert">This item is currently unavailable.</p>
                  ) : item.insufficient ? (
                    <p className="cart-stock-notice" role="alert">Selected quantity exceeds availability.</p>
                  ) : null}
                </div>

                <div className="cart-item-quantity">
                  <label>Quantity:</label>
                  <div className="quantity-controls">
                    <button type="button" aria-label="Decrease quantity" disabled={item.quantity <= 1} onClick={() => commitQuantity(item, String(Math.max(1, item.quantity - 1)))}>−</button>
                    <input
                      type="text"
                      inputMode="numeric"
                      min="1"
                      max="10"
                      value={quantityDrafts[item.cartItemId] ?? String(item.quantity)}
                      onChange={(e) => setQuantityDrafts((drafts) => ({ ...drafts, [item.cartItemId]: e.target.value.replace(/\D/g, "").slice(0, 2) }))}
                      onBlur={(e) => commitQuantity(item, e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                      aria-label={`Quantity for ${item.name}`}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (item.quantity < 10) {
                          commitQuantity(item, String(item.quantity + 1));
                        }
                      }}
                      disabled={item.quantity >= 10}
                      style={item.quantity >= 10 ? { opacity: 0.4, cursor: "not-allowed" } : {}}
                    >
                      +
                    </button>
                  </div>
                </div>

                <div className="cart-item-total">
                  <p>{formatPrice(item.price * item.quantity)}</p>
                </div>

                <button className="btn-remove" onClick={() => removeFromCart(item.cartItemId)} title="Remove from bag">
                  <i className="fas fa-trash"></i>
                </button>
              </div>
            );
          })}
        </div>

        <div className="cart-summary">
          <div className="summary-row">
            <span>Items:</span>
            <span>{selectedCartCount}</span>
          </div>
          <div className="summary-row">
            <span>Shipping:</span>
            <span className="shipping-included">Complimentary</span>
          </div>
          <div className="summary-row total">
            <span>Total:</span>
            <span>{formatPrice(selectedCartTotal)}</span>
          </div>

          {selectedStockIssue && (
            <div className="cart-stock-summary" role="alert">
              Please adjust the quantity of the selected item before checkout.
            </div>
          )}

          {selectedIds.length === 0 ? (
            <button className="btn-primary btn-large" disabled style={{ opacity: 0.5, cursor: "not-allowed" }}>Select items to checkout</button>
          ) : selectedStockIssue ? (
            <button
              className="btn-primary btn-large"
              disabled
              style={{ opacity: 0.5, cursor: "not-allowed" }}
            >
              Unable to checkout
            </button>
          ) : (
            <Link
              to="/checkout"
              className="btn-primary btn-large"
              style={{ display: "block", textAlign: "center", textDecoration: "none" }}
            >
              Proceed to Checkout
            </Link>
          )}

          <Link
            to="/"
            className="btn-secondary"
            style={{ textAlign: "center", textDecoration: "none" }}
          >
            Continue Shopping
          </Link>
        </div>
      </div>
    </main>
  );
}
