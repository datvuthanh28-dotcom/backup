// ============ PRODUCT DATABASE (Maison Rue) ============
// Ported from the original static site's app.js
const products = {
  men: [
    {
      id: 1,
      name: "Cashmere Cardigan",
      price: 6490000,
      category: "men",
      gender: "nam",
      images: ["image/Cashmere Cardigan - Men/BEIGE/1.png", "image/Cashmere Cardigan - Men/BEIGE/2.png", "image/Cashmere Cardigan - Men/BEIGE/3.png", "image/Cashmere Cardigan - Men/BEIGE/4.png", "image/Cashmere Cardigan - Men/NAVY BLUE/1.png", "image/Cashmere Cardigan - Men/NAVY BLUE/2.png", "image/Cashmere Cardigan - Men/NAVY BLUE/3.png", "image/Cashmere Cardigan - Men/NAVY BLUE/4.png"],
      colors: ["BEIGE", "NAVY BLUE"],
      colorImages: {
        "BEIGE": ["image/Cashmere Cardigan - Men/BEIGE/1.png", "image/Cashmere Cardigan - Men/BEIGE/2.png", "image/Cashmere Cardigan - Men/BEIGE/3.png", "image/Cashmere Cardigan - Men/BEIGE/4.png"],
        "NAVY BLUE": ["image/Cashmere Cardigan - Men/NAVY BLUE/1.png", "image/Cashmere Cardigan - Men/NAVY BLUE/2.png", "image/Cashmere Cardigan - Men/NAVY BLUE/3.png", "image/Cashmere Cardigan - Men/NAVY BLUE/4.png"]
      },
      description: "Premium cashmere cardigan with a refined old-money silhouette. Soft-touch knit, classic crew neckline, tonal buttons, ribbed cuffs and hem. Designed for a clean, elevated layering look. Finished with subtle MR tonal embroidery on the left chest."
    },
    {
      id: 2,
      name: "Linen Pants",
      price: 2690000,
      category: "men",
      gender: "nam",
      images: ["image/Linen Pants - Men/1.png", "image/Linen Pants - Men/2.png", "image/Linen Pants - Men/3.png", "image/Linen Pants - Men/4.png"],
      colors: ["NATURAL WHITE"],
      colorImages: {
        "NATURAL WHITE": ["image/Linen Pants - Men/1.png", "image/Linen Pants - Men/2.png", "image/Linen Pants - Men/3.png", "image/Linen Pants - Men/4.png"]
      },
      description: "Tailored wide-leg linen trousers with a relaxed luxury fit. Front pleats, structured waistband, belt loops, side pockets, and clean back welt pockets. Lightweight, breathable, and suitable for both resort and city styling."
    },
    {
      id: 3,
      name: "Linen Shirt",
      price: 2390000,
      category: "men",
      gender: "nam",
      images: ["image/Linen Shirt - Men/1.png", "image/Linen Shirt - Men/2.png", "image/Linen Shirt - Men/3.png", "image/Linen Shirt - Men/4.png", "image/Linen Shirt - Men/5.png"],
      colors: ["IVORY WHITE"],
      colorImages: {
        "IVORY WHITE": ["image/Linen Shirt - Men/1.png", "image/Linen Shirt - Men/2.png", "image/Linen Shirt - Men/3.png", "image/Linen Shirt - Men/4.png", "image/Linen Shirt - Men/5.png"]
      },
      description: "Premium long-sleeve linen shirt with a relaxed but polished fit. Classic collar, front button closure, natural linen texture, curved hem, and refined cuffs."
    },
    {
      id: 4,
      name: "Suede Loafer",
      price: 5290000,
      category: "men",
      gender: "nam",
      images: ["image/Suede Loafer - Men/1.png", "image/Suede Loafer - Men/2.png", "image/Suede Loafer - Men/3.png"],
      colors: ["SUEDE TAN"],
      colorImages: {
        "SUEDE TAN": ["image/Suede Loafer - Men/1.png", "image/Suede Loafer - Men/2.png", "image/Suede Loafer - Men/3.png"]
      },
      description: "Classic suede penny loafer with a refined profile. Soft suede upper, leather lining, almond toe shape, hand-stitched moc toe detailing, low stacked heel, and slim leather sole. Inside branding: Maison Rue."
    }
  ],
  women: [
    {
      id: 5,
      name: "Cashmere Cardigan",
      price: 6290000,
      category: "women",
      gender: "nữ",
      images: ["image/Cashmere Cardigan - Women/BEIGE/1.png", "image/Cashmere Cardigan - Women/BEIGE/2.png", "image/Cashmere Cardigan - Women/BEIGE/3.png", "image/Cashmere Cardigan - Women/GRAPEFRUIT SODA/1.png", "image/Cashmere Cardigan - Women/GRAPEFRUIT SODA/2.png", "image/Cashmere Cardigan - Women/GRAPEFRUIT SODA/3.png", "image/Cashmere Cardigan - Women/GRAPEFRUIT SODA/4.png"],
      colors: ["BEIGE", "GRAPEFRUIT SODA"],
      colorImages: {
        "BEIGE": ["image/Cashmere Cardigan - Women/BEIGE/1.png", "image/Cashmere Cardigan - Women/BEIGE/2.png", "image/Cashmere Cardigan - Women/BEIGE/3.png"],
        "GRAPEFRUIT SODA": ["image/Cashmere Cardigan - Women/GRAPEFRUIT SODA/1.png", "image/Cashmere Cardigan - Women/GRAPEFRUIT SODA/2.png", "image/Cashmere Cardigan - Women/GRAPEFRUIT SODA/3.png", "image/Cashmere Cardigan - Women/GRAPEFRUIT SODA/4.png"]
      },
      description: "Feminine cashmere cardigan with a slightly cropped, elegant fit. Soft round neckline, delicate button front, ribbed hem and cuffs. Finished with subtle MR tonal embroidery on the left chest."
    },
    {
      id: 6,
      name: "Linen Pants",
      price: 2590000,
      category: "women",
      gender: "nữ",
      images: ["image/Linen Pants - Women/1.png", "image/Linen Pants - Women/2.png", "image/Linen Pants - Women/3.png", "image/Linen Pants - Women/4.png"],
      colors: ["NATURAL WHITE"],
      colorImages: {
        "NATURAL WHITE": ["image/Linen Pants - Women/1.png", "image/Linen Pants - Women/2.png", "image/Linen Pants - Women/3.png", "image/Linen Pants - Women/4.png"]
      },
      description: "High-waisted linen trousers with a soft wide-leg shape. Front pleats, elegant drape, side pockets, belt loops, and clean waistband finishing. Designed to be worn with tucked-in linen shirts, tanks, or cashmere knits."
    },
    {
      id: 7,
      name: "Linen Shirt",
      price: 2290000,
      category: "women",
      gender: "nữ",
      images: ["image/Linen Shirt - Women/1.png", "image/Linen Shirt - Women/2.png", "image/Linen Shirt - Women/3.png", "image/Linen Shirt - Women/4.png", "image/Linen Shirt - Women/5.png"],
      colors: ["IVORY WHITE"],
      colorImages: {
        "IVORY WHITE": ["image/Linen Shirt - Women/1.png", "image/Linen Shirt - Women/2.png", "image/Linen Shirt - Women/3.png", "image/Linen Shirt - Women/4.png", "image/Linen Shirt - Women/5.png"]
      },
      description: "Lightweight linen shirt with a soft oversized silhouette. Classic collar, button front, relaxed sleeves, curved hem, and clean minimal finishing. Can be worn tucked, half-tucked, or open over a tank for a classic look."
    },
    {
      id: 8,
      name: "Suede Loafers",
      price: 5190000,
      category: "women",
      gender: "nữ",
      images: ["image/Suede Loafers - Women/1.png", "image/Suede Loafers - Women/2.png", "image/Suede Loafers - Women/3.png"],
      colors: ["SUEDE TAN"],
      colorImages: {
        "SUEDE TAN": ["image/Suede Loafers - Women/1.png", "image/Suede Loafers - Women/2.png", "image/Suede Loafers - Women/3.png"]
      },
      description: "Elegant women's suede loafer with a slim, polished silhouette. Soft suede upper, leather lining, penny strap detail, moc-toe stitching, low comfortable heel, and clean leather sole. Inside branding: Maison Rue."
    }
  ],
  accessories: [
    {
      id: 9,
      name: "Suede Baseball Cap",
      price: 2190000,
      category: "accessories",
      gender: "unisex",
      images: [
        "image/Suede Baseball Cap/DARK-CHOCOLATE-BROWN/1.jpg",
        "image/Suede Baseball Cap/DARK-CHOCOLATE-BROWN/2.png",
        "image/Suede Baseball Cap/DEEP-TEAL/1.png",
        "image/Suede Baseball Cap/DEEP-TEAL/2.png"
      ],
      colors: ["DARK-CHOCOLATE-BROWN", "DEEP-TEAL"],
      colorImages: {
        "DARK-CHOCOLATE-BROWN": [
          "image/Suede Baseball Cap/DARK-CHOCOLATE-BROWN/1.jpg",
          "image/Suede Baseball Cap/DARK-CHOCOLATE-BROWN/2.png"
        ],
        "DEEP-TEAL": [
          "image/Suede Baseball Cap/DEEP-TEAL/1.png",
          "image/Suede Baseball Cap/DEEP-TEAL/2.png"
        ]
      },
      description: "Premium suede baseball cap with a structured yet soft shape, tonal stitching and adjustable strap back."
    },
    {
      id: 10,
      name: "Heritage Cashmere Scarf",
      price: 3290000,
      category: "accessories",
      gender: "unisex",
      images: ["image/Heritage Cashmere Scarf/camel.png"],
      colors: ["CAMEL"],
      colorImages: {
        "CAMEL": ["image/Heritage Cashmere Scarf/camel.png"]
      },
      description: "A pure cashmere scarf with a soft brushed finish, generous proportions and discreet hand-finished fringe."
    },
    {
      id: 11,
      name: "Heritage Cashmere Crewneck",
      price: 5890000,
      category: "accessories",
      gender: "unisex",
      images: ["image/Heritage Cashmere Crewneck/navy.png"],
      colors: ["NAVY BLUE"],
      colorImages: {
        "NAVY BLUE": ["image/Heritage Cashmere Crewneck/navy.png"]
      },
      description: "A quietly refined cashmere crewneck with a clean neckline, balanced drape and softly ribbed edges."
    },
    {
      id: 12,
      name: "Suede Leather Belt",
      price: 2490000,
      category: "accessories",
      gender: "unisex",
      images: ["image/Suede Leather Belt/dark-chocolate.png"],
      colors: ["DARK CHOCOLATE"],
      colorImages: {
        "DARK CHOCOLATE": ["image/Suede Leather Belt/dark-chocolate.png"]
      },
      description: "A slim Italian suede belt finished with tonal stitching, a brushed brass buckle and a vegetable-tanned leather lining."
    }
  ]
};

