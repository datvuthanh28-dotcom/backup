import { useEffect, useMemo, useState } from "react";
import useDocumentTitle from "../../hooks/useDocumentTitle";
import { reportAPI } from "../../services/api";

const statusLabels = { published: "Đang hiển thị", hidden: "Đã ẩn", rejected: "Từ chối" };
const formatNumber = (value) => Number(value || 0).toLocaleString("vi-VN");

export default function AdminProductInsights() {
  useDocumentTitle("Admin - Mức độ quan tâm sản phẩm");
  const [insights, setInsights] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [tab, setTab] = useState("interest");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [insightData, reviewData] = await Promise.all([reportAPI.getProductInsights(), reportAPI.getReviews()]);
      setInsights(insightData.insights || []);
      setReviews(reviewData.reviews || []);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const metrics = useMemo(() => ({
    favorites: insights.reduce((sum, item) => sum + Number(item.current_favorites || 0), 0),
    added: insights.reduce((sum, item) => sum + Number(item.added_30d || 0), 0),
    reviews: reviews.length,
    visibleReviews: reviews.filter((review) => review.status === "published").length,
  }), [insights, reviews]);

  const moderate = async (review, status) => {
    const note = status === "published" ? "" : window.prompt("Ghi chú kiểm duyệt (không bắt buộc):", review.moderation_note || "");
    if (note === null) return;
    await reportAPI.moderateReview(review.id, { status, note });
    await load();
  };

  return (
    <div className="admin-insights">
      <header className="admin-insights__header">
        <div><p className="eyebrow">Hành vi khách hàng</p><h1>MỨC ĐỘ QUAN TÂM SẢN PHẨM</h1><p>Theo dõi lượt yêu thích, đánh giá đã mua hàng và số lượng bán thực tế.</p></div>
        <button className="admin-refresh" type="button" onClick={load}>Làm mới dữ liệu</button>
      </header>

      <div className="admin-insights__metrics">
        <article><span>Đang được yêu thích</span><strong>{formatNumber(metrics.favorites)}</strong></article>
        <article><span>Lượt thêm trong 30 ngày</span><strong>{formatNumber(metrics.added)}</strong></article>
        <article><span>Tổng đánh giá</span><strong>{formatNumber(metrics.reviews)}</strong></article>
        <article><span>Đánh giá đang hiển thị</span><strong>{formatNumber(metrics.visibleReviews)}</strong></article>
      </div>

      <div className="admin-insights__tabs" role="tablist">
        <button className={tab === "interest" ? "active" : ""} onClick={() => setTab("interest")}>Sản phẩm được quan tâm</button>
        <button className={tab === "reviews" ? "active" : ""} onClick={() => setTab("reviews")}>Kiểm duyệt đánh giá</button>
      </div>

      {error && <p className="admin-insights__error">{error}</p>}
      {loading ? <p>Đang tải dữ liệu...</p> : tab === "interest" ? (
        <div className="admin-insights__table-wrap"><table className="admin-insights__table"><thead><tr><th>Sản phẩm</th><th>Đang yêu thích</th><th>Thêm 30 ngày</th><th>Bỏ 30 ngày</th><th>Đánh giá</th><th>Điểm TB</th><th>Đã bán</th></tr></thead><tbody>{insights.map((item) => <tr key={item.product_id}><td><strong>{item.product_name || item.name}</strong><small>{item.product_code}</small></td><td>{formatNumber(item.current_favorites)}</td><td className="positive">+{formatNumber(item.added_30d)}</td><td>{formatNumber(item.removed_30d)}</td><td>{formatNumber(item.review_count)}</td><td>{Number(item.average_rating || 0).toFixed(1)} / 5</td><td>{formatNumber(item.units_sold)}</td></tr>)}</tbody></table></div>
      ) : (
        <div className="admin-review-list">{reviews.length === 0 ? <p>Chưa có đánh giá nào.</p> : reviews.map((review) => <article key={review.id}><div className="admin-review-list__top"><div><strong>{review.product_name}</strong><small>{review.product_code} · {review.customer_name} · {review.customer_email}</small></div><span className={`review-status review-status--${review.status}`}>{statusLabels[review.status] || review.status}</span></div><div className="review-stars">{"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}</div>{review.title && <h3>{review.title}</h3>}<p>{review.content}</p><small>Đã mua hàng · {review.selected_color} · {review.selected_size} · {new Date(review.created_at).toLocaleDateString("vi-VN")}</small>{review.moderation_note && <p className="moderation-note">Ghi chú: {review.moderation_note}</p>}<div className="admin-review-list__actions"><button onClick={() => moderate(review, "published")}>Hiển thị</button><button onClick={() => moderate(review, "hidden")}>Ẩn</button><button onClick={() => moderate(review, "rejected")}>Từ chối</button></div></article>)}</div>
      )}
    </div>
  );
}
