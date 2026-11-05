import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { productsAPI, ordersAPI, promotionAPI, reportAPI } from "../services/api";
import { allProducts as staticProducts } from "../data/products";
import { useAuth } from "./AuthContext";

export const VALID_STATUS_TRANSITIONS = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["processing", "cancelled"],
  processing: ["shipping", "cancelled"],
  shipping: ["delivered"],
  delivered: [],
  cancelled: [],
};

export const STATUS_LABELS = {
  pending: { label: "Chờ xác nhận", color: "#B8860B", bg: "#FFF8DC" },
  confirmed: { label: "Đã xác nhận", color: "#1E90FF", bg: "#F0F8FF" },
  processing: { label: "Đang xử lý / Chuẩn bị", color: "#8A2BE2", bg: "#F8F0FF" },
  shipping: { label: "Đang giao hàng", color: "#D2691E", bg: "#FFF5EE" },
  delivered: { label: "Đã giao thành công", color: "#2E8B57", bg: "#F0FFF0" },
  cancelled: { label: "Đã hủy", color: "#DC143C", bg: "#FFF0F0" },
};

const StoreContext = createContext(null);

export function StoreProvider({ children }) {
  const { isAuthenticated, currentUser } = useAuth();

  const [products, setProducts] = useState(staticProducts);
  const [orders, setOrders] = useState([]);
  const [revenueReport, setRevenueReport] = useState(null);

  // Fetch Products & Stock from Backend
  const refreshProducts = useCallback(async () => {
    try {
      const [res, promotionPrices] = await Promise.all([productsAPI.getAll(), promotionAPI.getCatalogPrices().catch(() => ({ prices: {} }))]);
      if (res.success && Array.isArray(res.products) && res.products.length > 0) {
        // The approved assortment is the storefront source of truth. Ignore legacy
        // products that may still be returned by an older or unsynchronized API.
        const staticById = new Map(staticProducts.map((product) => [Number(product.id), product]));
        const approvedProducts = res.products
          .map((product) => {
            const catalogProduct = staticById.get(Number(product.id));
            if (!catalogProduct) return null;
            return {
              ...catalogProduct,
              ...product,
              audience: catalogProduct.audience,
              gender: catalogProduct.gender,
              productType: catalogProduct.productType,
              subcategory: catalogProduct.subcategory,
              promotionPrice: promotionPrices.prices?.[Number(product.id)]?.salePrice ?? Number(product.price),
              promotionDiscount: promotionPrices.prices?.[Number(product.id)]?.discount || 0,
              promotionName: promotionPrices.prices?.[Number(product.id)]?.promotionName || null,
              collection: catalogProduct.collection,
              collections: catalogProduct.collections,
              material: catalogProduct.material,
            };
          })
          .filter(Boolean);
        if (approvedProducts.length > 0) setProducts(approvedProducts);
      }
    } catch (err) {
      console.warn("[Store] Products API fetch fallback:", err.message);
    }
  }, []);

  // Fetch Orders from Backend (filtered server-side based on user role)
  const refreshOrders = useCallback(async () => {
    if (!isAuthenticated) {
      setOrders([]);
      return { success: false, orders: [], error: "Chưa đăng nhập." };
    }
    try {
      const res = await ordersAPI.getAll();
      if (res.success && Array.isArray(res.orders)) {
        setOrders(res.orders);
        return { success: true, orders: res.orders };
      }
      return { success: false, orders: [], error: res.error || "Không thể tải danh sách đơn hàng." };
    } catch (err) {
      console.warn("[Store] Orders API fetch fallback:", err.message);
      return { success: false, orders: [], error: err.message };
    }
  }, [isAuthenticated]);

  // Fetch Revenue Report from Backend (Admin only)
  const refreshRevenueReport = useCallback(async (filters = {}) => {
    if (currentUser?.role !== "admin") return;
    try {
      const res = await reportAPI.getRevenue(filters);
      if (res.success) {
        setRevenueReport(res.report);
      }
    } catch (err) {
      console.warn("[Store] Report API fetch fallback:", err.message);
    }
  }, [currentUser]);

  useEffect(() => {
    refreshProducts();
  }, [refreshProducts]);

  useEffect(() => {
    refreshOrders();
    if (currentUser?.role === "admin") {
      refreshRevenueReport();
    }
  }, [isAuthenticated, currentUser, refreshOrders, refreshRevenueReport]);

  // Helper to read stock
  const getProductStock = (productId) => {
    const p = products.find((prod) => prod.id === Number(productId));
    return p ? p.stock : 0;
  };

  // Update Stock via Backend API
  const updateProductStock = async (productId, newStock, note = "") => {
    try {
      const res = await productsAPI.updateStock(productId, newStock, note);
      if (res.success) {
        await refreshProducts();
        return { success: true, stock: res.stock };
      }
      return { success: false, error: res.error };
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  const updateVariantStock = async (productId, variantId, newStock, minStock, maxStock, note = "") => {
    try {
      const res = await productsAPI.updateVariantStock(productId, variantId, newStock, minStock, maxStock, note);
      if (res.success) {
        await refreshProducts();
        return { success: true, stock: res.stock, totalStock: res.totalStock };
      }
      return { success: false, error: res.error };
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  // Quick delta adjust
  const adjustStock = async (productId, delta) => {
    const current = getProductStock(productId);
    const updated = Math.max(0, current + delta);
    return updateProductStock(productId, updated, `Điều chỉnh nhanh: ${delta > 0 ? `+${delta}` : delta}`);
  };

  // Create Order via Backend API with SQL Transaction
  const createOrder = async ({
    customerName,
    customerEmail,
    customerPhone,
    shippingAddress,
    paymentMethod = "cod",
    items,
    notes = "",
    promotionCode = "",
  }) => {
    try {
      const payload = {
        name: customerName,
        email: customerEmail,
        phone: customerPhone,
        address: shippingAddress,
        paymentMethod,
        items,
        notes,
        promotionCode,
      };

      const res = await ordersAPI.create(payload);
      if (res.success) {
        await refreshProducts();
        await refreshOrders();
        return { success: true, order: res.order };
      }
      return { success: false, error: res.error || "Không thể tạo đơn hàng." };
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  // Update Order Status via Backend API
  const updateOrderStatus = async (orderId, newStatus, note = "") => {
    try {
      const res = await ordersAPI.updateStatus(orderId, newStatus, note);
      if (res.success) {
        await refreshOrders();
        await refreshProducts();
        if (currentUser?.role === "admin") {
          await refreshRevenueReport();
        }
        return { success: true, order: res.order };
      }
      return { success: false, error: res.error || "Không thể cập nhật trạng thái." };
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  // Cancel Order via Backend API with Stock Restoration
  const cancelOrder = async (orderId, note = "Khách hàng yêu cầu hủy đơn.") => {
    try {
      const res = await ordersAPI.cancel(orderId, note);
      if (res.success) {
        await refreshOrders();
        await refreshProducts();
        if (currentUser?.role === "admin") {
          await refreshRevenueReport();
        }
        return { success: true, order: res.order };
      }
      return { success: false, error: res.error || "Không thể hủy đơn hàng." };
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  // Confirm Payment (COD collection or Bank Transfer verification)
  const confirmOrderPayment = async (orderId, { transactionReference = "", note = "" } = {}) => {
    try {
      const res = await ordersAPI.confirmPayment(orderId, { transactionReference, note });
      if (res.success) {
        await refreshOrders();
        if (currentUser?.role === "admin") {
          await refreshRevenueReport();
        }
        return { success: true, order: res.order };
      }
      return { success: false, error: res.error || "Không thể xác nhận thanh toán." };
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  // Process Refund for paid or refund_pending orders
  const processOrderRefund = async (orderId, { refundReference = "", note = "" } = {}) => {
    try {
      const res = await ordersAPI.processRefund(orderId, { refundReference, note });
      if (res.success) {
        await refreshOrders();
        if (currentUser?.role === "admin") {
          await refreshRevenueReport();
        }
        return { success: true, order: res.order };
      }
      return { success: false, error: res.error || "Không thể xử lý hoàn tiền." };
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  // Filter orders by customer ID
  const getOrdersByCustomer = (customerId) => {
    return orders.filter((o) => o.customer_id === customerId);
  };

  // Business metrics helper
  const getBusinessMetrics = () => {
    if (revenueReport) {
      return {
        totalOrders: revenueReport.totalOrders,
        deliveredOrdersCount: revenueReport.ordersByStatus?.delivered || 0,
        inFlightOrdersCount:
          (revenueReport.ordersByStatus?.pending || 0) +
          (revenueReport.ordersByStatus?.confirmed || 0) +
          (revenueReport.ordersByStatus?.processing || 0) +
          (revenueReport.ordersByStatus?.shipping || 0),
        cancelledOrdersCount: revenueReport.ordersByStatus?.cancelled || 0,
        totalDeliveredRevenue: revenueReport.recognizedRevenue || 0,
        inFlightRevenue: revenueReport.pendingVerificationRevenue + revenueReport.unpaidRevenue || 0,
        cancelledAmount: revenueReport.refundedRevenue || 0,
        averageOrderValue: revenueReport.averageOrderValue || 0,
        categorySales: revenueReport.categorySales || { men: 0, women: 0, kids: 0 },
        topSellingProducts: revenueReport.topSellingProducts || [],
      };
    }

    // Fallback derived directly from orders in state
    const paidOrders = orders.filter((o) => o.payment?.payment_status === "paid");
    const actualRevenue = paidOrders.reduce((sum, o) => sum + (o.total_amount || o.totalAmount || 0), 0);

    return {
      totalOrders: orders.length,
      deliveredOrdersCount: orders.filter((o) => (o.order_status || o.status) === "delivered").length,
      inFlightOrdersCount: orders.filter((o) => ["pending", "confirmed", "processing", "shipping"].includes(o.order_status || o.status)).length,
      cancelledOrdersCount: orders.filter((o) => (o.order_status || o.status) === "cancelled").length,
      totalDeliveredRevenue: actualRevenue,
      inFlightRevenue: orders
        .filter((o) => o.payment?.payment_status === "pending_verification" || o.payment?.payment_status === "unpaid")
        .reduce((sum, o) => sum + (o.total_amount || o.totalAmount || 0), 0),
      cancelledAmount: orders
        .filter((o) => o.payment?.payment_status === "refunded")
        .reduce((sum, o) => sum + (o.total_amount || o.totalAmount || 0), 0),
      averageOrderValue: paidOrders.length > 0 ? Math.round(actualRevenue / paidOrders.length) : 0,
      categorySales: { men: 0, women: 0, kids: 0 },
      topSellingProducts: [],
    };
  };

  const value = {
    products,
    orders,
    revenueReport,
    getProductStock,
    updateProductStock,
    updateVariantStock,
    adjustStock,
    createOrder,
    updateOrderStatus,
    cancelOrder,
    confirmOrderPayment,
    processOrderRefund,
    getOrdersByCustomer,
    getBusinessMetrics,
    refreshProducts,
    refreshOrders,
    refreshRevenueReport,
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const context = useContext(StoreContext);
  if (!context) {
    throw new Error("useStore must be used within a StoreProvider");
  }
  return context;
}

export default StoreContext;
