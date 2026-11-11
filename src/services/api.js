/**
 * Maison Rue Centralized API Client
 * Sends requests with credentials: 'include' for HttpOnly cookie authentication.
 */

const API_BASE = "/api";

async function request(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  const response = await fetch(url, {
    ...options,
    headers,
    cache: options.cache || "no-store",
    credentials: "include", // Ensures HttpOnly cookie is attached
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorMsg = data.error || `Request failed (Error ${response.status})`;
    const error = new Error(errorMsg);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

export const authAPI = {
  customerLogin: (email, password) =>
    request("/auth/customer/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  staffLogin: (email, password) =>
    request("/auth/staff/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  adminLogin: (email, password) =>
    request("/auth/admin/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  registerCustomer: (payload) =>
    request("/auth/register", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  logout: () =>
    request("/auth/logout", {
      method: "POST",
    }),

  getMe: () => request("/auth/me"),
};
export const customerAPI = {
  getAccount: () => request("/customer/account"),
  getAddressSuggestions: (input, country) => request(`/customer/address-suggestions?input=${encodeURIComponent(input)}&country=${encodeURIComponent(country)}`),
  verifyAddress: (address, country = "VN") => request("/customer/verify-address", { method: "POST", body: JSON.stringify({ address, country }) }),
  addAddress: (address, isDefault = false) => request("/customer/addresses", { method: "POST", body: JSON.stringify({ address, isDefault }) }), updateAddress: (id, address, isDefault = false) => request(`/customer/addresses/${id}`, { method: "PATCH", body: JSON.stringify({ address, isDefault }) }), deleteAddress: (id) => request(`/customer/addresses/${id}`, { method: "DELETE" }), updatePreferences: (marketingEmail) => request("/customer/preferences", { method: "PATCH", body: JSON.stringify({ marketingEmail }) }), updateProfile: (payload) => request("/customer/profile", { method: "PATCH", body: JSON.stringify(payload) }), getFavorites: () => request("/customer/favorites"), setFavorite: (productId, active) => request(`/customer/favorites/${productId}`, { method: "PUT", body: JSON.stringify({ active }) }), getMyReviewEligibility: () => request("/customer/reviews"), getReviewEligibility: (productId) => request(`/customer/reviews/${productId}/eligibility`), saveReview: (productId, payload) => request(`/customer/reviews/${productId}`, { method: "PUT", body: JSON.stringify(payload) }), deleteReview: (productId) => request(`/customer/reviews/${productId}`, { method: "DELETE" }), getCart: () => request("/customer/cart"), saveCart: (items, mode = "replace") => request("/customer/cart", { method: "PUT", body: JSON.stringify({ items, mode }) }), clearCart: () => request("/customer/cart", { method: "DELETE" }) };

export const engagementAPI = {
  getReviews: (productId) => request(`/engagement/products/${productId}/reviews`),
};

export const reviewOperationsAPI = {
  getAll: () => request("/review-operations"),
  saveReply: (reviewId, content) => request(`/review-operations/${reviewId}/reply`, { method: "PUT", body: JSON.stringify({ content }) }),
  removeReply: (reviewId) => request(`/review-operations/${reviewId}/reply`, { method: "DELETE" }),
};

export const promotionAPI = {
  preview: (items, code = "", shippingFee = 0) => request("/promotions/preview", { method: "POST", body: JSON.stringify({ items, code, shippingFee }) }),
  getCatalogPrices: () => request("/promotions/catalog-prices"),
  getCampaigns: () => request("/promotions/campaigns"),
  getMyOffers: () => request("/promotions/my-offers"),
  getAll: () => request("/promotions/admin"),
    getSuggestions: (refresh = false) => request(`/promotions/admin/suggestions${refresh ? "?refresh=1" : ""}`),
  getTemplates: () => request("/promotions/admin/templates"),
  createTemplate: (payload) => request("/promotions/admin/templates", { method: "POST", body: JSON.stringify(payload) }),
  simulate: (payload) => request("/promotions/admin/simulate", { method: "POST", body: JSON.stringify(payload) }),
  create: (payload) => request("/promotions/admin", { method: "POST", body: JSON.stringify(payload) }),
  update: (id, payload) => request(`/promotions/admin/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  setStatus: (id, status) => request(`/promotions/admin/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),
  approve: (id, status, note = "") => request(`/promotions/admin/${id}/approval`, { method: "PATCH", body: JSON.stringify({ status, note }) }),
  archive: (id) => request(`/promotions/admin/${id}`, { method: "DELETE" }),
  report: () => request("/promotions/admin-report"),
};

export const productsAPI = {
  getAll: () => request("/products"),
  getById: (id) => request(`/products/${id}`),
  getAllAdmin: () => request("/products/admin/all"),
  createProductAdmin: (payload) => request("/products/admin", { method: "POST", body: JSON.stringify(payload) }),
  updateProductAdmin: (id, payload) => request(`/products/admin/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  softDeleteProductAdmin: (id, reason) => request(`/products/admin/${id}`, { method: "DELETE", body: JSON.stringify({ reason }) }),
  restoreProductAdmin: (id) => request(`/products/admin/${id}/restore`, { method: "POST" }),

  createVariantAdmin: (productId, payload) => request(`/products/admin/${productId}/variants`, { method: "POST", body: JSON.stringify(payload) }),
  updateVariantAdmin: (productId, variantId, payload) => request(`/products/admin/${productId}/variants/${encodeURIComponent(variantId)}`, { method: "PUT", body: JSON.stringify(payload) }),
  softDeleteVariantAdmin: (productId, variantId, reason) => request(`/products/admin/${productId}/variants/${encodeURIComponent(variantId)}`, { method: "DELETE", body: JSON.stringify({ reason }) }),
  restoreVariantAdmin: (productId, variantId) => request(`/products/admin/${productId}/variants/${encodeURIComponent(variantId)}/restore`, { method: "POST" }),

  updateStock: (id, stock, note) =>
    request(`/products/${id}/stock`, {
      method: "PATCH",
      body: JSON.stringify({ stock, note }),
    }),
  updateVariantStock: (id, variantId, stock, minStock, maxStock, note) =>
    request(`/products/${id}/variants/${encodeURIComponent(variantId)}/stock`, {
      method: "PATCH",
      body: JSON.stringify({ stock, minStock, maxStock, note }),
    }),
  updateVariantPricing: (id, variantId, costPrice, floorPrice) => request(`/products/${id}/variants/${encodeURIComponent(variantId)}/pricing`, { method: "PATCH", body: JSON.stringify({ costPrice, floorPrice }) }),
  getMovements: (productId) =>
    request(`/products/inventory/movements${productId ? `?productId=${productId}` : ""}`),
};

export const ordersAPI = {
  getAll: () => request("/orders"),
  getById: (id) => request(`/orders/${id}`),
  create: (orderPayload) =>
    request("/orders", {
      method: "POST",
      body: JSON.stringify(orderPayload),
    }),
  updateStatus: (id, status, note) =>
    request(`/orders/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status, note }),
    }),
  cancel: (id, note) =>
    request(`/orders/${id}/cancel`, {
      method: "POST",
      body: JSON.stringify({ note }),
    }),
  confirmPayment: (id, { transactionReference, note } = {}) =>
    request(`/orders/${id}/payment/confirm`, {
      method: "POST",
      body: JSON.stringify({ transactionReference, note }),
    }),
  processRefund: (id, { refundReference, note } = {}) =>
    request(`/orders/${id}/payment/refund`, {
      method: "POST",
      body: JSON.stringify({ refundReference, note }),
    }),
};

export const returnsAPI = {
  getAll: () => request("/returns"),
  getExchangeOptions: (orderId, orderItemId) => request(`/returns/orders/${encodeURIComponent(orderId)}/items/${encodeURIComponent(orderItemId)}/exchange-options`),
  submit: (payload) => request("/returns", { method: "POST", body: JSON.stringify(payload) }),
  update: (id, payload) => request(`/returns/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(payload) }),
};

export const chatAPI = {
  sendMessage: (message, history = []) =>
    request("/chat", {
      method: "POST",
      body: JSON.stringify({ message, history }),
    }),
};

export const employeeAPI = {
  getAll: () => request("/admin/employees"),
  create: (payload) =>
    request("/admin/employees", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  update: (id, payload) =>
    request(`/admin/employees/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  toggleStatus: (id) =>
    request(`/admin/employees/${id}/status`, {
      method: "PATCH",
    }),
};

export const reportAPI = {
  getRevenue: (filters = {}) => {
    const params = new URLSearchParams(Object.entries(filters).filter(([, value]) => value));
    return request(`/admin/reports/revenue${params.size ? `?${params.toString()}` : ""}`);
  },
  updateRevenueTarget: (payload) => request("/admin/reports/revenue/target", { method: "PUT", body: JSON.stringify(payload) }),
  getProductInsights: () => request("/admin/reports/product-insights"),
  getWishlistAnalytics: () => request("/admin/reports/wishlist"),
  getReviews: () => request("/admin/reports/reviews"),
  auditReviewsNow: () => request("/admin/reports/reviews/audit-now", { method: "POST" }),
  getReviewAuditRuns: () => request("/admin/reports/reviews/audit-runs"),
  getReviewAuditRunById: (runId) => request(`/admin/reports/reviews/audit-runs/${runId}`),
  decideReview: (id, payload) => request(`/admin/reports/reviews/${id}/decision`, { method: "PATCH", body: JSON.stringify(payload) }),
  bulkDecideReviews: (payload) => request("/admin/reports/reviews/bulk-decision", { method: "POST", body: JSON.stringify(payload) }),
  getReviewHistory: (reviewId) => request(`/admin/reports/reviews/history${reviewId ? `?reviewId=${reviewId}` : ""}`),
  moderateReview: (id, payload) => request(`/admin/reports/reviews/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
};