const productProfiles = {
  1: { collection: "Heritage Cashmere", productType: "Knitwear", subcategory: "Cardigans", fit: "Regular Fit", material: "100% Grade-A cashmere", care: "Dry clean only. Fold and store in a breathable garment bag.", modelInfo: "Model is 184 cm and wears size M.", sizes: ["S", "M", "L", "XL"] },
  2: { collection: "Riviera Linen", productType: "Clothing", subcategory: "Trousers", fit: "Relaxed Tailored Fit", material: "70% European linen, 30% organic cotton", care: "Machine wash cold on a gentle cycle. Line dry and iron on low heat.", modelInfo: "Model is 184 cm and wears size M.", sizes: ["S", "M", "L", "XL"] },
  3: { collection: "Riviera Linen", productType: "Clothing", subcategory: "Shirts", fit: "Relaxed Fit", material: "70% European linen, 30% organic cotton", care: "Machine wash cold on a gentle cycle. Line dry and iron on low heat.", modelInfo: "Model is 184 cm and wears size M.", sizes: ["S", "M", "L", "XL"] },
  4: { collection: "Suede Essentials", productType: "Shoes", subcategory: "Loafers", fit: "True to size", material: "Italian suede upper, leather lining and sole", care: "Brush gently after wear and protect from prolonged moisture.", modelInfo: "European sizing. Select your usual formal shoe size.", sizes: ["39", "40", "41", "42", "43"] },
  5: { collection: "Heritage Cashmere", productType: "Knitwear", subcategory: "Cardigans", fit: "Elegant Cropped Fit", material: "100% Grade-A cashmere", care: "Dry clean only. Fold and store in a breathable garment bag.", modelInfo: "Model is 176 cm and wears size S.", sizes: ["XS", "S", "M", "L"] },
  6: { collection: "Riviera Linen", productType: "Clothing", subcategory: "Trousers", fit: "High-Rise Wide Leg", material: "70% European linen, 30% organic cotton", care: "Machine wash cold on a gentle cycle. Line dry and iron on low heat.", modelInfo: "Model is 176 cm and wears size S.", sizes: ["XS", "S", "M", "L"] },
  7: { collection: "Riviera Linen", productType: "Clothing", subcategory: "Shirts", fit: "Soft Oversized Fit", material: "70% European linen, 30% organic cotton", care: "Machine wash cold on a gentle cycle. Line dry and iron on low heat.", modelInfo: "Model is 176 cm and wears size S.", sizes: ["XS", "S", "M", "L"] },
  8: { collection: "Suede Essentials", productType: "Shoes", subcategory: "Loafers", fit: "True to size", material: "Italian suede upper, leather lining and sole", care: "Brush gently after wear and protect from prolonged moisture.", modelInfo: "European sizing. Select your usual formal shoe size.", sizes: ["36", "37", "38", "39", "40"] },
  9: { collection: "Suede Essentials", productType: "Accessories", subcategory: "Hats", fit: "Adjustable", material: "Premium suede with cotton lining", care: "Spot clean with a soft suede brush. Do not machine wash.", modelInfo: "Adjustable back strap fits 54–61 cm.", sizes: ["ONE SIZE"] },
  10: { collection: "Heritage Cashmere", productType: "Accessories", subcategory: "Scarves", fit: "One Size", material: "100% Grade-A cashmere", care: "Dry clean only. Store folded away from direct light.", modelInfo: "Dimensions: 180 × 32 cm.", sizes: ["ONE SIZE"] },
  11: { collection: "Heritage Cashmere", productType: "Knitwear", subcategory: "Crewnecks", fit: "Relaxed Unisex Fit", material: "100% Grade-A cashmere", care: "Dry clean only. Fold and store in a breathable garment bag.", modelInfo: "Designed for a relaxed unisex silhouette.", sizes: ["S", "M", "L", "XL"] },
  12: { collection: "Suede Essentials", productType: "Accessories", subcategory: "Belts", fit: "Five-hole adjustable fit", material: "Italian suede with vegetable-tanned leather lining", care: "Keep dry and brush lightly with a suede brush.", modelInfo: "Width: 3 cm.", sizes: ["80", "85", "90", "95"] }
};

