import { Link, useLocation } from "react-router-dom";

export default function CustomerAccountSidebar() {
  const location = useLocation();
  const ordersActive = location.pathname === "/account/orders";
  const favoritesActive = location.pathname === "/account/favorites";
  const offersActive = location.pathname === "/account/offers";
  return (
    <aside className="account-sidebar customer-account-sidebar">
      <p className="eyebrow">TÀI KHOẢN MAISON RUE</p>
      <h1>Khách hàng<br />Maison Rue</h1>
      <Link className={ordersActive ? "active" : ""} to="/account/orders">Đơn hàng</Link>
      <Link className={favoritesActive ? "active" : ""} to="/account/favorites">Sản phẩm yêu thích</Link>
      <Link className={offersActive ? "active" : ""} to="/account/offers">Ưu đãi của tôi</Link>
      <Link className={!ordersActive && !favoritesActive && !offersActive ? "active" : ""} to="/account">Hồ sơ</Link>
    </aside>
  );
}
