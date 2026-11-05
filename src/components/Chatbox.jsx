import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import emailjs from "@emailjs/browser";
import "./Chatbox.css";
import foxLogo from "../assets/fox-logo.png";
import { getCatalogForPrompt, getProductById } from "../data/products";

// NOTE: API key cho trợ lý Rue
const CHAT_API_KEY = (import.meta.env.VITE_CHAT_API_KEY || "").trim();

// Cấu hình EmailJS từ .env cho quy trình hỗ trợ đổi trả
const EMAILJS_SERVICE_ID = import.meta.env.VITE_EMAILJS_SERVICE_ID || "service_az46k1f";
const EMAILJS_TEMPLATE_ID = import.meta.env.VITE_EMAILJS_ORDER_TEMPLATE_ID || "template_20zssht";
const EMAILJS_PUBLIC_KEY = import.meta.env.VITE_EMAILJS_PUBLIC_KEY || "ZjQM0mkSjz2NACdA9";

const RETURN_REASONS = {
  1: "Sản phẩm bị lỗi / hư hỏng",
  2: "Không vừa size",
  3: "Đổi ý, không có nhu cầu nữa",
};

function validateEmail(email) {
  return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email);
}

function getSystemPrompt(gender) {
  return `Bạn tên là "Rue" — trợ lý tư vấn thời trang của Maison Rue, thương hiệu thời trang cao cấp phong cách "old money" (cashmere, linen, suede), thành lập từ năm 1923.

Phong cách trả lời: ngắn gọn (3-5 câu), lịch sự, tinh tế, đúng chất tư vấn viên cửa hàng cao cấp. Xưng "Rue", gọi khách là "anh/chị". Luôn trả lời bằng tiếng Việt.

Khách hàng đang mua sắm cho: ${gender || "chưa rõ, hãy hỏi lại nếu cần"}.

Danh mục sản phẩm hiện có (CHỈ được gợi ý sản phẩm trong danh sách này, KHÔNG được bịa thêm sản phẩm hoặc đổi giá):
${getCatalogForPrompt()}

Khi gợi ý một sản phẩm cụ thể, PHẢI thêm một dòng riêng ngay dưới câu trả lời theo đúng cú pháp: [[SUGGEST:<id>]] (có thể nhiều dòng nếu gợi ý nhiều sản phẩm, dùng đúng id trong danh mục). Không tự chèn link markdown, hệ thống sẽ tự hiển thị thẻ sản phẩm.

Nếu khách hỏi về đổi trả / hoàn tiền, hãy trả lời ngắn gọn rằng Rue có thể hỗ trợ đổi trả ngay trong khung chat này và hỏi khách muốn tiến hành không.`;
}

async function callOpenAI(systemPrompt, userMessage) {
  if (!CHAT_API_KEY) {
    return "Rue là trợ lý tư vấn phong cách của Maison Rue. Bạn có thể tham khảo danh mục sản phẩm thời trang cao cấp của chúng tôi hoặc liên hệ support@maisonrue.com để được hỗ trợ trực tiếp.";
  }
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${CHAT_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: 0.7,
      max_tokens: 500,
    }),
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(errorBody.error?.message || `OpenAI API lỗi: ${res.statusText}`);
  }
  const data = await res.json();
  if (data.choices && data.choices.length > 0) {
    return data.choices[0].message.content.trim();
  }
  throw new Error("Không có phản hồi từ trợ lý.");
}

// Tách các thẻ [[SUGGEST:<id>]] khỏi văn bản trả lời và trả về danh sách id sản phẩm
function extractSuggestedProducts(text) {
  const ids = [];
  const cleaned = text.replace(/\[\[SUGGEST:(\d+)\]\]/g, (_, id) => {
    ids.push(Number(id));
    return "";
  }).trim();
  return { text: cleaned, productIds: ids };
}

