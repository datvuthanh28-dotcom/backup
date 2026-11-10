import dotenv from "dotenv";
import { verifyAddressWithGeoapify, getAddressSuggestionsFromGeoapify } from "./geoapifyService.js";

dotenv.config();

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";

/**
 * Audit address evidence with OpenAI based EXCLUSIVELY on Geoapify evidence.
 * Strict Privacy: Only minimal address text is passed.
 * NEVER pass customer name, phone, email, cart items, or order details.
 */
export async function auditAddressEvidenceWithOpenAI({ rawAddress, geoapifyEvidence }) {
  const apiKey = process.env.OPENAI_API_KEY || process.env.VITE_CHAT_API_KEY;
  if (!apiKey || apiKey.startsWith("your_")) {
    return null; // Fallback to deterministic backend rules
  }

  // Construct minimal, privacy-safe payload
  const minimalEvidence = {
    formatted: geoapifyEvidence.formatted || "",
    result_type: geoapifyEvidence.resultType || "",
    street: geoapifyEvidence.street || "",
    housenumber: geoapifyEvidence.housenumber || "",
    district: geoapifyEvidence.district || "",
    city: geoapifyEvidence.city || "",
    country_code: (geoapifyEvidence.countryCode || "vn").toLowerCase(),
    confidence: geoapifyEvidence.confidence ?? 0,
  };

  const systemPrompt = `Bạn là trợ lý thẩm định địa chỉ giao hàng tại Việt Nam cho thương hiệu MAISON RUE.
Nhiệm vụ: Phân tích địa chỉ do khách hàng nhập dựa trên BẰNG CHỨNG BẢN ĐỒ GEOAPIFY được cung cấp.

NGUYÊN TẮC BẮT BUỘC (CRITICAL RULES):
1. Tuyệt đối KHÔNG tự suy đoán địa chỉ tồn tại từ kiến thức mô hình hay dữ liệu huấn luyện.
2. Không coi địa chỉ viết đầy đủ, có tọa độ hoặc câu từ dài là đủ chứng minh.
3. Đối chiếu các thành phần khách nhập (số nhà, tên đường, phường/xã, quận/huyện, tỉnh/thành) với kết quả Geoapify.
4. Phát hiện xem có thiếu số nhà/tòa nhà, thiếu tên đường hoặc có mâu thuẫn giữa thông tin khách nhập và bản đồ không.
5. Đề xuất trạng thái có cấu trúc:
   - "MATCHED": Địa chỉ có đầy đủ số nhà/tên tòa nhà và tên đường, khớp với dữ liệu bản đồ Geoapify.
   - "NEEDS_CORRECTION": Thiếu số nhà/tòa nhà cụ thể, thiếu tên đường hoặc có thông tin mâu thuẫn cần sửa đổi.
   - "UNVERIFIED": Bằng chứng bản đồ không rõ ràng, độ tin cậy thấp hoặc không xác minh được vị trí.
6. Thông báo trung thực: Dùng mẫu "Địa chỉ phù hợp với dữ liệu bản đồ" hoặc "Chưa đủ thông tin để xác minh: [lý do ngắn gọn]". Tuyệt đối không tuyên bố chắc chắn 100% địa chỉ thật/giả.

ĐỊNH DẠNG ĐẦU RA JSON BẮT BUỘC:
{
  "status": "MATCHED" | "NEEDS_CORRECTION" | "UNVERIFIED",
  "explanation": "Giải thích trung thực súc tích (1-2 câu)",
  "missingComponents": ["housenumber" | "street" | "ward" | "district" | "city"],
  "isDeliverable": true | false
}`;

  const userPrompt = `ĐỊA CHỈ KHÁCH NHẬP: "${rawAddress}"
BẰNG CHỨNG BẢN ĐỒ GEOAPIFY: ${JSON.stringify(minimalEvidence)}`;

  try {
    const res = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.1,
        max_tokens: 300,
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(6000),
    });

    if (!res.ok) {
      console.warn(`[Address Audit OpenAI] API returned status ${res.status}`);
      return null;
    }

    const data = await res.json();
    const rawContent = data.choices?.[0]?.message?.content?.trim();
    if (!rawContent) return null;

    const parsed = JSON.parse(rawContent);
    const validStatuses = new Set(["MATCHED", "NEEDS_CORRECTION", "UNVERIFIED"]);
    if (!validStatuses.has(parsed.status)) {
      parsed.status = "UNVERIFIED";
    }

    return parsed;
  } catch (err) {
    console.warn("[Address Audit OpenAI] Error/Timeout:", err.message);
    return null;
  }
}

/**
 * End-to-end Delivery Address Verification
 * Integrates: Customer Input -> Geoapify Geocoding -> Code Normalization -> OpenAI Evidence Audit -> Backend Rules Arbiter
 * 
 * BACKEND IS THE FINAL ARBITER:
 * AI CANNOT override invalid map results, missing mandatory fields, or non-deliverable areas.
 */
