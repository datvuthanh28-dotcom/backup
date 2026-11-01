import { useState } from "react";
import { useStore } from "../../context/StoreContext";
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

export default function AdminReports() {
  useDocumentTitle("Admin - Báo Cáo Doanh Thu");
  const { orders, revenueReport, getBusinessMetrics } = useStore();
  const metrics = getBusinessMetrics();
  const [filterPeriod, setFilterPeriod] = useState("all");

  const getOrderStatus = (o) => o.order_status || o.status;
  const getOrderAmount = (o) => Number(o.total_amount || o.totalAmount || 0);

  // Filter orders by payment and delivery status
  const paidOrders = orders.filter((o) => o.payment?.payment_status === "paid");
  const deliveredOrders = orders.filter((o) => getOrderStatus(o) === "delivered");
  const inFlightOrders = orders.filter((o) =>
    ["pending", "confirmed", "processing", "shipping"].includes(getOrderStatus(o))
  );
  const refundPendingOrders = orders.filter((o) => o.payment?.payment_status === "refund_pending");
  const refundedOrders = orders.filter((o) => o.payment?.payment_status === "refunded");
  const cancelledOrders = orders.filter((o) => getOrderStatus(o) === "cancelled");

  // Verified Actual Collected Revenue strictly from database payment record
  const actualCollected = revenueReport?.actualCollectedRevenue ?? metrics.totalDeliveredRevenue;
  const inFlightAmount = (revenueReport?.pendingVerificationRevenue || 0) + (revenueReport?.unpaidRevenue || 0) || metrics.inFlightRevenue;
  const refundPendingAmount = revenueReport?.refundPendingRevenue ?? (refundPendingOrders.reduce((s, o) => s + getOrderAmount(o), 0));
  const refundedAmount = revenueReport?.refundedRevenue ?? metrics.cancelledAmount;
  const grossCommittedSales = actualCollected + inFlightAmount;

  // Top products from backend report or fallback
  const topProducts =
    revenueReport?.topSellingProducts && revenueReport.topSellingProducts.length > 0
      ? revenueReport.topSellingProducts
      : metrics.topSellingProducts;

  // CSV Export Function
  const exportCSV = () => {
    const headers = ["Order ID", "Customer Name", "Customer Email", "Date", "Order Status", "Payment Method", "Payment Status", "Total (VND)"];
    const rows = orders.map((o) => [
      `"${o.id}"`,
      `"${o.customer_name || o.customerName || "Khách vãng lai"}"`,
      `"${o.customer_email || o.customerEmail || ""}"`,
      `"${new Date(o.created_at || o.createdAt).toLocaleDateString("vi-VN")}"`,
      `"${getOrderStatus(o)}"`,
      `"${o.payment?.payment_method || o.payment_method || o.paymentMethod || "COD"}"`,
      `"${o.payment?.payment_status || "unpaid"}"`,
      getOrderAmount(o),
    ]);

    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `maison_rue_revenue_audit_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div>
      <div
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
              fontSize: "32px",
              color: "#2B211C",
              margin: "0 0 6px",
            }}
          >
            BÁO CÁO TÀI CHÍNH & DOANH THU THỰC TẾ
          </h1>
          <p style={{ color: "#6B5A4B", fontSize: "14px", margin: 0 }}>
            Dữ liệu kiểm toán doanh số chính xác theo trạng thái thanh toán đã xác thực (MaisonRueDB).
          </p>
        </div>

        <div style={{ display: "flex", gap: "10px" }}>
          <select
            value={filterPeriod}
            onChange={(e) => setFilterPeriod(e.target.value)}
            style={{
              padding: "10px 14px",
              borderRadius: "4px",
              border: "1px solid #D8CEC1",
              backgroundColor: "#FFF",
              fontSize: "13px",
              outline: "none",
            }}
          >
            <option value="all">Tất cả thời gian</option>
            <option value="this_month">Tháng hiện tại</option>
            <option value="this_quarter">Quý hiện tại</option>
          </select>

          <button
            onClick={exportCSV}
            className="btn-primary"
            style={{ padding: "10px 18px", fontSize: "13px", display: "flex", alignItems: "center", gap: "8px" }}
          >
            <i className="fas fa-file-export"></i> Xuất Báo Cáo CSV
          </button>
        </div>
      </div>

      {/* Financial Health Summary Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: "20px",
          marginBottom: "30px",
        }}
      >
        <div
          style={{
            backgroundColor: "#FFFFFF",
            border: "1px solid #D8CEC1",
            borderRadius: "8px",
            padding: "22px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.03)",
          }}
        >
          <div style={{ fontSize: "12px", fontWeight: "600", textTransform: "uppercase", color: "#2E8B57", marginBottom: "8px" }}>
            Doanh Thu Đã Thực Nhận (Verified Paid)
          </div>
          <div style={{ fontSize: "28px", fontWeight: "700", color: "#2E8B57" }}>
            {formatPrice(actualCollected)}
          </div>
          <div style={{ fontSize: "12px", color: "#6B5A4B", marginTop: "5px" }}>
            Từ {paidOrders.length} đơn có xác nhận thanh toán thực tế
          </div>
        </div>

        <div
          style={{
            backgroundColor: "#FFFFFF",
            border: "1px solid #D8CEC1",
            borderRadius: "8px",
            padding: "22px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.03)",
          }}
        >
          <div style={{ fontSize: "12px", fontWeight: "600", textTransform: "uppercase", color: "#8A5A36", marginBottom: "8px" }}>
            Doanh Thu Đang Lưu Thông / Chờ Thu
          </div>
          <div style={{ fontSize: "28px", fontWeight: "700", color: "#8A5A36" }}>
            {formatPrice(inFlightAmount)}
          </div>
          <div style={{ fontSize: "12px", color: "#6B5A4B", marginTop: "5px" }}>
            Gồm {inFlightOrders.length} đơn chờ xác nhận, chuẩn bị & đang giao
          </div>
        </div>

        <div
          style={{
            backgroundColor: "#FFFFFF",
            border: "1px solid #D8CEC1",
            borderRadius: "8px",
            padding: "22px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.03)",
          }}
        >
          <div style={{ fontSize: "12px", fontWeight: "600", textTransform: "uppercase", color: "#E67E22", marginBottom: "8px" }}>
            Khoản Chờ Hoàn Tiền (Refund Pending)
          </div>
          <div style={{ fontSize: "28px", fontWeight: "700", color: "#E67E22" }}>
            {formatPrice(refundPendingAmount)}
          </div>
          <div style={{ fontSize: "12px", color: "#6B5A4B", marginTop: "5px" }}>
            {refundPendingOrders.length} đơn đã hủy cần phòng tài vụ hoàn tiền
          </div>
        </div>

        <div
          style={{
            backgroundColor: "#FFFFFF",
            border: "1px solid #D8CEC1",
            borderRadius: "8px",
            padding: "22px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.03)",
          }}
        >
          <div style={{ fontSize: "12px", fontWeight: "600", textTransform: "uppercase", color: "#7B1FA2", marginBottom: "8px" }}>
            Giá Trị Đã Hoàn Trả Khách Hàng
          </div>
          <div style={{ fontSize: "28px", fontWeight: "700", color: "#7B1FA2" }}>
            {formatPrice(refundedAmount)}
          </div>
          <div style={{ fontSize: "12px", color: "#6B5A4B", marginTop: "5px" }}>
            {refundedOrders.length} đơn đã hoàn tất thủ tục hoàn tiền
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "25px", marginBottom: "30px" }}>
        {/* Top Performing Products in Realized Sales */}
        <div
          style={{
            backgroundColor: "#FFFFFF",
            border: "1px solid #D8CEC1",
            borderRadius: "8px",
            padding: "25px",
          }}
        >
          <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "22px", color: "#2B211C", marginTop: 0, marginBottom: "16px" }}>
            Sản Phẩm Đóng Góp Doanh Thu Cao Nhất
          </h2>

          {(!topProducts || topProducts.length === 0) ? (
            <div style={{ padding: "30px 0", textAlign: "center", color: "#6B5A4B", fontSize: "13.5px" }}>
              Chưa có dữ liệu từ các đơn hàng giao thành công.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {topProducts.slice(0, 5).map((p, idx) => (
                <div
                  key={idx}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "10px 14px",
                    backgroundColor: "#FAF6F0",
                    borderRadius: "6px",
                    border: "1px solid #E8E1D6",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <div
                      style={{
                        width: "24px",
                        height: "24px",
                        borderRadius: "50%",
                        backgroundColor: idx === 0 ? "#B89B5E" : "#4E342E",
                        color: "#FFF",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "11px",
                        fontWeight: "700",
                      }}
                    >
                      {idx + 1}
                    </div>
                    {(p.image_url || p.image) && (
                      <img
                        src={`/${p.image_url || p.image}`}
                        alt={p.name}
                        style={{ width: "36px", height: "36px", objectFit: "cover", borderRadius: "4px" }}
                      />
                    )}
                    <div>
                      <strong style={{ color: "#2B211C", fontSize: "13.5px" }}>{p.name}</strong>
                      <div style={{ fontSize: "12px", color: "#8A7350" }}>
                        Đã giao: {p.total_quantity || p.quantity || 0} sản phẩm
                      </div>
                    </div>
                  </div>

                  <strong style={{ color: "#B89B5E", fontSize: "14px" }}>
                    {formatPrice(p.total_revenue || p.revenue)}
                  </strong>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Audit Compliance & Consistency Note */}
        <div
          style={{
            backgroundColor: "#FFFFFF",
            border: "1px solid #D8CEC1",
            borderRadius: "8px",
            padding: "25px",
          }}
        >
          <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "22px", color: "#2B211C", marginTop: 0, marginBottom: "16px" }}>
            Nguyên Tắc Hạch Toán & Kiểm Toán RBAC
          </h2>

          <div style={{ display: "flex", flexDirection: "column", gap: "14px", fontSize: "13.5px", color: "#5E5147", lineHeight: "1.6" }}>
            <div style={{ display: "flex", gap: "10px" }}>
              <i className="fas fa-check-circle" style={{ color: "#2E8B57", marginTop: "3px" }}></i>
              <div>
                <strong>Chống trùng lặp (Anti Double-Counting):</strong> Doanh thu chỉ được ghi nhận một lần duy nhất khi đơn hàng chuyển sang <em>"Delivered" (Đã giao thành công)</em> và bản ghi <em>Payments.payment_status = 'paid'</em>.
              </div>
            </div>

            <div style={{ display: "flex", gap: "10px" }}>
              <i className="fas fa-check-circle" style={{ color: "#2E8B57", marginTop: "3px" }}></i>
              <div>
                <strong>Tách bạch dòng tiền (In-flight Isolation):</strong> Các đơn hàng ở trạng thái Pending, Confirmed, Processing, Shipping được hạch toán riêng vào nhóm <em>Doanh thu đang lưu thông</em>, không ghi nhận sớm vào doanh thu thực tế.
              </div>
            </div>

            <div style={{ display: "flex", gap: "10px" }}>
              <i className="fas fa-check-circle" style={{ color: "#2E8B57", marginTop: "3px" }}></i>
              <div>
                <strong>Hoàn kho khi hủy đơn (Stock Restoration Policy):</strong> Mọi đơn hàng bị hủy bỏ đều tự động khấu trừ khỏi doanh thu, cập nhật <em>payment_status = 'refunded'</em> và kích hoạt SQL Transaction hoàn trả toàn bộ số lượng sản phẩm về kho tồn.
              </div>
            </div>

            <div style={{ display: "flex", gap: "10px" }}>
              <i className="fas fa-check-circle" style={{ color: "#2E8B57", marginTop: "3px" }}></i>
              <div>
                <strong>Phân quyền truy cập nghiêm ngặt:</strong> Báo cáo doanh thu chỉ khả dụng cho Quản trị viên (Admin). Nhân viên (Staff) và Khách hàng (Customer) bị chặn hoàn toàn khỏi màn hình này.
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Delivered Orders Audit Log Table */}
      <div
        style={{
          backgroundColor: "#FFFFFF",
          border: "1px solid #D8CEC1",
          borderRadius: "8px",
          padding: "24px",
        }}
      >
        <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "22px", color: "#2B211C", marginTop: 0, marginBottom: "16px" }}>
          Sổ Nhật Ký Các Đơn Hàng Đã Ghi Nhận Doanh Thu ({deliveredOrders.length} Đơn)
        </h2>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "13px" }}>
            <thead>
              <tr style={{ backgroundColor: "#FAF6F0", borderBottom: "1px solid #D8CEC1", color: "#4E342E" }}>
                <th style={{ padding: "12px 16px", fontWeight: "600" }}>Mã Đơn</th>
                <th style={{ padding: "12px 16px", fontWeight: "600" }}>Khách Hàng</th>
                <th style={{ padding: "12px 16px", fontWeight: "600" }}>Ngày Đặt</th>
                <th style={{ padding: "12px 16px", fontWeight: "600" }}>Phương Thức</th>
                <th style={{ padding: "12px 16px", fontWeight: "600" }}>Chi Tiết Món</th>
                <th style={{ padding: "12px 16px", fontWeight: "600", textAlign: "right" }}>Doanh Thu Ghi Nhận</th>
              </tr>
            </thead>
            <tbody>
              {deliveredOrders.length === 0 ? (
                <tr>
                  <td colSpan="6" style={{ padding: "30px", textAlign: "center", color: "#6B5A4B" }}>
                    Chưa có đơn hàng nào đạt trạng thái giao thành công và thanh toán.
                  </td>
                </tr>
              ) : (
                deliveredOrders.map((o) => (
                  <tr key={o.id} style={{ borderBottom: "1px solid #F0EAE1" }}>
                    <td style={{ padding: "12px 16px", fontWeight: "700" }}>#{o.id}</td>
                    <td style={{ padding: "12px 16px" }}>
                      <div>{o.customer_name || o.customerName}</div>
                      <div style={{ fontSize: "11px", color: "#8A7350" }}>{o.customer_email || o.customerEmail}</div>
                    </td>
                    <td style={{ padding: "12px 16px", color: "#6B5A4B" }}>{formatDate(o.created_at || o.createdAt)}</td>
                    <td style={{ padding: "12px 16px" }}>
                      {(o.payment?.payment_method || o.payment_method || o.paymentMethod) === "cod" ? "COD" : "Bank Transfer"}
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      {(o.items || []).map((it) => `${it.product_name || it.name} (${it.selected_color || it.selectedColor || "Tiêu chuẩn"}) ×${it.quantity}`).join(", ")}
                    </td>
                    <td style={{ padding: "12px 16px", textAlign: "right", fontWeight: "700", color: "#2E8B57" }}>
                      +{formatPrice(getOrderAmount(o))}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
