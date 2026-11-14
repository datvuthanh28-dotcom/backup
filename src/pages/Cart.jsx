import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useCart } from "../hooks/useCart";
import { useStore } from "../hooks/useStore";
import useDocumentTitle from "../hooks/useDocumentTitle";
import { promotionAPI } from "../services/api";

function formatPrice(v) {
  return Math.round(Number(v || 0)).toLocaleString("vi-VN") + "đ";
}

export default function Cart() {
  useDocumentTitle("Shopping Bag");
  const { cart, removeFromCart, updateQuantity, clearCart, selectedCartCount, selectedCartTotal, selectedCartItemIds, toggleCartItemSelected, setAllCartItemsSelected, cartLoading, cartError } = useCart();
  const { getProductStock } = useStore();
  const [quantityDrafts, setQuantityDrafts] = useState({});
  const [pricing, setPricing] = useState(null);
  const [pricingLoading, setPricingLoading] = useState(false);
  const [pricingError, setPricingError] = useState("");
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [clearingCart, setClearingCart] = useState(false);

  useEffect(() => {
    if (!clearConfirmOpen) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === "Escape" && !clearingCart) setClearConfirmOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [clearConfirmOpen, clearingCart]);

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

  const itemStockStatus = useMemo(() => cart.map((item) => {
    const stock = item.variantId ? item.variantStock : getProductStock(item.id);
    return { ...item, availableStock: stock, insufficient: item.quantity > stock };
  }), [cart, getProductStock]);
  const selectedIds = useMemo(
    () => selectedCartItemIds === null ? cart.map((item) => item.cartItemId) : selectedCartItemIds,
    [cart, selectedCartItemIds]
  );
  const selectedItems = useMemo(
    () => itemStockStatus.filter((item) => selectedIds.includes(item.cartItemId)),
    [itemStockStatus, selectedIds]
  );

  useEffect(() => {
    let active = true;
    if (!selectedItems.length) {
      setPricing(null);
      setPricingError("");
      setPricingLoading(false);
      return () => { active = false; };
    }
    setPricingLoading(true);
    setPricingError("");
    promotionAPI.preview(selectedItems)
      .then((result) => { if (active) setPricing(result.pricing || null); })
      .catch((error) => {
        if (!active) return;
        setPricing(null);
        setPricingError(error.message || "Promotional pricing is temporarily unavailable.");
      })
      .finally(() => { if (active) setPricingLoading(false); });
    return () => { active = false; };
  }, [selectedItems]);

  const commitQuantity = (item, rawValue) => {
    const parsed = Number.parseInt(rawValue, 10);
    const value = rawValue === "" || !Number.isFinite(parsed) ? 1 : Math.min(10, Math.max(1, parsed));
    updateQuantity(item.cartItemId, value);
    setQuantityDrafts((drafts) => ({ ...drafts, [item.cartItemId]: String(value) }));
  };

  if (cartLoading) {
    return <main id="cart-container"><div className="empty-cart"><p>Loading your bag…</p></div></main>;
  }

  if (cart.length === 0) {
    return (
      <main id="cart-container">
        <div className="empty-cart">
          {cartError && <p className="form-error">{cartError}</p>}
          <h2>Your Bag Is Empty</h2>
          <p>Discover Maison Rue designs and choose the pieces that suit you.</p>
          <Link to="/" className="btn-primary">Continue Shopping</Link>
        </div>
      </main>
    );
  }

  const allSelected = cart.length > 0 && selectedIds.length === cart.length;
  const selectedStockIssue = itemStockStatus.some((item) => selectedIds.includes(item.cartItemId) && item.insufficient);

  const pricedItems = new Map((pricing?.items || []).map((item) => [item.cartItemId, item]));
  const automaticDiscount = Number(pricing?.productDiscountTotal || 0);
  const displayedTotal = pricing ? Number(pricing.finalTotal || 0) : selectedCartTotal;
  const categoryLabels = { clothing: "Clothing", footwear: "Footwear", accessories: "Accessories" };

  const handleClearCart = async () => {
    setClearingCart(true);
    try {
      setClearConfirmOpen(false);
      await clearCart();
    } finally {
      setClearingCart(false);
    }
  };

  return (
    <main id="cart-container">
      <div className="cart-content">
        <div className="cart-items">
          <div className="cart-select-all">
            <label><input type="checkbox" checked={allSelected} onChange={(event) => setAllCartItemsSelected(event.target.checked)} /> <span>Select all</span></label>
            <div className="cart-toolbar-actions">
              <span>{selectedCartCount} {selectedCartCount === 1 ? "item" : "items"} selected</span>
              <button type="button" className="cart-clear-button" onClick={() => setClearConfirmOpen(true)}>Clear bag</button>
            </div>
          </div>
          {itemStockStatus.map((item) => {
            const pricedItem = pricedItems.get(item.cartItemId);
            const hasDiscount = Number(pricedItem?.automaticDiscount || 0) > 0;
            const discountedUnitPrice = pricedItem ? Number(pricedItem.finalLineTotal || 0) / item.quantity : item.price;
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
                  <p className="cart-item-category">{(categoryLabels[item.category?.toLowerCase()] || item.category).toUpperCase()}</p>
                  {item.selectedColor && (
                    <p className="cart-item-color">Colour: {item.selectedColor}</p>
                  )}
                  {item.selectedSize && <p className="cart-item-color">Size: {item.selectedSize} · {item.sku}</p>}
                  <div className={`cart-item-price${hasDiscount ? " has-discount" : ""}`}>
                    <span className="cart-price-caption">Unit price</span>
                    {hasDiscount && <span>{formatPrice(item.price)}</span>}
                    <strong>{formatPrice(discountedUnitPrice)}</strong>
                    {hasDiscount && <small className="cart-promotion-name">{pricedItem.automaticPromotion?.name || "Product promotion"}</small>}
                  </div>
                  {item.availableStock === 0 ? (
                    <p className="cart-stock-notice" role="alert">This item is currently unavailable.</p>
                  ) : item.insufficient ? (
                    <p className="cart-stock-notice" role="alert">Selected quantity exceeds availability.</p>
                  ) : null}
                </div>

                <div className="cart-item-quantity">
                  <label>Quantity</label>
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
                  <small>Line total</small>
                  {hasDiscount && <del>{formatPrice(pricedItem.originalLineTotal)}</del>}
                  <p>{formatPrice(pricedItem?.finalLineTotal ?? item.price * item.quantity)}</p>
                </div>

                <button className="btn-remove" onClick={() => removeFromCart(item.cartItemId)} title="Remove from bag" aria-label={`Remove ${item.name} from bag`}>
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
          {automaticDiscount > 0 && (
            <div className="summary-row cart-promotion-saving">
              <span>Product savings:</span>
              <span>−{formatPrice(automaticDiscount)}</span>
            </div>
          )}
          <div className="summary-row total">
            <span>Total:</span>
            <span>{pricingLoading ? "Calculating…" : formatPrice(displayedTotal)}</span>
          </div>

          {pricingError && <p className="cart-pricing-error" role="status">{pricingError} Pricing will be confirmed again at checkout.</p>}

          {selectedStockIssue && (
            <div className="cart-stock-summary" role="alert">
              Please adjust the selected quantity before checkout.
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

      {clearConfirmOpen && (
        <div className="cart-clear-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !clearingCart) setClearConfirmOpen(false); }}>
          <section className="cart-clear-dialog" role="dialog" aria-modal="true" aria-labelledby="cart-clear-title">
            <button type="button" className="cart-clear-dialog__close" onClick={() => setClearConfirmOpen(false)} aria-label="Close">×</button>
            <p className="eyebrow">SHOPPING BAG</p>
            <h2 id="cart-clear-title">Clear your entire bag?</h2>
            <p>Every item in your shopping bag will be removed. This action cannot be undone.</p>
            <div className="cart-clear-dialog__actions">
              <button type="button" onClick={() => setClearConfirmOpen(false)} disabled={clearingCart}>Cancel</button>
              <button type="button" className="danger" onClick={handleClearCart} disabled={clearingCart}>{clearingCart ? "Clearing…" : "Clear bag"}</button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
