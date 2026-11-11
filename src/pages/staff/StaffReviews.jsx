import { useEffect, useMemo, useState } from "react";
import { reviewOperationsAPI } from "../../services/api";

const imageUrl = (value) => value ? (String(value).startsWith("/") ? value : `/${value}`) : "/image/placeholder.webp";

export default function StaffReviews() {
  const [reviews,setReviews]=useState([]); const [query,setQuery]=useState(""); const [status,setStatus]=useState("unanswered");
  const [rating,setRating]=useState("all"); const [editing,setEditing]=useState(null); const [content,setContent]=useState("");
  const [message,setMessage]=useState(""); const [busy,setBusy]=useState(false); const [page,setPage]=useState(1);
  const load=async()=>{const data=await reviewOperationsAPI.getAll();setReviews(data.reviews||[]);};
  useEffect(()=>{load().catch((error)=>setMessage(error.message));},[]);
  const filtered=useMemo(()=>reviews.filter((review)=>{
    const text=`${review.product_name} ${review.product_code} ${review.customer_name} ${review.content}`.toLowerCase();
    return (!query||text.includes(query.toLowerCase()))&&(status==="all"||review.reply_status===status)&&(rating==="all"||Number(review.rating)===Number(rating));
  }),[reviews,query,status,rating]);
  const pages=Math.max(1,Math.ceil(filtered.length/8)); const shown=filtered.slice((page-1)*8,page*8);
  const startReply=(review)=>{setEditing(review.id);setContent(review.reply_content||"");setMessage("");};
  const save=async(reviewId)=>{setBusy(true);setMessage("");try{await reviewOperationsAPI.saveReply(reviewId,content);setEditing(null);setContent("");await load();setMessage("Đã lưu phản hồi chính thức của Maison Rue.");}catch(error){setMessage(error.message);}finally{setBusy(false);}};
  const remove=async(reviewId)=>{if(!window.confirm("Thu hồi phản hồi này? Lịch sử vẫn được lưu để kiểm toán."))return;setBusy(true);try{await reviewOperationsAPI.removeReply(reviewId);await load();setMessage("Đã thu hồi phản hồi.");}catch(error){setMessage(error.message);}finally{setBusy(false);}};
  return <div className="staff-reviews-page"><div className="staff-reviews-heading"><div><p className="eyebrow">Chăm sóc khách hàng</p><h1>Đánh giá khách hàng</h1><p>Ưu tiên đánh giá thấp và những đánh giá chưa được Maison Rue phản hồi.</p></div><div><strong>{reviews.filter((item)=>item.reply_status==="unanswered").length}</strong><span>chưa phản hồi</span></div></div>
    {message&&<div className={`staff-review-message ${message.startsWith("Đã")?"success":"error"}`}>{message}<button onClick={()=>setMessage("")}>×</button></div>}
    <div className="staff-review-filters"><label>Tìm kiếm<input value={query} onChange={(event)=>{setQuery(event.target.value);setPage(1);}} placeholder="Sản phẩm, khách hàng, nội dung"/></label><label>Phản hồi<select value={status} onChange={(event)=>{setStatus(event.target.value);setPage(1);}}><option value="unanswered">Chưa phản hồi</option><option value="answered">Đã phản hồi</option><option value="all">Tất cả</option></select></label><label>Số sao<select value={rating} onChange={(event)=>{setRating(event.target.value);setPage(1);}}><option value="all">Tất cả</option>{[1,2,3,4,5].map((value)=><option value={value} key={value}>{value} sao</option>)}</select></label><strong>{filtered.length} đánh giá</strong></div>
    <div className="staff-review-list">{shown.map((review)=><article key={review.id} className={Number(review.rating)<=2?"priority":""}><img src={imageUrl(review.images?.[0])} alt=""/><div className="staff-review-content"><div className="staff-review-meta"><div><h2>{review.product_name}</h2><small>{review.product_code} · {review.selected_color}/{review.selected_size} · Đơn {review.order_id}</small></div><span>{"★".repeat(review.rating)}{"☆".repeat(5-review.rating)}</span></div><p className="staff-review-customer"><strong>{review.customer_name}</strong> · {new Date(review.created_at).toLocaleDateString("vi-VN")}</p>{review.title&&<h3>{review.title}</h3>}<blockquote>{review.content}</blockquote>
      {review.reply_content&&<div className="staff-official-reply"><strong>Phản hồi từ Maison Rue</strong><p>{review.reply_content}</p><small>{review.reply_author_name || (review.reply_created_by_role === "admin" ? "Quản trị viên" : "Nhân viên chăm sóc")} · cập nhật {new Date(review.reply_updated_at).toLocaleString("vi-VN")}</small></div>}
      {editing===review.id?<div className="staff-reply-editor"><label>Phản hồi chính thức<textarea maxLength="1500" minLength="5" value={content} onChange={(event)=>setContent(event.target.value)} placeholder="Trả lời rõ ràng, lịch sự và không nêu thông tin cá nhân hoặc nội dung đơn hàng nhạy cảm."/></label><small>{content.length}/1.500 ký tự</small><div><button onClick={()=>setEditing(null)}>Hủy</button><button className="primary" disabled={busy||content.trim().length<5} onClick={()=>save(review.id)}>{busy?"Đang lưu":"Lưu phản hồi"}</button></div></div>:<div className="staff-review-actions"><button className="primary" onClick={()=>startReply(review)}>{review.reply_content?"Chỉnh sửa phản hồi":"Trả lời đánh giá"}</button>{review.reply_content&&<button onClick={()=>remove(review.id)}>Thu hồi</button>}</div>}
    </div></article>)}{!shown.length&&<div className="staff-review-empty">Không có đánh giá phù hợp với bộ lọc hiện tại.</div>}</div>
    {pages>1&&<div className="staff-orders-pagination"><button disabled={page<=1} onClick={()=>setPage((value)=>value-1)}>← Trước</button><span>Trang {page}/{pages}</span><button disabled={page>=pages} onClick={()=>setPage((value)=>value+1)}>Sau →</button></div>}
  </div>;
}
