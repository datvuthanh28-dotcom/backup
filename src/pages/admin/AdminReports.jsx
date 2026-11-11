import { useEffect, useMemo, useState } from "react";
import { useStore } from "../../context/StoreContext";
import useDocumentTitle from "../../hooks/useDocumentTitle";
import { reportAPI } from "../../services/api";

const PERIODS = [["all", "Toàn bộ thời gian"], ["last_7_days", "7 ngày gần nhất"], ["this_month", "Tháng này"], ["last_month", "Tháng trước"], ["this_quarter", "Quý này"], ["this_year", "Năm nay"], ["custom", "Tùy chọn ngày"]];
const TABS = [["overview", "Tổng quan"], ["products", "Sản phẩm & SKU"], ["customers", "Khách hàng"], ["promotions", "Khuyến mãi"], ["audit", "Đối soát"]];
const money = (value) => `${Number(value || 0).toLocaleString("vi-VN")}đ`;
const formatNumber = (value) => Number(value || 0).toLocaleString("vi-VN");
const dateTime = (value) => value ? new Date(value).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
const percent = (value) => value == null ? "Chưa có kỳ so sánh" : `${value >= 0 ? "+" : ""}${value.toFixed(1)}% so với kỳ trước`;

function MetricCard({ label, value, note, change, tone = "neutral" }) {
  return <article className={`revenue-metric revenue-metric--${tone}`}><span>{label}</span><strong>{value}</strong><small>{change !== undefined ? percent(change) : note}</small></article>;
}
function EmptyState({ children }) { return <div className="revenue-empty">{children}</div>; }

