import { Link } from "react-router-dom";

export default function Footer() {
  return (
    <footer className="site-footer" style={{ padding: "35px 20px", borderTop: "1px solid #D8CEC1", backgroundColor: "#F8F5F0", textAlign: "center" }}>
      <div style={{ maxWidth: "800px", margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "center", gap: "25px", marginBottom: "15px", fontSize: "12px", textTransform: "uppercase", letterSpacing: "1px" }}>
          <Link to="/login" style={{ color: "#6B5A4B", textDecoration: "none" }}>
            <i className="fas fa-user" style={{ marginRight: "4px" }}></i> Cổng Khách Hàng
          </Link>
          <span style={{ color: "#D8CEC1" }}>|</span>
          <Link to="/staff/login" style={{ color: "#4E342E", textDecoration: "none", fontWeight: "600" }}>
            <i className="fas fa-boxes" style={{ marginRight: "4px" }}></i> Cổng Nhân Viên (Staff)
          </Link>
          <span style={{ color: "#D8CEC1" }}>|</span>
          <Link to="/admin/login" style={{ color: "#2B211C", textDecoration: "none", fontWeight: "700" }}>
            <i className="fas fa-crown" style={{ marginRight: "4px" }}></i> Cổng Quản Trị (Admin)
          </Link>
        </div>
        <p className="copyright" style={{ fontSize: "12px", color: "#8A7350", margin: 0 }}>
          Maison Rue © {new Date().getFullYear()}. Luxury Fashion Crafted from Cashmere, Linen and Suede since 1923.
        </p>
      </div>
    </footer>
  );
}
