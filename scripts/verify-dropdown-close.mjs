import puppeteer from "puppeteer-core";

const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--no-sandbox"],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000 });
  await page.goto("http://127.0.0.1:5173/men", { waitUntil: "networkidle0" });
  const menDropdown = (await page.$$(".head-left .audience-dropdown"))[0];
  if (!menDropdown) throw new Error("Men dropdown was not found.");
  await menDropdown.hover();
  await page.waitForSelector(".head-left .audience-dropdown .dropdown-menu", { visible: true });
  await page.evaluate(() => {
    const links = [...document.querySelectorAll(".head-left .audience-dropdown:first-of-type .category-submenu a")];
    const target = links.find((link) => link.textContent.trim() === "KNITWEAR");
    if (!target) throw new Error("Knitwear submenu link was not found.");
    target.click();
  });
  await page.waitForFunction(() => window.location.search.includes("subcategory=Knitwear"));
  const result = await page.evaluate(() => {
    const root = document.querySelector(".head-left .audience-dropdown");
    const menu = root?.querySelector(":scope > .dropdown-menu");
    const submenu = root?.querySelector(".category-submenu");
    return {
      dismissed: root?.classList.contains("is-dismissed"),
      menuDisplay: menu ? getComputedStyle(menu).display : null,
      submenuDisplay: submenu ? getComputedStyle(submenu).display : null,
      url: window.location.href,
    };
  });
  if (!result.dismissed || result.menuDisplay !== "none" || result.submenuDisplay !== "none") {
    throw new Error(`Dropdown did not close: ${JSON.stringify(result)}`);
  }
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
}
