import { Resend } from "resend";
import nodemailer from "nodemailer";
import { db } from "../config/db.js";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

let cachedApiKey = null;
let cachedResendClient = null;
let mockResendClient = null;
let cachedSmtpKey = null;
let cachedSmtpTransporter = null;

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
  let text = String(input)
    .replace(/re_[A-Za-z0-9_]{8,}/g, "re_[REDACTED]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [REDACTED]")
    .replace(/(password|passwd|pwd|api_?key|secret|token)\s*[:=]\s*[^\s,;]+/gi, "$1=[REDACTED]");
  const smtpPass = (process.env.SMTP_PASS || "").replace(/\s+/g, "").trim();
  if (smtpPass) {
    text = text.split(smtpPass).join("[REDACTED]");
  }
  return text;
}

export function getResendConfig() {
  const apiKey = (process.env.RESEND_API_KEY || "").trim();
  const from = (process.env.RESEND_FROM_EMAIL || "").trim();
  return { apiKey, from };
}

export function getSmtpConfig() {
  const user = (process.env.SMTP_USER || "").trim();
  const pass = (process.env.SMTP_PASS || "").replace(/\s+/g, "").trim();
  const host = (process.env.SMTP_HOST || "smtp.gmail.com").trim();
  const port = Number(process.env.SMTP_PORT || 465);
  const secure = process.env.SMTP_SECURE ? process.env.SMTP_SECURE === "true" : port === 465;
  const from = (process.env.SMTP_FROM || (user ? `MAISON RUE <${user}>` : "")).trim();
  return { host, port, secure, user, pass, from };
}

export function getActiveEmailProvider() {
  if (mockResendClient) return "resend";
  const smtp = getSmtpConfig();
  if (smtp.user && smtp.pass) return "smtp";
  return "resend";
}

