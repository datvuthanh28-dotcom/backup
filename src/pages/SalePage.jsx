import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import ProductCard from "../components/ProductCard";
import { useStore } from "../hooks/useStore";
import useDocumentTitle from "../hooks/useDocumentTitle";
import { promotionAPI } from "../services/api";

const parseIds = (value) => new Set(String(value || "").split(",").map(Number).filter(Number.isFinite));
const hasVietnamese = (value) => /[À-ỹ]/.test(String(value || ""));

function campaignTitle(campaign) {
  const value = String(campaign?.public_title || campaign?.name || "").trim();
  if (!value) return "Seasonal Edit";
  const translated = value.replace(/\s*[—-]\s*Ưu đãi\s*(\d+)%/gi, " — $1% Off").replace(/Ưu đãi\s*(\d+)%/gi, "$1% Off");
  if (!hasVietnamese(translated)) return translated;
  const type = String(campaign?.campaign_type || "").toLowerCase();
  if (type.includes("black")) return "Black Friday";
  if (type.includes("tet") || type.includes("lunar")) return "Lunar New Year Edit";
  if (type.includes("summer")) return "Summer Sale";
  if (type.includes("year") || type.includes("end")) return "Year-End Sale";
  if (type.includes("clearance") || type.includes("inventory")) return "Last Chance";
  return "Maison Rue Seasonal Edit";
}

function campaignDescription(campaign) {
  const value = String(campaign?.public_description || "").trim();
  if (value && !hasVietnamese(value)) return value;
  return "A considered selection of Maison Rue pieces, available at preferred pricing for a limited time.";
}

function campaignImage(campaign, products) {
  const banner = String(campaign?.banner_url || "").trim();
  if (banner) return banner.startsWith("/") ? banner : `/${banner}`;
  const product = products[0];
  const image = product?.images?.[0] || Object.values(product?.colorImages || {})[0]?.[0];
  return image ? `/${String(image).replace(/^\//, "")}` : "";
}

function formatEndDate(value) {
  if (!value) return "While stocks last";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "While stocks last";
  return `Ends ${new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" }).format(date)}`;
}

