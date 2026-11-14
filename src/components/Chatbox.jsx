import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import "./Chatbox.css";
import foxLogo from "../assets/fox-logo.webp";
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

  // Clear session and state immediately when user logs out or switches accounts
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
  const isStaffOrAdmin = currentUser && (currentUser.role === "staff" || currentUser.role === "admin");
  const isGuest = !currentUser;

  function handleToggle() {
    setOpen((prev) => {
      const next = !prev;
      if (next && !greeted) {
        setGreeted(true);
        if (isCustomer) {
          setMessages([
            {
              sender: "bot",
              text: `Kính chào ${currentUser.name || "quý khách"}! Rue là trợ lý thời trang của Maison Rue. Hôm nay Rue có thể tư vấn sản phẩm Nam, Nữ, Trẻ em, gợi ý size chuẩn hoặc hỗ trợ đơn hàng gì cho quý khách ạ?`,
            },
          ]);
        } else if (isGuest) {
          setMessages([
            {
              sender: "bot",
              text: "Xin chào quý khách! Rue là trợ lý thời trang của Maison Rue. Rue có thể tư vấn các dòng sản phẩm Nam, Nữ, Trẻ em, gợi ý chọn size chuẩn xác hoặc giải đáp chất liệu, phong cách và giá cả ạ.",
            },
          ]);
        }
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
    if (!text || typing || isStaffOrAdmin) return;

    pushUser(text);
    setInput("");
    setTyping(true);

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    try {
      // Build safe conversation history for context
      const history = messages
        .slice(-6)
        .map((m) => ({
          role: m.sender === "user" ? "user" : "assistant",
          content: m.text,
        }));

      const res = await chatAPI.sendMessage(text, history);

      if (res.success) {
        pushBot(res.message, {
          action: res.action,
          loginUrl: res.loginUrl,
          orderId: res.orderId,
        });
      } else {
        pushBot(res.error || "Rue gặp gián đoạn tạm thời. Quý khách vui lòng thử lại sau ạ.");
      }
    } catch (err) {
      if (err.name === "AbortError") return;
      if (err.status === 401 || err.data?.code === "AUTH_REQUIRED") {
        pushBot("Chức năng này yêu cầu đăng nhập tài khoản khách hàng Maison Rue.", {
          action: "AUTH_REQUIRED",
          loginUrl: "/login?returnUrl=/account/orders",
        });
      } else if (err.status === 403) {
        pushBot(err.message || "Tài khoản không đủ quyền sử dụng Trợ lý Rue.");
      } else if (err.status === 429) {
        pushBot("Quý khách đang gửi tin nhắn hơi nhanh. Vui lòng đợi trong giây lát rồi nhắn tiếp cho Rue nhé ạ.");
      } else {
        pushBot("Rue hiện đang bảo trì kết nối thông minh. Quý khách có thể khám phá danh mục sản phẩm hoặc mở Đơn hàng của tôi để được hỗ trợ ạ.", {
          action: isCustomer ? "OPEN_ORDERS" : "NONE",
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
          {isStaffOrAdmin ? (
            // Staff / Admin: Dedicated message, blocked from customer chat
            <div id="chat-messages" className="chat-auth-prompt">
              <p>
                Trợ lý Rue chỉ phục vụ tư vấn công khai và hỗ trợ khách hàng mua sắm.
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
            // Guest & Customer: Active Chat Interface
            <>
              <div id="chat-messages">
                {messages.map((m, i) => (
                  <div key={i}>
                    <div className={`message ${m.sender}`}>
                      <div>{m.text}</div>

                      {/* Structured Action Buttons from Server Enum */}
                      {m.action === "AUTH_REQUIRED" && (
                        <Link
                          to={m.loginUrl || "/login?returnUrl=/account/orders"}
                          className="chat-action-btn"
                          style={{ textDecoration: "none", display: "inline-flex" }}
                          onClick={() => setOpen(false)}
                        >
                          🔐 Đăng nhập tài khoản khách hàng
                        </Link>
                      )}

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
                  placeholder={isGuest ? "Hỏi Rue về thời trang nam, nữ, trẻ em, chọn size..." : "Hỏi Rue về thời trang, size hoặc đơn hàng..."}
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
