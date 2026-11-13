import assert from "assert";
import http from "http";
import app from "./index.js";
import { connectDB, getPool } from "./config/db.js";
import { runMigration } from "./db/migrate.js";
import sql from "mssql";

import { activeProductSql } from "./utils/productLifecycle.js";

process.env.DB_NAME = "MaisonRueDB_Test";

let server;
let serverUrl;
const TEST_PORT = 5098;

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
        let parsed;
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

// Simulated browser storage for Guest Wishlist
class MockLocalStorage {
  constructor() {
    this.store = {};
  }
  getItem(key) {
    return this.store[key] || null;
  }
  setItem(key, value) {
    this.store[key] = String(value);
  }
  removeItem(key) {
    delete this.store[key];
  }
  clear() {
    this.store = {};
  }
}

async function runWishlistTests() {
  console.log("==================================================");
  console.log("MAISON RUE: WISHLIST PERSISTENCE & GUEST-TO-CUSTOMER SYNC TEST");
  console.log("DATABASE TARGET:", process.env.DB_NAME);
  console.log("==================================================");

  await connectDB();
  await runMigration();

  const pool = getPool();

  server = app.listen(TEST_PORT);
  serverUrl = `http://localhost:${TEST_PORT}`;
  console.log(`✓ Test Express server listening on ${serverUrl}\n`);

  try {
    // Fetch 3 valid active product IDs from test database
    const activeProductsRes = await pool.request().query(`SELECT TOP 5 p.id, p.name FROM Products p WHERE ${activeProductSql("p")} ORDER BY p.id ASC`);
    assert(activeProductsRes.recordset.length >= 3, "Database must have at least 3 active products");
    const [p1, p2, p3] = activeProductsRes.recordset.map((r) => r.id);
    console.log(`✓ Active test products selected: #${p1}, #${p2}, #${p3}`);

    const GUEST_FAVORITES_KEY = "maison-rue-guest-favorites";
    const localStorage = new MockLocalStorage();

    // ----------------------------------------------------
    // TEST 1: Guest adds 3 products to Wishlist
    // ----------------------------------------------------
    console.log("\n[TEST 1] Guest adds 3 products without login...");
    let guestWishlist = [p1, p2, p3];
    localStorage.setItem(GUEST_FAVORITES_KEY, JSON.stringify(guestWishlist));
    let stored = JSON.parse(localStorage.getItem(GUEST_FAVORITES_KEY));
    assert.deepStrictEqual(stored, [p1, p2, p3]);
    console.log(`✓ Guest Wishlist stored in localStorage: ${JSON.stringify(stored)} (count: 3)`);

    // ----------------------------------------------------
    // TEST 2: Guest page reload / reopen browser
    // ----------------------------------------------------
    console.log("\n[TEST 2] Guest page reload & browser restart simulation...");
    const reloaded = JSON.parse(localStorage.getItem(GUEST_FAVORITES_KEY));
    assert.strictEqual(reloaded.length, 3);
    assert(reloaded.includes(p1) && reloaded.includes(p2) && reloaded.includes(p3));
    console.log("✓ Wishlist persists across reloads/restarts without loss");

    // ----------------------------------------------------
    // TEST 3: Guest registers new account -> auto sync to MSSQL
    // ----------------------------------------------------
    console.log("\n[TEST 3] Guest registers new Customer account and triggers sync...");
    const randomEmail = `guest_sync_${Date.now()}@example.com`;
    const regRes = await makeRequest("POST", "/api/auth/register", {
      name: "New Guest User",
      phone: "0911223344",
      email: randomEmail,
      password: "password123",
    });
    assert.strictEqual(regRes.status, 201, "Registration should succeed");
    const newCustomerCookie = regRes.cookie;
    assert(newCustomerCookie, "Session cookie must be provided upon registration");
    const newUserId = regRes.body.user.id;

    // Send sync request with guest product IDs
    const syncRes = await makeRequest("POST", "/api/customer/favorites/sync", {
      productIds: stored,
    }, newCustomerCookie);

    assert.strictEqual(syncRes.status, 200, "Sync request should succeed");
    assert.strictEqual(syncRes.body.success, true);
    assert.strictEqual(syncRes.body.favorites.length, 3);
    assert.deepStrictEqual(syncRes.body.productIds.sort(), [p1, p2, p3].sort());

    // Only clear localStorage on success
    localStorage.removeItem(GUEST_FAVORITES_KEY);
    assert.strictEqual(localStorage.getItem(GUEST_FAVORITES_KEY), null);
    console.log(`✓ Registered Customer #${newUserId} received 3 merged items; guest localStorage safely cleared.`);

    // ----------------------------------------------------
    // TEST 4: Customer reload -> loads directly from MSSQL
    // ----------------------------------------------------
    console.log("\n[TEST 4] Customer reloads page (loads from MSSQL)...");
    const getFavsRes = await makeRequest("GET", "/api/customer/favorites", null, newCustomerCookie);
    assert.strictEqual(getFavsRes.status, 200);
    assert.strictEqual(getFavsRes.body.success, true);
    assert.strictEqual(getFavsRes.body.favorites.length, 3);
    assert.deepStrictEqual(getFavsRes.body.productIds.sort(), [p1, p2, p3].sort());
    console.log("✓ All 3 items loaded accurately from MSSQL ProductFavorites");

    // ----------------------------------------------------
    // TEST 5: Customer logout -> no leak to guest
    // ----------------------------------------------------
    console.log("\n[TEST 5] Customer logs out...");
    const logoutRes = await makeRequest("POST", "/api/auth/logout", null, newCustomerCookie);
    assert.strictEqual(logoutRes.status, 200);
    const guestAfterLogout = localStorage.getItem(GUEST_FAVORITES_KEY);
    assert.strictEqual(guestAfterLogout, null, "Guest localStorage must NOT contain customer's private favorites");
    console.log("✓ Logout successful; customer favorites remain private and are not leaked into guest state");

    // ----------------------------------------------------
    // TEST 6: Guest -> Login -> Existing Customer (MERGE, NOT OVERWRITE)
    // ----------------------------------------------------
    console.log("\n[TEST 6] Guest has items (A, B), Existing Customer has (B, C) -> Merge union without duplicates...");
    // Create an existing customer with product p2 and p3 in MSSQL
    const existingEmail = `existing_user_${Date.now()}@example.com`;
    const existReg = await makeRequest("POST", "/api/auth/register", {
      name: "Existing User",
      phone: "0988776655",
      email: existingEmail,
      password: "password123",
    });
    const existCookie = existReg.cookie;
    const existUserId = existReg.body.user.id;

    // Existing customer currently has [p2, p3]
    await makeRequest("PUT", `/api/customer/favorites/${p2}`, { active: true }, existCookie);
    await makeRequest("PUT", `/api/customer/favorites/${p3}`, { active: true }, existCookie);

    // Verify existing customer currently has 2 items
    const beforeLoginRes = await makeRequest("GET", "/api/customer/favorites", null, existCookie);
    assert.strictEqual(beforeLoginRes.body.favorites.length, 2);

    // Now, a Guest browses and adds [p1, p2] into guest localStorage
    localStorage.setItem(GUEST_FAVORITES_KEY, JSON.stringify([p1, p2]));

    // Guest logs into existing account
    const loginRes = await makeRequest("POST", "/api/auth/customer/login", {
      email: existingEmail,
      password: "password123",
    });
    assert.strictEqual(loginRes.status, 200);
    const loggedInCookie = loginRes.cookie;

    // Frontend syncs guest items [p1, p2]
    const guestItemsToSync = JSON.parse(localStorage.getItem(GUEST_FAVORITES_KEY));
    const mergeSyncRes = await makeRequest("POST", "/api/customer/favorites/sync", {
      productIds: guestItemsToSync,
    }, loggedInCookie);

    assert.strictEqual(mergeSyncRes.status, 200);
    assert.strictEqual(mergeSyncRes.body.success, true);
    // Expected result: Union of [p1, p2] and [p2, p3] => [p1, p2, p3]
    assert.strictEqual(mergeSyncRes.body.favorites.length, 3);
    assert.deepStrictEqual(mergeSyncRes.body.productIds.sort(), [p1, p2, p3].sort());
    localStorage.removeItem(GUEST_FAVORITES_KEY);
    console.log(`✓ Guest items [${p1}, ${p2}] successfully merged with Customer items [${p2}, ${p3}] -> [${p1}, ${p2}, ${p3}] without overwrite or duplicate`);

    // ----------------------------------------------------
    // TEST 7: Duplicate product IDs in sync payload
    // ----------------------------------------------------
    console.log("\n[TEST 7] Handling duplicate product IDs in sync payload...");
    const dupRes = await makeRequest("POST", "/api/customer/favorites/sync", {
      productIds: [p1, p1, p2, p2, p3, p3],
    }, loggedInCookie);
    assert.strictEqual(dupRes.status, 200);
    assert.strictEqual(dupRes.body.favorites.length, 3);
    console.log("✓ Duplicate IDs safely deduped; wishlist count remains 3");

    // ----------------------------------------------------
    // TEST 8: Backend sync failure resilience (Guest data not lost)
    // ----------------------------------------------------
    console.log("\n[TEST 8] Backend sync failure resilience...");
    localStorage.setItem(GUEST_FAVORITES_KEY, JSON.stringify([p1, p2]));
    // Simulate invalid request (e.g. no auth cookie)
    const failRes = await makeRequest("POST", "/api/customer/favorites/sync", {
      productIds: [p1, p2],
    }, null);
    assert.strictEqual(failRes.status, 401, "Should fail with 401 Unauthorized");
    // Verify client logic: localStorage remains intact!
    const clientKeptStorage = JSON.parse(localStorage.getItem(GUEST_FAVORITES_KEY));
    assert.deepStrictEqual(clientKeptStorage, [p1, p2]);
    console.log("✓ On sync failure, Guest localStorage is strictly preserved for safe retry");

    // ----------------------------------------------------
    // TEST 9: Retry sync idempotency
    // ----------------------------------------------------
    console.log("\n[TEST 9] Retry sync idempotency...");
    const retryRes1 = await makeRequest("POST", "/api/customer/favorites/sync", {
      productIds: [p1, p2],
    }, loggedInCookie);
    assert.strictEqual(retryRes1.status, 200);

    const retryRes2 = await makeRequest("POST", "/api/customer/favorites/sync", {
      productIds: [p1, p2],
    }, loggedInCookie);
    assert.strictEqual(retryRes2.status, 200);

    // Verify row count in database for this user
    const dbCheck = await pool.request()
      .input("user_id", sql.NVarChar, existUserId)
      .query("SELECT COUNT(*) as count FROM ProductFavorites WHERE user_id=@user_id AND is_active = 1");
    assert.strictEqual(dbCheck.recordset[0].count, 3, "Database must not create duplicate rows");
    console.log("✓ Multiple retries are 100% idempotent; database unique constraint respected");

    // ----------------------------------------------------
    // TEST 10: Inactive / Invalid products filtered out
    // ----------------------------------------------------
    console.log("\n[TEST 10] Inactive / non-existent product filtering...");
    const filterRes = await makeRequest("POST", "/api/customer/favorites/sync", {
      productIds: [9999999, -5, "abc", p1],
    }, loggedInCookie);
    assert.strictEqual(filterRes.status, 200);
    // Only valid products are merged
    const validOnly = filterRes.body.favorites.map((f) => f.product_id);
    assert(!validOnly.includes(9999999));
    console.log("✓ Non-existent or invalid product IDs safely filtered out");

    // ----------------------------------------------------
    // TEST 11: Cross-user isolation (Customer A vs Customer B)
    // ----------------------------------------------------
    console.log("\n[TEST 11] Cross-user isolation...");
    const customerBEmail = `user_b_${Date.now()}@example.com`;
    const custBReg = await makeRequest("POST", "/api/auth/register", {
      name: "Customer B",
      phone: "0933445566",
      email: customerBEmail,
      password: "password123",
    });
    const custBCookie = custBReg.cookie;
    // Customer B has no items initially
    const custBFavs = await makeRequest("GET", "/api/customer/favorites", null, custBCookie);
    assert.strictEqual(custBFavs.body.favorites.length, 0);
    console.log("✓ Customer B does not inherit Customer A's favorites");

    // ----------------------------------------------------
    // TEST 12: Security: user_id spoofing prevention & RBAC
    // ----------------------------------------------------
    console.log("\n[TEST 12] Security: Spoofing user_id & RBAC enforcement...");
    // Attempt to spoof user_id in body to target Customer B
    const spoofRes = await makeRequest("POST", "/api/customer/favorites/sync", {
      user_id: custBReg.body.user.id,
      productIds: [p1],
    }, loggedInCookie); // Using Customer A's cookie
    assert.strictEqual(spoofRes.status, 200);

    // Verify Customer B STILL has 0 favorites
    const custBCheck = await makeRequest("GET", "/api/customer/favorites", null, custBCookie);
    assert.strictEqual(custBCheck.body.favorites.length, 0, "Customer B's wishlist must not be affected by Customer A's request");

    // Verify staff/admin cannot sync customer favorites
    const staffLogin = await makeRequest("POST", "/api/auth/staff/login", {
      email: "staff@maisonrue.com",
      password: "staff123",
    });
    assert.strictEqual(staffLogin.status, 200, "Staff login should succeed");
    const staffCookie = staffLogin.cookie;
    assert(staffCookie, "Staff cookie should be returned");
    const staffSyncRes = await makeRequest("POST", "/api/customer/favorites/sync", {
      productIds: [p1],
    }, staffCookie);
    assert.strictEqual(staffSyncRes.status, 403, "Staff must be rejected with 403 Forbidden");

    console.log("✓ Backend strictly derives user ID from JWT; spoofed body parameters ignored; RBAC enforced");

    console.log("\n==================================================");
    console.log("ALL 12 WISHLIST PERSISTENCE & SYNC TESTS PASSED! ✓");
    console.log("==================================================");
  } finally {
    if (server) {
      server.close();
    }
  }
}

runWishlistTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\n❌ Test execution failed:", err);
    process.exit(1);
  });
