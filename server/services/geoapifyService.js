import dotenv from "dotenv";
dotenv.config();

/**
 * MAISON RUE — Geoapify Geocoding & Address Verification Service
 * 
 * Replaces legacy Google Maps integration with Geoapify.
 * Enforces strict address quality checks:
 * - Granular house/building/street level validation (having coordinates is NOT enough)
 * - Supported delivery area restriction (Vietnam / country matching)
 * - Low confidence, ambiguous, or incomplete addresses are rejected with HTTP 422
 * - Service outages or network errors return HTTP 502/503 for safe retry
 * - Geoapify API key is strictly maintained server-side and never leaked in logs/payloads
 */

function normalizeVNAddress(rawAddress) {
  if (!rawAddress || typeof rawAddress !== "string") return "";
  let clean = rawAddress.trim();

  // Normalize common city abbreviations
  clean = clean.replace(/\bTP\.?\s*HCM\b/gi, "Thành phố Hồ Chí Minh");
  clean = clean.replace(/\bTPHCM\b/gi, "Thành phố Hồ Chí Minh");
  clean = clean.replace(/\bTP\.?\s*Hà Nội\b/gi, "Thành phố Hà Nội");
  clean = clean.replace(/\bTP\.?\s*Đà Nẵng\b/gi, "Thành phố Đà Nẵng");

  // Normalize common district & ward abbreviations with dots
  clean = clean.replace(/(?:^|[\s,])Q\.\s*(\d+)\b/gi, ", Quận $1");
  clean = clean.replace(/(?:^|[\s,])Q\.\s*([A-Za-zÀ-ỹ]+)\b/gi, ", Quận $1");
  clean = clean.replace(/(?:^|[\s,])P\.\s*(\d+)\b/gi, ", Phường $1");
  clean = clean.replace(/(?:^|[\s,])P\.\s*([A-Za-zÀ-ỹ]+)\b/gi, ", Phường $1");

  return clean
    .replace(/,\s*,+/g, ",")
    .replace(/^\s*,\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Verify delivery address with Geoapify Geocoding Search API
 * @param {string} address - Raw address text entered by customer
 * @param {object} options - Optional country filter & settings
 */
export async function verifyAddressWithGeoapify(address, options = {}) {
  const apiKey = process.env.GEOAPIFY_API_KEY;
  if (!apiKey) {
    const err = new Error("Hệ thống xác thực địa chỉ Geoapify chưa được cấu hình. Vui lòng liên hệ bộ phận hỗ trợ Maison Rue.");
    err.status = 503;
    err.code = "ADDRESS_PROVIDER_NOT_CONFIGURED";
    throw err;
  }

  const raw = String(address || "").trim();
  if (raw.length < 5) {
    const err = new Error("Địa chỉ giao nhận quá ngắn. Vui lòng nhập chi tiết số nhà, tên đường, phường/xã, quận/huyện.");
    err.status = 400;
    throw err;
  }

  const normalized = normalizeVNAddress(raw);
  const targetCountry = (options.country || "vn").toLowerCase();

  const url = new URL("https://api.geoapify.com/v1/geocode/search");
  url.searchParams.set("text", normalized);
  url.searchParams.set("apiKey", apiKey);
  url.searchParams.set("format", "json");
  url.searchParams.set("lang", "vi");
  url.searchParams.set("limit", "5");
  if (targetCountry) {
    url.searchParams.set("filter", `countrycode:${targetCountry}`);
  }

  let response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(7000) });
  } catch (netErr) {
    console.error("[Geoapify] Connection error / timeout:", netErr.message);
    const err = new Error("Không thể kết nối đến hệ thống xác thực địa chỉ Geoapify lúc này. Vui lòng thử lại sau giây lát.");
    err.status = 502;
    err.code = "ADDRESS_PROVIDER_UNAVAILABLE";
    throw err;
  }

  if (!response.ok) {
    console.error(`[Geoapify] HTTP error response: ${response.status}`);
    const err = new Error("Hệ thống xác thực địa chỉ Geoapify đang bận hoặc tạm thời gián đoạn. Vui lòng thử lại sau.");
    err.status = response.status === 401 || response.status === 403 ? 503 : 502;
    err.code = response.status === 401 || response.status === 403
      ? "ADDRESS_PROVIDER_NOT_CONFIGURED"
      : "ADDRESS_PROVIDER_UNAVAILABLE";
    throw err;
  }

  let data;
  try {
    data = await response.json();
  } catch {
    const err = new Error("Dữ liệu phản hồi từ Geoapify không hợp lệ.");
    err.status = 502;
    throw err;
  }

  let results = data.results || [];
  let best = results[0];

  // If search returns low confidence (< 0.45), missing street, or empty, fallback to autocomplete parser using raw text & cleaned variants
  const needsAutocompleteFallback = !best || ((best.rank?.confidence ?? 0) < 0.45) || (!best.street && !best.housenumber && best.result_type !== "amenity");
  if (needsAutocompleteFallback) {
    try {
      const cleanVariant = raw
        .replace(/\bTP\.?\s*HCM\b/gi, "Hồ Chí Minh")
        .replace(/\bThành phố\s+/gi, "")
        .replace(/\bTP\.?\s+/gi, "")
        .replace(/\bPhường\s+/gi, "")
        .replace(/\bP\.\s*/gi, "")
        .replace(/\bQ\.\s*/gi, "Quận ")
        .replace(/\s+/g, " ")
        .trim();

      const candidateTexts = cleanVariant !== raw ? [cleanVariant, raw] : [raw];

      for (const queryText of candidateTexts) {
        const autoUrl = new URL("https://api.geoapify.com/v1/geocode/autocomplete");
        autoUrl.searchParams.set("text", queryText);
        autoUrl.searchParams.set("apiKey", apiKey);
        autoUrl.searchParams.set("format", "json");
        autoUrl.searchParams.set("lang", "vi");
        autoUrl.searchParams.set("limit", "5");
        if (targetCountry) autoUrl.searchParams.set("filter", `countrycode:${targetCountry}`);

        const autoRes = await fetch(autoUrl, { signal: AbortSignal.timeout(5000) });
        if (autoRes.ok) {
          const autoData = await autoRes.json();
          const candidate = (autoData.results || []).find((r) => r.street || r.housenumber || r.result_type === "building" || r.result_type === "amenity");
          if (candidate && (candidate.rank?.confidence ?? 0) >= 0.20) {
            best = candidate;
            results = autoData.results;
            break;
          }
        }
      }
    } catch {
      // Continue with primary search result if autocomplete fallback fails
    }
  }

  if (!best) {
    const err = new Error("Không tìm thấy địa chỉ này trên hệ thống bản đồ Geoapify. Vui lòng kiểm tra lại số nhà, tên đường hoặc chọn từ gợi ý.");
    err.status = 422;
    throw err;
  }

  // 1. Delivery Area Check (Vietnam Only by default)
  if (best.country_code && targetCountry && best.country_code.toLowerCase() !== targetCountry) {
    const err = new Error(`Maison Rue hiện chỉ phục vụ giao hàng trong vùng quy định (${targetCountry.toUpperCase()}).`);
    err.status = 422;
    throw err;
  }

  // 2. Granularity Check: Having coordinates is NOT enough.
  // Administrative areas without street or house are considered too broad/vague.
  const broadTypes = ["country", "state", "county", "city", "postcode", "suburb"];
  const isBroadArea = broadTypes.includes(best.result_type);
  const isDistrictOnly = (best.name || "").toLowerCase().startsWith("quận") || (best.name || "").toLowerCase().startsWith("huyện");

  if (!best.street && !best.housenumber && (isBroadArea || isDistrictOnly)) {
    const err = new Error("Địa chỉ quá chung chung (chỉ có quận/huyện hoặc tỉnh/thành). Vui lòng bổ sung số nhà và tên đường chi tiết để giao hàng.");
    err.status = 422;
    throw err;
  }

  // 3. Must have an identifiable street, building, or specific amenity/venue
  const hasStreetOrVenue = Boolean(best.street || best.housenumber || best.result_type === "amenity" || best.result_type === "building");
  if (!hasStreetOrVenue) {
    const err = new Error("Địa chỉ thiếu thông tin tên đường hoặc số nhà/tòa nhà cụ thể để shipper tiếp cận.");
    err.status = 422;
    throw err;
  }

  // 4. Confidence & Match Level (Filter out fake / hallucinatory addresses)
  const confidence = best.rank?.confidence ?? 0;
  const streetConfidence = best.rank?.confidence_street_level ?? 0;

  if (confidence < 0.2 || (streetConfidence < 0.15 && !best.housenumber && best.result_type !== "amenity")) {
    const err = new Error("Mức độ khớp của địa chỉ quá thấp hoặc không tìm thấy địa chỉ thực tế. Vui lòng kiểm tra lại chính tả hoặc chọn từ gợi ý bản đồ.");
    err.status = 422;
    throw err;
  }

  return {
    success: true,
    formatted: best.formatted,
    placeId: best.place_id,
    resultType: best.result_type,
    street: best.street || "",
    housenumber: best.housenumber || "",
    city: best.city || best.state || "",
    district: best.district || best.suburb || best.county || "",
    country: best.country || "Việt Nam",
    confidence,
    lat: best.lat,
    lon: best.lon,
  };
}

