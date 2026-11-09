import sql from "mssql";
import { getPool } from "../config/db.js";
import { triggerManualReviewAudit } from "../services/reviewAuditService.js";

const parseImages = (value) => {
  try { return JSON.parse(value || "[]"); } catch { return []; }
};

// ==========================================
// 1. PUBLIC & CUSTOMER REVIEW ENDPOINTS
// ==========================================

export async function getPublicReviews(req, res) {
  const productId = Number(req.params.productId);
  if (!productId) return res.status(400).json({ success: false, error: "Sản phẩm không hợp lệ." });
  const pool = getPool();
  const result = await pool.request().input("product_id", sql.Int, productId).query(`
    SELECT r.id, r.product_id, r.rating, r.title, r.content, r.selected_color, r.selected_size,
      r.is_verified_purchase, r.created_at, r.updated_at, u.name AS customer_name
    FROM ProductReviews r JOIN Users u ON u.id = r.user_id
    WHERE r.product_id = @product_id AND r.status = 'published'
      AND (r.is_hidden_by_admin IS NULL OR r.is_hidden_by_admin = 0)
      -- A review is only displayed while the purchased line remains reviewable.
      -- A completed exchange is explicitly eligible; every other return state is not.
      AND NOT EXISTS (SELECT 1 FROM ReturnRequests rr WHERE rr.order_item_id = r.order_item_id AND rr.status <> 'exchanged')
    ORDER BY r.created_at DESC`);
  const summary = await pool.request().input("product_id", sql.Int, productId).query(`
    SELECT COUNT(*) review_count, COALESCE(AVG(CAST(rating AS DECIMAL(5,2))),0) average_rating,
      SUM(CASE WHEN rating=5 THEN 1 ELSE 0 END) five_star,
      SUM(CASE WHEN rating=4 THEN 1 ELSE 0 END) four_star,
      SUM(CASE WHEN rating=3 THEN 1 ELSE 0 END) three_star,
      SUM(CASE WHEN rating=2 THEN 1 ELSE 0 END) two_star,
      SUM(CASE WHEN rating=1 THEN 1 ELSE 0 END) one_star
    FROM ProductReviews r
    WHERE r.product_id=@product_id AND r.status='published'
      AND (r.is_hidden_by_admin IS NULL OR r.is_hidden_by_admin = 0)
      AND NOT EXISTS (SELECT 1 FROM ReturnRequests rr WHERE rr.order_item_id=r.order_item_id AND rr.status<>'exchanged')`);
  return res.json({ success: true, reviews: result.recordset, summary: summary.recordset[0] });
}

export async function getFavorites(req, res) {
  const pool = getPool();
  const result = await pool.request().input("user_id", sql.NVarChar, req.user.id).query(`
    SELECT f.product_id,f.created_at,p.product_code,p.name,p.price,p.images_json
    FROM ProductFavorites f JOIN Products p ON p.id=f.product_id
    WHERE f.user_id=@user_id AND f.is_active=1 AND p.is_active=1
    ORDER BY f.updated_at DESC`);
  const favorites = result.recordset.map((row) => ({ ...row, images: parseImages(row.images_json) }));
  return res.json({ success: true, favorites, productIds: favorites.map((item) => item.product_id) });
}

