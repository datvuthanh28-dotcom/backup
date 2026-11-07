import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useStore, STATUS_LABELS } from "../../context/StoreContext";
import { useAuth } from "../../context/AuthContext";
import useDocumentTitle from "../../hooks/useDocumentTitle";
import CustomerAccountSidebar from "../../components/CustomerAccountSidebar";
import OrderItemLine from "../../components/OrderItemLine";
import OrderFinancialBreakdown from "../../components/OrderFinancialBreakdown";
import { customerAPI, returnsAPI } from "../../services/api";

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
const CUSTOMER_STATUS_LABELS = { pending: "Pending", confirmed: "Confirmed", processing: "Processing", shipping: "Shipping", delivered: "Delivered", cancelled: "Cancelled" };
const customerStatusLabel = (status) => CUSTOMER_STATUS_LABELS[status] || STATUS_LABELS[status]?.label || status;

const RETURN_REQUEST_STATUS = {
  manual_review: { label: "Under Client Care review", tone: "review" },
  return_authorized: { label: "Return authorised", tone: "authorised" },
  in_transit: { label: "Return on its way", tone: "authorised" },
  received: { label: "Item received", tone: "review" },
  inspection_passed: { label: "Inspection passed", tone: "authorised" },
  inspection_failed: { label: "Return not approved after inspection", tone: "declined" },
  refunded: { label: "Refund completed", tone: "authorised" },
  exchanged: { label: "Exchange completed", tone: "authorised" },
  auto_declined: { label: "Request not approved", tone: "declined" },
  cancelled: { label: "Request cancelled", tone: "declined" },
};

function returnRequestMessage(request) {
  if (request.status === "inspection_passed") {
    const nextStep = request.request_type === "exchange"
      ? "Your exchange will be arranged within 3 working days, subject to stock availability. Please contact Client Services if you need further support."
      : "Your refund will be issued to the original payment method within 3 working days. Please contact Client Services if you need further support.";
    return { label: "Request approved", tone: "authorised", detail: nextStep };
  }
  const meta = RETURN_REQUEST_STATUS[request.status] || { label: "Return request received", tone: "review" };
  return { ...meta, detail: request.resolution_note || request.inspection_note || request.decision_reason || "Maison Rue will update you when the request progresses." };
}

export const PAYMENT_STATUS_META = {
  paid: { label: "Paid", color: "#2E8B57", bg: "#EAF7EE" },
  pending_verification: { label: "Payment pending", color: "#B8860B", bg: "#FFF8DC" },
  unpaid: { label: "Unpaid (COD)", color: "#6B5A4B", bg: "#F5F0EA" },
  refund_pending: { label: "Refund pending", color: "#E67E22", bg: "#FDF2E9" },
  refunded: { label: "Refunded", color: "#7B1FA2", bg: "#F3E5F5" },
  cancelled: { label: "Transaction cancelled", color: "#9E9E9E", bg: "#EEEEEE" },
};

