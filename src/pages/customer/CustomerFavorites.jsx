import CustomerAccountSidebar from "../../components/CustomerAccountSidebar";
import ProductCard from "../../components/ProductCard";
import { useFavorites } from "../../context/FavoritesContext";
import { useStore } from "../../hooks/useStore";
import useDocumentTitle from "../../hooks/useDocumentTitle";

export default function CustomerFavorites() {
  useDocumentTitle("Wishlist");
  const { products } = useStore();
  const { favoriteIds, loading } = useFavorites();
  const favorites = products.filter((product) => favoriteIds.has(Number(product.id)));
  return <main className="account-page account-simple"><div className="account-shell"><CustomerAccountSidebar /><section className="account-panel"><div className="account-section-heading"><div><p className="eyebrow">YOUR EDIT</p><h2>Wishlist</h2></div><span>{favorites.length} items</span></div>{loading && favorites.length === 0 ? <p>Loading your wishlist...</p> : favorites.length ? <div className="related-grid">{favorites.map((product) => <ProductCard key={product.id} product={product} />)}</div> : <div className="account-card"><span>♡</span><strong>You haven't saved any items yet.</strong></div>}</section></div></main>;
}
