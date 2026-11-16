/**
 * VNPay Payment Routes
 *
 * POST /api/payments/vnpay/create-url  – Generate VNPay payment URL (authenticated or optional auth)
 * GET  /api/payments/vnpay/return      – VNPay redirects customer here after payment
 * GET  /api/payments/vnpay/ipn         – VNPay server-to-server IPN callback (no auth)
 */

import { Router } from "express";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import { createPaymentUrl, verifyVnpaySignature, isVnpayConfigured } from "../services/vnpayService.js";
import { db } from "../config/db.js";
import {
  sendOrderConfirmationEmail,
} from "../services/emailService.js";

dotenv.config();
const JWT_SECRET = process.env.JWT_SECRET;

const router = Router();

// Soft authenticate (same pattern as orderRoutes.js optionalAuth)
async function optionalAuth(req, _res, next) {
  let token = req.cookies?.maison_rue_token;
  if (!token && req.headers.authorization?.startsWith("Bearer ")) {
    token = req.headers.authorization.split(" ")[1];
  }
  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      const user = await db.findUserById(decoded.id);
      if (user && user.is_active !== false) {
        req.user = { id: user.id, name: user.name, email: user.email, role: user.role, phone: user.phone };
      }
    } catch {
      // ignore
    }
  }
  next();
}

/**
 * POST /api/payments/vnpay/verify
 * Frontend forwards VNPay return query parameters here for backend verification
 * and payment confirmation.
 */
router.post("/vnpay/verify", async (req, res) => {
  try {
    const vnpParams = req.body || {};
    const result = verifyVnpaySignature(vnpParams);

    if (!result.isValid) {
      console.warn("[VNPay Verify] Invalid signature for order:", result.orderId);
      return res.status(400).json({
        success: false,
        isValid: false,
        orderId: result.orderId,
        error: "Chữ ký số không hợp lệ (Invalid Checksum).",
      });
    }

    const order = await db.getOrderById(result.orderId);
    if (!order) {
      return res.status(404).json({ success: false, error: "Không tìm thấy đơn hàng." });
    }

    // Success response
    if (result.responseCode === "00" && (result.transactionStatus === "00" || !result.transactionStatus)) {
      if (order.payment?.payment_status !== "paid") {
        try {
          await db.confirmPayment({
            orderId: result.orderId,
            transactionReference: `VNPAY-${result.transactionNo}`,
            note: `VNPay frontend return verified. Bank: ${result.bankCode}. Transaction: ${result.transactionNo}`,
            confirmedBy: "VNPAY_RETURN",
          });
        } catch (dbErr) {
          console.warn("[VNPay Verify] DB confirm payment warning:", dbErr.message);
        }
      }

      const updatedOrder = await db.getOrderById(result.orderId);
      return res.json({
        success: true,
        isValid: true,
        status: "success",
        orderId: result.orderId,
        transactionNo: result.transactionNo,
        amount: result.amount,
        bankCode: result.bankCode,
        payDate: result.payDate,
        order: updatedOrder,
      });
    }

    return res.json({
      success: false,
      isValid: true,
      status: "failed",
      orderId: result.orderId,
      responseCode: result.responseCode,
      message: getVnpayResponseDescription(result.responseCode),
    });
  } catch (err) {
    console.error("[VNPay Verify] Error:", err);
    return res.status(500).json({ success: false, error: err.message || "Lỗi xác thực kết quả thanh toán." });
  }
});

