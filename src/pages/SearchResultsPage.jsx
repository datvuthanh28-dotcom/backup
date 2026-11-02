import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import ProductCard from "../components/ProductCard";
import useDocumentTitle from "../hooks/useDocumentTitle";
import { useStore } from "../hooks/useStore";

export default function SearchResultsPage() {
  const [params, setParams] = useSearchParams();
  const { products } = useStore();
  const query = params.get("q")?.trim() || "";
  const [sort, setSort] = useState("featured");
  useDocumentTitle(query ? `Search: ${query}` : "Search");

  const items = useMemo(() => {
    const term = query.toLowerCase();
    const matches = products.filter((product) => {
      const haystack = [product.name, product.collection, product.subcategory, product.productType, product.gender, product.material, ...(product.colors || [])].filter(Boolean).join(" ").toLowerCase();
      return !term || haystack.includes(term);
    });
    return [...matches].sort((a, b) => sort === "price-low" ? a.price - b.price : sort === "price-high" ? b.price - a.price : a.id - b.id);
  }, [products, query, sort]);

  return <main className="collection-page search-results-page"><div className="collection-hero"><p className="eyebrow">Maison Rue Search</p><h1 className="page-title">{query ? `Results for “${query}”` : "Search our collection"}</h1><p>{items.length} pieces found across our considered collections.</p></div><div className="catalog-toolbar"><span>{items.length} pieces</span><label>Sort <select value={sort} onChange={(event) => setSort(event.target.value)}><option value="featured">Featured</option><option value="price-low">Price: Low to high</option><option value="price-high">Price: High to low</option></select></label></div>{items.length ? <div id="products-grid">{items.map((product) => <ProductCard key={product.id} product={product} />)}</div> : <div className="search-no-results"><h2>No results found</h2><p>Try a different keyword, collection or colour.</p><button className="btn-primary" onClick={() => setParams({})}>Clear search</button></div>}</main>;
}
