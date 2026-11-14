import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import useDocumentTitle from "../../hooks/useDocumentTitle";
import { returnsAPI } from "../../services/api";
import AdminPagination from "../../components/AdminPagination";

const PAGE_SIZE = 8;

const labels = {
  auto_approved: "Đã chấp thuận gửi trả",
  auto_declined: "Tự động từ chối",
  manual_review: "Cần xem xét",
  return_authorized: "Đã chấp thuận gửi trả",
  in_transit: "Đang vận chuyển hoàn",
  received: "Đã nhận · Chờ kiểm tra",
  inspection_passed: "Đạt kiểm tra",
  inspection_failed: "Không đạt kiểm tra",
  refunded: "Đã hoàn tiền",
  exchanged: "Đã hoàn tất đổi hàng",
  cancelled: "Đã hủy",
};

const requestTypeLabels = { refund: "Hoàn tiền", exchange: "Đổi sản phẩm" };
const reasonLabels = {
  changed_mind: "Thay đổi nhu cầu",
  wrong_item: "Nhận sai sản phẩm",
  wrong_color: "Không đúng màu mong muốn",
  defective: "Sản phẩm bị lỗi",
  damaged: "Hư hỏng khi vận chuyển",
  not_as_described: "Không đúng mô tả",
  sizing: "Không phù hợp kích cỡ hoặc dáng",
  quality: "Không hài lòng về chất lượng",
  late_delivery: "Giao hàng trễ",
  other: "Lý do khác",
};

const readableReason = (value) => reasonLabels[value] || String(value || "Chưa cung cấp").replaceAll("_", " ");
const decisionLabels = {
  "The order item could not be verified.": "Không thể xác minh sản phẩm trong đơn hàng.",
  "The request was submitted more than 14 calendar days after delivery.": "Yêu cầu được gửi sau thời hạn 14 ngày kể từ khi giao hàng.",
  "Requested quantity is not valid for this order item.": "Số lượng yêu cầu không hợp lệ với sản phẩm trong đơn.",
  "Promotional items are not eligible for fit, preference or change-of-mind returns.": "Sản phẩm khuyến mãi không áp dụng đổi trả do kích cỡ, sở thích hoặc thay đổi nhu cầu.",
  "Within the return window and eligible for a change-of-mind, fit or size return, subject to physical inspection.": "Yêu cầu còn trong thời hạn đổi trả và đủ điều kiện sơ bộ; kết quả cuối cùng phụ thuộc vào kiểm tra thực tế.",
};
const readableDecision = (value) => decisionLabels[String(value || "").trim()] || value || "Chưa có ghi chú từ hệ thống.";

const money = (value) => `${Number(value || 0).toLocaleString("vi-VN")}đ`;

