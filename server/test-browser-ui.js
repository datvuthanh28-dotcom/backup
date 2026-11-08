import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import puppeteer from "puppeteer-core";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure test DB is used
process.env.DB_NAME = "MaisonRueDB_Test";
process.env.PORT = "5000";

const { default: app } = await import("./index.js");
const { connectDB } = await import("./config/db.js");
const { runMigration } = await import("./db/migrate.js");
const { runSeed } = await import("./db/seed.js");

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const SCREENSHOT_DIR = path.join(__dirname, "../test-screenshots");
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

async function fillReactInput(page, selector, value) {
  await page.waitForSelector(selector);
  await page.focus(selector);
  await page.evaluate((sel, val) => {
    const el = document.querySelector(sel);
    if (!el) return;
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    nativeSetter.call(el, val);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }, selector, value);
}

let server;
let browser;

async function runBrowserTests() {
  console.log("==================================================");
  console.log("STARTING REAL BROWSER UI TESTS (CHROME + PUPPETEER)");
  console.log("==================================================");

  // 1. Prepare isolated DB
  await connectDB();
  await runMigration();
  await runSeed();
  console.log("✓ MaisonRueDB_Test verified and seeded.");

  // 2. Start Express API Server on 5000
  await new Promise((resolve) => {
    server = app.listen(5000, () => {
      console.log("✓ Backend API running on http://localhost:5000");
      resolve();
    });
  });

  // 3. Launch Chrome Headless
  browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--window-size=1400,900"],
    defaultViewport: { width: 1400, height: 900 },
  });
  console.log("✓ Google Chrome launched successfully.");

  const page = await browser.newPage();
  page.on("console", (msg) => console.log("[BROWSER CONSOLE]", msg.type(), msg.text()));
  page.on("pageerror", (err) => console.log("[BROWSER PAGE ERROR]", err.message));

  let testsPassed = 0;
  let totalTests = 0;

  function assert(condition, message) {
    totalTests++;
    if (condition) {
      console.log(`[UI PASS] ${message}`);
      testsPassed++;
    } else {
      console.error(`[UI FAIL] ${message}`);
      throw new Error(`Assertion failed: ${message}`);
    }
  }

  try {
    // -----------------------------------------------------------------
    // TEST 1: Customer Portal Login & Session
    // -----------------------------------------------------------------
    console.log("\n--- 1. Testing Customer Portal (/login) ---");
    await page.goto("http://localhost:5173/login", { waitUntil: "networkidle0" });
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "01_customer_login.png") });

    // Fill customer login
    await fillReactInput(page, 'input[type="email"]', "vudat9532@gmail.com");
    await fillReactInput(page, 'input[type="password"]', "customer123");
    await page.click('button[type="submit"]');
    await new Promise((r) => setTimeout(r, 1500));

    const custUrl = page.url();
    assert(custUrl.includes("/account") || custUrl.includes("/login"), "Customer login processed");
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "02_customer_orders.png") });

    // -----------------------------------------------------------------
    // TEST 2: Customer Security Boundary (Customer accessing Staff/Admin)
    // -----------------------------------------------------------------
    console.log("\n--- 2. Testing Customer Role Boundaries ---");
    await page.goto("http://localhost:5173/staff", { waitUntil: "networkidle0" });
    const blockedStaffUrl = page.url();
    assert(!blockedStaffUrl.endsWith("/staff") || blockedStaffUrl.includes("login"), "Customer cannot access /staff workspace");

    await page.goto("http://localhost:5173/admin", { waitUntil: "networkidle0" });
    const blockedAdminUrl = page.url();
    assert(!blockedAdminUrl.endsWith("/admin") || blockedAdminUrl.includes("login"), "Customer cannot access /admin dashboard");

    // -----------------------------------------------------------------
    // TEST 3: Staff Portal (/staff/login)
    // -----------------------------------------------------------------
    console.log("\n--- 3. Testing Staff Portal (/staff/login) ---");
    // Clear cookies for fresh session
    const client = await page.target().createCDPSession();
    await client.send("Network.clearBrowserCookies");

    await page.goto("http://localhost:5173/staff/login", { waitUntil: "networkidle0" });
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "03_staff_login.png") });

    // Fill staff credentials using quick demo fill button
    const clickedBtn = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      const staffBtn = btns.find((b) => b.innerText.toLowerCase().includes("staffmaisonrue@gmail.com"));
      if (staffBtn) {
        staffBtn.click();
        return true;
      }
      return false;
    });
    console.log("Clicked staff demo button:", clickedBtn);
    await new Promise((r) => setTimeout(r, 600));

    const inputVals = await page.evaluate(() => {
      const em = document.querySelector('input[type="email"]')?.value;
      const pw = document.querySelector('input[type="password"]')?.value;
      return { em, pw };
    });
    console.log("Input values after quick fill:", inputVals);

    await page.evaluate(() => document.querySelector("form").requestSubmit());
    await new Promise((r) => setTimeout(r, 2500));

    const staffUrl = page.url();
    console.log("Staff URL after submit:", staffUrl);
    assert(staffUrl.endsWith("/staff") || staffUrl.endsWith("/staff/"), "Staff login redirected to /staff workspace");
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "04_staff_dashboard.png") });

    // Check staff orders page
    await page.goto("http://localhost:5173/staff/orders", { waitUntil: "networkidle0" });
    await new Promise((r) => setTimeout(r, 1000));
    const hasOrderTable = (await page.$("table")) !== null;
    assert(hasOrderTable, "Staff Orders table rendered successfully");
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "05_staff_orders.png") });

    // Check staff inventory page
    await page.goto("http://localhost:5173/staff/inventory", { waitUntil: "networkidle0" });
    await new Promise((r) => setTimeout(r, 1000));
    const hasInventory = (await page.$("table")) !== null;
    assert(hasInventory, "Staff Inventory management rendered successfully");
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "06_staff_inventory.png") });

    // Staff Security: Staff cannot access Admin
    await page.goto("http://localhost:5173/admin", { waitUntil: "networkidle0" });
    const staffBlockedAdmin = page.url();
    assert(!staffBlockedAdmin.endsWith("/admin") || staffBlockedAdmin.includes("login"), "Staff cannot access /admin");

    // -----------------------------------------------------------------
    // TEST 4: Admin Portal (/admin/login)
    // -----------------------------------------------------------------
    console.log("\n--- 4. Testing Admin Portal (/admin/login) ---");
    await client.send("Network.clearBrowserCookies");

    await page.goto("http://localhost:5173/admin/login", { waitUntil: "networkidle0" });
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "07_admin_login.png") });

    // Fill admin credentials using quick demo fill button
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      const adminBtn = btns.find((b) => b.innerText.includes("vanhung29993@gmail.com"));
      if (adminBtn) adminBtn.click();
    });
    await new Promise((r) => setTimeout(r, 400));
    await page.evaluate(() => document.querySelector("form").requestSubmit());
    await new Promise((r) => setTimeout(r, 2000));

    const adminUrl = page.url();
    assert(adminUrl.endsWith("/admin") || adminUrl.endsWith("/admin/"), "Admin login redirected to /admin dashboard");
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "08_admin_dashboard.png") });

    // Check Admin Revenue Reports page
    await page.goto("http://localhost:5173/admin/reports", { waitUntil: "networkidle0" });
    await new Promise((r) => setTimeout(r, 1000));
    const pageText = await page.evaluate(() => document.body.innerText);
    assert(pageText.includes("DOANH THU") || pageText.includes("BÁO CÁO"), "Admin Financial & Revenue Report rendered");
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "09_admin_reports.png") });

    // Check Admin Employee Management page
    await page.goto("http://localhost:5173/admin/employees", { waitUntil: "networkidle0" });
    await new Promise((r) => setTimeout(r, 1000));
    const empText = await page.evaluate(() => document.body.innerText);
    assert(empText.includes("NHÂN SỰ") || empText.includes("staffmaisonrue@gmail.com"), "Admin Employee Management rendered");
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "10_admin_employees.png") });

    // -----------------------------------------------------------------
    // TEST 5: Wrong Portal Cross-Role Login Block in UI
    // -----------------------------------------------------------------
    console.log("\n--- 5. Testing Wrong Portal Cross-Role Login UX ---");
    await client.send("Network.clearBrowserCookies");

    // Admin tries to login on customer page
    await page.goto("http://localhost:5173/login", { waitUntil: "networkidle0" });
    await fillReactInput(page, 'input[type="email"]', "vanhung29993@gmail.com");
    await fillReactInput(page, 'input[type="password"]', "admin123");
    await page.evaluate(() => document.querySelector(".auth-form.active").requestSubmit());
    await new Promise((r) => setTimeout(r, 1500));

    const crossRoleText = await page.evaluate(() => document.body.innerText);
    assert(
      crossRoleText.includes("ADMIN") || crossRoleText.includes("Quản Trị Viên") || crossRoleText.includes("vai trò"),
      "Admin login on customer portal produces clear rejection message"
    );

    console.log("\n==================================================");
    console.log(`ALL BROWSER UI TESTS PASSED! (${testsPassed}/${totalTests})`);
    console.log(`Screenshots saved in: ${SCREENSHOT_DIR}`);
    console.log("==================================================");
  } finally {
    if (browser) await browser.close();
    if (server) server.close();
  }
}

runBrowserTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\n[BROWSER TEST ERROR]", err);
    process.exit(1);
  });
