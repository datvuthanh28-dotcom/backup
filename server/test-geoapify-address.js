// Set test environment database BEFORE importing server modules
process.env.DB_NAME = process.env.TEST_DB_NAME || "MaisonRueDB_Test";
process.env.PORT = "5097";

const http = await import("http");
const { default: app } = await import("./index.js");
const { connectDB } = await import("./config/db.js");
const { runMigration } = await import("./db/migrate.js");
const { runSeed } = await import("./db/seed.js");

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
        try { parsedBody = JSON.parse(data); } catch { parsedBody = { raw: data }; }
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
  console.log("MAISON RUE: GEOAPIFY ADDRESS VERIFICATION & SUGGESTIONS TEST");
  console.log(`DATABASE TARGET: ${process.env.DB_NAME}`);
  console.log("==================================================");

  await connectDB();
  await runMigration();
  await runSeed();

  const TEST_PORT = 5097;
  await new Promise((resolve) => {
    server = app.listen(TEST_PORT, () => {
      baseUrl = `http://localhost:${TEST_PORT}`;
      console.log(`✓ Test Express server listening on ${baseUrl}`);
      resolve();
    });
  });

  let totalTests = 0;
  let passedTests = 0;

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
    // Log in customer
    const custLogin = await makeRequest("POST", "/api/auth/customer/login", {
      email: "customer@gmail.com",
      password: "customer123",
    });
    assert(custLogin.status === 200, "Customer logged in successfully");
    const custCookie = custLogin.cookie;

    // ----------------------------------------------------
    // TEST 1: Address Autocomplete Suggestions (Geoapify)
    // ----------------------------------------------------
    console.log("\n--- 1. Testing Address Autocomplete via Geoapify ---");
    const suggestionsRes = await makeRequest("GET", "/api/customer/address-suggestions?input=88%20Ly%20Tu%20Trong&country=VN", null, custCookie);
    assert(suggestionsRes.status === 200, "GET /api/customer/address-suggestions returned HTTP 200");
    assert(Array.isArray(suggestionsRes.body.suggestions), "Response has suggestions array");
    assert(suggestionsRes.body.suggestions.length > 0, `Returned ${suggestionsRes.body.suggestions.length} address suggestions`);
    assert(
      suggestionsRes.body.suggestions[0].description.includes("Lý Tự Trọng") || suggestionsRes.body.suggestions[0].description.includes("Ly Tu Trong"),
      "First suggestion contains street name"
    );

    // ----------------------------------------------------
    // TEST 2: Add Customer Address with Fake / Vague / Valid
    // ----------------------------------------------------
    console.log("\n--- 2. Testing Customer Address Book Verification ---");

    // 2.1 Fake address rejected
    const fakeAddrRes = await makeRequest("POST", "/api/customer/addresses", {
      address: "xyzabc12345khongcothat9999",
      isDefault: false,
    }, custCookie);
    assert(fakeAddrRes.status === 422, "Fake non-existent address rejected with HTTP 422 Unprocessable Entity");

    // 2.2 Vague city-only address rejected
    const vagueAddrRes = await makeRequest("POST", "/api/customer/addresses", {
      address: "Ho Chi Minh City, Vietnam",
      isDefault: false,
    }, custCookie);
    assert(vagueAddrRes.status === 422, "Vague city-only address rejected with HTTP 422 (coordinates alone are NOT enough)");

    // 2.3 Valid detailed address accepted & standardized
    const validAddrRes = await makeRequest("POST", "/api/customer/addresses", {
      address: "72 Le Thanh Ton, Ben Nghe, Quan 1, Ho Chi Minh",
      isDefault: false,
    }, custCookie);
    assert(validAddrRes.status === 200, "Valid deliverable address verified and saved (HTTP 200)");

    // ----------------------------------------------------
    // TEST 3: Enforcement in createOrder
    // ----------------------------------------------------
    console.log("\n--- 3. Testing Server-Side Address Enforcement in createOrder ---");

    const orderBasePayload = {
      name: "Nguyễn Văn Test",
      email: "customer@gmail.com",
      phone: "0901234567",
      paymentMethod: "cod",
      items: [
        {
          id: 106,
          name: "Merino Wool Knitted Polo",
          price: 1850000,
          quantity: 1,
          selectedColor: "Beige",
          selectedSize: "M",
          variantId: "v-106-beige-m",
          sku: "MR-106-BEIGE-M",
          image: "image/Merino Wool Knitted Polo/BEIGE/1.png",
        },
      ],
      notes: "Test Geoapify enforcement",
    };

    // 3.1 Order with fake address -> MUST BE BLOCKED
    const orderFakeAddr = await makeRequest("POST", "/api/orders", {
      ...orderBasePayload,
      address: "99999 duong khong co that o dau ca, phuong 99, hcm",
    }, custCookie);
    assert(orderFakeAddr.status === 422, "Order with fake/hallucinatory address rejected with HTTP 422");
    assert(
      orderFakeAddr.body.error.includes("địa chỉ") || orderFakeAddr.body.error.includes("khớp") || orderFakeAddr.body.error.includes("Geoapify"),
      "Error explains address verification failure"
    );

    // 3.2 Order with vague address (city only) -> MUST BE BLOCKED
    const orderVagueAddr = await makeRequest("POST", "/api/orders", {
      ...orderBasePayload,
      address: "Ho Chi Minh City",
    }, custCookie);
    assert(orderVagueAddr.status === 422, "Order with vague address without street/house rejected with HTTP 422");

    // 3.3 Order with verified deliverable address -> MUST SUCCEED
    const orderValidAddr = await makeRequest("POST", "/api/orders", {
      ...orderBasePayload,
      address: "88, Đường Lý Tự Trọng, Phường Bến Thành, Thành phố Hồ Chí Minh, 71009, Việt Nam",
    }, custCookie);
    assert(orderValidAddr.status === 201, "Order with verified Geoapify address created successfully (HTTP 201)");
    assert(orderValidAddr.body.order.shipping_address.includes("Lý Tự Trọng") || orderValidAddr.body.order.shipping_address.includes("Ly Tu Trong"), "Order shipping address persisted accurately");

    console.log("\n==================================================");
    console.log(`ALL GEOAPIFY TESTS PASSED: ${passedTests}/${totalTests}`);
    console.log("Geoapify migration, address verification, and order enforcement 100% verified!");
    console.log("==================================================");
  } finally {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
      console.log("✓ Test server closed.");
    }
  }
}

runTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Test failed:", err);
    process.exit(1);
  });

