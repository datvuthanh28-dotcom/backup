import { Link } from "react-router-dom";
import { useStore, STATUS_LABELS } from "../../context/StoreContext";
import { allProducts } from "../../data/products";
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

export default function StaffDashboard() {
  useDocumentTitle("Staff Portal - Tổng Quan Vận Hành");
  const { orders, getProductStock, products } = useStore();

  const getOrderStatus = (o) => o.order_status || o.status;

  const pendingOrders = orders.filter((o) => getOrderStatus(o) === "pending");
  const confirmedOrders = orders.filter((o) => getOrderStatus(o) === "confirmed");
  const processingOrders = orders.filter((o) => getOrderStatus(o) === "processing");
  const shippingOrders = orders.filter((o) => getOrderStatus(o) === "shipping");

  const productList = products && products.length > 0 ? products : allProducts;

  // Critical stock items
  const outOfStockItems = productList.filter((p) => getProductStock(p.id) === 0);
  const lowStockItems = productList.filter((p) => {
    const s = getProductStock(p.id);
    return s > 0 && s <= 5;
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
          TỔNG QUAN VẬN HÀNH & KHO HÀNG
        </h1>
        <p style={{ color: "#6B5A4B", fontSize: "14px", margin: 0 }}>
          Theo dõi trạng thái đơn hàng thời gian thực và kiểm soát tồn kho khả dụng Maison Rue (MS SQL Server).
        </p>
      </div>

      {/* Metric Cards Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
          gap: "20px",
          marginBottom: "30px",
        }}
      >
        <div
          style={{
            backgroundColor: "#FFFFFF",
            border: "1px solid #D8CEC1",
            borderRadius: "8px",
            padding: "20px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.02)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", color: "#B8860B", marginBottom: "10px" }}>
            <span style={{ fontSize: "12px", fontWeight: "600", textTransform: "uppercase" }}>Chờ xác nhận</span>
            <i className="fas fa-clock" style={{ fontSize: "18px" }}></i>
          </div>
          <div style={{ fontSize: "32px", fontWeight: "700", color: "#2B211C" }}>{pendingOrders.length}</div>
          <div style={{ fontSize: "12px", color: "#8A7350", marginTop: "5px" }}>Cần nhân viên kiểm tra</div>
        </div>

        <div
          style={{
            backgroundColor: "#FFFFFF",
            border: "1px solid #D8CEC1",
            borderRadius: "8px",
            padding: "20px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.02)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", color: "#1E90FF", marginBottom: "10px" }}>
            <span style={{ fontSize: "12px", fontWeight: "600", textTransform: "uppercase" }}>Đã xác nhận</span>
            <i className="fas fa-check-double" style={{ fontSize: "18px" }}></i>
          </div>
          <div style={{ fontSize: "32px", fontWeight: "700", color: "#2B211C" }}>{confirmedOrders.length}</div>
          <div style={{ fontSize: "12px", color: "#8A7350", marginTop: "5px" }}>Chờ chuyển kho đóng gói</div>
        </div>

        <div
          style={{
            backgroundColor: "#FFFFFF",
            border: "1px solid #D8CEC1",
            borderRadius: "8px",
            padding: "20px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.02)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", color: "#8A2BE2", marginBottom: "10px" }}>
            <span style={{ fontSize: "12px", fontWeight: "600", textTransform: "uppercase" }}>Đang chuẩn bị</span>
            <i className="fas fa-box-open" style={{ fontSize: "18px" }}></i>
          </div>
          <div style={{ fontSize: "32px", fontWeight: "700", color: "#2B211C" }}>{processingOrders.length}</div>
          <div style={{ fontSize: "12px", color: "#8A7350", marginTop: "5px" }}>Kiểm định & đóng gói</div>
        </div>

        <div
          style={{
            backgroundColor: "#FFFFFF",
            border: "1px solid #D8CEC1",
            borderRadius: "8px",
            padding: "20px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.02)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", color: "#D2691E", marginBottom: "10px" }}>
            <span style={{ fontSize: "12px", fontWeight: "600", textTransform: "uppercase" }}>Đang vận chuyển</span>
            <i className="fas fa-shipping-fast" style={{ fontSize: "18px" }}></i>
          </div>
          <div style={{ fontSize: "32px", fontWeight: "700", color: "#2B211C" }}>{shippingOrders.length}</div>
          <div style={{ fontSize: "12px", color: "#8A7350", marginTop: "5px" }}>Đang giao khách hàng</div>
        </div>

        <div
          style={{
            backgroundColor: "#FFF8F0",
            border: "1px solid #F5D6B5",
            borderRadius: "8px",
            padding: "20px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", color: "#C05621", marginBottom: "10px" }}>
            <span style={{ fontSize: "12px", fontWeight: "600", textTransform: "uppercase" }}>Cảnh báo kho</span>
            <i className="fas fa-exclamation-triangle" style={{ fontSize: "18px" }}></i>
          </div>
          <div style={{ fontSize: "32px", fontWeight: "700", color: "#C05621" }}>
            {outOfStockItems.length + lowStockItems.length}
          </div>
          <div style={{ fontSize: "12px", color: "#9C4221", marginTop: "5px" }}>
            {outOfStockItems.length} hết hàng • {lowStockItems.length} sắp hết
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: "25px" }}>
        {/* Urgent Orders Needing Action */}
        <div
          style={{
            backgroundColor: "#FFFFFF",
            border: "1px solid #D8CEC1",
            borderRadius: "8px",
            padding: "24px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "18px",
              borderBottom: "1px solid #E8E1D6",
              paddingBottom: "12px",
            }}
          >
            <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "22px", margin: 0, color: "#2B211C" }}>
              Đơn Hàng Chờ Xử Lý ({pendingOrders.length + confirmedOrders.length})
            </h2>
            <Link
              to="/staff/orders"
              style={{ fontSize: "13px", color: "#4E342E", fontWeight: "600", textDecoration: "none" }}
            >
              Xem tất cả đơn →
            </Link>
          </div>

          {[...pendingOrders, ...confirmedOrders].length === 0 ? (
            <div style={{ textAlign: "center", padding: "30px 0", color: "#6B5A4B", fontSize: "14px" }}>
              ✓ Không có đơn hàng nào đang chờ xử lý!
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {[...pendingOrders, ...confirmedOrders].slice(0, 5).map((order) => {
                const currentStatus = getOrderStatus(order);
                const meta = STATUS_LABELS[currentStatus] || { label: currentStatus, bg: "#eee", color: "#333" };
                return (
                  <div
                    key={order.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "12px 14px",
                      backgroundColor: "#FAF6F0",
                      borderRadius: "6px",
                      border: "1px solid #E8E1D6",
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: "700", color: "#2B211C", fontSize: "13.5px" }}>
                        #{order.id} — {order.customer_name || order.customerName}
                      </div>
                      <div style={{ fontSize: "12px", color: "#6B5A4B" }}>
                        {formatPrice(order.total_amount || order.totalAmount)} • {(order.items || []).length} món • {formatDate(order.created_at || order.createdAt)}
                      </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <span
                        style={{
                          fontSize: "11px",
                          fontWeight: "600",
                          padding: "3px 10px",
                          borderRadius: "12px",
                          backgroundColor: meta.bg,
                          color: meta.color,
                        }}
                      >
                        {meta.label}
                      </span>
                      <Link
                        to="/staff/orders"
                        style={{
                          fontSize: "12px",
                          padding: "5px 12px",
                          backgroundColor: "#2B211C",
                          color: "#FFF",
                          borderRadius: "4px",
                          textDecoration: "none",
                        }}
                      >
                        Xử lý
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Inventory Attention Alerts */}
        <div
          style={{
            backgroundColor: "#FFFFFF",
            border: "1px solid #D8CEC1",
            borderRadius: "8px",
            padding: "24px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "18px",
              borderBottom: "1px solid #E8E1D6",
              paddingBottom: "12px",
            }}
          >
            <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "22px", margin: 0, color: "#2B211C" }}>
              Cảnh Báo Tồn Kho Kho Vận
            </h2>
            <Link
              to="/staff/inventory"
              style={{ fontSize: "13px", color: "#4E342E", fontWeight: "600", textDecoration: "none" }}
            >
              Quản lý kho →
            </Link>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {outOfStockItems.map((p) => (
              <div
                key={p.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "10px 14px",
                  backgroundColor: "#FFF0F0",
                  border: "1px solid #F5C6CB",
                  borderRadius: "6px",
                  fontSize: "13px",
                }}
              >
                <div>
                  <strong style={{ color: "#D9534F" }}>{p.name}</strong>
                  <div style={{ fontSize: "11px", color: "#8A7350" }}>ID: {p.id} | {p.category}</div>
                </div>
                <span
                  style={{
                    backgroundColor: "#D9534F",
                    color: "#FFF",
                    padding: "3px 8px",
                    borderRadius: "4px",
                    fontSize: "11px",
                    fontWeight: "700",
                  }}
                >
                  0 TỒN KHO
                </span>
              </div>
            ))}

            {lowStockItems.map((p) => (
              <div
                key={p.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "10px 14px",
                  backgroundColor: "#FFFBF0",
                  border: "1px solid #FFE4B5",
                  borderRadius: "6px",
                  fontSize: "13px",
                }}
              >
                <div>
                  <strong style={{ color: "#B8860B" }}>{p.name}</strong>
                  <div style={{ fontSize: "11px", color: "#8A7350" }}>ID: {p.id} | {p.category}</div>
                </div>
                <span
                  style={{
                    backgroundColor: "#FFF8DC",
                    color: "#B8860B",
                    border: "1px solid #B8860B",
                    padding: "3px 8px",
                    borderRadius: "4px",
                    fontSize: "11px",
                    fontWeight: "700",
                  }}
                >
                  CÒN {getProductStock(p.id)} SP
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
