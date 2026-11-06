import { Link, useLocation } from "react-router-dom";

export default function CustomerAccountSidebar() {
  const location = useLocation();
  const ordersActive = location.pathname === "/account/orders";
  const favoritesActive = location.pathname === "/account/favorites";
  const offersActive = location.pathname === "/account/offers";
  return (
    <aside className="account-sidebar customer-account-sidebar">
      <p className="eyebrow">MAISON RUE ACCOUNT</p>
      <h1>Maison Rue<br />Client</h1>
      <Link className={ordersActive ? "active" : ""} to="/account/orders">Orders</Link>
      <Link className={favoritesActive ? "active" : ""} to="/account/favorites">Wishlist</Link>
      <Link className={offersActive ? "active" : ""} to="/account/offers">My Offers</Link>
      <Link className={!ordersActive && !favoritesActive && !offersActive ? "active" : ""} to="/account">Profile</Link>
    </aside>
  );
}
