import { db } from "../config/db.js";

/**
 * MAISON RUE — RUE FASHION & AFTER-SALES ASSISTANT SERVICE
 * 
 * Capabilities:
 * - Public Guest Advisory: Men, Women, Kids collections, Colors, Materials, Price ranges, Size charts & suggestions.
 * - Sizing Advice: Based on official Maison Rue size guide (chest, waist, foot length). Asking for missing measurements, disclaimer on fit preferences.
 * - Private Customer Gates: Viewing orders, return/refund filing, account profile, saved addresses, and vouchers strictly require customer login.
 * - Staff/Admin Isolation: Staff/Admin cannot access customer private data via chatbot.
 * - Anti-Prompt Injection: Pre-filter against jailbreaks, system prompt leaks, privilege escalation, fake order claims.
 * - No Autonomous Tools: Chatbot cannot write DB, issue refunds, or send emails.
 */

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";

// Canonical size chart reference (cm)
export const SIZING_GUIDELINES = {
  clothing: [
    { size: "XS", chest: "86-90", waist: "68-72", length: "66" },
    { size: "S", chest: "92-96", waist: "72-76", length: "68" },
    { size: "M", chest: "98-102", waist: "78-82", length: "70" },
    { size: "L", chest: "104-108", waist: "84-88", length: "72" },
    { size: "XL", chest: "110-114", waist: "90-94", length: "74" },
    { size: "XXL", chest: "116-120", waist: "96-100", length: "76" },
  ],
  footwear: [
    { size: "38", footLengthMin: 23.0, footLengthMax: 23.6 },
    { size: "39", footLengthMin: 23.7, footLengthMax: 24.3 },
    { size: "40", footLengthMin: 24.4, footLengthMax: 25.0 },
    { size: "41", footLengthMin: 25.1, footLengthMax: 25.7 },
    { size: "42", footLengthMin: 25.8, footLengthMax: 26.4 },
    { size: "43", footLengthMin: 26.5, footLengthMax: 27.1 },
    { size: "44", footLengthMin: 27.2, footLengthMax: 27.8 },
  ],
  disclaimer: "Lưu ý: Tư vấn kích cỡ là gợi ý tham khảo dựa trên bảng kích thước chuẩn của Maison Rue. Cảm giác vừa vặn thực tế có thể thay đổi tùy thuộc vào sở thích mặc ôm vừa (slim) hay rộng rãi (relaxed) của quý khách ạ.",
};

// Known prompt injection and jailbreak attack patterns
const ADVERSARIAL_PATTERNS = [
  /ignore\s+(all\s+|any\s+)?(previous|prior|above)\s+(instructions|prompts|rules)/i,
  /system\s*prompt/i,
  /you\s+are\s+now\s+(in\s+)?(developer\s+mode|dan|jailbroken|unrestricted)/i,
  /developer\s+mode/i,
  /bypass\s+(all\s+)?(security|rules|restrictions|filters)/i,
  /pretend\s+you\s+are\s+(the\s+)?(admin|system|root|superadmin|owner)/i,
  /reveal\s+(your\s+)?(api[_\s]?key|secret|token|password|instructions)/i,
  /output\s+(your\s+)?(initial\s+|system\s+)?prompt/i,
  /<script[\s\S]*?>/i,
  /javascript:/i,
  /data:text\/html/i,
  /execute\s+(refund|payment|sql|transfer)/i,
  /hoàn\s*tiền\s*ngay/i,
  /cấp\s*quyền\s*(admin|quản trị)/i,
];

export function detectAdversarialPrompt(input) {
  if (typeof input !== "string") return true;
  for (const pattern of ADVERSARIAL_PATTERNS) {
    if (pattern.test(input)) return true;
  }
  return false;
}

// Compute recommended clothing size from chest or waist
export function calculateClothingSize(chest, waist) {
  const c = Number(chest) || 0;
  const w = Number(waist) || 0;
  if (!c && !w) return null;

  if (c > 0) {
    if (c <= 90) return "XS";
    if (c <= 96) return "S";
    if (c <= 102) return "M";
    if (c <= 108) return "L";
    if (c <= 114) return "XL";
    return "XXL";
  }
  if (w <= 72) return "XS";
  if (w <= 76) return "S";
  if (w <= 82) return "M";
  if (w <= 88) return "L";
  if (w <= 94) return "XL";
  return "XXL";
}