export async function setFavorite(req, res) {
  const productId = Number(req.params.productId);
  const active = req.body.active !== false;
  if (!productId) return res.status(400).json({ success: false, error: "Sản phẩm không hợp lệ." });
  const pool = getPool();
  const product = await pool.request().input("product_id", sql.Int, productId).query("SELECT id FROM Products WHERE id=@product_id AND is_active=1");
  if (!product.recordset.length) return res.status(404).json({ success: false, error: "Sản phẩm không tồn tại." });
  const current = await pool.request().input("user_id", sql.NVarChar, req.user.id).input("product_id", sql.Int, productId).query("SELECT is_active FROM ProductFavorites WHERE user_id=@user_id AND product_id=@product_id");
  if (current.recordset.length && Boolean(current.recordset[0].is_active) === active) {
    return res.json({ success: true, productId, active, changed: false });
  }
  await pool.request().input("user_id", sql.NVarChar, req.user.id).input("product_id", sql.Int, productId).input("active", sql.Bit, active ? 1 : 0).query(`
    MERGE ProductFavorites AS target
    USING (SELECT @user_id user_id,@product_id product_id) AS source
    ON target.user_id=source.user_id AND target.product_id=source.product_id
    WHEN MATCHED THEN UPDATE SET is_active=@active,updated_at=GETDATE()
    WHEN NOT MATCHED THEN INSERT(user_id,product_id,is_active) VALUES(@user_id,@product_id,@active);`);
  await pool.request().input("user_id", sql.NVarChar, req.user.id).input("product_id", sql.Int, productId).input("event_type", sql.NVarChar, active ? "added" : "removed").query("INSERT INTO ProductFavoriteEvents(user_id,product_id,event_type) VALUES(@user_id,@product_id,@event_type)");
  return res.json({ success: true, productId, active, changed: true });
}

export async function getReviewEligibility(req, res) {
  const productId = Number(req.params.productId);
  const pool = getPool();
  const purchase = await pool.request().input("user_id", sql.NVarChar, req.user.id).input("product_id", sql.Int, productId).query(`
    SELECT TOP 1 oi.id order_item_id,oi.order_id,oi.selected_color,oi.selected_size
    FROM OrderItems oi JOIN Orders o ON o.id=oi.order_id
    WHERE o.customer_id=@user_id AND oi.product_id=@product_id AND o.order_status='delivered'
      AND NOT EXISTS (SELECT 1 FROM ReturnRequests rr WHERE rr.order_item_id=oi.id AND rr.status<>'exchanged')
    ORDER BY o.updated_at DESC`);
  const existing = await pool.request().input("user_id", sql.NVarChar, req.user.id).input("product_id", sql.Int, productId).query("SELECT TOP 1 * FROM ProductReviews WHERE user_id=@user_id AND product_id=@product_id AND status<>'deleted'");
  return res.json({ success: true, eligible: purchase.recordset.length > 0, purchase: purchase.recordset[0] || null, review: existing.recordset[0] || null });
}

export async function getMyReviewEligibility(req, res) {
  const pool = getPool();
  const result = await pool.request().input("user_id", sql.NVarChar, req.user.id).query(`
    WITH DeliveredPurchases AS (
      SELECT oi.product_id,oi.id order_item_id,oi.order_id,oi.selected_color,oi.selected_size,
             ROW_NUMBER() OVER (PARTITION BY oi.product_id ORDER BY COALESCE(o.delivered_at,o.updated_at) DESC,oi.id DESC) row_number
      FROM OrderItems oi
      JOIN Orders o ON o.id=oi.order_id
      WHERE o.customer_id=@user_id AND o.order_status='delivered'
        AND NOT EXISTS (SELECT 1 FROM ReturnRequests rr WHERE rr.order_item_id=oi.id AND rr.status<>'exchanged')
    )
    SELECT d.product_id,d.order_item_id,d.order_id,d.selected_color,d.selected_size,
           r.id review_id,r.rating,r.title,r.content,r.status review_status,r.created_at review_created_at,r.updated_at review_updated_at
    FROM DeliveredPurchases d
    LEFT JOIN ProductReviews r ON r.user_id=@user_id AND r.product_id=d.product_id AND r.status<>'deleted'
    WHERE d.row_number=1
    ORDER BY d.order_id DESC,d.order_item_id`);
  return res.json({ success: true, items: result.recordset });
}

/**
 * Save review:
 * - Public immediately upon valid submission (status = 'published').
 * - Track revision version (version incremented on each edit).
 * - CRITICAL: If Admin previously hid this review (is_hidden_by_admin = 1), editing does NOT auto-publish!
 * - Sets audit_status = 'pending_audit' for weekly AI processing.
 * - Does NOT call AI synchronously on submit.
 */
