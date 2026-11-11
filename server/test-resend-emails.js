process.env.DB_NAME = process.env.TEST_DB_NAME || "MaisonRueDB_Test";
process.env.PORT = "5098";
process.env.RESEND_FROM_EMAIL = "MAISON RUE <notifications@mail.maisonrue.test>";
process.env.ALERT_EMAILS = "ops@maisonrue.test, warehouse@maisonrue.test";

const http = await import("http");
const { default: app } = await import("./index.js");
const { connectDB, db } = await import("./config/db.js");
const { runMigration } = await import("./db/migrate.js");
const emailService = await import("./services/emailService.js");
const sql = (await import("mssql")).default;

let server;
let baseUrl;

function makeRequest(method, path, body = null, cookie = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const headers = { "Content-Type": "application/json" };
    if (cookie) headers["Cookie"] = cookie;

    const req = http.request(url, { method, headers }, (res) => {
      let data = "";
      const setCookie = res.headers["set-cookie"];
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        let parsedBody;
        try {
          parsedBody = JSON.parse(data);
        } catch {
          parsedBody = { raw: data };
        }
        resolve({
          status: res.statusCode,
          body: parsedBody,
          headers: res.headers,
          cookie: setCookie ? setCookie[0].split(";")[0] : null,
        });
      });
    });

    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function runTests() {
  console.log("==================================================");
  console.log("RESEND BACKEND EMAIL INTEGRATION TESTS");
  console.log(`TARGET DATABASE: ${process.env.DB_NAME}`);
  console.log("==================================================");

  const pool = await connectDB();
  await runMigration();

  const sentCalls = [];
  let mockMode = "success";
  let msgCounter = 1;

  emailService.setResendClientForTesting({
    emails: {
      send: async (payload, options = {}) => {
        if (mockMode === "throw") {
          throw new Error("Socket timeout contacting api.resend.com with re_liveSuperSecretKey9999");
        }
        if (mockMode === "provider_error") {
          return {
            data: null,
            error: {
              name: "rate_limit_exceeded",
              statusCode: 429,
              message: "Upstream error using Bearer tok_123456789 and re_secretLeakCheck12345",
            },
          };
        }
        const id = `re_mock_msg_${msgCounter++}`;
        sentCalls.push({ id, payload, options });
        return { data: { id }, error: null };
      },
    },
  });

  await new Promise((resolve) => {
    server = app.listen(5098, () => {
      baseUrl = "http://localhost:5098";
      resolve();
    });
  });

  let passed = 0;
  let total = 0;
  function assert(condition, label) {
    total++;
    if (condition) {
      console.log(`[PASS] ${label}`);
      passed++;
    } else {
      console.error(`[FAIL] ${label}`);
      throw new Error(`Assertion failed: ${label}`);
    }
  }

  try {
    const custLogin = await makeRequest("POST", "/api/auth/customer/login", {
      email: "vudat9532@gmail.com",
      password: "customer123",
    });
    const staffLogin = await makeRequest("POST", "/api/auth/staff/login", {
      email: "staff@maisonrue.com",
      password: "staff123",
    });
    const adminLogin = await makeRequest("POST", "/api/auth/admin/login", {
      email: "vanhung29993@gmail.com",
      password: "admin123",
    });
    const custCookie = custLogin.cookie;
    const staffCookie = staffLogin.cookie;
    const adminCookie = adminLogin.cookie;
    assert(Boolean(custCookie && staffCookie && adminCookie), "Logged in Customer, Staff, and Admin on isolated Test DB");

    await pool
      .request()
      .query("UPDATE ProductVariants SET stock_quantity = 8, low_stock_threshold = 6, max_stock_threshold = 30 WHERE id = 'v-109-beige-s'");
    await pool
      .request()
      .query("UPDATE Products SET stock = (SELECT ISNULL(SUM(stock_quantity),0) FROM ProductVariants WHERE product_id=109 AND is_active=1) WHERE id = 109");

    await pool.request().query("DELETE FROM EmailNotifications");

    console.log("\n--- Test 1: Order Confirmation & Low-Stock Checkout Alert ---");
    sentCalls.length = 0;
    const createRes = await makeRequest(
      "POST",
      "/api/orders",
      {
        name: "Nguyễn <script>alert('xss')</script> & Khách",
        email: "vudat9532@gmail.com",
        phone: "0909888777",
        address: "88 Lý Tự Trọng, Q.1, TP.HCM",
        paymentMethod: "cod",
        items: [
          {
            id: 109,
            name: "Cashmere Button Cardigan",
            price: 4890000,
            quantity: 3,
            selectedColor: "Beige",
            selectedSize: "S",
            variantId: "v-109-beige-s",
            sku: "MR-109-BEIGE-S",
          },
        ],
      },
      custCookie
    );
    assert(createRes.status === 201 && createRes.body.order?.id, "Customer placed order successfully (HTTP 201)");
    const orderId = createRes.body.order.id;

    const orderConfirmCall = sentCalls.find((c) => c.options.idempotencyKey === `order-confirmation:${orderId}`);
    assert(Boolean(orderConfirmCall), "Order confirmation dispatched via Resend after transaction commit");
    assert(
      orderConfirmCall.payload.to.length === 1 && orderConfirmCall.payload.to[0] === "vudat9532@gmail.com",
      "Order confirmation sent strictly to verified order customer_email"
    );
    assert(
      orderConfirmCall.payload.html.includes("&lt;script&gt;") && !orderConfirmCall.payload.html.includes("<script>alert"),
      "User-supplied HTML characters are escaped in Resend HTML body"
    );
    assert(Boolean(orderConfirmCall.payload.text && orderConfirmCall.payload.text.includes(orderId)), "Plain text body included alongside HTML");

    const lowStockCheckoutCall = sentCalls.find((c) => c.options.idempotencyKey.startsWith(`low-stock:order:${orderId}:`));
    assert(Boolean(lowStockCheckoutCall), "Low stock alert triggered post-checkout when stock dropped to threshold");
    assert(
      lowStockCheckoutCall.payload.to.includes("ops@maisonrue.test") &&
        lowStockCheckoutCall.payload.to.includes("warehouse@maisonrue.test"),
      "Low stock alert sent strictly to backend ALERT_EMAILS recipients"
    );

    const dbOrderConfirm = await db.getEmailNotificationByEventKey(`order-confirmation:${orderId}`);
    assert(
      dbOrderConfirm?.status === "sent" && Boolean(dbOrderConfirm?.provider_message_id),
      "MSSQL EmailNotifications recorded status='sent' and provider_message_id"
    );

    console.log("\n--- Test 2: Duplicate & Concurrency Protection ---");
    const callsBeforeConcurrent = sentCalls.length;
    await Promise.all([
      emailService.sendOrderStatusEmail(createRes.body.order, "confirmed", "Batch test 1"),
      emailService.sendOrderStatusEmail(createRes.body.order, "confirmed", "Batch test 2"),
      emailService.sendOrderStatusEmail(createRes.body.order, "confirmed", "Batch test 3"),
      emailService.sendOrderStatusEmail(createRes.body.order, "confirmed", "Batch test 4"),
      emailService.sendOrderStatusEmail(createRes.body.order, "confirmed", "Batch test 5"),
    ]);
    assert(
      sentCalls.length - callsBeforeConcurrent === 1,
      "5 concurrent triggers for order-status:confirmed sent ONLY 1 Resend email"
    );

    const callsBeforeStock = sentCalls.length;
    const stockUp1 = await makeRequest(
      "PATCH",
      "/api/products/109/variants/v-109-beige-s/stock",
      { stock: 2, minStock: 6, maxStock: 30, note: "Staff kiểm đếm lại tồn kho thực tế" },
      staffCookie
    );
    assert(stockUp1.status === 200, "Staff updated variant stock below min threshold (HTTP 200)");
    assert(sentCalls.length - callsBeforeStock === 1, "Backend sent 1 low stock alert after variant stock commit");

    const todayUtc = new Date().toISOString().slice(0, 10);
    const stockDupRes = await emailService.sendLowStockAlertEmail(
      {
        variantId: "v-109-beige-s",
        sku: "MR-109-BEIGE-S",
        productName: "Cashmere Button Cardigan",
        variantInfo: "Beige - S",
        currentStock: 2,
        minStock: 6,
        note: "Duplicate alert check",
      },
      { contextKey: `manual:v-109-beige-s:${todayUtc}:2:6` }
    );
    assert(stockDupRes.duplicate === true && sentCalls.length - callsBeforeStock === 1, "Repeated identical low-stock contextKey deduplicated (no spam email)");

    console.log("\n--- Test 3: Return Authorized vs Refund Completed & RBAC ---");
    await makeRequest("PATCH", `/api/orders/${orderId}/status`, { status: "confirmed", note: "Xác nhận đơn" }, staffCookie);
    await makeRequest("PATCH", `/api/orders/${orderId}/status`, { status: "processing", note: "Đóng gói đơn hàng" }, staffCookie);
    await makeRequest("PATCH", `/api/orders/${orderId}/status`, { status: "shipping", note: "Giao đơn vị vận chuyển" }, staffCookie);
    await makeRequest("PATCH", `/api/orders/${orderId}/status`, { status: "delivered", note: "Đã giao khách" }, staffCookie);
    await makeRequest("POST", `/api/orders/${orderId}/payment/confirm`, { transactionReference: "COD-TEST-101" }, staffCookie);

    const freshOrder = await db.getOrderById(orderId);
    const orderItemId = freshOrder.items[0].id;

    const callsBeforeReturn = sentCalls.length;
    const returnSubmit = await makeRequest(
      "POST",
      "/api/returns",
      {
        orderId,
        orderItemId,
        requestType: "refund",
        reasonCode: "manufacturing_defect",
        reasonDetail: "Đường may lỗi trên sản phẩm <script>bad</script>",
        quantity: 3,
        customerEmail: "attacker-override@evil.test",
      },
      custCookie
    );
    assert(returnSubmit.status === 201 && returnSubmit.body.request?.status === "manual_review", "High-quantity return entered manual_review");
    const returnId = returnSubmit.body.request.id;
    assert(returnSubmit.body.request.customer_email === "vudat9532@gmail.com", "Return snapshot ignored spoofed client email and saved DB Users.email");
    assert(sentCalls.length === callsBeforeReturn, "manual_review submit sent NO approval or refund email");

    const authRes = await makeRequest(
      "PATCH",
      `/api/returns/${returnId}`,
      { action: "manual_authorize", note: "Chấp thuận gửi hoàn để kiểm định" },
      adminCookie
    );
    assert(authRes.status === 200 && authRes.body.request?.status === "return_authorized", "Admin authorized return for physical inspection");
    const authEmail = sentCalls.find((c) => c.options.idempotencyKey === `return-authorized:${returnId}`);
    const prematureRefundEmail = sentCalls.find((c) => c.options.idempotencyKey === `return-refunded:${returnId}`);
    assert(Boolean(authEmail) && authEmail.payload.to[0] === "vudat9532@gmail.com", "return_authorized email sent to return account snapshot");
    assert(authEmail.payload.html.includes("chưa phải thông báo đã hoàn tiền"), "Authorization email clearly distinguishes authorization from refund");
    assert(!prematureRefundEmail, "CRITICAL: Return authorization did NOT send refund completion email");

    await makeRequest("PATCH", `/api/returns/${returnId}`, { action: "receive", note: "Đã nhận kiện hoàn" }, staffCookie);
    await makeRequest("PATCH", `/api/returns/${returnId}`, { action: "pass_inspection", note: "Kiểm định QC đạt chuẩn" }, staffCookie);

    const staffRefundRes = await makeRequest(
      "PATCH",
      `/api/returns/${returnId}`,
      { action: "refund", refundReference: "UNAUTHORIZED-STAFF", note: "Staff cố hoàn tiền" },
      staffCookie
    );
    assert(staffRefundRes.status === 403, "Staff attempting return financial refund rejected (HTTP 403)");
    assert(!sentCalls.some((c) => c.options.idempotencyKey === `return-refunded:${returnId}`), "Blocked Staff refund sent NO refund email");

    const adminRefundRes = await makeRequest(
      "PATCH",
      `/api/returns/${returnId}`,
      { action: "refund", refundReference: "BANK-REF-8888", note: "Admin đã chuyển khoản hoàn tiền" },
      adminCookie
    );
    assert(adminRefundRes.status === 200 && adminRefundRes.body.request?.status === "refunded", "Admin completed return refund (HTTP 200)");
    const refundEmail = sentCalls.find((c) => c.options.idempotencyKey === `return-refunded:${returnId}`);
    assert(
      Boolean(refundEmail) &&
        refundEmail.payload.to[0] === "vudat9532@gmail.com" &&
        refundEmail.payload.html.includes("BANK-REF-8888"),
      "Admin return refund sent return_refunded email with refund_reference to snapshot email"
    );

    console.log("\n--- Test 4: Direct Order Financial Refund RBAC & Notification ---");
    await pool.request().query("UPDATE ProductVariants SET stock_quantity = 10 WHERE id = 'v-109-beige-s'");
    await pool.request().query("UPDATE Products SET stock = (SELECT ISNULL(SUM(stock_quantity),0) FROM ProductVariants WHERE product_id=109 AND is_active=1) WHERE id = 109");
    const ord2Res = await makeRequest(
      "POST",
      "/api/orders",
      {
        name: "Khách Refund Đơn",
        email: "vudat9532@gmail.com",
        phone: "0909888777",
        address: "88 Lý Tự Trọng, Q.1, TP.HCM",
        paymentMethod: "bank_transfer",
        items: [{ id: 109, variantId: "v-109-beige-s", sku: "MR-109-BEIGE-S", quantity: 1 }],
      },
      custCookie
    );
    const ord2Id = ord2Res.body.order.id;
    await makeRequest("PATCH", `/api/orders/${ord2Id}/status`, { status: "confirmed", note: "Xác nhận" }, staffCookie);
    await makeRequest("POST", `/api/orders/${ord2Id}/payment/confirm`, { transactionReference: "FT-BANK-222" }, staffCookie);

    const staffOrdRefund = await makeRequest(
      "POST",
      `/api/orders/${ord2Id}/payment/refund`,
      { refundReference: "STAFF-NOPE", note: "Thử hoàn" },
      staffCookie
    );
    assert(staffOrdRefund.status === 403, "Staff attempting direct order refund rejected (HTTP 403)");
    assert(!sentCalls.some((c) => c.options.idempotencyKey === `order-refunded:${ord2Id}`), "Blocked Staff order refund sent NO email");

    const adminOrdRefund = await makeRequest(
      "POST",
      `/api/orders/${ord2Id}/payment/refund`,
      { refundReference: "ADM-REFUND-555", note: "Hoàn tiền đơn chuyển khoản" },
      adminCookie
    );
    assert(adminOrdRefund.status === 200, "Admin direct order refund succeeded (HTTP 200)");
    const ordRefundEmail = sentCalls.find((c) => c.options.idempotencyKey === `order-refunded:${ord2Id}`);
    assert(Boolean(ordRefundEmail) && ordRefundEmail.payload.html.includes("ADM-REFUND-555"), "Direct order refund sent email after DB commit");

    console.log("\n--- Test 5: Provider Failure Resilience, Redaction & Admin Retry ---");
    mockMode = "provider_error";
    const ordFailRes = await makeRequest(
      "POST",
      "/api/orders",
      {
        name: "Khách Khi Email Lỗi",
        email: "vudat9532@gmail.com",
        phone: "0909888777",
        address: "88 Lý Tự Trọng, Q.1, TP.HCM",
        paymentMethod: "cod",
        items: [{ id: 109, variantId: "v-109-beige-s", sku: "MR-109-BEIGE-S", quantity: 1 }],
      },
      custCookie
    );
    assert(ordFailRes.status === 201 && Boolean(ordFailRes.body.order?.id), "Order STILL committed (HTTP 201) even when Resend returned an error");
    const ordFailId = ordFailRes.body.order.id;

    const lookupRes = await makeRequest("GET", `/api/orders/${ordFailId}`, null, custCookie);
    assert(lookupRes.status === 200 && lookupRes.body.order?.id === ordFailId, "Customer can still look up order after email delivery failure");

    const failedRow = await db.getEmailNotificationByEventKey(`order-confirmation:${ordFailId}`);
    assert(failedRow?.status === "failed", "EmailNotifications recorded status='failed' on provider error");
    assert(
      !failedRow.error_message.includes("re_secretLeakCheck12345") && failedRow.error_message.includes("re_[REDACTED]"),
      "Secrets redacted cleanly from persisted EmailNotifications.error_message"
    );

    const staffLogRes = await makeRequest("GET", "/api/admin/reports/email-notifications", null, staffCookie);
    assert(staffLogRes.status === 403, "Staff cannot access Admin email notifications ledger (HTTP 403)");

    const adminLogRes = await makeRequest("GET", "/api/admin/reports/email-notifications?status=failed", null, adminCookie);
    assert(
      adminLogRes.status === 200 && adminLogRes.body.notifications.some((n) => n.id === failedRow.id),
      "Admin can inspect failed EmailNotifications entries"
    );

    mockMode = "success";
    const retryRes = await makeRequest("POST", `/api/admin/reports/email-notifications/${failedRow.id}/retry`, null, adminCookie);
    assert(
      retryRes.status === 200 && retryRes.body.success === true && retryRes.body.notification?.status === "sent",
      "Admin retry succeeded and flipped failed record to status='sent'"
    );
    assert(Number(retryRes.body.notification?.attempts) === 2, "Retry incremented attempts counter to 2");

    const retriedCall = sentCalls.find((c) => c.options.idempotencyKey === `order-confirmation:${ordFailId}:attempt-2`);
    assert(Boolean(retriedCall), "Retry used attempt-scoped Resend idempotencyKey");

    const callsBeforeRepeatRetry = sentCalls.length;
    const retryRepeatRes = await makeRequest("POST", `/api/admin/reports/email-notifications/${failedRow.id}/retry`, null, adminCookie);
    assert(
      retryRepeatRes.status === 200 &&
        retryRepeatRes.body.alreadySent === true &&
        sentCalls.length === callsBeforeRepeatRetry,
      "Retrying an already-sent notification is idempotent and does not call Resend again"
    );

    await pool.request().query("UPDATE ProductVariants SET stock_quantity = 15, low_stock_threshold = 3 WHERE id = 'v-109-beige-s'");
    await pool.request().query("UPDATE Products SET stock = (SELECT ISNULL(SUM(stock_quantity),0) FROM ProductVariants WHERE product_id=109 AND is_active=1) WHERE id = 109");

    console.log(`\n==================================================`);
    console.log(`ALL ${passed}/${total} RESEND EMAIL TESTS PASSED`);
    console.log(`==================================================`);
  } finally {
    emailService.resetResendClientForTesting();
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    try {
      await pool.close();
    } catch {}
  }
}

runTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Test suite aborted with error:", err);
    process.exit(1);
  });

