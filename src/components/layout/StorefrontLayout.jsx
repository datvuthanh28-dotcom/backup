import { Navigate, Outlet } from "react-router-dom";
import Header from "../Header";
import Footer from "../Footer";
import Chatbox from "../Chatbox";
import { useAuth } from "../../context/AuthContext";

export default function StorefrontLayout() {
  const { currentUser, loading } = useAuth();

  if (loading) return null;
  if (currentUser?.role === "admin") return <Navigate to="/admin" replace />;
  if (currentUser?.role === "staff") return <Navigate to="/staff" replace />;

  return (
    <>
      <Header />
      <Outlet />
      <Footer />
      <Chatbox />
    </>
  );
}

