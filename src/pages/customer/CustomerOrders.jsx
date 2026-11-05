import { useState } from "react";
import { Link } from "react-router-dom";
import { useStore, STATUS_LABELS } from "../../context/StoreContext";
import { useAuth } from "../../context/AuthContext";
import useDocumentTitle from "../../hooks/useDocumentTitle";
import CustomerAccountSidebar from "../../components/CustomerAccountSidebar";
import OrderItemLine from "../../components/OrderItemLine";
import OrderFinancialBreakdown from "../../components/OrderFinancialBreakdown";

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

const TRACKER_STEPS = ["pending", "confirmed", "processing", "shipping", "delivered"];

export const PAYMENT_STATUS_META = {
  paid: { label: "Đã thanh toán", color: "#2E8B57", bg: "#EAF7EE" },
  pending_verification: { label: "Chờ xác nhận thanh toán", color: "#B8860B", bg: "#FFF8DC" },
  unpaid: { label: "Chưa thanh toán (COD)", color: "#6B5A4B", bg: "#F5F0EA" },
  refund_pending: { label: "Chờ xử lý hoàn tiền", color: "#E67E22", bg: "#FDF2E9" },
  refunded: { label: "Đã hoàn tiền", color: "#7B1FA2", bg: "#F3E5F5" },
  cancelled: { label: "Đã hủy giao dịch", color: "#9E9E9E", bg: "#EEEEEE" },
};

