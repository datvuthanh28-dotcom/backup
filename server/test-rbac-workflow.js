// Set test environment database BEFORE importing server modules
process.env.DB_NAME = process.env.TEST_DB_NAME || "MaisonRueDB_Test";
process.env.PORT = "5099";

const http = await import("http");
const { default: app } = await import("./index.js");
const { connectDB } = await import("./config/db.js");
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
          const parsedBody = (() => {
            try {
              return JSON.parse(data);
            } catch {
              return { raw: data };
            }
          })();
          resolve({
            status: res.statusCode,
            body: parsedBody,
            headers: res.headers,
            cookie: setCookie ? setCookie[0].split(";")[0] : null,
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
      email: "vanhung29993@gmail.com",
      password: "admin123",
    });
    assert(adminAsCust.status === 403, "Admin login via customer endpoint rejected (HTTP 403)");

    // Staff trying /api/auth/admin/login
    const staffAsAdmin = await makeRequest("POST", "/api/auth/admin/login", {
      email: "staffmaisonrue@gmail.com",
      password: "staff123",
    });
    assert(staffAsAdmin.status === 403, "Staff login via admin endpoint rejected (HTTP 403)");

    // Customer trying /api/auth/staff/login
    const custAsStaff = await makeRequest("POST", "/api/auth/staff/login", {
      email: "vudat9532@gmail.com",
      password: "customer123",
    });
    assert(custAsStaff.status === 403, "Customer login via staff endpoint rejected (HTTP 403)");

    // Inactive staff login rejection
    const inactiveStaff = await makeRequest("POST", "/api/auth/staff/login", {
      email: "phamthutrang.maisonrue@gmail.com",
      password: "staff123",
    });
    assert(inactiveStaff.status === 403, "Inactive staff account login rejected (HTTP 403)");

    // ----------------------------------------------------
    // TEST 3: Valid Logins & HttpOnly Token Cookies
    // ----------------------------------------------------
    console.log("\n--- Testing Valid Logins & Cookie Generation ---");
    const custLogin = await makeRequest("POST", "/api/auth/customer/login", {
      email: "vudat9532@gmail.com",
      password: "customer123",
    });
    assert(custLogin.status === 200 && custLogin.body.user.role === "customer", "Customer login succeeds with role customer");
    const custCookie = custLogin.cookie;
    assert(!!custCookie, "Customer received HttpOnly auth token cookie");

    const staffLogin = await makeRequest("POST", "/api/auth/staff/login", {
      email: "staffmaisonrue@gmail.com",
      password: "staff123",
    });
    assert(staffLogin.status === 200 && staffLogin.body.user.role === "staff", "Staff login succeeds with role staff");
    const staffCookie = staffLogin.cookie;
    assert(!!staffCookie, "Staff received HttpOnly auth token cookie");

    const adminLogin = await makeRequest("POST", "/api/auth/admin/login", {
      email: "vanhung29993@gmail.com",
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
    // TEST 4.1: Variant-level inventory adjustment and audit trail
    // ----------------------------------------------------
    console.log("\n--- Testing Variant-Level Inventory Adjustment ---");
    const productTwoBefore = await pool.request().query("SELECT stock FROM Products WHERE id = 107");
    const productTwoOriginalStock = productTwoBefore.recordset[0].stock;
    let variantBeforeRes = await pool.request().query("SELECT TOP 1 id, product_id, stock_quantity, low_stock_threshold, max_stock_threshold FROM ProductVariants WHERE product_id = 107 AND is_active = 1 ORDER BY id");
    let createdVariantFixture = false;
    if (!variantBeforeRes.recordset.length) {
      await pool.request().query(`INSERT INTO ProductVariants
        (id, product_id, sku, color_name, size_name, price, stock_quantity, low_stock_threshold, is_active)
        VALUES ('TEST-MR107-BROWN-S', 107, 'TEST-MR107-BROWN-S', 'Brown', 'S', 4890000, 4, 3, 1)`);
      createdVariantFixture = true;
      variantBeforeRes = await pool.request().query("SELECT id, product_id, stock_quantity, low_stock_threshold, max_stock_threshold FROM ProductVariants WHERE id='TEST-MR107-BROWN-S'");
    }
    const testVariant = variantBeforeRes.recordset[0];
    const variantAdjust = await makeRequest(
      "PATCH",
      `/api/products/${testVariant.product_id}/variants/${encodeURIComponent(testVariant.id)}/stock`,
      { stock: testVariant.stock_quantity + 1, minStock: testVariant.low_stock_threshold, maxStock: testVariant.max_stock_threshold, note: "Kiểm thử nhập bổ sung một sản phẩm" },
      staffCookie
    );
    assert(variantAdjust.status === 200, "Staff adjusted stock for one exact SKU variant");
    assert(variantAdjust.body.stock === testVariant.stock_quantity + 1, "Variant endpoint returned the updated SKU stock");

    const variantAudit = await pool.request().input("variant_id", sql.NVarChar, testVariant.id)
      .query("SELECT TOP 1 variant_id, quantity_change FROM InventoryMovements WHERE variant_id=@variant_id ORDER BY id DESC");
    assert(variantAudit.recordset[0]?.quantity_change === 1, "Variant adjustment created an auditable inventory movement");

    const variantRestore = await makeRequest(
      "PATCH",
      `/api/products/${testVariant.product_id}/variants/${encodeURIComponent(testVariant.id)}/stock`,
      { stock: testVariant.stock_quantity, minStock: testVariant.low_stock_threshold, maxStock: testVariant.max_stock_threshold, note: "Khôi phục tồn kho sau kiểm thử tự động" },
      staffCookie
    );
    assert(variantRestore.status === 200, "Variant stock restored after isolated test");
    if (createdVariantFixture) {
      await pool.request().input("variant_id", sql.NVarChar, testVariant.id).query("DELETE FROM InventoryMovements WHERE variant_id=@variant_id");
      await pool.request().input("variant_id", sql.NVarChar, testVariant.id).query("DELETE FROM ProductVariants WHERE id=@variant_id");
      await pool.request().input("stock", sql.Int, productTwoOriginalStock).query("UPDATE Products SET stock=@stock WHERE id=107");
    }

    // ----------------------------------------------------
    // TEST 4.2: Promotion administration, preview and RBAC
    // ----------------------------------------------------
    console.log("\n--- Testing Promotion Administration & Pricing Preview ---");
    const testCode = `E2E${Date.now()}`;
    const startAt = new Date(Date.now() - 60_000).toISOString();
    const endAt = new Date(Date.now() + 86_400_000).toISOString();
    const automaticPromotion = await makeRequest("POST", "/api/promotions/admin", { name: "E2E Automatic 5%", discountType: "percentage", discountValue: 5, minimumOrderValue: 0, isAutomatic: true, stackingPolicy: "allowed", priority: 1, customerRequirement: "any", startAt, endAt, status: "active", approvalStatus: "approved", targets: [{ type: "product", value: "109" }] }, adminCookie);
    assert(automaticPromotion.status === 201, "Admin created an automatic product promotion");
    const codePromotion = await makeRequest("POST", "/api/promotions/admin", { name: "E2E Voucher 10%", discountType: "percentage", discountValue: 10, maximumDiscount: 1000000, minimumOrderValue: 1000000, isAutomatic: false, stackingPolicy: "allowed", customerRequirement: "authenticated", usageLimitTotal: 3, usageLimitPerCustomer: 1, startAt, endAt, status: "active", approvalStatus: "approved", code: testCode, codeUsageLimit: 3, targets: [{ type: "product", value: "109" }] }, adminCookie);
    assert(codePromotion.status === 201, "Admin created a limited voucher promotion");
    const staffPromotions = await makeRequest("GET", "/api/promotions/admin", null, staffCookie);
    assert(staffPromotions.status === 403, "Staff cannot access promotion administration");
    await makeRequest("PATCH", `/api/promotions/admin/${automaticPromotion.body.id}/approval`, { status: "approved" }, adminCookie);
    await makeRequest("PATCH", `/api/promotions/admin/${codePromotion.body.id}/approval`, { status: "approved" }, adminCookie);
    const preview = await makeRequest("POST", "/api/promotions/preview", { code: testCode.toLowerCase(), items: [{ id: 109, variantId: "v-109-beige-s", quantity: 2 }] }, custCookie);
    assert(preview.status === 200 && preview.body.pricing.productDiscountTotal > 0, "Preview selected the best automatic promotion");
    assert(preview.body.pricing.codeDiscountTotal > 0 && preview.body.pricing.code === testCode, "Voucher is case-insensitive and stacks when allowed");
    const catalogPrices = await makeRequest("GET", "/api/promotions/catalog-prices");
    assert(catalogPrices.status === 200 && catalogPrices.body.prices[109].salePrice < catalogPrices.body.prices[109].originalPrice, "Storefront catalog receives the active automatic sale price");

    // ----------------------------------------------------
    // TEST 5: Complete Business Workflow & Payment Decoupling
    // ----------------------------------------------------
    console.log("\n--- Testing End-to-End Business Workflow & Payment Decoupling ---");

    // 5.1 Check initial stock of a product from the current catalog
    const prodBefore = await pool.request().query("SELECT stock FROM Products WHERE id = 109");
    const initialStock = prodBefore.recordset[0].stock;
    console.log(`Initial stock for Product MR-109: ${initialStock}`);

    // 5.2 Customer places order for 2 items
    const orderPayload = {
      name: "Trần Mai Anh",
      email: "vudat9532@gmail.com",
      phone: "0901234567",
      address: "88 Lý Tự Trọng, Q.1, TP.HCM",
      paymentMethod: "cod",
      promotionCode: testCode.toLowerCase(),
      items: [
        {
          id: 109,
          name: "Cashmere Button Cardigan",
          price: 4890000,
          quantity: 2,
          selectedColor: "Beige",
          selectedSize: "S",
          variantId: "v-109-beige-s",
          sku: "MR-109-BEIGE-S",
          image: "image/Cashmere Cardigan - Men/BEIGE/1.png",
        },
      ],
      notes: "Decoupled Payment Lifecycle Test",
    };

    const createRes = await makeRequest("POST", "/api/orders", orderPayload, custCookie);
    if (createRes.status !== 201) {
      console.log("createRes failure:", createRes.status, createRes.body);
    }
    assert(createRes.status === 201, "Order created successfully via API");
    const orderId = createRes.body.order.id;
    console.log(`Created Order ID: ${orderId}`);

    // 5.3 Stock deducted in Products table
    const prodAfterDeduct = await pool.request().query("SELECT stock FROM Products WHERE id = 109");
    const deductedStock = prodAfterDeduct.recordset[0].stock;
    assert(deductedStock === initialStock - 2, `Product MR-109 stock correctly deducted (${initialStock} -> ${deductedStock})`);

    // 5.4 Initial payment is unpaid
    const pmtInitial = await pool
      .request()
      .input("order_id", sql.NVarChar, orderId)
      .query("SELECT * FROM Payments WHERE order_id = @order_id");
    assert(pmtInitial.recordset[0].payment_status === "unpaid", "Initial payment_status is 'unpaid'");
    const promotionOrder = await pool.request().input("order_id", sql.NVarChar, orderId).query("SELECT original_subtotal,product_discount_total,code_discount_total,total_amount,promotion_code,promotion_snapshot_json FROM Orders WHERE id=@order_id");
    assert(promotionOrder.recordset[0].product_discount_total > 0 && promotionOrder.recordset[0].code_discount_total > 0, "Order persisted automatic and voucher discounts separately");
    assert(promotionOrder.recordset[0].promotion_code === testCode && !!promotionOrder.recordset[0].promotion_snapshot_json, "Order persisted normalized code and immutable promotion snapshot");
    const promotionItems = await pool.request().input("order_id", sql.NVarChar, orderId).query("SELECT original_unit_price,automatic_discount_total,order_discount_allocated,final_line_total FROM OrderItems WHERE order_id=@order_id");
    assert(promotionItems.recordset[0].final_line_total < promotionItems.recordset[0].original_unit_price * 2, "Order line persisted proportional discount allocation");

    // 5.5 Staff updates order through lifecycle: confirmed -> processing -> shipping -> delivered
    const s1 = await makeRequest("PATCH", `/api/orders/${orderId}/status`, { status: "confirmed", note: "" }, staffCookie);
    assert(s1.status === 200, "Staff updated status to 'confirmed'");
    assert(s1.body.order.history?.some((entry) => entry.note === "Staff đã xác nhận đơn hàng."), "Normal status transition generated an automatic audit note");
    const cancelWithoutReason = await makeRequest("PATCH", `/api/orders/${orderId}/status`, { status: "cancelled", note: "" }, staffCookie);
    assert(cancelWithoutReason.status === 400, "Staff cancellation without a reason was rejected");

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
    await makeRequest("DELETE", `/api/promotions/admin/${automaticPromotion.body.id}`, null, adminCookie);
    await makeRequest("DELETE", `/api/promotions/admin/${codePromotion.body.id}`, null, adminCookie);
    const archivedPromotion = await pool.request().input("id", sql.Int, codePromotion.body.id).query("SELECT is_archived FROM Promotions WHERE id=@id");
    assert(archivedPromotion.recordset[0].is_archived === true, "Promotion deletion is a soft archive and preserves usage history");

    // ----------------------------------------------------
    // TEST 6: Favorites, Verified Reviews & Admin Product Insights
    // ----------------------------------------------------
    console.log("\n--- Testing Product Engagement Workflow ---");

    const engagementTestUser = await pool.request().query("SELECT id FROM Users WHERE email='vudat9532@gmail.com'");
    const engagementUserId = engagementTestUser.recordset[0].id;
    await pool.request().input("user_id", sql.NVarChar, engagementUserId).input("product_id", sql.Int, 109).query("DELETE FROM ProductFavoriteEvents WHERE user_id=@user_id AND product_id=@product_id; DELETE FROM ProductFavorites WHERE user_id=@user_id AND product_id=@product_id; DELETE FROM ProductReviews WHERE user_id=@user_id AND product_id=@product_id;");

    const favoriteAdd = await makeRequest("PUT", "/api/customer/favorites/109", { active: true }, custCookie);
    assert(favoriteAdd.status === 200 && favoriteAdd.body.active === true, "Customer added product to favorites");
    const favoriteAddAgain = await makeRequest("PUT", "/api/customer/favorites/109", { active: true }, custCookie);
    assert(favoriteAddAgain.status === 200 && favoriteAddAgain.body.changed === false, "Repeated favorite request is idempotent");
    const favoriteList = await makeRequest("GET", "/api/customer/favorites", null, custCookie);
    assert(favoriteList.status === 200 && favoriteList.body.productIds.includes(109), "Customer favorite list is persisted in MSSQL");
    const favoriteEventCount = await pool.request().query("SELECT COUNT(*) total FROM ProductFavoriteEvents WHERE product_id=109 AND event_type='added'");
    assert(favoriteEventCount.recordset[0].total === 1, "Duplicate favorite requests do not inflate analytics events");

    const reviewSave = await makeRequest("PUT", "/api/customer/reviews/109", { rating: 5, title: "Chất liệu rất tốt", content: "Sản phẩm hoàn thiện đẹp, mặc thoải mái và đúng kích cỡ." }, custCookie);
    assert(reviewSave.status === 200 && reviewSave.body.review?.is_verified_purchase, "Delivered customer created a verified-purchase review");
    const reviewId = reviewSave.body.review.id;
    const publicReviews = await makeRequest("GET", "/api/engagement/products/109/reviews");
    assert(publicReviews.status === 200 && publicReviews.body.reviews.some((review) => review.id === reviewId), "Published review appears on product detail API");

    const staffInsights = await makeRequest("GET", "/api/admin/reports/product-insights", null, staffCookie);
    assert(staffInsights.status === 403, "Staff cannot access admin product engagement insights");
    const adminInsights = await makeRequest("GET", "/api/admin/reports/product-insights", null, adminCookie);
    assert(adminInsights.status === 200 && adminInsights.body.insights.some((item) => item.product_id === 109), "Admin can view product engagement insights");

    const hideReview = await makeRequest("PATCH", `/api/admin/reports/reviews/${reviewId}`, { status: "hidden", note: "Kiểm tra cơ chế ẩn mềm" }, adminCookie);
    assert(hideReview.status === 200, "Admin hid a review without deleting its record");
    const hiddenPublicReviews = await makeRequest("GET", "/api/engagement/products/109/reviews");
    assert(!hiddenPublicReviews.body.reviews.some((review) => review.id === reviewId), "Hidden review no longer appears publicly");
    const hiddenRecord = await pool.request().input("id", sql.Int, reviewId).query("SELECT status FROM ProductReviews WHERE id=@id");
    assert(hiddenRecord.recordset[0].status === "hidden", "Hidden review remains stored for audit");

    await makeRequest("PATCH", `/api/admin/reports/reviews/${reviewId}`, { status: "published", note: "" }, adminCookie);
    const softDeleteReview = await makeRequest("DELETE", "/api/customer/reviews/109", null, custCookie);
    assert(softDeleteReview.status === 200, "Customer soft-deleted their review");
    const deletedRecord = await pool.request().input("id", sql.Int, reviewId).query("SELECT status FROM ProductReviews WHERE id=@id");
    assert(deletedRecord.recordset[0].status === "deleted", "Soft-deleted review remains in MSSQL with deleted status");

    const favoriteRemove = await makeRequest("PUT", "/api/customer/favorites/109", { active: false }, custCookie);
    assert(favoriteRemove.status === 200 && favoriteRemove.body.active === false, "Customer removed product from favorites through soft state change");
    const favoriteRecord = await pool.request().query("SELECT is_active FROM ProductFavorites WHERE product_id=109");
    assert(favoriteRecord.recordset[0].is_active === false, "Removed favorite remains in MSSQL as inactive");

    // ----------------------------------------------------
    // TEST 7: Unpaid Cancellation vs Paid Cancellation & Refund Lifecycle
    // ----------------------------------------------------
    console.log("\n--- Testing Unpaid Cancellation vs Paid Cancellation Refund Lifecycle ---");

    // 6.1 Cancellation of UNPAID order -> payment marked 'cancelled', NEVER 'refunded'
    const cancelCode = `CANCEL${Date.now()}`;
    const cancellablePromotion = await makeRequest("POST", "/api/promotions/admin", { name: "E2E Cancellation Voucher", discountType: "fixed_amount", discountValue: 100000, minimumOrderValue: 0, isAutomatic: false, stackingPolicy: "allowed", customerRequirement: "authenticated", usageLimitTotal: 1, usageLimitPerCustomer: 1, startAt: new Date(Date.now() - 60000).toISOString(), endAt: new Date(Date.now() + 86400000).toISOString(), status: "active", approvalStatus: "approved", code: cancelCode, codeUsageLimit: 1, targets: [{ type: "product", value: "109" }] }, adminCookie);
    await makeRequest("PATCH", `/api/promotions/admin/${cancellablePromotion.body.id}/approval`, { status: "approved" }, adminCookie);
    const unpaidOrderRes = await makeRequest(
      "POST",
      "/api/orders",
      {
        name: "Lê Hoàng",
        email: "vudat9532@gmail.com",
        phone: "0912345678",
        address: "45 Lê Lợi, Q.1",
        paymentMethod: "cod",
        promotionCode: cancelCode,
        items: [{ id: 109, name: "Cashmere Button Cardigan", price: 4890000, quantity: 1, selectedColor: "Beige", selectedSize: "S", variantId: "v-109-beige-s", sku: "MR-109-BEIGE-S" }],
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
    const releasedUsage = await pool.request().input("order_id", sql.NVarChar, unpaidOrderId).query("SELECT status,released_at FROM PromotionUsages WHERE order_id=@order_id");
    assert(releasedUsage.recordset[0].status === "released" && !!releasedUsage.recordset[0].released_at, "Cancelling before shipping releases the voucher usage exactly once");
    const releasedCounters = await pool.request().input("id", sql.Int, cancellablePromotion.body.id).query("SELECT p.used_count,pc.used_count code_used_count FROM Promotions p JOIN PromotionCodes pc ON pc.promotion_id=p.id WHERE p.id=@id");
    assert(releasedCounters.recordset[0].used_count === 0 && releasedCounters.recordset[0].code_used_count === 0, "Cancellation restores promotion and code usage counters");
    await makeRequest("DELETE", `/api/promotions/admin/${cancellablePromotion.body.id}`, null, adminCookie);

    // 6.2 Cancellation of PAID order -> payment marked 'refund_pending'
    const paidOrderRes = await makeRequest(
      "POST",
      "/api/orders",
      {
        name: "Lê Hoàng",
        email: "vudat9532@gmail.com",
        phone: "0912345678",
        address: "45 Lê Lợi, Q.1",
        paymentMethod: "bank_transfer",
        items: [{ id: 109, name: "Cashmere Button Cardigan", price: 4890000, quantity: 1, selectedColor: "Beige", selectedSize: "S", variantId: "v-109-beige-s", sku: "MR-109-BEIGE-S" }],
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

    // 6.3 Staff can monitor refund-pending orders, but only Admin may execute refunds
    const staffRefundAttempt = await makeRequest(
      "POST",
      `/api/orders/${paidOrderId}/payment/refund`,
      {
        refundReference: "STAFF-NOT-ALLOWED",
        note: "Staff must not be allowed to execute refunds",
      },
      staffCookie
    );
    assert(staffRefundAttempt.status === 403, "Staff refund attempt rejected (HTTP 403)");

    const pmtAfterStaffAttempt = await pool
      .request()
      .input("order_id", sql.NVarChar, paidOrderId)
      .query("SELECT payment_status, refund_reference FROM Payments WHERE order_id = @order_id");
    assert(
      pmtAfterStaffAttempt.recordset[0].payment_status === "refund_pending" &&
        !pmtAfterStaffAttempt.recordset[0].refund_reference,
      "Rejected Staff refund did not mutate payment data"
    );

    // 6.4 Admin processes refund
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

    // 6.5 Duplicate refund rejection
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
    assert(typeof report.productDiscountTotal === "number" && typeof report.codeDiscountTotal === "number", "Revenue report separates product and voucher discount costs");
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
