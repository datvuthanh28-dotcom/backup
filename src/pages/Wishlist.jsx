import { Link } from "react-router-dom";
import ProductCard from "../components/ProductCard";
import { useFavorites } from "../context/FavoritesContext";
import { useStore } from "../hooks/useStore";
import useDocumentTitle from "../hooks/useDocumentTitle";

export default function Wishlist() {
  useDocumentTitle("Wishlist — Maison Rue");
  const { products } = useStore();
  const { favoriteIds, loading } = useFavorites();
  const favorites = products.filter((product) => favoriteIds.has(Number(product.id)));

  return (
    <main className="collection-page wishlist-page">
      <header className="collection-hero">
        <p className="eyebrow">YOUR EDIT</p>
        <h1 className="page-title">Wishlist</h1>
        <p>Pieces saved for another moment.</p>
      </header>
      {loading ? <p className="wishlist-status">Loading your wishlist...</p> : favorites.length ? <div id="products-grid">{favorites.map((product) => <ProductCard key={product.id} product={product} />)}</div> : <div className="wishlist-status"><p>Your wishlist is waiting to be filled.</p><Link to="/" className="home-link">Explore the collection <span>→</span></Link></div>}
    </main>
  );
}
