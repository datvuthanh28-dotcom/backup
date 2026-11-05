import emailjs from "@emailjs/browser";

const SERVICE_ID = import.meta.env.VITE_EMAILJS_SERVICE_ID || "service_az46k1f";
const PUBLIC_KEY = import.meta.env.VITE_EMAILJS_PUBLIC_KEY || "";
const ORDER_TEMPLATE_ID = import.meta.env.VITE_EMAILJS_ORDER_TEMPLATE_ID || "template_20zssht";
const STOCK_TEMPLATE_ID = import.meta.env.VITE_EMAILJS_STOCK_TEMPLATE_ID || "template_6xhxjdo";
const ALERT_EMAILS = import.meta.env.VITE_ALERT_EMAILS || "maisonruestaff2@gmail.com,vanhung29993@gmail.com";

function formatCurrency(amount) {
  if (typeof amount !== "number") amount = Number(amount) || 0;
  return amount.toLocaleString("vi-VN") + " VNĐ";
}

function formatPaymentMethod(method) {
  switch (method?.toLowerCase()) {
    case "vnpay":
      return "VNPAY Secure Online Payment";
    case "bank_transfer":
      return "Direct Bank Transfer";
    case "cod":
    default:
      return "Cash on Delivery (COD)";
  }
}

function formatItemsList(items = []) {
  if (!Array.isArray(items) || items.length === 0) return "Item details are being updated.";
  return items
    .map((item, idx) => {
      const name = item.name || item.product_name || "Product";
      const variant = [item.selectedColor || item.color, item.selectedSize || item.size].filter(Boolean).join(" / ");
      const variantStr = variant ? ` (${variant})` : "";
      const qty = item.quantity || 1;
      const price = formatCurrency(item.price || item.unit_price || 0);
      return `${idx + 1}. ${name}${variantStr} — Qty: ${qty} — Price: ${price}`;
    })
    .join("\n");
}

/**
 * 1. Gửi email xác nhận khi khách đặt hàng thành công (English for Customer)
 */
export async function sendOrderConfirmationEmail(order) {
  if (!PUBLIC_KEY) {
    console.warn("[EmailJS] Chưa có VITE_EMAILJS_PUBLIC_KEY trong .env. Bỏ qua gửi email.");
    return { success: false, reason: "missing_public_key" };
  }

  const recipientEmail = order.customer_email || order.email || "vudat9532@gmail.com";
  const templateParams = {
    to_email: recipientEmail,
    subject: `Order Confirmation #${order.id} — Maison Rue`,
    order_id: order.id,
    order_status: "RECEIVED & PENDING",
    customer_name: order.customer_name || order.name || "Valued Customer",
    message_intro: "Thank you for shopping with Maison Rue. Your order has been successfully placed and our concierge team is currently preparing it for processing.",
    order_date: new Date().toLocaleString("en-US", { hour12: false }),
    payment_method: formatPaymentMethod(order.payment_method || order.paymentMethod),
    shipping_address: order.shipping_address || order.address || "Boutique Pick-up",
    order_items: formatItemsList(order.items),
    total_amount: formatCurrency(order.total_amount || order.totalPrice || 0),
    note: "Please review your order details above. For Cash on Delivery orders, kindly prepare the exact cash amount upon delivery.",
  };

  try {
    const res = await emailjs.send(SERVICE_ID, ORDER_TEMPLATE_ID, templateParams, { publicKey: PUBLIC_KEY });
    console.log("[EmailJS] Đã gửi email xác nhận đặt hàng thành công:", res);
    return { success: true, res };
  } catch (err) {
    console.error("[EmailJS] Lỗi gửi email xác nhận đặt hàng:", err);
    return { success: false, error: err };
  }
}

/**
 * 2. Gửi email khi đơn được xác nhận, giao hàng hoặc hủy (English for Customer)
 */
