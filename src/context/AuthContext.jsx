import { createContext, useContext, useState, useEffect } from "react";
import { authAPI } from "../services/api";

const AuthContext = createContext(null);

function formatErrorMessage(err) {
  const msg = err?.message || "";
  if (
    msg.includes("Failed to fetch") ||
    msg.includes("NetworkError") ||
    msg.includes("504") ||
    msg.includes("502") ||
    msg.includes("ECONNREFUSED")
  ) {
    return "Không thể kết nối đến Backend Server (port 5000). Vui lòng đảm bảo bạn đã khởi động server bằng lệnh: npm run server";
  }
  return msg || "Lỗi kết nối hoặc xử lý yêu cầu.";
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Check active session via HttpOnly cookie on mount
  useEffect(() => {
    let isMounted = true;
    async function verifySession() {
      try {
        const res = await authAPI.getMe();
        if (isMounted && res.success && res.user) {
          setCurrentUser(res.user);
        }
      } catch {
        // Not logged in or cookie expired or server not ready
        if (isMounted) setCurrentUser(null);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    verifySession();
    return () => {
      isMounted = false;
    };
  }, []);

  // Customer Portal Login (/login)
  const loginCustomer = async (email, password) => {
    try {
      const res = await authAPI.customerLogin(email, password);
      if (res.success) {
        setCurrentUser(res.user);
        return { success: true, user: res.user, destination: res.portalDestination || "/account/orders" };
      }
      return { success: false, error: res.error || "Đăng nhập thất bại." };
    } catch (err) {
      return { success: false, error: formatErrorMessage(err) };
    }
  };

  // Staff Portal Login (/staff/login)
  const loginStaff = async (email, password) => {
    try {
      const res = await authAPI.staffLogin(email, password);
      if (res.success) {
        setCurrentUser(res.user);
        return { success: true, user: res.user, destination: res.portalDestination || "/staff" };
      }
      return { success: false, error: res.error || "Đăng nhập thất bại." };
    } catch (err) {
      return { success: false, error: formatErrorMessage(err) };
    }
  };

  // Admin Portal Login (/admin/login)
  const loginAdmin = async (email, password) => {
    try {
      const res = await authAPI.adminLogin(email, password);
      if (res.success) {
        setCurrentUser(res.user);
        return { success: true, user: res.user, destination: res.portalDestination || "/admin" };
      }
      return { success: false, error: res.error || "Đăng nhập thất bại." };
    } catch (err) {
      return { success: false, error: formatErrorMessage(err) };
    }
  };

  // Public Customer Registration
  const register = async ({ name, phone, email, password }) => {
    try {
      const res = await authAPI.registerCustomer({ name, phone, email, password });
      if (res.success) {
        setCurrentUser(res.user);
        return { success: true, user: res.user, destination: res.portalDestination || "/account/orders" };
      }
      return { success: false, error: res.error || "Đăng ký thất bại." };
    } catch (err) {
      return { success: false, error: formatErrorMessage(err) };
    }
  };

  // Logout
  const logout = async () => {
    try {
      await authAPI.logout();
    } catch (err) {
      console.warn("[Auth] Logout request warning:", err.message);
    } finally {
      setCurrentUser(null);
    }
  };

  const value = {
    currentUser,
    isAuthenticated: !!currentUser,
    role: currentUser?.role || null,
    loading,
    loginCustomer,
    loginStaff,
    loginAdmin,
    register,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

export default AuthContext;
