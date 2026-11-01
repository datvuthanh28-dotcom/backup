import { Link } from "react-router-dom";
import useDocumentTitle from "../hooks/useDocumentTitle";
import products from "../data/products";

export default function Home() {
  useDocumentTitle("Homepage");

  const bestSellers = [
    ...products.men.slice(0, 2),
    ...products.women.slice(0, 2),
  ];

  return (
    <main>
      <section className="summerCollection">
        <div className="sc-img">
          <img src="/image/hero-image/hero-image.png" alt="Maison Rue summer collection" />
        </div>
        <div className="sc-text">
          <h1>MAISON RUE</h1>
          <p>Old-money elegance, crafted from cashmere, linen and suede since 1923.</p>
          <Link to="/women">
            <button>SHOP THE COLLECTION</button>
          </Link>
        </div>
      </section>

      <section className="best-sellers">
        <div className="bs-head">
          <h1>Best Sellers</h1>
        </div>
        <div className="bs-cards">
          {bestSellers.map((p) => (
            <Link to={`/product/${p.id}`} key={p.id}>
              <img src={`/${p.images[0]}`} alt={p.name} />
              <p>{p.name}</p>
              <p>{p.price.toLocaleString("vi-VN")}đ</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="our-story">
        <div className="os-content">
          <h1>Our Story</h1>
          <p>
            Since 1923, Maison Rue has crafted timeless cashmere, linen and
            suede pieces for those who value quiet luxury.
          </p>
        </div>
        <div className="os-img">
          <img src="/image/our story/craft.jpg" alt="Our story" />
        </div>
      </section>
    </main>
  );
}
