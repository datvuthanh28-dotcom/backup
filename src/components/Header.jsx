import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useCart } from "../hooks/useCart";
import { useAuth } from "../context/AuthContext";
import { useStore } from "../hooks/useStore";

const audienceMenus = {
  men: {
    label: "MEN",
    clothing: ["Knitwear", "Shirts", "Trousers", "Outerwear"]
  },
  women: {
    label: "WOMEN",
    clothing: ["Knitwear", "Tops & Shirts", "Trousers & Skirts", "Dresses", "Outerwear"]
  },
  kids: {
    label: "KIDS",
    clothing: ["Baby Clothing", "Boys Clothing", "Girls Clothing"],
    accessories: ["Bags", "Scarves", "Toys"]
  }
};

function AudienceDropdown({ audience }) {
  const menu = audienceMenus[audience];
  const basePath = `/${audience}`;
  const productTypePath = (type) => `${basePath}?type=${encodeURIComponent(type)}`;
  const subcategoryPath = (subcategory) => `${basePath}?type=Clothing&subcategory=${encodeURIComponent(subcategory)}`;

  return (
    <div className="nav-dropdown audience-dropdown">
      <Link to={basePath} className="nav-main">{menu.label}</Link>
      <div className="dropdown-menu dropdown-categories">
        <Link to={basePath}>ALL PRODUCTS</Link>
        <div className="category-dropdown">
          <Link to={productTypePath("Clothing")}>CLOTHING <span>›</span></Link>
          <div className="category-submenu">
            <Link to={productTypePath("Clothing")}>ALL CLOTHING</Link>
            {menu.clothing.map((subcategory) => <Link key={subcategory} to={subcategoryPath(subcategory)}>{subcategory.toUpperCase()}</Link>)}
          </div>
        </div>
        <Link to={productTypePath("Footwear")}>SHOES</Link>
        {menu.accessories ? (
          <div className="category-dropdown">
            <Link to={productTypePath("Accessories")}>ACCESSORIES <span>›</span></Link>
            <div className="category-submenu">
              <Link to={productTypePath("Accessories")}>ALL ACCESSORIES</Link>
              {menu.accessories.map((subcategory) => <Link key={subcategory} to={`${basePath}?type=Accessories&subcategory=${encodeURIComponent(subcategory)}`}>{subcategory.toUpperCase()}</Link>)}
            </div>
          </div>
        ) : <Link to={productTypePath("Accessories")}>ACCESSORIES</Link>}
      </div>
    </div>
  );
}

export default function Header() {
  const { cartCount } = useCart();
  const { products } = useStore();
  const { currentUser, role, logout } = useAuth();
  const navigate = useNavigate();
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [headerHidden, setHeaderHidden] = useState(false);
  const lastScrollY = useRef(0);

  useEffect(() => {
    lastScrollY.current = window.scrollY;
    const handleScroll = () => {
      const currentY = window.scrollY;
      const delta = currentY - lastScrollY.current;
      if (currentY < 80) setHeaderHidden(false);
      else if (delta > 3) setHeaderHidden(true);
      else if (delta < -3) setHeaderHidden(false);
      lastScrollY.current = currentY;
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const handleSearch = (event) => {
    event?.preventDefault();
    const term = query.trim();
    if (!term) return;
    setSearchOpen(false);
    setQuery("");
    navigate(`/search?q=${encodeURIComponent(term)}`);
  };

  const results = query.trim()
    ? products.filter((p) =>
        p.name.toLowerCase().includes(query.trim().toLowerCase())
      )
    : [];

  const handleLogout = () => {
    logout();
    setUserMenuOpen(false);
    navigate("/");
  };

  return (
    <header className={`store-header${headerHidden ? " is-hidden" : ""}`}>
      <div className="header-announcement"><span>‹</span><p>E-Concierge · Monday to Sunday, 9 am – 7 pm</p><span>›</span></div>
      <div className="header-brand-row">
        <Link to="/" className="logo-link">
          <img src="/image/logo.png" alt="Maison Rue logo" className="header-logo" />
        </Link>
      </div>
      <nav className="head-left">
        <Link to="/collections/fall-winter-2026-2027" className="nav-main nav-highlight">FALL/WINTER 2026–2027</Link>
        <Link to="/collections/heritage-cashmere" className="nav-main nav-highlight">THE CASHMERE EDIT</Link>
        <AudienceDropdown audience="men" />
        <AudienceDropdown audience="women" />
        <AudienceDropdown audience="kids" />
        <Link to="/our-story" className="nav-main">OUR STORY</Link>
      </nav>

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
                  <Link to="/account/profile" onClick={() => setUserMenuOpen(false)}>
                    <i className="fas fa-user" style={{ marginRight: "8px" }}></i> Hồ sơ của tôi
                  </Link>
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
            <form className="search-form" onSubmit={handleSearch}>
            <input
              type="text"
              id="searchInput"
              placeholder="Search Maison Rue..."
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && <button type="button" className="search-clear" onClick={() => setQuery("")} aria-label="Clear search">Clear</button>}
            <button type="submit" className="search-submit">Search</button>
            </form>
            <div id="searchResults">
              {query.trim() && results.length === 0 && <p className="search-empty">No products found. Try another keyword.</p>}
              {results.slice(0, 6).map((p) => (
                <Link
                  key={p.id}
                  className="search-result-item"
                  to={`/product/${p.id}`}
                  onClick={() => { setSearchOpen(false); setQuery(""); }}
                >
                  <img src={`/${p.images[0]}`} alt="" />
                  <span><strong>{p.name}</strong><small>{p.collection || p.productType} · {p.price.toLocaleString("vi-VN")}đ</small></span>
                </Link>
              ))}
              {results.length > 6 && <button className="search-view-all" onClick={handleSearch}>View all {results.length} results →</button>}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