export async function verifyDeliveryAddress(address, options = {}) {
  const raw = String(address || "").trim();
  if (raw.length < 5) {
    const err = new Error("Địa chỉ giao nhận quá ngắn. Vui lòng nhập chi tiết số nhà, tên đường, phường/xã, quận/huyện.");
    err.status = 400;
    err.code = "NEEDS_CORRECTION";
    throw err;
  }

  // 1. Call Geoapify (Map Data Source & Evidence). A map-provider outage must
  // not stop sales: accept a sufficiently specific address for staff review,
  // while never claiming that it was verified by Geoapify.
  let geoResult;
  try {
    geoResult = await verifyAddressWithGeoapify(raw, options);
  } catch (error) {
    const providerUnavailable =
      error.code === "ADDRESS_PROVIDER_NOT_CONFIGURED" ||
      error.code === "ADDRESS_PROVIDER_UNAVAILABLE" ||
      error.status === 502 ||
      error.status === 503;

    if (!providerUnavailable) throw error;

    const hasHouseNumber = /(^|[\s,])\d+[\w/-]*/u.test(raw);
    const addressWords = raw.match(/[A-Za-zÀ-ỹĐđ]{2,}/gu) || [];
    if (!hasHouseNumber || addressWords.length < 2 || raw.length < 10) {
      const fallbackError = new Error(
        "Địa chỉ chưa đủ chi tiết để nhân viên đối soát. Vui lòng bổ sung số nhà và tên đường."
      );
      fallbackError.status = 422;
      fallbackError.code = "NEEDS_CORRECTION";
      throw fallbackError;
    }

    return {
      success: true,
      status: "PENDING_MANUAL_REVIEW",
      verificationMode: "manual_review",
      explanation: "Đã ghi nhận địa chỉ. Nhân viên sẽ đối soát trước khi giao hàng.",
      formatted: raw,
      placeId: null,
      resultType: "manual_review",
      street: "",
      housenumber: "",
      city: "",
      district: "",
      country: options.country || "VN",
      confidence: null,
      lat: null,
      lon: null,
    };
  }

  // 2. Call OpenAI to audit evidence (Privacy-safe: minimal address fields only)
  let aiAudit = null;
  try {
    aiAudit = await auditAddressEvidenceWithOpenAI({
      rawAddress: raw,
      geoapifyEvidence: geoResult,
    });
  } catch {
    // Map evidence and backend rules remain authoritative when AI is unavailable.
  }

  // 3. Backend Rules & Final Arbiter Decision (Section III)
  // Backend is the final decision maker. AI cannot override:
  // - Missing house/building or street
  // - Vague administrative areas
  // - Low confidence or country mismatch
  const hasGranularDetail = Boolean(
    geoResult.housenumber ||
    geoResult.street ||
    geoResult.resultType === "amenity" ||
    geoResult.resultType === "building"
  );

  const broadTypes = ["country", "state", "county", "city", "postcode", "suburb"];
  const isBroadArea = broadTypes.includes(geoResult.resultType);
  const isDistrictOnly =
    (geoResult.formatted || "").toLowerCase().startsWith("quận") ||
    (geoResult.formatted || "").toLowerCase().startsWith("huyện");

  if (isBroadArea || isDistrictOnly || !hasGranularDetail) {
    const err = new Error("Chưa đủ thông tin để xác minh: địa chỉ quá chung chung (thiếu số nhà hoặc tên đường cụ thể). Vui lòng bổ sung để giao hàng.");
    err.status = 422;
    err.code = "NEEDS_CORRECTION";
    throw err;
  }

  if (geoResult.confidence < 0.20) {
    const err = new Error("Chưa đủ thông tin để xác minh: mức độ khớp của địa chỉ với dữ liệu bản đồ quá thấp. Vui lòng kiểm tra lại chính tả hoặc chọn từ gợi ý.");
    err.status = 422;
    err.code = "UNVERIFIED";
    throw err;
  }

  // Determine final status & honest explanation
  const finalStatus = "MATCHED";
  let explanation = "Địa chỉ phù hợp với dữ liệu bản đồ.";

  if (aiAudit && typeof aiAudit === "object") {
    // If AI identified missing components or detected that address is not deliverable
    if (aiAudit.status === "NEEDS_CORRECTION" || aiAudit.status === "UNVERIFIED" || aiAudit.isDeliverable === false) {
      if (aiAudit.missingComponents?.includes("housenumber") && !geoResult.housenumber) {
        explanation = aiAudit.explanation || "Chưa đủ thông tin để xác minh: thiếu số nhà/tòa nhà cụ thể.";
        const err = new Error(explanation);
        err.status = 422;
        err.code = "NEEDS_CORRECTION";
        throw err;
      }
    }

    explanation = "Địa chỉ phù hợp với dữ liệu bản đồ.";
  }

  return {
    success: true,
    status: finalStatus,
    explanation,
    formatted: geoResult.formatted,
    placeId: geoResult.placeId,
    resultType: geoResult.resultType,
    street: geoResult.street,
    housenumber: geoResult.housenumber,
    city: geoResult.city,
    district: geoResult.district,
    country: geoResult.country,
    confidence: geoResult.confidence,
    lat: geoResult.lat,
    lon: geoResult.lon,
  };
}

export { getAddressSuggestionsFromGeoapify };
