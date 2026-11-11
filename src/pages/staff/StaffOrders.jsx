import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useStore, STATUS_LABELS, VALID_STATUS_TRANSITIONS } from "../../context/StoreContext";
import useDocumentTitle from "../../hooks/useDocumentTitle";
import OrderItemLine from "../../components/OrderItemLine";
import OrderFinancialBreakdown from "../../components/OrderFinancialBreakdown";

const ORDERS_PER_PAGE = 15;

export const PAYMENT_STATUS_META = {
  paid: { label: "Đã thanh toán", color: "#2E8B57", bg: "#EAF7EE" },
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

export default function StaffOrders() {
  useDocumentTitle("Staff Portal — Xử Lý Đơn Hàng");
  const { orders, updateOrderStatus, confirmOrderPayment } = useStore();
  const [searchParams, setSearchParams] = useSearchParams();

  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") || "all");
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [statusModalOrder, setStatusModalOrder] = useState(null);
  const [newStatus, setNewStatus] = useState("");
  const [statusNote, setStatusNote] = useState("");
  const [toastMessage, setToastMessage] = useState("");
  const [loadingAction, setLoadingAction] = useState(false);
  const toastTimerRef = useRef(null);

  // Payment confirmation & refund modal states
  const [paymentModalOrder, setPaymentModalOrder] = useState(null);
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentModalNote, setPaymentModalNote] = useState("");
  const [loadingPayment, setLoadingPayment] = useState(false);

  const showToast = (msg) => {
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    setToastMessage(msg);
    toastTimerRef.current = window.setTimeout(() => setToastMessage(""), 4500);
  };

  useEffect(() => () => {
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
  }, []);

  useEffect(() => {
    const status = searchParams.get("status") || "all";
    const orderId = searchParams.get("order");
    setStatusFilter(status);
    if (orderId && orders.length) {
      const order = orders.find((entry) => String(entry.id) === orderId);
      if (order) setSelectedOrder(order);
    }
  }, [orders, searchParams]);

  const selectStatusFilter = (status) => {
    setStatusFilter(status);
    const next = new URLSearchParams(searchParams);
    if (status === "all") next.delete("status"); else next.set("status", status);
    next.delete("order");
    setSearchParams(next, { replace: true });
  };

  const canConfirmPaymentFor = (order) => {
    if (!order.payment) return false;
    const status = order.order_status || order.status;
    const paymentStatus = order.payment.payment_status;
    const method = order.payment.payment_method;
    if (!["unpaid", "pending_verification"].includes(paymentStatus) || status === "cancelled") return false;
    return method === "cod" ? status === "delivered" : true;
  };

  const getNextAction = (order) => {
    const status = order.order_status || order.status;
    const paymentMethod = order.payment?.payment_method || order.paymentMethod || "cod";
    if (canConfirmPaymentFor(order) && (paymentMethod === "bank_transfer" || status === "delivered")) {
      return { type: "payment", label: paymentMethod === "cod" ? "Xác nhận đã thu COD" : "Xác minh chuyển khoản" };
    }
    const nextStatus = (VALID_STATUS_TRANSITIONS[status] || [])[0];
    const actionLabels = {
      confirmed: "Xác nhận đơn",
      processing: "Chuẩn bị hàng",
      shipping: "Bàn giao vận chuyển",
      delivered: "Xác nhận đã giao",
    };
    if (nextStatus) return { type: "status", label: actionLabels[nextStatus] || STATUS_LABELS[nextStatus]?.label || nextStatus };
    return null;
  };

  // Filter orders
  const filteredOrders = orders.filter((o) => {
    const currentStatus = o.order_status || o.status;
    const matchesStatus = statusFilter === "all" || currentStatus === statusFilter;
    const term = searchTerm.trim().toLowerCase();
    const custName = (o.customer_name || o.customerName || "").toLowerCase();
    const custEmail = (o.customer_email || o.customerEmail || "").toLowerCase();
    const custPhone = o.customer_phone || o.customerPhone || "";
    const matchesSearch =
      !term ||
      o.id.toLowerCase().includes(term) ||
      custName.includes(term) ||
      custEmail.includes(term) ||
      custPhone.includes(term);
    return matchesStatus && matchesSearch;
  });
  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / ORDERS_PER_PAGE));
  const paginatedOrders = filteredOrders.slice((page - 1) * ORDERS_PER_PAGE, page * ORDERS_PER_PAGE);

  useEffect(() => {
    setPage(1);
  }, [statusFilter, searchTerm]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const handleOpenStatusModal = (order) => {
    setStatusModalOrder(order);
    const currentStatus = order.order_status || order.status;
    const allowed = VALID_STATUS_TRANSITIONS[currentStatus] || [];
    setNewStatus(allowed[0] || "");
    setStatusNote("");
  };

  const handleSaveStatus = async () => {
    if (!statusModalOrder || !newStatus) return;
    if (newStatus === "cancelled" && statusNote.trim().length < 5) {
      alert("Vui lòng nhập lý do hủy đơn (tối thiểu 5 ký tự). Nội dung này sẽ được lưu vào lịch sử đơn hàng.");
      return;
    }

    setLoadingAction(true);
    const res = await updateOrderStatus(
      statusModalOrder.id,
      newStatus,
      statusNote.trim()
    );
    setLoadingAction(false);

    if (res.success) {
      showToast(
        `Đã cập nhật đơn #${statusModalOrder.id} sang trạng thái "${STATUS_LABELS[newStatus]?.label}".${
          newStatus === "cancelled" ? " (Toàn bộ tồn kho đã tự động hoàn trả)" : ""
        }`
      );
      setStatusModalOrder(null);
      if (selectedOrder?.id === statusModalOrder.id) {
        setSelectedOrder((prev) => ({ ...prev, order_status: newStatus, status: newStatus }));
      }
    } else {
      alert(res.error || "Không thể cập nhật trạng thái.");
    }
  };

  const handleOpenPaymentConfirm = (order) => {
    if (!order.payment) {
      alert("Đơn hàng chưa có hồ sơ thanh toán nên chưa thể xác nhận thu tiền.");
      return;
    }
    setPaymentModalOrder(order);
    setPaymentReference("");
    setPaymentModalNote("");
  };

  const handleSavePaymentAction = async () => {
    if (!paymentModalOrder) return;
    setLoadingPayment(true);

    const res = await confirmOrderPayment(paymentModalOrder.id, {
      transactionReference: paymentReference.trim(),
      note: paymentModalNote.trim(),
    });
    setLoadingPayment(false);
    if (res.success) {
      showToast(`Đã xác nhận thanh toán thành công cho đơn #${paymentModalOrder.id}.`);
      setPaymentModalOrder(null);
      if (selectedOrder?.id === paymentModalOrder.id) setSelectedOrder(res.order);
    } else {
      alert(res.error || "Không thể xác nhận thanh toán.");
    }
  };

  const paymentModalIsCod = paymentModalOrder?.payment?.payment_method === "cod";

  return (
    <div className="staff-orders-page">
      <div
        className="staff-orders-filters"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "25px",
          flexWrap: "wrap",
          gap: "15px",
        }}
      >
        <div>
          <h1
            style={{
              fontFamily: "'Cormorant Garamond', serif",
              fontSize: "30px",
              color: "#2B211C",
              margin: 0,
            }}
          >
            QUY TRÌNH XỬ LÝ ĐƠN HÀNG VẬN HÀNH
          </h1>
        </div>
      </div>

      {toastMessage && (
        <div
          style={{
            backgroundColor: "#F0FFF0",
            color: "#2E8B57",
            border: "1px solid #C3E6CB",
            padding: "12px 20px",
            borderRadius: "6px",
            marginBottom: "20px",
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

      {/* Filter and Search Bar */}
      <div
        className="staff-orders-toolbar"
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
            { id: "pending", label: "Chờ xác nhận" },
            { id: "confirmed", label: "Đã xác nhận" },
            { id: "processing", label: "Đang chuẩn bị" },
            { id: "shipping", label: "Đang giao" },
            { id: "delivered", label: "Đã giao" },
            { id: "cancelled", label: "Đã hủy" },
          ].map((tab) => {
            const count = tab.id === "all" ? orders.length : orders.filter((o) => (o.order_status || o.status) === tab.id).length;
            return (
              <button
                key={tab.id}
                onClick={() => selectStatusFilter(tab.id)}
                style={{
                  padding: "8px 14px",
                  borderRadius: "20px",
                  border: "1px solid",
                  borderColor: statusFilter === tab.id ? "#2B211C" : "#E8E1D6",
                  backgroundColor: statusFilter === tab.id ? "#2B211C" : "#FAF6F0",
                  color: statusFilter === tab.id ? "#F8F5F0" : "#2B211C",
                  fontSize: "12.5px",
                  fontWeight: "600",
                  cursor: "pointer",
                }}
              >
                {tab.label} <span style={{ opacity: 0.75, fontSize: "11px" }}>({count})</span>
              </button>
            );
          })}
        </div>

        <div style={{ width: "280px" }}>
          <input
            type="text"
            placeholder="Tìm theo mã đơn, tên, sđt..."
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
        <div className="staff-orders-table-scroll" style={{ overflowX: "auto" }}>
          <table className="staff-orders-table" style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "13.5px" }}>
            <colgroup>
              <col className="staff-order-col-id" />
              <col className="staff-order-col-customer" />
              <col className="staff-order-col-products" />
              <col className="staff-order-col-total" />
              <col className="staff-order-col-status" />
              <col className="staff-order-col-payment" />
              <col className="staff-order-col-actions" />
            </colgroup>
            <thead>
              <tr style={{ backgroundColor: "#FAF6F0", borderBottom: "1px solid #D8CEC1", color: "#4E342E" }}>
                <th style={{ padding: "14px 18px", fontWeight: "600" }}>Mã Đơn Hàng</th>
                <th style={{ padding: "14px 18px", fontWeight: "600" }}>Khách Hàng</th>
                <th style={{ padding: "14px 18px", fontWeight: "600" }}>Sản Phẩm</th>
                <th style={{ padding: "14px 18px", fontWeight: "600" }}>Tổng Tiền</th>
                <th style={{ padding: "14px 18px", fontWeight: "600" }}>Trạng Thái Đơn</th>
                <th style={{ padding: "14px 18px", fontWeight: "600", minWidth: "150px" }}>Thanh Toán</th>
                <th style={{ padding: "14px 18px", fontWeight: "600", textAlign: "right", minWidth: "160px" }}>Thao Tác</th>
              </tr>
            </thead>
            <tbody>
              {paginatedOrders.length === 0 ? (
                <tr>
                  <td colSpan="7" style={{ padding: "40px", textAlign: "center", color: "#6B5A4B" }}>
                    Không tìm thấy đơn hàng nào phù hợp với bộ lọc hiện tại.
                  </td>
                </tr>
              ) : (
                paginatedOrders.map((order, idx) => {
                  const currentStatus = order.order_status || order.status;
                  const meta = STATUS_LABELS[currentStatus] || {
                    label: currentStatus,
                    color: "#333",
                    bg: "#eee",
                  };
                  const items = order.items || [];
                  const custName = order.customer_name || order.customerName;
                  const custPhone = order.customer_phone || order.customerPhone;
                  const total = order.total_amount || order.totalAmount;
                  const dateStr = order.created_at || order.createdAt;

                  const pmt = order.payment;
                  const pmtStatus = pmt?.payment_status;
                  const pmtMethod = pmt?.payment_method?.toUpperCase();
                  const pmtMeta = !pmt ? { label: "Thiếu dữ liệu", color: "#A94442", bg: "#FFF0F0" } : PAYMENT_STATUS_META[pmtStatus] || {
                    label: pmtStatus,
                    color: "#666",
                    bg: "#f0f0f0",
                  };
                  const canRefund = pmtStatus === "refund_pending" || (currentStatus === "cancelled" && pmtStatus === "paid");
                  const nextAction = getNextAction(order);

                  return (
                    <tr
                      key={order.id}
                      style={{
                        borderBottom: "1px solid #F0EAE1",
                        backgroundColor: idx % 2 === 0 ? "#FFFFFF" : "#FCFBF9",
                      }}
                    >
                      <td data-label="Mã đơn" style={{ padding: "14px 18px" }}>
                        <strong className="staff-order-code" style={{ color: "#2B211C", letterSpacing: "0.5px" }}>#{order.id}</strong>
                        <div style={{ fontSize: "11.5px", color: "#8A7350" }}>{formatDate(dateStr)}</div>
                      </td>

                      <td data-label="Khách hàng" style={{ padding: "14px 18px" }}>
                        <div style={{ fontWeight: "600", color: "#2B211C" }}>{custName}</div>
                        <div style={{ fontSize: "12px", color: "#6B5A4B" }}>{custPhone}</div>
                      </td>

                      <td data-label="Sản phẩm" style={{ padding: "14px 18px" }}>
                        <span style={{ fontWeight: "600", color: "#2B211C" }}>
                          {items.reduce((s, i) => s + (i.quantity || 1), 0)} món
                        </span>
                        <div style={{ fontSize: "12px", color: "#6B5A4B", maxWidth: "180px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {items.map((i) => i.product_name || i.name).join(", ")}
                        </div>
                      </td>

                      <td data-label="Tổng tiền" style={{ padding: "14px 18px", fontWeight: "700", color: "#B89B5E" }}>
                        {formatPrice(total)}
                      </td>

                      <td data-label="Trạng thái" style={{ padding: "14px 18px" }}>
                        <span
                          className="staff-order-status-pill"
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
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

                      <td data-label="Thanh toán" style={{ padding: "14px 18px" }}>
                        <span
                          className="staff-order-payment-pill"
                          style={{
                            display: "inline-block",
                            padding: "3px 10px",
                            borderRadius: "12px",
                            fontSize: "11.5px",
                            fontWeight: "700",
                            color: pmtMeta.color,
                            backgroundColor: pmtMeta.bg,
                            border: `1px solid ${pmtMeta.color}35`,
                            whiteSpace: "nowrap",
                          }}
                        >
                          ● {pmtMeta.label}
                        </span>
                        <div style={{ fontSize: "11px", color: "#8A7350", marginTop: "3px" }}>
                          {!pmt ? "Chưa có hồ sơ thanh toán" : pmtMethod === "COD" ? "COD (Tiền mặt)" : "Chuyển khoản"}
                        </div>
                      </td>

                      <td data-label="Thao tác" style={{ padding: "14px 18px", textAlign: "right" }}>
                        <div className="staff-order-actions" style={{ display: "inline-flex", minWidth: "145px", flexDirection: "column", gap: "7px", alignItems: "stretch" }}>
                          <button
                            onClick={() => setSelectedOrder(order)}
                            style={{
                              minHeight: "32px",
                              padding: "6px 12px",
                              backgroundColor: "#FAF6F0",
                              border: "1px solid #D8CEC1",
                              borderRadius: "4px",
                              fontSize: "11.5px",
                              fontWeight: "600",
                              cursor: "pointer",
                              color: "#2B211C",
                            }}
                          >
                            Chi tiết
                          </button>

                          {canRefund && <span style={{ padding: "5px 9px", borderRadius: 4, background: "#FDF2E9", color: "#B85C18", fontSize: 11.5, fontWeight: 700 }} title="Admin phải phê duyệt và thực hiện hoàn tiền">Chờ Admin hoàn tiền</span>}

                          {nextAction ? (
                            <button
                              onClick={() => nextAction.type === "payment" ? handleOpenPaymentConfirm(order) : handleOpenStatusModal(order)}
                              style={{
                                minHeight: "32px",
                                padding: "6px 12px",
                                backgroundColor: "#2B211C",
                                color: "#F8F5F0",
                                border: "none",
                                borderRadius: "4px",
                                fontSize: "11.5px",
                                fontWeight: "600",
                                cursor: "pointer",
                              }}
                            >
                              {nextAction.label}
                            </button>
                          ) : (
                            <span style={{ fontSize: "11px", color: "#A09384", padding: "5px 4px" }}>
                              Hoàn tất
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {filteredOrders.length > 0 && (
          <div className="staff-orders-pagination" style={{ display: "flex", minHeight: "54px", boxSizing: "border-box", alignItems: "center", justifyContent: "space-between", gap: "16px", padding: "8px 18px", borderTop: "1px solid #EEE7DE", color: "#6B5A4B", fontSize: "12.5px" }}>
            <span>
              {((page - 1) * ORDERS_PER_PAGE) + 1}–{Math.min(page * ORDERS_PER_PAGE, filteredOrders.length)} trên {filteredOrders.length} đơn hàng
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <button
                type="button"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={page === 1}
                aria-label="Trang đơn hàng trước"
                style={{ width: "36px", height: "36px", border: "1px solid #D8CEC1", borderRadius: "6px", background: "#FFF", color: "#4E342E", cursor: page === 1 ? "not-allowed" : "pointer", opacity: page === 1 ? 0.38 : 1 }}
              >
                <i className="fas fa-chevron-left" aria-hidden="true" />
              </button>
              <span>Trang {page}/{totalPages}</span>
              <button
                type="button"
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                disabled={page === totalPages}
                aria-label="Trang đơn hàng sau"
                style={{ width: "36px", height: "36px", border: "1px solid #D8CEC1", borderRadius: "6px", background: "#FFF", color: "#4E342E", cursor: page === totalPages ? "not-allowed" : "pointer", opacity: page === totalPages ? 0.38 : 1 }}
              >
                <i className="fas fa-chevron-right" aria-hidden="true" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Status Transition Modal */}
      {statusModalOrder && (
        <div
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
              Cập Nhật Trạng Thái Đơn #{statusModalOrder.id}
            </h3>

            <div style={{ backgroundColor: "#FAF6F0", padding: "12px 16px", borderRadius: "6px", marginBottom: "20px", fontSize: "13px" }}>
              <div><strong>Khách hàng:</strong> {statusModalOrder.customer_name || statusModalOrder.customerName}</div>
              <div><strong>Trạng thái hiện tại:</strong> {STATUS_LABELS[statusModalOrder.order_status || statusModalOrder.status]?.label}</div>
            </div>

            <div className="form-group">
              <label style={{ fontSize: "13px", fontWeight: "600" }}>Chọn trạng thái tiếp theo hợp lệ *</label>
              <select
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px",
                  borderRadius: "4px",
                  border: "1px solid #D8CEC1",
                  fontSize: "14px",
                }}
              >
                {(VALID_STATUS_TRANSITIONS[statusModalOrder.order_status || statusModalOrder.status] || []).map((st) => (
                  <option key={st} value={st}>
                    {STATUS_LABELS[st]?.label} {st === "cancelled" ? " (Hủy & Hoàn trả kho)" : ""}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group" style={{ marginTop: "15px" }}>
              <label style={{ fontSize: "13px", fontWeight: "600" }}>
                {newStatus === "cancelled" ? "Lý do hủy đơn *" : "Ghi chú bổ sung (không bắt buộc)"}
              </label>
              <input
                type="text"
                value={statusNote}
                onChange={(e) => setStatusNote(e.target.value)}
                placeholder={newStatus === "cancelled" ? "Ví dụ: Khách yêu cầu hủy; không thể liên hệ người nhận..." : "Chỉ nhập khi có thông tin cần lưu ý"}
                style={{
                  width: "100%",
                  padding: "10px",
                  borderRadius: "4px",
                  border: "1px solid #D8CEC1",
                  fontSize: "13px",
                }}
              />
            </div>

            {newStatus === "cancelled" && (
              <div
                style={{
                  backgroundColor: "#FFF0F0",
                  color: "#D9534F",
                  padding: "10px 14px",
                  borderRadius: "4px",
                  fontSize: "12.5px",
                  marginTop: "15px",
                }}
              >
                <strong>Lưu ý:</strong> Toàn bộ sản phẩm trong đơn sẽ tự động được hoàn trả và cộng lại vào tồn kho khả dụng.
              </div>
            )}

            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "25px" }}>
              <button
                onClick={() => setStatusModalOrder(null)}
                className="btn-secondary"
                disabled={loadingAction}
                style={{ width: "auto", margin: 0, padding: "10px 18px", fontSize: "13px" }}
              >
                Hủy bỏ
              </button>
              <button
                onClick={handleSaveStatus}
                disabled={loadingAction || (newStatus === "cancelled" && statusNote.trim().length < 5)}
                className="btn-primary"
                style={{ padding: "10px 24px", fontSize: "13px" }}
              >
                {loadingAction ? "Đang lưu..." : "Lưu Thay Đổi"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payment Confirmation & Refund Action Modal */}
      {paymentModalOrder && (
        <div
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
              Xác Nhận Thanh Toán Đơn Hàng #{paymentModalOrder.id}
            </h3>

            <div style={{ backgroundColor: "#FAF6F0", padding: "14px 16px", borderRadius: "6px", marginBottom: "20px", fontSize: "13px" }}>
              <div><strong>Khách hàng:</strong> {paymentModalOrder.customer_name || paymentModalOrder.customerName}</div>
              <div><strong>Số tiền:</strong> <span style={{ color: "#B89B5E", fontWeight: "700" }}>{formatPrice(paymentModalOrder.total_amount || paymentModalOrder.totalAmount)}</span></div>
              <div><strong>Hình thức:</strong> {paymentModalIsCod ? "Thu hộ COD (Tiền mặt)" : "Chuyển khoản"}</div>
              <div><strong>Trạng thái thanh toán hiện tại:</strong> {PAYMENT_STATUS_META[paymentModalOrder.payment?.payment_status || "unpaid"]?.label}</div>
            </div>

            {!paymentModalIsCod && <div className="form-group">
              <label style={{ fontSize: "13px", fontWeight: "600" }}>
                Mã giao dịch / Mã tham chiếu ngân hàng
              </label>
              <input
                type="text"
                value={paymentReference}
                onChange={(e) => setPaymentReference(e.target.value)}
                placeholder="VD: TIEN-MAT-COD hoặc FT2603..."
                style={{
                  width: "100%",
                  padding: "10px",
                  borderRadius: "4px",
                  border: "1px solid #D8CEC1",
                  fontSize: "13px",
                  outline: "none",
                }}
              />
            </div>}

            {!paymentModalIsCod && <div className="form-group" style={{ marginTop: "15px" }}>
              <label style={{ fontSize: "13px", fontWeight: "600" }}>
                Ghi chú xác minh thanh toán
              </label>
              <input
                type="text"
                value={paymentModalNote}
                onChange={(e) => setPaymentModalNote(e.target.value)}
                placeholder="VD: Bưu tá đã nộp đủ tiền mặt hoặc đã đối soát ngân hàng"
                style={{
                  width: "100%",
                  padding: "10px",
                  borderRadius: "4px",
                  border: "1px solid #D8CEC1",
                  fontSize: "13px",
                  outline: "none",
                }}
              />
            </div>}

            {paymentModalIsCod && (
              <div style={{ padding: "12px 14px", borderRadius: "6px", border: "1px solid #C3E6CB", background: "#F0FFF4", color: "#276749", fontSize: "13px", lineHeight: 1.5 }}>
                Xác nhận rằng đơn đã giao thành công và đã thu đủ <strong>{formatPrice(paymentModalOrder.total_amount || paymentModalOrder.totalAmount)}</strong>. Hệ thống sẽ tự tạo mã biên nhận và lưu người cùng thời gian xác nhận.
              </div>
            )}

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
                  backgroundColor: "#2E8B57",
                  color: "#FFF",
                  border: "none",
                  borderRadius: "4px",
                  cursor: loadingPayment ? "not-allowed" : "pointer",
                }}
              >
                {loadingPayment ? "Đang xử lý..." : paymentModalIsCod ? "Xác Nhận Đã Thu COD" : "Xác Minh Chuyển Khoản"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Order Detail Modal */}
      {selectedOrder && (
        <div
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
                <span style={{ fontSize: "11px", letterSpacing: "1px", textTransform: "uppercase", color: "#8A7350" }}>
                  Hồ sơ đơn hàng nhân viên
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

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "15px", marginBottom: "20px", backgroundColor: "#FAF6F0", padding: "15px", borderRadius: "6px", fontSize: "13px" }}>
              <div>
                <div><strong>Người nhận:</strong> {selectedOrder.customer_name || selectedOrder.customerName}</div>
                <div><strong>Số điện thoại:</strong> {selectedOrder.customer_phone || selectedOrder.customerPhone}</div>
                <div><strong>Email:</strong> {selectedOrder.customer_email || selectedOrder.customerEmail}</div>
              </div>
              <div>
                <div><strong>Địa chỉ:</strong> {selectedOrder.shipping_address || selectedOrder.shippingAddress}</div>
                {selectedOrder.notes && <div><strong>Ghi chú giao hàng:</strong> {selectedOrder.notes}</div>}
                <div><strong>Trạng thái:</strong> {STATUS_LABELS[selectedOrder.order_status || selectedOrder.status]?.label}</div>
              </div>
            </div>

            {/* Payment Details Box */}
            <div style={{ backgroundColor: "#FCFBF9", border: "1px solid #E8E1D6", borderRadius: "6px", padding: "16px", marginBottom: "20px", fontSize: "13px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                <h4 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "18px", margin: 0, color: "#2B211C" }}>
                  Hồ Sơ Thanh Toán
                </h4>
                <span style={{
                  padding: "3px 10px",
                  borderRadius: "12px",
                  fontSize: "12px",
                  fontWeight: "700",
                  color: selectedOrder.payment ? PAYMENT_STATUS_META[selectedOrder.payment.payment_status]?.color : "#A94442",
                  backgroundColor: selectedOrder.payment ? PAYMENT_STATUS_META[selectedOrder.payment.payment_status]?.bg : "#FFF0F0",
                }}>
                  ● {selectedOrder.payment ? PAYMENT_STATUS_META[selectedOrder.payment.payment_status]?.label : "Thiếu dữ liệu"}
                </span>
              </div>
              {!selectedOrder.payment && (
                <div style={{ marginBottom: "10px", padding: "10px 12px", border: "1px solid #EBC4C4", borderRadius: "5px", background: "#FFF0F0", color: "#A94442" }}>
                  Đơn hàng chưa có hồ sơ thanh toán. Hệ thống đã khóa thao tác thu tiền để tránh ghi nhận sai doanh thu.
                </div>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                <div><strong>Phương thức:</strong> {!selectedOrder.payment ? "Chưa xác định" : selectedOrder.payment.payment_method === "cod" ? "Thanh toán khi nhận hàng (COD)" : "Chuyển khoản"}</div>
                <div><strong>Tổng tiền:</strong> <span style={{ color: "#B89B5E", fontWeight: "700" }}>{formatPrice(selectedOrder.total_amount)}</span></div>
                {Number(selectedOrder.product_discount_total || 0) + Number(selectedOrder.code_discount_total || 0) > 0 && <div className="order-promotion-breakdown"><div><strong>Giá trị ban đầu:</strong> {formatPrice(selectedOrder.original_subtotal)}</div><div><strong>Khuyến mãi sản phẩm:</strong> −{formatPrice(selectedOrder.product_discount_total)}</div><div><strong>Mã {selectedOrder.promotion_code || "—"}:</strong> −{formatPrice(selectedOrder.code_discount_total)}</div></div>}
                {selectedOrder.payment?.verified_at && (
                  <>
                    <div><strong>Xác nhận bởi:</strong> {selectedOrder.payment.verified_by || "Hệ thống"}</div>
                    <div><strong>Ngày xác nhận:</strong> {formatDate(selectedOrder.payment.verified_at)}</div>
                    <div><strong>{selectedOrder.payment.payment_method === "cod" ? "Mã biên nhận:" : "Mã giao dịch:"}</strong> {selectedOrder.payment.transaction_reference || "N/A"}</div>
                  </>
                )}
                {selectedOrder.payment?.refunded_at && (
                  <>
                    <div><strong>Hoàn tiền bởi:</strong> {selectedOrder.payment.refunded_by || "Hệ thống"}</div>
                    <div><strong>Ngày hoàn tiền:</strong> {formatDate(selectedOrder.payment.refunded_at)}</div>
                    <div><strong>Mã hoàn tiền:</strong> {selectedOrder.payment.refund_reference || "N/A"}</div>
                    <div><strong>Ghi chú hoàn:</strong> {selectedOrder.payment.refund_note || "N/A"}</div>
                  </>
                )}
              </div>
              <div style={{ marginTop: "12px", display: "flex", gap: "8px" }}>
                {canConfirmPaymentFor(selectedOrder) && (
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
                    Xác Nhận Thu Tiền Đơn Này
                  </button>
                )}
                {(selectedOrder.payment?.payment_status === "refund_pending" || (selectedOrder.order_status === "cancelled" && selectedOrder.payment?.payment_status === "paid")) && <div style={{ padding: "8px 12px", borderRadius: 5, background: "#FDF2E9", border: "1px solid #E9B98D", color: "#9A4B14", fontSize: 12 }}><strong>Đã chuyển Admin:</strong> Staff chỉ theo dõi; Admin phê duyệt và thực hiện hoàn tiền.</div>}
              </div>
            </div>

            <h4 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "18px", marginBottom: "12px" }}>
              Danh sách sản phẩm trong đơn:
            </h4>
            <div style={{ marginBottom: "25px" }}>
              {(selectedOrder.items || []).map((it, idx) => <OrderItemLine key={it.id || `${it.product_id}-${idx}`} item={it} formatPrice={formatPrice} />)}
              <OrderFinancialBreakdown order={selectedOrder} formatPrice={formatPrice} />
            </div>

            <h4 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "18px", marginBottom: "12px" }}>
              Lịch sử thay đổi trạng thái (Audit Trail):
            </h4>
            <div style={{ borderLeft: "2px solid #D8CEC1", paddingLeft: "16px", marginLeft: "6px", marginBottom: "25px" }}>
              {(selectedOrder.history || []).map((h, i) => (
                <div key={i} style={{ marginBottom: "12px", fontSize: "13px" }}>
                  <strong>{STATUS_LABELS[h.new_status || h.status]?.label || h.new_status || h.status}</strong> —{" "}
                  <span style={{ color: "#8A7350", fontSize: "12px" }}>{formatDate(h.created_at || h.timestamp)} (bởi {h.updated_by || h.by})</span>
                  {h.note && <div style={{ color: "#5E5147", fontStyle: "italic", marginTop: "2px" }}>"{h.note}"</div>}
                </div>
              ))}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button
                onClick={() => setSelectedOrder(null)}
                className="btn-primary"
                style={{ padding: "8px 20px", fontSize: "13px" }}
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