export async function sendOrderStatusEmail(order, newStatus, note = "") {
  if (!PUBLIC_KEY) {
    console.warn("[EmailJS] Chưa có VITE_EMAILJS_PUBLIC_KEY trong .env. Bỏ qua gửi email.");
    return { success: false, reason: "missing_public_key" };
  }

  const recipientEmail = order.customer_email || order.email || "vudat9532@gmail.com";
  let statusTitle = `Order Update #${order.id} — Maison Rue`;
  let statusBadge = newStatus?.toUpperCase() || "PROCESSING";
  let messageIntro = `Your order #${order.id} status has been updated to: ${newStatus}.`;

  switch (newStatus?.toLowerCase()) {
    case "confirmed":
      statusTitle = `Order #${order.id} Confirmed — Maison Rue`;
      statusBadge = "CONFIRMED";
      messageIntro = "We are pleased to inform you that your order has been confirmed and transferred to our fulfillment center for bespoke packaging.";
      break;
    case "processing":
      statusTitle = `Order #${order.id} In Preparation — Maison Rue`;
      statusBadge = "PROCESSING";
      messageIntro = "Our logistics team is currently conducting quality inspections and preparing your bespoke packaging according to Maison Rue standards.";
      break;
    case "shipping":
      statusTitle = `Order #${order.id} Out for Delivery — Maison Rue`;
      statusBadge = "IN TRANSIT";
      messageIntro = "Your package has been dispatched with our premium carrier. Please expect delivery within the next 1–2 business days.";
      break;
    case "delivered":
      statusTitle = `Order #${order.id} Delivered Successfully — Maison Rue`;
      statusBadge = "DELIVERED";
      messageIntro = "Your order has been delivered. We hope you enjoy your Maison Rue creation and look forward to serving you again.";
      break;
    case "cancelled":
      statusTitle = `Order #${order.id} Cancellation Notice — Maison Rue`;
      statusBadge = "CANCELLED";
      messageIntro = `Maison Rue regrets to inform you that order #${order.id} has been cancelled on our system. ${note ? `Reason: ${note}` : ""}`;
      break;
    default:
      break;
  }

  const templateParams = {
    to_email: recipientEmail,
    subject: statusTitle,
    order_id: order.id,
    order_status: statusBadge,
    customer_name: order.customer_name || order.name || "Valued Customer",
    message_intro: messageIntro,
    order_date: new Date().toLocaleString("en-US", { hour12: false }),
    payment_method: formatPaymentMethod(order.payment_method || order.paymentMethod),
    shipping_address: order.shipping_address || order.address || "Boutique Pick-up",
    order_items: formatItemsList(order.items),
    total_amount: formatCurrency(order.total_amount || order.totalPrice || 0),
    note: note ? `Staff note: ${note}` : "If you have any questions or require bespoke assistance, please reply directly to this email or contact our customer concierge.",
  };

  try {
    const res = await emailjs.send(SERVICE_ID, ORDER_TEMPLATE_ID, templateParams, { publicKey: PUBLIC_KEY });
    console.log(`[EmailJS] Đã gửi email cập nhật trạng thái [${newStatus}] thành công:`, res);
    return { success: true, res };
  } catch (err) {
    console.error(`[EmailJS] Lỗi gửi email trạng thái [${newStatus}]:`, err);
    return { success: false, error: err };
  }
}

/**
 * 3. Gửi cảnh báo kho cho Admin/Staff khi SKU chạm mức tối thiểu (English format)
 */
export async function sendLowStockAlertEmail({
  productName,
  sku,
  variantInfo = "",
  currentStock = 0,
  minStock = 3,
  note = "",
}) {
  if (!PUBLIC_KEY) {
    console.warn("[EmailJS] Chưa có VITE_EMAILJS_PUBLIC_KEY trong .env. Bỏ qua gửi email.");
    return { success: false, reason: "missing_public_key" };
  }

  const recipients = ALERT_EMAILS.split(",").map((e) => e.trim()).filter(Boolean);
  const alertTime = new Date().toLocaleString("en-US", { hour12: false });
  const actionNote = note || "Please inspect physical warehouse inventory and initiate replenishment or SKU transfer immediately to avoid out-of-stock disruption.";

  const results = [];
  for (const to_email of recipients) {
    const templateParams = {
      to_email,
      subject: `[INVENTORY ALERT] Low Stock for SKU: ${sku || productName}`,
      product_name: productName || "Maison Rue Item",
      sku_code: sku || "N/A",
      variant_info: variantInfo || "Standard Specification",
      current_stock: currentStock,
      min_stock: minStock,
      alert_time: alertTime,
      note: actionNote,
    };

    try {
      const res = await emailjs.send(SERVICE_ID, STOCK_TEMPLATE_ID, templateParams, { publicKey: PUBLIC_KEY });
      console.log(`[EmailJS] Đã gửi cảnh báo tồn kho tới ${to_email}:`, res);
      results.push({ email: to_email, success: true, res });
    } catch (err) {
      console.error(`[EmailJS] Lỗi gửi cảnh báo tồn kho tới ${to_email}:`, err);
      results.push({ email: to_email, success: false, error: err });
    }
  }

  return { success: results.some((r) => r.success), results };
}

