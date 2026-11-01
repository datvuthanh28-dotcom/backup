import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { allProducts } from "../data/products";
import { useCart } from "../hooks/useCart";
import { useAuth } from "../context/AuthContext";

export default function Header() {
  const { cartCount } = useCart();
  const { currentUser, role, logout } = useAuth();
  const navigate = useNavigate();
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const results = query.trim()
    ? allProducts.filter((p) =>
        p.name.toLowerCase().includes(query.trim().toLowerCase())
      )
    : [];

  const handleLogout = () => {
    logout();
    setUserMenuOpen(false);
    navigate("/");
  };

  return (
    <header>
      <nav className="head-left">
        <div className="nav-dropdown">
          <Link to="/men" className="nav-main">MEN</Link>
          <div className="dropdown-menu">
            <Link to="/men">All Products</Link>
            <Link to="/accessories">Accessories</Link>
          </div>
        </div>
        <div className="nav-dropdown">
          <Link to="/women" className="nav-main">WOMEN</Link>
          <div className="dropdown-menu">
            <Link to="/women">All Products</Link>
            <Link to="/accessories">Accessories</Link>
          </div>
        </div>
        <Link to="/accessories">ACCESSORIES</Link>
      </nav>

      <Link to="/" className="logo-link">
        <img src="/image/logo.png" alt="Maison Rue logo" className="header-logo" />
      </Link>

      <nav className="head-right">
        <a href="#" id="searchBtn" onClick={(e) => { e.preventDefault(); setSearchOpen(true); }}>
          SEARCH <i className="fas fa-search"></i>
        </a>

        {/* Role-Aware Account Section */}
        {!currentUser ? (
          <Link to="/login">ACCOUNT <i className="fas fa-user"></i></Link>
        ) : (
          <div className="nav-dropdown" style={{ position: "relative" }}>
            <span
              className="nav-main"
              onClick={() => setUserMenuOpen((prev) => !prev)}
              style={{
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "6px",
                fontWeight: "500",
              }}
            >
              {role === "admin" && (
                <span
                  style={{
                    backgroundColor: "#2B211C",
                    color: "#F8F5F0",
                    fontSize: "10px",
                    padding: "2px 6px",
                    borderRadius: "4px",
                    letterSpacing: "1px",
                  }}
                >
                  ADMIN
                </span>
              )}
              {role === "staff" && (
                <span
                  style={{
                    backgroundColor: "#4E342E",
                    color: "#F8F5F0",
                    fontSize: "10px",
                    padding: "2px 6px",
                    borderRadius: "4px",
                    letterSpacing: "1px",
                  }}
                >
                  STAFF
                </span>
              )}
              {role === "customer" && (
                <span style={{ fontSize: "14px" }}>
                  {currentUser.name.split(" ").slice(-1)[0]}
                </span>
              )}
              <i className="fas fa-user-circle"></i>
            </span>

            <div
              className="dropdown-menu"
              style={{
                right: 0,
                left: "auto",
                minWidth: "220px",
                display: userMenuOpen ? "flex" : undefined,
              }}
            >
              <div
                style={{
                  padding: "10px 18px",
                  borderBottom: "1px solid rgba(43, 33, 28, 0.1)",
                  fontSize: "12px",
                }}
              >
                <div style={{ fontWeight: "600", color: "#2B211C" }}>{currentUser.name}</div>
                <div style={{ color: "#8A7350", fontSize: "11px" }}>{currentUser.email}</div>
              </div>

              {role === "customer" && (
                <>
                  <Link to="/account/orders" onClick={() => setUserMenuOpen(false)}>
                    <i className="fas fa-box-open" style={{ marginRight: "8px" }}></i> Đơn hàng của tôi
                  </Link>
                  <Link to="/cart" onClick={() => setUserMenuOpen(false)}>
                    <i className="fas fa-shopping-bag" style={{ marginRight: "8px" }}></i> Giỏ hàng ({cartCount})
                  </Link>
                </>
              )}

              {role === "staff" && (
                <>
                  <Link to="/staff" onClick={() => setUserMenuOpen(false)}>
                    <i className="fas fa-clipboard-list" style={{ marginRight: "8px" }}></i> Staff Portal
                  </Link>
                  <Link to="/staff/orders" onClick={() => setUserMenuOpen(false)}>
                    <i className="fas fa-truck-loading" style={{ marginRight: "8px" }}></i> Quản lý đơn hàng
                  </Link>
                  <Link to="/staff/inventory" onClick={() => setUserMenuOpen(false)}>
                    <i className="fas fa-warehouse" style={{ marginRight: "8px" }}></i> Quản lý tồn kho
                  </Link>
                </>
              )}

              {role === "admin" && (
                <>
                  <Link to="/admin" onClick={() => setUserMenuOpen(false)}>
                    <i className="fas fa-chart-line" style={{ marginRight: "8px" }}></i> Admin Dashboard
                  </Link>
                  <Link to="/admin/employees" onClick={() => setUserMenuOpen(false)}>
                    <i className="fas fa-users-cog" style={{ marginRight: "8px" }}></i> Quản lý nhân viên
                  </Link>
                  <Link to="/admin/reports" onClick={() => setUserMenuOpen(false)}>
                    <i className="fas fa-coins" style={{ marginRight: "8px" }}></i> Báo cáo doanh thu
                  </Link>
                  <Link to="/staff/orders" onClick={() => setUserMenuOpen(false)}>
                    <i className="fas fa-clipboard-check" style={{ marginRight: "8px" }}></i> Xem tất cả đơn hàng
                  </Link>
                </>
              )}

              <a
                href="#logout"
                onClick={(e) => {
                  e.preventDefault();
                  handleLogout();
                }}
                style={{
                  borderTop: "1px solid rgba(43, 33, 28, 0.1)",
                  color: "#D9534F",
                  marginTop: "4px",
                }}
              >
                <i className="fas fa-sign-out-alt" style={{ marginRight: "8px" }}></i> Đăng xuất
              </a>
            </div>
          </div>
        )}

        <Link to="/cart">
          CART <span id="quantity">{cartCount > 0 ? cartCount : ""}</span>{" "}
          <i className="fas fa-shopping-bag"></i>
        </Link>
      </nav>

      {searchOpen && (
        <div className="search-box" id="searchBox" style={{ display: "flex" }}>
          <div className="search-content">
            <button id="closeSearch" type="button" onClick={() => setSearchOpen(false)}>×</button>
            <input
              type="text"
              id="searchInput"
              placeholder="Search Maison Rue..."
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div id="searchResults">
              {results.map((p) => (
                <Link
                  key={p.id}
                  to={`/product/${p.id}`}
                  onClick={() => setSearchOpen(false)}
                  style={{ display: "block", padding: "6px 0" }}
                >
                  {p.name} — {p.price.toLocaleString("vi-VN")}đ
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