export async function saveReview(req, res) {
  const productId = Number(req.params.productId);
  const rating = Number(req.body.rating);
  const title = String(req.body.title || "").trim();
  const content = String(req.body.content || "").trim();
  if (!productId || !Number.isInteger(rating) || rating < 1 || rating > 5 || content.length < 10) {
    return res.status(400).json({ success: false, error: "Điểm đánh giá hoặc nội dung chưa hợp lệ (tối thiểu 10 ký tự)." });
  }

  const pool = getPool();
  const requestedOrderId = String(req.body.orderId || "").trim();
  const requestedOrderItemId = Number(req.body.orderItemId) || null;
  const purchaseRequest = pool.request()
    .input("user_id", sql.NVarChar, req.user.id)
    .input("product_id", sql.Int, productId)
    .input("order_id", sql.NVarChar, requestedOrderId || null)
    .input("order_item_id", sql.Int, requestedOrderItemId);

  const purchase = await purchaseRequest.query(`
    SELECT TOP 1 oi.id order_item_id, oi.order_id, oi.selected_color, oi.selected_size
    FROM OrderItems oi JOIN Orders o ON o.id = oi.order_id
    WHERE o.customer_id = @user_id AND oi.product_id = @product_id AND o.order_status = 'delivered'
      AND NOT EXISTS (SELECT 1 FROM ReturnRequests rr WHERE rr.order_item_id = oi.id AND rr.status <> 'exchanged')
      AND (@order_id IS NULL OR o.id = @order_id) AND (@order_item_id IS NULL OR oi.id = @order_item_id)
    ORDER BY COALESCE(o.delivered_at, o.updated_at) DESC, oi.id DESC
  `);

  if (!purchase.recordset.length) {
    return res.status(403).json({ success: false, error: "Chỉ khách đã nhận sản phẩm mới có thể đánh giá." });
  }
  const item = purchase.recordset[0];

  // Check if review already exists for this user and product
  const existingRes = await pool.request()
    .input("user_id", sql.NVarChar, req.user.id)
    .input("product_id", sql.Int, productId)
    .query("SELECT id, version, is_hidden_by_admin, status FROM ProductReviews WHERE user_id = @user_id AND product_id = @product_id");

  const existing = existingRes.recordset[0];

  if (existing) {
    const newVersion = (existing.version || 1) + 1;
    // Critical requirement: Admin-hidden content stays hidden on edit
    const isHiddenByAdmin = Boolean(existing.is_hidden_by_admin || existing.status === "hidden");
    const targetStatus = isHiddenByAdmin ? "hidden" : "published";

    await pool.request()
      .input("id", sql.Int, existing.id)
      .input("order_id", sql.NVarChar, item.order_id)
      .input("order_item_id", sql.Int, item.order_item_id)
      .input("rating", sql.TinyInt, rating)
      .input("title", sql.NVarChar, title || null)
      .input("content", sql.NVarChar, content)
      .input("color", sql.NVarChar, item.selected_color)
      .input("size", sql.NVarChar, item.selected_size)
      .input("status", sql.NVarChar, targetStatus)
      .input("is_hidden_by_admin", sql.Bit, isHiddenByAdmin ? 1 : 0)
      .input("version", sql.Int, newVersion)
      .query(`
        UPDATE ProductReviews
        SET order_id = @order_id,
            order_item_id = @order_item_id,
            rating = @rating,
            title = @title,
            content = @content,
            selected_color = @color,
            selected_size = @size,
            status = @status,
            is_hidden_by_admin = @is_hidden_by_admin,
            version = @version,
            audit_status = 'pending_audit',
            updated_at = GETDATE()
        WHERE id = @id
      `);
  } else {
    // Initial submission: published immediately, version 1, pending_audit
    await pool.request()
      .input("product_id", sql.Int, productId)
      .input("user_id", sql.NVarChar, req.user.id)
      .input("order_id", sql.NVarChar, item.order_id)
      .input("order_item_id", sql.Int, item.order_item_id)
      .input("rating", sql.TinyInt, rating)
      .input("title", sql.NVarChar, title || null)
      .input("content", sql.NVarChar, content)
      .input("color", sql.NVarChar, item.selected_color)
      .input("size", sql.NVarChar, item.selected_size)
      .query(`
        INSERT INTO ProductReviews (
          product_id, user_id, order_id, order_item_id, rating, title, content,
          selected_color, selected_size, is_verified_purchase, status,
          version, is_hidden_by_admin, audit_status, created_at, updated_at
        )
        VALUES (
          @product_id, @user_id, @order_id, @order_item_id, @rating, @title, @content,
          @color, @size, 1, 'published',
          1, 0, 'pending_audit', GETDATE(), GETDATE()
        )
      `);
  }

  return getReviewEligibility(req, res);
}

