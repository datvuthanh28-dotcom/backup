import ProductCard from "../components/ProductCard";
import useDocumentTitle from "../hooks/useDocumentTitle";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useStore } from "../hooks/useStore";

export default function ProductListPage({ gender, audience, collection, productType, title, eyebrow = "Maison Rue Collection", intro = "Considered materials, enduring silhouettes and understated detail." }) {
  useDocumentTitle(title);
  const { products } = useStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const [type, setType] = useState("all");
  const [sort, setSort] = useState("featured");
  const [sortOpen, setSortOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [priceRange, setPriceRange] = useState({ min: null, max: null });
  const [selectedColors, setSelectedColors] = useState([]);
  const isHeritageCashmere = collection === "Heritage Cashmere";
  const isFallWinterEdit = collection === "Fall/Winter 2026–2027";
  const isAudienceCollection = isHeritageCashmere || isFallWinterEdit;
  const isSuedeCollection = collection === "Suede Essentials";
  const [cashmereAudience, setCashmereAudience] = useState("women");
  const audienceTabs = isHeritageCashmere ? ["women", "men", "kids"] : ["women", "men"];
  const requestedAudience = searchParams.get("audience");
  const selectedAudience = requestedAudience || cashmereAudience;
  const selectAudience = (item) => {
    setCashmereAudience(item);
    if (requestedAudience) {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete("audience");
      setSearchParams(nextParams, { replace: true });
    }
  };
  const requestedProductType = productType || searchParams.get("type");
  const normalizedProductType = requestedProductType?.trim().toLowerCase();
  const requestedSubcategory = searchParams.get("subcategory");
  const matchesAudience = (product) => {
    if (audience) return product.audience === audience;
    if (gender === "unisex") return product.gender === "unisex";
    if (gender === "nam") return product.audience === "men";
    if (gender === "nữ") return product.audience === "women";
    return !gender || product.gender === gender;
  };
  const matchesProduct = (product) => matchesAudience(product) && (!normalizedProductType || product.productType?.toLowerCase() === normalizedProductType);
  const belongsToCollection = (product) => {
    if (isSuedeCollection) return /suede/i.test(product.name);
    return !collection || product.collection === collection || product.collections?.includes(collection);
  };
  const types = [...new Set(products.filter((p) => matchesProduct(p) && belongsToCollection(p)).map((p) => p.subcategory))];
  const catalogItems = products.filter((p) => matchesProduct(p)
      && belongsToCollection(p)
      && (!isAudienceCollection || p.audience === selectedAudience)
      && ((requestedSubcategory || type) === "all" || p.subcategory === (requestedSubcategory || type)));
  const priceBounds = useMemo(() => {
    if (!catalogItems.length) return { min: 0, max: 0 };
    const prices = catalogItems.map((product) => Number(product.price) || 0);
    return { min: Math.min(...prices), max: Math.max(...prices) };
  }, [catalogItems]);
  const selectedMinPrice = priceRange.min == null
    ? priceBounds.min
    : Math.min(priceBounds.max, Math.max(priceBounds.min, priceRange.min));
  const selectedMaxPrice = priceRange.max == null
    ? priceBounds.max
    : Math.max(priceBounds.min, Math.min(priceBounds.max, priceRange.max));
  const priceStep = 10000;
  const priceSpan = Math.max(1, priceBounds.max - priceBounds.min);
  const minPosition = ((selectedMinPrice - priceBounds.min) / priceSpan) * 100;
  const maxPosition = ((selectedMaxPrice - priceBounds.min) / priceSpan) * 100;
  const formatPrice = (value) => `${Number(value || 0).toLocaleString("vi-VN")}đ`;
  const availableColors = useMemo(() => [...new Set(catalogItems.flatMap((product) => product.colors || []))].sort(), [catalogItems]);
  const items = useMemo(() => {
    const filtered = catalogItems.filter((p) => p.price >= selectedMinPrice && p.price <= selectedMaxPrice && (!selectedColors.length || selectedColors.some((color) => p.colors?.includes(color))));
    return [...filtered].sort((a, b) => sort === "price-low" ? a.price - b.price : sort === "price-high" ? b.price - a.price : a.id - b.id);
  }, [catalogItems, sort, selectedColors, selectedMinPrice, selectedMaxPrice]);
  const toggleColor = (color) => setSelectedColors((current) => current.includes(color) ? current.filter((item) => item !== color) : [...current, color]);
  const resetFilters = () => { setPriceRange({ min: null, max: null }); setSelectedColors([]); };
  const hasPriceFilter = selectedMinPrice > priceBounds.min || selectedMaxPrice < priceBounds.max;
  useEffect(() => {
    const onKeyDown = (event) => event.key === "Escape" && setFilterOpen(false);
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
  useEffect(() => {
    setPriceRange({ min: null, max: null });
  }, [selectedAudience, type, requestedSubcategory, normalizedProductType, collection]);

  return (
    <main className="collection-page">
      <div className="collection-hero"><p className="eyebrow">{eyebrow}</p><h1 className="page-title">{title}</h1><p>{intro}</p></div>
      <div className={`catalog-toolbar${isAudienceCollection ? " cashmere-toolbar" : ""}`}>
        {isAudienceCollection ? (
          <div className={`cashmere-audience-tabs${audienceTabs.length === 2 ? " is-two-tabs" : ""}`} aria-label="Collection audience">
            {audienceTabs.map((item) => (
              <button key={item} className={selectedAudience === item ? "active" : ""} onClick={() => selectAudience(item)}>{item[0].toUpperCase() + item.slice(1)}</button>
            ))}
          </div>
        ) : (
          <div className="filter-chips"><button className={type === "all" ? "active" : ""} onClick={() => setType("all")}>All pieces</button>{types.map((item) => <button key={item} className={type === item ? "active" : ""} onClick={() => setType(item)}>{item}</button>)}</div>
        )}
        <div className="catalog-toolbar__summary">
          <span className="catalog-count"><strong>{items.length}</strong> pieces</span>
          <button className="catalog-filter-trigger" type="button" onClick={() => setFilterOpen(true)}>Filter{(selectedColors.length || hasPriceFilter) ? " · Active" : ""}</button>
          <div className={`catalog-sort${sortOpen ? " is-open" : ""}`}>
            <button type="button" className="catalog-sort-trigger" aria-haspopup="listbox" aria-expanded={sortOpen} onClick={() => setSortOpen((open) => !open)}><span>Sort by</span><strong>{sort === "price-low" ? "Price: Low to high" : sort === "price-high" ? "Price: High to low" : "Featured"}</strong><span className="catalog-sort-chevron">⌄</span></button>
            {sortOpen && <div className="catalog-sort-menu" role="listbox" aria-label="Sort products">{[["featured", "Featured"], ["price-low", "Price: Low to high"], ["price-high", "Price: High to low"]].map(([value, label]) => <button key={value} type="button" role="option" aria-selected={sort === value} className={sort === value ? "active" : ""} onClick={() => { setSort(value); setSortOpen(false); }}>{sort === value && <span aria-hidden="true">✓</span>}{label}</button>)}</div>}
          </div>
        </div>
      </div>
      <div id="products-grid">
        {items.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
      {filterOpen && <div className="filter-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setFilterOpen(false)}>
        <aside className="filter-drawer" role="dialog" aria-modal="true" aria-labelledby="filter-title">
          <div className="filter-drawer-header"><div><p className="eyebrow">Refine the edit</p><h2 id="filter-title">Filter</h2><span>{items.length} results</span></div><button type="button" className="filter-close" aria-label="Close filters" onClick={() => setFilterOpen(false)}>×</button></div>
          <div className="filter-drawer-section filter-price-section">
            <div className="filter-price-heading"><h3>Price</h3><button type="button" onClick={() => setPriceRange({ min: null, max: null })} disabled={!hasPriceFilter}>Reset</button></div>
            <div className="filter-price-values" aria-live="polite"><span>{formatPrice(selectedMinPrice)}</span><span>{formatPrice(selectedMaxPrice)}</span></div>
            <div className="filter-price-slider" style={{ "--price-start": `${minPosition}%`, "--price-end": `${maxPosition}%` }}>
              <div className="filter-price-track" aria-hidden="true" />
              <input aria-label="Minimum price" type="range" min={priceBounds.min} max={priceBounds.max} step={priceStep} value={selectedMinPrice} disabled={priceBounds.min === priceBounds.max} onChange={(event) => setPriceRange((current) => ({ ...current, min: Math.min(Number(event.target.value), selectedMaxPrice) }))} />
              <input aria-label="Maximum price" type="range" min={priceBounds.min} max={priceBounds.max} step={priceStep} value={selectedMaxPrice} disabled={priceBounds.min === priceBounds.max} onChange={(event) => setPriceRange((current) => ({ ...current, max: Math.max(Number(event.target.value), selectedMinPrice) }))} />
            </div>
            <div className="filter-price-limits"><span>{formatPrice(priceBounds.min)}</span><span>{formatPrice(priceBounds.max)}</span></div>
          </div>
          <div className="filter-drawer-section"><h3>Colour</h3><div className="filter-color-list">{availableColors.map((color) => <label key={color}><input type="checkbox" checked={selectedColors.includes(color)} onChange={() => toggleColor(color)} /><span className="filter-color-swatch" style={{ backgroundColor: products.find((product) => product.colors?.includes(color))?.colorOptions?.find((option) => option.name === color)?.hex || "#d8cec1" }} />{color}</label>)}</div></div>
          <div className="filter-drawer-actions"><button type="button" className="filter-clear" onClick={resetFilters}>Clear all</button><button type="button" className="filter-apply" onClick={() => setFilterOpen(false)}>View {items.length} results</button></div>
        </aside>
      </div>}
    </main>
  );
}