export default function CustomerOrders() {
  useDocumentTitle("Đơn Hàng Của Tôi");
  const { orders, cancelOrder } = useStore();
  const { currentUser } = useAuth();
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [cancellingId, setCancellingId] = useState(null);
  const [cancelReason, setCancelReason] = useState("");
  const [actionNotice, setActionNotice] = useState("");
  const [loadingCancel, setLoadingCancel] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");

  // Filter orders for the logged-in customer (backend already scopes, but we also ensure on client)
  const customerOrders = orders.filter((o) => {
    const custId = o.customer_id || o.customerId;
    const custEmail = o.customer_email || o.customerEmail;
    return (
      !currentUser ||
      custId === currentUser.id ||
      custEmail?.toLowerCase() === currentUser.email?.toLowerCase()
    );
  }).filter((o) => statusFilter === "all" || (o.order_status || o.status) === statusFilter);

  const handleCancelClick = (order) => {
    setCancellingId(order.id);
    setCancelReason("Khách hàng thay đổi ý định.");
  };

  const confirmCancel = async () => {
    if (!cancellingId) return;
    setLoadingCancel(true);
    const res = await cancelOrder(
      cancellingId,
      cancelReason || "Khách hàng yêu cầu hủy đơn qua trang quản lý tài khoản."
    );
    setLoadingCancel(false);

    if (res.success) {
      setActionNotice(
        `Đã hủy thành công đơn hàng #${cancellingId}. Số lượng sản phẩm đã được tự động hoàn trả vào tồn kho.`
      );
      setCancellingId(null);
      if (selectedOrder?.id === cancellingId) {
        setSelectedOrder((prev) => ({
          ...prev,
          order_status: "cancelled",
          status: "cancelled",
        }));
      }
    } else {
      alert(res.error || "Không thể hủy đơn hàng.");
    }
  };

  return (
    <main className="customer-orders-page" style={{ maxWidth: "1150px", margin: "40px auto", padding: "0 20px" }}>
      <CustomerAccountSidebar />
      <section className="customer-orders-content">
      <div className="orders-filter-bar" aria-label="Lọc đơn hàng">
        <span>Lọc đơn hàng</span>
        {[['all','Tất cả'],['pending','Chờ xác nhận'],['processing','Đang chuẩn bị'],['shipping','Đang giao'],['delivered','Đã nhận hàng'],['cancelled','Đã hủy']].map(([value, label]) => (
          <button key={value} className={statusFilter === value ? "active" : ""} onClick={() => setStatusFilter(value)}>{label}</button>
        ))}
      </div>
      {/* Header bar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "30px",
          borderBottom: "1px solid #D8CEC1",
          paddingBottom: "20px",
        }}
      >
        <div>
          <span
            style={{
              fontSize: "12px",
              letterSpacing: "1.5px",
              color: "#8A7350",
              textTransform: "uppercase",
              fontWeight: "600",
            }}
          >
            Cổng Khách Hàng (Customer Portal)
          </span>
          <h1
            style={{
              fontFamily: "'Cormorant Garamond', serif",
              fontSize: "36px",
              color: "#2B211C",
              margin: "5px 0 0",
              fontWeight: "500",
            }}
          >
            LỊCH SỬ ĐƠN HÀNG
          </h1>
        </div>

        <div style={{ textAlign: "right" }}>
          <div style={{ fontWeight: "600", color: "#2B211C" }}>{currentUser?.name}</div>
          <div style={{ fontSize: "13px", color: "#6B5A4B" }}>{currentUser?.email}</div>
          <span
            style={{
              display: "inline-block",
              marginTop: "4px",
              padding: "2px 8px",
              backgroundColor: "#FAF6F0",
              border: "1px solid #D8CEC1",
              borderRadius: "4px",
              fontSize: "11px",
              color: "#4E342E",
              fontWeight: "600",
            }}
          >
          </span>
        </div>
      </div>

      {actionNotice && (
        <div
          style={{
            backgroundColor: "#F0FFF0",
            color: "#2E8B57",
            border: "1px solid #C3E6CB",
            padding: "12px 18px",
            borderRadius: "6px",
            marginBottom: "25px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>✓ {actionNotice}</span>
          <button
            onClick={() => setActionNotice("")}
            style={{ background: "none", border: "none", color: "#2E8B57", cursor: "pointer", fontSize: "16px" }}
          >
            ×
          </button>
        </div>
      )}

      {customerOrders.length === 0 ? (
        <div
          style={{
            backgroundColor: "#FFFFFF",
            border: "1px solid #D8CEC1",
            borderRadius: "8px",
            padding: "60px 20px",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: "40px", color: "#B8A894", marginBottom: "15px" }}>
            <i className="fas fa-box-open"></i>
          </div>
          <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "28px", color: "#2B211C" }}>
            Bạn chưa có đơn hàng nào
          </h2>
          <p style={{ color: "#6B5A4B", fontSize: "14px", marginBottom: "25px" }}>
            Khám phá bộ sưu tập thời trang cổ điển đẳng cấp Maison Rue và đặt hàng ngay hôm nay.
          </p>
          <Link to="/" className="btn-primary" style={{ textDecoration: "none", display: "inline-block" }}>
            Khám phá bộ sưu tập
          </Link>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "25px" }}>
          {customerOrders.map((order) => {
            const currentStatus = order.order_status || order.status;
            const statusMeta = STATUS_LABELS[currentStatus] || {
              label: currentStatus,
              color: "#333",
              bg: "#eee",
            };
            const currentStepIdx = TRACKER_STEPS.indexOf(currentStatus);
            const isCancelled = currentStatus === "cancelled";
            const orderItems = order.items || [];
            const totalAmount = order.total_amount || order.totalAmount;
            const createdAt = order.created_at || order.createdAt;
            const pmt = order.payment || {};
            const pmtStatus = pmt.payment_status || "unpaid";
            const pmtMeta = PAYMENT_STATUS_META[pmtStatus] || { label: pmtStatus, color: "#6B5A4B", bg: "#F5F0EA" };

            return (
              <div
                key={order.id}
                style={{
                  backgroundColor: "#FFFFFF",
                  border: "1px solid #D8CEC1",
                  borderRadius: "8px",
                  overflow: "hidden",
                  boxShadow: "0 2px 10px rgba(43, 33, 28, 0.04)",
                }}
              >
                {/* Order Top Bar */}
                <div
                  style={{
                    backgroundColor: "#FAF6F0",
                    padding: "16px 24px",
                    borderBottom: "1px solid #E8E1D6",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: "12px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "15px" }}>
                    <span style={{ fontWeight: "700", color: "#2B211C", fontSize: "15px", letterSpacing: "0.5px" }}>
                      #{order.id}
                    </span>
                    <span style={{ fontSize: "13px", color: "#8A7350" }}>
                      Ngày đặt: {formatDate(createdAt)}
                    </span>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                    <span
                      style={{
                        padding: "5px 14px",
                        borderRadius: "20px",
                        fontSize: "12.5px",
                        fontWeight: "600",
                        color: statusMeta.color,
                        backgroundColor: statusMeta.bg,
                        border: `1px solid ${statusMeta.color}30`,
                      }}
                    >
                      ● {statusMeta.label}
                    </span>

                    <span
                      style={{
                        padding: "5px 14px",
                        borderRadius: "20px",
                        fontSize: "12px",
                        fontWeight: "600",
                        color: pmtMeta.color,
                        backgroundColor: pmtMeta.bg,
                        border: `1px solid ${pmtMeta.color}30`,
                      }}
                    >
                      ● {pmtMeta.label}
                    </span>

                    <button
                      onClick={() => setSelectedOrder(order)}
                      style={{
                        padding: "6px 14px",
                        backgroundColor: "transparent",
                        border: "1px solid #2B211C",
                        borderRadius: "4px",
                        fontSize: "12px",
                        fontWeight: "600",
                        cursor: "pointer",
                        color: "#2B211C",
                      }}
                    >
                      Chi tiết đơn
                    </button>

                    {["pending", "confirmed"].includes(currentStatus) && (
                      <button
                        onClick={() => handleCancelClick(order)}
                        style={{
                          padding: "6px 14px",
                          backgroundColor: "#FFF",
                          border: "1px solid #D9534F",
                          borderRadius: "4px",
                          fontSize: "12px",
                          fontWeight: "600",
                          cursor: "pointer",
                          color: "#D9534F",
                        }}
                      >
                        Hủy đơn hàng
                      </button>
                    )}
                  </div>
                </div>

                {/* Visual Workflow Tracker (Only for non-cancelled) */}
                {!isCancelled ? (
                  <div
                    style={{
                      padding: "20px 24px",
                      backgroundColor: "#FCFBF9",
                      borderBottom: "1px solid #F0EAE1",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", position: "relative" }}>
                      {/* Connecting Line */}
                      <div
                        style={{
                          position: "absolute",
                          top: "14px",
                          left: "40px",
                          right: currentStepIdx === TRACKER_STEPS.length - 1 ? "10%" : "40px",
                          height: "2px",
                          backgroundColor: "#E0D7CC",
                          zIndex: 1,
                        }}
                      />
                      {/* Active Progress Line */}
                      <div
                        style={{
                          position: "absolute",
                          top: "14px",
                          left: "40px",
                          width: `${currentStepIdx === TRACKER_STEPS.length - 1 ? 90 : Math.max(0, (currentStepIdx / (TRACKER_STEPS.length - 1)) * 100)}%`,
                          height: "2px",
                          backgroundColor: "#4E342E",
                          zIndex: 2,
                          transition: "width 0.4s ease",
                        }}
                      />

                      {TRACKER_STEPS.map((stepKey, idx) => {
                        const isDone = idx <= currentStepIdx;
                        const isCurrent = idx === currentStepIdx;
                        const stepLabels = {
                          pending: "Chờ xác nhận",
                          confirmed: "Đã xác nhận",
                          processing: "Đang chuẩn bị",
                          shipping: "Đang giao",
                          delivered: "Đã nhận hàng",
                        };

                        return (
                          <div
                            key={stepKey}
                            style={{
                              position: "relative",
                              zIndex: 3,
                              textAlign: "center",
                              width: "90px",
                            }}
                          >
                            <div
                              style={{
                                width: "28px",
                                height: "28px",
                                borderRadius: "50%",
                                backgroundColor: isDone ? "#4E342E" : "#FFF",
                                border: isDone ? "2px solid #4E342E" : "2px solid #D8CEC1",
                                color: isDone ? "#FFF" : "#B8A894",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                margin: "0 auto 6px",
                                fontSize: "11px",
                                fontWeight: "700",
                              }}
                            >
                              {isDone ? "✓" : idx + 1}
                            </div>
                            <span
                              style={{
                                fontSize: "11.5px",
                                fontWeight: isCurrent ? "700" : isDone ? "500" : "400",
                                color: isCurrent ? "#2B211C" : isDone ? "#4E342E" : "#A09384",
                              }}
                            >
                              {stepLabels[stepKey]}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div
                    style={{
                      padding: "12px 24px",
                      backgroundColor: pmtStatus === "refund_pending" ? "#FDF2E9" : pmtStatus === "refunded" ? "#F3E5F5" : "#FFF5F5",
                      borderBottom: "1px solid #FFE4E4",
                      fontSize: "13px",
                      color: pmtStatus === "refund_pending" ? "#E67E22" : pmtStatus === "refunded" ? "#7B1FA2" : "#D9534F",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <i className="fas fa-info-circle"></i>
                    <span>
                      {pmtStatus === "refund_pending"
                        ? "Đơn hàng này đã bị hủy. Yêu cầu hoàn tiền của bạn đang được phòng kế toán đối soát và xử lý trong 24h làm việc."
                        : pmtStatus === "refunded"
                        ? `Đơn hàng này đã bị hủy. Khoản tiền đã được hoàn trả thành công${pmt.refund_reference ? ` (Mã hoàn tiền: ${pmt.refund_reference})` : ""}.`
                        : "Đơn hàng này đã bị hủy. Toàn bộ số lượng sản phẩm đã được tự động hoàn trả lại vào kho hàng."}
                    </span>
                  </div>
                )}

                {/* Items preview */}
                <div style={{ padding: "20px 24px" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    {orderItems.map((item, idx) => <OrderItemLine key={item.id || `${item.product_id}-${idx}`} item={item} formatPrice={formatPrice} linkProduct />)}
                  </div>

                  <div
                    style={{
                      marginTop: "16px",
                      paddingTop: "14px",
                      borderTop: "1px solid #E8E1D6",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <div style={{ fontSize: "13px", color: "#6B5A4B" }}>
                      Địa chỉ nhận: {order.shipping_address || order.shippingAddress}
                    </div>
                    <div style={{ fontSize: "15px", color: "#2B211C" }}>
                      Tổng thanh toán:{" "}
                      <strong style={{ color: "#B89B5E", fontSize: "17px", marginLeft: "6px" }}>
                        {formatPrice(totalAmount)}
                      </strong>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Cancel Confirmation Modal */}
      {cancellingId && (
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
              maxWidth: "460px",
              width: "100%",
              boxShadow: "0 10px 40px rgba(0,0,0,0.2)",
            }}
          >
            <h3
              style={{
                fontFamily: "'Cormorant Garamond', serif",
                fontSize: "24px",
                color: "#2B211C",
                marginTop: 0,
              }}
            >
              Xác Nhận Hủy Đơn Hàng #{cancellingId}
            </h3>
            <p style={{ fontSize: "14px", color: "#6B5A4B", lineHeight: "1.6" }}>
              Bạn có chắc chắn muốn hủy đơn hàng này không? Sau khi xác nhận, toàn bộ số lượng sản phẩm trong đơn sẽ tự động được hoàn trả vào kho hàng.
            </p>

            <div style={{ margin: "15px 0" }}>
              <label style={{ display: "block", fontSize: "13px", fontWeight: "600", marginBottom: "6px" }}>
                Lý do hủy đơn:
              </label>
              <select
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px",
                  borderRadius: "4px",
                  border: "1px solid #D8CEC1",
                  fontSize: "13.5px",
                }}
              >
                <option value="Khách hàng thay đổi ý định.">Khách hàng thay đổi ý định</option>
                <option value="Muốn đổi sang mẫu hoặc màu sắc khác.">Muốn đổi sang mẫu hoặc màu sắc khác</option>
                <option value="Đặt nhầm số lượng sản phẩm.">Đặt nhầm số lượng sản phẩm</option>
                <option value="Thời gian giao hàng không phù hợp.">Thời gian giao hàng không phù hợp</option>
              </select>
            </div>

            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "25px" }}>
              <button
                onClick={() => setCancellingId(null)}
                className="btn-secondary"
                disabled={loadingCancel}
                style={{ width: "auto", margin: 0, padding: "10px 18px", fontSize: "13px" }}
              >
                Đóng
              </button>
              <button
                onClick={confirmCancel}
                disabled={loadingCancel}
                style={{
                  backgroundColor: "#D9534F",
                  color: "#FFF",
                  border: "none",
                  borderRadius: "4px",
                  padding: "10px 20px",
                  fontSize: "13px",
                  fontWeight: "600",
                  cursor: loadingCancel ? "not-allowed" : "pointer",
                }}
              >
                {loadingCancel ? "Đang hủy..." : "Xác Nhận Hủy"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Order Detail & Timeline Modal */}
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
              maxWidth: "650px",
              width: "100%",
              maxHeight: "90vh",
              overflowY: "auto",
              boxShadow: "0 10px 40px rgba(0,0,0,0.2)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px" }}>
              <div>
                <span style={{ fontSize: "11px", letterSpacing: "1px", textTransform: "uppercase", color: "#8A7350" }}>
                  Chi tiết đơn hàng
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

            <div style={{ marginBottom: "25px", fontSize: "13.5px", backgroundColor: "#FAF6F0", padding: "15px", borderRadius: "6px" }}>
              <div><strong>Người nhận:</strong> {selectedOrder.customer_name || selectedOrder.customerName} ({selectedOrder.customer_phone || selectedOrder.customerPhone})</div>
              <div><strong>Địa chỉ:</strong> {selectedOrder.shipping_address || selectedOrder.shippingAddress}</div>
              {selectedOrder.notes && <div><strong>Ghi chú giao hàng:</strong> {selectedOrder.notes}</div>}
              <div><strong>Hình thức thanh toán:</strong> {selectedOrder.payment?.payment_method === "cod" ? "Thanh toán khi nhận hàng (COD)" : "Chuyển khoản"}</div>
              <div><strong>Trạng thái đơn:</strong> {STATUS_LABELS[selectedOrder.order_status || selectedOrder.status]?.label}</div>
              <div><strong>Trạng thái thanh toán:</strong> {PAYMENT_STATUS_META[selectedOrder.payment?.payment_status || "unpaid"]?.label}</div>
              {Number(selectedOrder.product_discount_total || 0) + Number(selectedOrder.code_discount_total || 0) > 0 && <div className="order-promotion-breakdown"><div><strong>Tạm tính ban đầu:</strong> {formatPrice(selectedOrder.original_subtotal)}</div>{Number(selectedOrder.product_discount_total) > 0 && <div><strong>Khuyến mãi sản phẩm:</strong> −{formatPrice(selectedOrder.product_discount_total)}</div>}{Number(selectedOrder.code_discount_total) > 0 && <div><strong>Mã {selectedOrder.promotion_code}:</strong> −{formatPrice(selectedOrder.code_discount_total)}</div>}<div><strong>Thực thanh toán:</strong> {formatPrice(selectedOrder.total_amount)}</div></div>}
              {selectedOrder.payment?.transaction_reference && (
                <div><strong>Mã giao dịch:</strong> {selectedOrder.payment.transaction_reference}</div>
              )}
              {selectedOrder.payment?.refund_reference && (
                <div><strong>Mã hoàn tiền:</strong> {selectedOrder.payment.refund_reference} (Hoàn tất ngày {formatDate(selectedOrder.payment.refunded_at)})</div>
              )}
            </div>

            <h4 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "18px", marginBottom: "8px" }}>
              Sản phẩm trong đơn:
            </h4>
            <div style={{ marginBottom: "18px" }}>
              {(selectedOrder.items || []).map((item, idx) => <OrderItemLine key={item.id || `${item.product_id}-${idx}`} item={item} formatPrice={formatPrice} linkProduct />)}
              <OrderFinancialBreakdown order={selectedOrder} formatPrice={formatPrice} />
            </div>

            <h4 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "18px", marginBottom: "12px" }}>
              Nhật ký xử lý đơn hàng (Audit Trail):
            </h4>

            <div style={{ borderLeft: "2px solid #D8CEC1", paddingLeft: "18px", marginLeft: "8px", marginBottom: "25px" }}>
              {(selectedOrder.history || []).map((h, i) => (
                <div key={i} style={{ marginBottom: "16px", position: "relative" }}>
                  <div
                    style={{
                      position: "absolute",
                      left: "-25px",
                      top: "2px",
                      width: "12px",
                      height: "12px",
                      borderRadius: "50%",
                      backgroundColor: "#4E342E",
                      border: "2px solid #FFF",
                    }}
                  />
                  <div style={{ fontSize: "13px", fontWeight: "600", color: "#2B211C" }}>
                    {STATUS_LABELS[h.new_status || h.status]?.label || h.new_status || h.status}
                  </div>
                  <div style={{ fontSize: "12px", color: "#8A7350" }}>
                    {formatDate(h.created_at || h.timestamp)} • Bởi: {h.updated_by || h.by}
                  </div>
                  {h.note && (
                    <div style={{ fontSize: "13px", color: "#5E5147", marginTop: "3px", fontStyle: "italic" }}>
                      "{h.note}"
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div style={{ textAlign: "right" }}>
              <button
                onClick={() => setSelectedOrder(null)}
                className="btn-primary"
                style={{ padding: "10px 24px", fontSize: "13px" }}
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
      </section>
    </main>
  );
}