function getVnpayResponseDescription(responseCode) {
  const codes = {
    "00": "Giao dịch thành công",
    "07": "Trừ tiền thành công. Giao dịch bị nghi ngờ (liên quan tới lừa đảo, bất thường).",
    "09": "Thẻ/Tài khoản chưa đăng ký dịch vụ InternetBanking tại ngân hàng.",
    "10": "Khách hàng xác thực thông tin thẻ/tài khoản không đúng quá 3 lần.",
    "11": "Đã hết hạn chờ thanh toán. Vui lòng thử lại.",
    "12": "Thẻ/Tài khoản của khách hàng bị khóa.",
    "13": "Quý khách nhập sai mật khẩu xác thực giao dịch (OTP).",
    "24": "Khách hàng hủy giao dịch.",
    "51": "Tài khoản của quý khách không đủ số dư để thực hiện giao dịch.",
    "65": "Tài khoản của quý khách đã vượt quá hạn mức giao dịch trong ngày.",
    "75": "Ngân hàng thanh toán đang bảo trì.",
    "79": "Nhập sai mật khẩu thanh toán quá số lần quy định.",
    "99": "Lỗi không xác định.",
  };
  return codes[responseCode] || `Giao dịch không thành công (Mã lỗi: ${responseCode})`;
}

/**
 * POST /api/payments/vnpay/create-url
 * Body: { orderId, bankCode? }
 *
 * After an order is created with paymentMethod "vnpay", the frontend calls
 * this endpoint to get the VNPay redirect URL.
 */
router.post("/vnpay/create-url", optionalAuth, async (req, res) => {
  try {
    if (!isVnpayConfigured()) {
      return res.status(503).json({ success: false, error: "VNPay chưa được cấu hình trên server." });
    }

    const { orderId, bankCode } = req.body;
    if (!orderId) {
      return res.status(400).json({ success: false, error: "Thiếu mã đơn hàng." });
    }

    const order = await db.getOrderById(orderId);
    if (!order) {
      return res.status(404).json({ success: false, error: "Không tìm thấy đơn hàng." });
    }

    // Only allow VNPay URL creation for vnpay payment method orders
    if (order.payment?.payment_method !== "vnpay") {
      return res.status(400).json({ success: false, error: "Đơn hàng này không sử dụng phương thức VNPay." });
    }

    // Don't create URL if already paid
    if (order.payment?.payment_status === "paid") {
      return res.status(400).json({ success: false, error: "Đơn hàng đã được thanh toán." });
    }

    const ipAddr = req.headers["x-forwarded-for"]?.split(",")[0]?.trim()
      || req.connection?.remoteAddress
      || req.socket?.remoteAddress
      || "127.0.0.1";

    const paymentUrl = createPaymentUrl({
      orderId: order.id,
      amount: order.total_amount || order.totalAmount,
      orderInfo: `Maison Rue - Thanh toan don hang ${order.id}`,
      ipAddr,
      bankCode: bankCode || "", // "" = show all payment methods (including QR)
    });

    return res.json({ success: true, paymentUrl });
  } catch (err) {
    console.error("[VNPay] Create URL error:", err);
    return res.status(500).json({ success: false, error: err.message || "Lỗi tạo link thanh toán VNPay." });
  }
});

/**
 * GET /api/payments/vnpay/return
 * VNPay redirects the customer's browser here after payment.
 * We verify the signature and redirect to the frontend result page.
 */
router.get("/vnpay/return", async (req, res) => {
  try {
    const result = verifyVnpaySignature(req.query);
    const clientUrl = process.env.CLIENT_ORIGIN || "http://localhost:5173";

    if (!result.isValid) {
      console.warn("[VNPay Return] Invalid signature for order:", result.orderId);
      return res.redirect(`${clientUrl}/payment/result?orderId=${result.orderId}&status=error&code=97`);
    }

    // Successful payment
    if (result.responseCode === "00" && result.transactionStatus === "00") {
      // Update payment status in database
      try {
        await db.confirmPayment({
          orderId: result.orderId,
          transactionReference: `VNPAY-${result.transactionNo}`,
          note: `VNPay auto-confirm. Bank: ${result.bankCode}. Transaction: ${result.transactionNo}`,
          confirmedBy: "VNPAY_GATEWAY",
        });
      } catch (dbErr) {
        // IPN will handle this if return fails
        console.warn("[VNPay Return] DB update failed, IPN will retry:", dbErr.message);
      }

      return res.redirect(`${clientUrl}/payment/result?orderId=${result.orderId}&status=success&transactionNo=${result.transactionNo}`);
    }

    // Payment failed or cancelled
    return res.redirect(`${clientUrl}/payment/result?orderId=${result.orderId}&status=failed&code=${result.responseCode}`);
  } catch (err) {
    console.error("[VNPay Return] Error:", err);
    const clientUrl = process.env.CLIENT_ORIGIN || "http://localhost:5173";
    return res.redirect(`${clientUrl}/payment/result?status=error`);
  }
});

