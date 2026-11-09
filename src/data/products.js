import assortment from "./new-assortment.json" with { type: "json" };
import generatedCatalogMedia from "./catalog-media.json" with { type: "json" };

const fallbackImage = "image/hero-image/hero-image.png";
const cashmereFallbackImage = "image/our story/cashmere.png";

// This is an intentionally explicit assortment: the Heritage Cashmere page
// must only show the products approved for this collection.
const heritageCashmereProductIds = new Set([
  107, 108, 109, 110, 121, 122, 141,
  148, 150, 151, 152, 166, 167, 168, 186,
  192, 199, 206, 207
]);
const fallWinter2026ProductIds = new Set([121, 113, 108, 117, 127, 167, 154, 150, 158, 172]);
const fallWinter2026Collection = "Fall/Winter 2026–2027";

const materialByProductId = {
  107: "Baby Cashmere", 108: "Cashmere", 109: "Cashmere", 110: "Wool + Cashmere",
  121: "Baby Cashmere", 122: "Wool + Cashmere", 141: "Cashmere",
  148: "Cashmere", 150: "Baby Cashmere", 151: "Cashmere", 152: "Wool + Cashmere",
  166: "Cashmere", 167: "Baby Cashmere", 168: "Wool + Cashmere", 186: "Cashmere",
  192: "Cashmere + Cotton", 199: "Cashmere + Cotton", 206: "Cashmere + Wool",
  207: "Cashmere-touch finish; cashmere fibre composition to be confirmed."
};

// Product photography already present in public/image. The new assortment file
// intentionally contains commercial data only, so media is joined here by the
// stable product id. Keep this mapping explicit: guessing paths from product
// names would break as soon as a product is renamed.
const productMediaById = {
  106: {
    colorImages: {
      Brown: [
        "image/catalog/clothing/merino-wool-knitted-polo/review-v1/brown-front.webp",
        "image/catalog/clothing/merino-wool-knitted-polo/review-v1/brown-back.webp",
        "image/catalog/clothing/merino-wool-knitted-polo/review-v1/brown-model-detail.webp",
        "image/catalog/clothing/merino-wool-knitted-polo/review-v1/brown-model-outfit.webp",
        "image/catalog/clothing/merino-wool-knitted-polo/review-v1/brown-logo-tag.webp"
      ],
      Beige: [
        "image/catalog/clothing/merino-wool-knitted-polo/review-v1/beige-front.webp",
        "image/catalog/clothing/merino-wool-knitted-polo/review-v1/beige-back.webp"
      ],
      Black: [
        "image/catalog/clothing/merino-wool-knitted-polo/review-v1/black-front.webp",
        "image/catalog/clothing/merino-wool-knitted-polo/review-v1/black-back.webp"
      ],
      White: [
        "image/catalog/clothing/merino-wool-knitted-polo/review-v1/white-front.webp",
        "image/catalog/clothing/merino-wool-knitted-polo/review-v1/white-back.webp"
      ]
    }
  },

  109: {
    colorImages: {
      Beige: [1, 2, 3, 4].map((number) => `image/Cashmere Cardigan - Men/BEIGE/${number}.png`),
      Navy: [1, 2, 3, 4].map((number) => `image/Cashmere Cardigan - Men/NAVY BLUE/${number}.png`)
    }
  },
  113: {
    images: [1, 2, 3, 4, 5].map((number) => `image/Linen Shirt - Men/${number}.png`)
  },
  115: {
    colorImages: {
      Brown: [
        "image/catalog/clothing/suede-long-sleeve-overshirt/review-v1/brown-front.webp",
        "image/catalog/clothing/suede-long-sleeve-overshirt/review-v1/brown-back.webp",
        "image/catalog/clothing/suede-long-sleeve-overshirt/review-v1/brown-model-detail.webp",
        "image/catalog/clothing/suede-long-sleeve-overshirt/review-v1/brown-model-outfit.webp",
        "image/catalog/clothing/suede-long-sleeve-overshirt/review-v1/brown-logo-tag.webp"
      ],
      "Deep Teal": [
        "image/catalog/clothing/suede-long-sleeve-overshirt/review-v1/deep-teal-front.webp",
        "image/catalog/clothing/suede-long-sleeve-overshirt/review-v1/deep-teal-back.webp"
      ],
      Navy: [
        "image/catalog/clothing/suede-long-sleeve-overshirt/review-v1/navy-front.webp",
        "image/catalog/clothing/suede-long-sleeve-overshirt/review-v1/navy-back.webp"
      ]
    }
  },
  117: {
    images: [1, 2, 3, 4].map((number) => `image/Linen Pants - Men/${number}.png`)
  },
  127: {
    images: [1, 2, 3].map((number) => `image/Suede Loafer - Men/${number}.png`)
  },
  138: {
    images: ["image/Suede Leather Belt/dark-chocolate.png"]
  },
  139: {
    colorImages: {
      "Dark Brown": [
        "image/Suede Baseball Cap/DARK-CHOCOLATE-BROWN/1.jpg",
        "image/Suede Baseball Cap/DARK-CHOCOLATE-BROWN/2.png"
      ]
    }
  },

  150: {
    colorImages: {
      Beige: [
        "image/Cashmere Cardigan - Women/BEIGE/1.png",
        "image/Cashmere Cardigan - Women/BEIGE/2.png",
        "image/Cashmere Cardigan - Women/BEIGE/3.png",
        "image/Cashmere Cardigan - Women/BEIGE/4.jpeg"
      ]
    }
  },
  155: {
    images: [1, 2, 3, 4, 5].map((number) => `image/Linen Shirt - Women/${number}.png`)
  },
  158: {
    images: [1, 2, 3, 4].map((number) => `image/Linen Pants - Women/${number}.png`)
  },
  174: {
    images: [1, 2, 3].map((number) => `image/Suede Loafers - Women/${number}.png`)
  },
  183: {
    colorImages: {
      "Dark Brown": [
        "image/catalog/accessories/smooth-calfskin-leather-belt-183/raw-v1/dark-brown-front.webp",
        "image/catalog/accessories/smooth-calfskin-leather-belt-183/raw-v1/dark-brown-back.webp",
        "image/catalog/accessories/smooth-calfskin-leather-belt-183/raw-v1/dark-brown-model-detail.webp",
        "image/catalog/accessories/smooth-calfskin-leather-belt-183/raw-v1/dark-brown-model-outfit.webp",
        "image/catalog/accessories/smooth-calfskin-leather-belt-183/raw-v1/dark-brown-logo-tag.webp"
      ]
    }
  },
  206: {
    images: ["image/Heritage Cashmere Scarf/camel.png"]
  }
};

