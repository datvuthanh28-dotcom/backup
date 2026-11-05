import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useCart } from "../hooks/useCart";
import { useStore } from "../hooks/useStore";
import { useAuth } from "../context/AuthContext";
import useDocumentTitle from "../hooks/useDocumentTitle";
import { promotionAPI } from "../services/api";

function formatPrice(v) {
  return v.toLocaleString("vi-VN") + "đ";
}

export default function Checkout() {
  useDocumentTitle("Thanh Toán & Đặt Hàng");
  const { cart, cartTotal, removeFromCart } = useCart();
  const { createOrder } = useStore();
  const { currentUser } = useAuth();
  const [searchParams] = useSearchParams();
  const suggestedCode = searchParams.get("promo")?.trim().toUpperCase() || "";

  const [formData, setFormData] = useState({
    name: currentUser?.name || "",
    email: currentUser?.email || "",
    phone: currentUser?.phone || "",
    address: "128 Đồng Khởi, Phường Bến Nghé, Quận 1, TP. Hồ Chí Minh",
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

  const previewPricing = useCallback(async (code = "") => {
    if (!cart.length) return;
    setPreviewing(true); setPromotionMessage("");
    try { const result = await promotionAPI.preview(cart, code); setPricing(result.pricing); if (code) setPromotionMessage(`Đã áp dụng mã ${result.pricing.code}.`); }
    catch (error) { setPromotionMessage(error.message); if (code) { setAppliedCode(""); setPricing(null); } }
    finally { setPreviewing(false); }
  }, [cart]);

  useEffect(() => { previewPricing(appliedCode); }, [appliedCode, previewPricing]);

  if (cart.length === 0 && !orderSuccess) {
    return (
      <main id="cart-container" style={{ padding: "60px 20px", textAlign: "center" }}>
        <div className="empty-cart" style={{ maxWidth: "600px", margin: "0 auto" }}>
          <h2>Giỏ hàng chưa có sản phẩm</h2>
          <p>Vui lòng chọn sản phẩm vào giỏ hàng trước khi tiến hành thanh toán.</p>
          <Link to="/" className="btn-primary">Tiếp tục mua sắm</Link>
        </div>
      </main>
    );
  }

  const handleChange = (e) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!formData.name.trim()) errs.name = "Vui lòng nhập họ và tên người nhận.";
    if (!/^0\d{9,10}$/.test(formData.phone.trim())) errs.phone = "Vui lòng nhập số điện thoại Việt Nam hợp lệ.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) errs.email = "Vui lòng nhập email hợp lệ.";
    if (!formData.address.trim()) errs.address = "Vui lòng nhập địa chỉ nhận hàng chi tiết.";

    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSubmitting(true);

    const result = await createOrder({
      customerName: formData.name.trim(),
      customerEmail: formData.email.trim(),
      customerPhone: formData.phone.trim(),
      shippingAddress: formData.address.trim(),
      paymentMethod: formData.paymentMethod,
      items: cart,
      notes: formData.notes,
      promotionCode: appliedCode,
    });

    if (!result.success) {
      setErrors({ form: result.error });
      setSubmitting(false);
      return;
    }

    // Clear cart
    cart.forEach((item) => {
      removeFromCart(item.cartItemId);
    });

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
            ĐẶT HÀNG THÀNH CÔNG
          </h1>

          <p style={{ color: "#6B5A4B", fontSize: "15px", marginBottom: "25px" }}>
            Cảm ơn quý khách đã tin tưởng và lựa chọn Maison Rue. Mã đơn hàng của bạn là:
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
              <strong>Người nhận:</strong> {orderSuccess.customer_name || orderSuccess.customerName} ({orderSuccess.customer_phone || orderSuccess.customerPhone})
            </div>
            <div style={{ marginBottom: "8px" }}>
              <strong>Địa chỉ giao hàng:</strong> {orderSuccess.shipping_address || orderSuccess.shippingAddress}
            </div>
            <div style={{ marginBottom: "8px" }}>
              <strong>Phương thức thanh toán:</strong>{" "}
              {(orderSuccess.payment_method || orderSuccess.paymentMethod) === "cod" ? "Thanh toán khi nhận hàng (COD)" : "Chuyển khoản ngân hàng"}
            </div>
            <div>
              <strong>Tổng thanh toán:</strong>{" "}
              <span style={{ color: "#B89B5E", fontWeight: "700", fontSize: "15px" }}>
                {formatPrice(orderSuccess.total_amount || orderSuccess.totalAmount || 0)}
              </span>
            </div>
          </div>

          <div style={{ display: "flex", gap: "15px", justifyContent: "center" }}>
            <Link to="/account/orders" className="btn-primary" style={{ textDecoration: "none", padding: "14px 28px" }}>
              Xem Lịch Sử Đơn Hàng
            </Link>
            <Link to="/" className="btn-secondary" style={{ textDecoration: "none", padding: "14px 28px", margin: 0, width: "auto" }}>
              Tiếp Tục Mua Sắm
            </Link>
          </div>
        </div>
      </main>
    );
  }

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
        THANH TOÁN ĐƠN HÀNG
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
              1. Thông Tin Nhận Hàng
            </h2>

            <div className="form-group">
              <label>Họ và tên người nhận *</label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder="Nhập họ và tên đầy đủ"
              />
              {errors.name && <span className="error">{errors.name}</span>}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "15px" }}>
              <div className="form-group">
                <label>Số điện thoại *</label>
                <input
                  type="tel"
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                  placeholder="Ví dụ: 0901234567"
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
                  placeholder="Email nhận mã đơn"
                />
                {errors.email && <span className="error">{errors.email}</span>}
              </div>
            </div>

            <div className="form-group">
              <label>Địa chỉ giao hàng chi tiết *</label>
              <input
                type="text"
                name="address"
                value={formData.address}
                onChange={handleChange}
                placeholder="Số nhà, tên đường, phường/xã, quận/huyện, tỉnh/thành"
              />
              {errors.address && <span className="error">{errors.address}</span>}
            </div>

            <div className="form-group">
              <label>Ghi chú đơn hàng (Tùy chọn)</label>
              <input
                type="text"
                name="notes"
                value={formData.notes}
                onChange={handleChange}
                placeholder="Ví dụ: Giao giờ hành chính, đóng gói hộp quà..."
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
              2. Phương Thức Thanh Toán
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
                  <strong style={{ display: "block", color: "#2B211C" }}>Thanh toán khi nhận hàng (COD)</strong>
                  <span style={{ fontSize: "12.5px", color: "#6B5A4B" }}>Kiểm tra hàng trước khi thanh toán tiền mặt</span>
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
                  <strong style={{ display: "block", color: "#2B211C" }}>Chuyển khoản trực tiếp (Bank Transfer)</strong>
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
                Đơn Hàng ({cart.length} sản phẩm)
              </h2>

              <div style={{ maxHeight: "280px", overflowY: "auto", marginBottom: "20px" }}>
                {cart.map((item) => (
                  <div
                    key={item.cartItemId}
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
                        {item.selectedColor || "Tiêu chuẩn"} / {item.selectedSize || "One size"} × {item.quantity}
                      </div>
                    </div>
                    <div style={{ fontWeight: "600", color: "#B89B5E", fontSize: "13.5px" }}>
                      {formatPrice(item.price * item.quantity)}
                    </div>
                  </div>
                ))}
              </div>

              <div className="summary-row">
                <span>Tạm tính:</span>
                <span>{formatPrice(pricing?.originalSubtotal ?? cartTotal)}</span>
              </div>
              {Number(pricing?.productDiscountTotal || 0) > 0 && <div className="summary-row promotion-saving"><span>Khuyến mãi sản phẩm:</span><span>−{formatPrice(pricing.productDiscountTotal)}</span></div>}
              {Number(pricing?.codeDiscountTotal || 0) > 0 && <div className="summary-row promotion-saving"><span>Mã {pricing.code}:</span><span>−{formatPrice(pricing.codeDiscountTotal)}</span></div>}
              <div className="summary-row">
                <span>Phí vận chuyển:</span>
                <span style={{ color: "#2E8B57", fontWeight: "600" }}>MIỄN PHÍ</span>
              </div>
              <div className="checkout-promotion"><label>Mã giảm giá</label><div><input value={codeInput} onChange={(event) => setCodeInput(event.target.value.toUpperCase())} placeholder="Nhập mã ưu đãi" disabled={Boolean(appliedCode)} /><button type="button" onClick={() => appliedCode ? (setAppliedCode(""), setCodeInput("")) : setAppliedCode(codeInput.trim().toUpperCase())} disabled={previewing || (!appliedCode && !codeInput.trim())}>{appliedCode ? "Xóa mã" : previewing ? "Đang kiểm tra" : "Áp dụng"}</button></div>{promotionMessage && <p className={pricing?.code ? "success" : "error"}>{promotionMessage}</p>}</div>
              <div className="summary-row total" style={{ fontSize: "20px" }}>
                <span>Tổng cộng:</span>
                <span>{formatPrice(pricing?.finalTotal ?? cartTotal)}</span>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="btn-primary btn-large"
                style={{ marginTop: "20px" }}
              >
                {submitting ? "Đang xử lý đơn hàng..." : "HOÀN TẤT ĐẶT HÀNG"}
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
                Bằng việc bấm đặt hàng, quý khách đồng ý với chính sách bán hàng và bảo mật của Maison Rue.
              </p>
            </div>
          </div>
        </div>
      </form>
    </main>
  );
}