/**
 * GET /api/payments/vnpay/ipn
 * VNPay server-to-server Instant Payment Notification.
 * No authentication required — VNPay calls this directly.
 * Must respond with { RspCode, Message } JSON.
 */
router.get("/vnpay/ipn", async (req, res) => {
  try {
    const result = verifyVnpaySignature(req.query);

    if (!result.isValid) {
      console.warn("[VNPay IPN] Invalid checksum for TxnRef:", result.orderId);
      return res.json({ RspCode: "97", Message: "Invalid Checksum" });
    }

    // Find the order
    const order = await db.getOrderById(result.orderId);
    if (!order) {
      console.warn("[VNPay IPN] Order not found:", result.orderId);
      return res.json({ RspCode: "01", Message: "Order not found" });
    }

    // Check amount matches
    const expectedAmount = order.total_amount || order.totalAmount || 0;
    if (Math.abs(result.amount - expectedAmount) > 1) {
      console.warn(`[VNPay IPN] Amount mismatch for ${result.orderId}: expected ${expectedAmount}, got ${result.amount}`);
      return res.json({ RspCode: "04", Message: "Invalid Amount" });
    }

    // Check if already processed
    if (order.payment?.payment_status === "paid") {
      // Already confirmed — respond success to stop VNPay retries
      return res.json({ RspCode: "00", Message: "Confirm Success" });
    }

    // Payment success
    if (result.responseCode === "00" && result.transactionStatus === "00") {
      try {
        const updatedOrder = await db.confirmPayment({
          orderId: result.orderId,
          transactionReference: `VNPAY-${result.transactionNo}`,
          note: `VNPay IPN confirmed. Bank: ${result.bankCode}. Transaction: ${result.transactionNo}`,
          confirmedBy: "VNPAY_IPN",
        });

        // Send order confirmation email after successful VNPay payment
        if (updatedOrder) {
          await sendOrderConfirmationEmail(updatedOrder).catch((e) =>
            console.warn("[VNPay IPN] Email failed:", e?.message || e)
          );
        }

        console.log(`[VNPay IPN] Payment confirmed for order ${result.orderId}`);
        return res.json({ RspCode: "00", Message: "Confirm Success" });
      } catch (dbErr) {
        console.error("[VNPay IPN] DB confirm failed:", dbErr);
        return res.json({ RspCode: "99", Message: "Unknown error" });
      }
    }

    // Transaction failed at VNPay
    console.warn(`[VNPay IPN] Transaction failed for ${result.orderId}: code=${result.responseCode}`);
    return res.json({ RspCode: "00", Message: "Confirm Success" });
  } catch (err) {
    console.error("[VNPay IPN] Unexpected error:", err);
    return res.json({ RspCode: "99", Message: "Unknown error" });
  }
});

/**
 * GET /api/payments/vnpay/order-status/:orderId
 * Check the payment status of an order (for polling after redirect).
 */
router.get("/vnpay/order-status/:orderId", optionalAuth, async (req, res) => {
  try {
    const order = await db.getOrderById(req.params.orderId);
    if (!order) {
      return res.status(404).json({ success: false, error: "Không tìm thấy đơn hàng." });
    }

    return res.json({
      success: true,
      orderId: order.id,
      paymentStatus: order.payment?.payment_status || "unknown",
      paymentMethod: order.payment?.payment_method || "unknown",
      transactionReference: order.payment?.transaction_reference || null,
    });
  } catch (err) {
    console.error("[VNPay] Order status check error:", err);
    return res.status(500).json({ success: false, error: "Lỗi kiểm tra trạng thái thanh toán." });
  }
});

export default router;

