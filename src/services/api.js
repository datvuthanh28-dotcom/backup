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
    credentials: "include", // Ensures HttpOnly cookie is attached
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorMsg = data.error || `Yêu cầu thất bại (Mã lỗi ${response.status})`;
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
export const customerAPI = { getAccount: () => request("/customer/account"), addAddress: (address, isDefault = false) => request("/customer/addresses", { method: "POST", body: JSON.stringify({ address, isDefault }) }), updateAddress: (id, address, isDefault = false) => request(`/customer/addresses/${id}`, { method: "PATCH", body: JSON.stringify({ address, isDefault }) }), deleteAddress: (id) => request(`/customer/addresses/${id}`, { method: "DELETE" }), updatePreferences: (marketingEmail) => request("/customer/preferences", { method: "PATCH", body: JSON.stringify({ marketingEmail }) }), updateProfile: (payload) => request("/customer/profile", { method: "PATCH", body: JSON.stringify(payload) }), getFavorites: () => request("/customer/favorites"), setFavorite: (productId, active) => request(`/customer/favorites/${productId}`, { method: "PUT", body: JSON.stringify({ active }) }), getReviewEligibility: (productId) => request(`/customer/reviews/${productId}/eligibility`), saveReview: (productId, payload) => request(`/customer/reviews/${productId}`, { method: "PUT", body: JSON.stringify(payload) }), deleteReview: (productId) => request(`/customer/reviews/${productId}`, { method: "DELETE" }) };

export const engagementAPI = {
  getReviews: (productId) => request(`/engagement/products/${productId}/reviews`),
};

export const productsAPI = {
  getAll: () => request("/products"),
  getById: (id) => request(`/products/${id}`),
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
  getRevenue: () => request("/admin/reports/revenue"),
  getProductInsights: () => request("/admin/reports/product-insights"),
  getReviews: () => request("/admin/reports/reviews"),
  moderateReview: (id, payload) => request(`/admin/reports/reviews/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
};

