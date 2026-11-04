import { Link } from "react-router-dom";
import useDocumentTitle from "../hooks/useDocumentTitle";
import products from "../data/products";

export default function Home() {
  useDocumentTitle("Maison Rue — The Art of Quiet Luxury");

  const bestSellers = [...products.men.slice(0, 2), ...products.women.slice(0, 2)];

  return (
    <main className="home-page">
      <div className="home-note">THE ART OF QUIET LUXURY <span>·</span> MADE TO BE KEPT</div>

      <section className="home-hero">
        <img src="/image/hero-image/hero-image.png" alt="Bộ sưu tập Maison Rue giữa khung cảnh thiên nhiên" />
        <div className="home-hero-copy">
          <span className="home-eyebrow">THE NEW SEASON</span>
          <h1>Quietly<br />exceptional.</h1>
          <p>Timeless pieces, shaped by nature and made to accompany you for years to come.</p>
          <Link className="home-link home-link-light" to="/women">DISCOVER THE COLLECTION <span>→</span></Link>
        </div>
        <div className="home-hero-caption">MAISON RUE — SPRING / SUMMER</div>
      </section>

      <section className="home-intro">
        <span className="home-eyebrow">A HOUSE OF MATERIALS</span>
        <h2>Luxury begins with<br />what nature gives us.</h2>
        <p>We believe the most beautiful things are never hurried. From the softness of cashmere to the easy touch of linen, every Maison Rue piece begins with a considered choice of fibre.</p>
        <Link className="home-link" to="/women">EXPLORE MAISON RUE <span>→</span></Link>
      </section>

      <section className="home-edit">
        <div className="home-edit-image"><img src="/image/best sellers/cardigan.png" alt="Áo cardigan len cashmere Maison Rue" /></div>
        <div className="home-edit-copy">
          <span className="home-eyebrow">THE MAISON RUE EDIT</span>
          <h2>Considered<br />essentials.</h2>
          <p>Soft layers and natural textures, designed with a sense of ease. Discover the pieces that make getting dressed feel effortless.</p>
          <Link className="home-link" to="/men">SHOP MEN <span>→</span></Link>
          <Link className="home-link" to="/women">SHOP WOMEN <span>→</span></Link>
        </div>
      </section>

      <section className="best-sellers home-best-sellers">
        <div className="bs-head"><span className="home-eyebrow">FAVOURITES, REVISITED</span><h2>Most loved</h2></div>
        <div className="bs-cards">
          {bestSellers.map((p) => (
            <Link to={`/product/${p.id}`} key={p.id} className="home-product">
              <div className="home-product-image"><img src={`/${p.images[0]}`} alt={p.name} /></div>
              <p>{p.name}</p>
              <p>{p.price.toLocaleString("vi-VN")}đ</p>
            </Link>
          ))}
        </div>
        <Link className="home-link home-link-center" to="/men">VIEW THE COLLECTION <span>→</span></Link>
      </section>

      <section className="home-craft">
        <div className="home-craft-copy">
          <span className="home-eyebrow">OUR STORY</span>
          <h2>Made with care.<br />Worn with feeling.</h2>
          <p>Maison Rue was born from a simple idea: that what we wear should feel as good as it looks. We bring together natural fibres, thoughtful details and enduring silhouettes to create a quieter kind of luxury.</p>
          <Link className="home-link" to="/our-story">THE MAISON RUE STORY <span>→</span></Link>
        </div>
        <div className="home-craft-image"><img src="/image/our story/craft.jpg" alt="Đôi tay nghệ nhân chăm chút từng chi tiết" /></div>
      </section>

      <section className="home-material">
        <img src="/image/our story/cashmere.png" alt="Chất liệu cashmere tự nhiên" />
        <div><span className="home-eyebrow">THE FEEL OF NATURE</span><h2>Fibre, feeling,<br />and the passage of time.</h2><p>Natural materials have a character all their own. We honour it in every thread, every texture, every piece made to last beyond a season.</p><Link className="home-link home-link-light" to="/collections/heritage-cashmere">DISCOVER OUR CASHMERE SELECTION <span>→</span></Link></div>
      </section>
    </main>
  );
}
