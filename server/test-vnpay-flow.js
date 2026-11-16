/**
 * End-to-end Unit & Integration Test for VNPay Payment Flow
 * Run with: node server/test-vnpay-flow.js
 */

import assert from "assert";
import dotenv from "dotenv";
import {
  createPaymentUrl,
  verifyVnpaySignature,
  isVnpayConfigured,
} from "./services/vnpayService.js";
import { connectDB, db, getPool } from "./config/db.js";

dotenv.config();

async function runTests() {
  console.log("==================================================");
  console.log("MAISON RUE — VNPAY INTEGRATION TEST SUITE");
  console.log("==================================================");

  // 1. Check Configuration
  console.log("\n[Test 1] Checking VNPay Configuration...");
  assert.strictEqual(isVnpayConfigured(), true, "VNPay must be configured in .env");
  console.log("✓ VNPay configuration loaded successfully.");

  // 2. Test Payment URL Generation with VNPAYQR
  console.log("\n[Test 2] Generating Payment URL with QR code (VNPAYQR)...");
  const qrUrl = createPaymentUrl({
    orderId: "MR-TEST-QR-001",
    amount: 1500000,
    orderInfo: "Thanh toan don hang MR-TEST-QR-001",
    ipAddr: "127.0.0.1",
    bankCode: "VNPAYQR",
  });

  const parsedQrUrl = new URL(qrUrl);
  assert.strictEqual(parsedQrUrl.searchParams.get("vnp_Command"), "pay");
  assert.strictEqual(parsedQrUrl.searchParams.get("vnp_BankCode"), "VNPAYQR");
  assert.strictEqual(parsedQrUrl.searchParams.get("vnp_Amount"), "150000000"); // 1,500,000 * 100
  assert.strictEqual(parsedQrUrl.searchParams.get("vnp_TxnRef"), "MR-TEST-QR-001");
  assert.ok(parsedQrUrl.searchParams.get("vnp_SecureHash"), "vnp_SecureHash must be present");
  console.log("✓ VNPAYQR payment URL generated correctly with all required params.");

  // 3. Test Payment URL Generation with General / All Methods
  console.log("\n[Test 3] Generating Payment URL for All Methods...");
  const generalUrl = createPaymentUrl({
    orderId: "MR-TEST-GEN-002",
    amount: 2500000,
    orderInfo: "Thanh toan don hang MR-TEST-GEN-002",
    ipAddr: "127.0.0.1",
    bankCode: "",
  });
  const parsedGenUrl = new URL(generalUrl);
  assert.strictEqual(parsedGenUrl.searchParams.get("vnp_BankCode"), null, "BankCode should be empty for all methods");
  assert.strictEqual(parsedGenUrl.searchParams.get("vnp_Amount"), "250000000");
  console.log("✓ General payment URL generated correctly without bank code restriction.");

  // 4. Test Signature Verification with Valid Data
  console.log("\n[Test 4] Verifying VNPay Signature (Positive Case)...");
  const testParams = {};
  for (const [key, value] of parsedQrUrl.searchParams.entries()) {
    testParams[key] = value;
  }
  const verifyResult = verifyVnpaySignature(testParams);
  assert.strictEqual(verifyResult.isValid, true, "Signature must be valid");
  assert.strictEqual(verifyResult.orderId, "MR-TEST-QR-001");
  assert.strictEqual(verifyResult.amount, 1500000);
  assert.strictEqual(verifyResult.bankCode, "VNPAYQR");
  console.log("✓ Signature verified successfully.");

  // 5. Test Signature Verification with Tampered Data
  console.log("\n[Test 5] Verifying VNPay Signature with Tampered Amount (Negative Case)...");
  const tamperedParams = { ...testParams, vnp_Amount: "99999999" };
  const tamperedResult = verifyVnpaySignature(tamperedParams);
  assert.strictEqual(tamperedResult.isValid, false, "Signature must be invalid when amount is modified");
  console.log("✓ Tampered signature rejected as expected.");

  // 6. Test Database Flow with VNPay Order
  console.log("\n[Test 6] Testing Database Order Creation and VNPay Payment Confirmation...");
  await connectDB();

  // Find a product and customer to create test order
  const products = await db.getAllProducts();
  const sampleProduct = products[0];
  assert.ok(sampleProduct, "Must have at least one product in database");

  const customerRes = await getPool().request().query("SELECT TOP 1 id, email, name FROM Users WHERE role = 'customer'");
  const sampleCustomer = customerRes.recordset[0];
  assert.ok(sampleCustomer, "Must have at least one customer in database");

  const testOrderId = `MR-TEST-VNP-${Date.now()}`;
  const orderData = {
    id: testOrderId,
    customer_id: sampleCustomer.id,
    customer_name: sampleCustomer.name || "VNPay Test Customer",
    customer_email: sampleCustomer.email || "vnpay_test@maisonrue.com",
    customer_phone: "0901234567",
    shipping_address: "123 Le Loi, Ben Nghe, Quan 1, TP Ho Chi Minh",
    shipping_fee: 0,
    total_amount: Number(sampleProduct.price),
    original_subtotal: Number(sampleProduct.price),
    product_discount_total: 0,
    code_discount_total: 0,
    shipping_fee_original: 0,
    shipping_discount_total: 0,
    promotion_code: null,
    promotion_snapshot_json: null,
    notes: "VNPay automated test order",
  };

  const newOrder = await db.createOrderWithTransaction({
    orderData,
    items: [{
      id: sampleProduct.id,
      name: sampleProduct.name,
      price: Number(sampleProduct.price),
      quantity: 1,
      sku: sampleProduct.sku || `SKU-${sampleProduct.id}`,
    }],
    paymentData: { method: "vnpay" },
  });

  assert.strictEqual(newOrder.id, testOrderId);
  assert.strictEqual(newOrder.payment?.payment_method, "vnpay");
  assert.strictEqual(newOrder.payment?.payment_status, "unpaid");
  console.log(`✓ Created test order ${testOrderId} with payment_method 'vnpay' and payment_status 'unpaid'.`);

  // Simulate VNPay Confirm Payment (what IPN / return does)
  const fakeVnpTransactionNo = `VNP${Date.now()}`;
  const confirmedOrder = await db.confirmPayment({
    orderId: testOrderId,
    transactionReference: `VNPAY-${fakeVnpTransactionNo}`,
    note: `VNPay test confirmation. Bank: VNPAYQR. Transaction: ${fakeVnpTransactionNo}`,
    confirmedBy: "VNPAY_GATEWAY_TEST",
  });

  assert.strictEqual(confirmedOrder.payment?.payment_status, "paid");
  assert.strictEqual(confirmedOrder.payment?.transaction_reference, `VNPAY-${fakeVnpTransactionNo}`);
  assert.strictEqual(confirmedOrder.payment?.verified_by, "VNPAY_GATEWAY_TEST");
  console.log(`✓ Payment confirmed for ${testOrderId}: status is now 'paid' with transaction ref 'VNPAY-${fakeVnpTransactionNo}'.`);

  // 7. Test Idempotency (Re-confirming already paid order)
  console.log("\n[Test 7] Testing Idempotency on Re-confirmation...");
  try {
    await db.confirmPayment({
      orderId: testOrderId,
      transactionReference: `VNPAY-${fakeVnpTransactionNo}`,
      note: "Duplicate confirmation",
      confirmedBy: "VNPAY_GATEWAY_TEST",
    });
    assert.fail("Should throw error on re-confirming already paid order");
  } catch (reErr) {
    assert.ok(reErr.message.includes("đã được xác nhận"), "Error must state order already confirmed");
    console.log("✓ Re-confirming paid order rejected idempotently:", reErr.message);
  }

  const pool = getPool();
  if (pool) await pool.close();

  console.log("\n==================================================");
  console.log("ALL VNPAY INTEGRATION TESTS PASSED (7/7)");
  console.log("==================================================");
  process.exit(0);
}

runTests().catch((err) => {
  console.error("\n❌ Test Failed:", err);
  process.exit(1);
});
