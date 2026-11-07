import { processCustomerChat } from "../services/rueChatService.js";

// In-memory rate limiting map (sliding window: max 20 requests / 60 seconds per user/IP)
const rateLimitMap = new Map();

function isRateLimited(identifier) {
  const now = Date.now();
  const windowMs = 60 * 1000;
  const maxRequests = 20;

  const record = rateLimitMap.get(identifier) || [];
  const recent = record.filter((t) => now - t < windowMs);
  if (recent.length >= maxRequests) {
    return true;
  }
  recent.push(now);
  rateLimitMap.set(identifier, recent);

  // Periodic cleanup if map grows
  if (rateLimitMap.size > 2000) {
    for (const [key, timestamps] of rateLimitMap.entries()) {
      if (timestamps.every((t) => now - t > windowMs)) {
        rateLimitMap.delete(key);
      }
    }
  }

  return false;
}

export async function handleCustomerChat(req, res) {
  try {
    const customer = req.user;
    if (!customer || customer.role !== "customer") {
      return res.status(403).json({
        success: false,
        error: "Trợ lý Rue chỉ phục vụ khách hàng mua sắm đã đăng nhập.",
        code: "CUSTOMER_ONLY",
      });
    }

    const clientIp = req.ip || req.headers["x-forwarded-for"] || "local";
    const rateLimitKey = `${customer.id}_${clientIp}`;

    if (isRateLimited(rateLimitKey)) {
      return res.status(429).json({
        success: false,
        error: "Bạn đang gửi tin nhắn quá nhanh. Vui lòng đợi một lát rồi thử lại.",
        code: "RATE_LIMITED",
      });
    }

    const { message, history } = req.body || {};
    const text = String(message || "").trim();

    if (!text) {
      return res.status(400).json({
        success: false,
        error: "Tin nhắn không được để trống.",
      });
    }

    if (text.length > 1000) {
      return res.status(400).json({
        success: false,
        error: "Tin nhắn vượt quá độ dài cho phép (tối đa 1000 ký tự).",
      });
    }

    const result = await processCustomerChat({
      customer,
      message: text,
      conversationHistory: Array.isArray(history) ? history : [],
    });

    return res.json({
      success: true,
      ...result,
    });
  } catch (err) {
    console.error("[Chat Controller Error]", err);
    return res.status(500).json({
      success: false,
      error: "Không thể xử lý tin nhắn lúc này. Vui lòng thử lại sau.",
    });
  }
}

