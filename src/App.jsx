import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { StoreProvider } from "./context/StoreContext";
import { CartProvider } from "./context/CartContext";
import { FavoritesProvider } from "./context/FavoritesContext";

// Layouts & Protected Route
import ProtectedRoute from "./components/common/ProtectedRoute";
import ScrollToTop from "./components/common/ScrollToTop";

// Route-level splitting keeps customer, staff and admin code out of one large
// startup bundle. Shared pages (for example StaffInventory) still produce a
// single reusable chunk that both portals can request on demand.
const StorefrontLayout = lazy(() => import("./components/layout/StorefrontLayout"));
const StaffLayout = lazy(() => import("./components/layout/StaffLayout"));
const AdminLayout = lazy(() => import("./components/layout/AdminLayout"));
const Home = lazy(() => import("./pages/Home"));
const ProductListPage = lazy(() => import("./pages/ProductListPage"));
const ProductDetail = lazy(() => import("./pages/ProductDetail"));
const Cart = lazy(() => import("./pages/Cart"));
const Checkout = lazy(() => import("./pages/Checkout"));
const Login = lazy(() => import("./pages/Login"));
const CustomerOrders = lazy(() => import("./pages/customer/CustomerOrders"));
const CustomerAccount = lazy(() => import("./pages/customer/CustomerAccount"));
const CustomerFavorites = lazy(() => import("./pages/customer/CustomerFavorites"));
const CustomerOffers = lazy(() => import("./pages/customer/CustomerOffers"));
const AccessDenied = lazy(() => import("./pages/AccessDenied"));
const SearchResultsPage = lazy(() => import("./pages/SearchResultsPage"));
const OurStory = lazy(() => import("./pages/OurStory"));
const Wishlist = lazy(() => import("./pages/Wishlist"));
const StoreInfoPage = lazy(() => import("./pages/StoreInfoPage"));
const SalePage = lazy(() => import("./pages/SalePage"));
const StaffLogin = lazy(() => import("./pages/staff/StaffLogin"));
const AdminLogin = lazy(() => import("./pages/admin/AdminLogin"));
const StaffDashboard = lazy(() => import("./pages/staff/StaffDashboard"));
const StaffOrders = lazy(() => import("./pages/staff/StaffOrders"));
const StaffInventory = lazy(() => import("./pages/staff/StaffInventory"));
const StaffReviews = lazy(() => import("./pages/staff/StaffReviews"));
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard"));
const AdminEmployees = lazy(() => import("./pages/admin/AdminEmployees"));
const AdminReports = lazy(() => import("./pages/admin/AdminReports"));
const AdminOrders = lazy(() => import("./pages/admin/AdminOrders"));
const AdminProducts = lazy(() => import("./pages/admin/AdminProducts"));
const AdminProductInsights = lazy(() => import("./pages/admin/AdminProductInsights"));
const AdminPromotions = lazy(() => import("./pages/admin/AdminPromotions"));
const AdminReturns = lazy(() => import("./pages/admin/AdminReturns"));

function RouteLoading() {
  return <main className="route-loading" role="status" aria-live="polite"><span>Đang tải nội dung…</span></main>;
}