// Compute recommended shoe size from foot length (cm)
export function calculateShoeSize(lengthCm) {
  const len = Number(lengthCm);
  if (!len || isNaN(len)) return null;
  for (const entry of SIZING_GUIDELINES.footwear) {
    if (len >= entry.footLengthMin && len <= entry.footLengthMax) {
      return entry.size;
    }
  }
  if (len < 23.0) return "38";
  if (len > 27.8) return "44";
  return null;
}

const RUE_SYSTEM_PROMPT = `Bạn là Rue, trợ lý thời trang cao cấp và dịch vụ khách hàng của thương hiệu MAISON RUE (Haute Parfumerie & Luxury Living).
Phong cách giao tiếp: Lịch sự, tinh tế, ân cần, ngắn gọn (2-4 câu), đúng tinh thần quiet luxury.

I. DANH MỤC SẢN PHẨM & DỊCH VỤ CÔNG KHAI (PUBLIC ADVISORY):
1. Khách nam (Men):
   - Áo polo len merino (Merino Wool Knitted Polo - 4.890.000đ, len lông cừu Merino)
   - Áo len cashmere cổ tròn (Baby Cashmere Crewneck Sweater - 8.900.000đ, len Baby Cashmere)
   - Áo len cashmere khóa kéo (Cashmere Half-Zip Sweater - 9.500.000đ)
   - Áo cardigan len cashmere (Cashmere Button Cardigan - 9.800.000đ)
   - Sơ mi linen/oxford/suede (3.200.000đ - 18.500.000đ)
   - Quần tây linen/chinos (3.900.000đ - 4.600.000đ)
   - Áo măng tô cashmere overcoat (Baby Cashmere Overcoat - 32.000.000đ)
   - Giày Penny Loafer da bê/da lộn (9.200.000đ - 10.500.000đ), Giày sneakers da linen (7.500.000đ)
2. Khách nữ (Women):
   - Áo cardigan baby cashmere (Baby Cashmere Cardigan - 9.800.000đ)
   - Áo len cổ lọ cashmere (Cashmere Turtleneck - 9.200.000đ)
   - Đầm lụa slip dress (Silk Slip Dress - 8.200.000đ), Đầm midi linen (6.500.000đ)
   - Áo khoác dạ măng tô cashmere dài (Baby Cashmere Long Coat - 34.000.000đ)
   - Giày cao gót quai hậu da lộn (Suede Slingback Heels - 8.900.000đ)
   - Giày ballet flats da bê (Ballet Flats - 7.800.000đ)
   - Túi xách da bê hạt (Grained Calfskin Shoulder Bag - 19.500.000đ)
3. Trẻ em (Kids):
   - Bodysuit cotton hữu cơ (Organic Cotton Baby Bodysuit - 1.200.000đ)
   - Áo cardigan cashmere pha cotton (Cashmere-Cotton Baby Cardigan - 3.200.000đ)
   - Giày tập đi da mềm (Soft Leather Baby Shoes - 2.100.000đ)
   - Gấu bông Teddy Bear signature xúc cảm Cashmere (Signature Cashmere-Touch Teddy Bear - 2.400.000đ)
4. Tư vấn kích cỡ (Size Guide):
   - Quần áo (vòng ngực chuẩn cm):
     + XS: ngực 86-90 cm (eo 68-72 cm)
     + S: ngực 92-96 cm (eo 72-76 cm)
     + M: ngực 98-102 cm (eo 78-82 cm)
     + L: ngực 104-108 cm (eo 84-88 cm)
     + XL: ngực 110-114 cm (eo 90-94 cm)
     + XXL: ngực 116-120 cm (eo 96-100 cm)
   - Giày dép (chiều dài bàn chân chuẩn cm):
     + Size 38: 23.0 - 23.6 cm
     + Size 39: 23.7 - 24.3 cm
     + Size 40: 24.4 - 25.0 cm
     + Size 41: 25.1 - 25.7 cm
     + Size 42: 25.8 - 26.4 cm
     + Size 43: 26.5 - 27.1 cm
     + Size 44: 27.2 - 27.8 cm
   - Quy tắc tư vấn: Khi thiếu số đo, hỏi thêm vòng ngực/eo hoặc chiều dài chân. Luôn kèm lưu ý: "Tư vấn kích cỡ mang tính tham khảo, độ vừa vặn thực tế có thể tùy sở thích mặc ôm hay rộng rãi của quý khách ạ."
   - KHÔNG tự bịa sản phẩm, giá bán hoặc bảng size ngoài dữ liệu.

II. CHỨC NĂNG RIÊNG VÀ PHÂN QUYỀN (STRICT BOUNDARIES):
1. Khách chưa đăng nhập (GUEST):
   - ĐƯỢC: Tư vấn nam/nữ/trẻ em, kích cỡ, màu sắc, chất liệu, khoảng giá, chính sách công khai.
   - KHÔNG ĐƯỢC: Xem đơn hàng, hồ sơ đổi trả, email, địa chỉ đã lưu, ưu đãi riêng.
   - Khi khách yêu cầu xem đơn hàng hoặc đổi trả: Trả về action "AUTH_REQUIRED" và hướng dẫn đăng nhập.
2. Khách hàng đã đăng nhập (CUSTOMER):
   - CHỈ ĐƯỢC tra cứu đơn hàng của chính tài khoản mình.
   - Đổi trả: Giải thích điều kiện 14 ngày, đơn đã giao (delivered), và trả về action "OPEN_ORDERS" (hoặc "OPEN_OWN_ORDER").
3. Staff / Admin:
   - Không được dùng chatbot để truy cập dữ liệu customer như chính chủ.
4. Chatbot KHÔNG có quyền:
   - Tự tạo hồ sơ đổi trả, tự duyệt, hoàn tiền tài chính hay gửi email. Chỉ dẫn link đến trang chức năng.

III. ĐỊNH DẠNG ĐẦU RA (OUTPUT JSON SCHEMA):
BẮT BUỘC trả về JSON:
{
  "message": "Câu trả lời lịch sự, tinh tế",
  "action": "NONE" | "OPEN_ORDERS" | "OPEN_OWN_ORDER" | "CONTACT_SUPPORT" | "AUTH_REQUIRED",
  "loginUrl": "/login?returnUrl=/account/orders" (nếu AUTH_REQUIRED, ngược lại null),
  "orderId": "Mã đơn hàng nếu thuộc quyền sở hữu khách (ngược lại null)"
}`;