function getSmtpTransporter() {
  const smtp = getSmtpConfig();
  if (!smtp.user || !smtp.pass) return null;
  const cacheKey = `${smtp.host}:${smtp.port}:${smtp.secure}:${smtp.user}:${smtp.pass}`;
  if (!cachedSmtpTransporter || cachedSmtpKey !== cacheKey) {
    cachedSmtpTransporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: {
        user: smtp.user,
        pass: smtp.pass,
      },
    });
    cachedSmtpKey = cacheKey;
  }
  return cachedSmtpTransporter;
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
  return `${Number(amount || 0).toLocaleString("en-US")} VND`;
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
<html lang="en">
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
      MAISON RUE Luxury Atelier &bull; Automated Order &amp; Client Services Notification.<br/>
      Please retain your reference number to track updates directly on our website.
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

  const provider = getActiveEmailProvider();
  let reservation;
  try {
    reservation = await db.reserveEmailNotification({
      eventKey,
      eventType,
      entityType,
      entityId,
      recipientEmail: recipientSummary,
      subject,
      provider,
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

  // Prevent test runs against MaisonRueDB_Test from hitting live email providers unless mocked or opted in.
  if (!mockResendClient && process.env.DB_NAME === "MaisonRueDB_Test" && process.env.RESEND_ALLOW_TEST_DB !== "true") {
    const msg = "Skipped live email call during MaisonRueDB_Test run";
    const updated = await db.markEmailNotificationResult(notification.id, {
      status: "skipped",
      errorMessage: msg,
    });
    return { success: true, skipped: true, reason: "test_db_disabled", notification: updated };
  }

  if (provider === "smtp") {
    const smtp = getSmtpConfig();
    const transporter = getSmtpTransporter();
    if (!transporter || !smtp.from) {
      const msg = "SMTP configuration missing: SMTP_USER, SMTP_PASS, or SMTP_FROM";
      const updated = await db.markEmailNotificationResult(notification.id, {
        status: "failed",
        errorMessage: msg,
      });
      console.warn(`[Email] Not sent ${eventType} (${eventKey}): ${msg}`);
      return { success: false, error: msg, notification: updated };
    }

    try {
      const info = await transporter.sendMail({
        from: smtp.from,
        to: normalizedRecipients.join(", "),
        subject,
        html,
        text,
      });
      const messageId = info?.messageId || null;
      const updated = await db.markEmailNotificationResult(notification.id, {
        status: "sent",
        providerMessageId: messageId,
        errorMessage: null,
      });
      console.log(`[Email/SMTP] Sent ${eventType} (${eventKey}) id=${messageId || "ok"}`);
      return { success: true, messageId, notification: updated };
    } catch (err) {
      const errMsg = redactSecrets(err?.message || String(err));
      const updated = await db.markEmailNotificationResult(notification.id, {
        status: "failed",
        errorMessage: errMsg,
      });
      console.warn(`[Email/SMTP] Exception sending ${eventType} (${eventKey}): ${errMsg}`);
      return { success: false, error: errMsg, notification: updated };
    }
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
      <p style="margin-top:0;">Dear <strong>${escapeHtml(customerName)}</strong>,</p>
      <p>Thank you for choosing <strong>MAISON RUE</strong>. Your order has been successfully placed and recorded by our concierge team.</p>
      <div style="background:#faf8f5;border:1px solid #ede6dd;padding:18px 20px;margin:20px 0;">
        <p style="margin:0 0 6px;"><strong>Order Number:</strong> ${escapeHtml(orderId)}</p>
        <p style="margin:0 0 6px;"><strong>Payment Method:</strong> ${escapeHtml(formatPaymentMethod(paymentMethod))}</p>
        <p style="margin:0 0 6px;"><strong>Delivery Address:</strong> ${escapeHtml(shippingAddress)}</p>
        <p style="margin:0;"><strong>Contact Phone:</strong> ${escapeHtml(shippingPhone)}</p>
      </div>
      <h3 style="font-size:14px;letter-spacing:0.08em;text-transform:uppercase;color:#6c625b;margin:22px 0 10px;">Order Items</h3>
      ${itemsBlock.html}
      <div style="margin-top:16px;padding-top:14px;border-top:2px solid #1a1615;font-size:14px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span>Shipping Fee:</span><strong>${escapeHtml(formatVnd(shippingFee))}</strong></div>
        ${discountAmount > 0 ? `<div style="display:flex;justify-content:space-between;margin-bottom:4px;color:#7c5b2b;"><span>Discount:</span><strong>-${escapeHtml(formatVnd(discountAmount))}</strong></div>` : ""}
        <div style="display:flex;justify-content:space-between;font-size:16px;margin-top:8px;"><span>Total Amount:</span><strong>${escapeHtml(formatVnd(totalAmount))}</strong></div>
      </div>
    `,
  });

  const text = [
    `MAISON RUE — ORDER CONFIRMATION #${orderId}`,
    ``,
    `Dear ${customerName},`,
    `Thank you for your order with MAISON RUE. Your order #${orderId} has been recorded.`,
    `Payment Method: ${formatPaymentMethod(paymentMethod)}`,
    `Delivery Address: ${shippingAddress}`,
    `Contact Phone: ${shippingPhone}`,
    ``,
    `Order Items:`,
    itemsBlock.text,
    ``,
    `Shipping Fee: ${formatVnd(shippingFee)}`,
    discountAmount > 0 ? `Discount: -${formatVnd(discountAmount)}` : null,
    `Total Amount: ${formatVnd(totalAmount)}`,
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
      <p style="margin-top:0;">Dear <strong>${escapeHtml(customerName)}</strong>,</p>
      <p>${escapeHtml(cfg.headline)}</p>
      <div style="background:#faf8f5;border:1px solid #ede6dd;padding:16px 20px;margin:18px 0;">
        <p style="margin:0 0 6px;"><strong>Order Number:</strong> ${escapeHtml(orderId)}</p>
        <p style="margin:0 0 6px;"><strong>Current Status:</strong> ${escapeHtml(cfg.badge)}</p>
        <p style="margin:0 0 6px;"><strong>Order Total:</strong> ${escapeHtml(totalAmount)}</p>
        ${cleanNote ? `<p style="margin:8px 0 0;"><strong>Concierge Note:</strong> ${escapeHtml(cleanNote)}</p>` : ""}
      </div>
      ${itemsBlock.html}
    `,
  });

  const text = [
    `MAISON RUE — ${cfg.subjectPrefix} (#${orderId})`,
    ``,
    `Dear ${customerName},`,
    cfg.headline,
    `Current Status: ${cfg.badge}`,
    `Order Total: ${totalAmount}`,
    cleanNote ? `Note: ${cleanNote}` : null,
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
      <p style="margin-top:0;">Dear <strong>${escapeHtml(customerName)}</strong>,</p>
      <p><strong>MAISON RUE</strong> Finance confirms that your refund for order <strong>#${escapeHtml(orderId)}</strong> has been <strong>completed</strong>.</p>
      <div style="background:#faf8f5;border:1px solid #ede6dd;padding:18px 20px;margin:18px 0;">
        <p style="margin:0 0 6px;"><strong>Order Number:</strong> ${escapeHtml(orderId)}</p>
        <p style="margin:0 0 6px;"><strong>Refund Amount:</strong> ${escapeHtml(amount)}</p>
        <p style="margin:0 0 6px;"><strong>Refund Reference:</strong> ${escapeHtml(refundRef)}</p>
        ${cleanNote ? `<p style="margin:6px 0 0;"><strong>Note:</strong> ${escapeHtml(cleanNote)}</p>` : ""}
      </div>
      <p style="font-size:13px;color:#555;">The refunded amount will appear on your original payment method within 3–5 business days depending on your issuing bank.</p>
    `,
  });

  const text = [
    `MAISON RUE — REFUND COMPLETED FOR ORDER #${orderId}`,
    ``,
    `Dear ${customerName},`,
    `MAISON RUE Finance confirms that your refund for order #${orderId} has been completed.`,
    `Refund Amount: ${amount}`,
    `Refund Reference: ${refundRef}`,
    cleanNote ? `Note: ${cleanNote}` : null,
    `The refunded amount will reflect on your original payment method within 3-5 business days.`,
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
      <p style="margin-top:0;"><strong>MAISON RUE</strong> Inventory Operations has detected an SKU below its minimum stock threshold:</p>
      <div style="background:#fff6f4;border:1px solid #e6c6bf;padding:18px 20px;margin:18px 0;">
        <p style="margin:0 0 6px;"><strong>Product:</strong> ${escapeHtml(productName)}</p>
        <p style="margin:0 0 6px;"><strong>SKU:</strong> ${escapeHtml(sku)}</p>
        ${variantInfo ? `<p style="margin:0 0 6px;"><strong>Variant:</strong> ${escapeHtml(variantInfo)}</p>` : ""}
        <p style="margin:0 0 6px;"><strong>Current Stock:</strong> <strong style="color:#8c2d2d;">${currentStock}</strong></p>
        <p style="margin:0 0 6px;"><strong>Minimum Threshold:</strong> ${minStock}</p>
        ${note ? `<p style="margin:8px 0 0;"><strong>Note:</strong> ${escapeHtml(note)}</p>` : ""}
      </div>
      <p style="font-size:13px;color:#555;">Please review inventory levels and schedule replenishment promptly.</p>
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
  const customerName = returnReq.customer_name || "Valued Customer";
  const deadlineText = returnReq.return_deadline
    ? new Date(returnReq.return_deadline).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
    : "within the next 7 days";
  const variantText = [returnReq.selected_color, returnReq.selected_size].filter(Boolean).join(" - ");

  const subject = `[Maison Rue] Return Request Authorized #${returnId}`;
  const html = wrapBrandedHtml({
    headerTitle: "Return Request Authorized",
    subtitle: "Return Authorization Approved",
    bodyHtml: `
      <p style="margin-top:0;">Dear <strong>${escapeHtml(customerName)}</strong>,</p>
      <p>Your return/exchange request <strong>#${escapeHtml(returnId)}</strong> for order <strong>#${escapeHtml(returnReq.order_id)}</strong> has been <strong>authorized for physical return</strong>.</p>
      <div style="background:#faf8f5;border:1px solid #ede6dd;padding:18px 20px;margin:18px 0;">
        <p style="margin:0 0 6px;"><strong>Request ID:</strong> ${escapeHtml(returnId)}</p>
        <p style="margin:0 0 6px;"><strong>Product:</strong> ${escapeHtml(returnReq.product_name || "Maison Rue Item")}${variantText ? ` (${escapeHtml(variantText)})` : ""}</p>
        <p style="margin:0 0 6px;"><strong>Requested Quantity:</strong> ${Number(returnReq.requested_quantity || 1)}</p>
        <p style="margin:0;"><strong>Return Shipment Deadline:</strong> ${escapeHtml(deadlineText)}</p>
      </div>
      <p><strong>Important Notice:</strong> This is an authorization to return your item for inspection and is <strong>not a refund confirmation</strong>. Once our warehouse receives the package and completes quality control (QC), our team will issue your refund or dispatch your exchange and send a separate confirmation email.</p>
    `,
  });

  const text = [
    `MAISON RUE — RETURN REQUEST AUTHORIZED #${returnId}`,
    ``,
    `Dear ${customerName},`,
    `Your return/exchange request #${returnId} (Order #${returnReq.order_id}) has been authorized.`,
    `Product: ${returnReq.product_name || "Maison Rue Item"}${variantText ? ` (${variantText})` : ""}`,
    `Return Shipment Deadline: ${deadlineText}`,
    ``,
    `Important Notice: This is an authorization to return your item for inspection and is not a refund confirmation. Our warehouse will perform quality control (QC) before issuing a refund or exchange.`,
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
  const customerName = returnReq.customer_name || "Valued Customer";
  const variantText = [returnReq.selected_color, returnReq.selected_size].filter(Boolean).join(" - ");
  const cleanNote = String(note || returnReq.staff_note || "").trim();
  const refundRef = returnReq.refund_reference || "N/A";
  const amount = formatVnd(returnReq.requested_amount || 0);

  const subject = `[Maison Rue] Refund Completed for Return Request #${returnId}`;
  const html = wrapBrandedHtml({
    headerTitle: "Return Refund Completed",
    subtitle: "Return Refund Completed",
    bodyHtml: `
      <p style="margin-top:0;">Dear <strong>${escapeHtml(customerName)}</strong>,</p>
      <p><strong>MAISON RUE</strong> is pleased to confirm that quality inspection has passed and our finance team has <strong>completed your refund</strong> for return request <strong>#${escapeHtml(returnId)}</strong>.</p>
      <div style="background:#faf8f5;border:1px solid #ede6dd;padding:18px 20px;margin:18px 0;">
        <p style="margin:0 0 6px;"><strong>Request ID:</strong> ${escapeHtml(returnId)}</p>
        <p style="margin:0 0 6px;"><strong>Order Number:</strong> ${escapeHtml(returnReq.order_id)}</p>
        <p style="margin:0 0 6px;"><strong>Product:</strong> ${escapeHtml(returnReq.product_name || "Maison Rue Item")}${variantText ? ` (${escapeHtml(variantText)})` : ""}</p>
        <p style="margin:0 0 6px;"><strong>Refunded Amount:</strong> <strong style="color:#8b6d2e;">${escapeHtml(amount)}</strong></p>
        <p style="margin:0 0 6px;"><strong>Transaction Reference:</strong> ${escapeHtml(refundRef)}</p>
        ${cleanNote ? `<p style="margin:6px 0 0;"><strong>Processing Note:</strong> ${escapeHtml(cleanNote)}</p>` : ""}
      </div>
      <p style="font-size:13px;color:#555;">The refunded amount will be credited to your original payment method within 3–5 business days depending on your bank.</p>
    `,
  });

  const text = [
    `MAISON RUE — RETURN REFUND COMPLETED #${returnId}`,
    ``,
    `Dear ${customerName},`,
    `MAISON RUE Finance has completed your refund for return request #${returnId} (Order #${returnReq.order_id}).`,
    `Product: ${returnReq.product_name || "Maison Rue Item"}${variantText ? ` (${variantText})` : ""}`,
    `Refunded Amount: ${amount}`,
    `Transaction Reference: ${refundRef}`,
    cleanNote ? `Note: ${cleanNote}` : null,
    `The refund will be credited to your original payment method within 3-5 business days.`,
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

  if (existing.event_type === "promotion_campaign") {
    return sendPromotionCampaignEmail({
      recipientEmail: existing.recipient_email,
      promoCode: meta.promoCode || existing.entity_id,
      promoTitle: meta.promoTitle || "",
      promoDescription: meta.promoDescription || "",
      discountLabel: meta.discountLabel || "",
      minimumOrderText: meta.minimumOrderText || "",
      validUntilText: meta.validUntilText || "",
      eventKey: existing.event_key,
      allowRetry: true,
    });
  }

  if (existing.event_type === "account_created") {
    const user = await db.findUserById(existing.entity_id);
    return sendAccountCreatedEmail({
      userId: user?.id || existing.entity_id,
      name: user?.name || meta.name || "Valued Client",
      email: user?.email || existing.recipient_email,
      eventKey: existing.event_key,
      allowRetry: true,
    });
  }

  return { success: false, error: `Unsupported notification event type: ${existing.event_type}` };
}

export async function sendPasswordResetOtpEmail({ userId, email, name, otp, expiresInMinutes = 15 }) {
  const safeName = name || "Valued Client";
  const safeOtp = String(otp || "").trim();
  const mins = Number(expiresInMinutes || 15);
  const subject = `[Maison Rue] Password Reset Verification Code`;
  const html = wrapBrandedHtml({
    headerTitle: "Password Reset Verification",
    subtitle: "Account Security Verification",
    bodyHtml: `
      <p style="margin-top:0;">Dear <strong>${escapeHtml(safeName)}</strong>,</p>
      <p>We received a request to reset the password for your <strong>MAISON RUE</strong> client account. Enter the 6-digit verification code below on the website to complete your password reset:</p>
      <div style="margin:24px 0;padding:20px;background:#faf8f5;border:1px dashed #b89b5e;text-align:center;">
        <div style="font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#6c625b;margin-bottom:8px;">One-Time Verification Code</div>
        <div style="font-family:'Courier New',monospace;font-size:32px;font-weight:700;letter-spacing:10px;color:#1a1615;">${escapeHtml(safeOtp)}</div>
      </div>
      <p style="font-size:13px;color:#555;">This code will expire in <strong>${mins} minutes</strong> and can only be used once. Once your password is updated, all active sessions across your devices will be signed out automatically for your security.</p>
      <p style="font-size:12px;color:#7a7068;margin-bottom:0;">If you did not request a password reset, please disregard this email — your account remains secure.</p>
    `,
  });

  const text = [
    `MAISON RUE — PASSWORD RESET VERIFICATION`,
    ``,
    `Dear ${safeName},`,
    `Your 6-digit verification code is: ${safeOtp}`,
    `This code expires in ${mins} minutes and can only be used once.`,
    `After resetting your password, all previous web sessions will be signed out automatically.`,
  ].join("\n");

  return dispatchResendEmail({
    eventKey: `password-reset-otp:${userId || email}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
    eventType: "password_reset_otp",
    entityType: "user",
    entityId: String(userId || email),
    recipients: [email],
    subject,
    html,
    text,
    meta: { expiresInMinutes: mins },
  });
}

export async function sendNewsletterWelcomeEmail({ email }) {
  const safeEmail = String(email || "").trim().toLowerCase();
  const subject = `[Maison Rue] Welcome to The Maison Rue Newsletter`;
  const html = wrapBrandedHtml({
    headerTitle: "Welcome to Maison Rue",
    subtitle: "The Maison Rue Newsletter",
    bodyHtml: `
      <p style="margin-top:0;">Dear Valued Guest,</p>
      <p>Thank you for subscribing to <strong>The Maison Rue Newsletter</strong>.</p>
      <p>You will now be the first to receive seasonal lookbooks, private collection previews, and exclusive promotional codes crafted for our Maison Rue clientele.</p>
      <div style="background:#faf8f5;border:1px solid #ede6dd;padding:16px 20px;margin:20px 0;">
        <p style="margin:0;font-size:13px;color:#555;"><strong>Subscribed Address:</strong> ${escapeHtml(safeEmail)}</p>
      </div>
      <p style="font-size:13px;color:#555;margin-bottom:0;">We look forward to welcoming you at MAISON RUE.</p>
    `,
  });

  const text = [
    `MAISON RUE — WELCOME TO THE MAISON RUE NEWSLETTER`,
    ``,
    `Thank you for subscribing to The Maison Rue Newsletter.`,
    `Subscribed email: ${safeEmail}`,
    `You will receive new collection previews and exclusive promotional offers from Maison Rue.`,
  ].join("\n");

  return dispatchResendEmail({
    eventKey: `newsletter-welcome:${safeEmail}`,
    eventType: "newsletter_welcome",
    entityType: "newsletter",
    entityId: safeEmail,
    recipients: [safeEmail],
    subject,
    html,
    text,
    allowRetry: true,
  });
}

export async function sendPromotionCampaignEmail({
  recipientEmail,
  promoCode,
  promoTitle = "",
  promoDescription = "",
  discountLabel = "",
  minimumOrderText = "",
  validUntilText = "",
  eventKey = null,
  allowRetry = false,
}) {
  const cleanCode = String(promoCode || "").trim().toUpperCase();
  if (!cleanCode) {
    return { success: false, skipped: true, reason: "missing_promo_code" };
  }

  const title = String(promoTitle || "An Exclusive Privilege From Maison Rue").trim();
  const description = String(
    promoDescription || "Enjoy a curated privilege on our luxury collections for a limited time."
  ).trim();
  const offerLine = String(discountLabel || "Special Private Offer").trim();
  const minOrderLine = String(minimumOrderText || "").trim();
  const validityLine = String(validUntilText || "").trim();

  const subject = `[Maison Rue] Exclusive Offer — Use Code ${cleanCode}`;
  const html = wrapBrandedHtml({
    headerTitle: title,
    subtitle: "Exclusive Client Privilege",
    bodyHtml: `
      <p style="margin-top:0;">Dear Valued Client,</p>
      <p><strong>${escapeHtml(title)}</strong></p>
      <p>${escapeHtml(description)}</p>
      <div style="margin:24px 0;padding:22px 20px;background:#faf8f5;border:1px dashed #b89b5e;text-align:center;">
        <div style="font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#6c625b;margin-bottom:8px;">Your Promotional Code</div>
        <div style="font-family:'Courier New',monospace;font-size:28px;font-weight:700;letter-spacing:4px;color:#1a1615;">${escapeHtml(cleanCode)}</div>
        <div style="margin-top:10px;font-size:14px;font-weight:600;color:#7c5b2b;">${escapeHtml(offerLine)}</div>
      </div>
      ${
        minOrderLine || validityLine
          ? `<div style="background:#ffffff;border:1px solid #ede6dd;padding:14px 18px;margin:18px 0;font-size:13px;">
              ${minOrderLine ? `<p style="margin:0 0 4px;"><strong>Eligibility:</strong> ${escapeHtml(minOrderLine)}</p>` : ""}
              ${validityLine ? `<p style="margin:0;"><strong>Valid Until:</strong> ${escapeHtml(validityLine)}</p>` : ""}
            </div>`
          : ""
      }
      <p style="font-size:13px;color:#555;margin-bottom:0;">Simply enter code <strong>${escapeHtml(cleanCode)}</strong> at checkout to apply your privilege.</p>
    `,
  });

  const text = [
    `MAISON RUE — EXCLUSIVE OFFER (${cleanCode})`,
    ``,
    title,
    description,
    ``,
    `PROMO CODE: ${cleanCode}`,
    `OFFER: ${offerLine}`,
    minOrderLine ? `Eligibility: ${minOrderLine}` : null,
    validityLine ? `Valid Until: ${validityLine}` : null,
    ``,
    `Enter code ${cleanCode} at checkout on MAISON RUE.`,
  ]
    .filter(Boolean)
    .join("\n");

  const safeRecipient = String(recipientEmail || "").trim().toLowerCase();
  return dispatchResendEmail({
    eventKey:
      eventKey ||
      `promo-campaign:${cleanCode}:${safeRecipient}:${Date.now()}:${Math.random().toString(36).slice(2, 7)}`,
    eventType: "promotion_campaign",
    entityType: "promotion_code",
    entityId: cleanCode,
    recipients: [safeRecipient],
    subject,
    html,
    text,
    meta: {
      promoCode: cleanCode,
      promoTitle: title,
      promoDescription: description,
      discountLabel: offerLine,
      minimumOrderText: minOrderLine,
      validUntilText: validityLine,
    },
    allowRetry,
  });
}

export async function sendAccountCreatedEmail({
  userId,
  name,
  email,
  eventKey = null,
  allowRetry = false,
}) {
  const safeEmail = String(email || "").trim().toLowerCase();
  const safeName = String(name || "").trim() || "Valued Client";
  if (!safeEmail) {
    return { success: false, skipped: true, reason: "Missing recipient email address" };
  }

  const subject = `[Maison Rue] Welcome — Your Client Account Is Ready`;
  const html = wrapBrandedHtml({
    headerTitle: "Welcome to Maison Rue",
    subtitle: "Account Registration Confirmed",
    bodyHtml: `
      <p style="margin-top:0;">Dear <strong>${escapeHtml(safeName)}</strong>,</p>
      <p>Your <strong>MAISON RUE</strong> client account has been created successfully.</p>
      <div style="background:#faf8f5;border:1px solid #ede6dd;padding:18px 20px;margin:20px 0;">
        <p style="margin:0 0 6px;"><strong>Account Holder:</strong> ${escapeHtml(safeName)}</p>
        <p style="margin:0 0 6px;"><strong>Registered Email:</strong> ${escapeHtml(safeEmail)}</p>
        <p style="margin:0;"><strong>Account Status:</strong> Active</p>
      </div>
      <p style="font-size:13px;color:#555;">You can now sign in with <strong>${escapeHtml(safeEmail)}</strong> to track orders, manage delivery addresses, and receive order confirmations and exclusive offers directly at this email address.</p>
      <p style="font-size:13px;color:#555;margin-bottom:0;">If you did not create this account, please contact Maison Rue Client Services immediately.</p>
    `,
  });

  const text = [
    `MAISON RUE — ACCOUNT REGISTRATION CONFIRMED`,
    ``,
    `Dear ${safeName},`,
    `Your MAISON RUE client account has been created successfully.`,
    ``,
    `Account Holder: ${safeName}`,
    `Registered Email: ${safeEmail}`,
    `Account Status: Active`,
    ``,
    `Order updates and account notifications will be sent to ${safeEmail}.`,
  ].join("\n");

  return dispatchResendEmail({
    eventKey: eventKey || `account-created:${userId || safeEmail}:${safeEmail}`,
    eventType: "account_created",
    entityType: "user",
    entityId: String(userId || safeEmail),
    recipients: [safeEmail],
    subject,
    html,
    text,
    meta: { name: safeName, email: safeEmail },
    allowRetry,
  });
}

export async function sendTestEmail({ to, initiatedBy = "CLI" }) {
  const recipients = normalizeRecipients(to);
  if (recipients.length === 0) {
    return { success: false, error: "Invalid recipient email address" };
  }

  const provider = getActiveEmailProvider();
  const smtp = getSmtpConfig();
  const { apiKey, from } = getResendConfig();
  const effectiveFrom =
    provider === "smtp"
      ? smtp.from
      : from || (mockResendClient ? "MAISON RUE <onboarding@resend.dev>" : "");

  if (provider === "smtp") {
    if (!smtp.user || !smtp.pass || !effectiveFrom) {
      return {
        success: false,
        error: "Missing SMTP_USER, SMTP_PASS, or SMTP_FROM in environment configuration.",
      };
    }
  } else {
    const client = getResendClient();
    if (!client || (!mockResendClient && !apiKey) || !effectiveFrom) {
      return {
        success: false,
        error: "Missing RESEND_API_KEY or RESEND_FROM_EMAIL in environment configuration.",
      };
    }
  }

  const nowIso = new Date().toISOString();
  const providerLabel = provider === "smtp" ? "Gmail SMTP" : "Resend";
  const subject = `[Maison Rue] ${providerLabel} Integration Verification Email`;
  const html = wrapBrandedHtml({
    headerTitle: `${providerLabel} Verification`,
    subtitle: "System Diagnostic Email",
    bodyHtml: `
      <p style="margin-top:0;">This is an automated integration verification email sent via <strong>${escapeHtml(providerLabel)}</strong> from the <strong>MAISON RUE</strong> backend.</p>
      <div style="background:#faf8f5;border:1px solid #ede6dd;padding:16px 20px;margin:18px 0;">
        <p style="margin:0 0 6px;"><strong>Recipient:</strong> ${escapeHtml(recipients.join(", "))}</p>
        <p style="margin:0 0 6px;"><strong>From:</strong> ${escapeHtml(effectiveFrom)}</p>
        <p style="margin:0 0 6px;"><strong>Triggered By:</strong> ${escapeHtml(initiatedBy)}</p>
        <p style="margin:0;"><strong>Timestamp (UTC):</strong> ${escapeHtml(nowIso)}</p>
      </div>
      <p style="font-size:13px;color:#555;">If you received this message, your MAISON RUE email transport configuration is active and delivering normally.</p>
    `,
  });
  const text = [
    `MAISON RUE — ${providerLabel} Integration Verification Email`,
    `To: ${recipients.join(", ")}`,
    `From: ${effectiveFrom}`,
    `Initiated by: ${initiatedBy}`,
    `Time (UTC): ${nowIso}`,
  ].join("\n");

  if (provider === "smtp") {
    try {
      const transporter = getSmtpTransporter();
      const info = await transporter.sendMail({
        from: effectiveFrom,
        to: recipients.join(", "),
        subject,
        html,
        text,
      });
      return { success: true, provider: "smtp", messageId: info?.messageId || null, from: effectiveFrom, to: recipients };
    } catch (err) {
      return { success: false, provider: "smtp", from: effectiveFrom, to: recipients, error: redactSecrets(err?.message || String(err)) };
    }
  }

  const client = getResendClient();
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
      return { success: false, provider: "resend", from: effectiveFrom, to: recipients, error: redactSecrets(result.error.message || JSON.stringify(result.error)) };
    }
    return { success: true, provider: "resend", messageId: result?.data?.id || null, from: effectiveFrom, to: recipients };
  } catch (err) {
    return { success: false, provider: "resend", from: effectiveFrom, to: recipients, error: redactSecrets(err?.message || String(err)) };
  }
}