export default function AdminReports() {
  useDocumentTitle("Admin - Báo cáo doanh thu");
  const { revenueReport, refreshRevenueReport } = useStore();
  const [period, setPeriod] = useState("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [tab, setTab] = useState("overview");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [auditPage, setAuditPage] = useState(1);
  const [targetEditor, setTargetEditor] = useState(false);
  const [targetForm, setTargetForm] = useState({ revenue: "", profit: "", note: "" });
  const [savingTarget, setSavingTarget] = useState(false);
  const auditPageSize = 8;

  useEffect(() => {
    if (period === "custom" && (!customFrom || !customTo)) return;
    let active = true;
    setLoading(true); setError(""); setAuditPage(1);
    refreshRevenueReport({ period, from: customFrom, to: customTo })
      .then(() => active && setLoading(false))
      .catch((err) => { if (active) { setError(err.message); setLoading(false); } });
    return () => { active = false; };
  }, [period, customFrom, customTo, refreshRevenueReport]);

  const report = revenueReport || {};
  const comparison = report.comparison || {};
  const totalDiscount = Number(report.productDiscountTotal || 0) + Number(report.codeDiscountTotal || 0) + Number(report.shippingDiscountTotal || 0);
  const waterfall = [["GMV đơn được tạo", report.grossMerchandiseValue, "base"], ["Giảm giá đã ghi nhận", -totalDiscount, "negative"], ["Phí giao hàng", report.shippingRevenue, "positive"], ["Doanh thu ghi nhận", report.recognizedRevenue, "result"], ["Hoàn tiền trong kỳ", -Number(report.refundedRevenue || 0), "negative"], ["Doanh thu thuần", report.netRevenue, "result"]];
  const waterfallMax = Math.max(1, ...waterfall.map(([, value]) => Math.abs(Number(value || 0))));
  const trendMax = Math.max(1, ...(report.trend || []).map((entry) => Math.max(entry.revenue, entry.cost, entry.grossProfit, entry.refunds)));
  const auditOrders = report.auditOrders || [];
  const auditPages = Math.max(1, Math.ceil(auditOrders.length / auditPageSize));
  const visibleAudit = auditOrders.slice((auditPage - 1) * auditPageSize, auditPage * auditPageSize);
  const categoryRows = useMemo(() => Object.entries(report.categorySales || {}).filter(([, value]) => value > 0), [report.categorySales]);
  const orderStatuses = Object.entries(report.ordersByStatus || {}).map(([status, count]) => ({ status, count, label: { pending: "Chờ xác nhận", confirmed: "Đã xác nhận", processing: "Đang chuẩn bị", shipping: "Đang giao", delivered: "Đã giao", cancelled: "Đã hủy" }[status] || status }));
  const maxStatus = Math.max(1, ...orderStatuses.map((item) => item.count));
  const maxPayment = Math.max(1, ...(report.paymentMethods || []).map((item) => item.amount));
  const target = report.target;
  const targetProgress = target?.target_revenue ? Math.min(100, Number(report.netRevenue || 0) / Number(target.target_revenue) * 100) : 0;

  const openTargetEditor = () => {
    setTargetForm({ revenue: target?.target_revenue || "", profit: target?.target_gross_profit || "", note: target?.note || "" });
    setTargetEditor(true);
  };
  const saveTarget = async (event) => {
    event.preventDefault(); setSavingTarget(true); setError("");
    try {
      await reportAPI.updateRevenueTarget({ period, from: customFrom, to: customTo, periodLabel: PERIODS.find(([value]) => value === period)?.[1], targetRevenue: targetForm.revenue, targetGrossProfit: targetForm.profit, note: targetForm.note });
      await refreshRevenueReport({ period, from: customFrom, to: customTo }); setTargetEditor(false);
    } catch (saveError) { setError(saveError.message); }
    finally { setSavingTarget(false); }
  };

  const exportCSV = () => {
    const headers = ["Mã đơn", "Khách hàng", "Ngày đặt", "Ngày thanh toán", "Ngày giao", "Ngày ghi nhận", "Tiền hàng gốc", "Giảm giá", "Phí giao", "Doanh thu ghi nhận", "Phương thức", "Mã giao dịch"];
    const escape = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const rows = auditOrders.map((order) => [order.id, order.customer_name, dateTime(order.created_at), dateTime(order.verified_at), dateTime(order.delivered_at), dateTime(order.recognized_at), order.original_subtotal, order.discounts, order.shipping_fee, order.total_amount, order.payment_method, order.transaction_reference].map(escape));
    const csv = `\uFEFF${[headers.map(escape), ...rows].map((row) => row.join(",")).join("\n")}`;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = `maison-rue-doi-soat-${new Date().toISOString().slice(0, 10)}.csv`; link.click(); URL.revokeObjectURL(url);
  };

  return <main className="revenue-report">
    <header className="revenue-header">
      <div><p>BÁO CÁO QUẢN TRỊ</p><h1>Doanh thu & hiệu quả kinh doanh</h1><span>Tiền thu, doanh thu ghi nhận và hoàn tiền được đối soát theo các mốc thời gian độc lập.</span></div>
      <div className="revenue-filters">
        <label>Khoảng báo cáo<select value={period} onChange={(event) => setPeriod(event.target.value)}>{PERIODS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        {period === "custom" && <><label>Từ ngày<input type="date" value={customFrom} onChange={(event) => setCustomFrom(event.target.value)} /></label><label>Đến ngày<input type="date" min={customFrom} value={customTo} onChange={(event) => setCustomTo(event.target.value)} /></label></>}
        <button type="button" onClick={openTargetEditor}>Đặt mục tiêu</button><button type="button" onClick={exportCSV} disabled={!auditOrders.length}>Xuất đối soát CSV</button>
      </div>
    </header>
    {error && <div className="revenue-alert revenue-alert--error">{error}</div>}
    {loading && <div className="revenue-loading">Đang đối soát dữ liệu…</div>}
    {!loading && <>
      <section className="revenue-metrics">
        <MetricCard label="Doanh thu ghi nhận" value={money(report.recognizedRevenue)} change={comparison.recognizedRevenue} tone="green" />
        <MetricCard label="Tiền đã thu" value={money(report.actualCollectedRevenue)} note={`${report.paidOrdersCount || 0} giao dịch được xác nhận`} tone="blue" />
        <MetricCard label="Doanh thu thuần" value={money(report.netRevenue)} change={comparison.netRevenue} tone="gold" />
        <MetricCard label="Chờ thu / xác minh" value={money(Number(report.unpaidRevenue || 0) + Number(report.pendingVerificationRevenue || 0))} note="Chưa tính vào doanh thu ghi nhận" tone="amber" />
        <MetricCard label="Hoàn tiền trong kỳ" value={money(report.refundedRevenue)} note={`${report.refundedOrdersCount || 0} giao dịch · ${Number(report.refundRate || 0).toFixed(1)}% doanh thu`} tone="red" />
        <MetricCard label="Giá trị đơn trung bình" value={money(report.averageOrderValue)} change={comparison.averageOrderValue} />
        <MetricCard label="Giá vốn hàng bán" value={report.grossProfit == null ? "Chưa đủ dữ liệu" : money(report.costOfGoodsSold)} note={`Độ phủ giá vốn ${Number(report.costCoverage || 0).toFixed(0)}%`} />
        <MetricCard label="Lợi nhuận gộp" value={report.grossProfit == null ? "Chưa thể xác định" : money(report.grossProfit)} note={report.grossProfit == null ? "Cần khai báo giá vốn cho toàn bộ SKU" : `Biên lợi nhuận ${report.grossMargin.toFixed(1)}%`} tone="purple" />
        <MetricCard label="Đơn hàng được tạo" value={formatNumber(report.totalOrders)} change={comparison.totalOrders} note="Theo ngày tạo đơn" />
        <MetricCard label="Sản phẩm đã bán" value={formatNumber(report.unitsSold)} change={comparison.unitsSold} note={`${Number(report.averageItemsPerOrder || 0).toFixed(1)} sản phẩm/đơn`} />
        <MetricCard label="Tỷ lệ hủy đơn" value={`${Number(report.cancellationRate || 0).toFixed(1)}%`} note={`${report.cancelledOrdersCount || 0} đơn · ${money(report.cancelledRevenue)} chưa thành doanh thu${comparison.cancellationRate != null ? ` · ${comparison.cancellationRate >= 0 ? "+" : ""}${comparison.cancellationRate.toFixed(1)} điểm % so kỳ trước` : ""}`} tone="red" />
        <MetricCard label="Tỷ lệ ưu đãi" value={`${Number(report.discountRate || 0).toFixed(1)}%`} note={`${money(report.totalDiscount)} chi phí ưu đãi`} tone="amber" />
      </section>
      {Number(report.costCoverage || 0) < 100 && <div className="revenue-alert">Lợi nhuận chưa được công bố vì mới có {Number(report.costCoverage || 0).toFixed(0)}% dòng bán hàng có giá vốn snapshot. Doanh thu vẫn được đối soát bình thường.</div>}
      {Number(report.dataOriginBreakdown?.simulated?.orders || 0) > 0 && <div className="revenue-alert">Báo cáo đang bao gồm <strong>{report.dataOriginBreakdown.simulated.orders} đơn mô phỏng</strong> ({money(report.dataOriginBreakdown.simulated.revenue)}) để kiểm thử phân tích 3 tháng. Doanh thu từ đơn thực tế: <strong>{money(report.dataOriginBreakdown.actual.revenue)}</strong>.</div>}
      <nav className="revenue-tabs" aria-label="Nhóm báo cáo">{TABS.map(([value, label]) => <button key={value} className={tab === value ? "active" : ""} onClick={() => setTab(value)}>{label}</button>)}</nav>

      {tab === "overview" && <div className="revenue-grid">
        {target && <section className="revenue-panel revenue-target-panel"><div className="revenue-panel__title"><div><h2>Tiến độ mục tiêu</h2><p>{target.period_label || "Mục tiêu kỳ đang xem"}</p></div><strong>{targetProgress.toFixed(1)}%</strong></div><div className="revenue-target-track"><i style={{ width: `${targetProgress}%` }} /></div><p>Đã đạt <strong>{money(report.netRevenue)}</strong> trên mục tiêu <strong>{money(target.target_revenue)}</strong>. Còn thiếu <strong>{money(Math.max(0, Number(target.target_revenue) - Number(report.netRevenue || 0)))}</strong>.</p>{Number(target.target_gross_profit || 0) > 0 && <p>Lợi nhuận gộp: <strong>{money(report.grossProfit)}</strong> / {money(target.target_gross_profit)}.</p>}</section>}
        <section className="revenue-panel revenue-panel--wide"><div className="revenue-panel__title"><div><h2>Diễn giải dòng doanh thu</h2><p>Từ giá trị đặt hàng đến doanh thu thuần trong kỳ.</p></div></div><div className="revenue-waterfall">{waterfall.map(([label, value, tone]) => <div className="revenue-waterfall__row" key={label}><span>{label}</span><div><i className={`tone-${tone}`} style={{ width: `${Math.max(2, Math.abs(Number(value || 0)) / waterfallMax * 100)}%` }} /></div><strong className={value < 0 ? "negative" : ""}>{value < 0 ? "−" : ""}{money(Math.abs(Number(value || 0)))}</strong></div>)}</div></section>
        <section className="revenue-panel"><div className="revenue-panel__title"><div><h2>Doanh thu – giá vốn – lợi nhuận</h2><p>So sánh chất lượng doanh thu theo ngày.</p></div></div>{(report.trend || []).length ? <><div className="revenue-chart-legend"><span className="revenue">Doanh thu</span><span className="cost">Giá vốn</span><span className="profit">Lợi nhuận gộp</span></div><div className="revenue-trend revenue-trend--profit">{report.trend.map((entry) => <div key={entry.date} title={`${entry.date}: Doanh thu ${money(entry.revenue)} · Giá vốn ${money(entry.cost)} · Lãi gộp ${money(entry.grossProfit)}`}><div className="revenue-trend__bars"><i style={{ height: `${entry.revenue / trendMax * 100}%` }} /><b style={{ height: `${entry.cost / trendMax * 100}%` }} /><em style={{ height: `${Math.max(0, entry.grossProfit) / trendMax * 100}%` }} /></div><span>{new Date(`${entry.date}T00:00:00`).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" })}</span></div>)}</div></> : <EmptyState>Chưa có doanh thu ghi nhận trong khoảng này.</EmptyState>}</section>
        <section className="revenue-panel"><div className="revenue-panel__title"><div><h2>Cơ cấu doanh thu</h2><p>Doanh thu theo nhóm sản phẩm.</p></div></div>{categoryRows.length ? <div className="revenue-category">{categoryRows.map(([key, value]) => <div key={key}><span>{{ men: "Nam", women: "Nữ", kids: "Trẻ em", unknown: "Chưa phân loại" }[key] || key}</span><strong>{money(value)}</strong><i style={{ width: `${value / Math.max(...categoryRows.map(([, amount]) => amount)) * 100}%` }} /></div>)}</div> : <EmptyState>Chưa có dữ liệu phân loại.</EmptyState>}</section>
        <section className="revenue-panel"><div className="revenue-panel__title"><div><h2>Chất lượng đơn hàng</h2><p>Trạng thái của đơn được tạo trong kỳ.</p></div><strong>{Number(report.deliverySuccessRate || 0).toFixed(1)}% giao thành công</strong></div><div className="revenue-status-list">{orderStatuses.map((item) => <div key={item.status}><span>{item.label}</span><i><b className={`status-${item.status}`} style={{ width: `${item.count / maxStatus * 100}%` }} /></i><strong>{item.count}</strong></div>)}</div></section>
        <section className="revenue-panel"><div className="revenue-panel__title"><div><h2>Dòng tiền theo thanh toán</h2><p>Chỉ tính giao dịch đã xác minh trong kỳ.</p></div></div><div className="revenue-payment-list">{(report.paymentMethods || []).map((item) => <div key={item.method}><span>{{ cod: "COD", bank_transfer: "Chuyển khoản", credit_card: "Thẻ" }[item.method] || item.method}</span><i><b style={{ width: `${item.amount / maxPayment * 100}%` }} /></i><strong>{money(item.amount)}<small>{item.orders} giao dịch</small></strong></div>)}</div><div className="revenue-aging"><strong>{report.paymentAging?.totalOrders || 0} khoản chưa hoàn tất</strong><span>{money(report.paymentAging?.totalAmount)} · {report.paymentAging?.over24Hours || 0} khoản trên 24 giờ</span></div></section>
      </div>}

      {tab === "products" && <section className="revenue-panel"><div className="revenue-panel__title"><div><h2>Hiệu quả theo SKU</h2><p>Doanh thu, lợi nhuận và khả năng luân chuyển tồn kho.</p></div></div>{(report.topSellingProducts || []).length ? <div className="revenue-table-wrap"><table className="revenue-table"><thead><tr><th>SKU / Sản phẩm</th><th>Đã bán</th><th>Tồn kho</th><th>Doanh thu</th><th>Lợi nhuận gộp</th><th>Biên gộp</th><th>Tỷ lệ bán</th><th>Ngày tồn dự kiến</th></tr></thead><tbody>{report.topSellingProducts.map((product) => { const margin = product.gross_profit == null || !product.total_revenue ? null : product.gross_profit / product.total_revenue * 100; return <tr key={`${product.id}-${product.sku}`}><td><strong>{product.name}</strong><small>{product.sku}</small></td><td>{product.total_quantity}</td><td>{product.stock_quantity}</td><td>{money(product.total_revenue)}</td><td>{product.gross_profit == null ? "—" : money(product.gross_profit)}</td><td>{margin == null ? "—" : `${margin.toFixed(1)}%`}</td><td>{Number(product.sell_through_rate || 0).toFixed(1)}%</td><td>{product.days_of_cover == null ? "Chưa bán đủ" : `${Math.round(product.days_of_cover)} ngày`}</td></tr>; })}</tbody></table></div> : <EmptyState>Chưa có SKU phát sinh doanh thu trong kỳ.</EmptyState>}</section>}
      {tab === "customers" && <div className="revenue-customer-grid"><section className="revenue-panel"><div className="revenue-panel__title"><div><h2>Khách mới và quay lại</h2><p>Phân loại theo lần mua hàng đầu tiên được ghi nhận.</p></div></div><div className="customer-segments"><article><span>Khách mới</span><strong>{report.customerSegments?.new?.customers || 0}</strong><small>{money(report.customerSegments?.new?.revenue)} · AOV {money(report.customerSegments?.new?.averageOrderValue)}</small></article><article><span>Khách quay lại</span><strong>{report.customerSegments?.returning?.customers || 0}</strong><small>{money(report.customerSegments?.returning?.revenue)} · AOV {money(report.customerSegments?.returning?.averageOrderValue)}</small></article></div><div className="revenue-aging"><strong>Tỷ lệ khách mua lại</strong><span>{Number(report.customerSegments?.repeatCustomerRate || 0).toFixed(1)}%</span></div></section><section className="revenue-panel"><div className="revenue-panel__title"><div><h2>Khách hàng đóng góp cao</h2><p>Xếp theo doanh thu ghi nhận trong kỳ.</p></div></div><div className="top-customer-list">{(report.topCustomers || []).map((customer, index) => <div key={customer.id || customer.email}><span>{index + 1}</span><div><strong>{customer.name}</strong><small>{customer.email}</small></div><b>{money(customer.revenue)}<small>{customer.orders} đơn</small></b></div>)}</div></section></div>}
      {tab === "promotions" && <section className="revenue-panel"><div className="revenue-panel__title"><div><h2>Đóng góp của khuyến mãi</h2><p>Doanh thu được phân bổ đều khi một đơn chịu nhiều chương trình, tránh tính trùng.</p></div></div>{(report.promotionPerformance || []).length ? <div className="revenue-table-wrap"><table className="revenue-table"><thead><tr><th>Chương trình</th><th>Đơn hàng</th><th>Doanh thu phân bổ</th><th>Chi phí ưu đãi</th><th>Tỷ lệ chi phí</th></tr></thead><tbody>{report.promotionPerformance.map((promotion) => <tr key={promotion.name}><td><strong>{promotion.name}</strong></td><td>{promotion.orders}</td><td>{money(promotion.attributedRevenue)}</td><td>{money(promotion.discountCost)}</td><td>{promotion.attributedRevenue ? `${(promotion.discountCost / promotion.attributedRevenue * 100).toFixed(1)}%` : "—"}</td></tr>)}</tbody></table></div> : <EmptyState>Chưa có đơn ghi nhận doanh thu sử dụng khuyến mãi trong kỳ.</EmptyState>}</section>}
      {tab === "audit" && <section className="revenue-panel"><div className="revenue-panel__title"><div><h2>Sổ đối soát doanh thu</h2><p>Chỉ gồm đơn đã giao và đã xác nhận thanh toán.</p></div><strong>{auditOrders.length} đơn</strong></div>{visibleAudit.length ? <><div className="revenue-table-wrap"><table className="revenue-table revenue-table--audit"><thead><tr><th>Mã đơn / Khách hàng</th><th>Thanh toán</th><th>Giao thành công</th><th>Ghi nhận</th><th>Đối soát giá trị</th><th>Mã giao dịch</th></tr></thead><tbody>{visibleAudit.map((order) => <tr key={order.id}><td><strong>#{order.id}</strong><small>{order.customer_name}<br />{order.customer_email}</small></td><td>{dateTime(order.verified_at)}<small>{order.payment_method?.toUpperCase()}</small></td><td>{dateTime(order.delivered_at)}</td><td>{dateTime(order.recognized_at)}</td><td><strong>{money(order.total_amount)}</strong><small>Gốc {money(order.original_subtotal)} · Giảm {money(order.discounts)}</small></td><td>{order.transaction_reference || "Không có mã"}</td></tr>)}</tbody></table></div><div className="revenue-pagination"><button disabled={auditPage === 1} onClick={() => setAuditPage((page) => page - 1)}>Trước</button><span>Trang {auditPage}/{auditPages}</span><button disabled={auditPage === auditPages} onClick={() => setAuditPage((page) => page + 1)}>Sau</button></div></> : <EmptyState>Không có đơn đủ điều kiện ghi nhận trong kỳ.</EmptyState>}</section>}
      {targetEditor && <div className="revenue-target-backdrop" onClick={() => setTargetEditor(false)}><form className="revenue-target-form" onSubmit={saveTarget} onClick={(event) => event.stopPropagation()}><button type="button" className="close" onClick={() => setTargetEditor(false)}>×</button><p>BÁO CÁO QUẢN TRỊ</p><h2>Đặt mục tiêu cho kỳ báo cáo</h2><label>Mục tiêu doanh thu<input type="number" min="1" required value={targetForm.revenue} onChange={(event) => setTargetForm((current) => ({ ...current, revenue: event.target.value }))} /></label><label>Mục tiêu lợi nhuận gộp<input type="number" min="0" value={targetForm.profit} onChange={(event) => setTargetForm((current) => ({ ...current, profit: event.target.value }))} /></label><label>Ghi chú<textarea value={targetForm.note} onChange={(event) => setTargetForm((current) => ({ ...current, note: event.target.value }))} placeholder="Ví dụ: mục tiêu tháng cao điểm cuối năm" /></label><div><button type="button" onClick={() => setTargetEditor(false)}>Hủy</button><button type="submit" disabled={savingTarget}>{savingTarget ? "Đang lưu…" : "Lưu mục tiêu"}</button></div></form></div>}
    </>}
  </main>;
}
