import ProductCard from "../components/ProductCard";
import useDocumentTitle from "../hooks/useDocumentTitle";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useStore } from "../hooks/useStore";

export default function ProductListPage({ gender, audience, collection, productType, title }) {
  useDocumentTitle(title);
  const { products } = useStore();
  const [searchParams] = useSearchParams();
  const [type, setType] = useState("all");
  const [sort, setSort] = useState("featured");
  const isHeritageCashmere = collection === "Heritage Cashmere";
  const [cashmereAudience, setCashmereAudience] = useState("women");
  const requestedProductType = productType || searchParams.get("type");
  const requestedSubcategory = searchParams.get("subcategory");
  const matchesAudience = (product) => {
    if (audience) return product.audience === audience;
    if (gender === "unisex") return product.gender === "unisex";
    if (gender === "nam") return product.audience === "men";
    if (gender === "nữ") return product.audience === "women";
    return !gender || product.gender === gender;
  };
  const matchesProduct = (product) => matchesAudience(product) && (!requestedProductType || product.productType === requestedProductType);
  const types = [...new Set(products.filter((p) => matchesProduct(p) && (!collection || p.collection === collection)).map((p) => p.subcategory))];
  const items = useMemo(() => {
    const filtered = products.filter((p) => matchesProduct(p)
      && (!collection || p.collection === collection)
      && (!isHeritageCashmere || p.audience === cashmereAudience)
      && ((requestedSubcategory || type) === "all" || p.subcategory === (requestedSubcategory || type)));
    return [...filtered].sort((a, b) => sort === "price-low" ? a.price - b.price : sort === "price-high" ? b.price - a.price : a.id - b.id);
  }, [products, gender, audience, collection, requestedProductType, requestedSubcategory, type, sort, isHeritageCashmere, cashmereAudience]);

  return (
    <main className="collection-page">
      <div className="collection-hero"><p className="eyebrow">Maison Rue Collection</p><h1 className="page-title">{title}</h1><p>Considered materials, enduring silhouettes and understated detail.</p></div>
      <div className={`catalog-toolbar${isHeritageCashmere ? " cashmere-toolbar" : ""}`}>
        {isHeritageCashmere ? (
          <div className="cashmere-audience-tabs" aria-label="Cashmere collection audience">
            {["women", "men", "kids"].map((item) => (
              <button key={item} className={cashmereAudience === item ? "active" : ""} onClick={() => setCashmereAudience(item)}>{item[0].toUpperCase() + item.slice(1)}</button>
            ))}
          </div>
        ) : (
          <div className="filter-chips"><button className={type === "all" ? "active" : ""} onClick={() => setType("all")}>All pieces</button>{types.map((item) => <button key={item} className={type === item ? "active" : ""} onClick={() => setType(item)}>{item}</button>)}</div>
        )}
        <div className="catalog-toolbar__summary">
          <span className="catalog-count"><strong>{items.length}</strong> pieces</span>
          <label className="catalog-sort"><span>Sort by</span><select aria-label="Sort products" value={sort} onChange={(e) => setSort(e.target.value)}><option value="featured">Featured</option><option value="price-low">Price: Low to high</option><option value="price-high">Price: High to low</option></select></label>
        </div>
      </div>
      </div>
      <div id="products-grid">
        {items.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
    </main>
  );
}
