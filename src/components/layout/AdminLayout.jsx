import { useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import BackToTop from "../BackToTop";
import "./AdminLayout.css";

export default function AdminLayout() {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate("/admin/login");
  };

  return (
    <div className="admin-shell" style={{ display: "flex", minHeight: "100vh", backgroundColor: "#F8F5F0" }}>
      {/* Dedicated Executive Admin Sidebar */}
      <aside
        className={`admin-sidebar ${sidebarOpen ? "is-open" : ""}`}
        style={{
          width: "280px",
          minWidth: "280px",
          backgroundColor: "#14100E",
          color: "#F8F5F0",
          display: "flex",
          flexDirection: "column",
          borderRight: "1px solid #33261F",
          boxShadow: "4px 0 18px rgba(0,0,0,0.12)",
          zIndex: 20,
          position: "sticky",
          top: 0,
          height: "100dvh",
          maxHeight: "100dvh",
          alignSelf: "flex-start",
          overflow: "hidden",
          boxSizing: "border-box",
        }}
      >
        {/* Brand Header */}
        <div className="admin-sidebar-brand" style={{ padding: "28px 24px", borderBottom: "1px solid rgba(255, 255, 255, 0.08)" }}>
          <Link to="/" style={{ textDecoration: "none", color: "#F8F5F0" }}>
            <h1
              style={{
                fontFamily: "'Cormorant Garamond', serif",
                fontSize: "25px",
                letterSpacing: "3px",
                margin: 0,
                fontWeight: "600",
              }}
            >
              MAISON RUE
            </h1>
          </Link>
          <div
            style={{
              display: "inline-block",
              marginTop: "8px",
              padding: "3px 12px",
              backgroundColor: "#8A5A36",
              color: "#FFF",
              borderRadius: "4px",
              fontSize: "10.5px",
              fontWeight: "700",
              letterSpacing: "1.5px",
              textTransform: "uppercase",
            }}
          >
            EXECUTIVE ADMIN
          </div>
        </div>

        {/* Admin User Card */}
        <div
          className="admin-user-card"
          style={{
            padding: "18px 24px",
            backgroundColor: "rgba(255, 255, 255, 0.03)",
            borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
          }}
        >
          <div style={{ fontSize: "11px", color: "#B89B5E", textTransform: "uppercase", letterSpacing: "1px" }}>
            Quản trị viên cấp cao
          </div>
          <div style={{ fontWeight: "600", fontSize: "14px", color: "#FFF", marginTop: "2px" }}>
            {currentUser?.name || "System Admin"}
          </div>
          <div style={{ fontSize: "11.5px", color: "#8A7350", marginTop: "2px" }}>
            {currentUser?.email}
          </div>
        </div>

        {/* Sidebar Navigation */}
        <nav onClick={(event) => { if (event.target.closest("a")) setSidebarOpen(false); }} className="admin-sidebar-nav" style={{ padding: "20px 14px", flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: "6px" }}>
          <NavLink
            to="/admin"
            end
            style={({ isActive }) => ({
              display: "flex",
              alignItems: "center",
              gap: "12px",
              padding: "12px 16px",
              borderRadius: "6px",
              textDecoration: "none",
              fontSize: "13.5px",
              fontWeight: isActive ? "600" : "400",
              backgroundColor: isActive ? "#8A5A36" : "transparent",
              color: isActive ? "#FFF" : "#D8CEC1",
              transition: "background 0.2s, color 0.2s",
            })}
          >
            <i className="fas fa-chart-line" style={{ width: "18px" }}></i>
            <span>Tổng Quan Điều Hành (KPIs)</span>
          </NavLink>

          <NavLink
            to="/admin/employees"
            style={({ isActive }) => ({
              display: "flex",
              alignItems: "center",
              gap: "12px",
              padding: "12px 16px",
              borderRadius: "6px",
              textDecoration: "none",
              fontSize: "13.5px",
              fontWeight: isActive ? "600" : "400",
              backgroundColor: isActive ? "#8A5A36" : "transparent",
              color: isActive ? "#FFF" : "#D8CEC1",
              transition: "background 0.2s, color 0.2s",
            })}
          >
            <i className="fas fa-users-cog" style={{ width: "18px" }}></i>
            <span>Quản Lý Nhân Viên</span>
          </NavLink>

          <NavLink
            to="/admin/reports"
            style={({ isActive }) => ({
              display: "flex",
              alignItems: "center",
              gap: "12px",
              padding: "12px 16px",
              borderRadius: "6px",
              textDecoration: "none",
              fontSize: "13.5px",
              fontWeight: isActive ? "600" : "400",
              backgroundColor: isActive ? "#8A5A36" : "transparent",
              color: isActive ? "#FFF" : "#D8CEC1",
              transition: "background 0.2s, color 0.2s",
            })}
          >
            <i className="fas fa-file-invoice-dollar" style={{ width: "18px" }}></i>
            <span>Báo Cáo Doanh Thu</span>
          </NavLink>

          <NavLink
            to="/admin/orders"
            style={({ isActive }) => ({
              display: "flex",
              alignItems: "center",
              gap: "12px",
              padding: "12px 16px",
              borderRadius: "6px",
              textDecoration: "none",
              fontSize: "13.5px",
              fontWeight: isActive ? "600" : "400",
              backgroundColor: isActive ? "#8A5A36" : "transparent",
              color: isActive ? "#FFF" : "#D8CEC1",
              transition: "background 0.2s, color 0.2s",
            })}
          >
            <i className="fas fa-clipboard-list" style={{ width: "18px" }}></i>
            <span>Giám Sát Đơn Hàng</span>
          </NavLink>

          <NavLink
            to="/admin/products"
            style={({ isActive }) => ({
              display: "flex",
              alignItems: "center",
              gap: "12px",
              padding: "12px 16px",
              borderRadius: "6px",
              textDecoration: "none",
              fontSize: "13.5px",
              fontWeight: isActive ? "600" : "400",
              backgroundColor: isActive ? "#8A5A36" : "transparent",
              color: isActive ? "#FFF" : "#D8CEC1",
              transition: "background 0.2s, color 0.2s",
            })}
          >
            <i className="fas fa-boxes" style={{ width: "18px" }}></i>
            <span>Sản Phẩm & Kho SKU</span>
          </NavLink>

          <NavLink
            to="/admin/product-insights"
            style={({ isActive }) => ({
              display: "flex", alignItems: "center", gap: "12px", padding: "12px 16px",
              borderRadius: "6px", textDecoration: "none", fontSize: "13.5px",
              fontWeight: isActive ? "600" : "400", backgroundColor: isActive ? "#8A5A36" : "transparent",
              color: isActive ? "#FFF" : "#D8CEC1", transition: "background 0.2s, color 0.2s",
            })}
          >
            <i className="fas fa-heart" style={{ width: "18px" }}></i>
            <span>Quan Tâm & Đánh Giá</span>
          </NavLink>

          <NavLink
            to="/admin/promotions"
            style={({ isActive }) => ({ display: "flex", alignItems: "center", gap: "12px", padding: "12px 16px", borderRadius: "6px", textDecoration: "none", fontSize: "13.5px", fontWeight: isActive ? "600" : "400", backgroundColor: isActive ? "#8A5A36" : "transparent", color: isActive ? "#FFF" : "#D8CEC1", transition: "background 0.2s, color 0.2s" })}
          >
            <i className="fas fa-tags" style={{ width: "18px" }}></i>
            <span>Quản Lý Khuyến Mãi</span>
          </NavLink>

          <NavLink
            to="/admin/returns"
            style={({ isActive }) => ({
              display: "flex",
              alignItems: "center",
              gap: "12px",
              padding: "12px 16px",
              borderRadius: "6px",
              textDecoration: "none",
              fontSize: "13.5px",
              fontWeight: isActive ? "600" : "400",
              backgroundColor: isActive ? "#8A5A36" : "transparent",
              color: isActive ? "#FFF" : "#D8CEC1",
              transition: "background 0.2s, color 0.2s",
            })}
          >
            <i className="fas fa-undo-alt" style={{ width: "18px" }}></i>
            <span>Đổi Trả & Hoàn Tiền</span>
          </NavLink>

          <div style={{ margin: "15px 0", borderTop: "1px solid rgba(255, 255, 255, 0.08)" }} />

          <Link
            to="/"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              padding: "10px 16px",
              borderRadius: "6px",
              textDecoration: "none",
              fontSize: "13px",
              color: "#8A7350",
            }}
          >
            <i className="fas fa-store" style={{ width: "18px" }}></i>
            <span>Xem Cửa Hàng (Storefront)</span>
          </Link>
        </nav>

        {/* Sidebar Footer */}
        <div className="admin-sidebar-footer" style={{ padding: "18px", flexShrink: 0, borderTop: "1px solid rgba(255, 255, 255, 0.08)" }}>
          <button
            onClick={handleLogout}
            style={{
              width: "100%",
              padding: "10px",
              backgroundColor: "rgba(217, 83, 79, 0.12)",
              border: "1px solid rgba(217, 83, 79, 0.3)",
              color: "#FF9E9B",
              borderRadius: "5px",
              fontSize: "12.5px",
              fontWeight: "600",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
            }}
          >
            <i className="fas fa-sign-out-alt"></i> Đăng Xuất Admin
          </button>
        </div>
      </aside>
      {sidebarOpen && <button className="portal-sidebar-backdrop" aria-label="Đóng menu" onClick={() => setSidebarOpen(false)} />}

      {/* Main Workspace Canvas */}
      <main className="admin-main" style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflowX: "hidden" }}>
        {/* Workspace Top Header Bar */}
        <header
          className="admin-workspace-header"
          style={{
            backgroundColor: "#FFFFFF",
            borderBottom: "1px solid #D8CEC1",
            padding: "14px 35px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <button className="portal-sidebar-toggle" type="button" aria-label="Mở menu quản trị" onClick={() => setSidebarOpen(true)}><i className="fas fa-bars" /></button>
          <div style={{ fontSize: "13px", color: "#6B5A4B" }}>
            Hệ thống quản trị doanh nghiệp • <strong>Cổng Quản Trị Cấp Cao (Admin Portal)</strong>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "15px", fontSize: "12.5px" }}>
            <span style={{ color: "#2E8B57", fontWeight: "600" }}>● Cơ sở dữ liệu: MaisonRueDB</span>
            <span style={{ color: "#8A5A36", fontWeight: "600" }}>Quyền: Toàn quyền quản trị</span>
          </div>
        </header>

        {/* Body Content */}
        <div className="admin-workspace-body" style={{ padding: "30px 35px", flex: 1, maxWidth: "1400px", width: "100%", boxSizing: "border-box" }}>
          <Outlet />
        </div>
        <BackToTop />
      </main>
    </div>
  );
}