const colorHex = {
  "BEIGE": "#C9B79C", "NAVY BLUE": "#1F2A44", "NATURAL WHITE": "#EEE9DF",
  "IVORY WHITE": "#F2EEE4", "SUEDE TAN": "#9B6B43", "GRAPEFRUIT SODA": "#D99B8C",
  "DARK-CHOCOLATE-BROWN": "#3A261E", "DEEP-TEAL": "#1E5455", "CAMEL": "#B4875D",
  "OATMEAL": "#D7C9B5", "DARK CHOCOLATE": "#3A261E"
};

function enrichProduct(product) {
  const profile = productProfiles[product.id];
  const variants = product.colors.flatMap((color, colorIndex) =>
    profile.sizes.map((size, sizeIndex) => ({
      id: `${product.id}-${colorIndex + 1}-${sizeIndex + 1}`,
      sku: `MR-${String(product.id).padStart(3, "0")}-${String(colorIndex + 1).padStart(2, "0")}-${size.replaceAll(" ", "")}`,
      color,
      size,
      price: product.price,
      stock: ((product.id + colorIndex * 2 + sizeIndex * 3) % 8) + 2
    }))
  );

  return {
    ...product,
    ...profile,
    slug: product.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
    colorOptions: product.colors.map((name) => ({ name, hex: colorHex[name] || "#B8A894" })),
    variants,
    stock: variants.reduce((sum, variant) => sum + variant.stock, 0),
    features: [
      `Designed in the ${profile.collection} atelier`,
      `${profile.fit} with considered proportions`,
      `Crafted from ${profile.material.toLowerCase()}`
    ],
    delivery: "Complimentary delivery throughout Vietnam. Exchange eligible items within 14 days.",
    sizeGuide: profile.sizes.map((size, index) => ({ size, chest: 96 + index * 6, waist: 78 + index * 6, length: 68 + index * 2 }))
  };
}