export async function deleteReview(req, res) {
  const productId = Number(req.params.productId);
  const pool = getPool();
  await pool.request()
    .input("user_id", sql.NVarChar, req.user.id)
    .input("product_id", sql.Int, productId)
    .query("UPDATE ProductReviews SET status='deleted', updated_at=GETDATE() WHERE user_id=@user_id AND product_id=@product_id");
  return res.json({ success: true });
}

// ==========================================
// 2. ADMIN REVIEWS & AI AUDIT ENDPOINTS
// ==========================================

export async function getAdminReviews(req, res) {
  const pool = getPool();
  const result = await pool.request().query(`
    SELECT r.id, r.product_id, r.user_id, r.order_id, r.order_item_id, r.rating,
           r.title, r.content, r.selected_color, r.selected_size, r.is_verified_purchase,
           r.status, r.version, r.is_hidden_by_admin, r.audit_status, r.ai_analysis_json,
           r.ai_version_analyzed, r.ai_error, r.ai_audit_run_id, r.moderation_note,
           r.moderated_by, r.moderated_at, r.created_at, r.updated_at,
           p.product_code, p.name AS product_name,
           u.name AS customer_name, u.email AS customer_email
    FROM ProductReviews r
    JOIN Products p ON p.id = r.product_id
    JOIN Users u ON u.id = r.user_id
    WHERE r.status <> 'deleted'
    ORDER BY r.created_at DESC
  `);

  const reviews = result.recordset.map((row) => ({
    ...row,
    aiAnalysis: row.ai_analysis_json ? JSON.parse(row.ai_analysis_json) : null,
  }));

  return res.json({ success: true, reviews });
}

export async function auditReviewsNow(req, res) {
  try {
    const result = await triggerManualReviewAudit(req.user);
    return res.json({ success: true, ...result });
  } catch (err) {
    console.error("[Audit Reviews Now] Error:", err);
    return res.status(500).json({ success: false, error: err.message || "Lỗi khi chạy phân tích AI đánh giá." });
  }
}

export async function getReviewAuditRuns(req, res) {
  try {
    const pool = getPool();
    const result = await pool.request().query(`
      SELECT id, run_type, status, started_at, completed_at,
             total_reviews, clean_count, flagged_count, error_count,
             summary_json, error_message, performed_by
      FROM ReviewAuditRuns
      ORDER BY started_at DESC
    `);
    const runs = result.recordset.map((r) => ({
      ...r,
      summary: r.summary_json ? JSON.parse(r.summary_json) : null,
    }));
    return res.json({ success: true, runs });
  } catch (err) {
    console.error("[Get Audit Runs] Error:", err);
    return res.status(500).json({ success: false, error: "Lỗi khi lấy lịch sử các kỳ kiểm toán AI." });
  }
}

export async function getReviewAuditRunById(req, res) {
  try {
    const runId = Number(req.params.runId);
    const pool = getPool();
    const runRes = await pool.request().input("id", sql.Int, runId).query("SELECT * FROM ReviewAuditRuns WHERE id = @id");
    if (!runRes.recordset.length) {
      return res.status(404).json({ success: false, error: "Không tìm thấy kỳ kiểm toán." });
    }
    const run = runRes.recordset[0];

    const reviewsRes = await pool.request().input("run_id", sql.Int, runId).query(`
      SELECT r.id, r.product_id, r.rating, r.title, r.content, r.status, r.version,
             r.audit_status, r.ai_analysis_json, r.is_hidden_by_admin,
             p.product_code, p.name AS product_name, u.name AS customer_name
      FROM ProductReviews r
      JOIN Products p ON p.id = r.product_id
      JOIN Users u ON u.id = r.user_id
      WHERE r.ai_audit_run_id = @run_id
    `);

    return res.json({
      success: true,
      run: {
        ...run,
        summary: run.summary_json ? JSON.parse(run.summary_json) : null,
        reviews: reviewsRes.recordset.map((r) => ({
          ...r,
          aiAnalysis: r.ai_analysis_json ? JSON.parse(r.ai_analysis_json) : null,
        })),
      },
    });
  } catch (err) {
    console.error("[Get Audit Run By ID] Error:", err);
    return res.status(500).json({ success: false, error: "Lỗi khi xem chi tiết kỳ kiểm toán." });
  }
}

