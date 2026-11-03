import { useCallback, useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useStore } from "../../context/StoreContext";
import "./StaffLayout.css";

const STAFF_SYNC_INTERVAL_MS = 10000;

export default function StaffLayout() {
  const { currentUser, logout } = useAuth();
  const { refreshOrders } = useStore();
  const navigate = useNavigate();
  const knownOrderIdsRef = useRef(null);
  const refreshInFlightRef = useRef(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);
  const [newOrderCount, setNewOrderCount] = useState(0);
  const [syncError, setSyncError] = useState("");

  const syncOrders = useCallback(async () => {
    if (refreshInFlightRef.current) return;
    refreshInFlightRef.current = true;
    setIsRefreshing(true);
    try {
      const result = await refreshOrders();
      if (!result?.success) {
        setSyncError("Mất kết nối đồng bộ. Hệ thống sẽ tự thử lại.");
        return;
      }

      const currentIds = new Set(result.orders.map((order) => String(order.id)));
      if (knownOrderIdsRef.current) {
        let added = 0;
        currentIds.forEach((id) => {
          if (!knownOrderIdsRef.current.has(id)) added += 1;
        });
        if (added > 0) setNewOrderCount((count) => count + added);
      }
      knownOrderIdsRef.current = currentIds;
      setSyncError("");
      setLastUpdatedAt(new Date());
    } finally {
      refreshInFlightRef.current = false;
      setIsRefreshing(false);
    }
  }, [refreshOrders]);

  useEffect(() => {
    syncOrders();
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") syncOrders();
    }, STAFF_SYNC_INTERVAL_MS);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") syncOrders();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [syncOrders]);

  const handleLogout = async () => {
    await logout();
    navigate("/staff/login");
  };

  return (
    <div className="staff-shell" style={{ display: "flex", minHeight: "100vh", backgroundColor: "#F8F5F0" }}>
      {/* Dedicated Operational Sidebar */}
      <aside
        className="staff-sidebar"
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
        <div className="staff-sidebar-brand" style={{ padding: "28px 24px", borderBottom: "1px solid rgba(232, 225, 214, 0.12)" }}>
          <div style={{ color: "#F8F5F0" }}>
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
          </div>
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
          className="staff-user-card"
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
        <nav className="staff-sidebar-nav" style={{ padding: "20px 14px", flex: 1, display: "flex", flexDirection: "column", gap: "6px" }}>
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

        </nav>

        {/* Sidebar Footer */}
        <div className="staff-sidebar-footer" style={{ padding: "18px", borderTop: "1px solid rgba(232, 225, 214, 0.1)" }}>
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
      <main className="staff-main" style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflowX: "hidden" }}>
        {newOrderCount > 0 && (
          <div
            role="status"
            style={{
              margin: "14px 35px 0",
              padding: "12px 16px",
              borderRadius: "7px",
              border: "1px solid #D7B56D",
              backgroundColor: "#FFF8E7",
              color: "#4E342E",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "16px",
              fontSize: "13px",
            }}
          >
            <strong>🔔 Có {newOrderCount} đơn hàng mới vừa được ghi nhận.</strong>
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                onClick={() => {
                  setNewOrderCount(0);
                  navigate("/staff/orders?status=pending");
                }}
                style={{ border: 0, borderRadius: "5px", padding: "7px 12px", background: "#4E342E", color: "#FFF", cursor: "pointer", fontWeight: 700 }}
              >
                Xem đơn mới
              </button>
              <button
                aria-label="Đóng thông báo đơn mới"
                onClick={() => setNewOrderCount(0)}
                style={{ border: "1px solid #D8CEC1", borderRadius: "5px", padding: "7px 10px", background: "#FFF", color: "#4E342E", cursor: "pointer" }}
              >
                ×
              </button>
            </div>
          </div>
        )}

        {/* Workspace Top Header Bar */}
        <header
          className="staff-workspace-header"
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
          <div style={{ display: "flex", alignItems: "center", gap: "12px", fontSize: "12.5px" }}>
            <span style={{ color: syncError ? "#C0392B" : "#2E8B57", fontWeight: "600" }}>
              ● {syncError || "Hệ thống trực tuyến"}
            </span>
            <span style={{ color: "#8A7350" }}>MaisonRueDB</span>
            <span style={{ color: "#6B5A4B", whiteSpace: "nowrap" }}>
              Cập nhật: {lastUpdatedAt ? lastUpdatedAt.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—"}
            </span>
            <button
              type="button"
              onClick={syncOrders}
              disabled={isRefreshing}
              style={{
                border: "1px solid #D8CEC1",
                borderRadius: "5px",
                padding: "6px 10px",
                background: "#FFF",
                color: "#4E342E",
                cursor: isRefreshing ? "wait" : "pointer",
                opacity: isRefreshing ? 0.65 : 1,
                fontSize: "12px",
                fontWeight: 600,
              }}
            >
              {isRefreshing ? "Đang cập nhật…" : "↻ Làm mới"}
            </button>
          </div>
        </header>

        {/* Body Content */}
        <div className="staff-workspace-body" style={{ padding: "30px 35px", flex: 1, maxWidth: "1400px", width: "100%", boxSizing: "border-box" }}>
          <Outlet />
        </div>
      </main>
    </div>
  );
}
