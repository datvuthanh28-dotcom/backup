import { Link } from "react-router-dom";
import { useStore, STATUS_LABELS } from "../../context/StoreContext";
import { allProducts } from "../../data/products";
import useDocumentTitle from "../../hooks/useDocumentTitle";

const formatPrice = (value) => `${Number(value || 0).toLocaleString("vi-VN")}đ`;
const getStatus = (order) => order.order_status || order.status;
const formatDate = (value) => value ? new Date(value).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric" }) : "";
const getAge = (order) => Math.max(0, Math.floor((Date.now() - new Date(order.created_at || order.createdAt).getTime()) / 3600000)) || 0;
const variantSummary = (product) => {
  const variants = Array.isArray(product.variants) ? product.variants : [];
  return {
    out: variants.filter((variant) => Number(variant.stock) === 0).length,
    low: variants.filter((variant) => {
      const stock = Number(variant.stock);
      const threshold = Number(variant.lowStockThreshold ?? variant.low_stock_threshold ?? 3);
      return stock > 0 && stock <= threshold;
    }).length,
    over: variants.filter((variant) => {
      const stock = Number(variant.stock);
      const threshold = Number(variant.maxStockThreshold ?? variant.max_stock_threshold ?? 20);
      return stock >= threshold;
    }).length,
  };
};

const cardStyle = { display: "block", backgroundColor: "#FFF", border: "1px solid #D8CEC1", borderRadius: 8, padding: 20, textDecoration: "none", boxShadow: "0 2px 8px rgba(0,0,0,.02)" };