products.men = products.men.map(enrichProduct);
products.women = products.women.map(enrichProduct);
products.accessories = products.accessories.map(enrichProduct);

const originalProducts = [...products.men, ...products.women, ...products.accessories];

const catalogBlueprint = {
  Shirts: ["Riviera Linen Shirt", "Oxford Tailored Shirt", "Resort Camp Collar Shirt", "Silk Relaxed Shirt", "Heritage Poplin Shirt"],
  Knitwear: ["Heritage Cashmere Cardigan", "Cashmere Polo", "Merino Rib Crewneck", "Fine-Knit Turtleneck", "Brushed Cashmere Vest"],
  Trousers: ["Riviera Linen Trousers", "Tailored Wool Trousers", "Pleated Wide-Leg Trousers", "Relaxed Drawstring Trousers", "Cotton Twill Trousers"],
  Outerwear: ["Riviera Linen Blazer", "Double-Breasted Blazer", "Suede Harrington Jacket", "Cashmere Overshirt", "Heritage Trench Coat"],
  "One-Piece & Sets": ["Riviera Tailored Set", "Linen Lounge Set", "Cashmere Travel Set", "Silk Evening Set", "Heritage Utility Set"],
  Footwear: ["Classic Suede Loafer", "Leather Penny Loafer", "Suede Driving Shoe", "Minimal Leather Sneaker", "Suede Mule"],
  Accessories: ["Heritage Cashmere Scarf", "Suede Baseball Cap", "Suede Leather Belt", "Suede Weekender Bag", "Leather Card Holder"]
};

