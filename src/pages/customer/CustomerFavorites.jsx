import CustomerAccountSidebar from "../../components/CustomerAccountSidebar";
import ProductCard from "../../components/ProductCard";
import { useFavorites } from "../../context/FavoritesContext";
import { useStore } from "../../hooks/useStore";
import useDocumentTitle from "../../hooks/useDocumentTitle";

export default function CustomerFavorites() {
  useDocumentTitle("Sản phẩm yêu thích");
  const { products } = useStore();
  const { favoriteIds, loading } = useFavorites();
  const favorites = products.filter((product) => favoriteIds.has(product.id));
  return <main className="account-page account-simple"><div className="account-shell"><CustomerAccountSidebar /><section className="account-panel"><div className="account-section-heading"><div><p className="eyebrow">Bộ sưu tập cá nhân</p><h2>Sản phẩm yêu thích</h2></div><span>{favorites.length} sản phẩm</span></div>{loading ? <p>Đang tải danh sách yêu thích...</p> : favorites.length ? <div className="related-grid">{favorites.map((product) => <ProductCard key={product.id} product={product} />)}</div> : <div className="account-card"><span>♡</span><strong>Bạn chưa lưu sản phẩm nào.</strong></div>}</section></div></main>;
}
