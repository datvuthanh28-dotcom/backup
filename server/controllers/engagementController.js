import sql from "mssql";
import { getPool } from "../config/db.js";

const parseImages = (value) => {
  try { return JSON.parse(value || "[]"); } catch { return []; }
};

export async function getPublicReviews(req, res) {
  const productId = Number(req.params.productId);
  if (!productId) return res.status(400).json({ success: false, error: "Sản phẩm không hợp lệ." });
  const pool = getPool();
  const result = await pool.request().input("product_id", sql.Int, productId).query(`
    SELECT r.id,r.product_id,r.rating,r.title,r.content,r.selected_color,r.selected_size,
      r.is_verified_purchase,r.created_at,r.updated_at,u.name AS customer_name
    FROM ProductReviews r JOIN Users u ON u.id=r.user_id
    WHERE r.product_id=@product_id AND r.status='published'
      -- A review is only displayed while the purchased line remains reviewable.
      -- A completed exchange is explicitly eligible; every other return state is not.
      AND NOT EXISTS (SELECT 1 FROM ReturnRequests rr WHERE rr.order_item_id=r.order_item_id AND rr.status<>'exchanged')
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

export async function saveReview(req, res) {
  const productId = Number(req.params.productId);
  const rating = Number(req.body.rating);
  const title = String(req.body.title || "").trim();
  const content = String(req.body.content || "").trim();
  if (!productId || !Number.isInteger(rating) || rating < 1 || rating > 5 || content.length < 10) return res.status(400).json({ success: false, error: "Điểm đánh giá hoặc nội dung chưa hợp lệ (tối thiểu 10 ký tự)." });
  const pool = getPool();
  const requestedOrderId = String(req.body.orderId || "").trim();
  const requestedOrderItemId = Number(req.body.orderItemId) || null;
  const purchaseRequest = pool.request().input("user_id", sql.NVarChar, req.user.id).input("product_id", sql.Int, productId)
    .input("order_id", sql.NVarChar, requestedOrderId || null).input("order_item_id", sql.Int, requestedOrderItemId);
  const purchase = await purchaseRequest.query(`SELECT TOP 1 oi.id order_item_id,oi.order_id,oi.selected_color,oi.selected_size
    FROM OrderItems oi JOIN Orders o ON o.id=oi.order_id
    WHERE o.customer_id=@user_id AND oi.product_id=@product_id AND o.order_status='delivered'
      AND NOT EXISTS (SELECT 1 FROM ReturnRequests rr WHERE rr.order_item_id=oi.id AND rr.status<>'exchanged')
      AND (@order_id IS NULL OR o.id=@order_id) AND (@order_item_id IS NULL OR oi.id=@order_item_id)
    ORDER BY COALESCE(o.delivered_at,o.updated_at) DESC,oi.id DESC`);
  if (!purchase.recordset.length) return res.status(403).json({ success: false, error: "Chỉ khách đã nhận sản phẩm mới có thể đánh giá." });
  const item = purchase.recordset[0];
  await pool.request().input("product_id", sql.Int, productId).input("user_id", sql.NVarChar, req.user.id).input("order_id", sql.NVarChar, item.order_id).input("order_item_id", sql.Int, item.order_item_id).input("rating", sql.TinyInt, rating).input("title", sql.NVarChar, title || null).input("content", sql.NVarChar, content).input("color", sql.NVarChar, item.selected_color).input("size", sql.NVarChar, item.selected_size).query(`
    MERGE ProductReviews AS target USING (SELECT @user_id user_id,@product_id product_id) source ON target.user_id=source.user_id AND target.product_id=source.product_id
    WHEN MATCHED THEN UPDATE SET order_id=@order_id,order_item_id=@order_item_id,rating=@rating,title=@title,content=@content,selected_color=@color,selected_size=@size,status='published',moderation_note=NULL,updated_at=GETDATE()
    WHEN NOT MATCHED THEN INSERT(product_id,user_id,order_id,order_item_id,rating,title,content,selected_color,selected_size,is_verified_purchase,status) VALUES(@product_id,@user_id,@order_id,@order_item_id,@rating,@title,@content,@color,@size,1,'published');`);
  return getReviewEligibility(req, res);
}

export async function deleteReview(req, res) {
  const productId = Number(req.params.productId);
  const pool = getPool();
  await pool.request().input("user_id", sql.NVarChar, req.user.id).input("product_id", sql.Int, productId).query("UPDATE ProductReviews SET status='deleted',updated_at=GETDATE() WHERE user_id=@user_id AND product_id=@product_id");
  return res.json({ success: true });
}

export async function getProductInsights(req, res) {
  const pool = getPool();
  const result = await pool.request().query(`
    SELECT p.id product_id,p.product_code,p.name,p.gender,p.category,p.images_json,
      COALESCE(f.current_favorites,0) current_favorites,COALESCE(e.added_30d,0) added_30d,COALESCE(e.removed_30d,0) removed_30d,
      COALESCE(r.review_count,0) review_count,COALESCE(r.average_rating,0) average_rating,
      COALESCE(s.units_sold,0) units_sold
    FROM Products p
    OUTER APPLY (SELECT COUNT(*) current_favorites FROM ProductFavorites WHERE product_id=p.id AND is_active=1) f
    OUTER APPLY (SELECT SUM(CASE WHEN event_type='added' THEN 1 ELSE 0 END) added_30d,SUM(CASE WHEN event_type='removed' THEN 1 ELSE 0 END) removed_30d FROM ProductFavoriteEvents WHERE product_id=p.id AND created_at>=DATEADD(day,-30,GETDATE())) e
    OUTER APPLY (
      SELECT COUNT(*) review_count,AVG(CAST(r.rating AS DECIMAL(5,2))) average_rating
      FROM ProductReviews r
      WHERE r.product_id=p.id AND r.status='published'
        AND NOT EXISTS (SELECT 1 FROM ReturnRequests rr WHERE rr.order_item_id=r.order_item_id AND rr.status<>'exchanged')
    ) r
    OUTER APPLY (SELECT SUM(oi.quantity) units_sold FROM OrderItems oi JOIN Orders o ON o.id=oi.order_id WHERE oi.product_id=p.id AND o.order_status='delivered') s
    WHERE p.is_active=1 ORDER BY current_favorites DESC,average_rating DESC,p.id`);
  return res.json({ success: true, insights: result.recordset.map((row) => ({ ...row, images: parseImages(row.images_json) })) });
}

export async function getAdminReviews(req, res) {
  const pool = getPool();
  const result = await pool.request().query(`SELECT r.*,p.product_code,p.name product_name,u.name customer_name,u.email customer_email FROM ProductReviews r JOIN Products p ON p.id=r.product_id JOIN Users u ON u.id=r.user_id WHERE r.status<>'deleted' ORDER BY r.created_at DESC`);
  return res.json({ success: true, reviews: result.recordset });
}

export async function moderateReview(req, res) {
  const id = Number(req.params.id);
  const status = String(req.body.status || "");
  const note = String(req.body.note || "").trim();
  if (!id || !["published", "hidden", "rejected"].includes(status)) return res.status(400).json({ success: false, error: "Trạng thái kiểm duyệt không hợp lệ." });
  const pool = getPool();
  await pool.request().input("id", sql.Int, id).input("status", sql.NVarChar, status).input("note", sql.NVarChar, note || null).input("admin_id", sql.NVarChar, req.user.id).query("UPDATE ProductReviews SET status=@status,moderation_note=@note,moderated_by=@admin_id,moderated_at=GETDATE(),updated_at=GETDATE() WHERE id=@id AND status<>'deleted'");
  return res.json({ success: true });
}