const resolveProductMedia = (item) => {
  // Complete, colour-specific catalogue galleries supersede legacy single-image mappings.
  const configured = generatedCatalogMedia[item.id] || productMediaById[item.id] || {};
  const configuredColorImages = configured.colorImages || {};
  const configuredImages = configured.images || Object.values(configuredColorImages).flat();
  const images = configuredImages.length > 0
    ? [...new Set(configuredImages)]
    : [heritageCashmereProductIds.has(item.id) ? cashmereFallbackImage : fallbackImage];
  const primaryImage = images[0];
  const colorImages = Object.fromEntries(
    item.colors.map((color) => [
      color,
      configuredColorImages[color]?.length ? configuredColorImages[color] : [primaryImage]
    ])
  );

  return { images, colorImages };
};
const colorHex = {
  Brown: "#5B4032", Beige: "#C9B79C", Black: "#191817", White: "#F2EEE4",
  "Deep Teal": "#1E5455", Navy: "#1F2A44", "Denim Blue": "#536F8A", Camel: "#B4875D",
  Charcoal: "#464442", "Sand Beige": "#CBB99D", "Dark Brown": "#3A261E", "Stone Beige": "#B7A995",
  "Natural Ecru": "#EEE9DF", Taupe: "#9B8876", "Dark Havana": "#604735", "Brushed Silver": "#A7A9AC",
  "Soft Beige": "#D7C9B5", Ivory: "#F2EEE4", Oatmeal: "#D7C9B5", Blue: "#8CAAC6",
  Champagne: "#D9C3A5", "Soft Brown": "#8A6A55", "Dark Chocolate": "#3A261E", Cream: "#F2EEE4",
  "Brushed Gold": "#B89B5E"
};
const slug = (value) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "");

export const allProducts = assortment.map((item) => {
  const productCode = `MR-${String(item.id).padStart(3, "0")}`;
  const media = resolveProductMedia(item);
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
  const collection = heritageCashmereProductIds.has(item.id)
    ? "Heritage Cashmere"
    : /suede|leather|shoe|loafer|sunglasses|bag|belt/i.test(item.name)
      ? "Suede Essentials"
      : /linen/i.test(item.name)
        ? "Riviera Linen"
        : "Maison Rue Essentials";
  const material = materialByProductId[item.id] || "Premium natural materials; confirm composition before sale.";
  const sizeGuide = item.productType === "Accessories"
    ? []
    : item.productType === "Footwear"
      ? item.sizes.map((size, index) => ({ size, footLength: Number((23 + index * 0.7).toFixed(1)) }))
      : item.sizes.map((size, index) => ({ size, chest: 92 + index * 6, waist: 72 + index * 6, length: 66 + index * 2 }));
  return {
    ...item,
    productCode,
    category: item.productType === "Clothing" ? "clothing" : item.productType.toLowerCase(),
    collection,
    collections: [collection, ...(fallWinter2026ProductIds.has(item.id) ? [fallWinter2026Collection] : [])],
    fit: "Classic fit",
    material,
    care: "Follow the care label for this product.",
    modelInfo: item.audience === "men" ? "Model information to be confirmed." : "Fit information to be confirmed.",
    description: `${item.name}, crafted in ${material.toLowerCase()} for the Maison Rue Heritage Cashmere collection.`,
    images: media.images,
    colorImages: media.colorImages,
    colorOptions: item.colors.map((name) => ({ name, hex: colorHex[name] || "#B8A894" })),
    variants,
    stock: 0,
    slug: `${item.audience}-${slug(item.name).toLowerCase()}-${item.id}`,
    features: [material, "Quiet luxury design"],
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