export async function processRueChat({ user, message, conversationHistory = [], clientIp = "local" }) {
  const trimmed = String(message || "").trim();
  if (!trimmed) {
    return {
      message: "Xin chào quý khách! Rue là trợ lý của Maison Rue. Rue có thể tư vấn sản phẩm Nam, Nữ, Trẻ em hoặc hỗ trợ giải đáp thông tin gì cho quý khách ạ?",
      action: "NONE",
      loginUrl: null,
      orderId: null,
    };
  }

  // 1. Layer 1: Prompt Injection Pre-Filter (Local Code Enforcement)
  if (detectAdversarialPrompt(trimmed)) {
    return {
      message: "Rue là trợ lý thời trang của Maison Rue và chỉ hỗ trợ tư vấn phong cách cũng như hướng dẫn dịch vụ sau bán hàng theo chính sách của thương hiệu ạ.",
      action: "NONE",
      loginUrl: null,
      orderId: null,
    };
  }

  const isGuest = !user;
  const isCustomer = user && user.role === "customer";
  const isStaffOrAdmin = user && (user.role === "staff" || user.role === "admin");

  // Detect intent for private customer data
  const orderLookUpIntent = /(đơn\s*hàng|tra\s*cứu\s*đơn|mã\s*đơn|order|kiểm\s*tra\s*đơn|giao\s*đến\s*đâu|đơn\s*đã\s*giao)/i.test(trimmed);
  const returnIntent = /(đổi\s*trả|hoàn\s*tiền|trả\s*hàng|return|refund|lỗi\s*sản\s*phẩm|đổi\s*size|đổi\s*hàng|không\s*vừa)/i.test(trimmed);
  const accountDataIntent = /(địa\s*chỉ\s*của\s*tôi|email\s*của\s*tôi|voucher\s*của\s*tôi|ưu\s*đãi\s*riêng|thông\s*tin\s*tài\s*khoản)/i.test(trimmed);

  const privateIntent = orderLookUpIntent || returnIntent || accountDataIntent;

  // 2. Private Intent Gate for Guest: Must login
  if (isGuest && privateIntent) {
    return {
      message: "Để tra cứu thông tin đơn hàng, quản lý địa chỉ hoặc gửi yêu cầu đổi hàng / hoàn tiền, quý khách vui lòng đăng nhập tài khoản khách hàng Maison Rue nhé ạ.",
      action: "AUTH_REQUIRED",
      loginUrl: "/login?returnUrl=/account/orders",
      orderId: null,
    };
  }

  // 3. Staff / Admin accessing customer private data via chatbot
  if (isStaffOrAdmin && privateIntent) {
    return {
      message: `Tài khoản của bạn hiện có vai trò ${user.role.toUpperCase()}. Để quản lý đơn hàng hoặc xử lý kiểm định đổi trả, vui lòng sử dụng cổng quản lý tương ứng (Staff / Admin Portal) ạ.`,
      action: "NONE",
      loginUrl: null,
      orderId: null,
    };
  }

  // 4. Logged-in Customer: Order ownership verification
  const orderIdMatch = trimmed.match(/MR-\d{4}-\d{5}/i);
  let verifiedOrderId = null;
  let action = "NONE";

  if (isCustomer) {
    if (orderIdMatch) {
      const candidateId = orderIdMatch[0].toUpperCase();
      try {
        const order = await db.getOrderById(candidateId);
        if (order && order.customer_id === user.id) {
          verifiedOrderId = candidateId;
          action = returnIntent ? "OPEN_OWN_ORDER" : "NONE";
        }
      } catch {
        // Ignore DB lookup error
      }
    } else if (returnIntent) {
      action = "OPEN_ORDERS";
    }
  }

  // 5. Detect Sizing Inquiries & calculate measurements
  const chestMatch = trimmed.match(/ngực\s*[:=]?\s*(\d{2,3})/i);
  const waistMatch = trimmed.match(/eo\s*[:=]?\s*(\d{2,3})/i);
  const footMatch = trimmed.match(/(?:chân|bàn\s*chân|dài)\s*[:=]?\s*(\d{2}(?:\.\d)?)\s*(?:cm)?/i);

  let calculatedSize = null;
  let sizeCategory = null;

  if (footMatch) {
    calculatedSize = calculateShoeSize(footMatch[1]);
    sizeCategory = "footwear";
  } else if (chestMatch || waistMatch) {
    calculatedSize = calculateClothingSize(chestMatch ? chestMatch[1] : null, waistMatch ? waistMatch[1] : null);
    sizeCategory = "clothing";
  }

  // 6. Check OpenAI API Availability
  const apiKey = process.env.OPENAI_API_KEY || process.env.VITE_CHAT_API_KEY;

  if (!apiKey || apiKey.startsWith("your_")) {
    // Deterministic Rule-Based Fallback Engine
    if (isCustomer && returnIntent) {
      return {
        message: "Để yêu cầu đổi hàng hoặc hoàn tiền theo chính sách (trong vòng 14 ngày kể từ khi nhận hàng), quý khách vui lòng mở mục Đơn hàng của tôi, chọn đơn hàng đã giao và nhấn 'Request return / refund' ạ.",
        action: verifiedOrderId ? "OPEN_OWN_ORDER" : "OPEN_ORDERS",
        loginUrl: null,
        orderId: verifiedOrderId,
      };
    }

    if (calculatedSize) {
      if (sizeCategory === "footwear") {
        return {
          message: `Dựa trên chiều dài bàn chân ${footMatch[1]}cm, Maison Rue gợi ý quý khách nên chọn cỡ giày ${calculatedSize}. ${SIZING_GUIDELINES.disclaimer}`,
          action: "NONE",
          loginUrl: null,
          orderId: null,
        };
      }
      return {
        message: `Dựa trên số đo quý khách cung cấp, Maison Rue gợi ý kích cỡ phù hợp là size ${calculatedSize}. ${SIZING_GUIDELINES.disclaimer}`,
        action: "NONE",
        loginUrl: null,
        orderId: null,
      };
    }

    // Missing measurements check
    if (/tư vấn size|chọn size|mặc size|size nào/i.test(trimmed)) {
      return {
        message: "Để Rue tư vấn cỡ trang phục chuẩn xác nhất, quý khách có thể chia sẻ số đo vòng ngực, vòng eo (đối với áo/quần) hoặc chiều dài bàn chân tính bằng cm (đối với giày) nhé ạ!",
        action: "NONE",
        loginUrl: null,
        orderId: null,
      };
    }

    // Gender / Audience questions
    if (/nam|đàn ông|men/i.test(trimmed)) {
      return {
        message: "Bộ sưu tập Nam của Maison Rue nổi bật với Áo Polo Len Merino (4.890.000đ), Áo Len Baby Cashmere Cổ Tròn (8.900.000đ), Áo Sơ Mi Linen Riviera và Giày Loafers da bê thủ công. Quý khách muốn tìm sản phẩm cho dịp đi làm hay dạo phố ạ?",
        action: "NONE",
        loginUrl: null,
        orderId: null,
      };
    }
    if (/nữ|phụ nữ|women|đầm|váy/i.test(trimmed)) {
      return {
        message: "Bộ sưu tập Nữ mang phong thái trang nhã với Áo Cardigan Baby Cashmere (9.800.000đ), Đầm Lụa Slip Dress (8.200.000đ), Đầm Midi Linen (6.500.000đ) và Túi Da Bê Hạt (19.500.000đ). Quý khách cần Rue tư vấn màu sắc hay chất liệu nào ạ?",
        action: "NONE",
        loginUrl: null,
        orderId: null,
      };
    }
    if (/trẻ em|bé|kids|sơ sinh|gấu/i.test(trimmed)) {
      return {
        message: "Dòng sản phẩm Trẻ em của Maison Rue được dệt từ Cotton Hữu Cơ và Len Cashmere mềm mại, bao gồm Bodysuit hữu cơ (1.200.000đ), Cardigan pha cashmere cho bé (3.200.000đ) và Gấu Bông Teddy Bear Signature (2.400.000đ) an toàn tuyệt đối cho làn da bé ạ.",
        action: "NONE",
        loginUrl: null,
        orderId: null,
      };
    }

    return {
      message: "Xin chào quý khách! Rue là trợ lý thời trang của Maison Rue. Rue sẵn sàng tư vấn các dòng sản phẩm Nam, Nữ, Trẻ em, chất liệu len Cashmere, vải Linen, da lộn cũng như gợi ý chọn size phù hợp ạ.",
      action: "NONE",
      loginUrl: null,
      orderId: null,
    };
  }

  // 7. OpenAI Guided Consultation
  const sanitizedHistory = (Array.isArray(conversationHistory) ? conversationHistory : [])
    .slice(isGuest ? -4 : -6)
    .filter((h) => h && (h.role === "user" || h.role === "assistant"))
    .map((h) => ({
      role: h.role,
      content: String(h.content || "").slice(0, 500),
    }));

  let userContextHint = isGuest
    ? "NGƯỜI DÙNG: Khách vãng lai (GUEST). Được tư vấn sản phẩm/size/giá. KHÔNG ĐƯỢC tra cứu đơn hàng hay gửi đổi trả; nếu hỏi hãy trả về action AUTH_REQUIRED."
    : isCustomer
      ? `NGƯỜI DÙNG: Khách hàng đã đăng nhập (${user.name || "Customer"}). Tra cứu đơn hàng chỉ cho đơn của chính khách; nếu đổi trả thì action OPEN_ORDERS.`
      : "NGƯỜI DÙNG: Nhân viên/Quản trị viên. Nhắc nhở sử dụng cổng Portal quản lý.";

  if (calculatedSize) {
    userContextHint += `\nKẾT QUẢ ĐỐI SOÁT SIZE GUIDE CHÍNH XÁC: Số đo do khách hàng cung cấp khớp với cỡ ${calculatedSize} (${sizeCategory === "footwear" ? "Giày dép" : "Trang phục"}). Bạn BẮT BUỘC tư vấn đúng cỡ ${calculatedSize} này theo bảng chuẩn, không được tự ý đổi sang size khác.`;
  }

  const payloadMessages = [
    { role: "system", content: `${RUE_SYSTEM_PROMPT}\n\n${userContextHint}` },
    ...sanitizedHistory,
    { role: "user", content: trimmed.slice(0, isGuest ? 600 : 1000) },
  ];

  try {
    const response = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: payloadMessages,
        temperature: 0.3,
        max_tokens: 450,
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API returned HTTP ${response.status}`);
    }

    const data = await response.json();
    const rawContent = data.choices?.[0]?.message?.content?.trim();
    if (!rawContent) throw new Error("Empty model response");

    let parsed = {};
    try {
      parsed = JSON.parse(rawContent);
    } catch {
      parsed = { message: rawContent, action: action };
    }

    let finalAction = parsed.action || action;
    const validActions = new Set(["NONE", "OPEN_ORDERS", "OPEN_OWN_ORDER", "CONTACT_SUPPORT", "AUTH_REQUIRED"]);
    if (!validActions.has(finalAction)) finalAction = action;

    // Guest asking for private data MUST receive AUTH_REQUIRED
    if (isGuest && privateIntent) {
      finalAction = "AUTH_REQUIRED";
    }

    // Verify order ID ownership
    let finalOrderId = verifiedOrderId;
    if (parsed.orderId && !finalOrderId && isCustomer) {
      const candidate = String(parsed.orderId).trim().toUpperCase();
      const order = await db.getOrderById(candidate);
      if (order && order.customer_id === user.id) {
        finalOrderId = candidate;
      }
    }

    if (finalAction === "OPEN_OWN_ORDER" && !finalOrderId) {
      finalAction = "OPEN_ORDERS";
    }

    const cleanMessage = String(parsed.message || "")
      .replace(/<[^>]*>?/gm, "")
      .trim();

    return {
      message: cleanMessage || "Rue có thể tư vấn các sản phẩm Nam, Nữ, Trẻ em hoặc hướng dẫn chọn size chuẩn xác cho quý khách ạ.",
      action: finalAction,
      loginUrl: finalAction === "AUTH_REQUIRED" ? "/login?returnUrl=/account/orders" : null,
      orderId: finalOrderId,
    };
  } catch (err) {
    console.warn("[Rue Chatbot Service] Fallback triggered:", err.message);
    if (isGuest && privateIntent) {
      return {
        message: "Để tra cứu thông tin đơn hàng hoặc gửi yêu cầu đổi hàng / hoàn tiền, quý khách vui lòng đăng nhập tài khoản khách hàng Maison Rue nhé ạ.",
        action: "AUTH_REQUIRED",
        loginUrl: "/login?returnUrl=/account/orders",
        orderId: null,
      };
    }
    if (isCustomer && returnIntent) {
      return {
        message: "Để gửi yêu cầu đổi hàng hoặc hoàn tiền theo chính sách (14 ngày), quý khách vui lòng mở mục Đơn hàng của tôi, chọn đơn hàng đã giao và nhấn 'Request return / refund' ạ.",
        action: verifiedOrderId ? "OPEN_OWN_ORDER" : "OPEN_ORDERS",
        loginUrl: null,
        orderId: verifiedOrderId,
      };
    }
    return {
      message: "Xin chào quý khách! Rue là trợ lý thời trang của Maison Rue. Quý khách có thể hỏi Rue về các bộ sưu tập Nam, Nữ, Trẻ em hoặc chia sẻ số đo để Rue tư vấn size phù hợp nhất ạ.",
      action: "NONE",
      loginUrl: null,
      orderId: null,
    };
  }
}
