import { Outlet } from "react-router-dom";
import Header from "../Header";
import Footer from "../Footer";
import Chatbox from "../Chatbox";

export default function StorefrontLayout() {
  return (
    <>
      <Header />
      <Outlet />
      <Footer />
      <Chatbox />
    </>
  );
}

