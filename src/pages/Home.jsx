import { Link } from "react-router-dom";
import useDocumentTitle from "../hooks/useDocumentTitle";
import products from "../data/products";

function FavoriteRow({ label, items }) {
  return (
    <div className="home-favorites-group">
      <h3>— {label} —</h3>
      <div className="home-favorites-grid">
        {items.map((p) => (
          <Link to={`/product/${p.id}`} key={p.id} className="home-product">
            <div className="home-product-image"><img src={`/${p.images[0]}`} alt={p.name} /></div>
            <p>{p.name}</p>
            <p>{p.price.toLocaleString("vi-VN")}đ</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

export default function Home() {
  useDocumentTitle("Maison Rue — The Art of Quiet Luxury");

  const mostLovedMen = [109, 113, 117, 127].map((id) => products.men.find((p) => p.id === id)).filter(Boolean);
  const mostLovedWomen = [150, 155, 158, 174].map((id) => products.women.find((p) => p.id === id)).filter(Boolean);

  return (
    <main className="home-page">
      <div className="home-note">THE ART OF QUIET LUXURY <span>·</span> MADE TO BE KEPT</div>

      <section className="home-hero">
        <img src="/image/hero-image/saigon-tailoring-hero.png" alt="The Saigon Tailoring collection in a warm atelier" />
        <div className="home-hero-copy">
          <span className="home-eyebrow">FALL/WINTER 2026–2027</span>
          <h1>The Saigon<br />Tailoring Edit.</h1>
          <p>A refined wardrobe of cashmere, linen, silk and suede for the season ahead.</p>
          <div className="home-hero-links">
            <Link className="home-link home-link-light" to="/collections/fall-winter-2026-2027?audience=men">FOR MEN <span>→</span></Link>
            <Link className="home-link home-link-light" to="/collections/fall-winter-2026-2027?audience=women">FOR WOMEN <span>→</span></Link>
          </div>
        </div>
        <div className="home-hero-caption">MAISON RUE — SPRING / SUMMER</div>
      </section>

      <section className="home-intro">
        <span className="home-eyebrow">A HOUSE OF MATERIALS</span>
        <h2>Luxury begins with<br />what nature gives us.</h2>
        <p>We believe the most beautiful things are never hurried. From the softness of cashmere to the easy touch of linen, every Maison Rue piece begins with a considered choice of fibre.</p>
      </section>

      <section className="home-edit">
        <div className="home-edit-image"><img src="/image/best sellers/cardigan.png" alt="Maison Rue cashmere cardigan" /></div>
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
        <FavoriteRow label="Women" items={mostLovedWomen} />
        <FavoriteRow label="Men" items={mostLovedMen} />
      </section>

      <section className="home-craft">
        <div className="home-craft-copy">
          <span className="home-eyebrow">OUR STORY</span>
          <h2>Made with care.<br />Worn with feeling.</h2>
          <p>Maison Rue was born from a simple idea: that what we wear should feel as good as it looks. We bring together natural fibres, thoughtful details and enduring silhouettes to create a quieter kind of luxury.</p>
          <Link className="home-link" to="/our-story">THE MAISON RUE STORY <span>→</span></Link>
        </div>
        <div className="home-craft-image"><img src="/image/our story/craft.jpg" alt="An artisan’s hands perfecting every detail" /></div>
      </section>

      <section className="home-material">
        <img src="/image/our story/cashmere.png" alt="Natural cashmere" />
        <div><span className="home-eyebrow">THE FEEL OF NATURE</span><h2>Fibre, feeling,<br />and the passage of time.</h2><p>Natural materials have a character all their own. We honour it in every thread, every texture, every piece made to last beyond a season.</p><Link className="home-link home-link-light" to="/collections/heritage-cashmere">DISCOVER OUR CASHMERE SELECTION <span>→</span></Link></div>
      </section>
    </main>
  );
}
