import puppeteer from "puppeteer-core";

const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--no-sandbox"],
});

const cases = [
  ["/women", "Women"],
  ["/women?type=Clothing", "Women Clothing"],
  ["/women?type=Footwear", "Women Shoes"],
  ["/women?type=Clothing&subcategory=Knitwear", "Women Knitwear"],
  ["/men?type=Clothing&subcategory=Outerwear", "Men Outerwear"],
  ["/kids?type=Accessories&subcategory=Toys", "Kids Toys"],
];

try {
  const page = await browser.newPage();
  const results = [];
  for (const [path, expected] of cases) {
    await page.goto(`http://127.0.0.1:5173${path}`, { waitUntil: "networkidle0" });
    const actual = await page.$eval(".collection-hero .page-title", (node) => node.textContent.trim());
    if (actual !== expected) throw new Error(`${path}: expected “${expected}”, received “${actual}”.`);
    const documentTitle = await page.title();
    if (!documentTitle.includes(expected)) throw new Error(`${path}: browser title does not include “${expected}”.`);
    results.push({ path, title: actual });
  }
  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser.close();
}
