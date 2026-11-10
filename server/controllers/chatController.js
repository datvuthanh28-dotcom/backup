import { processRueChat } from "../services/rueChatService.js";

// In-memory sliding window rate limiter
// Limits:
// - Guests: max 15 requests / 60 seconds per IP
// - Logged-in Customer: max 25 requests / 60 seconds per user ID
const rateLimitMap = new Map();

function isRateLimited(identifier, maxRequests = 20) {
  const now = Date.now();
  const windowMs = 60 * 1000;

  const record = rateLimitMap.get(identifier) || [];
  const recent = record.filter((t) => now - t < windowMs);
  if (recent.length >= maxRequests) {
    return true;
  }
  recent.push(now);
  rateLimitMap.set(identifier, recent);

  // Periodic cleanup if map grows large
  if (rateLimitMap.size > 2000) {
    for (const [key, timestamps] of rateLimitMap.entries()) {
      if (timestamps.every((t) => now - t > windowMs)) {
        rateLimitMap.delete(key);
      }
    }
  }

  return false;
}

export async function handleChat(req, res) {
  try {
    const user = req.user || null;
    const clientIp = req.ip || req.headers["x-forwarded-for"] || "local";

    const isGuest = !user;
    const isCustomer = user && user.role === "customer";
    const isStaffOrAdmin = user && (user.role === "staff" || user.role === "admin");

    const rateLimitKey = isCustomer
      ? `customer_${user.id}`
      : isStaffOrAdmin
        ? `staff_${user.id}`
        : `guest_${clientIp}`;

    const maxReq = isGuest ? 15 : 25;

    if (isRateLimited(rateLimitKey, maxReq)) {
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

    const maxLen = isGuest ? 600 : 1000;
    if (text.length > maxLen) {
      return res.status(400).json({
        success: false,
        error: `Tin nhắn vượt quá độ dài cho phép (tối đa ${maxLen} ký tự).`,
      });
    }

    const result = await processRueChat({
      user,
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
