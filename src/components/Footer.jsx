import { useState } from "react";
import { Link } from "react-router-dom";

const footerGroups = [
  {
    title: "Client Services",
    links: [
      { label: "Contact Us", to: "/contact" },
      { label: "Returns & Refunds", to: "/returns" },
      { label: "Shopping Guide", to: "/shopping-guide" },
    ],
  },
  {
    title: "Maison Rue",
    links: [
      { label: "Our Story", to: "/our-story" },
      { label: "Men", to: "/men" },
      { label: "Women", to: "/women" },
    ],
  },
  {
    title: "Policies",
    links: [
      { label: "Terms & Conditions", to: "/terms" },
      { label: "Privacy Policy", to: "/privacy" },
      { label: "Cookie Policy", to: "/cookies" },
    ],
  },
];

export default function Footer() {
  const [email, setEmail] = useState("");
  const [subscribed, setSubscribed] = useState(false);

  function handleSubscribe(event) {
    event.preventDefault();
    if (email.trim()) setSubscribed(true);
  }

  return (
    <footer className="site-footer">
      <section className="footer-newsletter" aria-labelledby="footer-newsletter-title">
        <p className="footer-kicker">Maison Rue — The Art of Quiet Luxury</p>
        <h2 id="footer-newsletter-title">The Maison Rue Newsletter</h2>
        <p className="footer-newsletter-copy">Receive considered stories, new collections and exclusive offers from Maison Rue.</p>
        {subscribed ? (
          <p className="footer-success" role="status">Thank you for subscribing.</p>
        ) : (
          <form className="footer-newsletter-form" onSubmit={handleSubscribe}>
            <label className="sr-only" htmlFor="footer-email">Email address</label>
            <input id="footer-email" type="email" placeholder="Enter your email address" value={email} onChange={(event) => setEmail(event.target.value)} required />
            <button type="submit" aria-label="Subscribe to the newsletter">→</button>
          </form>
        )}
      </section>

      <div className="footer-main">
        <div className="footer-links-grid">
          {footerGroups.map((group) => (
            <section className="footer-link-group" key={group.title}>
              <h3>{group.title}</h3>
              {group.links.map((link) => <Link key={link.label} to={link.to}>{link.label}</Link>)}
            </section>
          ))}
          <section className="footer-link-group footer-social">
            <h3>Follow Us</h3>
            <div className="footer-social-links">
              <a href="https://www.instagram.com/" aria-label="Instagram" target="_blank" rel="noreferrer"><i className="fa-brands fa-instagram" aria-hidden="true" /></a>
              <a href="https://www.facebook.com/" aria-label="Facebook" target="_blank" rel="noreferrer"><i className="fa-brands fa-facebook-f" aria-hidden="true" /></a>
              <a href="https://x.com/" aria-label="X" target="_blank" rel="noreferrer"><i className="fa-brands fa-x-twitter" aria-hidden="true" /></a>
            </div>
          </section>
        </div>

        <p className="copyright">Maison Rue © {new Date().getFullYear()}. Luxury fashion crafted from cashmere, linen and suede since 1923.</p>
      </div>
    </footer>
  );
}
