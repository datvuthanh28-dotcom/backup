import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { StoreProvider } from "./context/StoreContext";
import { CartProvider } from "./context/CartContext";
import { FavoritesProvider } from "./context/FavoritesContext";

// Layouts & Protected Route
import StorefrontLayout from "./components/layout/StorefrontLayout";
import StaffLayout from "./components/layout/StaffLayout";
import AdminLayout from "./components/layout/AdminLayout";
import ProtectedRoute from "./components/common/ProtectedRoute";
import ScrollToTop from "./components/common/ScrollToTop";

// Storefront & Customer Pages
import Home from "./pages/Home";
import ProductListPage from "./pages/ProductListPage";
import ProductDetail from "./pages/ProductDetail";
import Cart from "./pages/Cart";
import Checkout from "./pages/Checkout";
import Login from "./pages/Login"; // Customer Login (/login)
import CustomerOrders from "./pages/customer/CustomerOrders";
import CustomerAccount from "./pages/customer/CustomerAccount";
import CustomerFavorites from "./pages/customer/CustomerFavorites";
import CustomerOffers from "./pages/customer/CustomerOffers";
import AccessDenied from "./pages/AccessDenied";
import SearchResultsPage from "./pages/SearchResultsPage";
import OurStory from "./pages/OurStory";
import StoreInfoPage from "./pages/StoreInfoPage";

// Separate Portals Login Pages
import StaffLogin from "./pages/staff/StaffLogin"; // Staff Login (/staff/login)
import AdminLogin from "./pages/admin/AdminLogin"; // Admin Login (/admin/login)

// Staff Workspace Pages (Staff Portal)
import StaffDashboard from "./pages/staff/StaffDashboard";
import StaffOrders from "./pages/staff/StaffOrders";
import StaffInventory from "./pages/staff/StaffInventory";

// Admin Workspace Pages (Admin Portal)
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminEmployees from "./pages/admin/AdminEmployees";
import AdminReports from "./pages/admin/AdminReports";
import AdminOrders from "./pages/admin/AdminOrders";
import AdminProductInsights from "./pages/admin/AdminProductInsights";
import AdminPromotions from "./pages/admin/AdminPromotions";

function App() {
  return (
    <AuthProvider>
      <StoreProvider>
        <FavoritesProvider>
          <CartProvider>
          <BrowserRouter>
            <ScrollToTop />
            <Routes>
              {/* 1. CUSTOMER PORTAL & STOREFRONT */}
              <Route element={<StorefrontLayout />}>
                <Route path="/" element={<Home />} />
                <Route path="/men" element={<ProductListPage audience="men" title="Men" />} />
                <Route path="/women" element={<ProductListPage audience="women" title="Women" />} />
                <Route path="/kids" element={<ProductListPage audience="kids" title="Kids" />} />
                <Route path="/accessories" element={<ProductListPage productType="Accessories" title="Accessories" />} />
                <Route path="/our-story" element={<OurStory />} />
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
                <Route path="product-insights" element={<AdminProductInsights />} />
                <Route path="promotions" element={<AdminPromotions />} />
              </Route>

              {/* Catch-all fallback */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
          </CartProvider>
        </FavoritesProvider>
      </StoreProvider>
    </AuthProvider>
  );
}

export default App;