function buildReturnEmailTemplate({ isApproved, item, reason, currentStep }) {
  return `
  <table style="font-family: Arial, sans-serif; color: #333; line-height: 1.5; width: 100%; max-width: 600px;" cellpadding="0" cellspacing="0" border="0">
    <tr><td>
      <p>Kính gửi Quý khách,</p>
      <p>Maison Rue xin cập nhật trạng thái yêu cầu đổi/trả hàng của quý khách:</p>
      <p><strong>🛍️ Sản phẩm:</strong> ${item}</p>
      <p><strong>📋 Lý do:</strong> ${reason}</p>
      <p><strong>📍 Trạng thái hiện tại:</strong> <span style="color:#6b3f21;">${currentStep}</span></p>
      ${isApproved
        ? `<p>Yêu cầu hoàn tiền/đổi hàng của quý khách đã được duyệt. Chúng tôi xin cảm ơn sự tin tưởng của quý khách dành cho Maison Rue.</p>`
        : `<p>Yêu cầu của quý khách đang được đội ngũ Maison Rue xem xét. Vui lòng kiểm tra lại email trong 24-48 giờ tới.</p>`
      }
      <hr style="border:none; border-top:1px solid #ddd;" />
      <h4><strong>✨ Chính sách đổi trả Maison Rue:</strong></h4>
      <div>
        <p>✅ Được hoàn tiền hoặc đổi hàng miễn phí nếu:</p>
        <ul>
          <li>Sản phẩm còn nguyên tem mác, chưa qua sử dụng, trong vòng 30 ngày kể từ ngày nhận hàng.</li>
          <li>Sản phẩm bị lỗi từ nhà sản xuất hoặc hư hỏng trong quá trình vận chuyển.</li>
        </ul>
      </div>
      <div>
        <p>✅ Đổi size/màu khác:</p>
        <ul>
          <li>Miễn phí đổi 1 lần trong 30 ngày nếu sản phẩm còn nguyên vẹn và còn hàng size/màu mong muốn.</li>
        </ul>
      </div>
      <div>
        <p>❌ Không áp dụng đổi trả nếu:</p>
        <ul>
          <li>Sản phẩm đã qua sử dụng, giặt ủi hoặc quá 30 ngày kể từ ngày nhận hàng.</li>
        </ul>
      </div>
      <p>Tiền hoàn (nếu có) sẽ được chuyển về phương thức thanh toán gốc trong 5-7 ngày làm việc.</p>
      <p>Mọi thắc mắc xin liên hệ: <a href="mailto:support@maisonrue.com">support@maisonrue.com</a> hoặc hotline 1900 1234 (8h00 - 17h00, Thứ 2 - Thứ 6).</p>
      <p>Trân trọng,<br/>Maison Rue</p>
    </td></tr>
  </table>`.trim();
}

