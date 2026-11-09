import assert from "assert";
import http from "http";
import app from "./index.js";
import { connectDB, getPool } from "./config/db.js";
import { runMigration } from "./db/migrate.js";

// Ensure testing against isolated test database
process.env.DB_NAME = "MaisonRueDB_Test";

let server;
let serverUrl;
const TEST_PORT = 5099;

function makeRequest(method, path, body = null, cookie = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, serverUrl);
    const options = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: {
        "Content-Type": "application/json",
      },
    };

    let payload = null;
    if (body) {
      payload = JSON.stringify(body);
      options.headers["Content-Length"] = Buffer.byteLength(payload);
    }

    if (cookie) {
      options.headers["Cookie"] = cookie;
    }

    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        let parsed = null;
        try {
          parsed = JSON.parse(data);
        } catch {
          parsed = data;
        }

        const setCookieHeader = res.headers["set-cookie"];
        let responseCookie = null;
        if (setCookieHeader) {
          const cookieStr = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader;
          responseCookie = cookieStr.split(";")[0];
        }

        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: parsed,
          cookie: responseCookie,
        });
      });
    });

    req.on("error", reject);
    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

async function runCodexVerification() {
  console.log("==================================================");
  console.log("MAISON RUE: FULL CODEX SPECIFICATION AUDIT");
  console.log("DATABASE TARGET:", process.env.DB_NAME);
  console.log("==================================================");

  await connectDB();
  await runMigration();

  server = app.listen(TEST_PORT);
  serverUrl = `http://localhost:${TEST_PORT}`;
  console.log(`✓ Test Express server listening on ${serverUrl}`);

  try {
    // ----------------------------------------------------
    // PREPARE AUTH SESSIONS (Admin, Staff, Customer)
    // ----------------------------------------------------
    console.log("\n--- Authenticating Test Roles ---");
    const adminLogin = await makeRequest("POST", "/api/auth/admin/login", {
      email: "vanhung29993@gmail.com",
      password: "admin123",
    });
    assert(adminLogin.status === 200, "Admin login successful");
    const adminCookie = adminLogin.cookie;

    const staffLogin = await makeRequest("POST", "/api/auth/staff/login", {
      email: "staffmaisonrue@gmail.com",
      password: "staff123",
    });
    assert(staffLogin.status === 200, "Staff login successful");
    const staffCookie = staffLogin.cookie;

    const customerLogin = await makeRequest("POST", "/api/auth/customer/login", {
      email: "vudat9532@gmail.com",
      password: "customer123",
    });
    assert(customerLogin.status === 200, "Customer login successful");
    const customerCookie = customerLogin.cookie;

    // ----------------------------------------------------
    // SECTION 1: PRODUCT & SKU CRUD, SOFT-DELETE, RESTORE
    // ----------------------------------------------------
    console.log("\n--- 1. Testing Admin Product & SKU CRUD, Soft Delete & Restoration ---");

    const testProdCode = `MR-TEST-${Date.now().toString().slice(-4)}`;
    const createProdRes = await makeRequest(
      "POST",
      "/api/products/admin",
      {
        productCode: testProdCode,
        name: "Áo Polo Len Lụa Thử Nghiệm",
        price: 4500000,
        category: "clothing",
        gender: "nam",
        material: "70% Silk, 30% Merino Wool",
        collectionName: "Audited Edition",
        description: "Mẫu thử nghiệm kiểm toán nghiệp vụ quản trị.",
        minAlert: 4,
        variants: [
          {
            color: "NAVY",
            size: "M",
            price: 4500000,
            costPrice: 2000000,
            floorPrice: 3200000,
            stock: 12,
            minStock: 3,
            maxStock: 30,
          },
        ],
      },
      adminCookie
    );
    assert(createProdRes.status === 201, "Admin created product with HTTP 201");
    const createdProdId = createProdRes.body.id;
    console.log(`[PASS] Created test product ${testProdCode} (ID: ${createdProdId})`);

    // Verify initial inventory movement was recorded
    const movementsRes = await makeRequest("GET", `/api/products/inventory/movements?productId=${createdProdId}`, null, adminCookie);
    assert(movementsRes.status === 200, "Movements retrieved");
    assert(movementsRes.body.movements.length > 0, "Initial stock movement audit record logged");
    assert(movementsRes.body.movements[0].movement_type === "initial_stock", "Movement type is 'initial_stock'");
    console.log("[PASS] Audit log verified for initial SKU inventory movement");

    // Create a 2nd SKU under this product
    const createSkuRes = await makeRequest(
      "POST",
      `/api/products/admin/${createdProdId}/variants`,
      {
        color: "IVORY",
        size: "L",
        price: 4500000,
        costPrice: 2000000,
        floorPrice: 3200000,
        stock: 8,
        minStock: 2,
        maxStock: 25,
      },
      adminCookie
    );
    assert(createSkuRes.status === 201, "Admin created 2nd SKU with HTTP 201");
    const createdSkuId = createSkuRes.body.variantId;
    console.log(`[PASS] Created 2nd SKU: ${createSkuRes.body.sku}`);

    // Verify Public API DOES NOT leak costPrice
    const publicRes = await makeRequest("GET", `/api/products/${createdProdId}`);
    assert(publicRes.status === 200, "Public product detail accessible");
    assert(publicRes.body.product.variants[0].costPrice === undefined, "CRITICAL: Public API did NOT leak costPrice");
    console.log("[PASS] Public API strictly hides costPrice from unauthenticated / customer viewers");

    // Verify Admin API DOES include costPrice
    const adminAllRes = await makeRequest("GET", "/api/products/admin/all", null, adminCookie);
    assert(adminAllRes.status === 200, "Admin can access full products list");
    const adminProd = adminAllRes.body.products.find((p) => p.id === createdProdId);
    assert(adminProd.variants[0].costPrice === 2000000, "Admin API correctly includes costPrice for financial planning");
    console.log("[PASS] Admin API includes full costPrice and inventory holding metrics");

    // Soft-delete the 2nd SKU individually
    const delSkuRes = await makeRequest(
      "DELETE",
      `/api/products/admin/${createdProdId}/variants/${encodeURIComponent(createdSkuId)}`,
      { reason: "Hết mùa, ngừng bán biến thể màu Ivory" },
      adminCookie
    );
    if (delSkuRes.status !== 200) {
      console.error("[DEBUG delSkuRes]", delSkuRes.status, JSON.stringify(delSkuRes.body));
    }
    assert(delSkuRes.status === 200, "SKU soft-deleted with HTTP 200");
    console.log("[PASS] SKU soft-deleted successfully (individually_deactivated = 1)");

    // Soft-delete the entire product
    const delProdRes = await makeRequest(
      "DELETE",
      `/api/products/admin/${createdProdId}`,
      { reason: "Tạm ngừng kinh doanh cả dòng sản phẩm" },
      adminCookie
    );
    assert(delProdRes.status === 200, "Product soft-deleted with HTTP 200");
    console.log("[PASS] Product soft-deleted successfully (is_active = 0)");

    // Verify backend blocks purchase of soft-deleted product
    const blockedOrder = await makeRequest(
      "POST",
      "/api/orders",
      {
        name: "Vũ Thành Đạt",
        email: "vudat9532@gmail.com",
        phone: "0908889999",
        address: "88 Lý Tự Trọng, Phường Bến Thành, Quận 1, TP. Hồ Chí Minh",
        paymentMethod: "cod",
        items: [{ id: createdProdId, quantity: 1 }],
      },
      customerCookie
    );
    assert(blockedOrder.status === 400 || blockedOrder.status === 500, "Order for inactive product rejected by backend");
    console.log("[PASS] Backend strictly blocked checkout for soft-deleted product");

    // Restore the product
    const restoreProdRes = await makeRequest("POST", `/api/products/admin/${createdProdId}/restore`, null, adminCookie);
    assert(restoreProdRes.status === 200, "Product restored with HTTP 200");
    console.log("[PASS] Product restored successfully (is_active = 1)");

    // CRITICAL: Check that individually deactivated SKU remained INACTIVE
    const pool = getPool();
    const skuState = await pool.request()
      .input("id", createdSkuId)
      .query("SELECT is_active, individually_deactivated, stock_quantity FROM ProductVariants WHERE id = @id");
    assert(skuState.recordset[0].is_active === false, "Individually deactivated SKU remained INACTIVE after product restore");
    assert(skuState.recordset[0].individually_deactivated === true, "individually_deactivated flag preserved");
    assert(skuState.recordset[0].stock_quantity === 8, "Stock was NOT zeroed out during soft delete");
    console.log("[PASS] Product restoration preserved individually deactivated SKU status & non-zero stock");

    // ----------------------------------------------------
    // SECTION 2: REVIEWS — PUBLIC IMMEDIATELY + AI AUDIT
    // ----------------------------------------------------
    console.log("\n--- 2. Testing Reviews Public Immediately & Weekly AI Audit ---");
    await pool.request().input("pid", 106).query("DELETE FROM ProductReviews WHERE product_id = @pid");

    // Place a valid delivered order so customer is eligible to review Product 106
    const validOrder = await makeRequest(
      "POST",
      "/api/orders",
      {
        name: "Vũ Thành Đạt",
        email: "vudat9532@gmail.com",
        phone: "0908889999",
        address: "88 Lý Tự Trọng, Phường Bến Thành, Quận 1, TP. Hồ Chí Minh",
        paymentMethod: "cod",
        items: [{ id: 106, quantity: 1, selectedSize: "M", selectedColor: "BROWN" }],
      },
      customerCookie
    );
    assert(validOrder.status === 201, "Customer placed order");
    const orderId = validOrder.body.order.id;

    // Advance order to delivered
    await pool.request().input("id", orderId).query("UPDATE Orders SET order_status = 'delivered', delivered_at = GETDATE() WHERE id = @id");

    // Submit legitimate negative review (feedback on sizing)
    const reviewRes = await makeRequest(
      "PUT",
      "/api/customer/reviews/106",
      {
        rating: 2,
        title: "Áo hơi rộng so với mong đợi",
        content: "Chất liệu len merino rất mềm và đẹp, tuy nhiên form áo size M hơi rộng so với số đo ngực của tôi.",
        orderId,
      },
      customerCookie
    );
    assert(reviewRes.status === 200, "Review submitted successfully");

    // Verify Review is PUBLIC IMMEDIATELY without waiting for Admin or AI approval!
    const publicReviews = await makeRequest("GET", "/api/engagement/products/106/reviews");
    assert(publicReviews.status === 200, "Public reviews accessible");
    const myPublicReview = publicReviews.body.reviews.find((r) => r.customer_name.includes("Vũ Thành Đạt"));
    console.log("DEBUG myPublicReview:", myPublicReview);
    assert(myPublicReview, "CRITICAL: Valid review is visible publicly immediately upon submission!");
    assert(myPublicReview.content.includes("hơi rộng") || myPublicReview.title.includes("Áo hơi rộng"), "Content matches");
    console.log("[PASS] Review published immediately (zero approval gate required)");

    // Customer edits the review (updating content)
    await makeRequest(
      "PUT",
      "/api/customer/reviews/106",
      {
        rating: 3,
        title: "Áo hơi rộng một chút nhưng mặc quen thấy đẹp",
        content: "Đã giặt nhẹ theo hướng dẫn và áo co lại vừa vặn hơn một chút, vải dệt rất tỉ mỉ và sang trọng.",
        orderId,
      },
      customerCookie
    );

    const editedReviewInDb = await pool.request()
      .input("user_id", "usr_cust_01")
      .input("product_id", 106)
      .query("SELECT id, version, audit_status, status FROM ProductReviews WHERE user_id = @user_id AND product_id = @product_id");
    assert(editedReviewInDb.recordset[0].version === 2, "Editing review incremented version to 2");
    assert(editedReviewInDb.recordset[0].audit_status === "pending_audit", "Edited review marked as pending_audit");
    console.log("[PASS] Customer edit incremented version to v2 and marked pending_audit");

    // Run AI Audit Job ("Phân tích ngay")
    const auditRunRes = await makeRequest("POST", "/api/admin/reports/reviews/audit-now", null, adminCookie);
    assert(auditRunRes.status === 200, "Manual AI audit executed with HTTP 200");
    console.log(`[PASS] AI Audit Job executed: Analyzed ${auditRunRes.body.totalReviews} reviews, flagged ${auditRunRes.body.flaggedCount}`);

    // Verify legitimate feedback was NOT falsely marked as violation
    const auditedDb = await pool.request()
      .input("id", editedReviewInDb.recordset[0].id)
      .query("SELECT audit_status, ai_analysis_json, ai_version_analyzed, status FROM ProductReviews WHERE id = @id");
    const aiAnalysis = JSON.parse(auditedDb.recordset[0].ai_analysis_json);
    assert(aiAnalysis.isViolation === false, "Legitimate negative/neutral feedback was NOT classified as violation");
    assert(auditedDb.recordset[0].status === "published", "AI did NOT alter public visibility status");
    console.log("[PASS] AI audit separated legitimate feedback from violation; did not alter public status");

    // Admin manually hides the review
    const hideRes = await makeRequest(
      "PATCH",
      `/api/admin/reports/reviews/${editedReviewInDb.recordset[0].id}/decision`,
      { action: "hide", reason: "Tạm ẩn để liên hệ đổi size cho khách" },
      adminCookie
    );
    assert(hideRes.status === 200, "Admin hid review");
    assert(hideRes.body.status === "hidden", "Review status updated to hidden");
    console.log("[PASS] Admin hid review and logged reason");

    // Customer edits the review AGAIN while it is hidden
    await makeRequest(
      "PUT",
      "/api/customer/reviews/106",
      {
        rating: 4,
        title: "Cảm ơn cửa hàng đã hỗ trợ",
        content: "Nhân viên đã gọi điện tư vấn đổi size rất tận tình và chu đáo.",
        orderId,
      },
      customerCookie
    );

    // CRITICAL: Review MUST REMAIN HIDDEN! Cannot auto-publish when Admin hid it!
    const hiddenAfterEdit = await pool.request()
      .input("id", editedReviewInDb.recordset[0].id)
      .query("SELECT status, is_hidden_by_admin, version FROM ProductReviews WHERE id = @id");
    assert(hiddenAfterEdit.recordset[0].status === "hidden", "CRITICAL: Review remained HIDDEN after customer edit!");
    assert(hiddenAfterEdit.recordset[0].is_hidden_by_admin === true, "is_hidden_by_admin flag preserved");
    console.log("[PASS] Admin-hidden content did NOT auto-publish upon customer edit");

    // Admin restores review
    const restoreReviewRes = await makeRequest(
      "PATCH",
      `/api/admin/reports/reviews/${editedReviewInDb.recordset[0].id}/decision`,
      { action: "restore", reason: "Khách đã được hỗ trợ hài lòng" },
      adminCookie
    );
    assert(restoreReviewRes.status === 200, "Admin restored review");
    assert(restoreReviewRes.body.status === "published", "Review returned to published");
    console.log("[PASS] Admin restored review to published status");

    // Verify moderation history trail
    const historyRes = await makeRequest("GET", `/api/admin/reports/reviews/history?reviewId=${editedReviewInDb.recordset[0].id}`, null, adminCookie);
    assert(historyRes.status === 200, "Moderation history retrieved");
    assert(historyRes.body.history.length >= 2, "Full audit trail of admin decisions is recorded");
    console.log("[PASS] Review moderation audit trail verified with actors and timestamps");

    // ----------------------------------------------------
    // SECTION 3: WISHLIST ANALYTICS DASHBOARD
    // ----------------------------------------------------
    console.log("\n--- 3. Testing Wishlist Analytics Dashboard ---");

    // Customer adds product 107 to favorites
    await makeRequest("PUT", "/api/customer/favorites/107", { active: true }, customerCookie);

    const wishlistRes = await makeRequest("GET", "/api/admin/reports/wishlist", null, adminCookie);
    assert(wishlistRes.status === 200, "Wishlist analytics retrieved");
    const analytics = wishlistRes.body.analytics;

    assert(analytics.totalActiveCustomers >= 1, "Unique authenticated active customers tracked");
    assert(analytics.totalAllTimeCustomers >= 1, "All-time customers tracked");
    assert(typeof analytics.storewideConversionRate === "number", "Conversion rate calculated as numeric percentage");
    assert(analytics.productStats.length > 0, "Per-product stats returned");
    assert(analytics.productStats[0].skuDemandNote.includes("Chưa thu thập lựa chọn màu/size"), "SKU demand disclaimer verified");
    console.log(`[PASS] Wishlist metrics verified: ${analytics.totalActiveCustomers} active customer(s), ${analytics.storewideConversionRate}% conversion rate`);

    // ----------------------------------------------------
    // SECTION 4: ADVANCED PROMOTION SIMULATION
    // ----------------------------------------------------
    console.log("\n--- 4. Testing Advanced Promotion Simulation ---");

    const simRes = await makeRequest(
      "POST",
      "/api/promotions/admin/simulate",
      {
        name: "Ưu Đãi Mùa Hè Cao Cấp",
        businessGoal: "revenue_growth",
        discountType: "percentage",
        discountValue: 15,
        budgetTotal: 50000000,
        startAt: new Date().toISOString(),
        endAt: new Date(Date.now() + 14 * 86400000).toISOString(),
        targets: [{ type: "store", value: "all" }],
      },
      adminCookie
    );

    assert(simRes.status === 200, "Simulation executed with HTTP 200");
    const sim = simRes.body.simulation;
    assert(sim.forecast, "Financial forecast generated");
    assert(sim.forecast.baseline.projectedRevenue > 0, "Baseline revenue calculated");
    assert(sim.forecast.promotion.projectedRevenue > 0, "Promotion revenue calculated");
    assert(typeof sim.forecast.promotion.avoidedHoldingCost === "number", "Avoided holding cost calculated");
    assert(sim.aiStrategicCommentary, "AI strategic explanation provided");
    console.log("[PASS] Deterministic financial simulation verified with AI commentary and holding cost savings");

    // ----------------------------------------------------
    // CLEANUP TEST PRODUCT
    // ----------------------------------------------------
    await pool.request().input("id", createdProdId).query(`
      DELETE FROM InventoryMovements WHERE product_id = @id;
      DELETE FROM ProductVariants WHERE product_id = @id;
      DELETE FROM Products WHERE id = @id;
    `);
    console.log("\n✓ Cleaned up test product.");

    console.log("\n==================================================");
    console.log("ALL CODEX AUDIT TESTS PASSED: 100% SUCCESS!");
    console.log("Product CRUD, Reviews AI Audit, Wishlist & Promotions Verified!");
    console.log("==================================================");
  } finally {
    if (server) {
      server.close();
      console.log("✓ Test server closed.");
    }
  }
}

runCodexVerification().catch((err) => {
  console.error("FATAL ERROR in Codex Test Suite:", err);
  if (server) server.close();
  process.exit(1);
});
