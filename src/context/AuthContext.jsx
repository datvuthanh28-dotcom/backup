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
    return "Unable to connect to the server. Please try again in a moment.";
  }
  return msg || "A connection or request error occurred.";
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const notifyAuthChange = (type, user = null) => {
    try {
      localStorage.setItem("maison_auth_event", JSON.stringify({ type, userId: user?.id || null, role: user?.role || null, at: Date.now() }));
    } catch {
      // Storage may be unavailable in restricted browser contexts.
    }
  };

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

  // Keep multiple tabs in the same browser profile on the same authenticated user.
  useEffect(() => {
    const roleDestination = (role) => {
      if (role === "admin") return "/admin";
      if (role === "staff") return "/staff";
      return "/account/orders";
    };
    const syncSession = async (event) => {
      const payload = (() => {
        try { return JSON.parse(event?.newValue || "{}"); } catch { return {}; }
      })();
      if (payload.type === "logout") {
        setCurrentUser(null);
        return;
      }
      try {
        const res = await authAPI.getMe();
        const nextUser = res.success && res.user ? res.user : null;
        setCurrentUser(nextUser);
        if (nextUser) {
          const destination = roleDestination(nextUser.role);
          const isPortalPath = window.location.pathname.startsWith("/admin") || window.location.pathname.startsWith("/staff") || window.location.pathname.startsWith("/account");
          const roleMatchesPath = (nextUser.role === "admin" && window.location.pathname.startsWith("/admin")) || (nextUser.role === "staff" && window.location.pathname.startsWith("/staff")) || (nextUser.role === "customer" && !window.location.pathname.startsWith("/admin") && !window.location.pathname.startsWith("/staff"));
          const roleChanged = payload.type === "login" && currentUser?.role && currentUser.role !== nextUser.role;
          if ((isPortalPath && !roleMatchesPath) || roleChanged) window.location.assign(destination);
        }
      } catch {
        setCurrentUser(null);
      }
    };
    const handleStorage = (event) => {
      if (event.key === "maison_auth_event") syncSession(event);
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [currentUser]);

  // Customer Portal Login (/login)
  const loginCustomer = async (email, password) => {
    try {
      const res = await authAPI.customerLogin(email, password);
      if (res.success) {
        setCurrentUser(res.user);
        notifyAuthChange("login", res.user);
        return { success: true, user: res.user, destination: res.portalDestination || "/account/orders" };
      }
      return { success: false, error: res.error || "Sign in failed." };
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
        notifyAuthChange("login", res.user);
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
        notifyAuthChange("login", res.user);
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
        notifyAuthChange("login", res.user);
        return { success: true, user: res.user, destination: res.portalDestination || "/account/orders" };
      }
      return { success: false, error: res.error || "Registration failed." };
    } catch (err) {
      return { success: false, error: formatErrorMessage(err) };
    }
  };

  // Forgot Password (request 6-digit OTP)
  const forgotPassword = async (email) => {
    try {
      const res = await authAPI.forgotPassword(email);
      return { success: true, message: res.message };
    } catch (err) {
      return { success: false, error: formatErrorMessage(err) };
    }
  };

  // Reset Password with 6-digit OTP (invalidates previous sessions/cookies)
  const resetPassword = async ({ email, otp, newPassword }) => {
    try {
      const res = await authAPI.resetPassword({ email, otp, newPassword });
      setCurrentUser(null);
      notifyAuthChange("logout");
      return { success: true, message: res.message };
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
      notifyAuthChange("logout");
    }
  };

  const value = {
    currentUser,
    updateCurrentUser: (user) => setCurrentUser((prev) => ({ ...prev, ...user })),
    isAuthenticated: !!currentUser,
    role: currentUser?.role || null,
    loading,
    loginCustomer,
    loginStaff,
    loginAdmin,
    register,
    forgotPassword,
    resetPassword,
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
