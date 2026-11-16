/**
 * VNPay Payment Gateway Service
 *
 * Implements VNPay payment URL generation, signature verification,
 * and IPN/return URL handling.
 *
 * Configuration is read from process.env:
 *   VNP_TMN_CODE     – Merchant terminal code
 *   VNP_HASH_SECRET  – HMAC-SHA512 shared secret
 *   VNP_URL          – VNPay payment gateway URL
 *   VNP_RETURN_URL   – URL VNPay redirects the customer to after payment
 */

import crypto from "crypto";
import dotenv from "dotenv";
dotenv.config();

const VNP_TMN_CODE = process.env.VNP_TMN_CODE;
const VNP_HASH_SECRET = process.env.VNP_HASH_SECRET;
const VNP_URL = process.env.VNP_URL || "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html";
const VNP_RETURN_URL = process.env.VNP_RETURN_URL || "http://localhost:5173/payment/result";

/**
 * Create a VNPay payment URL.
 *
 * @param {Object} options
 * @param {string} options.orderId      – Internal order ID (e.g. "MR-2026-12345")
 * @param {number} options.amount       – Total amount in VND (integer, e.g. 1500000)
 * @param {string} options.orderInfo    – Short description shown on VNPay
 * @param {string} options.ipAddr       – Customer's IP address
 * @param {string} [options.bankCode]   – Optional bank code. Use "VNPAYQR" for QR, "" for all methods
 * @param {string} [options.locale]     – "vn" (default) or "en"
 * @returns {string} Full VNPay payment URL to redirect the customer
 */
export function createPaymentUrl({ orderId, amount, orderInfo, ipAddr, bankCode = "", locale = "vn" }) {
  if (!VNP_TMN_CODE || !VNP_HASH_SECRET) {
    throw new Error("VNPay configuration missing. Set VNP_TMN_CODE and VNP_HASH_SECRET in .env");
  }

  const now = new Date();
  const createDate = formatVnpDate(now);
  const expireDate = formatVnpDate(new Date(now.getTime() + 15 * 60 * 1000)); // 15 minutes

  const vnpParams = {
    vnp_Version: "2.1.0",
    vnp_Command: "pay",
    vnp_TmnCode: VNP_TMN_CODE,
    vnp_Locale: locale,
    vnp_CurrCode: "VND",
    vnp_TxnRef: orderId,
    vnp_OrderInfo: orderInfo || `Thanh toan don hang ${orderId}`,
    vnp_OrderType: "other",
    vnp_Amount: Math.round(amount * 100), // VNPay expects amount × 100
    vnp_ReturnUrl: VNP_RETURN_URL,
    vnp_IpAddr: ipAddr || "127.0.0.1",
    vnp_CreateDate: createDate,
    vnp_ExpireDate: expireDate,
  };

  if (bankCode) {
    vnpParams.vnp_BankCode = bankCode;
  }

  // Sort parameters alphabetically and build query string
  const sortedParams = sortObject(vnpParams);
  const signData = new URLSearchParams(sortedParams).toString();
  const hmac = crypto.createHmac("sha512", VNP_HASH_SECRET);
  const signed = hmac.update(Buffer.from(signData, "utf-8")).digest("hex");

  sortedParams.vnp_SecureHash = signed;

  const paymentUrl = `${VNP_URL}?${new URLSearchParams(sortedParams).toString()}`;
  return paymentUrl;
}

/**
 * Verify the secure hash from VNPay return URL or IPN callback.
 *
 * @param {Object} vnpParams – The full query parameters from VNPay (req.query)
 * @returns {{ isValid: boolean, responseCode: string, orderId: string, amount: number, transactionNo: string, bankCode: string, payDate: string }}
 */
export function verifyVnpaySignature(vnpParams) {
  const secureHash = vnpParams.vnp_SecureHash;

  // Remove hash fields before re-computing
  const params = { ...vnpParams };
  delete params.vnp_SecureHash;
  delete params.vnp_SecureHashType;

  const sortedParams = sortObject(params);
  const signData = new URLSearchParams(sortedParams).toString();
  const hmac = crypto.createHmac("sha512", VNP_HASH_SECRET);
  const checkSum = hmac.update(Buffer.from(signData, "utf-8")).digest("hex");

  const isValid = secureHash === checkSum;

  return {
    isValid,
    responseCode: vnpParams.vnp_ResponseCode || "",
    transactionStatus: vnpParams.vnp_TransactionStatus || "",
    orderId: vnpParams.vnp_TxnRef || "",
    amount: Number(vnpParams.vnp_Amount || 0) / 100,
    transactionNo: vnpParams.vnp_TransactionNo || "",
    bankCode: vnpParams.vnp_BankCode || "",
    payDate: vnpParams.vnp_PayDate || "",
    orderInfo: vnpParams.vnp_OrderInfo || "",
  };
}

/**
 * Check if VNPay is properly configured.
 */
export function isVnpayConfigured() {
  return !!(VNP_TMN_CODE && VNP_HASH_SECRET && VNP_URL);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function sortObject(obj) {
  const sorted = {};
  const keys = Object.keys(obj).sort();
  for (const key of keys) {
    sorted[key] = obj[key];
  }
  return sorted;
}

function formatVnpDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  const s = String(date.getSeconds()).padStart(2, "0");
  return `${y}${m}${d}${h}${mi}${s}`;
}