export default function SalePage() {
  useDocumentTitle("Private Sale");
  const { slug } = useParams();
  const { products } = useStore();
  const [campaigns, setCampaigns] = useState([]);
  const [campaignsLoading, setCampaignsLoading] = useState(true);
  const [error, setError] = useState("");
  const [category, setCategory] = useState("all");
  const [audience, setAudience] = useState("all");
  const [discount, setDiscount] = useState("all");
  const [sortBy, setSortBy] = useState("recommended");

  useEffect(() => {
    let active = true;
    promotionAPI.getCampaigns()
      .then((response) => { if (active) setCampaigns(response.campaigns || []); })
      .catch((requestError) => { if (active) setError(requestError.message || "We could not load the current offers."); })
      .finally(() => { if (active) setCampaignsLoading(false); });
    return () => { active = false; };
  }, []);

  const selectedCampaign = slug ? campaigns.find((campaign) => campaign.slug === slug) : null;
  const campaignProductIds = useMemo(() => selectedCampaign ? parseIds(selectedCampaign.product_ids) : null, [selectedCampaign]);
  const saleProducts = useMemo(() => products.filter((product) => {
    const discounted = Number(product.promotionDiscount || 0) > 0 && Number(product.promotionPrice) < Number(product.price);
    if (!discounted) return false;
    if (!selectedCampaign) return true;
    return campaignProductIds.has(Number(product.id)) || String(selectedCampaign.variant_values || "").includes(`MR-${String(product.id).padStart(3, "0")}`);
  }), [products, selectedCampaign, campaignProductIds]);

  const categories = useMemo(() => [...new Set(saleProducts.map((product) => product.productType || product.category).filter(Boolean))].sort(), [saleProducts]);
  const audiences = useMemo(() => [...new Set(saleProducts.map((product) => product.audience || product.gender).filter(Boolean))].sort(), [saleProducts]);
  const visibleProducts = useMemo(() => {
    const result = saleProducts.filter((product) => {
      const productCategory = String(product.productType || product.category || "").toLowerCase();
      const productAudience = String(product.audience || product.gender || "").toLowerCase();
      const reduction = Number(product.price) > 0 ? Math.round((1 - Number(product.promotionPrice) / Number(product.price)) * 100) : 0;
      if (category !== "all" && productCategory !== category.toLowerCase()) return false;
      if (audience !== "all" && productAudience !== audience.toLowerCase()) return false;
      if (discount !== "all" && reduction < Number(discount)) return false;
      return true;
    });
    return result.sort((left, right) => {
      if (sortBy === "discount") return (1 - Number(right.promotionPrice) / Number(right.price)) - (1 - Number(left.promotionPrice) / Number(left.price));
      if (sortBy === "price-low") return Number(left.promotionPrice) - Number(right.promotionPrice);
      if (sortBy === "price-high") return Number(right.promotionPrice) - Number(left.promotionPrice);
      if (sortBy === "newest") return Number(right.id) - Number(left.id);
      return Number(right.promotionDiscount || 0) - Number(left.promotionDiscount || 0);
    });
  }, [saleProducts, category, audience, discount, sortBy]);

  const highestDiscount = saleProducts.reduce((maximum, product) => {
    const value = Number(product.price) > 0 ? Math.round((1 - Number(product.promotionPrice) / Number(product.price)) * 100) : 0;
    return Math.max(maximum, value);
  }, 0);
  const featuredCampaign = selectedCampaign || campaigns[0] || null;
  const heroImage = campaignImage(featuredCampaign, saleProducts);
  const clearFilters = () => { setCategory("all"); setAudience("all"); setDiscount("all"); setSortBy("recommended"); };
  const filtersActive = category !== "all" || audience !== "all" || discount !== "all";

  return (
    <main className="sale-page">
      <section className="sale-hero">
        <div className="sale-hero__copy">
          <p className="eyebrow">MAISON RUE PRIVATE SALE</p>
          <h1>{selectedCampaign ? campaignTitle(selectedCampaign) : "A Private Edit"}</h1>
          <p>{selectedCampaign ? campaignDescription(selectedCampaign) : "A considered selection of seasonal pieces, available at preferred pricing for a limited time."}</p>
          <div className="sale-hero__actions"><a href="#sale-collection">Shop All Offers</a><span>{formatEndDate(featuredCampaign?.end_at)}</span></div>
        </div>
        <div className="sale-hero__visual">
          {heroImage ? <img src={heroImage} alt="Maison Rue private sale selection" /> : <div className="sale-hero__monogram">MR</div>}
          <div className="sale-hero__offer"><span>{campaignTitle(featuredCampaign)}</span><strong>{highestDiscount > 0 ? `Up to ${highestDiscount}% off` : "Preferred pricing"}</strong><small>Selected styles only</small></div>
        </div>
      </section>

      {campaigns.length > 0 && <nav className="sale-campaign-tabs" aria-label="Active sale events"><Link className={!slug ? "active" : ""} to="/sale">All Offers</Link>{campaigns.map((campaign) => <Link className={slug === campaign.slug ? "active" : ""} key={campaign.id} to={`/sale/${campaign.slug}`}>{campaignTitle(campaign)}</Link>)}</nav>}
      {error && <p className="sale-message sale-message--error">{error}</p>}
      {campaignsLoading && <section className="sale-empty"><p>Loading the current offers…</p></section>}
      {!campaignsLoading && !error && saleProducts.length === 0 && <section className="sale-empty"><p className="eyebrow">PRIVATE SALE</p><h2>No offers are currently open</h2><p>Expired, fully redeemed or out-of-budget events are removed automatically.</p><Link to="/">Explore the Collection</Link></section>}

      {saleProducts.length > 0 && <section id="sale-collection" className="sale-collection">
        <div className="sale-collection__heading"><div><p className="eyebrow">THE SALE EDIT</p><h2>{visibleProducts.length} {visibleProducts.length === 1 ? "style" : "styles"} on offer</h2></div><span>Available for a limited time, while stocks last</span></div>
        <div className="sale-toolbar">
          <label><span>Category</span><select value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">All categories</option>{categories.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          <label><span>Collection</span><select value={audience} onChange={(event) => setAudience(event.target.value)}><option value="all">Everyone</option>{audiences.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          <label><span>Discount</span><select value={discount} onChange={(event) => setDiscount(event.target.value)}><option value="all">All reductions</option><option value="10">10% or more</option><option value="15">15% or more</option><option value="20">20% or more</option></select></label>
          <label className="sale-toolbar__sort"><span>Sort by</span><select value={sortBy} onChange={(event) => setSortBy(event.target.value)}><option value="recommended">Recommended</option><option value="discount">Highest discount</option><option value="price-low">Price: Low to High</option><option value="price-high">Price: High to Low</option><option value="newest">Newest</option></select></label>
          {filtersActive && <button type="button" onClick={clearFilters}>Clear filters</button>}
        </div>
        {visibleProducts.length ? <div className="sale-product-grid">{visibleProducts.map((product) => <ProductCard key={product.id} product={product} />)}</div> : <div className="sale-filter-empty"><h3>No styles match your selection</h3><p>Adjust your filters to discover more of the sale edit.</p><button type="button" onClick={clearFilters}>Clear Filters</button></div>}
        <details className="sale-terms"><summary>Offer Details <span aria-hidden="true">+</span></summary><div><p>Discounts are applied automatically to eligible products while each event remains active.</p><p>Promo codes cannot be combined unless expressly stated. Offers remain subject to availability and Maison Rue’s standard return policy.</p></div></details>
      </section>}
    </main>
  );
}
