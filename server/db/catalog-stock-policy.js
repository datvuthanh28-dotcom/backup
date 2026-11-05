// Deterministic starter inventory for a brand-new database.
// Existing SKU stock is never overwritten by catalog synchronization.
export function initialVariantStock(productIndex, variantIndex) {
  if (productIndex % 17 === 0 && variantIndex === 0) return 0;
  if (productIndex % 11 === 0 && variantIndex === 0) return 2;
  if (productIndex % 13 === 0 && variantIndex === 0) return 24;
  return 8;
}

