import { useEffect, useMemo, useState } from "react";
import useDocumentTitle from "../../hooks/useDocumentTitle";
import { reportAPI } from "../../services/api";

const statusLabels = { published: "Đang hiển thị", hidden: "Đã ẩn", rejected: "Từ chối" };
const formatNumber = (value) => Number(value || 0).toLocaleString("vi-VN");
const money = (val) => Number(val || 0).toLocaleString("vi-VN") + "đ";

export default function AdminProductInsights() {
  useDocumentTitle("Admin — Wishlist & Đánh Giá Hậu Kiểm AI");

  const [tab, setTab] = useState("wishlist"); // 'wishlist', 'reviews', 'audit_runs'
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [busy, setBusy] = useState(false);

  // Data states
  const [wishlistData, setWishlistData] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [auditRuns, setAuditRuns] = useState([]);
  const [selectedRun, setSelectedRun] = useState(null);
  const [historyModal, setHistoryModal] = useState(null); // { reviewId, history: [] }

  // Review Filters & Selection
  const [reviewFilter, setReviewFilter] = useState("all"); // 'all', 'published', 'hidden', 'flagged', 'pending'
  const [selectedReviewIds, setSelectedReviewIds] = useState([]);

  const loadAll = async () => {
    setLoading(true);
    setError("");
    try {
      const [wlRes, revRes, runsRes] = await Promise.all([
        reportAPI.getWishlistAnalytics().catch(() => ({ analytics: null })),
        reportAPI.getReviews().catch(() => ({ reviews: [] })),
        reportAPI.getReviewAuditRuns().catch(() => ({ runs: [] })),
      ]);
      setWishlistData(wlRes.analytics);
      setReviews(revRes.reviews || []);
      setAuditRuns(runsRes.runs || []);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  // Filtered reviews
  const filteredReviews = useMemo(() => {
    return reviews.filter((r) => {
      if (reviewFilter === "published" && r.status !== "published") return false;
      if (reviewFilter === "hidden" && r.status !== "hidden") return false;
      if (reviewFilter === "flagged" && r.audit_status !== "flagged") return false;
      if (reviewFilter === "pending" && r.audit_status !== "pending_audit") return false;
      return true;
    });
  }, [reviews, reviewFilter]);

  // Review Decisions
  const handleDecideReview = async (id, action) => {
    let reason = "";
    if (action === "hide") {
      reason = window.prompt("Nhập lý do ẩn đánh giá này khỏi cửa hàng:", "Nội dung không phù hợp chuẩn thanh lịch");
      if (reason === null) return;
    }
    setBusy(true);
    setError("");
    setSuccessMsg("");
    try {
      await reportAPI.decideReview(id, { action, reason });
      setSuccessMsg(`Đã cập nhật trạng thái đánh giá (#${id}) thành công.`);
      await loadAll();
    } catch (err) {
      setError(err.message || "Lỗi khi xử lý kiểm duyệt đánh giá.");
    } finally {
      setBusy(false);
    }
  };

  // Bulk Review Decisions
  const handleBulkDecision = async (action) => {
    if (!selectedReviewIds.length) return;
    const actionName = action === "bulk_hide" ? "Ẩn" : action === "bulk_keep" ? "Giữ hiển thị" : "Khôi phục";
    if (!window.confirm(`Xác nhận thực hiện "${actionName}" cho ${selectedReviewIds.length} đánh giá đã chọn?`)) return;

    let reason = "";
    if (action === "bulk_hide") {
      reason = window.prompt("Nhập lý do ẩn hàng loạt:", "Ẩn hàng loạt theo kiểm toán quản trị");
      if (reason === null) return;
    }

    setBusy(true);
    try {
      await reportAPI.bulkDecideReviews({ ids: selectedReviewIds, action, reason });
      setSuccessMsg(`Đã xử lý hàng loạt ${selectedReviewIds.length} đánh giá.`);
      setSelectedReviewIds([]);
      await loadAll();
    } catch (err) {
      setError(err.message || "Lỗi khi xử lý hàng loạt.");
    } finally {
      setBusy(false);
    }
  };

  // Trigger Manual AI Audit Run ("Phân tích ngay")
  const handleAuditNow = async () => {
    setBusy(true);
    setError("");
    setSuccessMsg("");
    try {
      const res = await reportAPI.auditReviewsNow();
      if (res.skipped) {
        setSuccessMsg(res.reason);
      } else {
        setSuccessMsg(`Hoàn thành phân tích AI: Tổng ${res.totalReviews || 0} đánh giá, ${res.cleanCount || 0} hợp lệ, ${res.flaggedCount || 0} cảnh báo.`);
      }
      await loadAll();
    } catch (err) {
      setError(err.message || "Lỗi khi chạy phân tích AI.");
    } finally {
      setBusy(false);
    }
  };

  // View Moderation History
  const handleViewHistory = async (reviewId) => {
    setBusy(true);
    try {
      const res = await reportAPI.getReviewHistory(reviewId);
      setHistoryModal({ reviewId, history: res.history || [] });
    } catch (err) {
      setError(err.message || "Lỗi khi xem lịch sử kiểm duyệt.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin-insights" style={{ fontFamily: "'Inter', sans-serif" }}>
      {/* Top Header */}
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "25px" }}>
        <div>
          <span style={{ fontSize: "11px", fontWeight: "700", color: "#8A5A36", letterSpacing: "1.5px", textTransform: "uppercase" }}>
            Hành vi & Kiểm toán nội dung
          </span>
          <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "32px", color: "#14100E", margin: "4px 0 6px" }}>
            QUAN TÂM SẢN PHẨM & ĐÁNH GIÁ HẬU KIỂM AI
          </h1>
          <p style={{ color: "#6B5A4B", fontSize: "13.5px", margin: 0 }}>
            Tổng hợp dữ liệu Wishlist, tỷ lệ chuyển đổi đơn hàng và hệ thống AI hậu kiểm đánh giá theo lịch tuần.
          </p>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          {tab === "reviews" && (
            <button
              onClick={handleAuditNow}
              disabled={busy}
              style={{
                backgroundColor: "#4E342E",
                color: "#F8F5F0",
                border: "1px solid #8A5A36",
                borderRadius: "6px",
                padding: "10px 18px",
                fontSize: "13px",
                fontWeight: "600",
                cursor: busy ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <i className="fas fa-brain"></i> {busy ? "Đang phân tích..." : "Phân Tích AI Ngay"}
            </button>
          )}
          <button
            onClick={loadAll}
            disabled={busy}
            style={{
              backgroundColor: "#FFF",
              color: "#8A5A36",
              border: "1px solid #D8CEC1",
              borderRadius: "6px",
              padding: "10px 16px",
              fontSize: "13px",
              fontWeight: "600",
              cursor: "pointer",
            }}
          >
            <i className="fas fa-sync-alt"></i> Làm mới
          </button>
        </div>
      </header>

      {/* Notifications */}
      {error && (
        <div style={{ backgroundColor: "#FFF0F0", border: "1px solid #F5C6CB", color: "#D9534F", padding: "12px 18px", borderRadius: "6px", marginBottom: "20px", fontSize: "13.5px" }}>
          ⚠️ {error}
        </div>
      )}
      {successMsg && (
        <div style={{ backgroundColor: "#F0FFF0", border: "1px solid #C3E6CB", color: "#2E8B57", padding: "12px 18px", borderRadius: "6px", marginBottom: "20px", fontSize: "13.5px" }}>
          ✓ {successMsg}
        </div>
      )}

      {/* Navigation Tabs */}
      <div style={{ display: "flex", gap: "10px", borderBottom: "1px solid #E8E1D6", marginBottom: "25px" }}>
        <button
          onClick={() => setTab("wishlist")}
          style={{
            padding: "12px 20px",
            border: "none",
            borderBottom: tab === "wishlist" ? "3px solid #8A5A36" : "3px solid transparent",
            backgroundColor: "transparent",
            color: tab === "wishlist" ? "#14100E" : "#6B5A4B",
            fontWeight: tab === "wishlist" ? "700" : "500",
            fontSize: "14px",
            cursor: "pointer",
          }}
        >
          <i className="fas fa-heart" style={{ marginRight: "8px" }}></i> Tổng Hợp Wishlist & Chuyển Đổi
        </button>
        <button
          onClick={() => setTab("reviews")}
          style={{
            padding: "12px 20px",
            border: "none",
            borderBottom: tab === "reviews" ? "3px solid #8A5A36" : "3px solid transparent",
            backgroundColor: "transparent",
            color: tab === "reviews" ? "#14100E" : "#6B5A4B",
            fontWeight: tab === "reviews" ? "700" : "500",
            fontSize: "14px",
            cursor: "pointer",
          }}
        >
          <i className="fas fa-star" style={{ marginRight: "8px" }}></i> Đánh Giá & Hậu Kiểm AI ({reviews.length})
        </button>
        <button
          onClick={() => setTab("audit_runs")}
          style={{
            padding: "12px 20px",
            border: "none",
            borderBottom: tab === "audit_runs" ? "3px solid #8A5A36" : "3px solid transparent",
            backgroundColor: "transparent",
            color: tab === "audit_runs" ? "#14100E" : "#6B5A4B",
            fontWeight: tab === "audit_runs" ? "700" : "500",
            fontSize: "14px",
            cursor: "pointer",
          }}
        >
          <i className="fas fa-history" style={{ marginRight: "8px" }}></i> Lịch Sử Kỳ Kiểm Toán AI ({auditRuns.length})
        </button>
      </div>

      {loading ? (
        <div style={{ padding: "50px", textAlign: "center", color: "#8A7350" }}>Đang tải dữ liệu phân tích...</div>
      ) : tab === "wishlist" ? (
        /* ==================================================== */
        /* TAB 1: WISHLIST ANALYTICS DASHBOARD (SECTION C)     */
        /* ==================================================== */
        <div>
          {/* KPI Metrics */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "18px", marginBottom: "25px" }}>
            <article style={{ backgroundColor: "#FFF", padding: "20px", borderRadius: "8px", border: "1px solid #E8E1D6" }}>
              <span style={{ fontSize: "12px", color: "#8A7350", textTransform: "uppercase", fontWeight: "600" }}>Khách duy nhất đang lưu</span>
              <strong style={{ display: "block", fontSize: "28px", color: "#14100E", marginTop: "8px" }}>
                {formatNumber(wishlistData?.totalActiveCustomers || 0)}
              </strong>
              <small style={{ color: "#6B5A4B", fontSize: "11.5px" }}>Tài khoản đang có ít nhất 1 sản phẩm yêu thích</small>
            </article>

            <article style={{ backgroundColor: "#FFF", padding: "20px", borderRadius: "8px", border: "1px solid #E8E1D6" }}>
              <span style={{ fontSize: "12px", color: "#8A7350", textTransform: "uppercase", fontWeight: "600" }}>Tổng khách từng thêm (Lịch sử)</span>
              <strong style={{ display: "block", fontSize: "28px", color: "#8A5A36", marginTop: "8px" }}>
                {formatNumber(wishlistData?.totalAllTimeCustomers || 0)}
              </strong>
              <small style={{ color: "#6B5A4B", fontSize: "11.5px" }}>Khách hàng xác thực từng phát sinh thao tác lưu</small>
            </article>

            <article style={{ backgroundColor: "#FFF", padding: "20px", borderRadius: "8px", border: "1px solid #E8E1D6" }}>
              <span style={{ fontSize: "12px", color: "#8A7350", textTransform: "uppercase", fontWeight: "600" }}>Tỷ lệ chuyển đổi đơn hàng</span>
              <strong style={{ display: "block", fontSize: "28px", color: "#2E8B57", marginTop: "8px" }}>
                {wishlistData?.storewideConversionRate || 0}%
              </strong>
              <small style={{ color: "#6B5A4B", fontSize: "11.5px" }}>{wishlistData?.totalConvertedCustomers || 0} khách đã đặt mua sau khi lưu wishlist</small>
            </article>

            <article style={{ backgroundColor: "#FFF", padding: "20px", borderRadius: "8px", border: "1px solid #E8E1D6" }}>
              <span style={{ fontSize: "12px", color: "#8A7350", textTransform: "uppercase", fontWeight: "600" }}>Sản phẩm đang được lưu</span>
              <strong style={{ display: "block", fontSize: "28px", color: "#4E342E", marginTop: "8px" }}>
                {formatNumber(wishlistData?.totalActiveItems || 0)}
              </strong>
              <small style={{ color: "#6B5A4B", fontSize: "11.5px" }}>Tổng lượt lưu trên toàn hệ sinh thái</small>
            </article>
          </div>

          {/* Privacy & SKU Notice Banner */}
          <div style={{ backgroundColor: "#FAF6F0", border: "1px solid #D8CEC1", borderRadius: "6px", padding: "14px 18px", marginBottom: "25px", fontSize: "13px", color: "#4E342E", display: "flex", alignItems: "center", gap: "12px" }}>
            <i className="fas fa-shield-alt" style={{ color: "#8A5A36", fontSize: "18px" }}></i>
            <div>
              <strong>Chính sách bảo mật & Tiêu chuẩn tính toán: </strong>
              {wishlistData?.privacyNotice || "Dữ liệu Wishlist được tổng hợp ẩn danh. Không xuất dữ liệu cá nhân hay tự động gửi tiếp thị."}
            </div>
          </div>

          {/* Product Wishlist Table */}
          <div style={{ backgroundColor: "#FFF", borderRadius: "8px", border: "1px solid #E8E1D6", overflow: "hidden" }}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid #E8E1D6" }}>
              <h3 style={{ margin: 0, fontSize: "16px", fontWeight: "600", color: "#14100E" }}>
                Chi Tiết Mức Độ Quan Tâm & Chuyển Đổi Từng Sản Phẩm
              </h3>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                <thead>
                  <tr style={{ backgroundColor: "#FAF6F0", borderBottom: "1px solid #E8E1D6", color: "#6B5A4B", textTransform: "uppercase", fontSize: "11px" }}>
                    <th style={{ padding: "12px 16px", textAlign: "left" }}>Mã & Tên Sản Phẩm</th>
                    <th style={{ padding: "12px 14px", textAlign: "left" }}>Danh Mục</th>
                    <th style={{ padding: "12px 14px", textAlign: "right" }}>Giá Bán</th>
                    <th style={{ padding: "12px 14px", textAlign: "center" }}>Đang Lưu (Hiện tại)</th>
                    <th style={{ padding: "12px 14px", textAlign: "center" }}>Tổng Lượt Thêm</th>
                    <th style={{ padding: "12px 14px", textAlign: "center" }}>Khách Đã Mua</th>
                    <th style={{ padding: "12px 14px", textAlign: "center" }}>Tỷ Lệ Chuyển Đổi</th>
                    <th style={{ padding: "12px 16px", textAlign: "left" }}>Ghi Chú Nhu Cầu SKU</th>
                  </tr>
                </thead>
                <tbody>
                  {(wishlistData?.productStats || []).map((p) => (
                    <tr key={p.productId} style={{ borderBottom: "1px solid #F0EAE1" }}>
                      <td style={{ padding: "12px 16px" }}>
                        <strong style={{ color: "#14100E", display: "block" }}>{p.name}</strong>
                        <span style={{ fontSize: "11px", color: "#8A7350" }}>{p.productCode}</span>
                      </td>
                      <td style={{ padding: "12px 14px", color: "#6B5A4B" }}>{p.category} • {p.gender}</td>
                      <td style={{ padding: "12px 14px", textAlign: "right", fontWeight: "600" }}>{money(p.price)}</td>
                      <td style={{ padding: "12px 14px", textAlign: "center", fontWeight: "700", color: "#8A5A36" }}>
                        {formatNumber(p.currentFavorites)}
                      </td>
                      <td style={{ padding: "12px 14px", textAlign: "center", color: "#6B5A4B" }}>
                        {formatNumber(p.allTimeFavorites)}
                      </td>
                      <td style={{ padding: "12px 14px", textAlign: "center", color: "#2E8B57", fontWeight: "600" }}>
                        {formatNumber(p.buyersFromWishlist)}
                      </td>
                      <td style={{ padding: "12px 14px", textAlign: "center" }}>
                        <span style={{
                          padding: "3px 8px",
                          borderRadius: "12px",
                          fontSize: "11px",
                          fontWeight: "700",
                          backgroundColor: p.conversionRate >= 20 ? "#E8F5E9" : p.conversionRate > 0 ? "#FFF8E1" : "#F5F5F5",
                          color: p.conversionRate >= 20 ? "#2E8B57" : p.conversionRate > 0 ? "#F57F17" : "#8A7350",
                        }}>
                          {p.conversionRate}%
                        </span>
                      </td>
                      <td style={{ padding: "12px 16px", fontSize: "11px", color: "#8A7350", fontStyle: "italic" }}>
                        {p.skuDemandNote}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : tab === "reviews" ? (
        /* ==================================================== */
        /* TAB 2: REVIEWS & WEEKLY AI AUDIT (SECTION B)        */
        /* ==================================================== */
        <div>
          {/* Filter Bar & Bulk Actions */}
          <div style={{ backgroundColor: "#FFF", padding: "16px 20px", borderRadius: "8px", border: "1px solid #E8E1D6", marginBottom: "20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
              <span style={{ fontSize: "12px", fontWeight: "600", color: "#4E342E" }}>Bộ lọc:</span>
              <select
                value={reviewFilter}
                onChange={(e) => setReviewFilter(e.target.value)}
                style={{ padding: "6px 12px", border: "1px solid #D8CEC1", borderRadius: "4px", fontSize: "12.5px" }}
              >
                <option value="all">Tất cả đánh giá ({reviews.length})</option>
                <option value="published">Đang hiển thị</option>
                <option value="hidden">Đã ẩn</option>
                <option value="flagged">AI Cảnh báo vi phạm</option>
                <option value="pending">Chờ AI hậu kiểm tuần</option>
              </select>
            </div>

            {/* Bulk Actions */}
            {selectedReviewIds.length > 0 && (
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <span style={{ fontSize: "12px", color: "#8A5A36", fontWeight: "600" }}>
                  Đã chọn {selectedReviewIds.length} mục:
                </span>
                <button
                  onClick={() => handleBulkDecision("bulk_keep")}
                  disabled={busy}
                  style={{ padding: "6px 12px", backgroundColor: "#E8F5E9", border: "1px solid #A5D6A7", color: "#2E8B57", borderRadius: "4px", fontSize: "12px", cursor: "pointer", fontWeight: "600" }}
                >
                  Giữ Đã Kiểm Tra
                </button>
                <button
                  onClick={() => handleBulkDecision("bulk_hide")}
                  disabled={busy}
                  style={{ padding: "6px 12px", backgroundColor: "#FFEBEE", border: "1px solid #FFCDD2", color: "#D9534F", borderRadius: "4px", fontSize: "12px", cursor: "pointer", fontWeight: "600" }}
                >
                  Ẩn Hàng Loạt
                </button>
                <button
                  onClick={() => handleBulkDecision("bulk_restore")}
                  disabled={busy}
                  style={{ padding: "6px 12px", backgroundColor: "#F0F4C3", border: "1px solid #DCE775", color: "#827717", borderRadius: "4px", fontSize: "12px", cursor: "pointer", fontWeight: "600" }}
                >
                  Khôi Phục Hàng Loạt
                </button>
              </div>
            )}
          </div>

          {/* Review List */}
          {filteredReviews.length === 0 ? (
            <div style={{ backgroundColor: "#FFF", padding: "40px", borderRadius: "8px", border: "1px solid #E8E1D6", textAlign: "center", color: "#8A7350" }}>
              Không có đánh giá nào phù hợp với bộ lọc hiện tại.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
              {filteredReviews.map((r) => {
                const isSelected = selectedReviewIds.includes(r.id);
                const ai = r.aiAnalysis;
                const isFlagged = r.audit_status === "flagged";
                const isClean = r.audit_status === "audited_clean";
                const isPending = r.audit_status === "pending_audit";

                return (
                  <article
                    key={r.id}
                    style={{
                      backgroundColor: "#FFF",
                      borderRadius: "8px",
                      border: isFlagged ? "1px solid #E57373" : "1px solid #E8E1D6",
                      padding: "20px",
                      boxShadow: isFlagged ? "0 2px 10px rgba(217, 83, 79, 0.08)" : "none",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
                      <div style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => {
                            if (e.target.checked) setSelectedReviewIds([...selectedReviewIds, r.id]);
                            else setSelectedReviewIds(selectedReviewIds.filter((id) => id !== r.id));
                          }}
                          style={{ marginTop: "4px" }}
                        />
                        <div>
                          <strong style={{ fontSize: "15px", color: "#14100E" }}>{r.product_name}</strong>
                          <span style={{ fontSize: "12px", color: "#8A7350", marginLeft: "6px" }}>({r.product_code})</span>
                          <div style={{ fontSize: "12px", color: "#6B5A4B", marginTop: "2px" }}>
                            Khách hàng: <strong>{r.customer_name}</strong> ({r.customer_email}) • Mua: {r.selected_color} / {r.selected_size} • Phiên bản: v{r.version || 1}
                          </div>
                        </div>
                      </div>

                      {/* Status Badges */}
                      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                        {/* Visibility Status */}
                        <span
                          style={{
                            padding: "3px 10px",
                            borderRadius: "12px",
                            fontSize: "11px",
                            fontWeight: "700",
                            backgroundColor: r.status === "published" ? "#E8F5E9" : "#FFEBEE",
                            color: r.status === "published" ? "#2E8B57" : "#D9534F",
                          }}
                        >
                          {r.status === "published" ? "● Đang hiển thị" : "● Đã ẩn"}
                        </span>

                        {/* AI Audit Status */}
                        {isFlagged ? (
                          <span style={{ padding: "3px 10px", borderRadius: "12px", fontSize: "11px", fontWeight: "700", backgroundColor: "#FFCDD2", color: "#C62828" }}>
                            ⚠️ AI Cảnh Báo Vi Phạm
                          </span>
                        ) : isClean ? (
                          <span style={{ padding: "3px 10px", borderRadius: "12px", fontSize: "11px", fontWeight: "700", backgroundColor: "#C8E6C9", color: "#2E7D32" }}>
                            ✓ AI: Hợp Lệ
                          </span>
                        ) : (
                          <span style={{ padding: "3px 10px", borderRadius: "12px", fontSize: "11px", fontWeight: "700", backgroundColor: "#FFF9C4", color: "#F57F17" }}>
                            ⏳ Chờ Hậu Kiểm AI
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Rating & Content */}
                    <div style={{ marginBottom: "12px" }}>
                      <div style={{ color: "#B89B5E", fontSize: "15px", letterSpacing: "2px", marginBottom: "4px" }}>
                        {"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}
                      </div>
                      {r.title && <h4 style={{ margin: "0 0 6px", fontSize: "14px", color: "#2B211C" }}>{r.title}</h4>}
                      <p style={{ margin: 0, fontSize: "13.5px", color: "#33261F", lineHeight: "1.5" }}>{r.content}</p>
                    </div>

                    {/* AI Explanation Box */}
                    {ai && (
                      <div style={{ backgroundColor: isFlagged ? "#FFF5F5" : "#FAF9F6", border: isFlagged ? "1px solid #FFCDD2" : "1px solid #E8E1D6", borderRadius: "6px", padding: "10px 14px", marginBottom: "12px", fontSize: "12.5px" }}>
                        <div style={{ fontWeight: "600", color: isFlagged ? "#C62828" : "#4E342E", marginBottom: "3px", display: "flex", gap: "6px", alignItems: "center" }}>
                          <i className="fas fa-robot"></i>
                          <span>Đánh giá từ AI Auditor (phiên bản v{r.ai_version_analyzed || r.version}):</span>
                          {ai.isNegativeFeedback && !ai.isViolation && (
                            <span style={{ backgroundColor: "#E0F2F1", color: "#00695C", padding: "2px 6px", borderRadius: "4px", fontSize: "10.5px" }}>
                              Phản hồi tiêu cực hợp lệ
                            </span>
                          )}
                          {ai.categories?.map((cat) => (
                            <span key={cat} style={{ backgroundColor: "#FFCDD2", color: "#B71C1C", padding: "2px 6px", borderRadius: "4px", fontSize: "10.5px" }}>
                              {cat.toUpperCase()}
                            </span>
                          ))}
                        </div>
                        <div style={{ color: "#55443B" }}>{ai.explanation}</div>
                      </div>
                    )}

                    {/* Admin Moderation Note & Metadata */}
                    {r.moderation_note && (
                      <div style={{ fontSize: "12px", color: "#8A5A36", marginBottom: "10px" }}>
                        Ghi chú Admin: <em>{r.moderation_note}</em> (bởi {r.moderated_by} lúc {new Date(r.moderated_at).toLocaleString("vi-VN")})
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid #F0EAE1", paddingTop: "10px" }}>
                      <span style={{ fontSize: "11.5px", color: "#8A7350" }}>
                        Gửi lúc: {new Date(r.created_at).toLocaleString("vi-VN")}
                      </span>
                      <div style={{ display: "flex", gap: "8px" }}>
                        <button
                          onClick={() => handleViewHistory(r.id)}
                          style={{ padding: "5px 10px", backgroundColor: "#FAF6F0", border: "1px solid #D8CEC1", borderRadius: "4px", fontSize: "11.5px", cursor: "pointer", color: "#6B5A4B" }}
                        >
                          <i className="fas fa-history"></i> Lịch Sử
                        </button>
                        <button
                          onClick={() => handleDecideReview(r.id, "keep")}
                          disabled={busy}
                          style={{ padding: "5px 12px", backgroundColor: "#E8F5E9", border: "1px solid #A5D6A7", color: "#2E8B57", borderRadius: "4px", fontSize: "11.5px", cursor: "pointer", fontWeight: "600" }}
                        >
                          ✓ Giữ / Đã Kiểm Tra
                        </button>
                        {r.status === "published" ? (
                          <button
                            onClick={() => handleDecideReview(r.id, "hide")}
                            disabled={busy}
                            style={{ padding: "5px 12px", backgroundColor: "#FFF0F0", border: "1px solid #F5C6CB", color: "#D9534F", borderRadius: "4px", fontSize: "11.5px", cursor: "pointer", fontWeight: "600" }}
                          >
                            ✕ Ẩn Đánh Giá
                          </button>
                        ) : (
                          <button
                            onClick={() => handleDecideReview(r.id, "restore")}
                            disabled={busy}
                            style={{ padding: "5px 12px", backgroundColor: "#F0FFF0", border: "1px solid #C3E6CB", color: "#2E8B57", borderRadius: "4px", fontSize: "11.5px", cursor: "pointer", fontWeight: "600" }}
                          >
                            ↺ Khôi Phục Hiển Thị
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* ==================================================== */
        /* TAB 3: AUDIT RUNS HISTORY & BATCH REPORTS           */
        /* ==================================================== */
        <div>
          <div style={{ backgroundColor: "#FFF", borderRadius: "8px", border: "1px solid #E8E1D6", overflow: "hidden" }}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid #E8E1D6" }}>
              <h3 style={{ margin: 0, fontSize: "16px", fontWeight: "600", color: "#14100E" }}>
                Nhật Ký Các Kỳ Kiểm Toán AI Đánh Giá (Audit Runs)
              </h3>
            </div>

            {auditRuns.length === 0 ? (
              <div style={{ padding: "40px", textAlign: "center", color: "#8A7350" }}>Chưa có kỳ kiểm toán AI nào được ghi nhận.</div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                <thead>
                  <tr style={{ backgroundColor: "#FAF6F0", borderBottom: "1px solid #E8E1D6", color: "#6B5A4B", textTransform: "uppercase", fontSize: "11px" }}>
                    <th style={{ padding: "12px 16px", textAlign: "left" }}>Mã Kỳ</th>
                    <th style={{ padding: "12px 14px", textAlign: "left" }}>Loại Kỳ</th>
                    <th style={{ padding: "12px 14px", textAlign: "left" }}>Thời Gian Bắt Đầu</th>
                    <th style={{ padding: "12px 14px", textAlign: "center" }}>Trạng Thái</th>
                    <th style={{ padding: "12px 14px", textAlign: "center" }}>Tổng Phân Tích</th>
                    <th style={{ padding: "12px 14px", textAlign: "center" }}>Hợp Lệ</th>
                    <th style={{ padding: "12px 14px", textAlign: "center" }}>Cảnh Báo</th>
                    <th style={{ padding: "12px 16px", textAlign: "left" }}>Người Khởi Chạy</th>
                  </tr>
                </thead>
                <tbody>
                  {auditRuns.map((run) => (
                    <tr
                      key={run.id}
                      onClick={() => setSelectedRun(run)}
                      style={{ borderBottom: "1px solid #F0EAE1", cursor: "pointer", backgroundColor: selectedRun?.id === run.id ? "rgba(138, 90, 54, 0.08)" : "transparent" }}
                    >
                      <td style={{ padding: "12px 16px", fontWeight: "700", color: "#14100E" }}>#{run.id}</td>
                      <td style={{ padding: "12px 14px", color: "#4E342E" }}>
                        {run.run_type === "scheduled" ? "Định kỳ tuần (Monday 08:00)" : "Thủ công (Admin Trigger)"}
                      </td>
                      <td style={{ padding: "12px 14px", color: "#6B5A4B" }}>{new Date(run.started_at).toLocaleString("vi-VN")}</td>
                      <td style={{ padding: "12px 14px", textAlign: "center" }}>
                        <span style={{
                          padding: "3px 8px",
                          borderRadius: "12px",
                          fontSize: "11px",
                          fontWeight: "700",
                          backgroundColor: run.status === "completed" ? "#E8F5E9" : run.status === "running" ? "#FFF9C4" : "#F5F5F5",
                          color: run.status === "completed" ? "#2E8B57" : run.status === "running" ? "#F57F17" : "#8A7350",
                        }}>
                          {run.status.toUpperCase()}
                        </span>
                      </td>
                      <td style={{ padding: "12px 14px", textAlign: "center", fontWeight: "600" }}>{run.total_reviews}</td>
                      <td style={{ padding: "12px 14px", textAlign: "center", color: "#2E8B57", fontWeight: "600" }}>{run.clean_count}</td>
                      <td style={{ padding: "12px 14px", textAlign: "center", color: run.flagged_count > 0 ? "#D9534F" : "#8A7350", fontWeight: "700" }}>
                        {run.flagged_count}
                      </td>
                      <td style={{ padding: "12px 16px", color: "#8A5A36" }}>{run.performed_by}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Selected Run Details */}
          {selectedRun?.summary && (
            <div style={{ marginTop: "25px", backgroundColor: "#FFF", borderRadius: "8px", border: "1px solid #E8E1D6", padding: "20px" }}>
              <h3 style={{ margin: "0 0 15px", fontSize: "18px", color: "#14100E" }}>
                Báo Cáo Chi Tiết Kỳ Kiểm Toán #{selectedRun.id}
              </h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
                {/* Common Praises */}
                <div style={{ backgroundColor: "#F0FFF0", border: "1px solid #C3E6CB", borderRadius: "6px", padding: "16px" }}>
                  <h4 style={{ margin: "0 0 10px", color: "#2E8B57", fontSize: "14px" }}>
                    <i className="fas fa-thumbs-up"></i> Tổng Hợp Điểm Khen Từ Khách Hàng
                  </h4>
                  {selectedRun.summary.commonPraises?.length ? (
                    <ul style={{ margin: 0, paddingLeft: "18px", fontSize: "13px", color: "#2E7D32" }}>
                      {selectedRun.summary.commonPraises.map((p, idx) => (
                        <li key={idx} style={{ marginBottom: "6px" }}>
                          <strong>{p.productCode}</strong>: {p.snippet} (Đánh giá #{p.reviewId})
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p style={{ margin: 0, fontSize: "12.5px", color: "#6B5A4B" }}>Không có ghi nhận đặc biệt.</p>
                  )}
                </div>

                {/* Common Criticisms */}
                <div style={{ backgroundColor: "#FFF8E1", border: "1px solid #FFE082", borderRadius: "6px", padding: "16px" }}>
                  <h4 style={{ margin: "0 0 10px", color: "#F57F17", fontSize: "14px" }}>
                    <i className="fas fa-exclamation-triangle"></i> Góp Ý & Phản Hồi Cần Lưu Ý
                  </h4>
                  {selectedRun.summary.commonCriticisms?.length ? (
                    <ul style={{ margin: 0, paddingLeft: "18px", fontSize: "13px", color: "#E65100" }}>
                      {selectedRun.summary.commonCriticisms.map((c, idx) => (
                        <li key={idx} style={{ marginBottom: "6px" }}>
                          <strong>{c.productCode}</strong>: {c.snippet} (Đánh giá #{c.reviewId})
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p style={{ margin: 0, fontSize: "12.5px", color: "#6B5A4B" }}>Không có khiếu nại tiêu cực.</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Moderation History Modal */}
      {historyModal && (
        <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
          <div style={{ backgroundColor: "#FFF", borderRadius: "8px", maxWidth: "600px", width: "100%", maxHeight: "80vh", overflowY: "auto", padding: "25px", border: "1px solid #D8CEC1" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "15px", borderBottom: "1px solid #E8E1D6", paddingBottom: "10px" }}>
              <h3 style={{ margin: 0, fontSize: "18px", color: "#14100E" }}>
                Lịch Sử Kiểm Duyệt Đánh Giá #{historyModal.reviewId}
              </h3>
              <button onClick={() => setHistoryModal(null)} style={{ background: "none", border: "none", fontSize: "16px", cursor: "pointer" }}>✕</button>
            </div>

            {historyModal.history.length === 0 ? (
              <p style={{ color: "#8A7350", fontStyle: "italic" }}>Chưa có thao tác kiểm duyệt thủ công nào trên đánh giá này.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {historyModal.history.map((h) => (
                  <div key={h.id} style={{ borderBottom: "1px solid #F0EAE1", paddingBottom: "8px", fontSize: "12.5px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <strong style={{ color: "#4E342E" }}>Hành động: {h.action.toUpperCase()}</strong>
                      <span style={{ color: "#8A7350" }}>{new Date(h.created_at).toLocaleString("vi-VN")}</span>
                    </div>
                    <div style={{ color: "#6B5A4B", marginTop: "2px" }}>
                      Trạng thái: <span>{h.previous_status} → {h.new_status}</span> • Thực hiện bởi: <strong>{h.performed_by}</strong>
                    </div>
                    {h.reason && <div style={{ color: "#8A5A36", marginTop: "2px" }}>Lý do: <em>{h.reason}</em></div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
