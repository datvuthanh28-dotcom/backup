import { Link, useLocation } from "react-router-dom";

export default function CustomerAccountSidebar() {
  const location = useLocation();
  const ordersActive = location.pathname === "/account/orders";
  const favoritesActive = location.pathname === "/account/favorites";
  return (
    <aside className="account-sidebar customer-account-sidebar">
      <p className="eyebrow">TÀI KHOẢN MAISON RUE</p>
      <h1>Khách Hàng<br />Maison Rue</h1>
      <Link className={ordersActive ? "active" : ""} to="/account/orders">Đơn hàng</Link>
      <Link className={favoritesActive ? "active" : ""} to="/account/favorites">Yêu thích</Link>
      <Link className={!ordersActive && !favoritesActive ? "active" : ""} to="/account">Hồ sơ</Link>
    </aside>
  );
}
