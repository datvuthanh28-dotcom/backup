import { useState } from "react";
import { useStore, STATUS_LABELS } from "../../context/StoreContext";
import useDocumentTitle from "../../hooks/useDocumentTitle";

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
  const { orders } = useStore();
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedOrder, setSelectedOrder] = useState(null);

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
                filteredOrders.map((order, idx) => {
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
                            CHỜ THU ({order.paymentMethod === "cod" ? "COD" : "Chuyển khoản"})
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
      </div>

      {/* Audit Detail Modal */}
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
              <div><strong>Địa chỉ:</strong> {selectedOrder.shipping_address || selectedOrder.shippingAddress}</div>
              <div><strong>Thanh toán:</strong> {selectedOrder.payment?.payment_status === "paid" ? "Đã thu tiền vào tài khoản" : "Chưa hoàn tất thanh toán"}</div>
              <div><strong>Tổng tiền:</strong> {formatPrice(selectedOrder.total_amount || selectedOrder.totalAmount)}</div>
            </div>

            <h4 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "18px", marginBottom: "12px" }}>
              Sản phẩm trong đơn:
            </h4>
            <div style={{ marginBottom: "20px" }}>
              {(selectedOrder.items || []).map((it, idx) => (
                <div key={idx} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px dashed #E8E1D6", fontSize: "13px" }}>
                  <span>{it.product_name || it.name} ({it.selected_color || it.selectedColor}) × {it.quantity}</span>
                  <strong>{formatPrice((it.unit_price || it.price) * it.quantity)}</strong>
                </div>
              ))}
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
    </div>
  );
}