export default function StaffDashboard() {
  useDocumentTitle("Staff Portal - Tổng Quan Vận Hành");
  const { orders, getProductStock, products } = useStore();
  const productList = products?.length ? products : allProducts;
  const byStatus = (status) => orders.filter((order) => getStatus(order) === status);
  const pending = byStatus("pending");
  const confirmed = byStatus("confirmed");
  const processing = byStatus("processing");
  const shipping = byStatus("shipping");
  const outOfStock = productList.filter((product) => getProductStock(product.id) === 0 || variantSummary(product).out > 0);
  const lowStock = productList.filter((product) => {
    const summary = variantSummary(product);
    return !outOfStock.includes(product) && summary.low > 0;
  });
  const overStock = productList.filter((product) => {
    const summary = variantSummary(product);
    return !outOfStock.includes(product) && !lowStock.includes(product) && summary.over > 0;
  });
  const workQueue = [...pending, ...confirmed, ...processing, ...shipping].sort((a, b) => new Date(a.created_at || a.createdAt) - new Date(b.created_at || b.createdAt));
  const metrics = [
    ["pending", "Chờ xác nhận", pending.length, "#B8860B", "fa-clock"],
    ["confirmed", "Đã xác nhận", confirmed.length, "#1E6FA8", "fa-check-double"],
    ["processing", "Đang chuẩn bị", processing.length, "#7B4FA3", "fa-box-open"],
    ["shipping", "Đang vận chuyển", shipping.length, "#C05A22", "fa-shipping-fast"],
  ];

  return <div className="staff-dashboard-page">
    <div style={{ marginBottom: 25 }}>
      <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 32, color: "#2B211C", margin: 0 }}>TỔNG QUAN VẬN HÀNH</h1>
    </div>

    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 28 }}>
      {metrics.map(([status, label, count, color, icon]) => <Link key={status} to={`/staff/orders?status=${status}`} style={cardStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", color, marginBottom: 8 }}><span style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase" }}>{label}</span><i className={`fas ${icon}`} /></div>
        <div style={{ fontSize: 32, fontWeight: 700, color: "#2B211C" }}>{count}</div>
      </Link>)}
      <Link to="/staff/inventory?stock=attention" style={{ ...cardStyle, backgroundColor: "#FFF8F0", borderColor: "#F0CFAD" }}>
        <div style={{ display: "flex", justifyContent: "space-between", color: "#C05621", marginBottom: 8 }}><span style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase" }}>Cảnh báo kho</span><i className="fas fa-exclamation-triangle" /></div>
        <div style={{ fontSize: 32, fontWeight: 700, color: "#C05621" }}>{outOfStock.length + lowStock.length + overStock.length}</div>
        <div style={{ fontSize: 12, color: "#9C4221", marginTop: 4 }}>{outOfStock.length + lowStock.length + overStock.length} sản phẩm cần xử lý kho →</div>
      </Link>
    </div>

    <div className="staff-dashboard-content" style={{ display: "grid", gridTemplateColumns: "minmax(0,1.5fr) minmax(280px,1fr)", gap: 22 }}>
      <section className="staff-dashboard-panel" style={{ background: "#FFF", border: "1px solid #D8CEC1", borderRadius: 8, padding: 22 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #E8E1D6", paddingBottom: 12, marginBottom: 12 }}>
          <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 23, margin: 0 }}>Ưu Tiên Xử Lý</h2>
          <Link to="/staff/orders" style={{ color: "#4E342E", fontSize: 13, fontWeight: 700, textDecoration: "none" }}>Tất cả đơn →</Link>
        </div>
        {workQueue.length === 0 ? <div style={{ padding: 28, textAlign: "center", color: "#2E8B57" }}><i className="fas fa-circle-check" aria-hidden="true" /> Hiện không có đơn cần xử lý.</div> : workQueue.slice(0, 7).map((order) => {
          const status = getStatus(order); const meta = STATUS_LABELS[status] || { label: status, color: "#555", bg: "#EEE" }; const age = getAge(order);
          return <Link to={`/staff/orders?status=${status}&order=${encodeURIComponent(order.id)}`} key={order.id} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "center", padding: "12px 2px", borderBottom: "1px solid #F0EAE1", color: "inherit", textDecoration: "none", cursor: "pointer" }}>
            <div><div style={{ fontWeight: 700, color: "#2B211C", fontSize: 13.5 }}>#{order.id} · {order.customer_name || order.customerName}</div><div style={{ fontSize: 12, color: "#6B5A4B" }}>{formatPrice(order.total_amount || order.totalAmount)} · {formatDate(order.created_at || order.createdAt)}</div><div style={{ fontSize: 11.5, color: age >= 24 ? "#C0392B" : "#8A7350", marginTop: 3 }}>{age >= 24 ? `Ưu tiên cao · đã chờ ${age} giờ` : `Đã chờ ${age} giờ`}</div></div>
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}><span style={{ fontSize: 11, padding: "4px 9px", borderRadius: 12, color: meta.color, background: meta.bg, fontWeight: 700 }}>{meta.label}</span><span style={{ background: "#2B211C", color: "#FFF", padding: "7px 11px", borderRadius: 5, fontSize: 12, fontWeight: 700 }}>Mở đơn</span></div>
          </Link>;
        })}
      </section>

      <section className="staff-dashboard-panel" style={{ background: "#FFF", border: "1px solid #D8CEC1", borderRadius: 8, padding: 22 }}>
        <div style={{ borderBottom: "1px solid #E8E1D6", paddingBottom: 12, marginBottom: 12 }}><h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 23, margin: 0 }}>Kho Cần Chú Ý</h2></div>
        {[...outOfStock, ...lowStock, ...overStock].slice(0, 7).map((product) => { const stock = getProductStock(product.id); const summary = variantSummary(product); const label = summary.out > 0 || stock === 0 ? "Hết hàng" : summary.low > 0 ? "Sắp hết" : "Vượt mức tồn"; const color = label === "Hết hàng" ? "#A94442" : label === "Sắp hết" ? "#9B691E" : "#2C6BA0"; const stockFilter = label === "Hết hàng" ? "out_of_stock" : label === "Sắp hết" ? "low_stock" : "overstock"; return <Link to={`/staff/inventory?stock=${stockFilter}&search=${encodeURIComponent(product.name)}`} key={product.id} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 12, padding: "10px 0", borderBottom: "1px solid #F0EAE1", color: "inherit", textDecoration: "none", fontSize: 12.5, cursor: "pointer" }}><span>{product.name}</span><strong style={{ color, textAlign: "right" }}>{label}</strong></Link>; })}
        <Link to="/staff/inventory?stock=attention" style={{ display: "block", marginTop: 16, color: "#4E342E", fontSize: 13, fontWeight: 700, textDecoration: "none" }}>Mở quản lý tồn kho →</Link>
      </section>
    </div>
  </div>;
}
