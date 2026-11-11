import { useEffect, useState } from "react";

export default function BackToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const update = () => setVisible(window.scrollY > 600);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  if (!visible) return null;
  return <button type="button" className="admin-back-to-top" aria-label="Lên đầu trang" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>↑<span>Lên đầu trang</span></button>;
}
