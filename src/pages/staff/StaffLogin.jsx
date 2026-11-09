import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import useDocumentTitle from "../../hooks/useDocumentTitle";

export default function StaffLogin() {
  useDocumentTitle("Cổng Nhân Viên Vận Hành — Đăng Nhập");
  const { loginStaff, currentUser, role, logout } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");

    if (!email.trim() || !password) {
      setError("Vui lòng nhập đầy đủ email và mật khẩu nhân viên.");
      return;
    }

    setLoading(true);
    const result = await loginStaff(email, password);
    setLoading(false);

    if (!result.success) {
      setError(result.error);
    } else {
      navigate(result.destination || "/staff", { replace: true });
    }
  };

  const quickFill = (staffEmail, staffPass) => {
    setEmail(staffEmail);
    setPassword(staffPass);
    setError("");
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "#1E1815",
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
                fontSize: "36px",
                color: "#F8F5F0",
                letterSpacing: "3px",
                margin: "0 0 8px",
              }}
            >
              MAISON RUE
            </h1>
          </Link>
          <div
            style={{
              display: "inline-block",
              padding: "4px 14px",
              backgroundColor: "#4E342E",
              color: "#E8E1D6",
              borderRadius: "4px",
              fontSize: "11px",
              fontWeight: "700",
              letterSpacing: "1.5px",
              textTransform: "uppercase",
            }}
          >
            STAFF OPERATIONAL PORTAL
          </div>
          <p style={{ color: "#A09384", fontSize: "13px", marginTop: "10px" }}>
            Cổng tiếp nhận, xử lý đơn hàng và điều phối kho vận nội bộ
          </p>
        </div>

        {/* Active Session Warning */}
        {currentUser && (
          <div
            style={{
              backgroundColor: "rgba(255, 255, 255, 0.08)",
              border: "1px solid rgba(255, 255, 255, 0.15)",
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
              {role !== "staff" && <div style={{ marginTop: "4px", color: "#B8A894", fontSize: "11.5px" }}>Đăng nhập Staff thành công sẽ thay thế phiên hiện tại.</div>}
            </div>
            {role === "staff" ? (
              <button
                onClick={() => navigate("/staff")}
                style={{
                  padding: "5px 12px",
                  backgroundColor: "#E8E1D6",
                  color: "#2B211C",
                  border: "none",
                  borderRadius: "4px",
                  fontSize: "12px",
                  cursor: "pointer",
                  fontWeight: "600",
                }}
              >
                Vào Staff Portal
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
            backgroundColor: "#2B211C",
            border: "1px solid #4E342E",
            borderRadius: "8px",
            padding: "35px 30px",
            boxShadow: "0 12px 40px rgba(0, 0, 0, 0.45)",
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
            Xác Thực Nhân Viên
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
                Email công việc (Staff Email) *
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="staff@maisonrue.com"
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  backgroundColor: "#1C1512",
                  border: "1px solid #5E473D",
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
                Mật khẩu hệ thống *
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Nhập mật khẩu"
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  backgroundColor: "#1C1512",
                  border: "1px solid #5E473D",
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
                backgroundColor: "#4E342E",
                color: "#F8F5F0",
                border: "1px solid #8A5A36",
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
              {loading ? "Đang xác thực bảo mật..." : "ĐĂNG NHẬP STAFF PORTAL"}
            </button>
          </form>

          {/* Quick Demo Staff Logins */}
          <div style={{ marginTop: "30px", paddingTop: "20px", borderTop: "1px solid #4E342E" }}>
            <div style={{ fontSize: "11px", color: "#A09384", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "10px", fontWeight: "600" }}>
              Tài khoản Staff thử nghiệm:
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <button
                type="button"
                onClick={() => quickFill("staff@maisonrue.com", "staff123")}
                style={{
                  padding: "8px 12px",
                  backgroundColor: "#1C1512",
                  border: "1px solid #4E342E",
                  borderRadius: "4px",
                  color: "#E8E1D6",
                  fontSize: "12px",
                  textAlign: "left",
                  cursor: "pointer",
                  display: "flex",
                  justifyContent: "space-between",
                }}
              >
                <span>Lê Hoàng Yến (Vận Hành)</span>
                <span style={{ color: "#B89B5E" }}>staff@maisonrue.com</span>
              </button>

              <button
                type="button"
                onClick={() => quickFill("staff2@maisonrue.com", "staff123")}
                style={{
                  padding: "8px 12px",
                  backgroundColor: "#1C1512",
                  border: "1px solid #4E342E",
                  borderRadius: "4px",
                  color: "#E8E1D6",
                  fontSize: "12px",
                  textAlign: "left",
                  cursor: "pointer",
                  display: "flex",
                  justifyContent: "space-between",
                }}
              >
                <span>Trần Minh Khoa (Kho Vận)</span>
                <span style={{ color: "#B89B5E" }}>staff2@maisonrue.com</span>
              </button>
            </div>
          </div>

          {/* Navigation Links */}
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
            <Link to="/" style={{ color: "#D8CEC1", textDecoration: "none" }}>← Về Cửa Hàng</Link>
            <span>•</span>
            <Link to="/admin/login" style={{ color: "#D8CEC1", textDecoration: "none" }}>Cổng Quản Trị Viên →</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

