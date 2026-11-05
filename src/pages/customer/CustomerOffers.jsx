import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import CustomerAccountSidebar from "../../components/CustomerAccountSidebar";
import useDocumentTitle from "../../hooks/useDocumentTitle";
import { promotionAPI } from "../../services/api";

const money=(value)=>`${Number(value||0).toLocaleString("vi-VN")}đ`;
const benefit=(offer)=>offer.discount_type==="percentage"?`${Number(offer.discount_value)}% off`:offer.discount_type==="fixed_amount"?`${money(offer.discount_value)} off`:offer.discount_type==="free_shipping"?"Complimentary shipping":`${money(offer.discount_value)} off shipping`;

export default function CustomerOffers(){
  useDocumentTitle("My Offers — Maison Rue");
  const [offers,setOffers]=useState([]),[message,setMessage]=useState(""),[loading,setLoading]=useState(true);
  useEffect(()=>{promotionAPI.getMyOffers().then((result)=>setOffers(result.offers||[])).catch((error)=>setMessage(error.message)).finally(()=>setLoading(false));},[]);
  const copy=async(code)=>{await navigator.clipboard.writeText(code);setMessage(`Code ${code} copied.`);};
  return <main className="account-page account-simple"><div className="account-shell"><CustomerAccountSidebar/><section className="account-panel customer-offers"><div className="account-section-heading"><div><p className="eyebrow">JUST FOR YOU</p><h2>My Offers</h2></div></div>{message&&<div className="account-notice">{message}</div>}{loading?<p>Loading your offers...</p>:offers.length?<div className="offer-list">{offers.map((offer)=>{const used=Boolean(offer.used_by_customer)||offer.assignment_status==="used";return <article className={`offer-card${used?" is-used":""}`} key={offer.code_id}><div><span className="offer-card__type">{offer.distribution_type==="targeted"?"Exclusive offer":"Public offer"}</span><h3>{offer.name}</h3><strong>{benefit(offer)}</strong><p>{offer.display_description||offer.description||"Subject to the offer terms."}</p><small>Minimum spend {money(offer.minimum_order_value)}{offer.end_at?` · Expires ${new Date(offer.end_at).toLocaleDateString("en-GB")}`:""}</small></div><div className="offer-card__code"><code>{offer.code}</code>{used?<span>Used</span>:<><button type="button" onClick={()=>copy(offer.code)}>Copy code</button><Link to={`/checkout?promo=${encodeURIComponent(offer.code)}`}>Shop now</Link></>}</div></article>;})}</div>:<div className="account-card"><span>No offers are currently available for your account.</span></div>}</section></div></main>;
}
