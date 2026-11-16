import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { paymentAPI, ordersAPI } from "../services/api";
import useDocumentTitle from "../hooks/useDocumentTitle";

function formatPrice(v) {
  return Number(v || 0).toLocaleString("vi-VN") + "đ";
}

export default function PaymentResult() {
  useDocumentTitle("Payment Result");
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState({
    success: false,
    orderId: "",
    transactionNo: "",
    amount: 0,
    message: "",
  });
  const [order, setOrder] = useState(null);

  useEffect(() => {
    let active = true;

    async function processResult() {
      // 1. Check if VNPay redirected directly to frontend with vnp_* parameters
      const hasVnpParams = searchParams.has("vnp_SecureHash") || searchParams.has("vnp_ResponseCode");

      if (hasVnpParams) {
        const paramsObj = {};
        for (const [key, value] of searchParams.entries()) {
          paramsObj[key] = value;
        }

        try {
          const res = await paymentAPI.verifyVNPayReturn(paramsObj);
          if (!active) return;

          if (res.success && res.status === "success") {
            setResult({
              success: true,
              orderId: res.orderId,
              transactionNo: res.transactionNo,
              amount: res.amount,
              bankCode: res.bankCode,
              message: "Thanh toán thành công qua cổng VNPay.",
            });
            if (res.order) setOrder(res.order);
          } else {
            setResult({
              success: false,
              orderId: res.orderId,
              message: res.message || "Giao dịch không thành công hoặc đã bị hủy.",
            });
          }
        } catch (err) {
          if (!active) return;
          setResult({
            success: false,
            orderId: searchParams.get("vnp_TxnRef") || "",
            message: err.message || "Lỗi khi đối soát kết quả thanh toán với VNPay.",
          });
        } finally {
          if (active) setLoading(false);
        }
        return;
      }

      // 2. Or redirected from backend with status query params
      const status = searchParams.get("status");
      const orderId = searchParams.get("orderId") || "";
      const transactionNo = searchParams.get("transactionNo") || "";

      if (status === "success") {
        setResult({
          success: true,
          orderId,
          transactionNo,
          message: "Thanh toán thành công qua cổng VNPay.",
        });

        if (orderId) {
          try {
            const ordRes = await ordersAPI.getById(orderId);
            if (active && ordRes.success) setOrder(ordRes.order);
          } catch {
            // Optional order detail lookup
          }
        }
      } else {
        const code = searchParams.get("code");
        setResult({
          success: false,
          orderId,
          message: code === "24"
            ? "Giao dịch đã bị hủy bởi người dùng."
            : "Thanh toán chưa thành công hoặc xảy ra lỗi trong quá trình xử lý.",
        });
      }

      if (active) setLoading(false);
    }

    processResult();

    return () => {
      active = false;
    };
  }, [searchParams]);

  if (loading) {
    return (
      <main style={{ maxWidth: "700px", margin: "80px auto", padding: "0 20px", textAlign: "center" }}>
        <div
          style={{
            backgroundColor: "#FFFFFF",
            border: "1px solid #D8CEC1",
            borderRadius: "8px",
            padding: "50px 40px",
            boxShadow: "0 10px 30px rgba(43, 33, 28, 0.08)",
          }}
        >
          <div style={{ fontSize: "28px", color: "#B89B5E", marginBottom: "16px" }}>⏳</div>
          <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "28px", color: "#2B211C", marginBottom: "12px" }}>
            Đang xác thực giao dịch VNPay...
          </h2>
          <p style={{ color: "#6B5A4B", fontSize: "14px" }}>
            Vui lòng không đóng trình duyệt trong khi hệ thống kiểm tra chữ ký số và cập nhật đơn hàng.
          </p>
        </div>
      </main>
    );
  }

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
        {result.success ? (
          <>
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
              PAYMENT SUCCESSFUL
            </h1>

            <p style={{ color: "#6B5A4B", fontSize: "15px", marginBottom: "25px" }}>
              Cảm ơn bạn đã lựa chọn Maison Rue. Giao dịch thanh toán trực tuyến qua VNPay đã hoàn tất thành công.
            </p>

            {result.orderId && (
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
                {result.orderId}
              </div>
            )}

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
              {result.transactionNo && (
                <div style={{ marginBottom: "8px" }}>
                  <strong>Mã giao dịch VNPay:</strong> {result.transactionNo}
                </div>
              )}
              {result.bankCode && (
                <div style={{ marginBottom: "8px" }}>
                  <strong>Ngân hàng / Phương thức:</strong> {result.bankCode}
                </div>
              )}
              <div style={{ marginBottom: "8px" }}>
                <strong>Phương thức thanh toán:</strong> VNPay Online Payment (QR Code / ATM / Visa)
              </div>
              <div style={{ marginBottom: "8px" }}>
                <strong>Trạng thái thanh toán:</strong>{" "}
                <span style={{ color: "#2E8B57", fontWeight: "700" }}>Đã thanh toán (Paid)</span>
              </div>
              {order && (
                <>
                  <div style={{ marginBottom: "8px" }}>
                    <strong>Người nhận:</strong> {order.customer_name || order.customerName} ({order.customer_phone || order.customerPhone})
                  </div>
                  <div style={{ marginBottom: "8px" }}>
                    <strong>Địa chỉ giao nhận:</strong> {order.shipping_address || order.shippingAddress}
                  </div>
                  <div>
                    <strong>Tổng tiền thanh toán:</strong>{" "}
                    <span style={{ color: "#B89B5E", fontWeight: "700", fontSize: "15px" }}>
                      {formatPrice(order.total_amount || order.totalAmount || result.amount || 0)}
                    </span>
                  </div>
                </>
              )}
            </div>

            <div style={{ display: "flex", gap: "15px", justifyContent: "center" }}>
              <Link to="/account/orders" className="btn-primary" style={{ textDecoration: "none", padding: "14px 28px" }}>
                Xem lịch sử đơn hàng
              </Link>
              <Link to="/" className="btn-secondary" style={{ textDecoration: "none", padding: "14px 28px", margin: 0, width: "auto" }}>
                Tiếp tục mua sắm
              </Link>
            </div>
          </>
        ) : (
          <>
            <div
              style={{
                width: "70px",
                height: "70px",
                borderRadius: "50%",
                backgroundColor: "#FFF0F0",
                color: "#D9534F",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "32px",
                margin: "0 auto 20px",
                border: "1px solid #F5C6CB",
              }}
            >
              ✕
            </div>

            <h1
              style={{
                fontFamily: "'Cormorant Garamond', serif",
                fontSize: "36px",
                color: "#2B211C",
                marginBottom: "10px",
              }}
            >
              PAYMENT FAILED
            </h1>

            <p style={{ color: "#6B5A4B", fontSize: "15px", marginBottom: "25px" }}>
              {result.message || "Giao dịch thanh toán chưa thể hoàn tất."}
            </p>

            {result.orderId && (
              <p style={{ fontSize: "14px", color: "#6B5A4B", marginBottom: "30px" }}>
                Mã đơn hàng liên quan: <strong>{result.orderId}</strong>
              </p>
            )}

            <div style={{ display: "flex", gap: "15px", justifyContent: "center" }}>
              <Link to="/checkout" className="btn-primary" style={{ textDecoration: "none", padding: "14px 28px" }}>
                Thử thanh toán lại
              </Link>
              <Link to="/contact" className="btn-secondary" style={{ textDecoration: "none", padding: "14px 28px", margin: 0, width: "auto" }}>
                Liên hệ hỗ trợ
              </Link>
            </div>
          </>
        )}
      </div>
    </main>
  );
}

