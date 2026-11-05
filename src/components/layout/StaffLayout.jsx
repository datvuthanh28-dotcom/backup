import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useStore } from "../../context/StoreContext";
import "./StaffLayout.css";

const STAFF_SYNC_INTERVAL_MS = 10000;

/**
 * Phát âm thanh chuông "ding-dong" thanh lịch bằng Web Audio API
 */
function playStaffOrderBell() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    if (ctx.state === "suspended") {
      ctx.resume();
    }

    const now = ctx.currentTime;

    // Nốt 1: 1046.5 Hz (C6)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(1046.5, now);
    gain1.gain.setValueAtTime(0.2, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.45);

    // Nốt 2: 1318.5 Hz (E6)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(1318.5, now + 0.14);
    gain2.gain.setValueAtTime(0.25, now + 0.14);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.75);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.14);
    osc2.stop(now + 0.75);
  } catch (err) {
    console.warn("[Staff Bell] Could not play bell chime:", err);
  }
}

export default function StaffLayout() {
  const { currentUser, logout } = useAuth();
  const { orders, refreshOrders } = useStore();
  const navigate = useNavigate();

  const knownOrderIdsRef = useRef(null);
  const refreshInFlightRef = useRef(false);
  const bellDropdownRef = useRef(null);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);
  const [newOrderCount, setNewOrderCount] = useState(0);
  const [syncError, setSyncError] = useState("");
  const [showBellDropdown, setShowBellDropdown] = useState(false);
  const [isSoundEnabled, setIsSoundEnabled] = useState(() => {
    return localStorage.getItem("staff_bell_sound") !== "false";
  });

  // Danh sách các đơn đang ở trạng thái pending (Chờ xác nhận)
  const pendingOrders = useMemo(() => {
    if (!Array.isArray(orders)) return [];
    return orders
      .filter((o) => (o.order_status || o.status)?.toLowerCase() === "pending")
      .slice(0, 10);
  }, [orders]);

  const totalAlertBadge = newOrderCount > 0 ? newOrderCount : pendingOrders.length;

  // Xử lý bật/tắt tiếng chuông
  const handleToggleSound = () => {
    setIsSoundEnabled((prev) => {
      const next = !prev;
      localStorage.setItem("staff_bell_sound", String(next));
      if (next) playStaffOrderBell();
      return next;
    });
  };

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
        if (added > 0) {
          setNewOrderCount((count) => count + added);
          if (isSoundEnabled) {
            playStaffOrderBell();
          }
        }
      }
      knownOrderIdsRef.current = currentIds;
      setSyncError("");
      setLastUpdatedAt(new Date());
    } finally {
      refreshInFlightRef.current = false;
      setIsRefreshing(false);
    }
  }, [refreshOrders, isSoundEnabled]);

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

  // Click outside để đóng bell dropdown
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (bellDropdownRef.current && !bellDropdownRef.current.contains(e.target)) {
        setShowBellDropdown(false);
      }
    };
    if (showBellDropdown) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showBellDropdown]);

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
        <nav className="staff-sidebar-nav" style={{ padding: "20px 14px", flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: "6px" }}>
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
              justifyContent: "space-between",
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
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <i className="fas fa-boxes" style={{ width: "18px" }}></i>
              <span>Xử Lý Đơn Hàng</span>
            </div>
            {pendingOrders.length > 0 && (
              <span
                style={{
                  backgroundColor: "#C0392B",
                  color: "#FFF",
                  fontSize: "11px",
                  fontWeight: "700",
                  padding: "2px 7px",
                  borderRadius: "10px",
                }}
              >
                {pendingOrders.length}
              </span>
            )}
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
        <div className="staff-sidebar-footer" style={{ padding: "18px", flexShrink: 0, borderTop: "1px solid rgba(232, 225, 214, 0.1)" }}>
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

        {/* Workspace Top Header Bar with Bell Notification */}
        <header
          className="staff-workspace-header"
          style={{
            backgroundColor: "#FFFFFF",
            borderBottom: "1px solid #D8CEC1",
            padding: "14px 35px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            position: "relative",
          }}
        >
          {/* Left indicator */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "13px", color: "#5A4A3E" }}>
            <span style={{ fontWeight: "600", letterSpacing: "0.5px" }}>PORTAL VẬN HÀNH</span>
          </div>

          {/* Right Controls: Bell, System Status, Sync */}
          <div style={{ display: "flex", alignItems: "center", gap: "16px", fontSize: "12.5px" }}>
            
            {/* NOTIFICATION BELL WITH DROPDOWN */}
            <div style={{ position: "relative" }} ref={bellDropdownRef}>
              <button
                type="button"
                onClick={() => setShowBellDropdown((prev) => !prev)}
                title="Thông báo đơn hàng mới"
                style={{
                  position: "relative",
                  background: showBellDropdown ? "#F3EFE9" : "#FFF",
                  border: "1px solid #D8CEC1",
                  borderRadius: "50%",
                  width: "40px",
                  height: "40px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  fontSize: "17px",
                  color: totalAlertBadge > 0 ? "#C0392B" : "#5A4A3E",
                  transition: "all 0.2s",
                }}
              >
                <span className={newOrderCount > 0 ? "staff-bell-active" : ""}>🔔</span>
                {totalAlertBadge > 0 && (
                  <span
                    style={{
                      position: "absolute",
                      top: "-4px",
                      right: "-4px",
                      backgroundColor: "#C0392B",
                      color: "#FFFFFF",
                      borderRadius: "10px",
                      fontSize: "10.5px",
                      fontWeight: "700",
                      padding: "1px 6px",
                      minWidth: "16px",
                      textAlign: "center",
                      border: "2px solid #FFF",
                      boxShadow: "0 2px 5px rgba(0,0,0,0.2)",
                    }}
                  >
                    {totalAlertBadge > 99 ? "99+" : totalAlertBadge}
                  </span>
                )}
              </button>

              {/* DROPDOWN POPOVER */}
              {showBellDropdown && (
                <div
                  style={{
                    position: "absolute",
                    top: "48px",
                    right: 0,
                    width: "360px",
                    backgroundColor: "#FFFFFF",
                    borderRadius: "10px",
                    boxShadow: "0 10px 30px rgba(43, 33, 28, 0.18)",
                    border: "1px solid #E5DED4",
                    zIndex: 100,
                    overflow: "hidden",
                    animation: "fadeIn 0.2s ease",
                  }}
                >
                  {/* Dropdown Header */}
                  <div
                    style={{
                      padding: "14px 18px",
                      backgroundColor: "#2B211C",
                      color: "#F8F5F0",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: "700", fontSize: "13.5px", letterSpacing: "0.5px" }}>
                        🔔 ĐƠN HÀNG MỚI
                      </div>
                      <div style={{ fontSize: "11px", color: "#B8A894" }}>
                        {pendingOrders.length} đơn đang chờ xác nhận
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleToggleSound}
                      title={isSoundEnabled ? "Tắt âm thanh chuông" : "Bật âm thanh chuông"}
                      style={{
                        background: "rgba(255,255,255,0.12)",
                        border: "1px solid rgba(255,255,255,0.2)",
                        borderRadius: "5px",
                        color: "#F8F5F0",
                        padding: "5px 9px",
                        fontSize: "11px",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "5px",
                      }}
                    >
                      {isSoundEnabled ? "🔊 Bật" : "🔇 Tắt"}
                    </button>
                  </div>

                  {/* Dropdown List */}
                  <div style={{ maxHeight: "300px", overflowY: "auto", padding: "8px 0" }}>
                    {pendingOrders.length === 0 ? (
                      <div style={{ padding: "28px 20px", textAlign: "center", color: "#8E8073", fontSize: "13px" }}>
                        ✨ Hiện không có đơn hàng nào đang chờ duyệt.
                      </div>
                    ) : (
                      pendingOrders.map((ord) => {
                        const amount = Number(ord.total_amount || ord.totalAmount || 0);
                        return (
                          <div
                            key={ord.id}
                            onClick={() => {
                              setShowBellDropdown(false);
                              navigate("/staff/orders?status=pending");
                            }}
                            style={{
                              padding: "12px 18px",
                              borderBottom: "1px solid #F0EAE1",
                              cursor: "pointer",
                              transition: "background 0.15s",
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#FAF8F5")}
                            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#FFFFFF")}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <strong style={{ color: "#2B211C", fontSize: "13px" }}>#{ord.id}</strong>
                              <span style={{ fontSize: "12px", color: "#C0392B", fontWeight: "700" }}>
                                {amount.toLocaleString("vi-VN")} đ
                              </span>
                            </div>
                            <div style={{ fontSize: "12px", color: "#5A4A3E", marginTop: "3px" }}>
                              Khách: <strong>{ord.customer_name || ord.name || "Khách mua"}</strong>
                            </div>
                            <div style={{ fontSize: "11px", color: "#8E8073", marginTop: "2px" }}>
                              {ord.created_at ? new Date(ord.created_at).toLocaleString("vi-VN") : "Vừa xong"}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Dropdown Footer */}
                  <div
                    style={{
                      padding: "10px 16px",
                      backgroundColor: "#F9F6F0",
                      borderTop: "1px solid #E5DED4",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setNewOrderCount(0);
                        setShowBellDropdown(false);
                      }}
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "#6B5A4B",
                        fontSize: "12px",
                        cursor: "pointer",
                      }}
                    >
                      Đánh dấu đã xem
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowBellDropdown(false);
                        navigate("/staff/orders?status=pending");
                      }}
                      style={{
                        backgroundColor: "#4E342E",
                        color: "#FFFFFF",
                        border: "none",
                        borderRadius: "5px",
                        padding: "6px 12px",
                        fontSize: "12px",
                        fontWeight: "600",
                        cursor: "pointer",
                      }}
                    >
                      Xem tất cả đơn chờ →
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Online Status */}
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
