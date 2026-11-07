import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import "./Chatbox.css";
import foxLogo from "../assets/fox-logo.png";
import { useAuth } from "../context/AuthContext";
import { chatAPI } from "../services/api";

export default function Chatbox() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [greeted, setGreeted] = useState(false);

  const messagesEndRef = useRef(null);
  const abortControllerRef = useRef(null);

  // Clear session and state immediately when user logs out or switches accounts (Section II.3)
  useEffect(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setMessages([]);
    setInput("");
    setTyping(false);
    setGreeted(false);
  }, [currentUser?.id, currentUser?.role]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typing]);

  const isCustomer = currentUser?.role === "customer" && currentUser?.is_active !== false;

  function handleToggle() {
    setOpen((prev) => {
      const next = !prev;
      if (next && !greeted && isCustomer) {
        setGreeted(true);
        setMessages([
          {
            sender: "bot",
            text: `Kính chào ${currentUser.name || "quý khách"}! Rue là trợ lý thời trang của Maison Rue. Hôm nay Rue có thể tư vấn phối đồ hoặc hỗ trợ giải đáp thông tin đơn hàng gì cho quý khách ạ?`,
          },
        ]);
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

  async function handleSend(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text || typing || !isCustomer) return;

    pushUser(text);
    setInput("");
    setTyping(true);

    try {
      // Build safe conversation history for context
      const history = messages
        .slice(-4)
        .map((m) => ({
          role: m.sender === "user" ? "user" : "assistant",
          content: m.text,
        }));

      const res = await chatAPI.sendMessage(text, history);

      if (res.success) {
        pushBot(res.message, {
          action: res.action,
          orderId: res.orderId,
        });
      } else {
        pushBot(res.error || "Rue gặp gián đoạn tạm thời. Quý khách vui lòng thử lại sau ạ.");
      }
    } catch (err) {
      if (err.status === 401 || err.data?.code === "AUTH_REQUIRED") {
        pushBot("Phiên làm việc đã hết hạn. Quý khách vui lòng đăng nhập lại để tiếp tục trò chuyện.", {
          action: "AUTH_REQUIRED",
        });
      } else if (err.status === 403) {
        pushBot(err.message || "Tài khoản không đủ quyền sử dụng Trợ lý Rue.");
      } else if (err.status === 429) {
        pushBot("Quý khách đang gửi tin nhắn hơi nhanh. Vui lòng đợi trong giây lát rồi nhắn tiếp cho Rue nhé ạ.");
      } else {
        pushBot("Rue hiện đang bảo trì kết nối thông minh. Quý khách có thể xem mục Đơn hàng của tôi hoặc liên hệ Chăm sóc khách hàng để được phục vụ tốt nhất ạ.", {
          action: "OPEN_ORDERS",
        });
      }
    } finally {
      setTyping(false);
    }
  }

  return (
    <>
      {/* Floating button */}
      <button id="chat-toggle" onClick={handleToggle} aria-label="Trò chuyện với Rue">
        <img src={foxLogo} alt="Maison Rue assistant" />
      </button>

      {/* Chatbox Window */}
      {open && (
        <div id="chat-box" style={{ display: "flex" }}>
          <div id="chat-header">
            <img src={foxLogo} alt="" />
            <span>
              Rue — Trợ lý Maison Rue
              <span className="chat-subtitle">Tư vấn phong cách & Dịch vụ khách hàng</span>
            </span>
          </div>

          {/* Body */}
          {!currentUser ? (
            // Anonymous guest: Show prompt and safe internal login link (Section II.2)
            <div id="chat-messages" className="chat-auth-prompt">
              <p>
                Xin chào quý khách! Rue là trợ lý thời trang cá nhân của <strong>Maison Rue</strong>.
              </p>
              <p>
                Quý khách vui lòng đăng nhập tài khoản khách hàng để được Rue tư vấn chuẩn xác và hỗ trợ thông tin đơn hàng chu đáo nhất ạ.
              </p>
              <Link
                to="/login?returnUrl=/"
                className="chat-auth-btn"
                onClick={() => setOpen(false)}
              >
                Đăng nhập tài khoản
              </Link>
            </div>
          ) : currentUser.role !== "customer" ? (
            // Staff / Admin: Dedicated message, blocked from customer chat (Section II.2)
            <div id="chat-messages" className="chat-auth-prompt">
              <p>
                Trợ lý Rue chỉ phục vụ khách hàng mua sắm.
              </p>
              <p>
                Quý khách hiện đang đăng nhập với vai trò quản trị/vận hành (<strong>{currentUser.role.toUpperCase()}</strong>). Vui lòng sử dụng các cổng quản lý tương ứng.
              </p>
              <Link
                to={currentUser.role === "admin" ? "/admin" : "/staff"}
                className="chat-auth-btn"
                onClick={() => setOpen(false)}
              >
                Đến {currentUser.role === "admin" ? "Admin Portal" : "Staff Portal"}
              </Link>
            </div>
          ) : (
            // Logged-in Customer: Active Chat interface
            <>
              <div id="chat-messages">
                {messages.map((m, i) => (
                  <div key={i}>
                    <div className={`message ${m.sender}`}>
                      <div>{m.text}</div>

                      {/* Structured Action Buttons from Server Enum (Section II.4 & VII.6) */}
                      {m.action === "OPEN_ORDERS" && (
                        <button
                          type="button"
                          className="chat-action-btn"
                          onClick={() => {
                            setOpen(false);
                            navigate("/account/orders");
                          }}
                        >
                          📦 Đến trang Đổi trả & Hoàn tiền (Đơn hàng của tôi)
                        </button>
                      )}

                      {m.action === "OPEN_OWN_ORDER" && m.orderId && (
                        <button
                          type="button"
                          className="chat-action-btn"
                          onClick={() => {
                            setOpen(false);
                            navigate("/account/orders");
                          }}
                        >
                          🔍 Xem chi tiết đơn #{m.orderId} & Gửi yêu cầu
                        </button>
                      )}

                      {m.action === "CONTACT_SUPPORT" && (
                        <button
                          type="button"
                          className="chat-action-btn"
                          onClick={() => {
                            setOpen(false);
                            navigate("/our-story");
                          }}
                        >
                          📞 Liên hệ Chăm sóc khách hàng
                        </button>
                      )}

                      {m.action === "AUTH_REQUIRED" && (
                        <Link
                          to="/login?returnUrl=/"
                          className="chat-action-btn"
                          style={{ textDecoration: "none" }}
                          onClick={() => setOpen(false)}
                        >
                          Đăng nhập lại
                        </Link>
                      )}
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>

              {typing && <div id="chat-typing">Rue đang soạn câu trả lời...</div>}

              <form id="chat-form" onSubmit={handleSend}>
                <input
                  id="chat-input"
                  type="text"
                  placeholder="Hỏi Rue về thời trang, chính sách đổi trả..."
                  autoComplete="off"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  disabled={typing}
                />
                <button id="chat-send" type="submit" disabled={typing || !input.trim()}>
                  Gửi
                </button>
              </form>
            </>
          )}
        </div>
      )}
    </>
  );
}