const audienceConfig = {
  men: { label: "Men's", gender: "nam", source: { Shirts: 3, Knitwear: 1, Trousers: 2, Outerwear: 1, "One-Piece & Sets": 3, Footwear: 4, Accessories: 12 } },
  women: { label: "Women's", gender: "nữ", source: { Shirts: 7, Knitwear: 5, Trousers: 6, Outerwear: 5, "One-Piece & Sets": 7, Footwear: 8, Accessories: 10 } },
  unisex: { label: "Unisex", gender: "unisex", source: { Shirts: 3, Knitwear: 11, Trousers: 2, Outerwear: 11, "One-Piece & Sets": 11, Footwear: 4, Accessories: 9 } }
};

const categoryConfig = {
  Shirts: { price: 2390000, fit: "Relaxed Tailored Fit", material: "70% European linen, 30% organic cotton", sizes: ["XS", "S", "M", "L", "XL"] },
  Knitwear: { price: 4890000, fit: "Soft Regular Fit", material: "100% Grade-A cashmere", sizes: ["XS", "S", "M", "L", "XL"] },
  Trousers: { price: 2790000, fit: "Relaxed Tailored Fit", material: "European linen and organic cotton blend", sizes: ["XS", "S", "M", "L", "XL"] },
  Outerwear: { price: 6590000, fit: "Structured Relaxed Fit", material: "Premium natural-fibre tailoring blend", sizes: ["XS", "S", "M", "L", "XL"] },
  "One-Piece & Sets": { price: 7290000, fit: "Coordinated Relaxed Fit", material: "Premium linen, silk or cashmere blend", sizes: ["XS", "S", "M", "L", "XL"] },
  Footwear: { price: 5290000, fit: "True to size", material: "Italian suede or full-grain leather", sizes: ["36", "37", "38", "39", "40", "41", "42", "43"] },
  Accessories: { price: 2790000, fit: "One Size", material: "Cashmere, Italian suede or full-grain leather", sizes: ["ONE SIZE"] }
};

const collectionPalette = {
  "Riviera Linen": [{ name: "IVORY WHITE", hex: "#F2EEE4" }, { name: "SAND", hex: "#CBB99D" }, { name: "NAVY BLUE", hex: "#1F2A44" }],
  "Heritage Cashmere": [{ name: "OATMEAL", hex: "#D7C9B5" }, { name: "CAMEL", hex: "#B4875D" }, { name: "CHARCOAL", hex: "#464442" }],
  "Suede Essentials": [{ name: "SUEDE TAN", hex: "#9B6B43" }, { name: "DARK CHOCOLATE", hex: "#3A261E" }, { name: "BLACK", hex: "#191817" }]
};

