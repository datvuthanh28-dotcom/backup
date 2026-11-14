import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useCart } from "../hooks/useCart";
import { useStore } from "../hooks/useStore";
import { useAuth } from "../context/AuthContext";
import useDocumentTitle from "../hooks/useDocumentTitle";
import { customerAPI, promotionAPI } from "../services/api";

function formatPrice(v) {
  return v.toLocaleString("vi-VN") + "đ";
}

export default function Checkout() {
  useDocumentTitle("Checkout");
  const { cart, selectedCartItemIds, selectedCartTotal, removeCartItems, cartLoading, cartError } = useCart();
  const checkoutItems = useMemo(() => selectedCartItemIds === null ? cart : cart.filter((item) => selectedCartItemIds.includes(item.cartItemId)), [cart, selectedCartItemIds]);
  const { createOrder } = useStore();
  const { currentUser } = useAuth();
  const [searchParams] = useSearchParams();
  const suggestedCode = searchParams.get("promo")?.trim().toUpperCase() || "";

  const [formData, setFormData] = useState({
    name: currentUser?.name || "",
    email: currentUser?.email || "",
    phone: currentUser?.phone || "",
    address: "",
    paymentMethod: "cod",
    notes: "",
  });

  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState(null);
  const [codeInput, setCodeInput] = useState(suggestedCode);
  const [appliedCode, setAppliedCode] = useState(suggestedCode);
  const [pricing, setPricing] = useState(null);
  const [promotionMessage, setPromotionMessage] = useState("");
  const [previewing, setPreviewing] = useState(false);
  const [promoModalOpen, setPromoModalOpen] = useState(false);
  const [availableOffers, setAvailableOffers] = useState([]);
  const [offersLoading, setOffersLoading] = useState(false);
  const [offersError, setOffersError] = useState("");
  const [savedAddresses, setSavedAddresses] = useState([]);
  const [selectedAddressId, setSelectedAddressId] = useState("");
  const [addressSuggestions, setAddressSuggestions] = useState([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [addressConfirmed, setAddressConfirmed] = useState(false);
  const [verifyingAddress, setVerifyingAddress] = useState(false);
  const [verifiedExplanation, setVerifiedExplanation] = useState("");
  const [addressVerificationStatus, setAddressVerificationStatus] = useState("");

  useEffect(() => {
    if (!currentUser) return;
    setFormData((previous) => ({
      ...previous,
      name: previous.name || currentUser.name || "",
      email: currentUser.role === "customer" ? (currentUser.email || previous.email) : (previous.email || currentUser.email || ""),
      phone: previous.phone || currentUser.phone || "",
    }));
  }, [currentUser]);

  useEffect(() => {
    if (currentUser?.role !== "customer") return;
    customerAPI.getAccount().then((result) => {
      const addresses = result.addresses || [];
      setSavedAddresses(addresses);
      const preferred = addresses.find((item) => item.is_default) || addresses[0];
      if (preferred) {
        setSelectedAddressId(String(preferred.id));
        setFormData((previous) => ({ ...previous, address: preferred.address_text }));
        setAddressConfirmed(true);
        setAddressVerificationStatus("SAVED_ADDRESS");
      }
    }).catch(() => setSavedAddresses([]));
  }, [currentUser?.id, currentUser?.role]);

  useEffect(() => {
    if (!formData.address || formData.address.trim().length < 3 || selectedAddressId) {
      setAddressSuggestions([]);
      return;
    }
    let active = true;
    const timer = setTimeout(async () => {
      setSuggestionsLoading(true);
      try {
        const result = await customerAPI.getAddressSuggestions(formData.address.trim(), "VN");
        if (active) {
          setAddressSuggestions(result.suggestions || []);
          setSuggestionsOpen(true);
        }
      } catch {
        if (active) setAddressSuggestions([]);
      } finally {
        if (active) setSuggestionsLoading(false);
      }
    }, 350);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [formData.address, selectedAddressId]);

  const previewPricing = useCallback(async (code = "") => {
    if (!checkoutItems.length) return;
    setPreviewing(true); setPromotionMessage("");
    try { const result = await promotionAPI.preview(checkoutItems, code); setPricing(result.pricing); if (code) setPromotionMessage(`Promo code ${result.pricing.code} has been applied.`); }
    catch (error) { setPromotionMessage(error.message); if (code) { setAppliedCode(""); setPricing(null); } }
    finally { setPreviewing(false); }
  }, [checkoutItems]);

  useEffect(() => { previewPricing(appliedCode); }, [appliedCode, previewPricing]);

  useEffect(() => {
    if (!promoModalOpen) return undefined;
    const closeOnEscape = (event) => { if (event.key === "Escape") setPromoModalOpen(false); };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [promoModalOpen]);

  const openPromotionPicker = async () => {
    setPromoModalOpen(true);
    setOffersLoading(true);
    setOffersError("");
    try {
      const result = await promotionAPI.getMyOffers();
      const candidates = (result.offers || []).filter((offer) => !offer.used_by_customer && offer.assignment_status !== "used");
      const checked = await Promise.allSettled(candidates.map(async (offer) => {
        const preview = await promotionAPI.preview(checkoutItems, offer.code);
        return {
          ...offer,
          saving: Number(preview.pricing?.codeDiscountTotal || 0) + Number(preview.pricing?.shippingDiscountTotal || 0),
          finalTotal: Number(preview.pricing?.finalTotal || 0),
        };
      }));
      setAvailableOffers(checked.filter((entry) => entry.status === "fulfilled").map((entry) => entry.value));
    } catch (error) {
      setAvailableOffers([]);
      setOffersError(error.status === 401 ? "Sign in to view promo codes assigned to your account." : error.message);
    } finally {
      setOffersLoading(false);
    }
  };

  const applyPromotionCode = () => {
    const normalized = codeInput.trim().toUpperCase();
    if (!normalized) return;
    setAppliedCode(normalized);
    setPromoModalOpen(false);
  };

  if (cartLoading && !orderSuccess) {
    return <main id="cart-container" style={{ padding: "60px 20px", textAlign: "center" }}>Loading your bag...</main>;
  }

  if (checkoutItems.length === 0 && !orderSuccess) {
    return (
      <main id="cart-container" style={{ padding: "60px 20px", textAlign: "center" }}>
        <div className="empty-cart" style={{ maxWidth: "600px", margin: "0 auto" }}>
          <h2>No items selected</h2>
          <p>{cartError || "Please select items in your bag before proceeding to checkout."}</p>
          <Link to="/" className="btn-primary">Continue shopping</Link>
        </div>
      </main>
    );
  }

  const handleVerifyAddress = async (addrToVerify) => {
    const text = (addrToVerify || formData.address || "").trim();
    if (!text) {
      setErrors((prev) => ({ ...prev, address: "Please enter a complete delivery address to verify." }));
      return false;
    }
    setVerifyingAddress(true);
    setErrors((prev) => ({ ...prev, address: "" }));
    try {
      const res = await customerAPI.verifyAddress(text, "VN");
      if (res.success && res.verifiedAddress) {
        setFormData((prev) => ({ ...prev, address: res.verifiedAddress.formatted || text }));
        setAddressConfirmed(true);
        setAddressVerificationStatus(res.verifiedAddress.status || "MATCHED");
        setVerifiedExplanation(res.verifiedAddress.explanation || "This address matches the available map data.");
        return true;
      } else {
        setAddressConfirmed(false);
        setErrors((prev) => ({ ...prev, address: res.error || "There is not enough information to verify this address." }));
        return false;
      }
    } catch (err) {
      setAddressConfirmed(false);
      setAddressVerificationStatus("");
      setErrors((prev) => ({ ...prev, address: err.message || "There is not enough information to verify this address." }));
      return false;
    } finally {
      setVerifyingAddress(false);
    }
  };

  const handleChange = (e) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    if (e.target.name === "address") {
      setSelectedAddressId("");
      setAddressConfirmed(false);
      setAddressVerificationStatus("");
      setVerifiedExplanation("");
      setErrors((prev) => ({ ...prev, address: "" }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!formData.name.trim()) errs.name = "Please enter the recipient's full name.";
    if (!/^0\d{9,10}$/.test(formData.phone.trim())) errs.phone = "Please enter a valid Vietnam phone number.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) errs.email = "Please enter a valid email address.";
    if (!formData.address.trim()) errs.address = "Please enter a complete delivery address.";

    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    if (!addressConfirmed) {
      const ok = await handleVerifyAddress(formData.address.trim());
      if (!ok) return;
    }

    setSubmitting(true);

    const result = await createOrder({
      customerName: formData.name.trim(),
      customerEmail: formData.email.trim(),
      customerPhone: formData.phone.trim(),
      shippingAddress: formData.address.trim(),
      paymentMethod: formData.paymentMethod,
      items: checkoutItems,
      notes: formData.notes,
      promotionCode: appliedCode,
    });

    if (!result.success) {
      const isAddrErr = /địa chỉ|geoapify|address|số nhà|tên đường/i.test(result.error);
      setErrors({ form: result.error, address: isAddrErr ? result.error : "" });
      setSubmitting(false);
      return;
    }

    // Clear this customer's persisted cart only after order creation succeeds.
    removeCartItems(checkoutItems.map((item) => item.cartItemId));

    setOrderSuccess(result.order);
    setSubmitting(false);
  };

  if (orderSuccess) {
    return (
      <main style={{ maxWidth: "700px", margin: "60px auto", padding: "0 20px" }}>
        <div
          style={{
            backgroundColor: "#FFFFFF",
            border: "1px solid #D8CEC1",
            borderRadius: "8px",
            padding: "50px 40px",
            textAlign: "center",
            boxShadow: "0 10px 30px rgba(43, 33, 28, 0.08)",
          }}
        >
          <div
            style={{
              width: "70px",
              height: "70px",
              borderRadius: "50%",
              backgroundColor: "#F0FFF0",
              color: "#2E8B57",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "32px",
              margin: "0 auto 20px",
              border: "1px solid #C3E6CB",
            }}
          >
            ✓
          </div>

          <h1
            style={{
              fontFamily: "'Cormorant Garamond', serif",
              fontSize: "36px",
              color: "#2B211C",
              marginBottom: "10px",
            }}
          >
            ORDER PLACED SUCCESSFULLY
          </h1>

          <p style={{ color: "#6B5A4B", fontSize: "15px", marginBottom: "25px" }}>
            Thank you for choosing Maison Rue. Your order number is:
          </p>

          <div
            style={{
              display: "inline-block",
              padding: "10px 24px",
              backgroundColor: "#F8F5F0",
              border: "1px dashed #B8A894",
              borderRadius: "6px",
              fontSize: "18px",
              fontWeight: "700",
              color: "#2B211C",
              letterSpacing: "1.5px",
              marginBottom: "30px",
            }}
          >
            {orderSuccess.id}
          </div>

          <div
            style={{
              textAlign: "left",
              backgroundColor: "#FAF6F0",
              borderRadius: "6px",
              padding: "20px",
              marginBottom: "30px",
              fontSize: "13.5px",
              border: "1px solid #E8E1D6",
            }}
          >
            <div style={{ marginBottom: "8px" }}>
              <strong>Recipient:</strong> {orderSuccess.customer_name || orderSuccess.customerName} ({orderSuccess.customer_phone || orderSuccess.customerPhone})
            </div>
            <div style={{ marginBottom: "8px" }}>
              <strong>Delivery address:</strong> {orderSuccess.shipping_address || orderSuccess.shippingAddress}
            </div>
            <div style={{ marginBottom: "8px" }}>
              <strong>Payment method:</strong>{" "}
              {(orderSuccess.payment_method || orderSuccess.paymentMethod) === "cod" ? "Cash on delivery (COD)" : "Bank transfer"}
            </div>
            <div>
              <strong>Total paid:</strong>{" "}
              <span style={{ color: "#B89B5E", fontWeight: "700", fontSize: "15px" }}>
                {formatPrice(orderSuccess.total_amount || orderSuccess.totalAmount || 0)}
              </span>
            </div>
          </div>

          <div style={{ display: "flex", gap: "15px", justifyContent: "center" }}>
            <Link to="/account/orders" className="btn-primary" style={{ textDecoration: "none", padding: "14px 28px" }}>
              View Order History
            </Link>
            <Link to="/" className="btn-secondary" style={{ textDecoration: "none", padding: "14px 28px", margin: 0, width: "auto" }}>
              Continue Shopping
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const pricedItemsByCartId = new Map((pricing?.items || []).map((item) => [item.cartItemId, item]));

  return (
    <main style={{ maxWidth: "1200px", margin: "40px auto", padding: "0 25px" }}>
      <h1
        style={{
          fontFamily: "'Cormorant Garamond', serif",
          fontSize: "40px",
          color: "#2B211C",
          textAlign: "center",
          marginBottom: "35px",
          fontWeight: "500",
        }}
      >
        CHECKOUT
      </h1>

      {errors.form && (
        <div
          style={{
            backgroundColor: "#FFF0F0",
            color: "#D9534F",
            border: "1px solid #F5C6CB",
            padding: "12px 20px",
            borderRadius: "6px",
            marginBottom: "25px",
            fontSize: "14px",
          }}
        >
          {errors.form}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="checkout-layout" style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: "40px" }}>
          {/* Shipping Details */}
          <div
            style={{
              backgroundColor: "#FFFFFF",
              border: "1px solid #D8CEC1",
              borderRadius: "8px",
              padding: "30px",
            }}
          >
            <h2
              style={{
                fontFamily: "'Cormorant Garamond', serif",
                fontSize: "24px",
                color: "#2B211C",
                marginBottom: "20px",
                borderBottom: "1px solid #E8E1D6",
                paddingBottom: "10px",
              }}
            >
              1. DELIVERY INFORMATION
            </h2>

            <div className="form-group">
              <label>Recipient's full name *</label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder="Enter your full name"
              />
              {errors.name && <span className="error">{errors.name}</span>}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "15px" }}>
              <div className="form-group">
                <label>Phone number *</label>
                <input
                  type="tel"
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                  placeholder="e.g. 0901234567"
                />
                {errors.phone && <span className="error">{errors.phone}</span>}
              </div>

              <div className="form-group">
                <label>Email *</label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  readOnly={currentUser?.role === "customer"}
                  placeholder="Email for order updates"
                />
                {currentUser?.role === "customer" && (
                  <p className="checkout-address-note">Order notifications are sent to your signed-in account email.</p>
                )}
                {errors.email && <span className="error">{errors.email}</span>}
              </div>
            </div>

            <div className="form-group">
              {savedAddresses.length > 0 && <>
                <label>Saved delivery address</label>
                <select className="checkout-address-select" value={selectedAddressId} onChange={(event) => { const selected = savedAddresses.find((item) => String(item.id) === event.target.value); setSelectedAddressId(event.target.value); if (selected) { setFormData((previous) => ({ ...previous, address: selected.address_text })); setAddressConfirmed(true); setErrors((prev) => ({ ...prev, address: "" })); } }}>
                  {savedAddresses.map((item) => <option key={item.id} value={item.id}>{item.is_default ? "Default — " : ""}{item.address_text}</option>)}
                </select>
                <p className="checkout-address-note">Choose another saved address or edit the delivery address below for this order.</p>
              </>}
              <label>Full delivery address *</label>
              <div style={{ position: "relative" }}>
                <input
                  type="text"
                  name="address"
                  value={formData.address}
                  onChange={handleChange}
                  onFocus={() => { if (addressSuggestions.length > 0) setSuggestionsOpen(true); }}
                  placeholder="Street address, ward, district, city, province"
                  autoComplete="off"
                />
                {suggestionsLoading && (
                  <small style={{ display: "block", color: "#8a5a36", marginTop: "4px" }}>
                    Searching for this location with Geoapify…
                  </small>
                )}
                {suggestionsOpen && addressSuggestions.length > 0 && (
                  <ul
                    style={{
                      position: "absolute",
                      top: "100%",
                      left: 0,
                      right: 0,
                      zIndex: 200,
                      background: "#ffffff",
                      border: "1px solid #d4c8b8",
                      borderRadius: "6px",
                      boxShadow: "0 6px 18px rgba(0,0,0,0.12)",
                      listStyle: "none",
                      padding: 0,
                      margin: "3px 0 0 0",
                      maxHeight: "220px",
                      overflowY: "auto",
                    }}
                  >
                    {addressSuggestions.map((suggestion) => (
                      <li key={suggestion.placeId} style={{ borderBottom: "1px solid #f2ece4" }}>
                        <button
                          type="button"
                          style={{
                            width: "100%",
                            textAlign: "left",
                            padding: "9px 12px",
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            fontSize: "13px",
                            color: "#2c2523",
                            lineHeight: "1.4",
                          }}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setSuggestionsOpen(false);
                            setAddressSuggestions([]);
                            setFormData((prev) => ({ ...prev, address: suggestion.description }));
                            handleVerifyAddress(suggestion.description);
                          }}
                        >
                          📍 {suggestion.description}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "6px" }}>
                  <button
                    type="button"
                    disabled={verifyingAddress || !formData.address.trim()}
                    onClick={() => handleVerifyAddress(formData.address)}
                    style={{
                      padding: "6px 14px",
                      backgroundColor: addressConfirmed
                        ? addressVerificationStatus === "PENDING_MANUAL_REVIEW" ? "#9a6700" : "#2e7d32"
                        : "#1a1615",
                      color: "#fff",
                      border: "none",
                      borderRadius: "4px",
                      fontSize: "12px",
                      cursor: "pointer",
                      transition: "background-color 0.2s ease",
                    }}
                  >
                    {verifyingAddress
                      ? "Verifying address…"
                      : addressConfirmed
                        ? addressVerificationStatus === "PENDING_MANUAL_REVIEW" ? "✓ Submitted for review" : "✓ Verified"
                        : "Verify address"}
                  </button>
                  {addressConfirmed && (
                    <small style={{ color: addressVerificationStatus === "PENDING_MANUAL_REVIEW" ? "#9a6700" : "#2e7d32", fontWeight: "600", fontSize: "12px" }}>
                      ✓ {verifiedExplanation || "This address matches the available map data."}
                    </small>
                  )}
                </div>
              </div>
              {errors.address && <span className="error" style={{ color: "#b71c1c", fontSize: "12.5px", display: "block", marginTop: "4px" }}>{errors.address}</span>}
            </div>

            <div className="form-group">
              <label>Order notes (optional)</label>
              <input
                type="text"
                name="notes"
                value={formData.notes}
                onChange={handleChange}
                placeholder="e.g. Please deliver during business hours or use gift packaging..."
              />
            </div>

            <h2
              style={{
                fontFamily: "'Cormorant Garamond', serif",
                fontSize: "24px",
                color: "#2B211C",
                marginTop: "30px",
                marginBottom: "20px",
                borderBottom: "1px solid #E8E1D6",
                paddingBottom: "10px",
              }}
            >
              2. PAYMENT METHOD
            </h2>

            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  padding: "14px 18px",
                  border: formData.paymentMethod === "cod" ? "2px solid #2B211C" : "1px solid #D8CEC1",
                  borderRadius: "6px",
                  cursor: "pointer",
                  backgroundColor: formData.paymentMethod === "cod" ? "#FAF6F0" : "#FFF",
                }}
              >
                <input
                  type="radio"
                  name="paymentMethod"
                  value="cod"
                  checked={formData.paymentMethod === "cod"}
                  onChange={handleChange}
                />
                <div>
                  <strong style={{ display: "block", color: "#2B211C" }}>Cash on delivery (COD)</strong>
                  <span style={{ fontSize: "12.5px", color: "#6B5A4B" }}>Pay in cash upon delivery</span>
                </div>
              </label>

              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  padding: "14px 18px",
                  border: formData.paymentMethod === "bank_transfer" ? "2px solid #2B211C" : "1px solid #D8CEC1",
                  borderRadius: "6px",
                  cursor: "pointer",
                  backgroundColor: formData.paymentMethod === "bank_transfer" ? "#FAF6F0" : "#FFF",
                }}
              >
                <input
                  type="radio"
                  name="paymentMethod"
                  value="bank_transfer"
                  checked={formData.paymentMethod === "bank_transfer"}
                  onChange={handleChange}
                />
                <div>
                  <strong style={{ display: "block", color: "#2B211C" }}>Direct bank transfer</strong>
                  <span style={{ fontSize: "12.5px", color: "#6B5A4B" }}>Vietcombank - Maison Rue Luxury - 0071000888999</span>
                </div>
              </label>
            </div>
          </div>

          {/* Order Summary Sidebar */}
          <div>
            <div
              style={{
                backgroundColor: "#FFFFFF",
                border: "1px solid #D8CEC1",
                borderRadius: "8px",
                padding: "30px",
                position: "sticky",
                top: "30px",
              }}
            >
              <h2
                style={{
                  fontFamily: "'Cormorant Garamond', serif",
                  fontSize: "24px",
                  color: "#2B211C",
                  marginBottom: "20px",
                  borderBottom: "1px solid #E8E1D6",
                  paddingBottom: "10px",
                }}
              >
                Your Order ({checkoutItems.length} items)
              </h2>

              <div style={{ maxHeight: "280px", overflowY: "auto", marginBottom: "20px" }}>
                {checkoutItems.map((item) => {
                  const pricedItem = pricedItemsByCartId.get(item.cartItemId);
                  const discounted = Number(pricedItem?.automaticDiscount || 0) + Number(pricedItem?.orderDiscountAllocated || 0) > 0;
                  return <div
                    key={item.cartItemId}
                    className="checkout-order-item"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "14px",
                      padding: "10px 0",
                      borderBottom: "1px solid #F0EAE1",
                    }}
                  >
                    <img
                      src={`/${item.selectedColor && item.colorImages ? item.colorImages[item.selectedColor][0] : item.images[0]}`}
                      alt={item.name}
                      style={{ width: "50px", height: "50px", objectFit: "cover", borderRadius: "4px" }}
                    />
                    <div style={{ flex: 1, fontSize: "13px" }}>
                      <div style={{ fontWeight: "600", color: "#2B211C" }}>{item.name}</div>
                      <div style={{ color: "#8A7350" }}>
                        {item.selectedColor || "Standard"} / {item.selectedSize || "One size"} × {item.quantity}
                      </div>
                    </div>
                    <div className={`checkout-order-item__price${discounted ? " has-discount" : ""}`}>
                      {discounted && <del>{formatPrice(pricedItem.originalLineTotal)}</del>}
                      <strong>{formatPrice(pricedItem?.finalLineTotal ?? item.price * item.quantity)}</strong>
                    </div>
                  </div>;
                })}
              </div>

              <div className="summary-row">
                <span>Subtotal:</span>
                <span>{formatPrice(pricing?.originalSubtotal ?? selectedCartTotal)}</span>
              </div>
              {Number(pricing?.productDiscountTotal || 0) > 0 && <div className="summary-row promotion-saving"><span>Product discounts:</span><span>−{formatPrice(pricing.productDiscountTotal)}</span></div>}
              {Number(pricing?.codeDiscountTotal || 0) > 0 && <div className="summary-row promotion-saving"><span>Code {pricing.code}:</span><span>−{formatPrice(pricing.codeDiscountTotal)}</span></div>}
              <div className="summary-row">
                <span>Shipping:</span>
                <span style={{ color: "#2E8B57", fontWeight: "600" }}>COMPLIMENTARY</span>
              </div>
              <div className="checkout-promotion">
                <div className="checkout-promotion__heading"><div><span>Promo code</span><small>Choose an eligible offer or enter your code</small></div>{appliedCode && <button type="button" className="checkout-promotion__remove" onClick={() => { setAppliedCode(""); setCodeInput(""); }}>Remove</button>}</div>
                <button type="button" className={`checkout-promotion__trigger${appliedCode ? " is-applied" : ""}`} onClick={openPromotionPicker}>
                  <span>{appliedCode ? <><strong>{appliedCode}</strong><small>Applied</small></> : <><strong>Choose or enter a promo code</strong><small>View offers available for this order</small></>}</span>
                  <span aria-hidden="true">›</span>
                </button>
                {promotionMessage && <p className={pricing?.code ? "success" : "error"}>{promotionMessage}</p>}
              </div>
              <div className="summary-row total" style={{ fontSize: "20px" }}>
                <span>Total:</span>
                <span>{formatPrice(pricing?.finalTotal ?? selectedCartTotal)}</span>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="btn-primary btn-large"
                style={{ marginTop: "20px" }}
              >
                {submitting ? "Processing order..." : "PLACE ORDER"}
              </button>

              <p
                style={{
                  fontSize: "12px",
                  color: "#8A7350",
                  textAlign: "center",
                  marginTop: "15px",
                  lineHeight: "1.5",
                }}
              >
                By placing your order, you agree to Maison Rue's sales and privacy policies.
              </p>
            </div>
          </div>
        </div>
      </form>
      {promoModalOpen && (
        <div className="promo-picker-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPromoModalOpen(false); }}>
          <section className="promo-picker" role="dialog" aria-modal="true" aria-labelledby="promo-picker-title">
            <button type="button" className="promo-picker__close" aria-label="Close" onClick={() => setPromoModalOpen(false)}>×</button>
            <div className="promo-picker__header"><p className="eyebrow">OFFERS FOR YOUR ORDER</p><h2 id="promo-picker-title">Choose a promo code</h2><p>Only codes confirmed as eligible for your current bag are shown below.</p></div>
            <div className="promo-picker__manual">
              <label htmlFor="checkout-promo-code">Enter a promo code</label>
              <div><input id="checkout-promo-code" value={codeInput} onChange={(event) => setCodeInput(event.target.value.toUpperCase())} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); applyPromotionCode(); } }} placeholder="E.G. RUEVIP15" autoFocus /><button type="button" onClick={applyPromotionCode} disabled={!codeInput.trim() || previewing}>Apply</button></div>
            </div>
            <div className="promo-picker__available">
              <div className="promo-picker__section-title"><strong>Available promo codes</strong>{!offersLoading && <span>{availableOffers.length} {availableOffers.length === 1 ? "code" : "codes"}</span>}</div>
              {offersLoading ? <div className="promo-picker__state">Checking eligible offers…</div> : availableOffers.length ? availableOffers.map((offer) => (
                <article className="promo-picker__offer" key={offer.code_id}>
                  <div><span>{offer.distribution_type === "targeted" ? "Exclusively for you" : "Public offer"}</span><code>{offer.code}</code><p>{offer.display_description || offer.description}</p><small>Minimum order {formatPrice(offer.minimum_order_value || 0)}{offer.end_at ? ` · Expires ${new Date(offer.end_at).toLocaleDateString("en-GB")}` : ""}</small></div>
                  <div><strong>Save {formatPrice(offer.saving)}</strong><button type="button" onClick={() => { setCodeInput(offer.code); setAppliedCode(offer.code); setPromoModalOpen(false); }}>Apply</button></div>
                </article>
              )) : <div className="promo-picker__state"><strong>No saved promo code is currently eligible</strong><span>{offersError || "You can still enter another code above to check it."}</span></div>}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