export default function CustomerOrders() {
  useDocumentTitle("My Orders");
  const { orders, cancelOrder, refreshOrders } = useStore();
  const { currentUser } = useAuth();
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [cancellingId, setCancellingId] = useState(null);
  const [cancelReason, setCancelReason] = useState("");
  const [actionNotice, setActionNotice] = useState("");
  const [loadingCancel, setLoadingCancel] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [reviewEligibility, setReviewEligibility] = useState({});
  const [reviewTarget, setReviewTarget] = useState(null);
  const [reviewForm, setReviewForm] = useState({ rating: 5, title: "", content: "" });
  const [reviewSaving, setReviewSaving] = useState(false);
  const [reviewError, setReviewError] = useState("");
  const [returnRequests, setReturnRequests] = useState([]);
  const [returnTarget, setReturnTarget] = useState(null);
  const [returnForm, setReturnForm] = useState({ requestType: "refund", reasonCode: "", reasonDetail: "", quantity: 1, conditionConfirmed: false, exchangeSize: "", exchangeColor: "" });
  const [returnSaving, setReturnSaving] = useState(false);
  const [returnError, setReturnError] = useState("");
  const [exchangeOptions, setExchangeOptions] = useState({ sizes: [], colors: [], loading: false });

  const refreshReturnRequests = async () => {
    try { const result = await returnsAPI.getAll(); setReturnRequests(result.requests || []); }
    catch { /* Keep order history usable when return service is temporarily unavailable. */ }
  };

  useEffect(() => {
    let active = true;
    customerAPI.getMyReviewEligibility().then((result) => {
      if (!active) return;
      setReviewEligibility(Object.fromEntries((result.items || []).map((item) => [Number(item.order_item_id), item])));
    }).catch(() => {
      // Orders remain usable if review metadata cannot be loaded temporarily.
    });
    return () => { active = false; };
  }, []);

  useEffect(() => { refreshReturnRequests(); }, []);

  // Orders may have loaded while the local API was restarting. Refresh when this
  // page opens so a signed-in customer never remains on an empty stale state.
  useEffect(() => {
    if (currentUser?.role === "customer") refreshOrders();
  }, [currentUser?.id, currentUser?.role, refreshOrders]);

  const openReturnRequest = async (order, item) => {
    setReturnTarget({ order, item });
    setReturnForm({ requestType: "refund", reasonCode: "", reasonDetail: "", quantity: 1, conditionConfirmed: false, exchangeSize: "", exchangeColor: "" });
    setReturnError("");
    setExchangeOptions({ sizes: [], colors: [], loading: true });
    try {
      const result = await returnsAPI.getExchangeOptions(order.id, item.id);
      setExchangeOptions({ sizes: result.sizes || [], colors: result.colors || [], loading: false });
    } catch (error) {
      setExchangeOptions({ sizes: [], colors: [], loading: false });
      setReturnError(error.message || "Unable to load the available exchange options.");
    }
  };

  const submitReturnRequest = async (event) => {
    event.preventDefault();
    if (!returnTarget) return;
    if (returnForm.requestType === "exchange" && (!returnForm.exchangeSize || !returnForm.exchangeColor)) {
      setReturnError("Choose the preferred size and colour for your exchange.");
      return;
    }
    setReturnSaving(true); setReturnError("");
    try {
      const result = await returnsAPI.submit({
        orderId: returnTarget.order.id,
        orderItemId: returnTarget.item.id,
        ...returnForm,
      });
      setReturnTarget(null);
      const decision = returnRequestMessage(result.request || { status: result.decision, decision_reason: result.message });
      setActionNotice(`${decision.label}. ${decision.detail}`);
      await refreshReturnRequests();
      const reviewResult = await customerAPI.getMyReviewEligibility();
      setReviewEligibility(Object.fromEntries((reviewResult.items || []).map((item) => [Number(item.order_item_id), item])));
    } catch (error) { setReturnError(error.message || "Unable to submit your request."); }
    finally { setReturnSaving(false); }
  };

  const openReview = (order, item) => {
    const productId = Number(item.product_id || item.productId || item.id);
    const orderItemId = Number(item.id);
    const current = reviewEligibility[orderItemId];
    setReviewTarget({ order, item, productId, orderItemId, current });
    setReviewForm({ rating: Number(current?.rating || 5), title: current?.title || "", content: current?.content || "" });
    setReviewError("");
  };

  const submitReview = async (event) => {
    event.preventDefault();
    if (!reviewTarget) return;
    setReviewSaving(true);
    setReviewError("");
    try {
      const wasEditing = Boolean(reviewTarget.current?.review_id);
      const result = await customerAPI.saveReview(reviewTarget.productId, {
        ...reviewForm,
        orderId: reviewTarget.order.id,
        orderItemId: reviewTarget.item.id,
      });
      const next = { ...(result.purchase || reviewTarget.current || {}), ...(result.review || {}), product_id: reviewTarget.productId };
      setReviewEligibility((previous) => ({ ...previous, [reviewTarget.orderItemId]: next }));
      setReviewTarget(null);
      setActionNotice(wasEditing ? "Review updated." : "Review submitted.");
    } catch (error) {
      setReviewError(error.message || "Unable to save your review.");
    } finally {
      setReviewSaving(false);
    }
  };

  const deleteCurrentReview = async () => {
    if (!reviewTarget || !window.confirm("Would you like to delete this review?")) return;
    setReviewSaving(true);
    try {
      await customerAPI.deleteReview(reviewTarget.productId);
      setReviewEligibility((previous) => ({
        ...previous,
        [reviewTarget.orderItemId]: { ...previous[reviewTarget.orderItemId], review_id: null, rating: null, title: null, content: null, review_status: null },
      }));
      setReviewTarget(null);
      setActionNotice("Review deleted.");
    } catch (error) {
      setReviewError(error.message || "Unable to delete your review.");
    } finally {
      setReviewSaving(false);
    }
  };

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
    setCancelReason("I changed my mind.");
  };

  const confirmCancel = async () => {
    if (!cancellingId) return;
    setLoadingCancel(true);
    const res = await cancelOrder(
      cancellingId,
      cancelReason || "Customer requested cancellation from the account page."
    );
    setLoadingCancel(false);

    if (res.success) {
      setActionNotice(
        `Order #${cancellingId} was cancelled. The items have been returned to inventory.`
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
      alert(res.error || "Unable to cancel the order.");
    }
  };

  return (
    <main className="customer-orders-page" style={{ maxWidth: "1150px", margin: "40px auto", padding: "0 20px" }}>
      <CustomerAccountSidebar />
      <section className="customer-orders-content">
      <div className="orders-filter-bar" aria-label="Filter orders">
        <span>Filter orders</span>
        {[['all','All'],['pending','Pending'],['processing','Processing'],['shipping','Shipping'],['delivered','Delivered'],['cancelled','Cancelled']].map(([value, label]) => (
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
            MAISON RUE CLIENT ACCOUNT
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
            ORDER HISTORY
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
            You have no orders yet
          </h2>
          <p style={{ color: "#6B5A4B", fontSize: "14px", marginBottom: "25px" }}>
            Discover Maison Rue’s timeless collection and place your order today.
          </p>
          <Link to="/" className="btn-primary" style={{ textDecoration: "none", display: "inline-block" }}>
            Explore the collection
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
                      Order date: {formatDate(createdAt)}
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
                      ● {customerStatusLabel(currentStatus)}
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
                      Order details
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
                        Cancel order
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
                          pending: "Pending",
                          confirmed: "Confirmed",
                          processing: "Processing",
                          shipping: "Shipping",
                          delivered: "Delivered",
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
                        ? "This order was cancelled. Your refund is being reviewed and will be processed within 24 business hours."
                        : pmtStatus === "refunded"
                        ? `This order was cancelled. Your refund has been processed${pmt.refund_reference ? ` (Reference: ${pmt.refund_reference})` : ""}.`
                        : "This order was cancelled. All items have been returned to inventory."}
                    </span>
                  </div>
                )}

                {/* Items preview */}
                <div style={{ padding: "20px 24px" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    {orderItems.map((item, idx) => {
                      const productId = Number(item.product_id || item.productId || item.id);
                      const review = reviewEligibility[Number(item.id)];
                      const itemRequests = returnRequests.filter((request) => Number(request.order_item_id) === Number(item.id));
                      const latestRequest = itemRequests[0];
                      const hasReturnRequest = itemRequests.length > 0;
                      const requestMessage = latestRequest ? returnRequestMessage(latestRequest) : null;
                      return <div className="order-review-item" key={item.id || `${item.product_id}-${idx}`}>
                        <OrderItemLine item={item} formatPrice={formatPrice} linkProduct />
                        {currentStatus === "delivered" && !hasReturnRequest && <button type="button" className="order-review-button" onClick={() => openReturnRequest(order, item)}>Request return / refund</button>}
                        {requestMessage && <p className={`return-request-status return-request-status--${requestMessage.tone}`}><strong>{requestMessage.label}</strong><span>{requestMessage.detail}</span></p>}
                        {currentStatus === "delivered" && review && (
                          <button type="button" className="order-review-button" onClick={() => openReview(order, item)}>
                            <span aria-hidden="true">{review?.review_id ? "★" : "☆"}</span>
                            {review?.review_id ? "Edit review" : "Review product"}
                          </button>
                        )}
                      </div>;
                    })}
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
                      Delivery address: {order.shipping_address || order.shippingAddress}
                    </div>
                    <div style={{ fontSize: "15px", color: "#2B211C" }}>
                      Total paid:{" "}
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

      {reviewTarget && (
        <div className="order-review-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setReviewTarget(null); }}>
          <form className="order-review-modal" onSubmit={submitReview}>
            <button type="button" className="order-review-close" aria-label="Close" onClick={() => setReviewTarget(null)}>×</button>
            <p className="eyebrow">Order #{reviewTarget.order.id}</p>
            <h2>{reviewTarget.current?.review_id ? "Edit review" : "Review product"}</h2>
            <p className="order-review-product-name">{reviewTarget.item.product_name || reviewTarget.item.productName || reviewTarget.item.name}</p>
            <small>SKU: {reviewTarget.item.variant_sku || reviewTarget.item.sku || "—"} · {reviewTarget.item.selected_color || reviewTarget.item.selectedColor} · Size {reviewTarget.item.selected_size || reviewTarget.item.selectedSize}</small>
            <fieldset className="order-review-rating">
              <legend>Rating</legend>
              <div>{[1, 2, 3, 4, 5].map((rating) => (
                <button key={rating} type="button" aria-label={`${rating} sao`} aria-pressed={reviewForm.rating === rating} onClick={() => setReviewForm((form) => ({ ...form, rating }))}>
                  {rating <= reviewForm.rating ? "★" : "☆"}
                </button>
              ))}</div>
              <span>{reviewForm.rating}/5 sao</span>
            </fieldset>
            <label>Title <span>(optional)</span><input maxLength="120" value={reviewForm.title} onChange={(event) => setReviewForm({ ...reviewForm, title: event.target.value })} placeholder="Summarise your experience" /></label>
            <label>Your review<textarea required minLength="10" maxLength="1500" value={reviewForm.content} onChange={(event) => setReviewForm({ ...reviewForm, content: event.target.value })} placeholder="Share your thoughts on the material, fit, sizing or your experience..." /></label>
            <small className="order-review-count">{reviewForm.content.length}/1500 characters · at least 10 characters</small>
            {reviewError && <p className="order-review-error">{reviewError}</p>}
            <div className="order-review-actions">
              {reviewTarget.current?.review_id && <button type="button" className="order-review-delete" disabled={reviewSaving} onClick={deleteCurrentReview}>Delete review</button>}
              <button type="button" className="account-cancel" disabled={reviewSaving} onClick={() => setReviewTarget(null)}>Cancel</button>
              <button type="submit" className="account-action" disabled={reviewSaving || reviewForm.content.trim().length < 10}>{reviewSaving ? "Saving..." : "Save review"}</button>
            </div>
          </form>
        </div>
      )}

      {returnTarget && <div className="order-review-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setReturnTarget(null); }}>
        <form className="order-review-modal return-request-modal" onSubmit={submitReturnRequest}>
          <button type="button" className="order-review-close" aria-label="Close" onClick={() => setReturnTarget(null)}>×</button>
          <p className="eyebrow">Order #{returnTarget.order.id}</p>
          <h2>Return or exchange request</h2>
          <p className="order-review-product-name">{returnTarget.item.product_name || returnTarget.item.productName || returnTarget.item.name}</p>
          <label>Request type<select value={returnForm.requestType} onChange={(event) => setReturnForm({ ...returnForm, requestType: event.target.value })}><option value="refund">Return and refund</option><option value="exchange">Exchange</option></select></label>
          <label>Reason<select required value={returnForm.reasonCode} onChange={(event) => setReturnForm({ ...returnForm, reasonCode: event.target.value })}><option value="">Choose a reason</option><option value="wrong_item">Wrong item received</option><option value="wrong_color">Wrong colour received</option><option value="wrong_size_sent">Wrong size received</option><option value="missing_item">An item is missing</option><option value="damaged_on_arrival">Damaged on arrival</option><option value="manufacturing_defect">Possible manufacturing defect</option><option value="size_does_not_fit">The size does not fit</option><option value="changed_mind">I changed my mind</option><option value="other">Other</option></select></label>
          <label>Quantity<input type="number" min="1" max={returnTarget.item.quantity} value={returnForm.quantity} onChange={(event) => setReturnForm({ ...returnForm, quantity: Number(event.target.value) })} required /></label>
          {returnForm.requestType === "exchange" && <div className="return-exchange-fields">
            <label>Preferred size<select required disabled={exchangeOptions.loading || exchangeOptions.sizes.length === 0} value={returnForm.exchangeSize} onChange={(event) => setReturnForm({ ...returnForm, exchangeSize: event.target.value })}>
              <option value="">{exchangeOptions.loading ? "Loading sizes…" : exchangeOptions.sizes.length ? "Choose a size" : "No sizes available"}</option>
              {exchangeOptions.sizes.map((size) => <option key={size} value={size}>{size}</option>)}
            </select></label>
            <label>Preferred colour<select required disabled={exchangeOptions.loading || exchangeOptions.colors.length === 0} value={returnForm.exchangeColor} onChange={(event) => setReturnForm({ ...returnForm, exchangeColor: event.target.value })}>
              <option value="">{exchangeOptions.loading ? "Loading colours…" : exchangeOptions.colors.length ? "Choose a colour" : "No colours available"}</option>
              {exchangeOptions.colors.map((color) => <option key={color} value={color}>{color}</option>)}
            </select></label>
          </div>}
          <label>Details<textarea maxLength="1000" value={returnForm.reasonDetail} onChange={(event) => setReturnForm({ ...returnForm, reasonDetail: event.target.value })} placeholder="Tell us briefly what happened or what you would like to exchange." /></label>
          {!(["wrong_item", "wrong_color", "wrong_size_sent", "missing_item", "damaged_on_arrival", "manufacturing_defect"].includes(returnForm.reasonCode)) && <label className="return-condition-confirm"><input type="checkbox" checked={returnForm.conditionConfirmed} onChange={(event) => setReturnForm({ ...returnForm, conditionConfirmed: event.target.checked })} /> I confirm the item is unworn, unwashed and unaltered.</label>}
          <p className="return-inspection-note">No photo is needed to submit. Maison Rue will inspect the item in person after receiving it. A refund or exchange is completed only after inspection passes.</p>
          {returnError && <p className="order-review-error">{returnError}</p>}
          <div className="order-review-actions"><button type="button" className="account-cancel" disabled={returnSaving} onClick={() => setReturnTarget(null)}>Cancel</button><button type="submit" className="account-action" disabled={returnSaving || !returnForm.reasonCode || (returnForm.requestType === "exchange" && (exchangeOptions.loading || !returnForm.exchangeSize || !returnForm.exchangeColor))}>{returnSaving ? "Submitting…" : "Submit request"}</button></div>
        </form>
      </div>}

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
              Confirm Order Cancellation #{cancellingId}
            </h3>
            <p style={{ fontSize: "14px", color: "#6B5A4B", lineHeight: "1.6" }}>
              Are you sure you want to cancel this order? All items will be returned to inventory.
            </p>

            <div style={{ margin: "15px 0" }}>
              <label style={{ display: "block", fontSize: "13px", fontWeight: "600", marginBottom: "6px" }}>
                Reason for cancellation:
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
                <option value="I changed my mind.">I changed my mind</option>
                <option value="I would like a different style or colour.">I would like a different style or colour</option>
                <option value="I ordered the wrong quantity.">I ordered the wrong quantity</option>
                <option value="The delivery time does not work for me.">The delivery time does not work for me</option>
              </select>
            </div>

            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "25px" }}>
              <button
                onClick={() => setCancellingId(null)}
                className="btn-secondary"
                disabled={loadingCancel}
                style={{ width: "auto", margin: 0, padding: "10px 18px", fontSize: "13px" }}
              >
                Close
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
                {loadingCancel ? "Cancelling..." : "Confirm cancellation"}
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
                  Order details
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
              <div><strong>Recipient:</strong> {selectedOrder.customer_name || selectedOrder.customerName} ({selectedOrder.customer_phone || selectedOrder.customerPhone})</div>
              <div><strong>Address:</strong> {selectedOrder.shipping_address || selectedOrder.shippingAddress}</div>
              {selectedOrder.notes && <div><strong>Delivery notes:</strong> {selectedOrder.notes}</div>}
              <div><strong>Payment method:</strong> {selectedOrder.payment?.payment_method === "cod" ? "Cash on delivery (COD)" : "Bank transfer"}</div>
              <div><strong>Order status:</strong> {customerStatusLabel(selectedOrder.order_status || selectedOrder.status)}</div>
              <div><strong>Payment status:</strong> {PAYMENT_STATUS_META[selectedOrder.payment?.payment_status || "unpaid"]?.label}</div>
              {Number(selectedOrder.product_discount_total || 0) + Number(selectedOrder.code_discount_total || 0) > 0 && <div className="order-promotion-breakdown"><div><strong>Original subtotal:</strong> {formatPrice(selectedOrder.original_subtotal)}</div>{Number(selectedOrder.product_discount_total) > 0 && <div><strong>Product discounts:</strong> −{formatPrice(selectedOrder.product_discount_total)}</div>}{Number(selectedOrder.code_discount_total) > 0 && <div><strong>Code {selectedOrder.promotion_code}:</strong> −{formatPrice(selectedOrder.code_discount_total)}</div>}<div><strong>Total paid:</strong> {formatPrice(selectedOrder.total_amount)}</div></div>}
              {selectedOrder.payment?.transaction_reference && (
                <div><strong>Transaction reference:</strong> {selectedOrder.payment.transaction_reference}</div>
              )}
              {selectedOrder.payment?.refund_reference && (
                <div><strong>Refund reference:</strong> {selectedOrder.payment.refund_reference} (Completed on {formatDate(selectedOrder.payment.refunded_at)})</div>
              )}
            </div>

            <h4 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "18px", marginBottom: "8px" }}>
              Items in this order:
            </h4>
            <div style={{ marginBottom: "18px" }}>
              {(selectedOrder.items || []).map((item, idx) => <OrderItemLine key={item.id || `${item.product_id}-${idx}`} item={item} formatPrice={formatPrice} linkProduct />)}
              <OrderFinancialBreakdown order={selectedOrder} formatPrice={formatPrice} />
            </div>

            <h4 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "18px", marginBottom: "12px" }}>
              Order activity log:
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
                    {customerStatusLabel(h.new_status || h.status)}
                  </div>
                  <div style={{ fontSize: "12px", color: "#8A7350" }}>
                    {formatDate(h.created_at || h.timestamp)} • By: {h.updated_by || h.by}
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
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      </section>
    </main>
  );
}


