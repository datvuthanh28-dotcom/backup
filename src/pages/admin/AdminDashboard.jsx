import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useStore, STATUS_LABELS } from "../../context/StoreContext";
import { employeeAPI } from "../../services/api";
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

export default function AdminDashboard() {
  useDocumentTitle("Admin Dashboard - Quản Trị Hệ Thống");
  const { orders, getBusinessMetrics } = useStore();
  const metrics = getBusinessMetrics();

  const [staffStats, setStaffStats] = useState({ total: 0, active: 0 });

  useEffect(() => {
    let isMounted = true;
    async function loadStaff() {
      try {
        const res = await employeeAPI.getAll();
        if (isMounted && res.success && Array.isArray(res.staff)) {
          const total = res.staff.length;
          const active = res.staff.filter((s) => s.is_active !== false && s.active !== false).length;
          setStaffStats({ total, active });
        }
      } catch (err) {
        console.warn("[AdminDashboard] Staff load warning:", err.message);
      }
    }
    loadStaff();
    return () => {
      isMounted = false;
    };
  }, []);

  const totalDeliveredRevenue = metrics.totalDeliveredRevenue;

  // Category sales breakdown percentages
  const catSales = metrics.categorySales || { men: 0, women: 0, kids: 0 };
  const totalCatSales = (catSales.men || 0) + (catSales.women || 0) + (catSales.kids || 0);

  const menPct = totalCatSales ? Math.round(((catSales.men || 0) / totalCatSales) * 100) : 0;
  const womenPct = totalCatSales ? Math.round(((catSales.women || 0) / totalCatSales) * 100) : 0;
  const kidsPct = totalCatSales ? Math.round(((catSales.kids || 0) / totalCatSales) * 100) : 0;

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
          BẢNG ĐIỀU KHIỂN TỔNG QUAN HỆ THỐNG
        </h1>
        <p style={{ color: "#6B5A4B", fontSize: "14px", margin: 0 }}>
          Số liệu kinh doanh thời gian thực, quản lý phân quyền và kiểm soát vận hành Maison Rue (MS SQL Server).
        </p>
      </div>

      {/* KPI Cards Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
          gap: "20px",
          marginBottom: "30px",
        }}
      >
        {/* Realized Revenue */}
        <div
          style={{
            backgroundColor: "#FFFFFF",
            border: "1px solid #D8CEC1",
            borderRadius: "8px",
            padding: "22px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.03)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", color: "#2E8B57", marginBottom: "8px" }}>
            <span style={{ fontSize: "12px", fontWeight: "600", textTransform: "uppercase" }}>Doanh Thu Thực Thu</span>
            <i className="fas fa-coins" style={{ fontSize: "20px" }}></i>
          </div>
          <div style={{ fontSize: "26px", fontWeight: "700", color: "#2B211C" }}>
            {formatPrice(totalDeliveredRevenue)}
          </div>
          <div style={{ fontSize: "12px", color: "#2E8B57", marginTop: "5px" }}>
            ✓ Từ {metrics.deliveredOrdersCount} đơn đã giao & thanh toán
          </div>
        </div>

        {/* In-Flight Orders Revenue */}
        <div
          style={{
            backgroundColor: "#FFFFFF",
            border: "1px solid #D8CEC1",
            borderRadius: "8px",
            padding: "22px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.03)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", color: "#8A5A36", marginBottom: "8px" }}>
            <span style={{ fontSize: "12px", fontWeight: "600", textTransform: "uppercase" }}>Đang Vận Hành</span>
            <i className="fas fa-clock" style={{ fontSize: "20px" }}></i>
          </div>
          <div style={{ fontSize: "26px", fontWeight: "700", color: "#2B211C" }}>
            {formatPrice(metrics.inFlightRevenue)}
          </div>
          <div style={{ fontSize: "12px", color: "#8A5A36", marginTop: "5px" }}>
            ⏳ {metrics.inFlightOrdersCount} đơn đang xử lý / giao hàng
          </div>
        </div>

        {/* Average Order Value */}
        <div
          style={{
            backgroundColor: "#FFFFFF",
            border: "1px solid #D8CEC1",
            borderRadius: "8px",
            padding: "22px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.03)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", color: "#B89B5E", marginBottom: "8px" }}>
            <span style={{ fontSize: "12px", fontWeight: "600", textTransform: "uppercase" }}>Giá Trị Đơn TB (AOV)</span>
            <i className="fas fa-receipt" style={{ fontSize: "20px" }}></i>
          </div>
          <div style={{ fontSize: "26px", fontWeight: "700", color: "#2B211C" }}>
            {formatPrice(metrics.averageOrderValue)}
          </div>
          <div style={{ fontSize: "12px", color: "#8A7350", marginTop: "5px" }}>
            Đơn hàng trung bình hoàn tất
          </div>
        </div>

        {/* Active Staff Members */}
        <div
          style={{
            backgroundColor: "#FFFFFF",
            border: "1px solid #D8CEC1",
            borderRadius: "8px",
            padding: "22px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.03)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", color: "#4E342E", marginBottom: "8px" }}>
            <span style={{ fontSize: "12px", fontWeight: "600", textTransform: "uppercase" }}>Nhân Viên Vận Hành</span>
            <i className="fas fa-users-cog" style={{ fontSize: "20px" }}></i>
          </div>
          <div style={{ fontSize: "26px", fontWeight: "700", color: "#2B211C" }}>
            {staffStats.active}{" "}
            <span style={{ fontSize: "14px", fontWeight: "400", color: "#8A7350" }}>
              / {staffStats.total} tài khoản
            </span>
          </div>
          <div style={{ fontSize: "12px", color: "#8A7350", marginTop: "5px" }}>
            <Link to="/admin/employees" style={{ color: "#4E342E", textDecoration: "underline" }}>
              Quản lý tài khoản staff →
            </Link>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "25px", marginBottom: "30px" }}>
        {/* Sales Performance by Category Chart */}
        <div
          style={{
            backgroundColor: "#FFFFFF",
            border: "1px solid #D8CEC1",
            borderRadius: "8px",
            padding: "25px",
          }}
        >
          <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "22px", color: "#2B211C", marginTop: 0, marginBottom: "20px" }}>
            Cơ Cấu Doanh Thu Hoàn Tất Theo Danh Mục
          </h2>

          <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13.5px", marginBottom: "6px" }}>
                <span><strong>Bộ sưu tập Nam (Men):</strong> {formatPrice(catSales.men)}</span>
                <span style={{ fontWeight: "600", color: "#4E342E" }}>{menPct}%</span>
              </div>
              <div style={{ height: "10px", backgroundColor: "#F0EAE1", borderRadius: "5px", overflow: "hidden" }}>
                <div style={{ width: `${menPct}%`, height: "100%", backgroundColor: "#4E342E", borderRadius: "5px" }} />
              </div>
            </div>

            <div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13.5px", marginBottom: "6px" }}>
                <span><strong>Bộ sưu tập Nữ (Women):</strong> {formatPrice(catSales.women)}</span>
                <span style={{ fontWeight: "600", color: "#B8860B" }}>{womenPct}%</span>
              </div>
              <div style={{ height: "10px", backgroundColor: "#F0EAE1", borderRadius: "5px", overflow: "hidden" }}>
                <div style={{ width: `${womenPct}%`, height: "100%", backgroundColor: "#B8860B", borderRadius: "5px" }} />
              </div>
            </div>

            <div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13.5px", marginBottom: "6px" }}>
                <span><strong>Trẻ em (Kids):</strong> {formatPrice(catSales.kids)}</span>
                <span style={{ fontWeight: "600", color: "#8A5A36" }}>{kidsPct}%</span>
              </div>
              <div style={{ height: "10px", backgroundColor: "#F0EAE1", borderRadius: "5px", overflow: "hidden" }}>
                <div style={{ width: `${kidsPct}%`, height: "100%", backgroundColor: "#8A5A36", borderRadius: "5px" }} />
              </div>
            </div>
          </div>

          <div
            style={{
              marginTop: "20px",
              paddingTop: "15px",
              borderTop: "1px dashed #E8E1D6",
              fontSize: "12.5px",
              color: "#8A7350",
            }}
          >
            * Chỉ tính các đơn hàng đã đạt trạng thái "Đã giao thành công" (Delivered) và thanh toán đã xác thực (Paid).
          </div>
        </div>

        {/* Order Status Distribution */}
        <div
          style={{
            backgroundColor: "#FFFFFF",
            border: "1px solid #D8CEC1",
            borderRadius: "8px",
            padding: "25px",
          }}
        >
          <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "22px", color: "#2B211C", marginTop: 0, marginBottom: "20px" }}>
            Phân Bổ Trạng Thái Đơn Hàng ({orders.length} Đơn)
          </h2>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            {[
              { id: "pending", label: "Chờ xác nhận" },
              { id: "confirmed", label: "Đã xác nhận" },
              { id: "processing", label: "Đang chuẩn bị" },
              { id: "shipping", label: "Đang giao hàng" },
              { id: "delivered", label: "Giao thành công" },
              { id: "cancelled", label: "Đã hủy" },
            ].map((st) => {
              const count = orders.filter((o) => (o.order_status || o.status) === st.id).length;
              const meta = STATUS_LABELS[st.id] || { color: "#666", bg: "#f5f5f5" };
              return (
                <div
                  key={st.id}
                  style={{
                    backgroundColor: "#FAF6F0",
                    border: `1px solid ${meta.color}30`,
                    borderRadius: "6px",
                    padding: "12px 16px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <div>
                    <span
                      style={{
                        display: "inline-block",
                        width: "8px",
                        height: "8px",
                        borderRadius: "50%",
                        backgroundColor: meta.color,
                        marginRight: "6px",
                      }}
                    />
                    <span style={{ fontSize: "13px", fontWeight: "600", color: "#2B211C" }}>{st.label}</span>
                  </div>
                  <strong style={{ fontSize: "18px", color: meta.color }}>{count}</strong>
                </div>
              );
            })}
          </div>

          <div style={{ marginTop: "25px", display: "flex", gap: "12px" }}>
            <Link
              to="/admin/reports"
              className="btn-primary"
              style={{ flex: 1, textAlign: "center", textDecoration: "none", padding: "12px", fontSize: "13px" }}
            >
              Xem Báo Cáo Doanh Thu Chi Tiết
            </Link>
            <Link
              to="/admin/employees"
              className="btn-secondary"
              style={{ flex: 1, textAlign: "center", textDecoration: "none", padding: "12px", margin: 0, fontSize: "13px" }}
            >
              Quản Lý Đội Ngũ Nhân Viên
            </Link>
          </div>
        </div>
      </div>

      {/* Recent Orders Overview */}
      <div
        style={{
          backgroundColor: "#FFFFFF",
          border: "1px solid #D8CEC1",
          borderRadius: "8px",
          padding: "24px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "22px", margin: 0, color: "#2B211C" }}>
            Đơn Hàng Gần Đây
          </h2>
          <Link to="/admin/orders" style={{ fontSize: "13px", color: "#4E342E", fontWeight: "600", textDecoration: "none" }}>
            Xem toàn bộ {orders.length} đơn →
          </Link>
        </div>

        <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "13px" }}>
          <thead>
            <tr style={{ backgroundColor: "#FAF6F0", borderBottom: "1px solid #D8CEC1" }}>
              <th style={{ padding: "10px 14px", fontWeight: "600" }}>Mã Đơn</th>
              <th style={{ padding: "10px 14px", fontWeight: "600" }}>Khách Hàng</th>
              <th style={{ padding: "10px 14px", fontWeight: "600" }}>Thời Gian</th>
              <th style={{ padding: "10px 14px", fontWeight: "600" }}>Giá Trị</th>
              <th style={{ padding: "10px 14px", fontWeight: "600" }}>Trạng Thái</th>
            </tr>
          </thead>
          <tbody>
            {orders.slice(0, 5).map((o) => {
              const currentStatus = o.order_status || o.status;
              const meta = STATUS_LABELS[currentStatus] || { label: currentStatus, bg: "#eee", color: "#333" };
              return (
                <tr key={o.id} style={{ borderBottom: "1px solid #F0EAE1" }}>
                  <td style={{ padding: "10px 14px", fontWeight: "700" }}>#{o.id}</td>
                  <td style={{ padding: "10px 14px" }}>{o.customer_name || o.customerName}</td>
                  <td style={{ padding: "10px 14px", color: "#8A7350" }}>{formatDate(o.created_at || o.createdAt)}</td>
                  <td style={{ padding: "10px 14px", fontWeight: "600", color: "#B89B5E" }}>{formatPrice(o.total_amount || o.totalAmount)}</td>
                  <td style={{ padding: "10px 14px" }}>
                    <span
                      style={{
                        padding: "3px 10px",
                        borderRadius: "12px",
                        fontSize: "11px",
                        fontWeight: "600",
                        backgroundColor: meta.bg,
                        color: meta.color,
                      }}
                    >
                      {meta.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
