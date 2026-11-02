import { Link, useLocation } from "react-router-dom";

export default function CustomerAccountSidebar() {
  const location = useLocation();
  const ordersActive = location.pathname === "/account/orders";
  return (
    <aside className="account-sidebar customer-account-sidebar">
      <p className="eyebrow">TÀI KHOẢN MAISON RUE</p>
      <h1>Khách Hàng<br />Maison Rue</h1>
      <Link className={ordersActive ? "active" : ""} to="/account/orders">Đơn hàng</Link>
      <Link className={!ordersActive ? "active" : ""} to="/account">Hồ sơ</Link>
    </aside>
  );
}
