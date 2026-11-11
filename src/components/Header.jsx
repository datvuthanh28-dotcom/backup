import { useEffect, useMemo, useRef, useState } from "react";
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
  const [dismissed, setDismissed] = useState(false);
  const closeDropdown = (event) => {
    setDismissed(true);
    event.currentTarget.blur();
  };

  return (
    <div
      className={`nav-dropdown audience-dropdown${dismissed ? " is-dismissed" : ""}`}
      onMouseLeave={() => setDismissed(false)}
      onFocusCapture={() => setDismissed(false)}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          setDismissed(true);
          event.currentTarget.querySelector(":focus")?.blur();
        }
      }}
    >
      <Link to={basePath} className="nav-main" onClick={closeDropdown}>{menu.label}</Link>
      <div className="dropdown-menu dropdown-categories">
        <Link to={basePath} onClick={closeDropdown}>ALL PRODUCTS</Link>
        <div className="category-dropdown">
          <Link to={productTypePath("Clothing")} onClick={closeDropdown}>CLOTHING <span>›</span></Link>
          <div className="category-submenu">
            <Link to={productTypePath("Clothing")} onClick={closeDropdown}>ALL CLOTHING</Link>
            {menu.clothing.map((subcategory) => <Link key={subcategory} to={subcategoryPath(subcategory)} onClick={closeDropdown}>{subcategory.toUpperCase()}</Link>)}
          </div>
        </div>
        <Link to={productTypePath("Footwear")} onClick={closeDropdown}>SHOES</Link>
        {menu.accessories ? (
          <div className="category-dropdown">
            <Link to={productTypePath("Accessories")} onClick={closeDropdown}>ACCESSORIES <span>›</span></Link>
            <div className="category-submenu">
              <Link to={productTypePath("Accessories")} onClick={closeDropdown}>ALL ACCESSORIES</Link>
              {menu.accessories.map((subcategory) => <Link key={subcategory} to={`${basePath}?type=Accessories&subcategory=${encodeURIComponent(subcategory)}`} onClick={closeDropdown}>{subcategory.toUpperCase()}</Link>)}
            </div>
          </div>
        ) : <Link to={productTypePath("Accessories")} onClick={closeDropdown}>ACCESSORIES</Link>}
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
  const [highlightedSearchIndex, setHighlightedSearchIndex] = useState(-1);
  const [recentSearches, setRecentSearches] = useState([]);
  const [recentProductIds, setRecentProductIds] = useState([]);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [headerHidden, setHeaderHidden] = useState(false);
  const lastScrollY = useRef(0);
  const recentSearchStorageKey = `maison-rue-recent-searches:${currentUser?.id || currentUser?.email || "guest"}`;

  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(recentSearchStorageKey) || "[]");
      setRecentSearches(Array.isArray(saved) ? saved.filter(Boolean).slice(0, 6) : []);
      const savedProducts = JSON.parse(window.localStorage.getItem(`${recentSearchStorageKey}:products`) || "[]");
      setRecentProductIds(Array.isArray(savedProducts) ? savedProducts.map(Number).filter(Number.isFinite).slice(0, 4) : []);
    } catch {
      setRecentSearches([]);
      setRecentProductIds([]);
    }
  }, [recentSearchStorageKey]);

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

  useEffect(() => {
    if (!searchOpen) {
      document.body.style.overflow = "";
      return undefined;
    }
    document.body.style.overflow = "hidden";
    setHeaderHidden(false);
    return () => {
      document.body.style.overflow = "";
    };
  }, [searchOpen]);

  const handleSearch = (event) => {
    event?.preventDefault();
    const term = query.trim();
    if (!term) return;
    rememberSearch(term);
    setSearchOpen(false);
    setQuery("");
    navigate(`/search?q=${encodeURIComponent(term)}`);
  };

  const clearRecentSearches = () => {
    setRecentSearches([]);
    setRecentProductIds([]);
    window.localStorage.removeItem(recentSearchStorageKey);
    window.localStorage.removeItem(`${recentSearchStorageKey}:products`);
  };

  const rememberRecentProduct = (productId) => {
    const nextIds = [Number(productId), ...recentProductIds.filter((id) => Number(id) !== Number(productId))].slice(0, 4);
    setRecentProductIds(nextIds);
    window.localStorage.setItem(`${recentSearchStorageKey}:products`, JSON.stringify(nextIds));
  };

  const rememberSearch = (term) => {
    const normalizedTerm = term.trim();
    if (!normalizedTerm) return;
    const nextRecentSearches = [normalizedTerm, ...recentSearches.filter((item) => item.toLowerCase() !== normalizedTerm.toLowerCase())].slice(0, 6);
    setRecentSearches(nextRecentSearches);
    window.localStorage.setItem(recentSearchStorageKey, JSON.stringify(nextRecentSearches));
  };

  const handleSearchKeyDown = (event) => {
    if (event.key === "ArrowDown" && searchResults.length) {
      event.preventDefault();
      setHighlightedSearchIndex((index) => Math.min(index + 1, searchResults.length - 1));
    } else if (event.key === "ArrowUp" && searchResults.length) {
      event.preventDefault();
      setHighlightedSearchIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter" && highlightedSearchIndex >= 0 && searchResults[highlightedSearchIndex]) {
      event.preventDefault();
      const product = searchResults[highlightedSearchIndex];
      rememberSearch(query);
      rememberRecentProduct(product.id);
      setSearchOpen(false);
      setQuery("");
      navigate(`/product/${product.id}`);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setSearchOpen(false);
      setHighlightedSearchIndex(-1);
    }
  };

  const results = query.trim()
    ? products.filter((p) =>
        p.name.toLowerCase().includes(query.trim().toLowerCase())
      )
    : [];
  const searchResults = results.slice(0, 6);
  const discoveryProducts = useMemo(() => {
    const fallbackSalesOrder = [106, 107, 148, 149];
    const salesValue = (product) => Number(product.total_revenue ?? product.totalRevenue ?? product.units_sold ?? product.unitsSold ?? product.sales ?? 0);
    const topForAudience = (audience) => products
      .filter((product) => product.audience === audience)
      .sort((a, b) => salesValue(b) - salesValue(a) || ((fallbackSalesOrder.indexOf(a.id) < 0 ? 999 : fallbackSalesOrder.indexOf(a.id)) - (fallbackSalesOrder.indexOf(b.id) < 0 ? 999 : fallbackSalesOrder.indexOf(b.id))) || a.id - b.id)
      .slice(0, 2);
    return [...topForAudience("men"), ...topForAudience("women")];
  }, [products]);
  const recentProducts = useMemo(() => recentProductIds.map((id) => products.find((product) => Number(product.id) === Number(id))).filter(Boolean), [products, recentProductIds]);

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
        <Link to="/sale" className="nav-main nav-sale">SALE</Link>
        <Link to="/our-story" className="nav-main">OUR STORY</Link>
      </nav>

      <nav className="head-right">
        <a href="#" id="searchBtn" onClick={(e) => { e.preventDefault(); setHighlightedSearchIndex(-1); setHeaderHidden(false); setSearchOpen(true); }}>
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
        <div className="search-box" id="searchBox" style={{ display: "flex" }} onMouseDown={(event) => event.target === event.currentTarget && setSearchOpen(false)}>
          <div className="search-content">
            <button id="closeSearch" type="button" onClick={() => setSearchOpen(false)}>×</button>
            <form className="search-form" onSubmit={handleSearch}>
            <input
              type="text"
              id="searchInput"
              placeholder="Search Maison Rue..."
              autoFocus
              value={query}
              onChange={(e) => { setQuery(e.target.value); setHighlightedSearchIndex(-1); }}
              onKeyDown={handleSearchKeyDown}
            />
            {query && <button type="button" className="search-clear" onClick={() => setQuery("")} aria-label="Clear search">Clear</button>}
            <button type="submit" className="search-submit">Search</button>
            </form>
            <div id="searchResults">
              {!query.trim() ? (
                <div className="search-discovery">
                  <div className="search-discovery-categories"><p className="search-section-label">Popular categories</p><div>{[["Women", "/women"], ["Men", "/men"], ["Kids", "/kids"], ["Cashmere", "/collections/heritage-cashmere"], ["Knitwear", "/women?type=Clothing&subcategory=Knitwear"]].map(([label, path]) => <Link key={label} to={path} onClick={() => setSearchOpen(false)}>{label}</Link>)}</div></div>
                  {recentProducts.length > 0 && <div className="search-recent-products"><div className="search-recent-heading"><p className="search-section-label">Your recent searches</p><button type="button" onClick={clearRecentSearches}>Clear</button></div><div className="search-discovery-grid">{recentProducts.map((p) => <Link key={p.id} to={`/product/${p.id}`} onClick={() => setSearchOpen(false)}><img src={`/${p.images[0]}`} alt="" /><span><strong>{p.name}</strong><small>{p.collection || p.productType}</small></span></Link>)}</div></div>}
                  <div className="search-discovery-products"><p className="search-section-label">Curated pieces</p><div className="search-discovery-grid">{discoveryProducts.map((p) => <Link key={p.id} to={`/product/${p.id}`} onClick={() => setSearchOpen(false)}><img src={`/${p.images[0]}`} alt="" /><span><strong>{p.name}</strong><small>{p.collection || p.productType}</small></span></Link>)}</div></div>
                </div>
              ) : (
                <>
                  {results.length === 0 && <p className="search-empty">No products found. Try another keyword.</p>}
                  {searchResults.map((p, index) => (
                <Link
                  key={p.id}
                  className={`search-result-item${highlightedSearchIndex === index ? " is-keyboard-active" : ""}`}
                  to={`/product/${p.id}`}
                  aria-current={highlightedSearchIndex === index ? "true" : undefined}
                  onMouseEnter={() => setHighlightedSearchIndex(index)}
                  onClick={() => { rememberSearch(query); rememberRecentProduct(p.id); setSearchOpen(false); setQuery(""); }}
                >
                  <img src={`/${p.images[0]}`} alt="" />
                  <span><strong>{p.name}</strong><small>{p.collection || p.productType} · {p.price.toLocaleString("vi-VN")}đ</small></span>
                </Link>
                  ))}
                  {results.length > 6 && <button className="search-view-all" onClick={handleSearch}>View all {results.length} results →</button>}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
