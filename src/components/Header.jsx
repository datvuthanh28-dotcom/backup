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

function AccountIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="3.5" /><path d="M5 20c.5-3.6 3.2-5.5 7-5.5s6.5 1.9 7 5.5" /></svg>;
}

function ShoppingBagIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 8h14l1 13H4L5 8Z" /><path d="M9 9V6a3 3 0 0 1 6 0v3" /></svg>;
}

function SearchIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="10.8" cy="10.8" r="6.5" /><path d="m16 16 4.2 4.2" /></svg>;
}

function HeartIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20.8 4.9a5.2 5.2 0 0 0-7.4 0L12 6.3l-1.4-1.4a5.2 5.2 0 0 0-7.4 7.4L12 21l8.8-8.7a5.2 5.2 0 0 0 0-7.4Z" /></svg>;
}

function OrdersIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M5 4h14v16H5z" /><path d="M8 9h8M8 13h8M8 17h5" /></svg>;
}

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

  const accountDestination = role === "admin" ? "/admin" : role === "staff" ? "/staff" : "/account/profile";

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
          SEARCH <SearchIcon />
        </a>

        {/* Role-Aware Account Section */}
        {!currentUser ? (
          <Link to="/login">ACCOUNT <AccountIcon /></Link>
        ) : (
          <div className="nav-dropdown account-menu">
            <Link
              to={accountDestination}
              className="nav-main account-menu-trigger"
              onClick={() => setUserMenuOpen(false)}
              aria-label={role === "customer" ? "Open my profile" : "Open account portal"}
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
                <span className="account-menu-name">
                  {currentUser.name.split(" ").slice(-1)[0]}
                </span>
              )}
              <AccountIcon />
            </Link>

            <div
              className="dropdown-menu account-dropdown"
              style={{ display: userMenuOpen ? "flex" : undefined }}
            >
              <div className="account-dropdown-profile">
                <div>{currentUser.name}</div>
                <div>{currentUser.email}</div>
              </div>

              {role === "customer" && (
                <>
                  <Link className="account-dropdown-link" to="/account/profile" onClick={() => setUserMenuOpen(false)}>
                    <AccountIcon /> My Profile
                  </Link>
                  <Link className="account-dropdown-link" to="/account/orders" onClick={() => setUserMenuOpen(false)}>
                    <OrdersIcon /> My Orders
                  </Link>
                  <Link className="account-dropdown-link" to="/account/favorites" onClick={() => setUserMenuOpen(false)}>
                    <HeartIcon /> Wishlist
                  </Link>
                  <Link className="account-dropdown-link" to="/cart" onClick={() => setUserMenuOpen(false)}>
                    <ShoppingBagIcon /> Shopping Bag <span>{cartCount}</span>
                  </Link>
                </>
              )}

              {role === "staff" && (
                <>
                  <Link to="/staff" onClick={() => setUserMenuOpen(false)}>
                    <i className="fas fa-clipboard-list" style={{ marginRight: "8px" }}></i> Staff Portal
                  </Link>
                  <Link to="/staff/orders" onClick={() => setUserMenuOpen(false)}>
                    <i className="fas fa-truck-loading" style={{ marginRight: "8px" }}></i> Manage Orders
                  </Link>
                  <Link to="/staff/inventory" onClick={() => setUserMenuOpen(false)}>
                    <i className="fas fa-warehouse" style={{ marginRight: "8px" }}></i> Manage Inventory
                  </Link>
                </>
              )}

              {role === "admin" && (
                <>
                  <Link to="/admin" onClick={() => setUserMenuOpen(false)}>
                    <i className="fas fa-chart-line" style={{ marginRight: "8px" }}></i> Admin Dashboard
                  </Link>
                  <Link to="/admin/employees" onClick={() => setUserMenuOpen(false)}>
                    <i className="fas fa-users-cog" style={{ marginRight: "8px" }}></i> Manage Employees
                  </Link>
                  <Link to="/admin/reports" onClick={() => setUserMenuOpen(false)}>
                    <i className="fas fa-coins" style={{ marginRight: "8px" }}></i> Revenue Reports
                  </Link>
                  <Link to="/staff/orders" onClick={() => setUserMenuOpen(false)}>
                    <i className="fas fa-clipboard-check" style={{ marginRight: "8px" }}></i> View All Orders
                  </Link>
                </>
              )}

              <a
                href="#logout"
                onClick={(e) => {
                  e.preventDefault();
                  handleLogout();
                }}
                className="account-dropdown-signout"
              >
                <span className="account-signout-mark" aria-hidden="true">↗</span> Sign Out
              </a>
            </div>
          </div>
        )}

        <Link to="/wishlist">WISHLIST <HeartIcon /></Link>

        <Link to="/cart">
          CART <span id="quantity">{cartCount > 0 ? cartCount : ""}</span>{" "}
          <ShoppingBagIcon />
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