export async function moderateReview(req, res) {
  const id = Number(req.params.id);
  const status = String(req.body.status || "");
  const note = String(req.body.note || "").trim();
  if (!id || !["published", "hidden", "rejected"].includes(status)) {
    return res.status(400).json({ success: false, error: "Trạng thái kiểm duyệt không hợp lệ." });
  }
  const pool = getPool();
  const existing = await pool.request().input("id", sql.Int, id).query("SELECT status FROM ProductReviews WHERE id = @id");
  if (!existing.recordset.length) return res.status(404).json({ success: false, error: "Không tìm thấy đánh giá." });
  const prevStatus = existing.recordset[0].status;

  const isHidden = status === "hidden" ? 1 : 0;
  const actor = `${req.user.name} (${req.user.role.toUpperCase()})`;

  await pool.request()
    .input("id", sql.Int, id)
    .input("status", sql.NVarChar, status)
    .input("is_hidden", sql.Bit, isHidden)
    .input("note", sql.NVarChar, note || null)
    .input("admin_id", sql.NVarChar, req.user.id)
    .query(`
      UPDATE ProductReviews
      SET status = @status,
          is_hidden_by_admin = @is_hidden,
          audit_status = 'reviewed_by_admin',
          moderation_note = @note,
          moderated_by = @admin_id,
          moderated_at = GETDATE(),
          updated_at = GETDATE()
      WHERE id = @id AND status <> 'deleted'
    `);

  await pool.request()
    .input("review_id", sql.Int, id)
    .input("action", sql.NVarChar, status === "hidden" ? "hide" : "keep")
    .input("prev_status", sql.NVarChar, prevStatus)
    .input("new_status", sql.NVarChar, status)
    .input("reason", sql.NVarChar, note || null)
    .input("actor", sql.NVarChar, actor)
    .query(`
      INSERT INTO ReviewModerationHistory (review_id, action, previous_status, new_status, reason, performed_by, created_at)
      VALUES (@review_id, @action, @prev_status, @new_status, @reason, @actor, GETDATE())
    `);

  return res.json({ success: true, id, status });
}

export async function decideReview(req, res) {
  const id = Number(req.params.id);
  const action = String(req.body.action || "").trim(); // 'keep', 'hide', 'restore'
  const reason = String(req.body.reason || "").trim();
  if (!id || !["keep", "hide", "restore"].includes(action)) {
    return res.status(400).json({ success: false, error: "Hành động kiểm duyệt không hợp lệ. Cho phép: keep, hide, restore." });
  }
  const pool = getPool();
  const existing = await pool.request().input("id", sql.Int, id).query("SELECT id, status, is_hidden_by_admin FROM ProductReviews WHERE id = @id");
  if (!existing.recordset.length) return res.status(404).json({ success: false, error: "Không tìm thấy đánh giá." });

  const prevStatus = existing.recordset[0].status;
  let newStatus = prevStatus;
  let isHidden = existing.recordset[0].is_hidden_by_admin;

  if (action === "keep") {
    newStatus = "published";
    isHidden = 0;
  } else if (action === "hide") {
    newStatus = "hidden";
    isHidden = 1;
  } else if (action === "restore") {
    newStatus = "published";
    isHidden = 0;
  }

  const actor = `${req.user.name} (${req.user.role.toUpperCase()})`;

  await pool.request()
    .input("id", sql.Int, id)
    .input("status", sql.NVarChar, newStatus)
    .input("is_hidden", sql.Bit, isHidden)
    .input("note", sql.NVarChar, reason || null)
    .input("admin_id", sql.NVarChar, req.user.id)
    .query(`
      UPDATE ProductReviews
      SET status = @status,
          is_hidden_by_admin = @is_hidden,
          audit_status = 'reviewed_by_admin',
          moderation_note = @note,
          moderated_by = @admin_id,
          moderated_at = GETDATE(),
          updated_at = GETDATE()
      WHERE id = @id
    `);

  await pool.request()
    .input("review_id", sql.Int, id)
    .input("action", sql.NVarChar, action)
    .input("prev_status", sql.NVarChar, prevStatus)
    .input("new_status", sql.NVarChar, newStatus)
    .input("reason", sql.NVarChar, reason || null)
    .input("actor", sql.NVarChar, actor)
    .query(`
      INSERT INTO ReviewModerationHistory (review_id, action, previous_status, new_status, reason, performed_by, created_at)
      VALUES (@review_id, @action, @prev_status, @new_status, @reason, @actor, GETDATE())
    `);

  return res.json({ success: true, id, status: newStatus, action });
}

