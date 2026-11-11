import { useEffect, useState } from "react";
import { useStore, STATUS_LABELS } from "../../context/StoreContext";
import useDocumentTitle from "../../hooks/useDocumentTitle";
import OrderItemLine from "../../components/OrderItemLine";
import OrderFinancialBreakdown from "../../components/OrderFinancialBreakdown";
import AdminPagination from "../../components/AdminPagination";

const PAGE_SIZE = 10;

export const PAYMENT_STATUS_META = {
  paid: { label: "Đã thu tiền (Paid)", color: "#2E8B57", bg: "#EAF7EE" },
  pending_verification: { label: "Chờ xác minh", color: "#B8860B", bg: "#FFF8DC" },
  unpaid: { label: "Chưa thanh toán", color: "#6B5A4B", bg: "#F5F0EA" },
  refund_pending: { label: "Chờ hoàn tiền", color: "#E67E22", bg: "#FDF2E9" },
  refunded: { label: "Đã hoàn tiền", color: "#7B1FA2", bg: "#F3E5F5" },
  cancelled: { label: "Đã hủy GD", color: "#9E9E9E", bg: "#EEEEEE" },
};

function formatPrice(v) {
  return (v || 0).toLocaleString("vi-VN") + "đ";
}

function formatDate(isoStr) {
  if (!isoStr) return "";
  const d = new Date(isoStr);
  return d.toLocaleString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export default function AdminOrders() {
  useDocumentTitle("Admin — Giám Sát Đơn Hàng");
  const { orders, confirmOrderPayment, processOrderRefund } = useStore();
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedOrder, setSelectedOrder] = useState(null);

  // Payment confirmation & refund modal states
  const [paymentModalOrder, setPaymentModalOrder] = useState(null);
  const [paymentModalType, setPaymentModalType] = useState("confirm"); // "confirm" | "refund"
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentModalNote, setPaymentModalNote] = useState("");
  const [loadingPayment, setLoadingPayment] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (!selectedOrder && !paymentModalOrder) return undefined;
    const closeOnEscape = (event) => {
      if (event.key !== "Escape") return;
      if (paymentModalOrder && !loadingPayment) setPaymentModalOrder(null);
      else if (selectedOrder) setSelectedOrder(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [selectedOrder, paymentModalOrder, loadingPayment]);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(""), 4500);
  };

  const handleOpenPaymentConfirm = (order) => {
    setPaymentModalOrder(order);
    setPaymentModalType("confirm");
    setPaymentReference(order.payment?.payment_method === "cod" ? "TIEN-MAT-COD" : "");
    setPaymentModalNote(order.payment?.payment_method === "cod" ? "Admin xác nhận đã thu đủ tiền mặt COD" : "Admin đối soát và duyệt thanh toán");
  };

  const handleOpenRefund = (order) => {
    setPaymentModalOrder(order);
    setPaymentModalType("refund");
    setPaymentReference(`REF-${Date.now().toString().slice(-6)}`);
    setPaymentModalNote("Admin phê duyệt hoàn tiền đơn hàng bị hủy");
  };

  const handleSavePaymentAction = async () => {
    if (!paymentModalOrder) return;
    setLoadingPayment(true);

    if (paymentModalType === "confirm") {
      const res = await confirmOrderPayment(paymentModalOrder.id, {
        transactionReference: paymentReference.trim(),
        note: paymentModalNote.trim(),
      });
      setLoadingPayment(false);
      if (res.success) {
        showToast(`Đã xác nhận thu tiền thành công cho đơn #${paymentModalOrder.id}.`);
        setPaymentModalOrder(null);
        if (selectedOrder?.id === paymentModalOrder.id) {
          setSelectedOrder(res.order);
        }
      } else {
        alert(res.error || "Không thể xác nhận thanh toán.");
      }
    } else {
      const res = await processOrderRefund(paymentModalOrder.id, {
        refundReference: paymentReference.trim(),
        note: paymentModalNote.trim(),
      });
      setLoadingPayment(false);
      if (res.success) {
        showToast(`Đã hoàn tất thủ tục hoàn tiền cho đơn #${paymentModalOrder.id}.`);
        setPaymentModalOrder(null);
        if (selectedOrder?.id === paymentModalOrder.id) {
          setSelectedOrder(res.order);
        }
      } else {
        alert(res.error || "Không thể xử lý hoàn tiền.");
      }
    }
  };

  const filteredOrders = orders.filter((o) => {
    const st = o.order_status || o.status;
    const matchesStatus = statusFilter === "all" || st === statusFilter;
    const term = searchTerm.trim().toLowerCase();
    const matchesSearch =
      !term ||
      o.id.toLowerCase().includes(term) ||
      (o.customer_name || o.customerName || "").toLowerCase().includes(term) ||
      (o.customer_email || o.customerEmail || "").toLowerCase().includes(term);
    return matchesStatus && matchesSearch;
  });
  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / PAGE_SIZE));
  const pagedOrders = filteredOrders.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => setPage(1), [statusFilter, searchTerm]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  return (
    <div>
      <div style={{ marginBottom: "25px" }}>
        <h1
          style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontSize: "32px",
            color: "#2B211C",
            margin: "0 0 6px",
          }}
        >
          GIÁM SÁT TOÀN DIỆN ĐƠN HÀNG HỆ THỐNG
        </h1>
        <p style={{ color: "#6B5A4B", fontSize: "14px", margin: 0 }}>
          Theo dõi tiến trình xử lý đơn hàng, thông tin thanh toán đã đối soát và nhật ký kiểm toán.
        </p>
      </div>

      {/* Filter and Search Bar */}
      <div
        style={{
          backgroundColor: "#FFFFFF",
          border: "1px solid #D8CEC1",
          borderRadius: "8px",
          padding: "18px 24px",
          marginBottom: "25px",
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "space-between",
          gap: "15px",
          alignItems: "center",
        }}
      >
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {[
            { id: "all", label: "Tất cả" },
            { id: "delivered", label: "Đã giao (Thu tiền)" },
            { id: "shipping", label: "Đang giao" },
            { id: "processing", label: "Đang chuẩn bị" },
            { id: "confirmed", label: "Đã xác nhận" },
            { id: "pending", label: "Chờ xác nhận" },
            { id: "cancelled", label: "Đã hủy" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id)}
              style={{
                padding: "8px 14px",
                borderRadius: "20px",
                border: "1px solid",
                borderColor: statusFilter === tab.id ? "#8A5A36" : "#E8E1D6",
                backgroundColor: statusFilter === tab.id ? "#8A5A36" : "#FAF6F0",
                color: statusFilter === tab.id ? "#FFF" : "#2B211C",
                fontSize: "12.5px",
                fontWeight: "600",
                cursor: "pointer",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div style={{ width: "280px" }}>
          <input
            type="text"
            placeholder="Tìm mã đơn, tên khách..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: "100%",
              padding: "9px 14px",
              borderRadius: "4px",
              border: "1px solid #D8CEC1",
              fontSize: "13px",
              outline: "none",
            }}
          />
        </div>
      </div>

      {/* Orders Table */}
      <div
        style={{
          backgroundColor: "#FFFFFF",
          border: "1px solid #D8CEC1",
          borderRadius: "8px",
          overflow: "hidden",
          boxShadow: "0 2px 10px rgba(0,0,0,0.03)",
        }}
      >
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "13.5px" }}>
            <thead>
              <tr style={{ backgroundColor: "#FAF6F0", borderBottom: "1px solid #D8CEC1", color: "#4E342E" }}>
                <th style={{ padding: "14px 18px", fontWeight: "600" }}>Mã Đơn Hàng</th>
                <th style={{ padding: "14px 18px", fontWeight: "600" }}>Khách Hàng</th>
                <th style={{ padding: "14px 18px", fontWeight: "600" }}>Tổng Giá Trị</th>
                <th style={{ padding: "14px 18px", fontWeight: "600" }}>Thanh Toán Đối Soát</th>
                <th style={{ padding: "14px 18px", fontWeight: "600" }}>Trạng Thái Đơn</th>
                <th style={{ padding: "14px 18px", fontWeight: "600", textAlign: "right" }}>Kiểm Toán</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan="6" style={{ padding: "35px", textAlign: "center", color: "#6B5A4B" }}>
                    Không tìm thấy đơn hàng nào.
                  </td>
                </tr>
              ) : (
                pagedOrders.map((order, idx) => {
                  const st = order.order_status || order.status;
                  const meta = STATUS_LABELS[st] || { label: st, color: "#333", bg: "#eee" };
                  const payment = order.payment;
                  const isPaid = payment?.payment_status === "paid";

                  return (
                    <tr
                      key={order.id}
                      style={{
                        borderBottom: "1px solid #F0EAE1",
                        backgroundColor: idx % 2 === 0 ? "#FFFFFF" : "#FCFBF9",
                      }}
                    >
                      <td style={{ padding: "14px 18px" }}>
                        <strong style={{ color: "#2B211C" }}>#{order.id}</strong>
                        <div style={{ fontSize: "11.5px", color: "#8A7350" }}>
                          {formatDate(order.created_at || order.createdAt)}
                        </div>
                      </td>

                      <td style={{ padding: "14px 18px" }}>
                        <div style={{ fontWeight: "600", color: "#2B211C" }}>
                          {order.customer_name || order.customerName}
                        </div>
                        <div style={{ fontSize: "12px", color: "#6B5A4B" }}>
                          {order.customer_phone || order.customerPhone}
                        </div>
                      </td>

                      <td style={{ padding: "14px 18px", fontWeight: "700", color: "#B89B5E" }}>
                        {formatPrice(order.total_amount || order.totalAmount)}
                      </td>

                      <td style={{ padding: "14px 18px" }}>
                        {isPaid ? (
                          <span
                            style={{
                              display: "inline-block",
                              padding: "3px 10px",
                              borderRadius: "12px",
                              backgroundColor: "#F0FFF0",
                              color: "#2E8B57",
                              fontSize: "11.5px",
                              fontWeight: "700",
                              border: "1px solid #C3E6CB",
                            }}
                          >
                            ✓ ĐÃ THU TIỀN (PAID)
                          </span>
                        ) : payment?.payment_status === "refund_pending" ? (
                          <span
                            style={{
                              display: "inline-block",
                              padding: "3px 10px",
                              borderRadius: "12px",
                              backgroundColor: "#FDF2E9",
                              color: "#E67E22",
                              fontSize: "11.5px",
                              fontWeight: "700",
                              border: "1px solid #F5CBA7",
                            }}
                          >
                            ⚠️ CHỜ HOÀN TIỀN
                          </span>
                        ) : payment?.payment_status === "refunded" ? (
                          <span
                            style={{
                              display: "inline-block",
                              padding: "3px 10px",
                              borderRadius: "12px",
                              backgroundColor: "#FFF0F0",
                              color: "#D9534F",
                              fontSize: "11.5px",
                              fontWeight: "700",
                            }}
                          >
                            ĐÃ HOÀN TIỀN
                          </span>
                        ) : payment?.payment_status === "cancelled" ? (
                          <span
                            style={{
                              display: "inline-block",
                              padding: "3px 10px",
                              borderRadius: "12px",
                              backgroundColor: "#EEEEEE",
                              color: "#757575",
                              fontSize: "11.5px",
                              fontWeight: "600",
                            }}
                          >
                            ĐÃ HỦY GD
                          </span>
                        ) : (
                          <span
                            style={{
                              display: "inline-block",
                              padding: "3px 10px",
                              borderRadius: "12px",
                              backgroundColor: "#FFF8DC",
                              color: "#B8860B",
                              fontSize: "11.5px",
                              fontWeight: "600",
                            }}
                          >
                            CHỜ THU ({payment?.payment_method === "cod" || order.paymentMethod === "cod" ? "COD" : "Chuyển khoản"})
                          </span>
                        )}
                      </td>

                      <td style={{ padding: "14px 18px" }}>
                        <span
                          style={{
                            display: "inline-block",
                            padding: "4px 12px",
                            borderRadius: "15px",
                            fontSize: "12px",
                            fontWeight: "600",
                            color: meta.color,
                            backgroundColor: meta.bg,
                            border: `1px solid ${meta.color}35`,
                          }}
                        >
                          ● {meta.label}
                        </span>
                      </td>

                      <td style={{ padding: "14px 18px", textAlign: "right" }}>
                        <button
                          onClick={() => setSelectedOrder(order)}
                          style={{
                            padding: "6px 14px",
                            backgroundColor: "#FAF6F0",
                            border: "1px solid #D8CEC1",
                            borderRadius: "4px",
                            fontSize: "12px",
                            fontWeight: "600",
                            cursor: "pointer",
                            color: "#2B211C",
                          }}
                        >
                          Xem Sổ Nhật Ký
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <AdminPagination page={page} total={filteredOrders.length} pageSize={PAGE_SIZE} onPageChange={setPage} itemLabel="đơn hàng" />
      </div>

      {toastMessage && (
        <div
          style={{
            backgroundColor: "#EAF7EE",
            border: "1px solid #2E8B57",
            color: "#2E8B57",
            padding: "12px 18px",
            borderRadius: "6px",
            marginBottom: "20px",
            fontSize: "13.5px",
            fontWeight: "600",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>✓ {toastMessage}</span>
          <button
            onClick={() => setToastMessage("")}
            style={{ background: "none", border: "none", color: "#2E8B57", cursor: "pointer", fontSize: "16px" }}
          >
            ×
          </button>
        </div>
      )}

      {/* Audit Detail Modal */}
      {selectedOrder && (
        <div
          onClick={(event) => {
            if (event.target === event.currentTarget) setSelectedOrder(null);
          }}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            backgroundColor: "rgba(43, 33, 28, 0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 3000,
            padding: "20px",
          }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              backgroundColor: "#FFF",
              padding: "35px",
              borderRadius: "8px",
              maxWidth: "700px",
              width: "100%",
              maxHeight: "90vh",
              overflowY: "auto",
              boxShadow: "0 10px 40px rgba(0,0,0,0.2)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px" }}>
              <div>
                <span style={{ fontSize: "11px", letterSpacing: "1px", textTransform: "uppercase", color: "#8A5A36", fontWeight: "700" }}>
                  Hồ sơ giám sát đơn hàng Quản Trị
                </span>
                <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "28px", color: "#2B211C", margin: "4px 0" }}>
                  #{selectedOrder.id}
                </h2>
              </div>
              <button
                onClick={() => setSelectedOrder(null)}
                style={{ background: "none", border: "none", fontSize: "28px", color: "#6B5A4B", cursor: "pointer" }}
              >
                ×
              </button>
            </div>

            <div style={{ backgroundColor: "#FAF6F0", padding: "15px", borderRadius: "6px", marginBottom: "20px", fontSize: "13px" }}>
              <div><strong>Khách hàng:</strong> {selectedOrder.customer_name || selectedOrder.customerName} ({selectedOrder.customer_phone || selectedOrder.customerPhone})</div>
              <div><strong>Email:</strong> {selectedOrder.customer_email || selectedOrder.customerEmail}</div>
              <div><strong>Địa chỉ:</strong> {selectedOrder.shipping_address || selectedOrder.shippingAddress}</div>
              {selectedOrder.notes && <div><strong>Ghi chú giao hàng:</strong> {selectedOrder.notes}</div>}
              <div><strong>Tổng tiền:</strong> {formatPrice(selectedOrder.total_amount || selectedOrder.totalAmount)}</div>
              {Number(selectedOrder.product_discount_total || 0) + Number(selectedOrder.code_discount_total || 0) > 0 && <div className="order-promotion-breakdown"><div><strong>Giá trị hàng ban đầu:</strong> {formatPrice(selectedOrder.original_subtotal)}</div><div><strong>Giảm trực tiếp:</strong> −{formatPrice(selectedOrder.product_discount_total)}</div><div><strong>Mã {selectedOrder.promotion_code || "—"}:</strong> −{formatPrice(selectedOrder.code_discount_total)}</div></div>}
            </div>

            {/* Payment Audit Box */}
            <div style={{ backgroundColor: "#FCFBF9", border: "1px solid #E8E1D6", borderRadius: "6px", padding: "16px", marginBottom: "20px", fontSize: "13px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                <h4 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "18px", margin: 0, color: "#2B211C" }}>
                  Kiểm Toán Thanh Toán (Payment Audit)
                </h4>
                <span style={{
                  padding: "3px 10px",
                  borderRadius: "12px",
                  fontSize: "12px",
                  fontWeight: "700",
                  color: PAYMENT_STATUS_META[selectedOrder.payment?.payment_status || "unpaid"]?.color,
                  backgroundColor: PAYMENT_STATUS_META[selectedOrder.payment?.payment_status || "unpaid"]?.bg,
                }}>
                  ● {PAYMENT_STATUS_META[selectedOrder.payment?.payment_status || "unpaid"]?.label}
                </span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                <div><strong>Phương thức:</strong> {selectedOrder.payment?.payment_method === "cod" ? "Thanh toán khi nhận hàng (COD)" : "Chuyển khoản ngân hàng"}</div>
                <div><strong>Doanh thu tính vào sổ sách:</strong> <span style={{ color: selectedOrder.payment?.payment_status === "paid" ? "#2E8B57" : "#8A5A36", fontWeight: "700" }}>{selectedOrder.payment?.payment_status === "paid" ? formatPrice(selectedOrder.total_amount) : "0đ (Chưa thực thu)"}</span></div>
                {selectedOrder.payment?.verified_at && (
                  <>
                    <div><strong>Xác thực bởi:</strong> {selectedOrder.payment.verified_by || "Hệ thống"}</div>
                    <div><strong>Ngày xác thực:</strong> {formatDate(selectedOrder.payment.verified_at)}</div>
                    <div><strong>Mã đối soát GD:</strong> {selectedOrder.payment.transaction_reference || "N/A"}</div>
                  </>
                )}
                {selectedOrder.payment?.refunded_at && (
                  <>
                    <div><strong>Hoàn tiền bởi:</strong> {selectedOrder.payment.refunded_by || "Hệ thống"}</div>
                    <div><strong>Ngày hoàn tất:</strong> {formatDate(selectedOrder.payment.refunded_at)}</div>
                    <div><strong>Mã hoàn tiền:</strong> {selectedOrder.payment.refund_reference || "N/A"}</div>
                    <div><strong>Ghi chú hoàn:</strong> {selectedOrder.payment.refund_note || "N/A"}</div>
                  </>
                )}
              </div>
              <div style={{ marginTop: "12px", display: "flex", gap: "8px" }}>
                {((selectedOrder.payment?.payment_status === "unpaid" || selectedOrder.payment?.payment_status === "pending_verification") && selectedOrder.order_status !== "cancelled") && (
                  <button
                    onClick={() => {
                      const ord = selectedOrder;
                      setSelectedOrder(null);
                      handleOpenPaymentConfirm(ord);
                    }}
                    style={{
                      padding: "6px 14px",
                      backgroundColor: "#2E8B57",
                      color: "#FFF",
                      border: "none",
                      borderRadius: "4px",
                      fontSize: "12px",
                      fontWeight: "600",
                      cursor: "pointer",
                    }}
                  >
                    Duyệt Thu Tiền Đơn Hàng
                  </button>
                )}
                {(selectedOrder.payment?.payment_status === "refund_pending" || (selectedOrder.order_status === "cancelled" && selectedOrder.payment?.payment_status === "paid")) && (
                  <button
                    onClick={() => {
                      const ord = selectedOrder;
                      setSelectedOrder(null);
                      handleOpenRefund(ord);
                    }}
                    style={{
                      padding: "6px 14px",
                      backgroundColor: "#E67E22",
                      color: "#FFF",
                      border: "none",
                      borderRadius: "4px",
                      fontSize: "12px",
                      fontWeight: "600",
                      cursor: "pointer",
                    }}
                  >
                    Duyệt Hoàn Tiền Cho Khách
                  </button>
                )}
              </div>
            </div>

            <h4 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "18px", marginBottom: "12px" }}>
              Sản phẩm trong đơn:
            </h4>
            <div style={{ marginBottom: "20px" }}>
              {(selectedOrder.items || []).map((it, idx) => <OrderItemLine key={it.id || `${it.product_id}-${idx}`} item={it} formatPrice={formatPrice} showCost />)}
              <OrderFinancialBreakdown order={selectedOrder} formatPrice={formatPrice} />
            </div>

            <h4 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "18px", marginBottom: "12px" }}>
              Nhật ký kiểm toán trạng thái:
            </h4>
            <div style={{ borderLeft: "2px solid #8A5A36", paddingLeft: "16px", marginLeft: "6px", marginBottom: "25px" }}>
              {(selectedOrder.history || []).map((h, i) => (
                <div key={i} style={{ marginBottom: "12px", fontSize: "13px" }}>
                  <strong>{STATUS_LABELS[h.new_status || h.status]?.label || h.new_status || h.status}</strong> —{" "}
                  <span style={{ color: "#8A7350", fontSize: "12px" }}>{formatDate(h.created_at || h.timestamp)} (bởi {h.updated_by || h.by})</span>
                  {h.note && <div style={{ color: "#5E5147", fontStyle: "italic", marginTop: "2px" }}>"{h.note}"</div>}
                </div>
              ))}
            </div>

            <div style={{ textAlign: "right" }}>
              <button onClick={() => setSelectedOrder(null)} className="btn-primary" style={{ padding: "8px 24px", fontSize: "13px" }}>
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payment Confirmation & Refund Action Modal */}
      {paymentModalOrder && (
        <div
          onClick={(event) => {
            if (event.target === event.currentTarget && !loadingPayment) setPaymentModalOrder(null);
          }}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            backgroundColor: "rgba(43, 33, 28, 0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 3000,
            padding: "20px",
          }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              backgroundColor: "#FFF",
              padding: "30px",
              borderRadius: "8px",
              maxWidth: "520px",
              width: "100%",
              boxShadow: "0 10px 40px rgba(0,0,0,0.2)",
            }}
          >
            <h3 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "24px", color: "#2B211C", marginTop: 0 }}>
              {paymentModalType === "confirm" ? "Xác Nhận Thu Tiền Đơn Hàng" : "Xử Lý Hoàn Tiền Đơn Hàng"} #{paymentModalOrder.id}
            </h3>

            <div style={{ backgroundColor: "#FAF6F0", padding: "14px 16px", borderRadius: "6px", marginBottom: "20px", fontSize: "13px" }}>
              <div><strong>Khách hàng:</strong> {paymentModalOrder.customer_name || paymentModalOrder.customerName}</div>
              <div><strong>Số tiền:</strong> <span style={{ color: "#B89B5E", fontWeight: "700" }}>{formatPrice(paymentModalOrder.total_amount || paymentModalOrder.totalAmount)}</span></div>
              <div><strong>Hình thức:</strong> {paymentModalOrder.payment?.payment_method === "cod" ? "Thu hộ COD (Tiền mặt)" : "Chuyển khoản"}</div>
              <div><strong>Trạng thái thanh toán hiện tại:</strong> {PAYMENT_STATUS_META[paymentModalOrder.payment?.payment_status || "unpaid"]?.label}</div>
            </div>

            <div className="form-group">
              <label style={{ fontSize: "13px", fontWeight: "600" }}>
                {paymentModalType === "confirm" ? "Mã giao dịch / Mã tham chiếu ngân hàng" : "Mã giao dịch hoàn tiền / Số UNC hoàn tiền *"}
              </label>
              <input
                type="text"
                value={paymentReference}
                onChange={(e) => setPaymentReference(e.target.value)}
                placeholder={paymentModalType === "confirm" ? "VD: TIEN-MAT-COD hoặc FT2603..." : "VD: REF-2026-001 hoặc UNC-9912..."}
                style={{
                  width: "100%",
                  padding: "10px",
                  borderRadius: "4px",
                  border: "1px solid #D8CEC1",
                  fontSize: "13px",
                  outline: "none",
                }}
              />
            </div>

            <div className="form-group" style={{ marginTop: "15px" }}>
              <label style={{ fontSize: "13px", fontWeight: "600" }}>
                {paymentModalType === "confirm" ? "Ghi chú thu tiền (Audit note)" : "Lý do / Ghi chú hoàn tiền *"}
              </label>
              <input
                type="text"
                value={paymentModalNote}
                onChange={(e) => setPaymentModalNote(e.target.value)}
                placeholder={paymentModalType === "confirm" ? "VD: Admin xác nhận đã kiểm tra số dư" : "VD: Phê duyệt hoàn tiền cho khách"}
                style={{
                  width: "100%",
                  padding: "10px",
                  borderRadius: "4px",
                  border: "1px solid #D8CEC1",
                  fontSize: "13px",
                  outline: "none",
                }}
              />
            </div>

            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "25px" }}>
              <button
                onClick={() => setPaymentModalOrder(null)}
                className="btn-secondary"
                disabled={loadingPayment}
                style={{ width: "auto", margin: 0, padding: "10px 18px", fontSize: "13px" }}
              >
                Đóng
              </button>
              <button
                onClick={handleSavePaymentAction}
                disabled={loadingPayment}
                style={{
                  padding: "10px 24px",
                  fontSize: "13px",
                  fontWeight: "600",
                  backgroundColor: paymentModalType === "confirm" ? "#2E8B57" : "#E67E22",
                  color: "#FFF",
                  border: "none",
                  borderRadius: "4px",
                  cursor: loadingPayment ? "not-allowed" : "pointer",
                }}
              >
                {loadingPayment ? "Đang xử lý..." : paymentModalType === "confirm" ? "Xác Nhận Đã Thu Tiền" : "Xác Nhận Hoàn Tiền"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

