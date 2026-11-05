import { Link } from "react-router-dom";
import useDocumentTitle from "../hooks/useDocumentTitle";

export default function OurStory() {
  useDocumentTitle("Our Story — Maison Rue");

  return (
    <main className="our-story-page">
      <div className="story-brand">
      <section className="story-hero">
        <img src="/image/our story/saigon-heritage.png" alt="Historic Ben Thanh Market in Saigon" />
        <div className="story-hero-copy">
          <span>EST. SAIGON · 1975</span>
          <h1>A legacy in<br />every stitch.</h1>
          <p>Some values are not made in a day; they are built over time.</p>
        </div>
      </section>

      <section className="story-introduction">
        <span className="story-kicker">OUR BEGINNING — SAIGON, 1975</span>
        <h2>A house built<br />by hand.</h2>
        <p>In 1975, in Saigon, Maison Rue began its journey with a love for the art of hand tailoring. In an age when the skill of the hand could not be replaced, our first artisans laid the foundation for a simple philosophy: every garment deserves to be made with devotion and respect.</p>
      </section>

      <section className="story-founder story-founder-origin">
        <div className="story-founder-copy">
          <span className="story-kicker">THE FOUNDERS</span>
          <h2>A family belief<br />in honest craft.</h2>
          <p className="story-lead">“Clothing should be made with care, then live beautifully with the person who wears it.”</p>
          <p>Maison Rue was founded by a Saigon family who saw tailoring as more than a trade. They believed that a garment should be considered from its first choice of cloth to its final stitch, and that the relationship between maker and wearer gives an object its meaning. This belief remains at the heart of the house today.</p>
        </div>
        <div className="story-founder-image"><img src="/image/our story/founders-atelier.png" alt="Maison Rue’s historic atelier" /></div>
      </section>

      <section className="story-founder">
        <div className="story-founder-image"><img src="/image/our story/craft.jpg" alt="Maison Rue artisan at work" /></div>
        <div className="story-founder-copy">
          <span className="story-kicker">THE CRAFT</span>
          <h2>Time, patience<br />and precision.</h2>
          <p className="story-lead">“Every garment deserves to be made with devotion and respect.”</p>
          <p>From selecting materials and constructing a silhouette to every stitch, each stage bears the mark of its maker. There is no rush and no detail is treated carelessly. There is only experience, patience and a belief that true beauty lies in the things finished with meticulous care.</p>
        </div>
      </section>

      <section className="story-timeline">
        <span className="story-kicker">A HOUSE IN TIME</span>
        <div className="story-timeline-grid">
          <article><span>1975</span><h3>The first hands</h3><p>Our journey begins in Saigon, where a shared love of hand tailoring shaped the foundations of the house.</p></article>
          <article><span>Through the decades</span><h3>The craft endures</h3><p>Fashion has changed and trends have come and gone, but the spirit of craftsmanship has been protected and passed through generations.</p></article>
          <article><span>Today</span><h3>Carrying it forward</h3><p>We bring Saigon’s tailoring heritage into a contemporary point of view, refining our technique without losing the values that define us.</p></article>
        </div>
      </section>
      </div>

      <div className="story-material-story">
      <section className="story-material-hero">
        <img src="/image/our story/cashmere.png" alt="Maison Rue natural cashmere" />
        <div><span className="story-kicker">THE MATERIALS WE LIVE IN</span><h2>Nature is our<br />starting point.</h2></div>
      </section>

      <section className="story-materials">
        <article><span>01</span><h2>Cashmere</h2><p>Chosen for its incomparable softness and light warmth, our cashmere is selected fibre by fibre. The result is a piece that feels generous from the first wear and becomes more familiar over the years.</p><Link to="/collections/heritage-cashmere">DISCOVER CASHMERE <b>→</b></Link></article>
        <article><span>02</span><h2>Linen</h2><p>Breathable, tactile and naturally relaxed, linen carries the character of summer. We use it for its subtle texture and the beautiful ease it gains with every wash and every journey.</p><Link to="/collections/riviera-linen">DISCOVER LINEN <b>→</b></Link></article>
        <article><span>03</span><h2>Suede</h2><p>Supple yet resilient, suede brings a gentle structure to the everyday. It is selected for its velvet hand, nuanced colour and the patina it develops as it becomes yours.</p><Link to="/collections/suede-essentials">DISCOVER SUEDE <b>→</b></Link></article>
      </section>

      <section className="story-closing">
        <span className="story-kicker">OUR PROMISE</span>
        <h2>Made by hand.<br />Kept by time.</h2>
        <p>Crafted in Saigon. Enduring through time.</p>
        <Link to="/collections/fall-winter-2026-2027">EXPLORE OUR COLLECTION <b>→</b></Link>
      </section>
      </div>
    </main>
  );
}
