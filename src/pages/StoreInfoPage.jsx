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
      { title: "Return window", paragraphs: ["Submit a request within 14 calendar days of the confirmed delivery date. The delivery date is day one. If the delivery date cannot be verified, Client Care will review the request manually."] },
      { title: "Eligible reasons", paragraphs: ["Full-price items may be returned for a fit or size issue or a change of mind if they are unworn, unwashed, unaltered and complete with original tags and packaging. Incorrect, missing, transit-damaged or potentially faulty items are eligible for review even if purchased on promotion."] },
      { title: "Promotional items", paragraphs: ["Promotional, discounted, clearance, gift and promotional bundle items are not eligible for fit, preference or change-of-mind returns. This exclusion does not apply to an item that is incorrect, missing, damaged on arrival or potentially faulty."] },
      { title: "How to request a return", paragraphs: ["Sign in and open My Account → Orders, select the item, choose a reason and submit the request. Photos are not required to submit. The system may authorise a return, decline it under the published rules, or send it to Client Care for manual review. Please wait for return instructions before shipping."] , links: [{ label: "View your orders", to: "/account/orders" }, { label: "Contact Client Services", to: "/contact" }] },
      { title: "Receipt and inspection", paragraphs: ["An authorisation allows you to send the item back; it is not a final refund or exchange approval. When Maison Rue receives the item, our team will inspect it in person against the order and the condition requirements. A refund or exchange proceeds only after the inspection is passed. If it does not pass, we will explain why and contact you about returning the item to you."] },
      { title: "Refunds", paragraphs: ["Approved refunds are limited to the amount actually paid for the accepted quantity and are sent to the original payment method. For cash-on-delivery orders, we will arrange a bank transfer to the purchaser. Maison Rue aims to initiate an approved refund within five business days after inspection; banks or payment providers may take additional time to post it. Return shipping is covered for an incorrect, missing, damaged or faulty item; customers cover return shipping for fit or preference returns."] },
      { title: "Manual review", paragraphs: ["Client Care reviews unclear or conflicting claims, requests without a verifiable delivery date, requests involving three or more units, and requests with a refund value of VND 10,000,000 or more. A high value or quantity does not by itself determine the final outcome."] },
      { title: "Exchanges", paragraphs: ["Eligible exchanges depend on available stock. Select exchange when submitting the request and tell us the preferred size or colour. Maison Rue confirms the exchange after receiving and inspecting the returned item. Any price difference will be confirmed before the exchange is completed."] },
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
