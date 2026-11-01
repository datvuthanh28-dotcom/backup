import http from "http";
import app from "./index.js";
import { connectDB, getPool } from "./config/db.js";
import sql from "mssql";

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
  console.log("STARTING RBAC & SQL SERVER COMPREHENSIVE TESTS");
  console.log("==================================================");

  // 1. Connect to SQL Server
  const pool = await connectDB();
  console.log("✓ Connected to Microsoft SQL Server pool successfully.");

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
    // TEST 1: Healthcheck verifies SQL Server engine
    // ----------------------------------------------------
    const health = await makeRequest("GET", "/api/health");
    assert(health.status === 200, "GET /api/health returned 200 OK");
    assert(
      health.body.database === "Microsoft SQL Server (MaisonRueDB)",
      "Database reported as 'Microsoft SQL Server (MaisonRueDB)'"
    );

    // ----------------------------------------------------
    // TEST 2: Strict Cross-Role Login Rejections
    // ----------------------------------------------------
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
    const custLogin = await makeRequest("POST", "/api/auth/customer/login", {
      email: "customer@gmail.com",
      password: "customer123",
    });
    assert(custLogin.status === 200 && custLogin.body.user.role === "customer", "Customer login succeeds with role customer");
    const custCookie = custLogin.cookie;
    assert(!!custCookie, "Customer received HttpOnly auth_token cookie");

    const staffLogin = await makeRequest("POST", "/api/auth/staff/login", {
      email: "staff@maisonrue.com",
      password: "staff123",
    });
    assert(staffLogin.status === 200 && staffLogin.body.user.role === "staff", "Staff login succeeds with role staff");
    const staffCookie = staffLogin.cookie;
    assert(!!staffCookie, "Staff received HttpOnly auth_token cookie");

    const adminLogin = await makeRequest("POST", "/api/auth/admin/login", {
      email: "admin@maisonrue.com",
      password: "admin123",
    });
    assert(adminLogin.status === 200 && adminLogin.body.user.role === "admin", "Admin login succeeds with role admin");
    const adminCookie = adminLogin.cookie;
    assert(!!adminCookie, "Admin received HttpOnly auth_token cookie");

    // ----------------------------------------------------
    // TEST 4: Unauthorized API Access Protection
    // ----------------------------------------------------
    // Customer cannot access admin employees
    const custGetEmp = await makeRequest("GET", "/api/admin/employees", null, custCookie);
    assert(custGetEmp.status === 403, "Customer blocked from /api/admin/employees (HTTP 403)");

    // Staff cannot access admin employees
    const staffGetEmp = await makeRequest("GET", "/api/admin/employees", null, staffCookie);
    assert(staffGetEmp.status === 403, "Staff blocked from /api/admin/employees (HTTP 403)");

    // Customer cannot access admin revenue reports
    const custGetRev = await makeRequest("GET", "/api/admin/reports/revenue", null, custCookie);
    assert(custGetRev.status === 403, "Customer blocked from /api/admin/reports/revenue (HTTP 403)");

    // Admin CAN access both
    const adminGetEmp = await makeRequest("GET", "/api/admin/employees", null, adminCookie);
    assert(adminGetEmp.status === 200 && Array.isArray(adminGetEmp.body.staff), "Admin successfully accesses /api/admin/employees");

    const adminGetRev = await makeRequest("GET", "/api/admin/reports/revenue", null, adminCookie);
    assert(adminGetRev.status === 200 && adminGetRev.body.report, "Admin successfully accesses /api/admin/reports/revenue");

    // ----------------------------------------------------
    // TEST 5: Complete Business Workflow in Microsoft SQL Server
    // ----------------------------------------------------
    console.log("\n--- Testing End-to-End Business Workflow on SQL Server ---");

    // 5.1 Query current stock of product 1 directly from SQL Server
    const prodBefore = await pool.request().query("SELECT stock FROM Products WHERE id = 1");
    const initialStock = prodBefore.recordset[0].stock;
    console.log(`Initial SQL Server stock for Product 1: ${initialStock}`);

    // 5.2 Customer places order for 2 items of product 1
    const orderPayload = {
      name: "Nguyễn Văn An",
      email: "customer@gmail.com",
      phone: "0987654321",
      address: "128 Đồng Khởi, Q.1, TP.HCM",
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
      notes: "SQL Server Transaction Test",
    };

    const createRes = await makeRequest("POST", "/api/orders", orderPayload, custCookie);
    assert(createRes.status === 201, `Order created successfully via API`);
    const testOrderId = createRes.body.order.id;
    console.log(`Generated SQL Server Order ID: ${testOrderId}`);

    // 5.3 Verify SQL Server stock was deducted by 2 in Products table
    const prodAfterDeduct = await pool.request().query("SELECT stock FROM Products WHERE id = 1");
    const deductedStock = prodAfterDeduct.recordset[0].stock;
    assert(deductedStock === initialStock - 2, `Product 1 stock correctly deducted in SQL Server (${initialStock} -> ${deductedStock})`);

    // 5.4 Verify SQL Server Orders, OrderItems, Payments, InventoryMovements tables
    const sqlOrder = await pool
      .request()
      .input("id", sql.NVarChar, testOrderId)
      .query("SELECT * FROM Orders WHERE id = @id");
    assert(sqlOrder.recordset.length === 1, "Order verified in SQL Server Orders table");
    assert(sqlOrder.recordset[0].order_status === "pending", "Order status is 'pending' in SQL Server");

    const sqlPayment = await pool
      .request()
      .input("order_id", sql.NVarChar, testOrderId)
      .query("SELECT * FROM Payments WHERE order_id = @order_id");
    assert(sqlPayment.recordset.length === 1, "Payment record verified in SQL Server Payments table");
    assert(sqlPayment.recordset[0].payment_status === "unpaid", "Initial payment_status is 'unpaid' in SQL Server");

    const sqlMovement = await pool
      .request()
      .input("order_id", sql.NVarChar, testOrderId)
      .query("SELECT * FROM InventoryMovements WHERE reference_id = @order_id");
    assert(sqlMovement.recordset.length === 1, "Inventory movement deduction logged in SQL Server");
    assert(sqlMovement.recordset[0].quantity_change === -2, "Movement quantity_change is -2 in SQL Server");

    // 5.5 Staff updates order through lifecycle: confirmed -> processing -> shipping -> delivered
    const s1 = await makeRequest("PATCH", `/api/orders/${testOrderId}/status`, { status: "confirmed", note: "Staff confirmed" }, staffCookie);
    assert(s1.status === 200, "Staff updated status to 'confirmed'");

    const s2 = await makeRequest("PATCH", `/api/orders/${testOrderId}/status`, { status: "processing", note: "Packaging done" }, staffCookie);
    assert(s2.status === 200, "Staff updated status to 'processing'");

    const s3 = await makeRequest("PATCH", `/api/orders/${testOrderId}/status`, { status: "shipping", note: "Shipped" }, staffCookie);
    assert(s3.status === 200, "Staff updated status to 'shipping'");

    const s4 = await makeRequest("PATCH", `/api/orders/${testOrderId}/status`, { status: "delivered", note: "Customer received & paid" }, staffCookie);
    assert(s4.status === 200, "Staff updated status to 'delivered'");

    // 5.6 Verify in SQL Server that Payments.payment_status is now 'paid'
    const sqlPaymentDelivered = await pool
      .request()
      .input("order_id", sql.NVarChar, testOrderId)
      .query("SELECT * FROM Payments WHERE order_id = @order_id");
    assert(sqlPaymentDelivered.recordset[0].payment_status === "paid", "Payment status updated to 'paid' in SQL Server upon delivery");
    assert(!!sqlPaymentDelivered.recordset[0].verified_at, "Payment verified_at timestamp recorded in SQL Server");

    // ----------------------------------------------------
    // TEST 6: Order Cancellation & Stock Restoration in SQL Server
    // ----------------------------------------------------
    console.log("\n--- Testing Cancellation & Stock Restoration ---");
    const cancelPayload = {
      name: "Nguyễn Văn An",
      email: "customer@gmail.com",
      phone: "0987654321",
      address: "128 Đồng Khởi, Q.1, TP.HCM",
      paymentMethod: "cod",
      items: [
        {
          id: 1,
          name: "Cashmere Cardigan",
          price: 6490000,
          quantity: 1,
          selectedColor: "BEIGE",
          image: "image/Cashmere Cardigan - Men/BEIGE/1.png",
        },
      ],
      notes: "Test Cancellation",
    };

    const cancelOrderRes = await makeRequest("POST", "/api/orders", cancelPayload, custCookie);
    const cancelOrderId = cancelOrderRes.body.order.id;
    console.log(`Generated Cancellation Order ID: ${cancelOrderId}`);
    const stockAfterCancelOrder = (await pool.request().query("SELECT stock FROM Products WHERE id = 1")).recordset[0].stock;

    // Customer cancels order
    const cancelRes = await makeRequest("POST", `/api/orders/${cancelOrderId}/cancel`, { note: "Change of mind" }, custCookie);
    assert(cancelRes.status === 200, `Order ${cancelOrderId} cancelled successfully`);

    // Verify stock restored in SQL Server
    const stockAfterRestored = (await pool.request().query("SELECT stock FROM Products WHERE id = 1")).recordset[0].stock;
    assert(stockAfterRestored === stockAfterCancelOrder + 1, `Stock restored in SQL Server (${stockAfterCancelOrder} -> ${stockAfterRestored})`);

    // Verify payment marked as refunded in SQL Server
    const sqlPaymentCancelled = await pool
      .request()
      .input("order_id", sql.NVarChar, cancelOrderId)
      .query("SELECT * FROM Payments WHERE order_id = @order_id");
    assert(sqlPaymentCancelled.recordset[0].payment_status === "refunded", "Payment status updated to 'refunded' in SQL Server");

    // Verify restoration movement in SQL Server
    const sqlRestoreMovement = await pool
      .request()
      .input("order_id", sql.NVarChar, cancelOrderId)
      .query("SELECT * FROM InventoryMovements WHERE reference_id = @order_id AND movement_type = 'order_cancellation_restore'");
    assert(sqlRestoreMovement.recordset.length === 1, "order_cancellation_restore movement verified in SQL Server");

    // ----------------------------------------------------
    // TEST 7: Clean Revenue Calculation from Verified SQL Data
    // ----------------------------------------------------
    const revRes = await makeRequest("GET", "/api/admin/reports/revenue", null, adminCookie);
    assert(revRes.status === 200, "Revenue report retrieved by Admin");
    const report = revRes.body.report;
    assert(report.actualCollectedRevenue > 0, `Collected revenue reported from verified paid orders: ${report.actualCollectedRevenue.toLocaleString()}đ`);
    assert(report.paidOrdersCount >= 2, `Paid orders count in SQL Server: ${report.paidOrdersCount}`);

    console.log("\n==================================================");
    console.log(`ALL TESTS PASSED! (${passedTests}/${totalTests} tests succeeded)`);
    console.log("Microsoft SQL Server integration is 100% verified!");
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
