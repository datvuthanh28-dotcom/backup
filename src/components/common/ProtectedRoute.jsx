import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

/**
 * ProtectedRoute component enforces strict role-based access control per portal.
 * @param {Array<string>} allowedRoles - e.g. ['customer'], ['staff'], or ['admin']
 * @param {string} loginRedirect - Custom login route if unauthenticated
 * @param {React.ReactNode} children
 */
export default function ProtectedRoute({ allowedRoles = [], loginRedirect, children }) {
  const { currentUser, isAuthenticated, role, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div
        style={{
          minHeight: "70vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#F8F5F0",
          color: "#4E342E",
          fontFamily: "'Cormorant Garamond', serif",
          fontSize: "24px",
        }}
      >
        Đang xác thực bảo mật hệ thống Maison Rue...
      </div>
    );
  }

  // Determine appropriate login destination based on path
  const getLoginRoute = () => {
    if (loginRedirect) return loginRedirect;
    if (location.pathname.startsWith("/admin")) return "/admin/login";
    if (location.pathname.startsWith("/staff")) return "/staff/login";
    return "/login";
  };

  if (!isAuthenticated || !currentUser) {
    return <Navigate to={getLoginRoute()} state={{ from: location }} replace />;
  }

  // Role validation
  if (allowedRoles.length > 0 && !allowedRoles.includes(role)) {
    return (
      <Navigate
        to="/access-denied"
        state={{
          requiredRoles: allowedRoles,
          currentRole: role,
          attemptedPath: location.pathname,
        }}
        replace
      />
    );
  }

  return children;
}