export default function AdminReturns({ isStaffView = false }) {
  const { role } = useAuth();
  const isAdmin = !isStaffView && role === "admin";
  useDocumentTitle(isAdmin ? "Quản lý đổi trả & hoàn tiền" : "Xử lý đổi trả");
  const [requests, setRequests] = useState([]);
  const [filter, setFilter] = useState("all");
  const [notes, setNotes] = useState({});
  const [refundReferences, setRefundReferences] = useState({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { const result = await returnsAPI.getAll(); setRequests(result.requests || []); }
    catch (err) { setError(err.message || "Không thể tải danh sách yêu cầu đổi trả."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const act = async (request, action) => {
    const note = notes[request.id] || "";
    if (["pass_inspection", "fail_inspection", "decline"].includes(action) && !note.trim()) {
      setError("Vui lòng nhập kết quả kiểm tra hoặc lý do xử lý trước khi tiếp tục."); return;
    }
    if (action === "refund" && !window.confirm(`Xác nhận đã hoàn ${money(request.requested_amount)} sau khi kiểm tra sản phẩm?`)) return;
    setBusyId(request.id); setError("");
    try {
      await returnsAPI.update(request.id, { action, note, refundReference: refundReferences[request.id] || "" });
      await load();
    }
    catch (err) { setError(err.message || "Không thể cập nhật yêu cầu này."); }
    finally { setBusyId(null); }
  };

  const visible = requests.filter((request) => filter === "all" || request.status === filter);
  const pages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const pagedRequests = visible.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const statuses = ["all", "manual_review", "return_authorized", "in_transit", "received", "inspection_passed", "refunded", "exchanged", "auto_declined"];

  useEffect(() => setPage(1), [filter]);
  useEffect(() => { if (page > pages) setPage(pages); }, [page, pages]);

  return <main className="return-admin-page">
    <header className="return-admin-header"><p className="eyebrow">CHĂM SÓC KHÁCH HÀNG</p><h1>{isAdmin ? "Đổi trả & hoàn tiền" : "Xử lý đổi trả"}</h1><p>Chấp thuận gửi trả không đồng nghĩa với chấp thuận hoàn tiền hoặc đổi hàng. Mọi kiện hàng phải được tiếp nhận và kiểm tra thực tế trước khi xử lý.</p></header>
    {error && <p className="return-admin-error" role="alert">{error}</p>}
    <nav className="return-admin-filters" aria-label="Lọc yêu cầu đổi trả">{statuses.map((status) => <button key={status} className={filter === status ? "active" : ""} onClick={() => setFilter(status)}>{status === "all" ? `Tất cả (${requests.length})` : `${labels[status]} (${requests.filter((r) => r.status === status).length})`}</button>)}</nav>
    {loading ? <p className="return-admin-empty">Đang tải yêu cầu…</p> : visible.length === 0 ? <p className="return-admin-empty">Không có yêu cầu nào ở trạng thái này.</p> : <><div className="return-admin-list">{pagedRequests.map((request) => <article className="return-admin-request" key={request.id}>
      <div className="return-admin-request-head"><div><span className="return-admin-id">{request.id}</span><span className={`return-admin-status status-${request.status}`}>{labels[request.status] || request.status}</span></div><span>{new Date(request.created_at).toLocaleString("vi-VN")}</span></div>
      <div className="return-admin-grid"><section><p className="eyebrow">KHÁCH HÀNG & SẢN PHẨM</p><h2>{request.product_name} · {request.selected_color} · {request.selected_size}</h2><p>{request.customer_name} · {request.customer_email}</p><p>Đơn <strong>{request.order_id}</strong> · Số lượng {request.requested_quantity} · Giá trị yêu cầu {money(request.requested_amount)}</p><div className="return-admin-facts"><div><span>Hình thức yêu cầu</span><strong>{requestTypeLabels[request.request_type] || request.request_type || "—"}</strong></div><div><span>Lý do của khách hàng</span><strong>{readableReason(request.reason_code)}</strong></div></div>{request.request_type === "refund" && request.refund_bank_code && <div className="return-admin-bank-details"><span>Thông tin nhận hoàn tiền</span><strong>{request.refund_bank_name || request.refund_bank_code}</strong><p>Tài khoản {request.refund_account_number} · {request.refund_account_holder}</p></div>}{request.reason_detail && <div className="return-admin-detail return-admin-customer-note"><span>Ghi chú của khách hàng</span><p>{request.reason_detail}</p></div>}<div className="return-admin-decision"><span>Kết quả kiểm tra tự động</span><p>{readableDecision(request.decision_reason)}</p></div>{request.return_deadline && <small>Hạn gửi trả: {new Date(request.return_deadline).toLocaleDateString("vi-VN")}</small>}</section>
      <section className="return-admin-workflow">{request.request_type === "refund" && <div className="return-admin-payout-card"><div className="return-admin-payout-heading"><span>Thông tin chuyển khoản hoàn tiền</span><small>Dùng thông tin này để thực hiện giao dịch</small></div>{request.refund_bank_code ? <dl><div><dt>Ngân hàng</dt><dd>{request.refund_bank_name || request.refund_bank_code} <small>({request.refund_bank_code})</small></dd></div><div><dt>Số tài khoản</dt><dd className="return-admin-account-number">{request.refund_account_number}<button type="button" onClick={() => navigator.clipboard?.writeText(String(request.refund_account_number || ""))} aria-label="Sao chép số tài khoản">Sao chép</button></dd></div><div><dt>Chủ tài khoản</dt><dd>{request.refund_account_holder}</dd></div></dl> : <p className="return-admin-payout-missing">Khách hàng chưa cung cấp thông tin tài khoản nhận hoàn tiền.</p>}</div>}<label>Biên bản kiểm tra / hướng xử lý<textarea value={notes[request.id] ?? request.inspection_note ?? request.resolution_note ?? ""} onChange={(event) => setNotes((previous) => ({ ...previous, [request.id]: event.target.value }))} placeholder={request.request_type === "refund" ? "Ghi tình trạng sản phẩm, quyết định hoàn tiền và thông tin giao dịch…" : "Ghi tình trạng sản phẩm, quyết định đổi hàng và thông tin sản phẩm thay thế…"} /></label><div className="return-admin-actions">
        {isAdmin && request.status === "manual_review" && <button disabled={busyId === request.id} onClick={() => act(request, "manual_authorize")}>Chấp thuận gửi trả</button>}
        {(request.status === "return_authorized" || request.status === "in_transit") && <button disabled={busyId === request.id} onClick={() => act(request, "receive")}>Xác nhận đã nhận hàng</button>}
        {request.status === "received" && <><button disabled={busyId === request.id} onClick={() => act(request, "pass_inspection")}>Đạt kiểm tra</button><button className="secondary" disabled={busyId === request.id} onClick={() => act(request, "fail_inspection")}>Không đạt kiểm tra</button></>}
        {isAdmin && request.status === "inspection_passed" && request.request_type === "refund" && <><label>Mã giao dịch hoàn tiền (nếu có)<input value={refundReferences[request.id] || ""} onChange={(event) => setRefundReferences((previous) => ({ ...previous, [request.id]: event.target.value }))} placeholder="Nhập mã giao dịch / mã tham chiếu" /></label><button disabled={busyId === request.id} onClick={() => act(request, "refund")}>Ghi nhận đã hoàn · {money(request.requested_amount)}</button><small>Hoàn tất giao dịch qua ngân hàng hoặc nhà cung cấp thanh toán, sau đó lưu mã tham chiếu tại đây.</small></>}
        {isAdmin && request.status === "inspection_passed" && request.request_type === "exchange" && <button disabled={busyId === request.id} onClick={() => act(request, "exchange")}>Hoàn tất đổi hàng</button>}
        {isAdmin && ["manual_review", "return_authorized"].includes(request.status) && <button className="secondary" disabled={busyId === request.id} onClick={() => act(request, "decline")}>Từ chối và ghi lý do</button>}
      </div>{busyId === request.id && <small>Đang lưu…</small>}</section></div>
    </article>)}</div><AdminPagination page={page} total={visible.length} pageSize={PAGE_SIZE} onPageChange={setPage} itemLabel="yêu cầu" /></>}
  </main>;
}