export async function bulkDecideReviews(req, res) {
  const ids = req.body.ids;
  const action = String(req.body.action || "").trim(); // 'bulk_keep', 'bulk_hide', 'bulk_restore'
  const reason = String(req.body.reason || "").trim();
  if (!Array.isArray(ids) || !ids.length || !["bulk_keep", "bulk_hide", "bulk_restore"].includes(action)) {
    return res.status(400).json({ success: false, error: "Danh sách ID hoặc hành động hàng loạt không hợp lệ." });
  }
  const pool = getPool();
  const actor = `${req.user.name} (${req.user.role.toUpperCase()})`;
  const singleAction = action.replace("bulk_", "");
  const targetStatus = (singleAction === "hide") ? "hidden" : "published";
  const isHidden = (singleAction === "hide") ? 1 : 0;

  for (const id of ids) {
    const existing = await pool.request().input("id", sql.Int, Number(id)).query("SELECT status FROM ProductReviews WHERE id = @id");
    if (!existing.recordset.length) continue;
    const prevStatus = existing.recordset[0].status;

    await pool.request()
      .input("id", sql.Int, Number(id))
      .input("status", sql.NVarChar, targetStatus)
      .input("is_hidden", sql.Bit, isHidden)
      .input("note", sql.NVarChar, reason || null)
      .input("admin_id", sql.NVarChar, req.user.id)
      .query(`
        UPDATE ProductReviews
        SET status = @status,
            is_hidden_by_admin = @is_hidden,
            audit_status = 'reviewed_by_admin',
            moderation_note = @note,
            moderated_by = @admin_id,
            moderated_at = GETDATE(),
            updated_at = GETDATE()
        WHERE id = @id
      `);

    await pool.request()
      .input("review_id", sql.Int, Number(id))
      .input("action", sql.NVarChar, action)
      .input("prev_status", sql.NVarChar, prevStatus)
      .input("new_status", sql.NVarChar, targetStatus)
      .input("reason", sql.NVarChar, reason || null)
      .input("actor", sql.NVarChar, actor)
      .query(`
        INSERT INTO ReviewModerationHistory (review_id, action, previous_status, new_status, reason, performed_by, created_at)
        VALUES (@review_id, @action, @prev_status, @new_status, @reason, @actor, GETDATE())
      `);
  }

  return res.json({ success: true, count: ids.length, action });
}

export async function getReviewModerationHistory(req, res) {
  try {
    const pool = getPool();
    const reviewId = req.query.reviewId ? Number(req.query.reviewId) : null;
    let query = "SELECT TOP 100 * FROM ReviewModerationHistory";
    if (reviewId) {
      query += " WHERE review_id = @review_id";
    }
    query += " ORDER BY created_at DESC";

    const request = pool.request();
    if (reviewId) request.input("review_id", sql.Int, reviewId);
    const result = await request.query(query);

    return res.json({ success: true, history: result.recordset });
  } catch (err) {
    console.error("[Get Moderation History] Error:", err);
    return res.status(500).json({ success: false, error: "Lỗi khi lấy lịch sử kiểm duyệt." });
  }
}

// ==========================================
// 3. PRODUCT ENGAGEMENT & WISHLIST DASHBOARD
// ==========================================

