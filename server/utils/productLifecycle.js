export const LEGACY_PRODUCT_CODE_MAX = 105;

export function isLegacyProductCode(productCode) {
  const numericSuffix = String(productCode || "").trim().match(/(\d+)$/);
  return Boolean(numericSuffix && Number(numericSuffix[1]) <= LEGACY_PRODUCT_CODE_MAX);
}

function numericProductCodeSuffixSql(alias) {
  const productCode = `LTRIM(RTRIM(${alias}.product_code))`;
  return `TRY_CONVERT(int, RIGHT(${productCode}, PATINDEX('%[^0-9]%', REVERSE(${productCode}) + 'X') - 1))`;
}

export function activeProductSql(alias) {
  const suffix = numericProductCodeSuffixSql(alias);
  return `${alias}.is_active = 1 AND (${suffix} IS NULL OR ${suffix} > ${LEGACY_PRODUCT_CODE_MAX})`;
}

export function legacyProductSql(alias) {
  return `${numericProductCodeSuffixSql(alias)} <= ${LEGACY_PRODUCT_CODE_MAX}`;
}
