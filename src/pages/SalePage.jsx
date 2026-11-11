import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import ProductCard from "../components/ProductCard";
import { useStore } from "../hooks/useStore";
import { promotionAPI } from "../services/api";

const parseIds = (value) => new Set(String(value || "").split(",").map(Number).filter(Number.isFinite));

export default function SalePage() {
  const { slug } = useParams();
  const { products } = useStore();
  const [campaigns, setCampaigns] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    promotionAPI.getCampaigns().then((response) => setCampaigns(response.campaigns || [])).catch((requestError) => setError(requestError.message));
  }, []);

  const selectedCampaign = slug ? campaigns.find((campaign) => campaign.slug === slug) : null;
  const campaignProductIds = useMemo(() => selectedCampaign ? parseIds(selectedCampaign.product_ids) : null, [selectedCampaign]);
  const saleProducts = useMemo(() => products.filter((product) => {
    const discounted = Number(product.promotionDiscount || 0) > 0 && Number(product.promotionPrice) < Number(product.price);
    if (!discounted) return false;
    if (!selectedCampaign) return true;
    return campaignProductIds.has(Number(product.id)) || String(selectedCampaign.variant_values || "").includes(`MR-${String(product.id).padStart(3, "0")}`);
  }), [products, selectedCampaign, campaignProductIds]);

  return <main className="sale-page">
    <header className="sale-hero"><p className="eyebrow">Maison Rue Private Sale</p><h1>{selectedCampaign?.public_title || "Selected Sale"}</h1><p>{selectedCampaign?.public_description || "Ưu đãi có giới hạn trên những thiết kế được chọn. Giá khuyến mãi được áp dụng tự động khi chương trình còn hiệu lực."}</p>{!slug && campaigns.length > 1 && <nav>{campaigns.map((campaign) => <Link key={campaign.id} to={`/sale/${campaign.slug}`}>{campaign.public_title || campaign.name}</Link>)}</nav>}</header>
    {error && <p className="sale-message sale-message--error">{error}</p>}
    {!error && saleProducts.length === 0 && <section className="sale-empty"><h2>Chưa có ưu đãi đang mở</h2><p>Các chương trình hết lượt, hết ngân sách hoặc hết thời gian sẽ tự động rời khỏi trang này.</p><Link to="/">Tiếp tục mua sắm</Link></section>}
    {saleProducts.length > 0 && <><div className="sale-summary"><strong>{saleProducts.length} sản phẩm đang ưu đãi</strong><span>Số lượng và thời gian có giới hạn</span></div><section className="sale-product-grid">{saleProducts.map((product) => <ProductCard key={product.id} product={product} />)}</section></>}
  </main>;
}
