import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { customerAPI, engagementAPI } from "../services/api";

const stars = (value) => "★★★★★".slice(0, Number(value)) + "☆☆☆☆☆".slice(Number(value));

export default function ProductReviews({ productId }) {
  const { currentUser } = useAuth();
  const [data, setData] = useState({ reviews: [], summary: {} });
  const [eligibility, setEligibility] = useState(null);
  const [form, setForm] = useState({ rating: 5, title: "", content: "" });
  const [message, setMessage] = useState("");
  const load = useCallback(async () => {
    const publicData = await engagementAPI.getReviews(productId);
    setData(publicData);
    if (currentUser?.role === "customer") {
      const result = await customerAPI.getReviewEligibility(productId);
      setEligibility(result);
      if (result.review) setForm({ rating: result.review.rating, title: result.review.title || "", content: result.review.content || "" });
    } else setEligibility(null);
  }, [productId, currentUser]);
  useEffect(() => { load().catch((error) => setMessage(error.message)); }, [load]);
  const submit = async (event) => { event.preventDefault(); setMessage(""); try { await customerAPI.saveReview(productId, form); setMessage("Your review has been saved."); await load(); } catch (error) { setMessage(error.message); } };
  const remove = async () => { if (!window.confirm("Would you like to delete this review?")) return; await customerAPI.deleteReview(productId); setForm({ rating: 5, title: "", content: "" }); setMessage("Your review has been removed."); await load(); };
  const summary = data.summary || {};
  return <section className="product-reviews"><p className="eyebrow">CLIENT REVIEWS</p><h2>Review product</h2><div className="review-summary"><strong>{Number(summary.average_rating || 0).toFixed(1)} / 5</strong><span className="review-stars">{stars(Math.round(summary.average_rating || 0))}</span><span>{summary.review_count || 0} verified reviews</span></div>{currentUser?.role === "customer" && eligibility?.eligible && <form className="review-form" onSubmit={submit}><h3>{eligibility.review ? "Edit review" : "Write a review"}</h3><label>Rating<select value={form.rating} onChange={(event) => setForm({ ...form, rating: Number(event.target.value) })}>{[5,4,3,2,1].map((rating) => <option value={rating} key={rating}>{rating}  stars</option>)}</select></label><label>Title<input maxLength="120" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label><label>Your review<textarea minLength="10" maxLength="1500" required value={form.content} onChange={(event) => setForm({ ...form, content: event.target.value })} /></label><div><button className="btn-primary" type="submit">Save review</button>{eligibility.review && <button className="btn-secondary" type="button" onClick={remove}>Delete review</button>}</div></form>}{currentUser?.role === "customer" && eligibility && !eligibility.eligible && <p className="review-hint">You can review this item after its order has been delivered.</p>}{message && <p className="product-validation">{message}</p>}<div className="review-list">{data.reviews?.map((review) => <article key={review.id}><div><strong>{review.customer_name}</strong><span className="review-stars">{stars(review.rating)}</span></div><small>Verified purchase · {new Date(review.created_at).toLocaleDateString("vi-VN")}</small>{review.title && <h3>{review.title}</h3>}<p>{review.content}</p><small>{review.selected_color} · {review.selected_size}</small></article>)}</div></section>;
}
