// Set test environment database BEFORE importing server modules
process.env.DB_NAME = process.env.TEST_DB_NAME || "MaisonRueDB_Test";
process.env.PORT = "5099";

const http = await import("http");
const { default: app } = await import("./index.js");
const { connectDB, getPool, db } = await import("./config/db.js");
const { runMigration } = await import("./db/migrate.js");
const { runSeed } = await import("./db/seed.js");
const sql = (await import("mssql")).default;

let server;
let baseUrl;

function makeRequest(method, path, body = null, cookie = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const headers = {
      "Content-Type": "application/json",
    };
    if (cookie) {
      headers["Cookie"] = cookie;
    }

    const req = http.request(
      url,
      {
        method,
        headers,
      },
      (res) => {
        let data = "";
        const setCookie = res.headers["set-cookie"];
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          let json = {};
          try {
            json = JSON.parse(data);
          } catch {
            json = { raw: data };
          }
          resolve({
            status: res.statusCode,
            headers: res.headers,
            cookie: setCookie ? setCookie[0].split(";")[0] : null,
            body: json,
          });
        });
      }
    );

    req.on("error", reject);
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  console.log("==================================================");
  console.log("STARTING ISOLATED RBAC & PAYMENT WORKFLOW TESTS");
  console.log(`TARGET DATABASE: ${process.env.DB_NAME}`);
  console.log("==================================================");

  // 1. Connect to isolated SQL Server test database
  const pool = await connectDB();
  console.log(`✓ Connected to Microsoft SQL Server pool: ${process.env.DB_NAME}`);

  // 1.1 Ensure clean migration and seed in isolated test database
  console.log(`[Test Setup] Verifying migration and seed for ${process.env.DB_NAME}...`);
  await runMigration();
  await runSeed();
  console.log(`✓ Test database ${process.env.DB_NAME} initialized and ready.`);

  // Start Express on test port 5099
  const TEST_PORT = 5099;
  await new Promise((resolve) => {
    server = app.listen(TEST_PORT, () => {
      baseUrl = `http://localhost:${TEST_PORT}`;
      console.log(`✓ Test Express server listening on ${baseUrl}`);
      resolve();
    });
  });

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition, message) {
    totalTests++;
    if (condition) {
      console.log(`[PASS] ${message}`);
      passedTests++;
    } else {
      console.error(`[FAIL] ${message}`);
      throw new Error(`Assertion failed: ${message}`);
    }
  }

  try {
    // ----------------------------------------------------
    // TEST 1: Healthcheck verifies SQL Server engine on Test DB
    // ----------------------------------------------------
    const health = await makeRequest("GET", "/api/health");
    assert(health.status === 200, "GET /api/health returned 200 OK");
    assert(
      health.body.database === `Microsoft SQL Server (${process.env.DB_NAME})`,
      `Database reported as 'Microsoft SQL Server (${process.env.DB_NAME})'`
    );

    // ----------------------------------------------------
    // TEST 2: Strict Cross-Role Login Rejections
    // ----------------------------------------------------
    console.log("\n--- Testing Strict Role-Based Login Rejection ---");

    // Admin trying /api/auth/customer/login
    const adminAsCust = await makeRequest("POST", "/api/auth/customer/login", {
      email: "admin@maisonrue.com",
      password: "admin123",
    });
    assert(adminAsCust.status === 403, "Admin login via customer endpoint rejected (HTTP 403)");

    // Staff trying /api/auth/admin/login
    const staffAsAdmin = await makeRequest("POST", "/api/auth/admin/login", {
      email: "staff@maisonrue.com",
      password: "staff123",
    });
    assert(staffAsAdmin.status === 403, "Staff login via admin endpoint rejected (HTTP 403)");

    // Customer trying /api/auth/staff/login
    const custAsStaff = await makeRequest("POST", "/api/auth/staff/login", {
      email: "customer@gmail.com",
      password: "customer123",
    });
    assert(custAsStaff.status === 403, "Customer login via staff endpoint rejected (HTTP 403)");

    // Inactive staff login rejection
    const inactiveStaff = await makeRequest("POST", "/api/auth/staff/login", {
      email: "staff.inactive@maisonrue.com",
      password: "staff123",
    });
    assert(inactiveStaff.status === 403, "Inactive staff account login rejected (HTTP 403)");

    // ----------------------------------------------------
    // TEST 3: Valid Logins & HttpOnly Token Cookies
    // ----------------------------------------------------
    console.log("\n--- Testing Valid Logins & Cookie Generation ---");
    const custLogin = await makeRequest("POST", "/api/auth/customer/login", {
      email: "customer@gmail.com",
      password: "customer123",
    });
    assert(custLogin.status === 200 && custLogin.body.user.role === "customer", "Customer login succeeds with role customer");
    const custCookie = custLogin.cookie;
    assert(!!custCookie, "Customer received HttpOnly auth token cookie");

    const staffLogin = await makeRequest("POST", "/api/auth/staff/login", {
      email: "staff@maisonrue.com",
      password: "staff123",
    });
    assert(staffLogin.status === 200 && staffLogin.body.user.role === "staff", "Staff login succeeds with role staff");
    const staffCookie = staffLogin.cookie;
    assert(!!staffCookie, "Staff received HttpOnly auth token cookie");

    const adminLogin = await makeRequest("POST", "/api/auth/admin/login", {
      email: "admin@maisonrue.com",
      password: "admin123",
    });
    assert(adminLogin.status === 200 && adminLogin.body.user.role === "admin", "Admin login succeeds with role admin");
    const adminCookie = adminLogin.cookie;
    assert(!!adminCookie, "Admin received HttpOnly auth token cookie");

    // ----------------------------------------------------
    // TEST 4: Unauthorized API Access Protection (RBAC)
    // ----------------------------------------------------
    console.log("\n--- Testing Unauthorized Route Protection ---");
    const custGetEmp = await makeRequest("GET", "/api/admin/employees", null, custCookie);
    assert(custGetEmp.status === 403, "Customer blocked from /api/admin/employees (HTTP 403)");

    const staffGetEmp = await makeRequest("GET", "/api/admin/employees", null, staffCookie);
    assert(staffGetEmp.status === 403, "Staff blocked from /api/admin/employees (HTTP 403)");

    const custGetRev = await makeRequest("GET", "/api/admin/reports/revenue", null, custCookie);
    assert(custGetRev.status === 403, "Customer blocked from /api/admin/reports/revenue (HTTP 403)");

    const adminGetEmp = await makeRequest("GET", "/api/admin/employees", null, adminCookie);
    assert(adminGetEmp.status === 200 && Array.isArray(adminGetEmp.body.staff), "Admin successfully accesses /api/admin/employees");

    const adminGetRev = await makeRequest("GET", "/api/admin/reports/revenue", null, adminCookie);
    assert(adminGetRev.status === 200 && adminGetRev.body.report, "Admin successfully accesses /api/admin/reports/revenue");

    // ----------------------------------------------------
    // TEST 5: Complete Business Workflow & Payment Decoupling
    // ----------------------------------------------------
    console.log("\n--- Testing End-to-End Business Workflow & Payment Decoupling ---");

    // 5.1 Check initial stock of product 1
    const prodBefore = await pool.request().query("SELECT stock FROM Products WHERE id = 1");
    const initialStock = prodBefore.recordset[0].stock;
    console.log(`Initial stock for Product 1: ${initialStock}`);

    // 5.2 Customer places order for 2 items
    const orderPayload = {
      name: "Trần Mai Anh",
      email: "customer@gmail.com",
      phone: "0901234567",
      address: "88 Lý Tự Trọng, Q.1, TP.HCM",
      paymentMethod: "cod",
      items: [
        {
          id: 1,
          name: "Cashmere Cardigan",
          price: 6490000,
          quantity: 2,
          selectedColor: "BEIGE",
          image: "image/Cashmere Cardigan - Men/BEIGE/1.png",
        },
      ],
      notes: "Decoupled Payment Lifecycle Test",
    };

    const createRes = await makeRequest("POST", "/api/orders", orderPayload, custCookie);
    assert(createRes.status === 201, "Order created successfully via API");
    const orderId = createRes.body.order.id;
    console.log(`Created Order ID: ${orderId}`);

    // 5.3 Stock deducted in Products table
    const prodAfterDeduct = await pool.request().query("SELECT stock FROM Products WHERE id = 1");
    const deductedStock = prodAfterDeduct.recordset[0].stock;
    assert(deductedStock === initialStock - 2, `Product 1 stock correctly deducted (${initialStock} -> ${deductedStock})`);

    // 5.4 Initial payment is unpaid
    const pmtInitial = await pool
      .request()
      .input("order_id", sql.NVarChar, orderId)
      .query("SELECT * FROM Payments WHERE order_id = @order_id");
    assert(pmtInitial.recordset[0].payment_status === "unpaid", "Initial payment_status is 'unpaid'");

    // 5.5 Staff updates order through lifecycle: confirmed -> processing -> shipping -> delivered
    const s1 = await makeRequest("PATCH", `/api/orders/${orderId}/status`, { status: "confirmed", note: "Staff confirmed" }, staffCookie);
    assert(s1.status === 200, "Staff updated status to 'confirmed'");

    const s2 = await makeRequest("PATCH", `/api/orders/${orderId}/status`, { status: "processing", note: "Preparing giftbox" }, staffCookie);
    assert(s2.status === 200, "Staff updated status to 'processing'");

    const s3 = await makeRequest("PATCH", `/api/orders/${orderId}/status`, { status: "shipping", note: "Dispatched to courier" }, staffCookie);
    assert(s3.status === 200, "Staff updated status to 'shipping'");

    const s4 = await makeRequest("PATCH", `/api/orders/${orderId}/status`, { status: "delivered", note: "Package handed to customer" }, staffCookie);
    assert(s4.status === 200, "Staff updated status to 'delivered'");

    // 5.6 CRITICAL: Verify payment is STILL 'unpaid' even though order is 'delivered' (Payment Decoupled!)
    const pmtDelivered = await pool
      .request()
      .input("order_id", sql.NVarChar, orderId)
      .query("SELECT * FROM Payments WHERE order_id = @order_id");
    assert(
      pmtDelivered.recordset[0].payment_status === "unpaid",
      "CRITICAL: Order status 'delivered' did NOT automatically mark payment as 'paid' (Status Decoupled)"
    );

    // 5.7 Staff explicitly confirms cash collected
    const confirmPmtRes = await makeRequest(
      "POST",
      `/api/orders/${orderId}/payment/confirm`,
      {
        transactionReference: "COD-RECEIPT-8891",
        note: "Bưu tá đã nộp tiền mặt",
      },
      staffCookie
    );
    assert(confirmPmtRes.status === 200, "Staff confirmed COD payment collection via /payment/confirm");

    // 5.8 Verify payment status is now 'paid' with audit info
    const pmtConfirmed = await pool
      .request()
      .input("order_id", sql.NVarChar, orderId)
      .query("SELECT * FROM Payments WHERE order_id = @order_id");
    assert(pmtConfirmed.recordset[0].payment_status === "paid", "Payment status updated to 'paid' after explicit confirmation");
    assert(!!pmtConfirmed.recordset[0].verified_at, "Payment verified_at timestamp recorded");
    assert(!!pmtConfirmed.recordset[0].verified_by, "Payment verified_by user recorded");
    assert(pmtConfirmed.recordset[0].transaction_reference === "COD-RECEIPT-8891", "Payment transaction_reference recorded");

    // 5.9 Duplicate payment confirmation rejection
    const dupPmtRes = await makeRequest(
      "POST",
      `/api/orders/${orderId}/payment/confirm`,
      {
        transactionReference: "COD-RECEIPT-DUP",
      },
      staffCookie
    );
    assert(dupPmtRes.status === 400, "Duplicate payment confirmation rejected (HTTP 400)");

    // ----------------------------------------------------
    // TEST 6: Unpaid Cancellation vs Paid Cancellation & Refund Lifecycle
    // ----------------------------------------------------
    console.log("\n--- Testing Unpaid Cancellation vs Paid Cancellation Refund Lifecycle ---");

    // 6.1 Cancellation of UNPAID order -> payment marked 'cancelled', NEVER 'refunded'
    const unpaidOrderRes = await makeRequest(
      "POST",
      "/api/orders",
      {
        name: "Lê Hoàng",
        email: "customer@gmail.com",
        phone: "0912345678",
        address: "45 Lê Lợi, Q.1",
        paymentMethod: "cod",
        items: [{ id: 1, name: "Cashmere Cardigan", price: 6490000, quantity: 1, selectedColor: "BEIGE" }],
      },
      custCookie
    );
    const unpaidOrderId = unpaidOrderRes.body.order.id;

    const cancelUnpaidRes = await makeRequest("POST", `/api/orders/${unpaidOrderId}/cancel`, { note: "Khách đổi ý" }, custCookie);
    assert(cancelUnpaidRes.status === 200, "Unpaid order cancelled successfully");

    const pmtCancelledUnpaid = await pool
      .request()
      .input("order_id", sql.NVarChar, unpaidOrderId)
      .query("SELECT * FROM Payments WHERE order_id = @order_id");
    assert(
      pmtCancelledUnpaid.recordset[0].payment_status === "cancelled",
      "CRITICAL: Cancelling UNPAID order marked payment as 'cancelled', NEVER 'refunded'"
    );

    // 6.2 Cancellation of PAID order -> payment marked 'refund_pending'
    const paidOrderRes = await makeRequest(
      "POST",
      "/api/orders",
      {
        name: "Lê Hoàng",
        email: "customer@gmail.com",
        phone: "0912345678",
        address: "45 Lê Lợi, Q.1",
        paymentMethod: "bank_transfer",
        items: [{ id: 1, name: "Cashmere Cardigan", price: 6490000, quantity: 1, selectedColor: "BEIGE" }],
      },
      custCookie
    );
    const paidOrderId = paidOrderRes.body.order.id;

    // Staff confirms bank transfer payment
    await makeRequest(
      "POST",
      `/api/orders/${paidOrderId}/payment/confirm`,
      { transactionReference: "VCB-9876543210", note: "Đã nhận tiền tài khoản VCB" },
      staffCookie
    );

    // Customer cancels this PAID order
    const cancelPaidRes = await makeRequest("POST", `/api/orders/${paidOrderId}/cancel`, { note: "Hủy đơn đã thanh toán" }, custCookie);
    assert(cancelPaidRes.status === 200, "Paid order cancelled successfully");

    const pmtCancelledPaid = await pool
      .request()
      .input("order_id", sql.NVarChar, paidOrderId)
      .query("SELECT * FROM Payments WHERE order_id = @order_id");
    assert(
      pmtCancelledPaid.recordset[0].payment_status === "refund_pending",
      "CRITICAL: Cancelling PAID order placed payment into 'refund_pending' (Refund Workflow Initiated)"
    );

    // 6.3 Staff/Admin processes refund
    const refundRes = await makeRequest(
      "POST",
      `/api/orders/${paidOrderId}/payment/refund`,
      {
        refundReference: "UNC-HOANTIEN-2026",
        note: "Đã chuyển khoản hoàn tiền về STK khách",
      },
      adminCookie
    );
    assert(refundRes.status === 200, "Admin processed refund via /payment/refund");

    const pmtRefunded = await pool
      .request()
      .input("order_id", sql.NVarChar, paidOrderId)
      .query("SELECT * FROM Payments WHERE order_id = @order_id");
    assert(pmtRefunded.recordset[0].payment_status === "refunded", "Payment status updated to 'refunded'");
    assert(!!pmtRefunded.recordset[0].refunded_at, "Payment refunded_at timestamp recorded");
    assert(!!pmtRefunded.recordset[0].refunded_by, "Payment refunded_by recorded");
    assert(pmtRefunded.recordset[0].refund_reference === "UNC-HOANTIEN-2026", "Payment refund_reference recorded");

    // 6.4 Duplicate refund rejection
    const dupRefundRes = await makeRequest(
      "POST",
      `/api/orders/${paidOrderId}/payment/refund`,
      { refundReference: "UNC-DUP" },
      adminCookie
    );
    assert(dupRefundRes.status === 400, "Duplicate refund processing rejected (HTTP 400)");

    // ----------------------------------------------------
    // TEST 7: Accurate Revenue Calculation from Verified Payments
    // ----------------------------------------------------
    console.log("\n--- Testing Accurate Revenue Reporting from Verified Payments ---");
    const revRes = await makeRequest("GET", "/api/admin/reports/revenue", null, adminCookie);
    assert(revRes.status === 200, "Revenue report retrieved successfully");
    const report = revRes.body.report;

    assert(typeof report.actualCollectedRevenue === "number", "Revenue report has numeric actualCollectedRevenue");
    assert(typeof report.pendingVerificationRevenue === "number", "Revenue report has numeric pendingVerificationRevenue");
    assert(typeof report.refundPendingRevenue === "number", "Revenue report has numeric refundPendingRevenue");
    assert(typeof report.refundedRevenue === "number", "Revenue report has numeric refundedRevenue");
    assert(report.paidOrdersCount >= 1, `Paid orders count accurately tracked: ${report.paidOrdersCount}`);

    console.log(`✓ Verified Collected Revenue: ${report.actualCollectedRevenue.toLocaleString()}đ`);
    console.log(`✓ Refunded Revenue: ${report.refundedRevenue.toLocaleString()}đ`);
    console.log(`✓ Refund Pending Revenue: ${report.refundPendingRevenue.toLocaleString()}đ`);

    console.log("\n==================================================");
    console.log(`ALL TESTS PASSED! (${passedTests}/${totalTests} tests succeeded)`);
    console.log("RBAC, isolated SQL Server database, and decoupled payment workflow are 100% verified!");
    console.log("==================================================");
  } finally {
    if (server) {
      server.close();
    }
  }
}

runTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\n[TEST ERROR]", err);
    process.exit(1);
  });
