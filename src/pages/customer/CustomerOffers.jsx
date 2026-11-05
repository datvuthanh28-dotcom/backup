import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import CustomerAccountSidebar from "../../components/CustomerAccountSidebar";
import useDocumentTitle from "../../hooks/useDocumentTitle";
import { promotionAPI } from "../../services/api";

const money=(value)=>`${Number(value||0).toLocaleString("vi-VN")}đ`;
const benefit=(offer)=>offer.discount_type==="percentage"?`Giảm ${Number(offer.discount_value)}%`:offer.discount_type==="fixed_amount"?`Giảm ${money(offer.discount_value)}`:offer.discount_type==="free_shipping"?"Miễn phí giao hàng":`Giảm ${money(offer.discount_value)} phí giao hàng`;

export default function CustomerOffers(){
  useDocumentTitle("Ưu đãi của tôi — Maison Rue");
  const [offers,setOffers]=useState([]),[message,setMessage]=useState(""),[loading,setLoading]=useState(true);
  useEffect(()=>{promotionAPI.getMyOffers().then((result)=>setOffers(result.offers||[])).catch((error)=>setMessage(error.message)).finally(()=>setLoading(false));},[]);
  const copy=async(code)=>{await navigator.clipboard.writeText(code);setMessage(`Đã sao chép mã ${code}.`);};
  return <main className="account-page account-simple"><div className="account-shell"><CustomerAccountSidebar/><section className="account-panel customer-offers"><div className="account-section-heading"><div><p className="eyebrow">Dành cho bạn</p><h2>Ưu đãi của tôi</h2></div></div>{message&&<div className="account-notice">{message}</div>}{loading?<p>Đang tải ưu đãi...</p>:offers.length?<div className="offer-list">{offers.map((offer)=>{const used=Boolean(offer.used_by_customer)||offer.assignment_status==="used";return <article className={`offer-card${used?" is-used":""}`} key={offer.code_id}><div><span className="offer-card__type">{offer.distribution_type==="targeted"?"Ưu đãi dành riêng":"Ưu đãi công khai"}</span><h3>{offer.name}</h3><strong>{benefit(offer)}</strong><p>{offer.display_description||offer.description||"Áp dụng theo điều kiện chương trình."}</p><small>Đơn tối thiểu {money(offer.minimum_order_value)}{offer.end_at?` · Hết hạn ${new Date(offer.end_at).toLocaleDateString("vi-VN")}`:""}</small></div><div className="offer-card__code"><code>{offer.code}</code>{used?<span>Đã sử dụng</span>:<><button type="button" onClick={()=>copy(offer.code)}>Sao chép</button><Link to={`/checkout?promo=${encodeURIComponent(offer.code)}`}>Dùng ngay</Link></>}</div></article>;})}</div>:<div className="account-card"><span>Hiện chưa có mã ưu đãi phù hợp với tài khoản của bạn.</span></div>}</section></div></main>;
}