function App() {
  return (
    <AuthProvider>
      <StoreProvider>
        <FavoritesProvider>
          <CartProvider>
          <BrowserRouter>
            <ScrollToTop />
            <Suspense fallback={<RouteLoading />}>
            <Routes>
              {/* 1. CUSTOMER PORTAL & STOREFRONT */}
              <Route element={<StorefrontLayout />}>
                <Route path="/" element={<Home />} />
                <Route path="/men" element={<ProductListPage audience="men" title="Men" />} />
                <Route path="/women" element={<ProductListPage audience="women" title="Women" />} />
                <Route path="/kids" element={<ProductListPage audience="kids" title="Kids" />} />
                <Route path="/accessories" element={<ProductListPage productType="Accessories" title="Accessories" />} />
                <Route path="/our-story" element={<OurStory />} />
                <Route path="/sale" element={<SalePage />} />
                <Route path="/sale/:slug" element={<SalePage />} />
                <Route path="/wishlist" element={<Wishlist />} />
                <Route path="/contact" element={<StoreInfoPage page="contact" />} />
                <Route path="/returns" element={<StoreInfoPage page="returns" />} />
                <Route path="/shopping-guide" element={<StoreInfoPage page="guide" />} />
                <Route path="/terms" element={<StoreInfoPage page="terms" />} />
                <Route path="/privacy" element={<StoreInfoPage page="privacy" />} />
                <Route path="/cookies" element={<StoreInfoPage page="cookies" />} />
                <Route path="/collections/riviera-linen" element={<ProductListPage collection="Riviera Linen" title="Riviera Linen" />} />
                <Route path="/collections/heritage-cashmere" element={<ProductListPage collection="Heritage Cashmere" title="Heritage Cashmere" />} />
                <Route path="/collections/suede-essentials" element={<ProductListPage collection="Suede Essentials" title="Suede Essentials" />} />
                <Route path="/collections/fall-winter-2026-2027" element={<ProductListPage collection="Fall/Winter 2026–2027" title="Fall/Winter 2026–2027" eyebrow="THE SAIGON TAILORING EDIT" intro="A composed wardrobe for cooler days, pairing soft cashmere, tailored linen, silk and suede across ten essential looks for men and women." />} />
                <Route path="/product/:id" element={<ProductDetail />} />
                <Route path="/search" element={<SearchResultsPage />} />
                <Route path="/cart" element={<Cart />} />
                <Route path="/checkout" element={<Checkout />} />
                <Route path="/login" element={<Login />} />
                <Route path="/access-denied" element={<AccessDenied />} />

                {/* Customer Account & Order History */}
                <Route path="/account" element={<CustomerAccount />} />
                <Route
                  path="/account/orders"
                  element={
                    <ProtectedRoute allowedRoles={["customer"]} loginRedirect="/login">
                      <CustomerOrders />
                    </ProtectedRoute>
                  }
                />
                <Route path="/account/profile" element={<ProtectedRoute allowedRoles={["customer"]} loginRedirect="/login"><CustomerAccount /></ProtectedRoute>} />
                <Route path="/account/favorites" element={<ProtectedRoute allowedRoles={["customer"]} loginRedirect="/login"><CustomerFavorites /></ProtectedRoute>} />
                <Route path="/account/offers" element={<ProtectedRoute allowedRoles={["customer"]} loginRedirect="/login"><CustomerOffers /></ProtectedRoute>} />
              </Route>

              {/* 2. STAFF PORTAL (Dedicated Login & Workspace) */}
              <Route path="/staff/login" element={<StaffLogin />} />
              <Route
                path="/staff"
                element={
                  <ProtectedRoute allowedRoles={["staff"]} loginRedirect="/staff/login">
                    <StaffLayout />
                  </ProtectedRoute>
                }
              >
                <Route index element={<StaffDashboard />} />
                <Route path="orders" element={<StaffOrders />} />
                <Route path="inventory" element={<StaffInventory />} />
                <Route path="returns" element={<AdminReturns isStaffView={true} />} />
                <Route path="reviews" element={<StaffReviews />} />
              </Route>

              {/* 3. ADMIN PORTAL (Dedicated Login & Workspace) */}
              <Route path="/admin/login" element={<AdminLogin />} />
              <Route
                path="/admin"
                element={
                  <ProtectedRoute allowedRoles={["admin"]} loginRedirect="/admin/login">
                    <AdminLayout />
                  </ProtectedRoute>
                }
              >
                <Route index element={<AdminDashboard />} />
                <Route path="employees" element={<AdminEmployees />} />
                <Route path="reports" element={<AdminReports />} />
                <Route path="orders" element={<AdminOrders />} />
                <Route path="products" element={<AdminProducts />} />
                <Route path="inventory" element={<StaffInventory portal="admin" />} />
                <Route path="product-insights" element={<AdminProductInsights />} />
                <Route path="promotions" element={<AdminPromotions />} />
                <Route path="returns" element={<AdminReturns />} />
              </Route>

              {/* Catch-all fallback */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            </Suspense>
          </BrowserRouter>
          </CartProvider>
        </FavoritesProvider>
      </StoreProvider>
    </AuthProvider>
  );
}

export default App;