const designPrimaryColor = {
  "riviera-linen-shirt": { name: "IVORY WHITE", hex: "#F2EEE4" }, "oxford-tailored-shirt": { name: "LIGHT BLUE", hex: "#A9C7E8" },
  "resort-camp-collar-shirt": { name: "SAND", hex: "#CBB99D" }, "silk-relaxed-shirt": { name: "CHAMPAGNE", hex: "#D9C3A5" }, "heritage-poplin-shirt": { name: "NAVY BLUE", hex: "#1F2A44" },
  "heritage-cashmere-cardigan": { name: "CAMEL", hex: "#B4875D" }, "cashmere-polo": { name: "OATMEAL", hex: "#D7C9B5" }, "merino-rib-crewneck": { name: "CHARCOAL", hex: "#464442" }, "fine-knit-turtleneck": { name: "NAVY BLUE", hex: "#1F2A44" }, "brushed-cashmere-vest": { name: "TAUPE", hex: "#9B8876" },
  "riviera-linen-trousers": { name: "IVORY WHITE", hex: "#F2EEE4" }, "tailored-wool-trousers": { name: "CHARCOAL", hex: "#464442" }, "pleated-wide-leg-trousers": { name: "CAMEL", hex: "#B4875D" }, "relaxed-drawstring-trousers": { name: "SAND", hex: "#CBB99D" }, "cotton-twill-trousers": { name: "NAVY BLUE", hex: "#1F2A44" },
  "riviera-linen-blazer": { name: "IVORY WHITE", hex: "#F2EEE4" }, "double-breasted-blazer": { name: "CAMEL", hex: "#B4875D" }, "suede-harrington-jacket": { name: "DARK CHOCOLATE", hex: "#3A261E" }, "cashmere-overshirt": { name: "OATMEAL", hex: "#D7C9B5" }, "heritage-trench-coat": { name: "STONE", hex: "#B7A995" },
  "riviera-tailored-set": { name: "IVORY WHITE", hex: "#F2EEE4" }, "linen-lounge-set": { name: "SAND", hex: "#CBB99D" }, "cashmere-travel-set": { name: "OATMEAL", hex: "#D7C9B5" }, "silk-evening-set": { name: "NAVY BLUE", hex: "#1F2A44" }, "heritage-utility-set": { name: "OLIVE BROWN", hex: "#665F48" },
  "classic-suede-loafer": { name: "SUEDE TAN", hex: "#9B6B43" }, "leather-penny-loafer": { name: "DARK CHOCOLATE", hex: "#3A261E" }, "suede-driving-shoe": { name: "NAVY BLUE", hex: "#1F2A44" }, "minimal-leather-sneaker": { name: "IVORY WHITE", hex: "#F2EEE4" }, "suede-mule": { name: "CAMEL", hex: "#B4875D" },
  "heritage-cashmere-scarf": { name: "CAMEL", hex: "#B4875D" }, "suede-baseball-cap": { name: "DARK CHOCOLATE", hex: "#3A261E" }, "suede-leather-belt": { name: "DARK CHOCOLATE", hex: "#3A261E" }, "suede-weekender-bag": { name: "SUEDE TAN", hex: "#9B6B43" }, "leather-card-holder": { name: "DARK CHOCOLATE", hex: "#3A261E" }
};

function collectionForDesign(name, category) {
  if (/suede|leather|footwear|accessories/i.test(`${name} ${category}`)) return "Suede Essentials";
  if (/cashmere|merino|knit|wool/i.test(name)) return "Heritage Cashmere";
  return "Riviera Linen";
}

