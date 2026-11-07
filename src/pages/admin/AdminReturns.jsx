import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import useDocumentTitle from "../../hooks/useDocumentTitle";
import { returnsAPI } from "../../services/api";

const labels = {
  auto_approved: "Return authorised",
  auto_declined: "Auto declined",
  manual_review: "Manual review",
  return_authorized: "Return authorised",
  in_transit: "In transit",
  received: "Received · inspection required",
  inspection_passed: "Inspection passed",
  inspection_failed: "Inspection failed",
  refunded: "Refunded",
  exchanged: "Exchange completed",
  cancelled: "Cancelled",
};

const money = (value) => `${Number(value || 0).toLocaleString("vi-VN")}đ`;

export default function AdminReturns({ isStaffView = false }) {
  const { role } = useAuth();
  const isAdmin = !isStaffView && role === "admin";
  useDocumentTitle(isAdmin ? "Returns & Refunds" : "Return Inspection");
  const [requests, setRequests] = useState([]);
  const [filter, setFilter] = useState("all");
  const [notes, setNotes] = useState({});
  const [refundReferences, setRefundReferences] = useState({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { const result = await returnsAPI.getAll(); setRequests(result.requests || []); }
    catch (err) { setError(err.message || "Unable to load return requests."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const act = async (request, action) => {
    const note = notes[request.id] || "";
    if (["pass_inspection", "fail_inspection", "decline"].includes(action) && !note.trim()) {
      setError("Please add an inspection or decision note before continuing."); return;
    }
    if (action === "refund" && !window.confirm(`Confirm refund of ${money(request.requested_amount)} after inspection?`)) return;
    setBusyId(request.id); setError("");
    try { await returnsAPI.update(request.id, { action, note, refundReference: refundReferences[request.id] || "" }); await load(); }
    catch (err) { setError(err.message || "Unable to update this request."); }
    finally { setBusyId(null); }
  };

  const visible = requests.filter((request) => filter === "all" || request.status === filter);
  const statuses = ["all", "manual_review", "return_authorized", "in_transit", "received", "inspection_passed", "refunded", "exchanged", "auto_declined"];

  return <main className="return-admin-page">
    <header className="return-admin-header"><p className="eyebrow">CLIENT SERVICES</p><h1>{isAdmin ? "Returns & Refunds" : "Return Inspection"}</h1><p>Return authorisation is separate from refund or exchange approval. Every parcel must be received and inspected in person first.</p></header>
    {error && <p className="return-admin-error" role="alert">{error}</p>}
    <nav className="return-admin-filters" aria-label="Filter return requests">{statuses.map((status) => <button key={status} className={filter === status ? "active" : ""} onClick={() => setFilter(status)}>{status === "all" ? `All (${requests.length})` : `${labels[status]} (${requests.filter((r) => r.status === status).length})`}</button>)}</nav>
    {loading ? <p className="return-admin-empty">Loading requests…</p> : visible.length === 0 ? <p className="return-admin-empty">No requests in this view.</p> : <div className="return-admin-list">{visible.map((request) => <article className="return-admin-request" key={request.id}>
      <div className="return-admin-request-head"><div><span className="return-admin-id">{request.id}</span><span className={`return-admin-status status-${request.status}`}>{labels[request.status] || request.status}</span></div><span>{new Date(request.created_at).toLocaleString("en-GB")}</span></div>
      <div className="return-admin-grid"><section><p className="eyebrow">CUSTOMER & ITEM</p><h2>{request.product_name} · {request.selected_color} · {request.selected_size}</h2><p>{request.customer_name} · {request.customer_email}</p><p>Order <strong>{request.order_id}</strong> · Quantity {request.requested_quantity} · Requested {money(request.requested_amount)}</p><p>Type: {request.request_type} · Reason: {request.reason_code}</p>{request.reason_detail && <p className="return-admin-detail">{request.reason_detail}</p>}<p className="return-admin-decision">System decision: {request.decision_reason}</p>{request.return_deadline && <small>Request deadline: {new Date(request.return_deadline).toLocaleDateString("en-GB")}</small>}</section>
      <section className="return-admin-workflow"><label>Inspection / resolution note<textarea value={notes[request.id] ?? request.inspection_note ?? request.resolution_note ?? ""} onChange={(event) => setNotes((previous) => ({ ...previous, [request.id]: event.target.value }))} placeholder="Record parcel condition and inspection result" /></label><div className="return-admin-actions">
        {isAdmin && request.status === "manual_review" && <button disabled={busyId === request.id} onClick={() => act(request, "manual_authorize")}>Authorise return</button>}
        {(request.status === "return_authorized" || request.status === "in_transit") && <button disabled={busyId === request.id} onClick={() => act(request, "receive")}>Mark received</button>}
        {request.status === "received" && <><button disabled={busyId === request.id} onClick={() => act(request, "pass_inspection")}>Pass inspection</button><button className="secondary" disabled={busyId === request.id} onClick={() => act(request, "fail_inspection")}>Fail inspection</button></>}
        {isAdmin && request.status === "inspection_passed" && request.request_type === "refund" && <><label>Payment provider refund reference (if available)<input value={refundReferences[request.id] || ""} onChange={(event) => setRefundReferences((previous) => ({ ...previous, [request.id]: event.target.value }))} placeholder="Transaction/reference number" /></label><button disabled={busyId === request.id} onClick={() => act(request, "refund")}>Record refund · {money(request.requested_amount)}</button><small>Complete the transfer through your payment provider, then record its reference here.</small></>}
        {isAdmin && request.status === "inspection_passed" && request.request_type === "exchange" && <button disabled={busyId === request.id} onClick={() => act(request, "exchange")}>Complete exchange</button>}
        {isAdmin && ["manual_review", "return_authorized"].includes(request.status) && <button className="secondary" disabled={busyId === request.id} onClick={() => act(request, "decline")}>Decline with reason</button>}
      </div>{busyId === request.id && <small>Saving…</small>}</section></div>
    </article>)}</div>}
  </main>;
}