export default function Chatbox() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [gender, setGender] = useState(null);
  const [greeted, setGreeted] = useState(false);

  // Flow state cho đổi trả / hoàn tiền
  const flow = useRef({
    awaitingReason: false,
    awaitingItem: false,
    awaitingEmail: false,
    reason: null,
    item: null,
    email: null,
    queryCount: 0,
  });

  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typing]);

  function handleToggle() {
    setOpen((o) => {
      const next = !o;
      if (next && !greeted) {
        setGreeted(true);
        pushBot(
          "Xin chào, Rue là trợ lý tư vấn thời trang của Maison Rue. Anh/chị đang tìm sản phẩm cho Nam, Nữ hay Trẻ em ạ?",
          {
            quickReplies: [
              { label: "Nam", value: "Nam" },
              { label: "Nữ", value: "Nữ" },
              { label: "Trẻ em", value: "Trẻ em" },
              { label: "Chưa chắc", value: "Tất cả" },
            ],
          }
        );
      }
      return next;
    });
  }

  function pushUser(text) {
    setMessages((prev) => [...prev, { sender: "user", text }]);
  }

  function pushBot(text, extra = {}) {
    setMessages((prev) => [...prev, { sender: "bot", text, ...extra }]);
  }

  function handleGenderPick(value) {
    setGender(value);
    pushUser(value);
    pushBot(
      `Cảm ơn anh/chị! Rue sẽ ưu tiên gợi ý các mẫu dành cho ${value === "Tất cả" ? "mọi nhóm khách hàng" : value}. Anh/chị đang tìm sản phẩm nào ạ? (áo, quần, giày, phụ kiện...)`
    );
  }

  async function handleAskGPT(message) {
    setTyping(true);
    try {
      const systemPrompt = getSystemPrompt(gender);
      const raw = await callOpenAI(systemPrompt, message);
      const { text, productIds } = extractSuggestedProducts(raw);
      const products = productIds
        .map((id) => getProductById(id))
        .filter(Boolean);
      pushBot(text || "Rue có thể tư vấn thêm nếu anh/chị cho biết rõ nhu cầu hơn ạ.", {
        products,
      });
    } catch (err) {
      pushBot("⚠️ Rue gặp chút trục trặc kỹ thuật: " + err.message);
    } finally {
      setTyping(false);
    }
  }

  async function sendReturnEmail() {
    const f = flow.current;
    // eslint-disable-next-line react-hooks/purity -- only ever invoked from a form submit handler, never during render
    const isApproved = Math.random() < 0.5;
    const currentStep = isApproved
      ? "Đã duyệt hoàn tiền / đổi hàng"
      : // eslint-disable-next-line react-hooks/purity -- only ever invoked from a form submit handler, never during render
      Math.random() < 0.5
      ? "Đang xác minh thông tin đơn hàng"
      : "Đang chờ nhận lại sản phẩm";

    const emailHtml = buildReturnEmailTemplate({
      isApproved,
      item: f.item,
      reason: f.reason,
      currentStep,
    });

    try {
      await emailjs.send(
        EMAILJS_SERVICE_ID,
        EMAILJS_TEMPLATE_ID,
        {
          to_email: f.email,
          email: f.email,
          subject: isApproved
            ? `Maison Rue - Yêu cầu đổi trả "${f.item}" đã được duyệt`
            : `Maison Rue - Cập nhật yêu cầu đổi trả "${f.item}"`,
          message: emailHtml,
        },
        { publicKey: EMAILJS_PUBLIC_KEY }
      );
      pushBot(
        `🤖 Rue đã gửi email xác nhận về sản phẩm "${f.item}" tới ${f.email}. ` +
          (isApproved
            ? "Yêu cầu hoàn tiền/đổi hàng của anh/chị đã được duyệt ạ."
            : "Yêu cầu của anh/chị đang được xử lý, Rue sẽ cập nhật sớm nhất qua email ạ.")
      );
    } catch (err) {
      pushBot("⚠️ Có lỗi khi gửi email: " + err.message);
    }
  }

  async function handleReturnFlow(message) {
    const f = flow.current;
    f.queryCount++;

    if (f.awaitingReason) {
      if (["1", "2", "3"].includes(message.trim())) {
        f.reason = RETURN_REASONS[message.trim()];
        f.awaitingReason = false;
        pushBot(`Đã ghi nhận lý do: ${f.reason}. Anh/chị vui lòng cho Rue biết tên sản phẩm hoặc mã đơn hàng cần đổi/trả ạ?`);
        f.awaitingItem = true;
      } else {
        pushBot("🤖 Anh/chị vui lòng nhập số 1, 2 hoặc 3 để chọn lý do đổi trả ạ.");
      }
      return;
    }

    if (f.awaitingItem) {
      f.item = message.trim();
      f.awaitingItem = false;
      if (!f.email) {
        pushBot("Rue cần email để gửi thông tin đổi trả, anh/chị cho Rue xin email nhé.");
        f.awaitingEmail = true;
      } else {
        await sendReturnEmail();
      }
      return;
    }

    if (f.awaitingEmail) {
      if (validateEmail(message.trim())) {
        f.email = message.trim();
        f.awaitingEmail = false;
        pushBot(`Cảm ơn anh/chị đã cung cấp email: ${f.email}`);
        await sendReturnEmail();
      } else {
        pushBot("🤖 Email chưa hợp lệ, anh/chị nhập lại giúp Rue nhé.");
      }
      return;
    }

    // Bắt đầu flow mới
    pushBot(
      "🤖 Rue rất tiếc khi nghe điều này. Anh/chị vui lòng chọn lý do đổi/trả:\n1. Sản phẩm bị lỗi / hư hỏng\n2. Không vừa size\n3. Đổi ý, không có nhu cầu nữa\n(Nhập số 1, 2 hoặc 3)"
    );
    f.awaitingReason = true;
  }

  async function handleSend(e) {
    e.preventDefault();
    const message = input.trim();
    if (!message) return;
    pushUser(message);
    setInput("");

    const f = flow.current;
    const inReturnFlow = f.awaitingReason || f.awaitingItem || f.awaitingEmail;
    const returnKeywords = /(đổi trả|hoàn tiền|trả hàng|return|refund|lỗi sản phẩm)/i;

    if (inReturnFlow) {
      await handleReturnFlow(message);
      return;
    }

    if (returnKeywords.test(message)) {
      await handleReturnFlow(message);
      return;
    }

    await handleAskGPT(message);
  }

  return (
    <>
      <button id="chat-toggle" onClick={handleToggle} aria-label="Chat với Rue">
        <img src={foxLogo} alt="Maison Rue chatbot" />
      </button>

      {open && (
        <div id="chat-box" style={{ display: "flex" }}>
          <div id="chat-header">
            <img src={foxLogo} alt="" />
            <span>
              Rue — Trợ lý Maison Rue
              <span className="chat-subtitle">Tư vấn thời trang · Đổi trả</span>
            </span>
          </div>

          <div id="chat-messages">
            {messages.map((m, i) => (
              <div key={i}>
                <div className={`message ${m.sender}`}>{m.text}</div>

                {m.quickReplies && (
                  <div className="quick-replies">
                    {m.quickReplies.map((qr) => (
                      <button
                        key={qr.value}
                        className="quick-reply-btn"
                        onClick={() => handleGenderPick(qr.value)}
                      >
                        {qr.label}
                      </button>
                    ))}
                  </div>
                )}

                {m.products && m.products.length > 0 && (
                  <div className="product-links">
                    {m.products.map((p) => (
                      <Link
                        key={p.id}
                        to={`/product/${p.id}`}
                        className="product-link-card"
                        onClick={() => setOpen(false)}
                      >
                        <img src={`/${p.images[0]}`} alt={p.name} />
                        <div className="plc-info">
                          <span>{p.name}</span>
                          <span className="plc-price">{p.price.toLocaleString("vi-VN")}đ</span>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {typing && <div id="chat-typing">Rue đang trả lời...</div>}

          <form id="chat-form" onSubmit={handleSend}>
            <input
              id="chat-input"
              type="text"
              placeholder="Nhập tin nhắn..."
              autoComplete="off"
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
            <button id="chat-send" type="submit">Gửi</button>
          </form>
        </div>
      )}
    </>
  );
}
