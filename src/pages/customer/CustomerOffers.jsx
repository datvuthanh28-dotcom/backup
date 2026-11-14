import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import CustomerAccountSidebar from "../../components/CustomerAccountSidebar";
import useDocumentTitle from "../../hooks/useDocumentTitle";
import { promotionAPI } from "../../services/api";

const money = (value) => `${Number(value || 0).toLocaleString("vi-VN")}đ`;
const benefit = (offer) => {
  if (offer.discount_type === "percentage") return `Giảm ${Number(offer.discount_value)}%`;
  if (offer.discount_type === "fixed_amount") return `Giảm ${money(offer.discount_value)}`;
  if (offer.discount_type === "free_shipping") return "Miễn phí giao hàng";
  return `Giảm ${money(offer.discount_value)} phí giao hàng`;
};

export default function CustomerOffers() {
  useDocumentTitle("Ưu đãi của tôi — Maison Rue");
  const [offers, setOffers] = useState([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    promotionAPI.getMyOffers()
      .then((result) => setOffers(result.offers || []))
      .catch((error) => setMessage(error.message))
      .finally(() => setLoading(false));
  }, []);

  const copy = async (code) => {
    await navigator.clipboard.writeText(code);
    setMessage(`Đã sao chép mã ${code}.`);
  };

  return (
    <main className="account-page account-simple">
      <div className="account-shell">
        <CustomerAccountSidebar />
        <section className="account-panel customer-offers">
          <header className="customer-offers__header">
            <div>
              <p className="eyebrow">DÀNH RIÊNG CHO BẠN</p>
              <h2>Ưu đãi của tôi</h2>
              <p>Các mã còn hiệu lực được lưu tại đây để bạn sử dụng khi thanh toán.</p>
            </div>
            {!loading && offers.length > 0 && <span>{offers.length} ưu đãi khả dụng</span>}
          </header>

          {message && <div className="account-notice" role="status">{message}</div>}
          {loading ? <div className="offer-loading">Đang tải ưu đãi…</div> : offers.length ? (
            <div className="offer-list">
              {offers.map((offer) => {
                const used = Boolean(offer.used_by_customer) || offer.assignment_status === "used";
                const isTargeted = offer.distribution_type === "targeted";
                return (
                  <article className={`offer-card${used ? " is-used" : ""}`} key={offer.code_id}>
                    <div className="offer-card__content">
                      <div className="offer-card__labels">
                        <span className={`offer-card__type ${isTargeted ? "is-targeted" : "is-public"}`}>
                          {isTargeted ? "Ưu đãi dành riêng" : "Ưu đãi dùng chung"}
                        </span>
                        {used && <span className="offer-card__used">Đã sử dụng</span>}
                      </div>
                      <h3>{offer.name}</h3>
                      <strong className="offer-card__benefit">{benefit(offer)}</strong>
                      <p>{offer.display_description || offer.description || "Áp dụng theo điều kiện của chương trình."}</p>
                      <div className="offer-card__terms">
                        <span>Đơn tối thiểu <strong>{money(offer.minimum_order_value)}</strong></span>
                        {offer.maximum_discount && <span>Giảm tối đa <strong>{money(offer.maximum_discount)}</strong></span>}
                        {offer.end_at && <span>Hạn dùng <strong>{new Date(offer.end_at).toLocaleDateString("vi-VN")}</strong></span>}
                      </div>
                    </div>
                    <div className="offer-card__code">
                      <small>MÃ ƯU ĐÃI</small>
                      <code>{offer.code}</code>
                      {!used && (
                        <>
                          <button type="button" onClick={() => copy(offer.code)}>Sao chép mã</button>
                          <Link to={`/checkout?promo=${encodeURIComponent(offer.code)}`}>Dùng khi thanh toán</Link>
                        </>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="account-card offer-empty">
              <strong>Chưa có ưu đãi khả dụng</strong>
              <span>Các mã dành riêng và mã dùng chung sẽ xuất hiện tại đây.</span>
              <Link to="/">Tiếp tục mua sắm</Link>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
