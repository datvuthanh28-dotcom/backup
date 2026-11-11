import { Resend } from "resend";
import { db } from "../config/db.js";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

let cachedApiKey = null;
let cachedResendClient = null;
let mockResendClient = null;

/**
 * Allows automated tests to inject a mock Resend client without live network calls.
 */
export function setResendClientForTesting(client) {
  mockResendClient = client || null;
}

export function resetResendClientForTesting() {
  mockResendClient = null;
}

/**
 * Escapes HTML special characters in user-supplied or dynamic text before
 * interpolating into HTML email templates.
 */
export function escapeHtml(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Strips API keys, bearer tokens, and connection secrets from error strings
 * before persisting to MSSQL or emitting concise operational logs.
 */
export function redactSecrets(input) {
  if (!input) return "";
  return String(input)
    .replace(/re_[A-Za-z0-9_]{8,}/g, "re_[REDACTED]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [REDACTED]")
    .replace(/(password|pwd|api_?key|secret|token)\s*[:=]\s*[^\s,;]+/gi, "$1=[REDACTED]");
}

export function getResendConfig() {
  const apiKey = (process.env.RESEND_API_KEY || "").trim();
  const from = (process.env.RESEND_FROM_EMAIL || "").trim();
  return { apiKey, from };
}

export function normalizeRecipients(input) {
  const rawList = Array.isArray(input)
    ? input
    : String(input || "")
        .split(",")
        .map((s) => s.trim());

  const seen = new Set();
  const valid = [];
  for (const raw of rawList) {
    const email = String(raw || "").trim();
    if (!email || !EMAIL_REGEX.test(email)) continue;
    const lower = email.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    valid.push(email);
  }
  return valid;
}

export function getAlertRecipients() {
  return normalizeRecipients(process.env.ALERT_EMAILS || "");
}

function getResendClient() {
  if (mockResendClient) return mockResendClient;
  const { apiKey } = getResendConfig();
  if (!apiKey) return null;
  if (!cachedResendClient || cachedApiKey !== apiKey) {
    cachedResendClient = new Resend(apiKey);
    cachedApiKey = apiKey;
  }
  return cachedResendClient;
}

function formatVnd(amount) {
  return `${Number(amount || 0).toLocaleString("vi-VN")} VNĐ`;
}

function formatPaymentMethod(method) {
  if (method === "vnpay") return "VNPAY Secure Online Payment";
  if (method === "bank_transfer") return "Direct Bank Transfer";
  return "Cash on Delivery (COD)";
}

function formatOrderItems(items = []) {
  if (!Array.isArray(items) || items.length === 0) {
    return {
      text: "- No item details available",
      html: `<p style="margin:0;color:#6c625b;">No item details available.</p>`,
    };
  }

  const textLines = [];
  const htmlRows = [];
  for (const item of items) {
    const name = item.name || item.product_name || "Maison Rue Item";
    const color = item.selectedColor || item.selected_color || "";
    const size = item.selectedSize || item.selected_size || "";
    const qty = Number(item.quantity || 1);
    const price = Number(item.price || item.unit_price || 0);
    const variantLabel = [color, size].filter(Boolean).join(" / ");
    textLines.push(`- ${name}${variantLabel ? ` (${variantLabel})` : ""} x${qty}: ${formatVnd(price * qty)}`);
    htmlRows.push(`
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #ede6dd;color:#1a1615;">
          <strong>${escapeHtml(name)}</strong>${variantLabel ? `<br><span style="font-size:12px;color:#6c625b;">${escapeHtml(variantLabel)}</span>` : ""}
        </td>
        <td style="padding:8px 12px;border-bottom:1px solid #ede6dd;color:#555;text-align:center;">x${qty}</td>
        <td style="padding:8px 0;border-bottom:1px solid #ede6dd;color:#1a1615;text-align:right;white-space:nowrap;">${escapeHtml(formatVnd(price * qty))}</td>
      </tr>`);
  }

  return {
    text: textLines.join("\n"),
    html: `<table style="width:100%;border-collapse:collapse;font-size:14px;">${htmlRows.join("")}</table>`,
  };
}

function wrapBrandedHtml({ headerTitle, subtitle, bodyHtml }) {
  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <title>${escapeHtml(headerTitle)}</title>
</head>
<body style="margin:0;padding:24px 12px;background:#f4f0ea;font-family:'Helvetica Neue',Arial,sans-serif;color:#1a1615;line-height:1.6;">
  <div style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #e6dfd5;">
    <div style="background:#1a1615;color:#ffffff;padding:28px 32px;text-align:center;border-bottom:2px solid #d4af37;">
      <div style="font-family:Georgia,serif;font-size:22px;letter-spacing:0.28em;text-transform:uppercase;color:#d4af37;">MAISON RUE</div>
      <div style="font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#d7cec4;margin-top:6px;">${escapeHtml(subtitle)}</div>
    </div>
    <div style="padding:30px 32px;">
      ${bodyHtml}
    </div>
    <div style="padding:18px 32px;background:#faf8f5;border-top:1px solid #ece5dc;font-size:12px;color:#7a7068;text-align:center;">
      MAISON RUE Luxury Atelier &bull; Email tự động từ hệ thống đơn hàng &amp; CSKH.<br/>
      Vui lòng giữ lại mã đơn hàng hoặc mã yêu cầu để tra cứu trực tiếp trên website.
    </div>
  </div>
</body>
</html>`;
}

/**
 * Dispatches an email through Resend with MSSQL-backed idempotency locking
 * and Resend idempotencyKey protection. Never throws to callers.
 */
export async function dispatchResendEmail({
  eventKey,
  eventType,
  entityType,
  entityId,
  recipients,
  subject,
  html,
  text,
  meta = null,
  allowRetry = false,
}) {
  const normalizedRecipients = normalizeRecipients(recipients);
  const recipientSummary = normalizedRecipients.length > 0 ? normalizedRecipients.join(",") : "(none)";
  const metaJson = meta ? JSON.stringify(meta) : null;

  let reservation;
  try {
    reservation = await db.reserveEmailNotification({
      eventKey,
      eventType,
      entityType,
      entityId,
      recipientEmail: recipientSummary,
      subject,
      provider: "resend",
      metaJson,
      allowRetry,
    });
  } catch (dbErr) {
    const safeErr = redactSecrets(dbErr?.message || String(dbErr));
    console.warn(`[Email] Failed to reserve ledger for ${eventKey}: ${safeErr}`);
    return { success: false, error: safeErr };
  }

  if (!reservation?.reserved) {
    return {
      success: reservation?.notification?.status === "sent",
      skipped: true,
      duplicate: true,
      reason: reservation?.reason || "already_exists",
      notification: reservation?.notification || null,
    };
  }

  const notification = reservation.notification;

  if (normalizedRecipients.length === 0) {
    const msg = "No valid recipient email available";
    const updated = await db.markEmailNotificationResult(notification.id, {
      status: "failed",
      errorMessage: msg,
    });
    console.warn(`[Email] Skipped ${eventType} (${eventKey}): ${msg}`);
    return { success: false, error: msg, notification: updated };
  }

  // Prevent test runs against MaisonRueDB_Test from hitting the live Resend API unless mocked or opted in.
  if (!mockResendClient && process.env.DB_NAME === "MaisonRueDB_Test" && process.env.RESEND_ALLOW_TEST_DB !== "true") {
    const msg = "Skipped live Resend call during MaisonRueDB_Test run";
    const updated = await db.markEmailNotificationResult(notification.id, {
      status: "skipped",
      errorMessage: msg,
    });
    return { success: true, skipped: true, reason: "test_db_disabled", notification: updated };
  }

  const { apiKey, from } = getResendConfig();
  const effectiveFrom = from || (mockResendClient ? "MAISON RUE <onboarding@resend.dev>" : "");
  const client = getResendClient();

  if (!client || (!mockResendClient && !apiKey) || !effectiveFrom) {
    const missing = !apiKey && !mockResendClient ? "RESEND_API_KEY" : "RESEND_FROM_EMAIL";
    const msg = `Resend configuration missing: ${missing}`;
    const updated = await db.markEmailNotificationResult(notification.id, {
      status: "failed",
      errorMessage: msg,
    });
    console.warn(`[Email] Not sent ${eventType} (${eventKey}): ${msg}`);
    return { success: false, error: msg, notification: updated };
  }

  const idempotencyKey =
    Number(notification.attempts || 1) > 1
      ? `${eventKey}:attempt-${notification.attempts}`.slice(0, 250)
      : String(eventKey).slice(0, 250);

  try {
    const result = await client.emails.send(
      {
        from: effectiveFrom,
        to: normalizedRecipients,
        subject,
        html,
        text,
      },
      { idempotencyKey }
    );

    if (result?.error) {
      const errMsg = redactSecrets(result.error.message || JSON.stringify(result.error));
      const updated = await db.markEmailNotificationResult(notification.id, {
        status: "failed",
        errorMessage: errMsg,
      });
      console.warn(`[Email] Provider rejected ${eventType} (${eventKey}): ${errMsg}`);
      return { success: false, error: errMsg, notification: updated };
    }

    const messageId = result?.data?.id || null;
    const updated = await db.markEmailNotificationResult(notification.id, {
      status: "sent",
      providerMessageId: messageId,
      errorMessage: null,
    });
    console.log(`[Email] Sent ${eventType} (${eventKey}) id=${messageId || "ok"}`);
    return { success: true, messageId, notification: updated };
  } catch (err) {
    const errMsg = redactSecrets(err?.message || String(err));
    const updated = await db.markEmailNotificationResult(notification.id, {
      status: "failed",
      errorMessage: errMsg,
    });
    console.warn(`[Email] Exception sending ${eventType} (${eventKey}): ${errMsg}`);
    return { success: false, error: errMsg, notification: updated };
  }
}

export async function sendOrderConfirmationEmail(order, options = {}) {
  if (!order?.id) return { success: false, skipped: true, reason: "missing_order" };

  const orderId = String(order.id);
  const customerName = order.customer_name || "Valued Customer";
  const paymentMethod = order.payment_method || order.payment?.payment_method || "cod";
  const shippingPhone = order.shipping_phone || order.customer_phone || "N/A";
  const shippingAddress = order.shipping_address || "N/A";
  const shippingFee = Number(order.shipping_fee || 0);
  const discountAmount = Number(order.discount_amount || 0);
  const totalAmount = Number(order.total_amount || 0);
  const itemsBlock = formatOrderItems(order.items);

  const subject = `[Maison Rue] Order Confirmation #${orderId}`;
  const html = wrapBrandedHtml({
    headerTitle: "Order Confirmation",
    subtitle: "Order Confirmation",
    bodyHtml: `
      <p style="margin-top:0;">Kính chào <strong>${escapeHtml(customerName)}</strong>,</p>
      <p>Cảm ơn Quý khách đã đặt hàng tại <strong>MAISON RUE</strong>. Đơn hàng của Quý khách đã được hệ thống ghi nhận thành công.</p>
      <div style="background:#faf8f5;border:1px solid #ede6dd;padding:18px 20px;margin:20px 0;">
        <p style="margin:0 0 6px;"><strong>Mã đơn hàng:</strong> ${escapeHtml(orderId)}</p>
        <p style="margin:0 0 6px;"><strong>Phương thức thanh toán:</strong> ${escapeHtml(formatPaymentMethod(paymentMethod))}</p>
        <p style="margin:0 0 6px;"><strong>Địa chỉ giao hàng:</strong> ${escapeHtml(shippingAddress)}</p>
        <p style="margin:0;"><strong>Số điện thoại nhận hàng:</strong> ${escapeHtml(shippingPhone)}</p>
      </div>
      <h3 style="font-size:14px;letter-spacing:0.08em;text-transform:uppercase;color:#6c625b;margin:22px 0 10px;">Chi tiết sản phẩm</h3>
      ${itemsBlock.html}
      <div style="margin-top:16px;padding-top:14px;border-top:2px solid #1a1615;font-size:14px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span>Phí vận chuyển:</span><strong>${escapeHtml(formatVnd(shippingFee))}</strong></div>
        ${discountAmount > 0 ? `<div style="display:flex;justify-content:space-between;margin-bottom:4px;color:#7c5b2b;"><span>Giảm giá:</span><strong>-${escapeHtml(formatVnd(discountAmount))}</strong></div>` : ""}
        <div style="display:flex;justify-content:space-between;font-size:16px;margin-top:8px;"><span>Tổng thanh toán:</span><strong>${escapeHtml(formatVnd(totalAmount))}</strong></div>
      </div>
    `,
  });

  const text = [
    `MAISON RUE — XAC NHAN DON HANG #${orderId}`,
    ``,
    `Kinh chao ${customerName},`,
    `Don hang #${orderId} cua Quy khach da duoc he thong ghi nhan.`,
    `Phuong thuc thanh toan: ${formatPaymentMethod(paymentMethod)}`,
    `Dia chi giao hang: ${shippingAddress}`,
    `So dien thoai: ${shippingPhone}`,
    ``,
    `Chi tiet san pham:`,
    itemsBlock.text,
    ``,
    `Phi van chuyen: ${formatVnd(shippingFee)}`,
    discountAmount > 0 ? `Giam gia: -${formatVnd(discountAmount)}` : null,
    `Tong thanh toan: ${formatVnd(totalAmount)}`,
  ]
    .filter(Boolean)
    .join("\n");

  return dispatchResendEmail({
    eventKey: options.eventKey || `order-confirmation:${orderId}`,
    eventType: "order_confirmation",
    entityType: "order",
    entityId: orderId,
    recipients: [order.customer_email],
    subject,
    html,
    text,
    allowRetry: Boolean(options.allowRetry),
  });
}

const ORDER_STATUS_CONFIG = {
  confirmed: {
    subjectPrefix: "Order Confirmed",
    badge: "CONFIRMED",
    headline: "Your order has been verified and confirmed by Maison Rue Concierge.",
    accent: "#2d5a3d",
  },
  processing: {
    subjectPrefix: "Atelier Preparing Your Order",
    badge: "PROCESSING",
    headline: "Your pieces are currently being prepared, inspected, and luxury packaged.",
    accent: "#7c5b2b",
  },
  shipping: {
    subjectPrefix: "Order Dispatched",
    badge: "IN TRANSIT",
    headline: "Your order is out for delivery with our premium courier partner.",
    accent: "#1d4e89",
  },
  delivered: {
    subjectPrefix: "Order Delivered",
    badge: "DELIVERED",
    headline: "Your order has been delivered successfully. Thank you for choosing Maison Rue.",
    accent: "#2d5a3d",
  },
  cancelled: {
    subjectPrefix: "Order Cancelled",
    badge: "CANCELLED",
    headline: "Your order has been cancelled as requested.",
    accent: "#8c2d2d",
  },
};

export async function sendOrderStatusEmail(order, newStatus, note = "", options = {}) {
  const cfg = ORDER_STATUS_CONFIG[newStatus];
  if (!order?.id || !cfg) {
    return { success: false, skipped: true, reason: "unsupported_status" };
  }

  const orderId = String(order.id);
  const customerName = order.customer_name || "Valued Customer";
  const cleanNote = String(note || "").trim();
  const totalAmount = formatVnd(order.total_amount || 0);
  const itemsBlock = formatOrderItems(order.items);

  const subject = `[Maison Rue] ${cfg.subjectPrefix} - Order #${orderId}`;
  const html = wrapBrandedHtml({
    headerTitle: cfg.subjectPrefix,
    subtitle: `Order Status • ${cfg.badge}`,
    bodyHtml: `
      <div style="display:inline-block;padding:4px 10px;background:${cfg.accent};color:#ffffff;font-size:11px;letter-spacing:0.1em;font-weight:700;margin-bottom:14px;">${escapeHtml(cfg.badge)}</div>
      <p style="margin-top:0;">Kính chào <strong>${escapeHtml(customerName)}</strong>,</p>
      <p>${escapeHtml(cfg.headline)}</p>
      <div style="background:#faf8f5;border:1px solid #ede6dd;padding:16px 20px;margin:18px 0;">
        <p style="margin:0 0 6px;"><strong>Mã đơn hàng:</strong> ${escapeHtml(orderId)}</p>
        <p style="margin:0 0 6px;"><strong>Trạng thái hiện tại:</strong> ${escapeHtml(cfg.badge)}</p>
        <p style="margin:0 0 6px;"><strong>Giá trị đơn hàng:</strong> ${escapeHtml(totalAmount)}</p>
        ${cleanNote ? `<p style="margin:8px 0 0;"><strong>Ghi chú vận hành:</strong> ${escapeHtml(cleanNote)}</p>` : ""}
      </div>
      ${itemsBlock.html}
    `,
  });

  const text = [
    `MAISON RUE — ${cfg.subjectPrefix} (#${orderId})`,
    ``,
    `Kinh chao ${customerName},`,
    cfg.headline,
    `Trang thai: ${cfg.badge}`,
    `Gia tri don hang: ${totalAmount}`,
    cleanNote ? `Ghi chu: ${cleanNote}` : null,
    ``,
    itemsBlock.text,
  ]
    .filter(Boolean)
    .join("\n");

  return dispatchResendEmail({
    eventKey: options.eventKey || `order-status:${orderId}:${newStatus}`,
    eventType: "order_status",
    entityType: "order",
    entityId: orderId,
    recipients: [order.customer_email],
    subject,
    html,
    text,
    meta: { status: newStatus, note: cleanNote },
    allowRetry: Boolean(options.allowRetry),
  });
}

export async function sendOrderRefundedEmail(order, note = "", options = {}) {
  const paymentStatus = order?.payment?.payment_status || order?.payment_status;
  if (!order?.id || paymentStatus !== "refunded") {
    return { success: false, skipped: true, reason: "order_not_refunded" };
  }

  const orderId = String(order.id);
  const customerName = order.customer_name || "Valued Customer";
  const refundRef = order.payment?.refund_reference || order.refund_reference || "N/A";
  const cleanNote = String(note || "").trim();
  const amount = formatVnd(order.total_amount || 0);

  const subject = `[Maison Rue] Refund Completed - Order #${orderId}`;
  const html = wrapBrandedHtml({
    headerTitle: "Refund Completed",
    subtitle: "Financial Refund Confirmation",
    bodyHtml: `
      <p style="margin-top:0;">Kính chào <strong>${escapeHtml(customerName)}</strong>,</p>
      <p>Hệ thống tài chính của <strong>MAISON RUE</strong> xác nhận đã <strong>hoàn tiền thành công</strong> cho đơn hàng <strong>#${escapeHtml(orderId)}</strong>.</p>
      <div style="background:#faf8f5;border:1px solid #ede6dd;padding:18px 20px;margin:18px 0;">
        <p style="margin:0 0 6px;"><strong>Mã đơn hàng:</strong> ${escapeHtml(orderId)}</p>
        <p style="margin:0 0 6px;"><strong>Số tiền hoàn lại:</strong> ${escapeHtml(amount)}</p>
        <p style="margin:0 0 6px;"><strong>Mã giao dịch hoàn tiền:</strong> ${escapeHtml(refundRef)}</p>
        ${cleanNote ? `<p style="margin:6px 0 0;"><strong>Ghi chú:</strong> ${escapeHtml(cleanNote)}</p>` : ""}
      </div>
      <p style="font-size:13px;color:#555;">Khoản tiền sẽ hiển thị về phương thức thanh toán ban đầu của Quý khách trong vòng 3–5 ngày làm việc tùy ngân hàng phát hành.</p>
    `,
  });

  const text = [
    `MAISON RUE — DA HOAN TIEN DON HANG #${orderId}`,
    ``,
    `Kinh chao ${customerName},`,
    `He thong MAISON RUE xac nhan da hoan tien thanh cong cho don hang #${orderId}.`,
    `So tien hoan: ${amount}`,
    `Ma giao dich hoan tien: ${refundRef}`,
    cleanNote ? `Ghi chu: ${cleanNote}` : null,
    `Khoan tien se ve trong 3-5 ngay lam viec tuy ngan hang.`,
  ]
    .filter(Boolean)
    .join("\n");

  return dispatchResendEmail({
    eventKey: options.eventKey || `order-refunded:${orderId}`,
    eventType: "order_refunded",
    entityType: "order",
    entityId: orderId,
    recipients: [order.customer_email],
    subject,
    html,
    text,
    meta: { note: cleanNote, refundReference: refundRef },
    allowRetry: Boolean(options.allowRetry),
  });
}

export async function sendLowStockAlertEmail(alertItem, options = {}) {
  const recipients = getAlertRecipients();
  const sku = String(alertItem?.sku || alertItem?.productCode || "UNKNOWN").trim();
  const productName = alertItem?.productName || "Maison Rue Product";
  const variantInfo = alertItem?.variantInfo || "";
  const currentStock = Number(alertItem?.currentStock ?? 0);
  const minStock = Number(alertItem?.minStock ?? 0);
  const note = String(alertItem?.note || "").trim();
  const contextKey = options.contextKey || `stock:${sku}:${currentStock}:${minStock}`;
  const entityId = String(alertItem?.variantId || sku);

  if (recipients.length === 0) {
    console.warn("[Email] Low stock alert skipped: ALERT_EMAILS is not configured.");
    return { success: false, skipped: true, reason: "no_alert_recipients" };
  }

  const subject = `[INVENTORY ALERT] Low Stock for SKU: ${sku}`;
  const html = wrapBrandedHtml({
    headerTitle: "Low Stock Alert",
    subtitle: "Inventory Operations Notification",
    bodyHtml: `
      <p style="margin-top:0;">Hệ thống kho vận <strong>MAISON RUE</strong> ghi nhận SKU dưới mức tồn tối thiểu:</p>
      <div style="background:#fff6f4;border:1px solid #e6c6bf;padding:18px 20px;margin:18px 0;">
        <p style="margin:0 0 6px;"><strong>Sản phẩm:</strong> ${escapeHtml(productName)}</p>
        <p style="margin:0 0 6px;"><strong>SKU:</strong> ${escapeHtml(sku)}</p>
        ${variantInfo ? `<p style="margin:0 0 6px;"><strong>Biến thể:</strong> ${escapeHtml(variantInfo)}</p>` : ""}
        <p style="margin:0 0 6px;"><strong>Tồn kho hiện tại:</strong> <strong style="color:#8c2d2d;">${currentStock}</strong></p>
        <p style="margin:0 0 6px;"><strong>Ngưỡng cảnh báo tối thiểu:</strong> ${minStock}</p>
        ${note ? `<p style="margin:8px 0 0;"><strong>Ghi chú:</strong> ${escapeHtml(note)}</p>` : ""}
      </div>
      <p style="font-size:13px;color:#555;">Vui lòng kiểm tra kho và lập kế hoạch nhập bổ sung kịp thời.</p>
    `,
  });

  const text = [
    `MAISON RUE INVENTORY ALERT`,
    `Product: ${productName}`,
    `SKU: ${sku}`,
    variantInfo ? `Variant: ${variantInfo}` : null,
    `Current Stock: ${currentStock}`,
    `Minimum Threshold: ${minStock}`,
    note ? `Note: ${note}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return dispatchResendEmail({
    eventKey: options.eventKey || `low-stock:${contextKey}`,
    eventType: "low_stock_alert",
    entityType: "variant",
    entityId,
    recipients,
    subject,
    html,
    text,
    meta: { sku, productName, variantInfo, currentStock, minStock, note },
    allowRetry: Boolean(options.allowRetry),
  });
}

export async function sendReturnAuthorizedEmail(returnReq, options = {}) {
  if (!returnReq?.id || returnReq.status !== "return_authorized") {
    return { success: false, skipped: true, reason: "return_not_authorized" };
  }

  const returnId = String(returnReq.id);
  const customerName = returnReq.customer_name || "Quý khách";
  const deadlineText = returnReq.return_deadline
    ? new Date(returnReq.return_deadline).toLocaleDateString("vi-VN")
    : "trong 7 ngày tới";
  const variantText = [returnReq.selected_color, returnReq.selected_size].filter(Boolean).join(" - ");

  const subject = `[Maison Rue] Xác nhận chấp thuận yêu cầu đổi/trả #${returnId}`;
  const html = wrapBrandedHtml({
    headerTitle: "Yêu cầu đổi/trả đã được chấp thuận",
    subtitle: "Return Authorization Approved",
    bodyHtml: `
      <p style="margin-top:0;">Kính chào <strong>${escapeHtml(customerName)}</strong>,</p>
      <p>Yêu cầu đổi/trả hàng <strong>#${escapeHtml(returnId)}</strong> thuộc đơn hàng <strong>#${escapeHtml(returnReq.order_id)}</strong> đã được <strong>chấp thuận tiếp nhận</strong>.</p>
      <div style="background:#faf8f5;border:1px solid #ede6dd;padding:18px 20px;margin:18px 0;">
        <p style="margin:0 0 6px;"><strong>Mã yêu cầu:</strong> ${escapeHtml(returnId)}</p>
        <p style="margin:0 0 6px;"><strong>Sản phẩm:</strong> ${escapeHtml(returnReq.product_name || "Sản phẩm Maison Rue")}${variantText ? ` (${escapeHtml(variantText)})` : ""}</p>
        <p style="margin:0 0 6px;"><strong>Số lượng yêu cầu:</strong> ${Number(returnReq.requested_quantity || 1)}</p>
        <p style="margin:0;"><strong>Hạn gửi hàng hoàn về kho:</strong> ${escapeHtml(deadlineText)}</p>
      </div>
      <p><strong>Lưu ý quan trọng:</strong> Đây là xác nhận chấp thuận gửi hoàn hàng, <strong>chưa phải thông báo đã hoàn tiền</strong>. Sau khi kho nhận kiện hàng và kiểm định chất lượng (QC) đạt yêu cầu, quản trị viên sẽ thực hiện bước hoàn tiền hoặc xuất đổi sản phẩm và gửi email xác nhận riêng.</p>
    `,
  });

  const text = [
    `MAISON RUE — CHAP THUAN YEU CAU DOI/TRA #${returnId}`,
    ``,
    `Kinh chao ${customerName},`,
    `Yeu cau doi/tra #${returnId} (don hang #${returnReq.order_id}) da duoc chap thuan tiep nhan.`,
    `San pham: ${returnReq.product_name || "San pham"}${variantText ? ` (${variantText})` : ""}`,
    `Han gui hang ve kho: ${deadlineText}`,
    ``,
    `Luu y: Day la xac nhan chap thuan gui hang hoan ve, chua phai thong bao da hoan tien. Kho se kiem dinh chat luong (QC) truoc khi hoan tien hoac xuat doi.`,
  ].join("\n");

  return dispatchResendEmail({
    eventKey: options.eventKey || `return-authorized:${returnId}`,
    eventType: "return_authorized",
    entityType: "return_request",
    entityId: returnId,
    recipients: [returnReq.customer_email],
    subject,
    html,
    text,
    allowRetry: Boolean(options.allowRetry),
  });
}

export async function sendReturnRefundedEmail(returnReq, note = "", options = {}) {
  if (!returnReq?.id || returnReq.status !== "refunded") {
    return { success: false, skipped: true, reason: "return_not_refunded" };
  }

  const returnId = String(returnReq.id);
  const customerName = returnReq.customer_name || "Quý khách";
  const variantText = [returnReq.selected_color, returnReq.selected_size].filter(Boolean).join(" - ");
  const cleanNote = String(note || returnReq.staff_note || "").trim();
  const refundRef = returnReq.refund_reference || "N/A";
  const amount = formatVnd(returnReq.requested_amount || 0);

  const subject = `[Maison Rue] Thông báo: Đã hoàn tiền thành công cho yêu cầu #${returnId}`;
  const html = wrapBrandedHtml({
    headerTitle: "Hoàn tiền thành công",
    subtitle: "Return Refund Completed",
    bodyHtml: `
      <p style="margin-top:0;">Kính chào <strong>${escapeHtml(customerName)}</strong>,</p>
      <p><strong>MAISON RUE</strong> xin trân trọng thông báo quá trình kiểm định đã đạt và bộ phận tài chính đã <strong>hoàn tiền thành công</strong> cho yêu cầu trả hàng <strong>#${escapeHtml(returnId)}</strong>.</p>
      <div style="background:#faf8f5;border:1px solid #ede6dd;padding:18px 20px;margin:18px 0;">
        <p style="margin:0 0 6px;"><strong>Mã yêu cầu:</strong> ${escapeHtml(returnId)}</p>
        <p style="margin:0 0 6px;"><strong>Mã đơn hàng:</strong> ${escapeHtml(returnReq.order_id)}</p>
        <p style="margin:0 0 6px;"><strong>Sản phẩm:</strong> ${escapeHtml(returnReq.product_name || "Sản phẩm Maison Rue")}${variantText ? ` (${escapeHtml(variantText)})` : ""}</p>
        <p style="margin:0 0 6px;"><strong>Số tiền đã hoàn:</strong> <strong style="color:#8b6d2e;">${escapeHtml(amount)}</strong></p>
        <p style="margin:0 0 6px;"><strong>Mã tham chiếu giao dịch:</strong> ${escapeHtml(refundRef)}</p>
        ${cleanNote ? `<p style="margin:6px 0 0;"><strong>Ghi chú xử lý:</strong> ${escapeHtml(cleanNote)}</p>` : ""}
      </div>
      <p style="font-size:13px;color:#555;">Số tiền hoàn sẽ được chuyển về phương thức thanh toán ban đầu của Quý khách trong 3–5 ngày làm việc tùy theo ngân hàng.</p>
    `,
  });

  const text = [
    `MAISON RUE — DA HOAN TIEN CHO YEU CAU #${returnId}`,
    ``,
    `Kinh chao ${customerName},`,
    `Bo phan tai chinh MAISON RUE da hoan tien thanh cong cho yeu cau #${returnId} (don hang #${returnReq.order_id}).`,
    `San pham: ${returnReq.product_name || "San pham"}${variantText ? ` (${variantText})` : ""}`,
    `So tien da hoan: ${amount}`,
    `Ma tham chieu giao dich: ${refundRef}`,
    cleanNote ? `Ghi chu: ${cleanNote}` : null,
    `So tien se ve phuong thuc thanh toan ban dau trong 3-5 ngay lam viec.`,
  ]
    .filter(Boolean)
    .join("\n");

  return dispatchResendEmail({
    eventKey: options.eventKey || `return-refunded:${returnId}`,
    eventType: "return_refunded",
    entityType: "return_request",
    entityId: returnId,
    recipients: [returnReq.customer_email],
    subject,
    html,
    text,
    meta: { note: cleanNote, refundReference: refundRef },
    allowRetry: Boolean(options.allowRetry),
  });
}

export async function retryEmailNotification(notificationId) {
  const existing = await db.getEmailNotificationById(notificationId);
  if (!existing) {
    return { notFound: true, success: false, error: "Email notification record not found" };
  }
  if (existing.status === "sent") {
    return {
      alreadySent: true,
      success: true,
      notification: existing,
    };
  }

  let meta = {};
  if (existing.meta_json) {
    try {
      meta = JSON.parse(existing.meta_json);
    } catch {
      meta = {};
    }
  }

  if (existing.event_type === "order_confirmation") {
    const order = await db.getOrderById(existing.entity_id);
    if (!order) return { success: false, error: "Referenced order no longer exists" };
    return sendOrderConfirmationEmail(order, { eventKey: existing.event_key, allowRetry: true });
  }

  if (existing.event_type === "order_status") {
    const order = await db.getOrderById(existing.entity_id);
    if (!order) return { success: false, error: "Referenced order no longer exists" };
    return sendOrderStatusEmail(order, meta.status || order.order_status, meta.note || "", {
      eventKey: existing.event_key,
      allowRetry: true,
    });
  }

  if (existing.event_type === "order_refunded") {
    const order = await db.getOrderById(existing.entity_id);
    if (!order) return { success: false, error: "Referenced order no longer exists" };
    return sendOrderRefundedEmail(order, meta.note || "", {
      eventKey: existing.event_key,
      allowRetry: true,
    });
  }

  if (existing.event_type === "return_authorized") {
    const rr = await db.getReturnRequestById(existing.entity_id);
    if (!rr) return { success: false, error: "Referenced return request no longer exists" };
    return sendReturnAuthorizedEmail(rr, { eventKey: existing.event_key, allowRetry: true });
  }

  if (existing.event_type === "return_refunded") {
    const rr = await db.getReturnRequestById(existing.entity_id);
    if (!rr) return { success: false, error: "Referenced return request no longer exists" };
    return sendReturnRefundedEmail(rr, meta.note || "", {
      eventKey: existing.event_key,
      allowRetry: true,
    });
  }

  if (existing.event_type === "low_stock_alert") {
    return sendLowStockAlertEmail(
      {
        variantId: existing.entity_id,
        sku: meta.sku || existing.entity_id,
        productName: meta.productName || "Maison Rue Product",
        variantInfo: meta.variantInfo || "",
        currentStock: meta.currentStock ?? 0,
        minStock: meta.minStock ?? 0,
        note: meta.note || "",
      },
      { eventKey: existing.event_key, allowRetry: true }
    );
  }

  return { success: false, error: `Unsupported notification event type: ${existing.event_type}` };
}

export async function sendTestEmail({ to, initiatedBy = "CLI" }) {
  const recipients = normalizeRecipients(to);
  if (recipients.length === 0) {
    return { success: false, error: "Invalid recipient email address" };
  }

  const { apiKey, from } = getResendConfig();
  const effectiveFrom = from || (mockResendClient ? "MAISON RUE <onboarding@resend.dev>" : "");
  const client = getResendClient();
  if (!client || (!mockResendClient && !apiKey) || !effectiveFrom) {
    return {
      success: false,
      error: "Missing RESEND_API_KEY or RESEND_FROM_EMAIL in environment configuration.",
    };
  }

  const nowIso = new Date().toISOString();
  const subject = "[Maison Rue] Resend Integration Verification Email";
  const html = wrapBrandedHtml({
    headerTitle: "Resend SMTP / API Verification",
    subtitle: "System Diagnostic Email",
    bodyHtml: `
      <p style="margin-top:0;">Đây là email kiểm thử tích hợp <strong>Resend</strong> từ backend <strong>MAISON RUE</strong>.</p>
      <div style="background:#faf8f5;border:1px solid #ede6dd;padding:16px 20px;margin:18px 0;">
        <p style="margin:0 0 6px;"><strong>Người nhận kiểm thử:</strong> ${escapeHtml(recipients.join(", "))}</p>
        <p style="margin:0 0 6px;"><strong>Địa chỉ gửi (From):</strong> ${escapeHtml(effectiveFrom)}</p>
        <p style="margin:0 0 6px;"><strong>Nguồn kích hoạt:</strong> ${escapeHtml(initiatedBy)}</p>
        <p style="margin:0;"><strong>Thời điểm (UTC):</strong> ${escapeHtml(nowIso)}</p>
      </div>
      <p style="font-size:13px;color:#555;">Nếu bạn nhận được email này, kết nối API Key và địa chỉ gửi trên Resend đã được Resend tiếp nhận và chuyển phát thành công.</p>
    `,
  });
  const text = [
    `MAISON RUE — Resend Integration Verification Email`,
    `To: ${recipients.join(", ")}`,
    `From: ${effectiveFrom}`,
    `Initiated by: ${initiatedBy}`,
    `Time (UTC): ${nowIso}`,
  ].join("\n");

  try {
    const result = await client.emails.send(
      {
        from: effectiveFrom,
        to: recipients,
        subject,
        html,
        text,
      },
      { idempotencyKey: `cli-test:${recipients[0].toLowerCase()}:${nowIso}` }
    );
    if (result?.error) {
      return { success: false, from: effectiveFrom, to: recipients, error: redactSecrets(result.error.message || JSON.stringify(result.error)) };
    }
    return { success: true, messageId: result?.data?.id || null, from: effectiveFrom, to: recipients };
  } catch (err) {
    return { success: false, from: effectiveFrom, to: recipients, error: redactSecrets(err?.message || String(err)) };
  }
}