/**
 * Autocomplete address suggestions using Geoapify
 * @param {string} query - Customer search query (min 3 chars)
 * @param {string} country - Country code (e.g. "VN")
 */
export async function getAddressSuggestionsFromGeoapify(query, country = "VN") {
  const apiKey = process.env.GEOAPIFY_API_KEY;
  if (!apiKey) {
    const err = new Error("Google Maps/Geoapify address suggestions are not configured.");
    err.status = 503;
    throw err;
  }

  const text = String(query || "").trim();
  if (text.length < 3) return [];

  const normalized = normalizeVNAddress(text);
  const targetCountry = (country || "vn").toLowerCase();

  const url = new URL("https://api.geoapify.com/v1/geocode/autocomplete");
  url.searchParams.set("text", normalized);
  url.searchParams.set("apiKey", apiKey);
  url.searchParams.set("format", "json");
  url.searchParams.set("lang", "vi");
  url.searchParams.set("limit", "5");
  if (targetCountry) {
    url.searchParams.set("filter", `countrycode:${targetCountry}`);
  }

  let response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(7000) });
  } catch (netErr) {
    console.error("[Geoapify Autocomplete] Connection error:", netErr.message);
    const err = new Error("Geoapify suggestions are temporarily unavailable.");
    err.status = 502;
    throw err;
  }

  if (!response.ok) {
    const err = new Error("Geoapify suggestions are temporarily unavailable.");
    err.status = 502;
    throw err;
  }

  const data = await response.json();
  const results = data.results || [];

  return results.map((item) => ({
    placeId: item.place_id || `${item.lat},${item.lon}`,
    description: item.formatted,
    street: item.street || "",
    housenumber: item.housenumber || "",
    city: item.city || item.state || "",
  }));
}