const completedGalleries = new Set([
  "men/riviera-linen-shirt",
  "men/oxford-tailored-shirt",
  "men/resort-camp-collar-shirt",
  "men/silk-relaxed-shirt",
  "men/heritage-poplin-shirt",
  "women/riviera-linen-shirt",
  "women/oxford-tailored-shirt",
  "women/resort-camp-collar-shirt",
  "women/silk-relaxed-shirt",
  "women/heritage-poplin-shirt",
  "unisex/riviera-linen-shirt",
  "unisex/oxford-tailored-shirt",
  "unisex/resort-camp-collar-shirt",
  "unisex/silk-relaxed-shirt",
  "unisex/heritage-poplin-shirt",
  "men/heritage-cashmere-cardigan",
  "men/cashmere-polo",
  "men/merino-rib-crewneck",
  "men/fine-knit-turtleneck",
  "men/brushed-cashmere-vest"
  ,"women/heritage-cashmere-cardigan",
  "women/cashmere-polo",
  "women/merino-rib-crewneck",
  "women/fine-knit-turtleneck",
  "women/brushed-cashmere-vest",
  "men/riviera-linen-trousers",
  "women/riviera-linen-trousers",
  "unisex/riviera-linen-trousers",
  "men/tailored-wool-trousers",
  "women/tailored-wool-trousers",
  "unisex/tailored-wool-trousers",
  "men/pleated-wide-leg-trousers",
  "women/pleated-wide-leg-trousers",
  "unisex/pleated-wide-leg-trousers",
  "men/relaxed-drawstring-trousers",
  "women/relaxed-drawstring-trousers",
  "unisex/relaxed-drawstring-trousers",
  "men/cotton-twill-trousers",
  "women/cotton-twill-trousers",
  "unisex/cotton-twill-trousers",
  "men/riviera-linen-blazer",
  "women/riviera-linen-blazer",
  "unisex/riviera-linen-blazer",
  "men/double-breasted-blazer",
  "women/double-breasted-blazer",
  "unisex/double-breasted-blazer",
  "men/suede-harrington-jacket",
  "women/suede-harrington-jacket",
  "unisex/suede-harrington-jacket",
  "men/cashmere-overshirt",
  "women/cashmere-overshirt",
  "unisex/cashmere-overshirt",
  "men/heritage-trench-coat",
  "women/heritage-trench-coat",
  "unisex/heritage-trench-coat",
  "men/riviera-tailored-set",
  "women/riviera-tailored-set",
  "unisex/riviera-tailored-set",
  "men/linen-lounge-set",
  "women/linen-lounge-set",
  "unisex/linen-lounge-set",
  "men/cashmere-travel-set",
  "women/cashmere-travel-set",
  "unisex/cashmere-travel-set",
  "men/silk-evening-set",
  "women/silk-evening-set",
  "unisex/silk-evening-set",
  "men/heritage-utility-set",
  "women/heritage-utility-set",
  "unisex/heritage-utility-set",
  "unisex/heritage-cashmere-cardigan",
  "unisex/cashmere-polo",
  "unisex/merino-rib-crewneck",
  "unisex/fine-knit-turtleneck",
  "unisex/brushed-cashmere-vest",
  "men/classic-suede-loafer",
  "women/classic-suede-loafer",
  "unisex/classic-suede-loafer",
  "men/leather-penny-loafer",
  "women/leather-penny-loafer",
  "unisex/leather-penny-loafer",
  "men/suede-driving-shoe",
  "women/suede-driving-shoe",
  "unisex/suede-driving-shoe",
  "men/minimal-leather-sneaker",
  "women/minimal-leather-sneaker",
  "unisex/minimal-leather-sneaker",
  "men/suede-mule",
  "women/suede-mule",
  "unisex/suede-mule",
  "men/heritage-cashmere-scarf",
  "women/heritage-cashmere-scarf",
  "unisex/heritage-cashmere-scarf",
  "men/suede-baseball-cap",
  "women/suede-baseball-cap",
  "unisex/suede-baseball-cap",
  "men/suede-leather-belt",
  "women/suede-leather-belt",
  "unisex/suede-leather-belt",
  "men/suede-weekender-bag",
  "women/suede-weekender-bag",
  "unisex/suede-weekender-bag",
  "men/leather-card-holder",
  "women/leather-card-holder",
  "unisex/leather-card-holder"
]);

const audienceProductNames = {
  women: {
    "Riviera Linen Shirt": "Riviera Linen Blouse",
    "Oxford Tailored Shirt": "Sculpted Oxford Shirt",
    "Resort Camp Collar Shirt": "Resort Draped Camp Shirt",
    "Silk Relaxed Shirt": "Silk Fluid Blouse",
    "Heritage Poplin Shirt": "Heritage Cinched Poplin Shirt"
  },
  unisex: {
    "Riviera Linen Shirt": "Riviera Easy Linen Shirt",
    "Oxford Tailored Shirt": "Oxford Studio Shirt",
    "Resort Camp Collar Shirt": "Resort Boxy Camp Shirt",
    "Silk Relaxed Shirt": "Silk Lounge Shirt",
    "Heritage Poplin Shirt": "Heritage Overshirt"
  }
};

function galleryForProduct(audienceKey, designSlug, colorNames, fallbackImage) {
  const galleryKey = `${audienceKey}/${designSlug}`;
  if (!completedGalleries.has(galleryKey)) {
    return Object.fromEntries(colorNames.map((color) => [color, [fallbackImage]]));
  }
  const colorSlug = (color) => color.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const base = `image/catalog/${galleryKey}`;
  return Object.fromEntries(colorNames.map((color, index) => [
    color,
    index === 0
      ? [`${base}/${colorSlug(color)}-studio.png`, `${base}/${colorSlug(color)}-model.png`, `${base}/${colorSlug(color)}-detail.png`]
      : [`${base}/${colorSlug(color)}-studio.png`]
  ]));
}

