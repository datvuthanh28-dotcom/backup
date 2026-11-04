import { useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import useDocumentTitle from "../hooks/useDocumentTitle";

export default function CustomerLogin() {
  useDocumentTitle("Đăng Nhập Khách Hàng");
  const { loginCustomer, register, currentUser, role, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [tab, setTab] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState({});
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);

  const requestedDestination = new URLSearchParams(location.search).get("returnTo");
  const safeRequestedDestination = requestedDestination?.startsWith("/") && !requestedDestination.startsWith("//")
    ? requestedDestination
    : null;
  const destination = safeRequestedDestination || location.state?.from?.pathname || "/account/orders";

  const handleLogin = async (e) => {
    e.preventDefault();
    setNotice("");
    const errs = {};
    if (!email.trim()) errs.email = "Vui lòng nhập email khách hàng.";
    if (!password) errs.password = "Vui lòng nhập mật khẩu.";
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setLoading(true);
    const result = await loginCustomer(email, password);
    setLoading(false);

    if (!result.success) {
      setErrors({ form: result.error });
    } else {
      setNotice(`Chào mừng trở lại, ${result.user.name}!`);
      setTimeout(() => {
        navigate(destination, { replace: true });
      }, 500);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setNotice("");
    const name = e.target["reg-name"].value.trim();
    const phone = e.target["reg-phone"].value.trim();
    const regEmail = e.target["reg-email"].value.trim();
    const regPassword = e.target["reg-password"].value;
    const errs = {};

    if (!name) errs.name = "Họ và tên là bắt buộc.";
    if (!regEmail) errs.email = "Email là bắt buộc.";
    if (!regPassword || regPassword.length < 6) errs.password = "Mật khẩu tối thiểu 6 ký tự.";
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setLoading(true);
    const result = await register({ name, phone, email: regEmail, password: regPassword });
    setLoading(false);

    if (!result.success) {
      setErrors({ form: result.error });
    } else {
      setNotice("Đăng ký tài khoản khách hàng thành công!");
      setTimeout(() => {
        navigate("/account/orders", { replace: true });
      }, 500);
    }
  };

  const quickFill = (demoEmail, demoPass) => {
    setEmail(demoEmail);
    setPassword(demoPass);
    setErrors({});
  };

  return (
    <main className="auth-container" style={{ padding: "50px 20px", minHeight: "80vh" }}>
      <div style={{ maxWidth: "480px", width: "100%", margin: "0 auto" }}>
        {/* Portal Identifier Badge */}
        <div style={{ textAlign: "center", marginBottom: "20px" }}>
          <span
            style={{
              display: "inline-block",
              padding: "4px 14px",
              backgroundColor: "#FAF6F0",
              border: "1px solid #D8CEC1",
              borderRadius: "20px",
              fontSize: "12px",
              fontWeight: "600",
              color: "#8A7350",
              letterSpacing: "1px",
              textTransform: "uppercase",
            }}
          >
            <i className="fas fa-shopping-bag" style={{ marginRight: "6px" }}></i> CỔNG KHÁCH HÀNG (CUSTOMER PORTAL)
          </span>
        </div>

        {currentUser && (
          <div
            style={{
              backgroundColor: "#FAF6F0",
              border: "1px solid #D8CEC1",
              borderRadius: "8px",
              padding: "16px 20px",
              marginBottom: "20px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <div style={{ fontSize: "12px", color: "#6B5A4B" }}>Đang đăng nhập:</div>
              <strong style={{ color: "#2B211C" }}>{currentUser.name}</strong> ({role})
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <Link to="/account/orders" className="btn-primary" style={{ padding: "6px 14px", fontSize: "12px", textDecoration: "none" }}>
                Đơn hàng
              </Link>
              <button onClick={logout} className="btn-secondary" style={{ padding: "6px 12px", fontSize: "12px", width: "auto", margin: 0 }}>
                Đăng xuất
              </button>
            </div>
          </div>
        )}

        <div className="auth-box" style={{ borderRadius: "8px" }}>
          <div className="auth-tabs">
            <button
              className={tab === "login" ? "tab-btn active" : "tab-btn"}
              onClick={() => {
                setTab("login");
                setErrors({});
              }}
            >
              ĐĂNG NHẬP
            </button>
            <button
              className={tab === "register" ? "tab-btn active" : "tab-btn"}
              onClick={() => {
                setTab("register");
                setErrors({});
              }}
            >
              ĐĂNG KÝ MỚI
            </button>
          </div>

          {notice && (
            <p
              style={{
                backgroundColor: "#F0FFF0",
                color: "#2E8B57",
                border: "1px solid #C3E6CB",
                padding: "10px",
                borderRadius: "4px",
                fontSize: "13.5px",
                textAlign: "center",
                marginBottom: "15px",
              }}
            >
              {notice}
            </p>
          )}

          {errors.form && (
            <div
              style={{
                backgroundColor: "#FFF0F0",
                color: "#D9534F",
                border: "1px solid #F5C6CB",
                padding: "12px",
                borderRadius: "4px",
                fontSize: "13.5px",
                marginBottom: "15px",
                lineHeight: "1.4",
              }}
            >
              ⚠️ {errors.form}
            </div>
          )}

          {tab === "login" ? (
            <form className="auth-form active" onSubmit={handleLogin} noValidate>
              <div className="form-group">
                <label>Email khách hàng *</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Ví dụ: customer@gmail.com"
                />
                {errors.email && <span className="error">{errors.email}</span>}
              </div>

              <div className="form-group">
                <label>Mật khẩu *</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Nhập mật khẩu"
                />
                {errors.password && <span className="error">{errors.password}</span>}
              </div>

              <div className="form-options">
                <label className="remember-me">
                  <input type="checkbox" defaultChecked /> <span>Ghi nhớ phiên</span>
                </label>
                <a href="#forgot" onClick={(e) => { e.preventDefault(); alert("Vui lòng sử dụng tài khoản demo bên dưới."); }} className="forgot-pass">
                  Quên mật khẩu?
                </a>
              </div>

              <button type="submit" disabled={loading} className="auth-submit-btn">
                {loading ? "Đang xác thực..." : "ĐĂNG NHẬP KHÁCH HÀNG"}
              </button>
            </form>
          ) : (
            <form className="auth-form active" onSubmit={handleRegister} noValidate>
              <div className="form-group">
                <label>Họ và tên *</label>
                <input type="text" id="reg-name" name="reg-name" placeholder="Nguyễn Văn An" />
                {errors.name && <span className="error">{errors.name}</span>}
              </div>

              <div className="form-group">
                <label>Số điện thoại</label>
                <input type="tel" id="reg-phone" name="reg-phone" placeholder="0987654321" />
              </div>

              <div className="form-group">
                <label>Email đăng ký *</label>
                <input type="email" id="reg-email" name="reg-email" placeholder="an.nguyen@gmail.com" />
                {errors.email && <span className="error">{errors.email}</span>}
              </div>

              <div className="form-group">
                <label>Mật khẩu *</label>
                <input type="password" id="reg-password" name="reg-password" placeholder="Tối thiểu 6 ký tự" />
                {errors.password && <span className="error">{errors.password}</span>}
              </div>

              <button type="submit" disabled={loading} className="auth-submit-btn">
                {loading ? "Đang tạo tài khoản..." : "TẠO TÀI KHOẢN KHÁCH HÀNG"}
              </button>
            </form>
          )}

          {/* Quick Demo Customer Account */}
          <div style={{ marginTop: "30px", paddingTop: "20px", borderTop: "1px dashed #D8CEC1" }}>
            <div style={{ fontSize: "12px", color: "#8A7350", marginBottom: "10px", fontWeight: "600", textTransform: "uppercase" }}>
              Tài khoản Khách Hàng thử nghiệm:
            </div>
            <button
              type="button"
              onClick={() => quickFill("customer@gmail.com", "customer123")}
              style={{
                width: "100%",
                padding: "10px 14px",
                backgroundColor: "#FAF6F0",
                border: "1px solid #D8CEC1",
                borderRadius: "5px",
                cursor: "pointer",
                textAlign: "left",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <strong style={{ color: "#2B211C", fontSize: "13px" }}>🛍️ Nguyễn Văn An</strong>
                <div style={{ fontSize: "11.5px", color: "#6B5A4B" }}>customer@gmail.com (pass: customer123)</div>
              </div>
              <span style={{ fontSize: "12px", color: "#B89B5E", fontWeight: "600" }}>Điền thông tin</span>
            </button>
          </div>

          {/* Cross portal links for testing role rejection */}
          <div style={{ marginTop: "20px", textAlign: "center", fontSize: "12px", color: "#8A7350" }}>
            Cổng làm việc nội bộ:{" "}
            <Link to="/staff/login" style={{ color: "#4E342E", fontWeight: "600" }}>Cổng Staff</Link> •{" "}
            <Link to="/admin/login" style={{ color: "#2B211C", fontWeight: "600" }}>Cổng Admin</Link>
          </div>
        </div>
      </div>
    </main>
  );
}
