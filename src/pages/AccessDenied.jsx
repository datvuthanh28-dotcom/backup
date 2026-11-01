import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import useDocumentTitle from "../hooks/useDocumentTitle";

export default function AccessDenied() {
  useDocumentTitle("Truy cập bị từ chối");
  const { currentUser, role, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const state = location.state || {};
  const requiredRoles = state.requiredRoles || [];
  const attemptedPath = state.attemptedPath || "trang yêu cầu";

  const getRoleLabel = (r) => {
    switch (r) {
      case "admin":
        return "Quản trị viên (Admin)";
      case "staff":
        return "Nhân viên vận hành (Staff)";
      case "customer":
        return "Khách hàng (Customer)";
      default:
        return r || "Khách chưa đăng nhập";
    }
  };

  const getTargetWorkspace = () => {
    if (role === "admin") return { path: "/admin", label: "Về Cổng Quản Trị (Admin Portal)" };
    if (role === "staff") return { path: "/staff", label: "Về Cổng Nhân Viên (Staff Portal)" };
    return { path: "/account/orders", label: "Về Đơn Hàng Của Tôi (Customer Portal)" };
  };

  const getTargetLogin = () => {
    if (attemptedPath.startsWith("/admin")) return "/admin/login";
    if (attemptedPath.startsWith("/staff")) return "/staff/login";
    return "/login";
  };

  const workspace = getTargetWorkspace();
  const targetLogin = getTargetLogin();

  const handleSwitchAccount = async () => {
    await logout();
    navigate(targetLogin);
  };

  return (
    <main
      style={{
        minHeight: "75vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "50px 20px",
        backgroundColor: "#F8F5F0",
      }}
    >
      <div
        style={{
          maxWidth: "600px",
          width: "100%",
          backgroundColor: "#FFFFFF",
          border: "1px solid #D8CEC1",
          borderRadius: "8px",
          padding: "50px 40px",
          textAlign: "center",
          boxShadow: "0 10px 30px rgba(43, 33, 28, 0.08)",
        }}
      >
        <div
          style={{
            width: "70px",
            height: "70px",
            borderRadius: "50%",
            backgroundColor: "#FFF0F0",
            color: "#D9534F",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "30px",
            margin: "0 auto 25px",
            border: "1px solid #F5C6CB",
          }}
        >
          <i className="fas fa-shield-alt"></i>
        </div>

        <h1
          style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontSize: "36px",
            color: "#2B211C",
            marginBottom: "15px",
            fontWeight: "600",
          }}
        >
          TRUY CẬP BỊ TỪ CHỐI
        </h1>

        <p
          style={{
            fontSize: "14.5px",
            color: "#6B5A4B",
            lineHeight: "1.7",
            marginBottom: "25px",
          }}
        >
          Bạn không có đặc quyền cần thiết để truy cập vào phân vùng này (
          <code
            style={{
              backgroundColor: "#EEEAE6",
              padding: "2px 6px",
              borderRadius: "4px",
              fontSize: "13px",
              color: "#2B211C",
            }}
          >
            {attemptedPath}
          </code>
          ). Hệ thống Maison Rue thực thi chính sách bảo mật phân quyền 3 cổng nghiêm ngặt (Strict Role Isolation).
        </p>

        <div
          style={{
            backgroundColor: "#F8F5F0",
            border: "1px solid #E8E1D6",
            borderRadius: "6px",
            padding: "16px 20px",
            marginBottom: "30px",
            textAlign: "left",
            fontSize: "13.5px",
          }}
        >
          <div style={{ marginBottom: "8px" }}>
            <strong style={{ color: "#2B211C" }}>Tài khoản đang đăng nhập:</strong>{" "}
            <span style={{ color: "#4E342E" }}>
              {currentUser?.name || "Chưa xác thực"} ({currentUser?.email || "Chưa có"})
            </span>
          </div>
          <div style={{ marginBottom: "8px" }}>
            <strong style={{ color: "#2B211C" }}>Vai trò hiện hành:</strong>{" "}
            <span
              style={{
                display: "inline-block",
                padding: "2px 10px",
                borderRadius: "12px",
                backgroundColor: "#2B211C",
                color: "#F8F5F0",
                fontSize: "12px",
                fontWeight: "600",
              }}
            >
              {getRoleLabel(role)}
            </span>
          </div>
          <div>
            <strong style={{ color: "#2B211C" }}>Vai trò được phép truy cập:</strong>{" "}
            <span style={{ color: "#8A5A36", fontWeight: "600" }}>
              {requiredRoles.map((r) => getRoleLabel(r)).join(" HOẶC ")}
            </span>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {currentUser && (
            <Link
              to={workspace.path}
              className="btn-primary"
              style={{
                display: "block",
                textAlign: "center",
                textDecoration: "none",
                padding: "13px",
              }}
            >
              {workspace.label}
            </Link>
          )}

          <div style={{ display: "flex", gap: "10px" }}>
            <Link
              to="/"
              className="btn-secondary"
              style={{
                flex: 1,
                textAlign: "center",
                textDecoration: "none",
                margin: 0,
                padding: "11px",
              }}
            >
              Về Cửa Hàng
            </Link>

            <button
              onClick={handleSwitchAccount}
              className="btn-secondary"
              style={{
                flex: 1,
                margin: 0,
                padding: "11px",
                borderColor: "#D9534F",
                color: "#D9534F",
              }}
            >
              Đăng Nhập Cổng Đúng
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