function buildFullCatalog() {
  let id = 1;
  const catalog = [];
  Object.entries(catalogBlueprint).forEach(([category, names]) => {
    Object.entries(audienceConfig).forEach(([audienceKey, audience], audienceIndex) => {
      names.forEach((baseName, productIndex) => {
        const audienceBaseName = audienceProductNames[audienceKey]?.[baseName] || baseName;
        const source = originalProducts.find((item) => item.id === audience.source[category]) || originalProducts[0];
        const designSlug = baseName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
        const catalogImage = `image/catalog/${designSlug}.png`;
        const config = categoryConfig[category];
        const collection = collectionForDesign(baseName, category);
        const primaryColor = designPrimaryColor[designSlug];
        const colors = [primaryColor, ...collectionPalette[collection]].filter((color, index, list) => color && list.findIndex((entry) => entry.name === color.name) === index).slice(0, 3);
        const price = config.price + productIndex * 240000 + audienceIndex * 100000;
        const colorNames = colors.map((color) => color.name);
        const productColorImages = galleryForProduct(audienceKey, designSlug, colorNames, catalogImage);
        const variants = colors.flatMap((color, colorIndex) => config.sizes.map((size, sizeIndex) => ({
          id: `${id}-${colorIndex + 1}-${sizeIndex + 1}`,
          sku: `MR-${String(id).padStart(3, "0")}-${color.name.replace(/[^A-Z0-9]+/g, "-")}-${size.replaceAll(" ", "")}`,
          color: color.name,
          size,
          price,
          stock: ((id + colorIndex * 3 + sizeIndex * 2) % 9) + 2
        })));
        catalog.push({
          ...source,
          id,
          name: `${audience.label} ${audienceBaseName}`,
          price,
          category: category.toLowerCase().replaceAll(" ", "-"),
          productType: category,
          subcategory: category,
          gender: audience.gender,
          collection,
          fit: config.fit,
          material: config.material,
          sizes: config.sizes,
          colors: colorNames,
          colorOptions: colors,
          images: productColorImages[colorNames[0]],
          colorImages: productColorImages,
          variants,
          stock: variants.reduce((sum, variant) => sum + variant.stock, 0),
          slug: `${audience.gender}-${audienceBaseName}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
          description: `${audienceBaseName} interprets the Maison Rue language through enduring material, restrained detail and a quietly refined silhouette.`,
          care: category === "Footwear" || category === "Accessories" ? "Protect from prolonged moisture and clean gently with the appropriate specialist brush." : "Professional dry clean or gentle cold wash according to the care label. Store away from direct light.",
          modelInfo: audience.gender === "nam" ? "Model is 184 cm and wears size M." : audience.gender === "nữ" ? "Model is 176 cm and wears size S." : "Designed with an adaptable unisex proportion.",
          features: [`Part of the ${collection} collection`, `${config.fit} with considered proportions`, `Crafted from ${config.material.toLowerCase()}`],
          delivery: "Complimentary delivery throughout Vietnam. Exchange eligible items within 14 days.",
          sizeGuide: config.sizes.map((size, index) => ({ size, chest: 92 + index * 6, waist: 72 + index * 6, length: 66 + index * 2 }))
        });
        id += 1;
      });
    });
  });
  return catalog;
}

export const allProducts = buildFullCatalog();

products.men = allProducts.filter((product) => product.gender === "nam");
products.women = allProducts.filter((product) => product.gender === "nữ");
products.accessories = allProducts.filter((product) => product.gender === "unisex");

export function getProductById(id) {
  return allProducts.find((p) => p.id === Number(id));
}

// Compact catalog text used inside the chatbot system prompt so the AI
// only ever recommends real products (name / price / id / gender / link)
export function getCatalogForPrompt() {
  return allProducts
    .map(
      (p) =>
        `- id:${p.id} | ${p.name} (${p.category}, dành cho ${p.gender}) | Giá: ${p.price.toLocaleString("vi-VN")}đ | Link: /product/${p.id}`
    )
    .join("\n");
}

export default products;
