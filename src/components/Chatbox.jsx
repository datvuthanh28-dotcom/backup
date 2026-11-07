import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import "./Chatbox.css";
import foxLogo from "../assets/fox-logo.png";
import { getCatalogForPrompt, getProductById } from "../data/products";
import { useAuth } from "../context/AuthContext";
import { compressImage } from "../utils/imageCompressor";
import { createReturnRequest } from "../services/returnService";

// NOTE: API key cho trợ lý Rue
const CHAT_API_KEY = (import.meta.env.VITE_CHAT_API_KEY || "").trim();

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

Nếu khách hỏi về đổi trả / hoàn tiền, hãy hướng dẫn khách đăng nhập, mở My Account → Orders và gửi yêu cầu tại đúng sản phẩm. Không hứa rằng yêu cầu đã được duyệt; Maison Rue phải nhận và kiểm tra sản phẩm trực tiếp trước khi hoàn tiền hoặc đổi hàng.`;
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

export default function Chatbox() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [gender, setGender] = useState(null);
  const [greeted, setGreeted] = useState(false);
  const [zoomedImage, setZoomedImage] = useState(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);

  // Flow state cho quy trình đổi trả / hoàn tiền
  const flow = useRef({
    step: null, // "REASON" | "DETAIL" | "ITEM" | "IMAGE" | "EMAIL"
    reason: null,
    detailNote: null,
    item: null,
    proofImageBase64: null,
    email: null,
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typing, uploadingImage]);

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

  function pushUser(text, extra = {}) {
    setMessages((prev) => [...prev, { sender: "user", text, ...extra }]);
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

  /**
   * Bắt đầu quy trình Đổi trả / Hoàn tiền
   */
  function startReturnFlow() {
    flow.current = {
      step: "REASON",
      reason: null,
      detailNote: null,
      item: null,
      proofImageBase64: null,
      email: null,
    };
    pushBot(
      "🤖 Rue rất tiếc khi sản phẩm chưa làm anh/chị hoàn toàn hài lòng. Để Rue hỗ trợ lập hồ sơ đổi/trả cho Admin Maison Rue xét duyệt, anh/chị vui lòng chọn lý do hoàn trả:",
      {
        quickReplies: [
          { label: "1. Sản phẩm bị lỗi / hư hỏng", value: "1" },
          { label: "2. Không vừa size", value: "2" },
          { label: "3. Đổi ý, không có nhu cầu", value: "3" },
        ],
      }
    );
  }

  /**
   * Chuyển sang bước hỏi Email
   */
  function proceedToEmailStep() {
    const f = flow.current;
    f.step = "EMAIL";
    if (currentUser?.email) {
      pushBot(
        `Rue thấy anh/chị đang đăng nhập tài khoản: "${currentUser.email}". Anh/chị có muốn dùng email này để nhận thông báo duyệt hoàn tiền từ Admin không ạ?`,
        {
          quickReplies: [
            { label: `Dùng ${currentUser.email}`, value: currentUser.email },
            { label: "Nhập email khác", value: "__OTHER_EMAIL__" },
          ],
        }
      );
    } else {
      pushBot(
        "Bước cuối cùng, anh/chị vui lòng cho Rue xin Địa chỉ Email để Admin gửi kết quả xét duyệt hoàn tiền nhé:"
      );
    }
  }

  /**
   * Xử lý file ảnh tải lên và nén tự động qua HTML5 canvas
   */
  async function handleImageFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploadingImage(true);
      const compressedBase64 = await compressImage(file, 600, 0.6);
      flow.current.proofImageBase64 = compressedBase64;

      pushUser("Đã đính kèm ảnh minh chứng", {
        image: compressedBase64,
      });

      pushBot("✅ Rue đã nhận được ảnh minh chứng của anh/chị.");
      proceedToEmailStep();
    } catch (err) {
      pushBot("⚠️ Không thể xử lý ảnh: " + (err.message || "Định dạng không hỗ trợ"));
    } finally {
      setUploadingImage(false);
      if (e.target) e.target.value = "";
    }
  }

  /**
   * Hoàn tất tạo yêu cầu và lưu vào LocalStorage
   */
  function completeReturnFlow(email) {
    const f = flow.current;
    try {
      const newReq = createReturnRequest({
        customerEmail: email,
        customerName: currentUser?.name || "Quý khách",
        item: f.item,
        reason: f.reason,
        detailNote: f.detailNote,
        proofImageBase64: f.proofImageBase64,
      });

      pushBot(
        `✨ Rue đã ghi nhận yêu cầu hoàn trả kèm thông tin chi tiết:\n` +
          `• Mã yêu cầu: #${newReq.id}\n` +
          `• Sản phẩm: ${newReq.item}\n` +
          `• Lý do: ${newReq.reason}\n` +
          `• Mô tả: ${newReq.detailNote}\n` +
          (newReq.proofImageBase64 ? `• Ảnh minh chứng: Đã đính kèm (1 ảnh)\n` : `• Ảnh minh chứng: Không đính kèm\n`) +
          `• Email nhận kết quả: ${newReq.customerEmail}\n\n` +
          `⏳ Yêu cầu đang chờ Admin Maison Rue xét duyệt. Kết quả sẽ được gửi qua email của anh/chị ngay khi Admin chấp thuận ạ!`
      );
    } catch (err) {
      pushBot("⚠️ Có lỗi khi lưu yêu cầu đổi trả: " + err.message);
    } finally {
      // Reset flow
      flow.current = {
        step: null,
        reason: null,
        detailNote: null,
        item: null,
        proofImageBase64: null,
        email: null,
      };
    }
  }

  /**
   * Dẫn dắt luồng Đổi trả qua từng bước
   */
  async function handleReturnFlow(userInput, extraValue = null) {
    const val = (extraValue !== null ? extraValue : userInput).trim();
    const f = flow.current;

    // BƯỚC 1: CHỌN LÝ DO
    if (f.step === "REASON") {
      let chosenReason = null;
      if (val === "1" || val.toLowerCase().includes("lỗi") || val.toLowerCase().includes("hư hỏng")) {
        chosenReason = RETURN_REASONS[1];
      } else if (val === "2" || val.toLowerCase().includes("size")) {
        chosenReason = RETURN_REASONS[2];
      } else if (val === "3" || val.toLowerCase().includes("đổi ý") || val.toLowerCase().includes("nhu cầu")) {
        chosenReason = RETURN_REASONS[3];
      }

      if (!chosenReason) {
        pushBot(
          "🤖 Anh/chị vui lòng chọn một trong các nút bên dưới hoặc nhập số 1, 2, 3 để chọn lý do đổi trả ạ:",
          {
            quickReplies: [
              { label: "1. Sản phẩm bị lỗi / hư hỏng", value: "1" },
              { label: "2. Không vừa size", value: "2" },
              { label: "3. Đổi ý, không có nhu cầu", value: "3" },
            ],
          }
        );
        return;
      }

      f.reason = chosenReason;
      f.step = "DETAIL";
      pushBot(
        `Đã ghi nhận lý do: "${chosenReason}".\n\nAnh/chị vui lòng mô tả ngắn gọn tình trạng sản phẩm (ví dụ: rách đường chỉ, giao sai size M, trầy xước đế giày...) giúp Rue nhé.`
      );
      return;
    }

    // BƯỚC 2: MÔ TẢ CHI TIẾT
    if (f.step === "DETAIL") {
      if (!val || val.length < 3) {
        pushBot("Anh/chị vui lòng mô tả chi tiết thêm một chút về tình trạng sản phẩm để Admin dễ dàng xét duyệt ạ.");
        return;
      }
      f.detailNote = val;
      f.step = "ITEM";
      pushBot(
        "Cảm ơn anh/chị. Vui lòng cho Rue biết Tên sản phẩm hoặc Mã đơn hàng (ví dụ: Áo len Cashmere Cardigan hoặc #MR-2026-...) cần đổi trả ạ?"
      );
      return;
    }

    // BƯỚC 3: TÊN SẢN PHẨM / MÃ ĐƠN HÀNG
    if (f.step === "ITEM") {
      if (!val || val.length < 2) {
        pushBot("Anh/chị vui lòng nhập tên sản phẩm hoặc mã đơn hàng cần hỗ trợ ạ.");
        return;
      }
      f.item = val;
      f.step = "IMAGE";
      pushBot(
        "Để Admin kiểm duyệt nhanh chóng và chính xác, anh/chị vui lòng tải lên hình ảnh minh chứng sản phẩm (chụp vết lỗi, tem mác hoặc bao bì).\n\nNếu không có ảnh hoặc đổi ý/không vừa size, anh/chị có thể bấm 'Bỏ qua ảnh' ạ.",
        {
          quickReplies: [
            { label: "📷 Chọn ảnh minh chứng", value: "__TRIGGER_UPLOAD__" },
            { label: "⏭️ Bỏ qua ảnh", value: "__SKIP_IMAGE__" },
          ],
        }
      );
      return;
    }

    // BƯỚC 4: HÌNH ẢNH MINH CHỨNG
    if (f.step === "IMAGE") {
      if (val === "__TRIGGER_UPLOAD__") {
        fileInputRef.current?.click();
        return;
      }
      if (val === "__SKIP_IMAGE__" || val.toLowerCase().includes("bỏ qua") || val.toLowerCase().includes("skip")) {
        f.proofImageBase64 = null;
        pushUser("Bỏ qua tải ảnh");
        proceedToEmailStep();
        return;
      }
      pushBot(
        "Anh/chị có thể bấm 'Chọn ảnh minh chứng' hoặc bấm 'Bỏ qua ảnh' để tiếp tục nhé:",
        {
          quickReplies: [
            { label: "📷 Chọn ảnh minh chứng", value: "__TRIGGER_UPLOAD__" },
            { label: "⏭️ Bỏ qua ảnh", value: "__SKIP_IMAGE__" },
          ],
        }
      );
      return;
    }

    // BƯỚC 5: EMAIL
    if (f.step === "EMAIL") {
      if (val === "__OTHER_EMAIL__") {
        pushBot("Anh/chị vui lòng nhập địa chỉ Email mong muốn nhận kết quả:");
        return;
      }

      if (!validateEmail(val)) {
        pushBot("🤖 Địa chỉ email chưa đúng định dạng. Anh/chị kiểm tra và nhập lại giúp Rue nhé (ví dụ: ten@gmail.com).");
        return;
      }

      f.email = val;
      completeReturnFlow(val);
      return;
    }
  }

  function handleQuickReplyClick(qr) {
    if (qr.value === "__OPEN_ORDERS__") { setOpen(false); navigate("/account/orders"); return; }
    if (flow.current.step) {
      if (qr.value === "__TRIGGER_UPLOAD__") {
        fileInputRef.current?.click();
        return;
      }
      pushUser(qr.label);
      handleReturnFlow(qr.label, qr.value);
    } else {
      handleGenderPick(qr.value);
    }
  }

  async function handleSend(e) {
    e.preventDefault();
    const message = input.trim();
    if (!message) return;
    pushUser(message);
    setInput("");

    const f = flow.current;
    if (f.step) {
      await handleReturnFlow(message);
      return;
    }

    const returnKeywords = /(đổi trả|hoàn tiền|trả hàng|return|refund|lỗi sản phẩm|đổi hàng)/i;
    if (returnKeywords.test(message)) {
      pushBot(currentUser ? "Rue có thể giúp anh/chị gửi yêu cầu từ lịch sử đơn hàng để hệ thống kiểm tra đúng sản phẩm, thời hạn và điều kiện áp dụng. Sau khi gửi, Maison Rue sẽ nhận và kiểm tra trực tiếp sản phẩm trước khi hoàn tiền hoặc đổi hàng." : "Vui lòng đăng nhập và mở lịch sử đơn hàng để gửi yêu cầu đổi trả hoặc hoàn tiền. Hệ thống cần đối chiếu đơn hàng trước khi xét điều kiện.", {
        quickReplies: currentUser?.role === "customer" ? [{ label: "Open My Orders", value: "__OPEN_ORDERS__" }] : [{ label: "Sign in", value: "__OPEN_ORDERS__" }],
      });
      return;
    }

    await handleAskGPT(message);
  }

  return (
    <>
      {/* Hidden file input for proof image upload */}
      <input
        type="file"
        ref={fileInputRef}
        accept="image/*"
        style={{ display: "none" }}
        onChange={handleImageFileChange}
      />

      {/* Floating button */}
      <button id="chat-toggle" onClick={handleToggle} aria-label="Chat với Rue">
        <img src={foxLogo} alt="Maison Rue chatbot" />
      </button>

      {/* Chatbox Window */}
      {open && (
        <div id="chat-box" style={{ display: "flex" }}>
          <div id="chat-header">
            <img src={foxLogo} alt="" />
            <span>
              Rue — Trợ lý Maison Rue
              <span className="chat-subtitle">Tư vấn phong cách · Đổi trả thông minh</span>
            </span>
          </div>

          <div id="chat-messages">
            {messages.map((m, i) => (
              <div key={i}>
                <div className={`message ${m.sender}`}>
                  <div>{m.text}</div>
                  {m.image && (
                    <div style={{ marginTop: "8px" }}>
                      <img
                        src={m.image}
                        alt="Ảnh minh chứng"
                        style={{
                          maxWidth: "180px",
                          maxHeight: "140px",
                          borderRadius: "8px",
                          border: "1px solid rgba(255, 255, 255, 0.4)",
                          display: "block",
                          cursor: "pointer",
                        }}
                        onClick={() => setZoomedImage(m.image)}
                        title="Bấm để xem ảnh phóng to"
                      />
                      <span style={{ fontSize: "11px", opacity: 0.8, marginTop: "3px", display: "block" }}>
                        🔍 Bấm ảnh để phóng to
                      </span>
                    </div>
                  )}
                </div>

                {m.quickReplies && (
                  <div className="quick-replies">
                    {m.quickReplies.map((qr) => (
                      <button
                        key={qr.value}
                        type="button"
                        className="quick-reply-btn"
                        onClick={() => handleQuickReplyClick(qr)}
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

            {uploadingImage && (
              <div className="message bot" style={{ fontStyle: "italic", fontSize: "13px" }}>
                ⏳ Đang nén và xử lý hình ảnh minh chứng...
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {typing && <div id="chat-typing">Rue đang soạn câu trả lời...</div>}

          <form id="chat-form" onSubmit={handleSend}>
            {flow.current.step === "IMAGE" && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                title="Đính kèm ảnh minh chứng"
                style={{
                  background: "transparent",
                  border: "none",
                  padding: "0 10px",
                  color: "#6b3f21",
                  cursor: "pointer",
                  fontSize: "18px",
                  display: "flex",
                  alignItems: "center",
                }}
              >
                📷
              </button>
            )}

            <input
              id="chat-input"
              type="text"
              placeholder={
                flow.current.step === "DETAIL"
                  ? "Mô tả tình trạng lỗi của sản phẩm..."
                  : flow.current.step === "ITEM"
                  ? "Tên sản phẩm hoặc mã đơn hàng..."
                  : flow.current.step === "EMAIL"
                  ? "Nhập email của anh/chị..."
                  : "Nhập tin nhắn..."
              }
              autoComplete="off"
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
            <button id="chat-send" type="submit">
              Gửi
            </button>
          </form>
        </div>
      )}

      {/* Lightbox Zoom Modal for Chatbox */}
      {zoomedImage && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            backgroundColor: "rgba(0, 0, 0, 0.8)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: "20px",
          }}
          onClick={() => setZoomedImage(null)}
        >
          <div
            style={{
              position: "relative",
              maxWidth: "90%",
              maxHeight: "90%",
              backgroundColor: "#FFF",
              padding: "10px",
              borderRadius: "8px",
              boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={zoomedImage}
              alt="Ảnh phóng to"
              style={{
                maxWidth: "100%",
                maxHeight: "80vh",
                display: "block",
                borderRadius: "4px",
              }}
            />
            <div style={{ textAlign: "right", marginTop: "10px" }}>
              <button
                type="button"
                onClick={() => setZoomedImage(null)}
                style={{
                  padding: "6px 14px",
                  backgroundColor: "#6b3f21",
                  color: "#FFF",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer",
                }}
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
