import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

export default function StaffLayout() {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate("/staff/login");
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh", backgroundColor: "#F8F5F0" }}>
      {/* Dedicated Operational Sidebar */}
      <aside
        style={{
          width: "270px",
          minWidth: "270px",
          backgroundColor: "#2B211C",
          color: "#F8F5F0",
          display: "flex",
          flexDirection: "column",
          borderRight: "1px solid #4E342E",
          boxShadow: "4px 0 15px rgba(0,0,0,0.08)",
          zIndex: 20,
        }}
      >
        {/* Brand Header */}
        <div style={{ padding: "28px 24px", borderBottom: "1px solid rgba(232, 225, 214, 0.12)" }}>
          <Link to="/" style={{ textDecoration: "none", color: "#F8F5F0" }}>
            <h1
              style={{
                fontFamily: "'Cormorant Garamond', serif",
                fontSize: "24px",
                letterSpacing: "2.5px",
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
              padding: "3px 10px",
              backgroundColor: "#4E342E",
              color: "#E8E1D6",
              borderRadius: "4px",
              fontSize: "10.5px",
              fontWeight: "700",
              letterSpacing: "1px",
              textTransform: "uppercase",
            }}
          >
            STAFF WORKSPACE
          </div>
        </div>

        {/* Staff User Card */}
        <div
          style={{
            padding: "18px 24px",
            backgroundColor: "rgba(0, 0, 0, 0.15)",
            borderBottom: "1px solid rgba(232, 225, 214, 0.08)",
          }}
        >
          <div style={{ fontSize: "11px", color: "#B8A894", textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Nhân viên vận hành
          </div>
          <div style={{ fontWeight: "600", fontSize: "14px", color: "#FFF", marginTop: "2px" }}>
            {currentUser?.name || "Staff Member"}
          </div>
          <div style={{ fontSize: "11.5px", color: "#A09384", marginTop: "2px" }}>
            {currentUser?.email}
          </div>
        </div>

        {/* Sidebar Navigation */}
        <nav style={{ padding: "20px 14px", flex: 1, display: "flex", flexDirection: "column", gap: "6px" }}>
          <NavLink
            to="/staff"
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
              backgroundColor: isActive ? "#4E342E" : "transparent",
              color: isActive ? "#FFF" : "#D8CEC1",
              transition: "background 0.2s, color 0.2s",
            })}
          >
            <i className="fas fa-chart-pie" style={{ width: "18px" }}></i>
            <span>Tổng Quan Vận Hành</span>
          </NavLink>

          <NavLink
            to="/staff/orders"
            style={({ isActive }) => ({
              display: "flex",
              alignItems: "center",
              gap: "12px",
              padding: "12px 16px",
              borderRadius: "6px",
              textDecoration: "none",
              fontSize: "13.5px",
              fontWeight: isActive ? "600" : "400",
              backgroundColor: isActive ? "#4E342E" : "transparent",
              color: isActive ? "#FFF" : "#D8CEC1",
              transition: "background 0.2s, color 0.2s",
            })}
          >
            <i className="fas fa-boxes" style={{ width: "18px" }}></i>
            <span>Xử Lý Đơn Hàng</span>
          </NavLink>

          <NavLink
            to="/staff/inventory"
            style={({ isActive }) => ({
              display: "flex",
              alignItems: "center",
              gap: "12px",
              padding: "12px 16px",
              borderRadius: "6px",
              textDecoration: "none",
              fontSize: "13.5px",
              fontWeight: isActive ? "600" : "400",
              backgroundColor: isActive ? "#4E342E" : "transparent",
              color: isActive ? "#FFF" : "#D8CEC1",
              transition: "background 0.2s, color 0.2s",
            })}
          >
            <i className="fas fa-warehouse" style={{ width: "18px" }}></i>
            <span>Quản Lý Tồn Kho</span>
          </NavLink>

          <div style={{ margin: "15px 0", borderTop: "1px solid rgba(232, 225, 214, 0.1)" }} />

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
              color: "#A09384",
            }}
          >
            <i className="fas fa-store" style={{ width: "18px" }}></i>
            <span>Xem Cửa Hàng (Storefront)</span>
          </Link>
        </nav>

        {/* Sidebar Footer */}
        <div style={{ padding: "18px", borderTop: "1px solid rgba(232, 225, 214, 0.1)" }}>
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
            <i className="fas fa-sign-out-alt"></i> Đăng Xuất Staff
          </button>
        </div>
      </aside>

      {/* Main Workspace Canvas */}
      <main style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflowX: "hidden" }}>
        {/* Workspace Top Header Bar */}
        <header
          style={{
            backgroundColor: "#FFFFFF",
            borderBottom: "1px solid #D8CEC1",
            padding: "14px 35px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ fontSize: "13px", color: "#6B5A4B" }}>
            Hệ thống quản lý phân quyền • <strong>Cổng Nhân Viên (Staff Workspace)</strong>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "15px", fontSize: "12.5px" }}>
            <span style={{ color: "#2E8B57", fontWeight: "600" }}>● Hệ thống trực tuyến</span>
            <span style={{ color: "#8A7350" }}>MaisonRueDB</span>
          </div>
        </header>

        {/* Body Content */}
        <div style={{ padding: "30px 35px", flex: 1, maxWidth: "1400px", width: "100%", boxSizing: "border-box" }}>
          <Outlet />
        </div>
      </main>
    </div>
  );
}
