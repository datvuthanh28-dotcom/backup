import ProductCard from "../components/ProductCard";
import useDocumentTitle from "../hooks/useDocumentTitle";
import products from "../data/products";

export default function ProductListPage({ category, title }) {
  useDocumentTitle(title);
  const items = products[category] || [];

  return (
    <main className="collection-page">
      <h1 className="page-title">{title}</h1>
      <div id="products-grid">
        {items.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
    </main>
  );
}
