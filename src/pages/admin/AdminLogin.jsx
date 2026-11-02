import { useState } from "react";
import { Navigate, useNavigate, Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import useDocumentTitle from "../../hooks/useDocumentTitle";

export default function AdminLogin() {
  useDocumentTitle("Cổng Quản Trị Cấp Cao — Đăng Nhập");
  const { loginAdmin, currentUser, role, logout } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (currentUser) {
    return <Navigate to={role === "admin" ? "/admin" : role === "staff" ? "/staff" : "/account/orders"} replace />;
  }

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");

    if (!email.trim() || !password) {
      setError("Vui lòng nhập đầy đủ thông tin đăng nhập Quản trị viên.");
      return;
    }

    setLoading(true);
    const result = await loginAdmin(email, password);
    setLoading(false);

    if (!result.success) {
      setError(result.error);
    } else {
      navigate(result.destination || "/admin", { replace: true });
    }
  };

  const quickFill = (adminEmail, adminPass) => {
    setEmail(adminEmail);
    setPassword(adminPass);
    setError("");
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "#0D0A08",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "30px 20px",
        fontFamily: "'Inter', sans-serif",
      }}
    >
      <div style={{ maxWidth: "460px", width: "100%" }}>
        {/* Brand Header */}
        <div style={{ textAlign: "center", marginBottom: "30px" }}>
          <Link to="/" style={{ textDecoration: "none" }}>
            <h1
              style={{
                fontFamily: "'Cormorant Garamond', serif",
                fontSize: "38px",
                color: "#F8F5F0",
                letterSpacing: "4px",
                margin: "0 0 8px",
              }}
            >
              MAISON RUE
            </h1>
          </Link>
          <div
            style={{
              display: "inline-block",
              padding: "4px 16px",
              backgroundColor: "#8A5A36",
              color: "#FFF",
              borderRadius: "4px",
              fontSize: "11px",
              fontWeight: "700",
              letterSpacing: "2px",
              textTransform: "uppercase",
            }}
          >
            EXECUTIVE ADMIN PORTAL
          </div>
          <p style={{ color: "#A09384", fontSize: "13px", marginTop: "10px" }}>
            Hệ thống điều hành chiến lược, quản trị nhân sự và kiểm toán doanh thu
          </p>
        </div>

        {/* Active Session Warning */}
        {currentUser && (
          <div
            style={{
              backgroundColor: "rgba(255, 255, 255, 0.05)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              borderRadius: "6px",
              padding: "14px 18px",
              marginBottom: "20px",
              color: "#E8E1D6",
              fontSize: "13px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <span>Đang đăng nhập: </span>
              <strong>{currentUser.name}</strong> ({role})
            </div>
            {role === "admin" ? (
              <button
                onClick={() => navigate("/admin")}
                style={{
                  padding: "5px 12px",
                  backgroundColor: "#8A5A36",
                  color: "#FFF",
                  border: "none",
                  borderRadius: "4px",
                  fontSize: "12px",
                  cursor: "pointer",
                  fontWeight: "600",
                }}
              >
                Vào Admin Portal
              </button>
            ) : (
              <button
                onClick={logout}
                style={{
                  padding: "5px 12px",
                  backgroundColor: "transparent",
                  color: "#D9534F",
                  border: "1px solid #D9534F",
                  borderRadius: "4px",
                  fontSize: "12px",
                  cursor: "pointer",
                }}
              >
                Đăng xuất
              </button>
            )}
          </div>
        )}

        {/* Login Box */}
        <div
          style={{
            backgroundColor: "#181310",
            border: "1px solid #2B211C",
            borderRadius: "8px",
            padding: "35px 30px",
            boxShadow: "0 15px 50px rgba(0, 0, 0, 0.6)",
          }}
        >
          <h2
            style={{
              fontFamily: "'Cormorant Garamond', serif",
              fontSize: "24px",
              color: "#F8F5F0",
              margin: "0 0 20px",
              textAlign: "center",
              fontWeight: "500",
            }}
          >
            Đăng Nhập Quản Trị Cấp Cao
          </h2>

          {error && (
            <div
              style={{
                backgroundColor: "rgba(217, 83, 79, 0.15)",
                border: "1px solid #D9534F",
                color: "#FF9E9B",
                padding: "12px 16px",
                borderRadius: "5px",
                fontSize: "13px",
                lineHeight: "1.45",
                marginBottom: "20px",
              }}
            >
              ⚠️ {error}
            </div>
          )}

          <form onSubmit={handleLogin}>
            <div style={{ marginBottom: "18px" }}>
              <label
                style={{
                  display: "block",
                  color: "#D8CEC1",
                  fontSize: "12px",
                  fontWeight: "600",
                  textTransform: "uppercase",
                  letterSpacing: "0.8px",
                  marginBottom: "8px",
                }}
              >
                Email quản trị viên (Admin Email) *
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@maisonrue.com"
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  backgroundColor: "#0D0A08",
                  border: "1px solid #3E2F26",
                  borderRadius: "5px",
                  color: "#F8F5F0",
                  fontSize: "14px",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>

            <div style={{ marginBottom: "25px" }}>
              <label
                style={{
                  display: "block",
                  color: "#D8CEC1",
                  fontSize: "12px",
                  fontWeight: "600",
                  textTransform: "uppercase",
                  letterSpacing: "0.8px",
                  marginBottom: "8px",
                }}
              >
                Khóa bảo mật quản trị *
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Nhập mật khẩu quản trị"
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  backgroundColor: "#0D0A08",
                  border: "1px solid #3E2F26",
                  borderRadius: "5px",
                  color: "#F8F5F0",
                  fontSize: "14px",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                width: "100%",
                padding: "14px",
                backgroundColor: "#8A5A36",
                color: "#FFF",
                border: "none",
                borderRadius: "5px",
                fontSize: "13px",
                fontWeight: "700",
                letterSpacing: "1.5px",
                textTransform: "uppercase",
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.7 : 1,
                transition: "background 0.2s",
              }}
            >
              {loading ? "Đang xác thực hệ thống..." : "TRUY CẬP ADMIN PORTAL"}
            </button>
          </form>

          {/* Quick Demo Admin Login */}
          <div style={{ marginTop: "30px", paddingTop: "20px", borderTop: "1px solid #2B211C" }}>
            <div style={{ fontSize: "11px", color: "#A09384", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "10px", fontWeight: "600" }}>
              Tài khoản Admin thử nghiệm:
            </div>

            <button
              type="button"
              onClick={() => quickFill("admin@maisonrue.com", "admin123")}
              style={{
                width: "100%",
                padding: "10px 14px",
                backgroundColor: "#0D0A08",
                border: "1px solid #3E2F26",
                borderRadius: "4px",
                color: "#E8E1D6",
                fontSize: "12.5px",
                textAlign: "left",
                cursor: "pointer",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <strong style={{ color: "#FFF" }}>👔 Quản Trị Viên Cấp Cao</strong>
                <div style={{ fontSize: "11.5px", color: "#B89B5E" }}>admin@maisonrue.com (pass: admin123)</div>
              </div>
              <span style={{ fontSize: "11px", color: "#8A5A36", fontWeight: "600" }}>Điền thông tin</span>
            </button>
          </div>

          {/* Cross navigation */}
          <div
            style={{
              marginTop: "25px",
              textAlign: "center",
              fontSize: "12px",
              color: "#8A7350",
              display: "flex",
              justifyContent: "center",
              gap: "15px",
            }}
          >
            <Link to="/" style={{ color: "#A09384", textDecoration: "none" }}>← Về Cửa Hàng</Link>
            <span>•</span>
            <Link to="/staff/login" style={{ color: "#A09384", textDecoration: "none" }}>Cổng Nhân Viên (Staff) →</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

