import assortment from "./new-assortment.json" with { type: "json" };

const image = "image/hero-image/hero-image.png";
const colorHex = {
  Brown: "#5B4032", Beige: "#C9B79C", Black: "#191817", White: "#F2EEE4",
  "Deep Teal": "#1E5455", Navy: "#1F2A44", "Denim Blue": "#536F8A", Camel: "#B4875D",
  Charcoal: "#464442", "Sand Beige": "#CBB99D", "Dark Brown": "#3A261E", "Stone Beige": "#B7A995",
  "Natural Ecru": "#EEE9DF", Taupe: "#9B8876", "Dark Havana": "#604735", "Brushed Silver": "#A7A9AC",
  "Soft Beige": "#D7C9B5", Ivory: "#F2EEE4", Oatmeal: "#D7C9B5", Blue: "#8CAAC6",
  Champagne: "#D9C3A5", "Soft Brown": "#8A6A55", "Dark Chocolate": "#3A261E", Cream: "#F2EEE4",
  "Brushed Gold": "#B89B5E", "Natural Ecru": "#EEE9DF"
};
const slug = (value) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "");

export const allProducts = assortment.map((item) => {
  const productCode = `MR-${String(item.id).padStart(3, "0")}`;
  const variants = item.colors.flatMap((color) => item.sizes.map((size) => ({
    id: `v-${item.id}-${slug(color).toLowerCase()}-${slug(size).toLowerCase()}`,
    sku: `${productCode}-${slug(color)}-${slug(size)}`,
    color,
    size,
    price: item.price,
    stock: 0,
    lowStockThreshold: 3,
    maxStockThreshold: 20
  })));
  // Keep each assortment color visible in the catalog until dedicated imagery is assigned.
  const colorImages = Object.fromEntries(item.colors.map((color) => [color, [image]]));
  const collection = /cashmere|wool|merino|knit/i.test(item.name) ? "Heritage Cashmere" : /suede|leather|shoe|loafer|sunglasses|bag|belt/i.test(item.name) ? "Suede Essentials" : "Riviera Linen";
  const sizeGuide = item.sizes.map((size, index) => ({ size, chest: 92 + index * 6, waist: 72 + index * 6, length: 66 + index * 2 }));
  return {
    ...item,
    productCode,
    category: item.productType === "Clothing" ? "clothing" : item.productType.toLowerCase(),
    collection,
    fit: "Classic fit",
    material: "Premium natural materials; confirm composition before sale.",
    care: "Follow the care label for this product.",
    modelInfo: item.audience === "men" ? "Model information to be confirmed." : "Fit information to be confirmed.",
    description: `${item.name}, designed for the Maison Rue quiet luxury collection. Product details to be confirmed.`,
    images: [image],
    colorImages,
    colorOptions: item.colors.map((name) => ({ name, hex: colorHex[name] || "#B8A894" })),
    variants,
    stock: 0,
    slug: `${item.audience}-${slug(item.name).toLowerCase()}-${item.id}`,
    features: ["Quiet luxury design", "Product specifications to be confirmed"],
    delivery: "Complimentary delivery throughout Vietnam. Exchange eligible items within 14 days.",
    sizeGuide
  };
});

const products = {
  men: allProducts.filter((product) => product.audience === "men"),
  women: allProducts.filter((product) => product.audience === "women"),
  kids: allProducts.filter((product) => product.audience === "kids"),
  accessories: allProducts.filter((product) => product.productType === "Accessories")
};

export function getProductById(id) {
  return allProducts.find((product) => product.id === Number(id));
}

export function getCatalogForPrompt() {
  return allProducts.map((product) => `- id:${product.id} | ${product.name} (${product.subcategory}, ${product.gender}) | ${product.price.toLocaleString("vi-VN")}đ | /product/${product.id}`).join("\n");
}

export default products;