export async function getProductInsights(req, res) {
  const pool = getPool();
  const result = await pool.request().query(`
    SELECT p.id product_id, p.product_code, p.name, p.gender, p.category, p.images_json,
      COALESCE(f.current_favorites,0) current_favorites, COALESCE(e.added_30d,0) added_30d, COALESCE(e.removed_30d,0) removed_30d,
      COALESCE(r.review_count,0) review_count, COALESCE(r.average_rating,0) average_rating,
      COALESCE(s.units_sold,0) units_sold
    FROM Products p
    OUTER APPLY (SELECT COUNT(*) current_favorites FROM ProductFavorites WHERE product_id=p.id AND is_active=1) f
    OUTER APPLY (SELECT SUM(CASE WHEN event_type='added' THEN 1 ELSE 0 END) added_30d, SUM(CASE WHEN event_type='removed' THEN 1 ELSE 0 END) removed_30d FROM ProductFavoriteEvents WHERE product_id=p.id AND created_at>=DATEADD(day,-30,GETDATE())) e
    OUTER APPLY (
      SELECT COUNT(*) review_count, AVG(CAST(r.rating AS DECIMAL(5,2))) average_rating
      FROM ProductReviews r
      WHERE r.product_id=p.id AND r.status='published'
        AND NOT EXISTS (SELECT 1 FROM ReturnRequests rr WHERE rr.order_item_id=r.order_item_id AND rr.status<>'exchanged')
    ) r
    OUTER APPLY (SELECT SUM(oi.quantity) units_sold FROM OrderItems oi JOIN Orders o ON o.id=oi.order_id WHERE oi.product_id=p.id AND o.order_status='delivered') s
    WHERE p.is_active=1 ORDER BY current_favorites DESC, average_rating DESC, p.id`);
  return res.json({ success: true, insights: result.recordset.map((row) => ({ ...row, images: parseImages(row.images_json) })) });
}

/**
 * Section C: Wishlist Analytics Dashboard
 * Calculates unique authenticated customers, conversion rate, cohort trends,
 * SKU demand protection and privacy compliance.
 */
