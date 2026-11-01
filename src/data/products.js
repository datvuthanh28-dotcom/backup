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
    }
  ]
};

export const allProducts = [...products.men, ...products.women, ...products.accessories];

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
