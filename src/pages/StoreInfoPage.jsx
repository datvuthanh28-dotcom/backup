import { Link } from "react-router-dom";

const pages = {
  contact: {
    eyebrow: "WE ARE HERE TO HELP",
    title: "Contact Us",
    intro: "Our client services team can help with your order, product details and shopping experience.",
    sections: [
      { title: "Order support", paragraphs: ["For help with an existing order, sign in and open My Account → Orders. Include your order number when you contact us so we can assist more quickly."], links: [{ label: "Sign in to your account", to: "/login" }] },
      { title: "Before you get in touch", paragraphs: ["Please have your order number and the email address used at checkout ready. For return requests, review our Returns & Refunds policy first."] , links: [{ label: "Read Returns & Refunds", to: "/returns" }] },
    ],
  },
  returns: {
    eyebrow: "CLIENT SERVICES",
    title: "Returns & Refunds",
    intro: "We want every Maison Rue piece to feel right. If something is not as expected, use the steps below to request a return.",
    sections: [
      { title: "Return window", paragraphs: ["You may request a return within 14 calendar days of delivery. Contact Client Services with your order number and the item you wish to return before sending anything back."] },
      { title: "Return condition", paragraphs: ["Items must be unworn, unused and in their original condition, with tags and packaging included. Please protect the item during shipping. Items showing wear, damage, alterations or missing tags may not be accepted, except where the item is faulty or consumer law provides otherwise."] },
      { title: "How to request a return", paragraphs: ["1. Sign in and find your order under My Account → Orders. 2. Contact Client Services with your order number and reason for return. 3. Wait for return instructions before shipping the item. Returns sent without prior contact may take longer to identify and process."] , links: [{ label: "View your orders", to: "/account/orders" }, { label: "Contact Client Services", to: "/contact" }] },
      { title: "Refunds", paragraphs: ["Once an approved return is received and inspected, we will notify you of the outcome. Approved refunds are issued to the original payment method. Your bank or payment provider may need additional time to post the refund. Original delivery charges and return shipping costs are not refundable unless the item is faulty, incorrect, or applicable law requires otherwise."] },
      { title: "Faulty or incorrect items", paragraphs: ["If your order arrives damaged, faulty or incorrect, contact us as soon as possible with your order number and clear photos of the issue. We will review the case and explain the available remedy, including replacement, repair or refund where appropriate."] },
      { title: "Exchanges", paragraphs: ["Exchanges depend on available stock. Contact Client Services before returning an item; we will confirm whether an exchange can be arranged. You may also return an eligible item and place a new order."] },
    ],
    note: "This policy does not limit any rights you may have under applicable consumer protection law.",
  },
  guide: {
    eyebrow: "A CONSIDERED WAY TO SHOP",
    title: "Shopping Guide",
    intro: "A few simple steps to help you find the right Maison Rue piece and complete your order with confidence.",
    sections: [
      { title: "Discover the collection", paragraphs: ["Browse Men, Women, Accessories or our seasonal edits. Product pages include available colours, sizes, materials, care details and fit information where available."] , links: [{ label: "Shop Men", to: "/men" }, { label: "Shop Women", to: "/women" }] },
      { title: "Choose your piece", paragraphs: ["Select the available options shown on the product page, then add the item to your bag. Review your selection and quantities in the cart before proceeding to checkout."] },
      { title: "Checkout", paragraphs: ["Enter your delivery details and choose from the payment and delivery options presented at checkout. Review your order total and information before submitting your order. A confirmation will appear after the order is placed."] },
      { title: "Track an order", paragraphs: ["Sign in and open My Account → Orders to review your order history and available order details. For assistance, include your order number when contacting Client Services."] , links: [{ label: "Sign in", to: "/login" }] },
      { title: "Need help?", paragraphs: ["If you need help choosing a size, understanding a material or placing an order, contact our Client Services team."] , links: [{ label: "Contact Us", to: "/contact" }] },
    ],
  },
  terms: {
    eyebrow: "THE DETAILS",
    title: "Terms & Conditions",
    intro: "These terms explain the basic conditions for browsing and shopping on the Maison Rue website.",
    sections: [
      { title: "Using this website", paragraphs: ["By using this website, you agree to use it lawfully and not to interfere with its security, operation or other visitors’ use. We may update website content, product availability and these terms from time to time."] },
      { title: "Product information and orders", paragraphs: ["We make reasonable efforts to show product descriptions, colours and prices accurately. Display settings may affect how colours appear. An order is subject to product availability and confirmation at checkout. If we cannot fulfil an order, we will contact you and arrange any applicable payment reversal."] },
      { title: "Prices and payment", paragraphs: ["The prices, applicable charges and payment methods available for an order are shown during checkout. Please review the order summary before submitting your purchase."] },
      { title: "Returns and consumer rights", paragraphs: ["Returns are handled under our Returns & Refunds policy. Nothing in these terms is intended to exclude rights that cannot be excluded under applicable law."] , links: [{ label: "Returns & Refunds", to: "/returns" }] },
      { title: "Contact", paragraphs: ["For questions about these terms or an order, visit our Contact Us page."] , links: [{ label: "Contact Us", to: "/contact" }] },
    ],
  },
  privacy: {
    eyebrow: "YOUR INFORMATION",
    title: "Privacy Policy",
    intro: "This policy describes how Maison Rue handles information when you browse our website, create an account or place an order.",
    sections: [
      { title: "Information we collect", paragraphs: ["Depending on how you use the website, information may include contact and delivery details, account information, order and payment status, and information you choose to send to Client Services. Payment card details are handled by the payment method presented at checkout; do not send full card details through support channels."] },
      { title: "How we use information", paragraphs: ["We use information to operate the website, process and deliver orders, provide account features, respond to requests, help prevent misuse and meet applicable obligations. We use newsletter details to send updates where you have subscribed."] },
      { title: "Sharing and retention", paragraphs: ["Information may be shared with service providers who help operate the store, such as hosting, payment, delivery and customer support providers, and where required to meet legal obligations. We retain information for as long as needed for these purposes and applicable requirements."] },
      { title: "Your choices", paragraphs: ["You may update account information through your account where available and may opt out of marketing emails using the instructions in those messages. You can contact us with questions or requests about your personal information."] , links: [{ label: "Contact Us", to: "/contact" }] },
      { title: "Cookies", paragraphs: ["The website may use cookies or similar technologies to support essential functions and understand site use. See our Cookie Policy for more information."] , links: [{ label: "Cookie Policy", to: "/cookies" }] },
    ],
  },
  cookies: {
    eyebrow: "SITE PREFERENCES",
    title: "Cookie Policy",
    intro: "Cookies are small files stored by your browser. Maison Rue may use cookies and similar technologies to make the website work and understand how it is used.",
    sections: [
      { title: "Essential cookies", paragraphs: ["Some cookies support core functions such as navigation, account sessions, cart and checkout. The website may not work as intended if these are blocked."] },
      { title: "Analytics and preferences", paragraphs: ["Where enabled, cookies may help us understand aggregate website usage or remember preferences. Your browser settings let you review, block or delete cookies. Blocking optional cookies may affect some site features."] },
      { title: "Managing cookies", paragraphs: ["You can manage cookies in your browser settings. If the website provides a cookie preference control, you can also use it to update your choices."] },
      { title: "More information", paragraphs: ["For information about personal data handled through the website, see our Privacy Policy."] , links: [{ label: "Privacy Policy", to: "/privacy" }] },
    ],
  },
};

export default function StoreInfoPage({ page }) {
  const content = pages[page];
  if (!content) return null;

  return (
    <main className="store-info-page">
      <header className="store-info-header">
        <span className="home-eyebrow">{content.eyebrow}</span>
        <h1>{content.title}</h1>
        <p>{content.intro}</p>
      </header>
      <div className="store-info-sections">
        {content.sections.map((section) => (
          <section key={section.title}>
            <h2>{section.title}</h2>
            {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            {section.links?.length > 0 && <div className="store-info-links">{section.links.map((link) => <Link key={link.label} to={link.to}>{link.label} <span>→</span></Link>)}</div>}
          </section>
        ))}
        {content.note && <p className="store-info-note">{content.note}</p>}
      </div>
    </main>
  );
}