export async function getWishlistAnalytics(req, res) {
  try {
    const pool = getPool();

    // 1. Unique authenticated customers currently having active items in wishlist
    const activeUsersRes = await pool.request().query(`
      SELECT COUNT(DISTINCT user_id) AS total_active_customers,
             COUNT(*) AS total_active_items
      FROM ProductFavorites
      WHERE is_active = 1
    `);
    const totalActiveCustomers = activeUsersRes.recordset[0]?.total_active_customers || 0;
    const totalActiveItems = activeUsersRes.recordset[0]?.total_active_items || 0;

    // 2. All-time unique authenticated customers who ever added an item
    const allTimeUsersRes = await pool.request().query(`
      SELECT COUNT(DISTINCT user_id) AS total_all_time_customers
      FROM ProductFavoriteEvents
      WHERE event_type = 'added'
    `);
    const totalAllTimeCustomers = allTimeUsersRes.recordset[0]?.total_all_time_customers || 0;

    // 3. Conversion tracking: Users who favorited product X and later purchased product X (order paid/delivered/shipped)
    const conversionRes = await pool.request().query(`
      WITH WishlistAdds AS (
        SELECT user_id, product_id, MIN(created_at) AS first_added_at
        FROM ProductFavoriteEvents
        WHERE event_type = 'added'
        GROUP BY user_id, product_id
      ),
      ConvertedOrders AS (
        SELECT DISTINCT w.user_id, w.product_id
        FROM WishlistAdds w
        JOIN Orders o ON o.customer_id = w.user_id
        JOIN OrderItems oi ON oi.order_id = o.id AND oi.product_id = w.product_id
        WHERE o.created_at >= w.first_added_at
          AND (o.order_status IN ('delivered', 'shipped', 'processing', 'confirmed')
               OR EXISTS (SELECT 1 FROM Payments p WHERE p.order_id = o.id AND p.payment_status = 'paid'))
      )
      SELECT COUNT(DISTINCT user_id) AS total_converted_customers,
             COUNT(*) AS total_conversions
      FROM ConvertedOrders
    `);

    const totalConvertedCustomers = conversionRes.recordset[0]?.total_converted_customers || 0;
    const storewideConversionRate = totalAllTimeCustomers > 0
      ? Number(((totalConvertedCustomers / totalAllTimeCustomers) * 100).toFixed(1))
      : 0;

    // 4. Per-product wishlist statistics & conversion
    const productStatsRes = await pool.request().query(`
      WITH WishlistPerProduct AS (
        SELECT product_id,
               COUNT(DISTINCT CASE WHEN is_active = 1 THEN user_id END) AS current_active_users,
               COUNT(DISTINCT user_id) AS all_time_users
        FROM ProductFavorites
        GROUP BY product_id
      ),
      PurchasesFromWishlist AS (
        SELECT w.product_id, COUNT(DISTINCT w.user_id) AS buyers_from_wishlist
        FROM ProductFavoriteEvents w
        JOIN Orders o ON o.customer_id = w.user_id
        JOIN OrderItems oi ON oi.order_id = o.id AND oi.product_id = w.product_id
        WHERE w.event_type = 'added'
          AND o.created_at >= w.created_at
          AND (o.order_status IN ('delivered', 'shipped', 'processing', 'confirmed')
               OR EXISTS (SELECT 1 FROM Payments p WHERE p.order_id = o.id AND p.payment_status = 'paid'))
        GROUP BY w.product_id
      )
      SELECT p.id AS product_id, p.product_code, p.name AS product_name, p.category, p.gender, p.price,
             COALESCE(w.current_active_users, 0) AS current_active_users,
             COALESCE(w.all_time_users, 0) AS all_time_users,
             COALESCE(pw.buyers_from_wishlist, 0) AS buyers_from_wishlist
      FROM Products p
      LEFT JOIN WishlistPerProduct w ON w.product_id = p.id
      LEFT JOIN PurchasesFromWishlist pw ON pw.product_id = p.id
      WHERE p.is_active = 1
      ORDER BY current_active_users DESC, all_time_users DESC, p.id ASC
    `);

    const productStats = productStatsRes.recordset.map((row) => ({
      productId: row.product_id,
      productCode: row.product_code,
      name: row.product_name,
      category: row.category,
      gender: row.gender,
      price: Number(row.price),
      currentFavorites: row.current_active_users,
      allTimeFavorites: row.all_time_users,
      buyersFromWishlist: row.buyers_from_wishlist,
      conversionRate: row.all_time_users > 0
        ? Number(((row.buyers_from_wishlist / row.all_time_users) * 100).toFixed(1))
        : 0,
      skuDemandNote: "Nhu cầu SKU: Chưa thu thập lựa chọn màu/size trên danh sách yêu thích cấp sản phẩm.",
    }));

    // 5. Timeline trends (last 30 days daily additions vs removals)
    const timelineRes = await pool.request().query(`
      SELECT CAST(created_at AS DATE) AS date_bucket,
             SUM(CASE WHEN event_type = 'added' THEN 1 ELSE 0 END) AS additions,
             SUM(CASE WHEN event_type = 'removed' THEN 1 ELSE 0 END) AS removals
      FROM ProductFavoriteEvents
      WHERE created_at >= DATEADD(day, -30, GETDATE())
      GROUP BY CAST(created_at AS DATE)
      ORDER BY date_bucket ASC
    `);

    return res.json({
      success: true,
      analytics: {
        totalActiveCustomers,
        totalActiveItems,
        totalAllTimeCustomers,
        totalConvertedCustomers,
        storewideConversionRate,
        productStats,
        timelineTrends: timelineRes.recordset,
        privacyNotice: "Dữ liệu Wishlist được tổng hợp ẩn danh theo chỉ số hành vi. Hệ thống tuân thủ bảo mật, không xuất thông tin cá nhân và không tự gửi email tiếp thị.",
      },
    });
  } catch (err) {
    console.error("[Get Wishlist Analytics] Error:", err);
    return res.status(500).json({ success: false, error: "Lỗi hệ thống khi tổng hợp phân tích wishlist." });
  }
}
