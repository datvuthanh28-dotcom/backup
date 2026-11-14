import { useCallback, useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import useDocumentTitle from "../../hooks/useDocumentTitle";
import { productsAPI } from "../../services/api";
import AdminPagination from "../../components/AdminPagination";

const money = (val) => Number(val || 0).toLocaleString("vi-VN") + "đ";
const PAGE_SIZE = 10;
const LEGACY_PRODUCT_CODE_MAX = 105;

const numericText = (value) => String(value ?? "").replace(/[^0-9]/g, "").replace(/^0+(?=\d)/, "");
const integerValue = (value) => Number(numericText(value) || 0);
const moneyInput = (value) => numericText(value) ? integerValue(value).toLocaleString("vi-VN") : "";
const splitOptions = (value) => [...new Set(String(value || "").split(/[,\n]/).map((item) => item.trim()).filter(Boolean))];
const rawOptions = (value) => String(value || "").split(/[,\n]/).map((item) => item.trim()).filter(Boolean);
const skuPart = (value) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "");
const DEFAULT_SIZE_PRESETS = {
  clothing: ["XS", "S", "M", "L", "XL"],
  footwear: ["36", "37", "38", "39", "40", "41", "42", "43", "44", "45"],
  accessories: ["ONE SIZE"],
};

const COLOR_NAME_PATTERN = /^[\p{L}][\p{L}\p{M}\s-]{0,39}$/u;
const ALPHA_SIZES = new Set(["XXS", "XS", "S", "SMALL", "M", "MEDIUM", "L", "LARGE", "XL", "X-LARGE", "XXL", "2XL", "3XL", "4XL"]);
const normalizeOptionKey = (value) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, " ").toUpperCase();

const validateColorName = (value) => {
  const color = String(value || "").trim().replace(/\s+/g, " ");
  if (!color) return "Vui lòng nhập ít nhất một màu.";
  if (!COLOR_NAME_PATTERN.test(color)) return `“${color}” không phải tên màu hợp lệ. Chỉ dùng chữ, khoảng trắng hoặc dấu gạch nối.`;
  return "";
};

const validateSizeName = (value, category = "clothing") => {
  const size = String(value || "").trim().replace(/\s+/g, " ").toUpperCase();
  if (!size) return "Vui lòng nhập ít nhất một kích cỡ.";
  if (category === "accessories") {
    const numericSize = Number(size);
    const isLengthSize = /^\d{2,3}$/.test(size) && numericSize >= 50 && numericSize <= 130;
    return size === "ONE SIZE" || ALPHA_SIZES.has(size) || isLengthSize
      ? ""
      : `Size phụ kiện “${size}” không hợp lệ. Dùng ONE SIZE, size chữ hoặc chiều dài 50–130 cm.`;
  }
  if (category === "footwear") {
    const numericSize = Number(size);
    return /^\d{2}(?:\.5)?$/.test(size) && numericSize >= 16 && numericSize <= 48
      ? ""
      : `Cỡ giày “${size}” không hợp lệ. Chấp nhận cỡ số từ 16 đến 48, có thể có .5.`;
  }
  const numericSize = Number(size);
  const isNumericClothingSize = /^\d{2}$/.test(size) && numericSize >= 18 && numericSize <= 54;
  const ageMatch = size.match(/^(\d{1,2})-(\d{1,2})(M|Y)$/);
  const isAgeSize = Boolean(ageMatch) && Number(ageMatch[1]) < Number(ageMatch[2]) && Number(ageMatch[2]) <= (ageMatch[3] === "M" ? 24 : 16);
  return ALPHA_SIZES.has(size) || isNumericClothingSize || isAgeSize
    ? ""
    : `Size “${size}” không đúng chuẩn trang phục. Dùng XS–4XL, số 18–54 hoặc khoảng tuổi như 0-3M, 2-4Y.`;
};

const validateOptionList = (value, type, category) => {
  const values = rawOptions(value);
  if (!values.length) return type === "color" ? "Vui lòng nhập ít nhất một màu." : "Vui lòng nhập ít nhất một kích cỡ.";
  const keys = values.map(normalizeOptionKey);
  if (new Set(keys).size !== keys.length) return type === "color" ? "Danh sách màu đang có giá trị trùng nhau." : "Danh sách kích cỡ đang có giá trị trùng nhau.";
  for (const item of values) {
    const message = type === "color" ? validateColorName(item) : validateSizeName(item, category);
    if (message) return message;
  }
  return "";
};

const validateVariantFields = (variant, category = "clothing") => {
  const errors = {};
  if (!String(variant?.sku || "").trim()) errors.sku = "Vui lòng nhập mã SKU.";
  const colorError = validateColorName(variant?.color);
  if (colorError) errors.color = colorError;
  const sizeError = validateSizeName(variant?.size, category);
  if (sizeError) errors.size = sizeError;
  const price = integerValue(variant?.price);
  const cost = integerValue(variant?.costPrice);
  const floor = integerValue(variant?.floorPrice);
  const stock = integerValue(variant?.stock);
  const minStock = integerValue(variant?.minStock ?? variant?.lowStockThreshold);
  const maxStock = integerValue(variant?.maxStock ?? variant?.maxStockThreshold);
  if (price <= 0) errors.price = "Giá bán phải lớn hơn 0đ.";
  if (cost <= 0) errors.costPrice = "Giá vốn phải lớn hơn 0đ.";
  if (floor < cost || floor > price) errors.floorPrice = "Cần thỏa mãn giá vốn ≤ giá sàn ≤ giá bán.";
  if (![stock, minStock, maxStock].every(Number.isInteger)) errors.stock = "Số lượng tồn phải là số nguyên.";
  if (maxStock <= minStock) errors.maxStock = "Mức tồn tối đa phải lớn hơn mức tối thiểu.";
  return errors;
};

function CurrencyInput({ value, onChange, ...props }) {
  return (
    <input
      {...props}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      value={moneyInput(value)}
      onChange={(event) => onChange(integerValue(event.target.value))}
    />
  );
}

function IntegerInput({ value, onChange, ...props }) {
  return (
    <input
      {...props}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      value={numericText(value)}
      onChange={(event) => onChange(integerValue(event.target.value))}
    />
  );
}

const safeNumber = (value) => {
  const result = Number(value);
  return Number.isFinite(result) ? result : 0;
};

const normalizeImageUrl = (image) => {
  if (!image || typeof image !== "string") return "";
  const trimmed = image.trim();
  if (!trimmed) return "";
  if (/^(https?:)?\/\//i.test(trimmed) || trimmed.startsWith("data:") || trimmed.startsWith("blob:")) return trimmed;
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
};

const isInactiveValue = (value) => value === false || value === 0 || value === "0";

const isLegacyProduct = (product) => {
  const productCode = String(product?.productCode || product?.product_code || "").trim();
  const codeNumber = productCode.match(/(\d+)$/);
  const legacyNumber = codeNumber ? Number(codeNumber[1]) : productCode ? NaN : Number(product?.id);
  return Number.isInteger(legacyNumber) && legacyNumber <= LEGACY_PRODUCT_CODE_MAX;
};

const isProductActive = (product) => {
  if (isLegacyProduct(product)) return false;
  const activeValue = product?.isActive ?? product?.is_active ?? product?.active;
  return !isInactiveValue(activeValue);
};

const isVariantActive = (variant) => {
  const activeValue = variant?.isActive ?? variant?.is_active ?? variant?.active;
  return !isInactiveValue(activeValue);
};

const getProductImage = (product) => {
  const imageList = Array.isArray(product?.images)
    ? product.images.filter((image) => typeof image === "string" && image.trim())
    : [];
  if (imageList.length) return imageList[0];
  if (typeof product?.image === "string" && product.image.trim()) return product.image;
  return "";
};

const getProductDataIssues = (product, imageUnavailable = false) => {
  if (isLegacyProduct(product)) return [];
  const variants = Array.isArray(product?.variants) ? product.variants : [];
  const activeVariants = variants.filter(isVariantActive);
  const productCode = product?.productCode || product?.product_code;
  const image = getProductImage(product);
  const issues = [];
  if (!product?.name?.trim()) issues.push("tên sản phẩm");
  if (!productCode || !String(productCode).trim()) issues.push("mã sản phẩm");
  if (!product?.category || !product?.gender) issues.push("phân loại");
  const hasImage = Boolean(image) && !imageUnavailable;
  if (!hasImage) issues.push(imageUnavailable ? "đường dẫn ảnh hợp lệ" : "ảnh đại diện");
  if (!activeVariants.length) issues.push("SKU đang kinh doanh");
  const hasCompleteVariant = activeVariants.length > 0 && activeVariants.every((variant) => {
    const price = safeNumber(variant?.price);
    const cost = safeNumber(variant?.costPrice ?? variant?.cost_price);
    const floor = safeNumber(variant?.floorPrice ?? variant?.floor_price);
    const stock = safeNumber(variant?.stock);
    const minStock = safeNumber(variant?.minStock ?? variant?.lowStockThreshold ?? variant?.low_stock_threshold);
    const maxStock = safeNumber(variant?.maxStock ?? variant?.maxStockThreshold ?? variant?.max_stock_threshold);

    return Boolean(variant?.sku?.trim() && variant?.color?.trim() && variant?.size?.trim())
      && price > 0
      && cost > 0
      && cost <= floor
      && floor <= price
      && Number.isInteger(stock)
      && stock >= 0
      && Number.isInteger(minStock)
      && Number.isInteger(maxStock)
      && maxStock > minStock;
  });
  if (!hasCompleteVariant && activeVariants.length) issues.push("giá / tồn kho SKU");
  return issues;
};

const getProductDataStatus = (product, imageUnavailable = false) => {
  if (isLegacyProduct(product)) return "Lưu trữ";
  return getProductDataIssues(product, imageUnavailable).length ? "Cần hoàn tất" : "Hoàn chỉnh";
};

const getProductBusinessStatus = (product, imageUnavailable = false) => {
  if (isLegacyProduct(product)) return "Lưu trữ";
  if (!isProductActive(product)) return "Ngừng kinh doanh";
  return getProductDataStatus(product, imageUnavailable) === "Hoàn chỉnh"
    ? "Đang kinh doanh"
    : "Cần hoàn tất";
};

const getColorCount = (product) => new Set((product?.variants || []).map((variant) => String(variant?.color || "").trim()).filter(Boolean)).size;

const getPriceLabel = (product) => {
  const prices = (product?.variants || []).map((variant) => safeNumber(variant?.price)).filter((value) => value > 0);
  if (!prices.length) return "—";
  const uniquePrices = [...new Set(prices)];
  if (uniquePrices.length === 1) return money(uniquePrices[0]);
  const min = Math.min(...uniquePrices);
  const max = Math.max(...uniquePrices);
  return `${money(min)} – ${money(max)}`;
};

const getInventorySummary = (product) => {
  const variants = Array.isArray(product?.variants) ? product.variants : [];
  const activeVariants = isProductActive(product) ? variants.filter(isVariantActive) : [];
  const summary = {
    total: variants.length,
    sold: activeVariants.length,
    inactive: variants.length - activeVariants.length,
    physicalStock: activeVariants.reduce((sum, variant) => sum + safeNumber(variant?.stock), 0),
    reservedStock: activeVariants.reduce((sum, variant) => sum + safeNumber(variant?.reservedQuantity), 0),
    quarantineStock: activeVariants.reduce((sum, variant) => sum + safeNumber(variant?.quarantineQuantity), 0),
    incomingStock: activeVariants.reduce((sum, variant) => sum + safeNumber(variant?.incomingQuantity), 0),
    activeStock: activeVariants.reduce((sum, variant) => sum + safeNumber(variant?.availableQuantity ?? (safeNumber(variant?.stock) - safeNumber(variant?.reservedQuantity) - safeNumber(variant?.quarantineQuantity))), 0),
    outOfStock: activeVariants.filter((variant) => safeNumber(variant?.availableQuantity ?? (safeNumber(variant?.stock) - safeNumber(variant?.reservedQuantity) - safeNumber(variant?.quarantineQuantity))) === 0).length,
    lowStock: activeVariants.filter((variant) => {
      const stock = safeNumber(variant?.availableQuantity ?? (safeNumber(variant?.stock) - safeNumber(variant?.reservedQuantity) - safeNumber(variant?.quarantineQuantity)));
      const minStock = safeNumber(variant?.minStock ?? variant?.lowStockThreshold);
      return stock > 0 && stock <= minStock;
    }).length,
    stable: activeVariants.filter((variant) => {
      const stock = safeNumber(variant?.availableQuantity ?? (safeNumber(variant?.stock) - safeNumber(variant?.reservedQuantity) - safeNumber(variant?.quarantineQuantity)));
      const minStock = safeNumber(variant?.minStock ?? variant?.lowStockThreshold);
      const maxStock = safeNumber(variant?.maxStock ?? variant?.maxStockThreshold);
      return minStock < stock && stock < maxStock;
    }).length,
    overStock: activeVariants.filter((variant) => {
      const stock = safeNumber(variant?.availableQuantity ?? (safeNumber(variant?.stock) - safeNumber(variant?.reservedQuantity) - safeNumber(variant?.quarantineQuantity)));
      const maxStock = safeNumber(variant?.maxStock ?? variant?.maxStockThreshold);
      return maxStock > 0 && stock >= maxStock;
    }).length,
  };

  return summary;
};

export default function AdminProducts() {
  useDocumentTitle("Admin — Quản Lý Sản Phẩm & SKU");

  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [formError, setFormError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [unavailableProductImages, setUnavailableProductImages] = useState({});

  useEffect(() => {
    if (!successMsg) return undefined;
    const timerId = window.setTimeout(() => setSuccessMsg(""), 4000);
    return () => window.clearTimeout(timerId);
  }, [successMsg]);

  // Filters
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [catalogScope, setCatalogScope] = useState("current");
  const [businessFilter, setBusinessFilter] = useState("Đang kinh doanh");
  const [inventoryFilter, setInventoryFilter] = useState("all");
  const [dataStatusFilter, setDataStatusFilter] = useState("all");
  const [collectionFilter, setCollectionFilter] = useState("all");
  const [genderFilter, setGenderFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  // Selected product for SKU & history views
  const [selectedProduct, setSelectedProduct] = useState(null);

  // Modals
  const [productModal, setProductModal] = useState(null); // { mode: 'create'|'edit', data: {...} }
  const [variantModal, setVariantModal] = useState(null); // { mode: 'create'|'edit', productId: ..., data: {...} }
  const [movementsModal, setMovementsModal] = useState(null); // { productId: ..., movements: [] }
  const [busy, setBusy] = useState(false);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [createMetadata, setCreateMetadata] = useState({ sizePresets: DEFAULT_SIZE_PRESETS, defaultInventoryPolicy: { min: 3, max: 30 } });

  useEffect(() => {
    if (!productModal && !variantModal) {
      setFormError("");
      setFieldErrors({});
    }
  }, [productModal, variantModal]);

  const clearFieldError = (field) => setFieldErrors((current) => {
    if (!current[field]) return current;
    const next = { ...current };
    delete next[field];
    return next;
  });

  const focusFirstInvalidField = (errors) => {
    const firstField = Object.keys(errors)[0];
    if (!firstField) return;
    window.requestAnimationFrame(() => {
      const target = document.querySelector(`[data-field-key="${firstField}"]`);
      target?.scrollIntoView({ behavior: "smooth", block: "center" });
      window.setTimeout(() => target?.focus?.({ preventScroll: true }), 250);
    });
  };

  const showFieldErrors = (errors) => {
    setFieldErrors(errors);
    setFormError("Vui lòng kiểm tra các trường được đánh dấu bên dưới.");
    focusFirstInvalidField(errors);
  };

  const fieldProps = (field) => ({
    "data-field-key": field,
    "aria-invalid": Boolean(fieldErrors[field]),
    className: fieldErrors[field] ? "admin-products__input-error" : undefined,
    onFocus: () => clearFieldError(field),
  });

  const fieldMessage = (field) => fieldErrors[field]
    ? <small className="admin-products__field-error" role="alert">{fieldErrors[field]}</small>
    : null;

  const isProductImageUnavailable = useCallback((product) => {
    const image = normalizeImageUrl(getProductImage(product));
    return Boolean(image && unavailableProductImages[product.id] === image);
  }, [unavailableProductImages]);

  const emptyVariant = (price = "", overrides = {}) => ({
    sku: "", color: "", size: "", price, costPrice: "", floorPrice: "",
    stock: 0, minStock: 3, maxStock: 30, isNew: true, ...overrides,
  });

  const buildVariantMatrix = (data, patch = {}) => {
    const next = { ...data, ...patch };
    const colors = splitOptions(next.variantColors);
    const sizes = splitOptions(next.variantSizes).map((size) => size.toUpperCase());
    const existing = new Map((next.variants || []).map((variant) => [`${String(variant.color || "").toUpperCase()}|${String(variant.size || "").toUpperCase()}`, variant]));
    const generated = colors.flatMap((color) => sizes.map((size) => {
      const key = `${color.toUpperCase()}|${size.toUpperCase()}`;
      return existing.get(key) || emptyVariant(next.price, {
        sku: [next.productCode, skuPart(color), skuPart(size)].filter(Boolean).join("-"),
        color,
        size,
        price: next.price,
        costPrice: next.defaultCostPrice,
        floorPrice: next.defaultFloorPrice,
        stock: next.defaultStock,
        minStock: next.defaultMinStock,
        maxStock: next.defaultMaxStock,
        costInherited: true,
        floorInherited: true,
        stockInherited: true,
        minInherited: true,
        maxInherited: true,
      });
    }));
    return { ...next, variants: generated };
  };

  const openCreateProduct = async () => {
    setFormError("");
    setFieldErrors({});
    setBusy(true);
    try {
      const metadata = await productsAPI.getCreateMetadata();
      const normalizedMetadata = {
        sizePresets: metadata.sizePresets || DEFAULT_SIZE_PRESETS,
        defaultInventoryPolicy: metadata.defaultInventoryPolicy || { min: 3, max: 30 },
      };
      setCreateMetadata(normalizedMetadata);
      const data = {
        productCode: metadata.nextProductCode || "", name: "", price: "", category: "clothing", gender: "nam",
        description: "", material: "", collectionName: "", minAlert: normalizedMetadata.defaultInventoryPolicy.min,
        images: [], imageText: "", colorImages: {}, selectedImageColor: "__general", variants: [], variantColors: "", variantSizes: normalizedMetadata.sizePresets.clothing.join(", "),
        defaultCostPrice: "", defaultFloorPrice: "", defaultStock: 0,
        defaultMinStock: normalizedMetadata.defaultInventoryPolicy.min, defaultMaxStock: normalizedMetadata.defaultInventoryPolicy.max,
      };
      setProductModal({ mode: "create", data, initialData: data });
    } catch (metadataError) {
      setError(metadataError.message || "Không thể lấy mã sản phẩm tiếp theo.");
    } finally {
      setBusy(false);
    }
  };

  const openEditProduct = (product) => {
    setFormError("");
    setFieldErrors({});
    const data = {
      ...product,
      productCode: product.productCode || product.product_code,
      collectionName: product.collectionName || product.collection || "",
      imageText: (product.images || []).join("\n"),
      selectedImageColor: "__general",
      variants: (product.variants || []).map((variant) => ({
        ...variant,
        minStock: variant.minStock ?? variant.lowStockThreshold ?? 0,
        maxStock: variant.maxStock ?? variant.maxStockThreshold ?? 1,
        isNew: false,
      })),
    };
    setProductModal({
      mode: "edit",
      data,
      initialData: data,
    });
  };

  const closeProductModal = () => {
    if (!productModal) return;
    const changed = JSON.stringify(productModal.data) !== JSON.stringify(productModal.initialData);
    if (changed && !window.confirm("Bạn có thay đổi chưa lưu. Bạn có chắc muốn đóng?")) return;
    setProductModal(null);
  };

  useEffect(() => {
    if (!productModal) return undefined;
    const onKeyDown = (event) => {
      if (event.key !== "Escape") return;
      const changed = JSON.stringify(productModal.data) !== JSON.stringify(productModal.initialData);
      if (!changed || window.confirm("Bạn có thay đổi chưa lưu. Bạn có chắc muốn đóng?")) setProductModal(null);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [productModal]);

  const updateProductField = (field, value) => setProductModal((current) => ({
    ...current, data: { ...current.data, [field]: value },
  }));

  const updateStandardPrice = (nextPrice) => setProductModal((current) => {
    const previousPrice = integerValue(current.data.price);
    const uniqueVariantPrices = [...new Set(
      (current.data.variants || [])
        .map((variant) => integerValue(variant.price))
        .filter((price) => price > 0),
    )];
    // Older records can have a product price that is already out of sync with
    // otherwise identical SKU prices. In that case all SKUs still follow one
    // common standard price and should move together on the next edit.
    const allVariantsShareOnePrice = uniqueVariantPrices.length <= 1;
    const variants = (current.data.variants || []).map((variant) => {
      const variantPrice = integerValue(variant.price);
      const followsStandardPrice = allVariantsShareOnePrice
        || variantPrice === previousPrice
        || (variant.isNew && variantPrice === 0);
      return followsStandardPrice ? { ...variant, price: nextPrice } : variant;
    });

    return {
      ...current,
      data: { ...current.data, price: nextPrice, variants },
    };
  });

  const updateEditorVariant = (index, field, value) => setProductModal((current) => {
    const inheritanceFlag = { costPrice: "costInherited", floorPrice: "floorInherited", stock: "stockInherited", minStock: "minInherited", maxStock: "maxInherited" }[field];
    return {
      ...current,
      data: {
        ...current.data,
        variants: current.data.variants.map((variant, variantIndex) => variantIndex === index ? { ...variant, [field]: value, ...(inheritanceFlag ? { [inheritanceFlag]: false } : {}) } : variant),
      },
    };
  });

  const updateVariantBuilder = (field, value) => setProductModal((current) => {
    const mapping = {
      defaultCostPrice: ["costPrice", "costInherited"], defaultFloorPrice: ["floorPrice", "floorInherited"],
      defaultStock: ["stock", "stockInherited"], defaultMinStock: ["minStock", "minInherited"], defaultMaxStock: ["maxStock", "maxInherited"],
    }[field];
    let data = buildVariantMatrix(current.data, { [field]: value });
    if (mapping) {
      const [variantField, inheritanceFlag] = mapping;
      data = { ...data, variants: data.variants.map((variant) => variant[inheritanceFlag] === false ? variant : { ...variant, [variantField]: value, [inheritanceFlag]: true }) };
    }
    return { ...current, data };
  });

  const handleImageUpload = async (event) => {
    const files = [...(event.target.files || [])];
    event.target.value = "";
    if (!files.length) return;
    setUploadingImages(true); setError("");
    try {
      const uploaded = [];
      for (const file of files) {
        if (!['image/webp', 'image/jpeg', 'image/png'].includes(file.type)) throw new Error(`${file.name}: chỉ hỗ trợ WebP, JPEG hoặc PNG.`);
        if (file.size > 8 * 1024 * 1024) throw new Error(`${file.name}: dung lượng vượt quá 8 MB.`);
        const result = await productsAPI.uploadImage(file, productModal.data.productCode || "product");
        uploaded.push(result.path);
      }
      setProductModal((current) => {
        const selectedColor = current.data.selectedImageColor || "__general";
        if (selectedColor === "__general") {
          const currentImages = String(current.data.imageText || "").split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
          return { ...current, data: { ...current.data, imageText: [...currentImages, ...uploaded].join("\n") } };
        }
        const colorImages = { ...(current.data.colorImages || {}) };
        colorImages[selectedColor] = [...(colorImages[selectedColor] || []), ...uploaded];
        return { ...current, data: { ...current.data, colorImages } };
      });
    } catch (uploadError) { setError(uploadError.message || "Không thể tải ảnh lên."); }
    finally { setUploadingImages(false); }
  };

  const removeModalImage = (index) => setProductModal((current) => {
    const selectedColor = current.data.selectedImageColor || "__general";
    if (selectedColor === "__general") {
      const images = String(current.data.imageText || "").split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
      return { ...current, data: { ...current.data, imageText: images.filter((_, imageIndex) => imageIndex !== index).join("\n") } };
    }
    const colorImages = { ...(current.data.colorImages || {}) };
    colorImages[selectedColor] = (colorImages[selectedColor] || []).filter((_, imageIndex) => imageIndex !== index);
    return { ...current, data: { ...current.data, colorImages } };
  });

  const loadProducts = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await productsAPI.getAllAdmin(catalogScope);
      setProducts(res.products || []);
      setSelectedProduct((current) => current ? (res.products.find((product) => product.id === current.id) || current) : null);
    } catch (err) {
      setError(err.message || "Không thể tải danh sách sản phẩm.");
    } finally {
      setLoading(false);
    }
  }, [catalogScope, setSelectedProduct]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const allCollections = useMemo(
    () => [...new Set(products.map((product) => (product.collectionName || product.collection || "")).filter(Boolean))],
    [products]
  );
  const allGenders = useMemo(
    () => [...new Set(products.map((product) => (product.gender || "")).filter(Boolean))],
    [products]
  );

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const imageUnavailable = isProductImageUnavailable(product);
      const businessStatus = getProductBusinessStatus(product, imageUnavailable);
      const dataStatus = getProductDataStatus(product, imageUnavailable);
      const inventorySummary = getInventorySummary(product);
      const skuSearchText = (product.variants || []).map((variant) => (variant?.sku || "")).join(" ");

      if (businessFilter !== "all" && businessStatus !== businessFilter) return false;
      if (categoryFilter !== "all" && String(product.category || "") !== categoryFilter) return false;
      if (collectionFilter !== "all" && String(product.collectionName || product.collection || "") !== collectionFilter) return false;
      if (genderFilter !== "all" && String(product.gender || "") !== genderFilter) return false;
      if (dataStatusFilter !== "all" && dataStatus !== dataStatusFilter) return false;
      if (inventoryFilter !== "all") {
        const matchingStockCount = {
          out: inventorySummary.outOfStock,
          low: inventorySummary.lowStock,
          stable: inventorySummary.stable,
          over: inventorySummary.overStock,
        }[inventoryFilter] || 0;
        if (matchingStockCount === 0) return false;
      }
      if (search.trim()) {
        const q = search.toLowerCase();
        const code = (product.productCode || product.product_code || "").toLowerCase();
        const name = (product.name || "").toLowerCase();
        const skuMatch = skuSearchText.toLowerCase().includes(q);
        const collection = (product.collectionName || product.collection || "").toLowerCase();
        if (!code.includes(q) && !name.includes(q) && !skuMatch && !collection.includes(q)) return false;
      }
      return true;
    });
  }, [products, isProductImageUnavailable, businessFilter, categoryFilter, collectionFilter, genderFilter, dataStatusFilter, inventoryFilter, search]);

  const stats = useMemo(() => {
    const counts = {
      totalProducts: products.length,
      activeProducts: products.filter((product) => getProductBusinessStatus(product, isProductImageUnavailable(product)) === "Đang kinh doanh").length,
      incompleteProducts: products.filter((product) => getProductDataStatus(product, isProductImageUnavailable(product)) === "Cần hoàn tất").length,
      inactiveProducts: products.filter((product) => getProductBusinessStatus(product, isProductImageUnavailable(product)) === "Ngừng kinh doanh").length,
      skuOutOfStock: products.reduce((sum, product) => sum + getInventorySummary(product).outOfStock, 0),
      skuLowStock: products.reduce((sum, product) => sum + getInventorySummary(product).lowStock, 0),
      skuOverStock: products.reduce((sum, product) => sum + getInventorySummary(product).overStock, 0),
    };

    return counts;
  }, [products, isProductImageUnavailable]);

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / PAGE_SIZE));
  const pagedProducts = filteredProducts.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => setPage(1), [catalogScope, businessFilter, categoryFilter, collectionFilter, genderFilter, dataStatusFilter, inventoryFilter, search]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  const applyQuickFilter = (filter) => {
    if (filter === "all") {
      setBusinessFilter("all");
      setInventoryFilter("all");
      setDataStatusFilter("all");
      return;
    }
    if (filter === "incomplete") {
      setBusinessFilter("all");
      setInventoryFilter("all");
      setDataStatusFilter("Cần hoàn tất");
      return;
    }
    if (filter === "active" || filter === "inactive") {
      setBusinessFilter(filter === "active" ? "Đang kinh doanh" : "Ngừng kinh doanh");
      setInventoryFilter("all");
      setDataStatusFilter("all");
      return;
    }
    setBusinessFilter("all");
    setInventoryFilter(filter);
    setDataStatusFilter("all");
  };

  const changeCatalogScope = (nextScope) => {
    setCatalogScope(nextScope);
    setSelectedProduct(null);
    setBusinessFilter(nextScope === "current" ? "Đang kinh doanh" : "all");
    setInventoryFilter("all");
    setDataStatusFilter("all");
  };

  // Product Actions
  const handleSaveProduct = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    setFormError("");
    setFieldErrors({});
    setSuccessMsg("");
    try {
      const standardPrice = integerValue(productModal.data.price);
      const draftVariants = productModal.data.variants || [];
      const uniqueVariantPrices = [...new Set(
        draftVariants.map((variant) => integerValue(variant.price)).filter((price) => price > 0),
      )];
      // Repair records saved by the previous UI where the product standard
      // price changed but every SKU was left at one identical old price.
      const variants = uniqueVariantPrices.length <= 1 && standardPrice > 0
        ? draftVariants.map((variant) => ({ ...variant, price: standardPrice }))
        : draftVariants;
      const form = {
        ...productModal.data,
        price: standardPrice,
        variants,
        images: String(productModal.data.imageText || "").split(/\r?\n/).map((item) => item.trim()).filter(Boolean),
        colors: [...new Set(variants.map((variant) => String(variant.color || "").trim()).filter(Boolean))],
      };
      const errors = {};
      if (!String(form.productCode || "").trim()) errors.productCode = "Hệ thống chưa cấp được mã sản phẩm.";
      if (!String(form.name || "").trim()) errors.name = "Vui lòng nhập tên sản phẩm.";
      if (integerValue(form.price) <= 0) errors.price = "Giá bán chuẩn phải lớn hơn 0đ.";
      if (productModal.mode === "create") {
        const colorListError = validateOptionList(form.variantColors, "color", form.category);
        const sizeListError = validateOptionList(form.variantSizes, "size", form.category);
        if (colorListError) errors.variantColors = colorListError;
        if (sizeListError) errors.variantSizes = sizeListError;
        if ((form.variants || []).length > 100) errors.variantColors = "Một sản phẩm chỉ nên tạo tối đa 100 tổ hợp SKU trong một lần.";
      }
      if (!form.variants?.length) errors.variantColors = "Sản phẩm phải có ít nhất một tổ hợp màu và kích cỡ.";
      const seenSkus = new Set();
      const seenSelections = new Set();
      for (const [index, variant] of form.variants.entries()) {
        const variantErrors = validateVariantFields(variant, form.category);
        Object.entries(variantErrors).forEach(([field, message]) => { errors[`variants.${index}.${field}`] = message; });
        const skuKey = normalizeOptionKey(variant.sku);
        const selectionKey = `${normalizeOptionKey(variant.color)}|${normalizeOptionKey(variant.size)}`;
        if (seenSkus.has(skuKey)) errors[`variants.${index}.sku`] = "Mã SKU đang bị trùng trong danh sách.";
        if (seenSelections.has(selectionKey)) errors[`variants.${index}.size`] = "Tổ hợp màu và kích cỡ này đã tồn tại trong danh sách.";
        seenSkus.add(skuKey);
        seenSelections.add(selectionKey);
      }
      if (Object.keys(errors).length) {
        showFieldErrors(errors);
        return;
      }
      if (productModal.mode === "create") {
        await productsAPI.createProductAdmin(form);
        setSuccessMsg(`Đã tạo sản phẩm ${form.productCode} thành công.`);
      } else {
        await productsAPI.updateProductAdmin(form.id, form);
        for (const variant of form.variants) {
          if (variant.isNew) await productsAPI.createVariantAdmin(form.id, variant);
          else await productsAPI.updateVariantAdmin(form.id, variant.id, variant);
        }
        setSuccessMsg(`Đã cập nhật sản phẩm ${form.productCode} thành công.`);
      }
      setProductModal(null);
      await loadProducts();
    } catch (err) {
      setFormError(err.message || "Không thể lưu sản phẩm. Vui lòng kiểm tra lại thông tin.");
    } finally {
      setBusy(false);
    }
  };

  const handleSoftDeleteProduct = async (p) => {
    const reason = window.prompt(`Nhập lý do tạm ngừng kinh doanh sản phẩm "${p.name}" (${p.productCode}):`, "Tạm ngừng kinh doanh theo quyết định Quản trị");
    if (!reason) return;
    setBusy(true);
    try {
      await productsAPI.softDeleteProductAdmin(p.id, reason);
      setSuccessMsg(`Đã chuyển sản phẩm ${p.productCode} sang trạng thái ngừng kinh doanh.`);
      await loadProducts();
    } catch (err) {
      setError(err.message || "Lỗi khi ngừng kinh doanh sản phẩm.");
    } finally {
      setBusy(false);
    }
  };

  const handleRestoreProduct = async (p) => {
    if (!window.confirm(`Xác nhận khôi phục kinh doanh cho sản phẩm "${p.name}" (${p.productCode})? Các SKU đã từng ngừng bán riêng lẻ sẽ được bảo lưu.`)) return;
    setBusy(true);
    try {
      await productsAPI.restoreProductAdmin(p.id);
      setSuccessMsg(`Đã khôi phục sản phẩm ${p.productCode} thành công.`);
      await loadProducts();
    } catch (err) {
      setError(err.message || "Lỗi khi khôi phục sản phẩm.");
    } finally {
      setBusy(false);
    }
  };

  // Variant Actions
  const handleSaveVariant = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    setFormError("");
    setFieldErrors({});
    setSuccessMsg("");
    try {
      const { productId, mode, data } = variantModal;
      const errors = validateVariantFields(data, variantModal.category || "clothing");
      if (Object.keys(errors).length) {
        showFieldErrors(errors);
        return;
      }
      if (mode === "create") {
        await productsAPI.createVariantAdmin(productId, data);
        setSuccessMsg(`Đã thêm SKU mới ${data.sku || ""} thành công.`);
      } else {
        await productsAPI.updateVariantAdmin(productId, data.id, data);
        setSuccessMsg(`Đã cập nhật SKU ${data.sku} thành công.`);
      }
      setVariantModal(null);
      await loadProducts();
    } catch (err) {
      setFormError(err.message || "Không thể lưu SKU. Vui lòng kiểm tra lại thông tin.");
    } finally {
      setBusy(false);
    }
  };

  const handleSoftDeleteVariant = async (productId, v) => {
    const reason = window.prompt(`Nhập lý do ngừng bán SKU "${v.sku}":`, "Tạm ngừng kinh doanh SKU");
    if (!reason) return;
    setBusy(true);
    try {
      await productsAPI.softDeleteVariantAdmin(productId, v.id, reason);
      setSuccessMsg(`Đã ngừng kinh doanh SKU ${v.sku}.`);
      await loadProducts();
    } catch (err) {
      setError(err.message || "Lỗi khi ngừng bán SKU.");
    } finally {
      setBusy(false);
    }
  };

  const handleRestoreVariant = async (productId, v) => {
    if (!window.confirm(`Khôi phục kinh doanh SKU "${v.sku}"?`)) return;
    setBusy(true);
    try {
      await productsAPI.restoreVariantAdmin(productId, v.id);
      setSuccessMsg(`Đã khôi phục SKU ${v.sku}.`);
      await loadProducts();
    } catch (err) {
      setError(err.message || "Lỗi khi khôi phục SKU.");
    } finally {
      setBusy(false);
    }
  };

  const handleViewMovements = async (productId) => {
    setBusy(true);
    try {
      const res = await productsAPI.getMovements(productId);
      setMovementsModal({ productId, movements: res.movements || [] });
    } catch (err) {
      setError(err.message || "Lỗi khi tải lịch sử kho.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin-products" style={{ fontFamily: "'Inter', sans-serif" }}>
      {/* Header */}
      <header className="admin-products__header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "25px" }}>
        <div>
          <span style={{ fontSize: "11px", fontWeight: "700", color: "#8A5A36", letterSpacing: "1.5px", textTransform: "uppercase" }}>
            Quản trị danh mục & SKU
          </span>
          <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "32px", color: "#14100E", margin: "4px 0 6px" }}>
            QUẢN LÝ SẢN PHẨM & TỒN KHO SKU
          </h1>
          <p style={{ color: "#6B5A4B", fontSize: "13.5px", margin: 0 }}>
            Thêm mới, chỉnh sửa thông tin, xóa mềm, khôi phục kinh doanh và theo dõi nhật ký kiểm toán tồn kho từng SKU.
          </p>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", justifyContent: "flex-end" }}>
          <Link to="/admin/inventory" style={{ border: "1px solid #8A5A36", color: "#6F482D", borderRadius: "6px", padding: "10px 16px", fontSize: "13px", fontWeight: "600", textDecoration: "none", display: "flex", alignItems: "center", gap: "8px" }}>
            <i className="fas fa-warehouse" /> Vận Hành Kho
          </Link>
          <button
            onClick={openCreateProduct}
            style={{
            backgroundColor: "#8A5A36",
            color: "#FFF",
            border: "none",
            borderRadius: "6px",
            padding: "11px 20px",
            fontSize: "13px",
            fontWeight: "600",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
          >
            <i className="fas fa-plus"></i> Thêm Sản Phẩm Mới
          </button>
        </div>
      </header>

      {/* Notifications */}
      {error && (
        <div style={{ backgroundColor: "#FFF0F0", border: "1px solid #F5C6CB", color: "#D9534F", padding: "12px 18px", borderRadius: "6px", marginBottom: "20px", fontSize: "13.5px" }}>
          ⚠️ {error}
        </div>
      )}
      {successMsg && (
        <div style={{ backgroundColor: "#F0FFF0", border: "1px solid #C3E6CB", color: "#2E8B57", padding: "12px 18px", borderRadius: "6px", marginBottom: "20px", fontSize: "13.5px" }}>
          ✓ {successMsg}
        </div>
      )}

      <div className="admin-products__summary" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: "12px", marginBottom: "18px" }}>
        {[
          { key: "all", label: "Tổng sản phẩm", value: stats.totalProducts, tone: "#F4EEE8" },
          { key: "active", label: "Đang kinh doanh", value: stats.activeProducts, tone: "#EAF7EC" },
          { key: "incomplete", label: "Cần hoàn tất", value: stats.incompleteProducts, tone: "#F8F0E5" },
          { key: "out", label: "SKU hết hàng", value: stats.skuOutOfStock, tone: "#FCEBED" },
          { key: "low", label: "SKU sắp hết", value: stats.skuLowStock, tone: "#FFF3DE" },
          { key: "over", label: "SKU vượt mức tồn", value: stats.skuOverStock, tone: "#F7E7F4" },
          { key: "inactive", label: "Ngừng kinh doanh", value: stats.inactiveProducts, tone: "#F3E8E3" },
        ].map((summary) => (
          <button
            key={summary.label}
            type="button"
            onClick={() => applyQuickFilter(summary.key)}
            style={{ border: "1px solid #E8E1D6", borderRadius: "8px", background: summary.tone, padding: "12px 14px", textAlign: "left", cursor: "pointer" }}
          >
            <div style={{ fontSize: "11px", letterSpacing: "0.6px", textTransform: "uppercase", color: "#745E4C", fontWeight: "700" }}>{summary.label}</div>
            <div style={{ marginTop: "8px", fontSize: "24px", fontWeight: "700", color: "#14100E" }}>{summary.value}</div>
          </button>
        ))}
      </div>

      {/* Filter Bar */}
      <div className="admin-products__filters" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "12px", backgroundColor: "#FFF", padding: "16px 20px", borderRadius: "8px", border: "1px solid #E8E1D6", marginBottom: "12px", alignItems: "end" }}>
        <div>
          <label style={{ display: "block", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.7px", color: "#7A6557", marginBottom: "6px" }}>Phạm vi dữ liệu</label>
          <select value={catalogScope} onChange={(e) => changeCatalogScope(e.target.value)} style={{ width: "100%", padding: "9px 12px", border: "1px solid #D8CEC1", borderRadius: "5px", fontSize: "13px", backgroundColor: "#FFF" }}>
            <option value="current">Catalog hiện hành</option>
            <option value="legacy">Dữ liệu lưu trữ cũ</option>
            <option value="all">Tất cả dữ liệu</option>
          </select>
        </div>
        <div>
          <label style={{ display: "block", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.7px", color: "#7A6557", marginBottom: "6px" }}>Tìm kiếm</label>
          <input
            type="text"
            placeholder="Tên, mã hoặc SKU..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: "100%", padding: "9px 12px", border: "1px solid #D8CEC1", borderRadius: "5px", fontSize: "13px", outline: "none", boxSizing: "border-box" }}
          />
        </div>
        <div>
          <label style={{ display: "block", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.7px", color: "#7A6557", marginBottom: "6px" }}>Trạng thái kinh doanh</label>
          <select value={businessFilter} onChange={(e) => setBusinessFilter(e.target.value)} style={{ width: "100%", padding: "9px 12px", border: "1px solid #D8CEC1", borderRadius: "5px", fontSize: "13px", backgroundColor: "#FFF" }}>
            <option value="all">Tất cả</option>
            <option value="Đang kinh doanh">Đang kinh doanh</option>
            <option value="Cần hoàn tất">Cần hoàn tất</option>
            <option value="Ngừng kinh doanh">Ngừng kinh doanh</option>
          </select>
        </div>
        <div>
          <label style={{ display: "block", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.7px", color: "#7A6557", marginBottom: "6px" }}>Tình trạng kho</label>
          <select value={inventoryFilter} onChange={(e) => setInventoryFilter(e.target.value)} style={{ width: "100%", padding: "9px 12px", border: "1px solid #D8CEC1", borderRadius: "5px", fontSize: "13px", backgroundColor: "#FFF" }}>
            <option value="all">Tất cả</option>
            <option value="out">Hết hàng</option>
            <option value="low">Sắp hết</option>
            <option value="stable">Ổn định</option>
            <option value="over">Vượt mức tồn</option>
          </select>
        </div>
        <div>
          <label style={{ display: "block", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.7px", color: "#7A6557", marginBottom: "6px" }}>Danh mục</label>
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} style={{ width: "100%", padding: "9px 12px", border: "1px solid #D8CEC1", borderRadius: "5px", fontSize: "13px", backgroundColor: "#FFF" }}>
            <option value="all">Tất cả</option>
            <option value="clothing">Trang phục</option>
            <option value="footwear">Giày dép</option>
            <option value="accessories">Phụ kiện</option>
          </select>
        </div>
        <div>
          <label style={{ display: "block", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.7px", color: "#7A6557", marginBottom: "6px" }}>Đối tượng</label>
          <select value={genderFilter} onChange={(e) => setGenderFilter(e.target.value)} style={{ width: "100%", padding: "9px 12px", border: "1px solid #D8CEC1", borderRadius: "5px", fontSize: "13px", backgroundColor: "#FFF" }}>
            <option value="all">Tất cả</option>
            {allGenders.map((gender) => <option key={gender} value={gender}>{gender}</option>)}
          </select>
        </div>
        <div>
          <label style={{ display: "block", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.7px", color: "#7A6557", marginBottom: "6px" }}>Bộ sưu tập</label>
          <select value={collectionFilter} onChange={(e) => setCollectionFilter(e.target.value)} style={{ width: "100%", padding: "9px 12px", border: "1px solid #D8CEC1", borderRadius: "5px", fontSize: "13px", backgroundColor: "#FFF" }}>
            <option value="all">Tất cả</option>
            {allCollections.map((collection) => <option key={collection} value={collection}>{collection}</option>)}
          </select>
        </div>
      </div>
      <div style={{ margin: "0 0 18px", color: "#806D60", fontSize: "12px" }}>
        {catalogScope === "current" ? "Đang vận hành catalog từ mã MR-106 trở đi. Dữ liệu cũ chỉ được mở trong mục lưu trữ." : catalogScope === "legacy" ? "Dữ liệu lưu trữ chỉ để tra cứu lịch sử; không dùng để vận hành kho hoặc bán hàng." : "Chế độ kiểm tra toàn bộ dữ liệu. Hãy thận trọng khi thao tác với bản ghi lưu trữ."}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "18px" }}>
        {[
          { key: "all", label: "Tất cả" },
          { key: "incomplete", label: "Cần hoàn tất" },
          { key: "out", label: "Hết hàng" },
          { key: "low", label: "Sắp hết" },
          { key: "over", label: "Vượt mức tồn" },
          { key: "inactive", label: "Ngừng kinh doanh" },
        ].map((filter) => {
          const selected =
            (filter.key === "all" && businessFilter === "all" && inventoryFilter === "all" && dataStatusFilter === "all") ||
            (filter.key === "incomplete" && dataStatusFilter === "Cần hoàn tất") ||
            (["out", "low", "over"].includes(filter.key) && inventoryFilter === filter.key) ||
            (filter.key === "inactive" && businessFilter === "Ngừng kinh doanh");

          return (
            <button
              key={filter.key}
              type="button"
              onClick={() => applyQuickFilter(filter.key)}
              style={{
                border: "1px solid #D8CEC1",
                background: selected ? "#8A5A36" : "#FFF",
                borderRadius: "999px",
                padding: "7px 12px",
                fontSize: "12px",
                fontWeight: "600",
                color: selected ? "#FFF" : "#4E342E",
                cursor: "pointer",
              }}
            >
              {filter.label}
            </button>
          );
        })}
      </div>

      {/* Main Content Layout */}
      <div className={`admin-products__content ${selectedProduct ? "has-inspector" : ""}`} style={{ display: "grid", gridTemplateColumns: selectedProduct ? "1.7fr 1fr" : "1fr", gap: "25px" }}>
        {/* Products Table */}
        <div style={{ backgroundColor: "#FFF", borderRadius: "8px", border: "1px solid #E8E1D6", overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid #E8E1D6", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2 style={{ margin: 0, fontSize: "16px", fontWeight: "600", color: "#14100E" }}>
              Danh Sách Sản Phẩm
            </h2>
            <button onClick={loadProducts} disabled={busy} style={{ background: "none", border: "none", color: "#8A5A36", cursor: "pointer", fontSize: "12.5px", fontWeight: "600" }}>
              <i className="fas fa-sync-alt"></i> Làm mới
            </button>
          </div>

          {loading ? (
            <div style={{ padding: "40px", textAlign: "center", color: "#8A7350" }}>Đang tải danh mục sản phẩm...</div>
          ) : (
            <div className="admin-products__table-scroll" style={{ overflowX: "auto" }}>
              <table className="admin-products__table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "12.5px", textAlign: "left", minWidth: "1180px" }}>
                <thead>
                  <tr style={{ backgroundColor: "#FAF6F0", borderBottom: "1px solid #E8E1D6", color: "#6B5A4B", textTransform: "uppercase", fontSize: "10.5px", letterSpacing: "0.5px" }}>
                    <th style={{ padding: "12px 14px" }}>Sản Phẩm</th>
                    <th className="admin-products__classification" style={{ padding: "12px 12px" }}>Phân Loại</th>
                    <th style={{ padding: "12px 12px" }}>Giá</th>
                    <th style={{ padding: "12px 12px" }}>SKU</th>
                    <th style={{ padding: "12px 12px" }}>Tồn Kho</th>
                    <th className="admin-products__data" style={{ padding: "12px 12px" }}>Dữ Liệu</th>
                    <th style={{ padding: "12px 12px" }}>Trạng Thái</th>
                    <th style={{ padding: "12px 12px", textAlign: "right" }}>Thao Tác</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedProducts.map((p) => {
                    const isSelected = selectedProduct?.id === p.id;
                    const image = getProductImage(p);
                    const imageUnavailable = isProductImageUnavailable(p);
                    const businessStatus = getProductBusinessStatus(p, imageUnavailable);
                    const dataStatus = getProductDataStatus(p, imageUnavailable);
                    const inventorySummary = getInventorySummary(p);
                    const priceLabel = getPriceLabel(p);
                    const legacyProduct = isLegacyProduct(p);
                    return (
                      <tr key={p.id} onClick={() => setSelectedProduct(p)} style={{ borderBottom: "1px solid #F0EAE1", backgroundColor: isSelected ? "rgba(138, 90, 54, 0.08)" : "transparent", cursor: "pointer" }}>
                        <td className="admin-products__identity" style={{ padding: "12px 14px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                            <div style={{ width: "56px", height: "56px", borderRadius: "8px", overflow: "hidden", border: "1px solid #E8E1D6", backgroundColor: "#F8F2EC", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                              {image && !imageUnavailable ? (
                                <img
                                  src={normalizeImageUrl(image)}
                                  alt={p.name}
                                  loading="lazy"
                                  onError={() => {
                                    if (!image || imageUnavailable) return;
                                    const failedImage = normalizeImageUrl(image);
                                    setUnavailableProductImages((current) => ({ ...current, [p.id]: failedImage }));
                                  }}
                                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                                />
                              ) : (
                                <span style={{ padding: "6px", color: "#8A7350", fontSize: "10px", lineHeight: 1.25, textAlign: "center" }}>Chưa có ảnh</span>
                              )}
                            </div>
                            <div className="admin-products__identity-copy">
                              <div style={{ fontWeight: "700", color: "#14100E", marginBottom: "4px" }}>{p.name}</div>
                              <div style={{ fontSize: "11px", color: "#8A7350", marginBottom: "2px" }}>{p.productCode || p.product_code}</div>
                              <div style={{ fontSize: "10.5px", color: "#6B5A4B" }}>{p.collectionName || p.collection || ""}</div>
                              <div className="admin-products__compact-meta">{p.category || "—"} · {p.gender || "—"} · {dataStatus}</div>
                            </div>
                          </div>
                        </td>
                        <td className="admin-products__classification" style={{ padding: "12px 12px", color: "#6B5A4B" }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                            <span>{p.category || "—"}</span>
                            <span>{p.gender || "—"}</span>
                            <small>{inventorySummary.total} SKU · {getColorCount(p)} màu</small>
                          </div>
                        </td>
                        <td style={{ padding: "12px 12px", fontWeight: "600", color: "#2B211C" }}>
                          <div>{priceLabel}</div>
                          {((p.variants || []).some((variant) => safeNumber(variant.costPrice) === 0) || (p.variants || []).some((variant) => safeNumber(variant.floorPrice) <= 0)) && (
                            <small style={{ color: "#B55A2A", display: "block", marginTop: "4px" }}>Cảnh báo giá vốn / giá sàn</small>
                          )}
                        </td>
                        <td style={{ padding: "12px 12px" }}>
                          <div style={{ fontWeight: "700" }}>{inventorySummary.total} SKU</div>
                          <div style={{ fontSize: "11px", color: "#2E8B57" }}>{inventorySummary.sold} đang bán</div>
                          <div style={{ fontSize: "11px", color: "#D9534F" }}>{inventorySummary.inactive} ngừng bán</div>
                        </td>
                        <td style={{ padding: "12px 12px" }}>
                          {legacyProduct ? <span style={{ color: "#806D60", fontSize: "11px" }}>Không theo dõi</span> : <>
                            <div style={{ fontWeight: "700" }}>{inventorySummary.activeStock.toLocaleString("vi-VN")} có thể bán</div>
                            <div style={{ fontSize: "11px", color: "#6B5A4B" }}>Thực tế {inventorySummary.physicalStock} · Giữ {inventorySummary.reservedStock}</div>
                            {(inventorySummary.quarantineStock > 0 || inventorySummary.incomingStock > 0) && <div style={{ fontSize: "11px", color: "#8A7350" }}>Kiểm tra {inventorySummary.quarantineStock} · Đang về {inventorySummary.incomingStock}</div>}
                            <div style={{ fontSize: "11px", color: "#D9534F" }}>{inventorySummary.outOfStock} hết hàng</div>
                            <div style={{ fontSize: "11px", color: "#B56A1F" }}>{inventorySummary.lowStock} sắp hết</div>
                            <div style={{ fontSize: "11px", color: "#2E8B57" }}>{inventorySummary.stable} ổn định</div>
                            <div style={{ fontSize: "11px", color: "#8A5A36" }}>{inventorySummary.overStock} vượt mức</div>
                          </>}
                        </td>
                        <td className="admin-products__data" style={{ padding: "12px 12px" }}>
                          <span title={getProductDataIssues(p, imageUnavailable).length ? `Cần bổ sung: ${getProductDataIssues(p, imageUnavailable).join(", ")}` : "Dữ liệu đã sẵn sàng"} style={{ display: "inline-block", padding: "4px 8px", backgroundColor: dataStatus === "Hoàn chỉnh" ? "#EAF7EC" : dataStatus === "Lưu trữ" ? "#F2EEE9" : "#FFF3DE", color: "#3D2B22", borderRadius: "999px", fontWeight: "600", fontSize: "11px" }}>{dataStatus}</span>
                          {getProductDataIssues(p, imageUnavailable).length > 0 && <small style={{ display: "block", marginTop: "5px", maxWidth: "140px", color: "#806D60", fontSize: "10px" }}>{getProductDataIssues(p, imageUnavailable).slice(0, 2).join(" · ")}</small>}
                        </td>
                        <td style={{ padding: "12px 12px" }}>
                          <span style={{ display: "inline-block", padding: "4px 8px", backgroundColor: businessStatus === "Đang kinh doanh" ? "#EAF7EC" : businessStatus === "Ngừng kinh doanh" ? "#FCEBED" : "#F8F0E5", color: businessStatus === "Đang kinh doanh" ? "#2E8B57" : businessStatus === "Ngừng kinh doanh" ? "#B23535" : "#745E4C", borderRadius: "999px", fontWeight: "600", fontSize: "11px" }}>{businessStatus}</span>
                        </td>
                        <td style={{ padding: "12px 12px", textAlign: "right" }} onClick={(e) => e.stopPropagation()}>
                          <div style={{ display: "inline-flex", gap: "6px" }}>
                            <button onClick={() => setSelectedProduct(p)} title="Xem chi tiết" style={{ padding: "4px 8px", backgroundColor: "#FAF6F0", border: "1px solid #D8CEC1", borderRadius: "4px", fontSize: "11px", cursor: "pointer" }}><i className="fas fa-eye"></i></button>
                            {!legacyProduct && <button onClick={() => openEditProduct(p)} title="Chỉnh sửa" style={{ padding: "4px 8px", backgroundColor: "#FAF6F0", border: "1px solid #D8CEC1", borderRadius: "4px", fontSize: "11px", cursor: "pointer" }}><i className="fas fa-edit"></i></button>}
                            {legacyProduct ? (
                              <span title="Mã sản phẩm cũ được xếp vào mục ngừng kinh doanh" style={{ padding: "4px 8px", color: "#745E4C" }}><i className="fas fa-box-archive"></i></span>
                            ) : isProductActive(p) ? (
                              <button onClick={() => handleSoftDeleteProduct(p)} title="Ngừng bán bằng xóa mềm" style={{ padding: "4px 8px", backgroundColor: "#FFF0F0", border: "1px solid #F5C6CB", color: "#D9534F", borderRadius: "4px", fontSize: "11px", cursor: "pointer" }}><i className="fas fa-trash-alt"></i></button>
                            ) : (
                              <button onClick={() => handleRestoreProduct(p)} title="Khôi phục" style={{ padding: "4px 8px", backgroundColor: "#F0FFF0", border: "1px solid #C3E6CB", color: "#2E8B57", borderRadius: "4px", fontSize: "11px", cursor: "pointer" }}><i className="fas fa-undo"></i></button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {!loading && <AdminPagination page={page} total={filteredProducts.length} pageSize={PAGE_SIZE} onPageChange={setPage} itemLabel="sản phẩm" />}
        </div>

        {/* Selected Product SKU & Details Inspector */}
        {selectedProduct && (
          <div style={{ backgroundColor: "#FFF", borderRadius: "8px", border: "1px solid #E8E1D6", padding: "20px", display: "flex", flexDirection: "column", gap: "20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "1px solid #E8E1D6", paddingBottom: "15px" }}>
              <div>
                <span style={{ fontSize: "11px", color: "#8A5A36", textTransform: "uppercase", fontWeight: "700" }}>
                  Chi tiết sản phẩm & danh sách SKU
                </span>
                <h3 style={{ margin: "4px 0 2px", fontSize: "20px", color: "#14100E" }}>
                  {selectedProduct.name} ({selectedProduct.productCode || selectedProduct.product_code})
                </h3>
                <div style={{ fontSize: "12px", color: "#6B5A4B" }}>
                  Chất liệu: {selectedProduct.material || "N/A"} • Bộ sưu tập: {selectedProduct.collection || "Maison Rue"}
                </div>
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  onClick={() => handleViewMovements(selectedProduct.id)}
                  style={{ padding: "6px 12px", backgroundColor: "#FAF6F0", border: "1px solid #D8CEC1", borderRadius: "4px", fontSize: "12px", cursor: "pointer", fontWeight: "600", color: "#4E342E" }}
                >
                  <i className="fas fa-history"></i> Lịch Sử Kho
                </button>
                <button
                  onClick={() => setSelectedProduct(null)}
                  style={{ padding: "6px 10px", background: "none", border: "none", fontSize: "14px", cursor: "pointer", color: "#8A7350" }}
                >
                  ✕
                </button>
              </div>
            </div>

            {/* SKU Section */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                <h4 style={{ margin: 0, fontSize: "14px", fontWeight: "600", color: "#2B211C" }}>
                  Danh Sách SKU ({selectedProduct.variants?.length || 0})
                </h4>
                {!isLegacyProduct(selectedProduct) && <button
                  onClick={() => setVariantModal({
                    mode: "create",
                    productId: selectedProduct.id,
                    category: selectedProduct.category,
                    data: {
                      sku: `${selectedProduct.productCode || selectedProduct.product_code}-NEW-M`,
                      color: "Standard",
                      size: "M",
                      price: selectedProduct.price,
                      costPrice: 1500000,
                      floorPrice: 2500000,
                      stock: 5,
                      minStock: 2,
                      maxStock: 25,
                    },
                  })}
                  style={{ padding: "5px 12px", backgroundColor: "#4E342E", color: "#FFF", border: "none", borderRadius: "4px", fontSize: "12px", cursor: "pointer", fontWeight: "600" }}
                >
                  <i className="fas fa-plus"></i> Thêm SKU
                </button>}
              </div>

              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12.5px" }}>
                  <thead>
                    <tr style={{ backgroundColor: "#FAF6F0", borderBottom: "1px solid #E8E1D6", color: "#6B5A4B", textTransform: "uppercase", fontSize: "10.5px" }}>
                      <th style={{ padding: "8px 10px", textAlign: "left" }}>Mã SKU</th>
                      <th style={{ padding: "8px 10px", textAlign: "left" }}>Màu/Size</th>
                      <th style={{ padding: "8px 10px", textAlign: "right" }}>Giá bán</th>
                      <th style={{ padding: "8px 10px", textAlign: "right" }}>Giá vốn</th>
                      <th style={{ padding: "8px 10px", textAlign: "right" }}>Giá sàn</th>
                      <th style={{ padding: "8px 10px", textAlign: "center" }}>Tồn kho</th>
                      <th style={{ padding: "8px 10px", textAlign: "center" }}>Trạng thái</th>
                      <th style={{ padding: "8px 10px", textAlign: "right" }}>Hành động</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(selectedProduct.variants || []).map((v) => {
                      const variantActive = isProductActive(selectedProduct) && isVariantActive(v);
                      return (
                      <tr key={v.id} style={{ borderBottom: "1px solid #F0EAE1" }}>
                        <td style={{ padding: "8px 10px", fontWeight: "600", color: "#14100E" }}>{v.sku}</td>
                        <td style={{ padding: "8px 10px", color: "#4E342E" }}>{v.color} / {v.size}</td>
                        <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: "600" }}>{money(v.price)}</td>
                        <td style={{ padding: "8px 10px", textAlign: "right", color: "#6B5A4B" }}>{v.costPrice ? money(v.costPrice) : "—"}</td>
                        <td style={{ padding: "8px 10px", textAlign: "right", color: "#8A5A36" }}>{v.floorPrice ? money(v.floorPrice) : "—"}</td>
                        <td style={{ padding: "8px 10px", textAlign: "center" }}>
                          <span style={{ fontWeight: "700", color: v.stock <= v.lowStockThreshold ? "#D9534F" : "#2E8B57" }}>
                            {v.stock}
                          </span>
                          <span style={{ fontSize: "10.5px", color: "#8A7350" }}> (Min:{v.lowStockThreshold})</span>
                        </td>
                        <td style={{ padding: "8px 10px", textAlign: "center" }}>
                          {variantActive ? (
                            <span style={{ color: "#2E8B57", fontSize: "11px", fontWeight: "600" }}>● Đang bán</span>
                          ) : (
                            <span style={{ color: "#D9534F", fontSize: "11px", fontWeight: "600" }}>● Ngừng bán</span>
                          )}
                        </td>
                        <td style={{ padding: "8px 10px", textAlign: "right" }}>
                          <div style={{ display: "inline-flex", gap: "5px" }}>
                            {!isLegacyProduct(selectedProduct) && <button
                              onClick={() => setVariantModal({ mode: "edit", productId: selectedProduct.id, category: selectedProduct.category, data: { ...v } })}
                              title="Sửa SKU"
                              style={{ padding: "3px 6px", backgroundColor: "#FAF6F0", border: "1px solid #D8CEC1", borderRadius: "3px", fontSize: "10px", cursor: "pointer" }}
                            >
                              <i className="fas fa-edit"></i>
                            </button>}
                            {!isLegacyProduct(selectedProduct) && variantActive ? (
                              <button
                                onClick={() => handleSoftDeleteVariant(selectedProduct.id, v)}
                                title="Ngừng bán SKU (Xóa mềm)"
                                style={{ padding: "3px 6px", backgroundColor: "#FFF0F0", border: "1px solid #F5C6CB", color: "#D9534F", borderRadius: "3px", fontSize: "10px", cursor: "pointer" }}
                              >
                                <i className="fas fa-ban"></i>
                              </button>
                            ) : !isLegacyProduct(selectedProduct) ? (
                              <button
                                onClick={() => handleRestoreVariant(selectedProduct.id, v)}
                                title="Khôi phục SKU"
                                style={{ padding: "3px 6px", backgroundColor: "#F0FFF0", border: "1px solid #C3E6CB", color: "#2E8B57", borderRadius: "3px", fontSize: "10px", cursor: "pointer" }}
                              >
                                <i className="fas fa-undo"></i>
                              </button>
                            ) : <span style={{ color: "#745E4C", fontSize: "10px" }}>Lưu trữ</span>}
                          </div>
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modal: Create / Edit Product */}
      {productModal && (
        <div className="admin-products__modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeProductModal(); }}>
          <div className="admin-products__modal admin-products__modal--product" role="dialog" aria-modal="true" aria-labelledby="product-editor-title">
            <div className="admin-products__modal-header">
              <div><p className="eyebrow">Danh mục & SKU</p><h2 id="product-editor-title">{productModal.mode === "create" ? "Tạo sản phẩm mới" : `Chỉnh sửa sản phẩm: ${productModal.data.productCode}`}</h2></div>
              <button className="admin-products__modal-close" type="button" onClick={closeProductModal} aria-label="Đóng cửa sổ">×</button>
            </div>
            <form noValidate className="admin-products__editor" onSubmit={handleSaveProduct} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              {formError && <div className="admin-products__form-error" role="alert"><i className="fas fa-exclamation-circle" /> <span>{formError}</span></div>}
              <nav className="admin-products__editor-nav" aria-label="Các phần của biểu mẫu"><button type="button" onClick={() => document.getElementById("product-basic-info")?.scrollIntoView({ behavior: "smooth", block: "start" })}>1. Thông tin</button><button type="button" onClick={() => document.getElementById("product-variant-editor")?.scrollIntoView({ behavior: "smooth", block: "start" })}>2. SKU & giá</button><button type="button" onClick={() => document.getElementById("product-image-editor")?.scrollIntoView({ behavior: "smooth", block: "start" })}>3. Hình ảnh</button></nav>
              <div id="product-basic-info" className="admin-products__form-grid admin-products__form-grid--2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", scrollMarginTop: "130px" }}>
                <label style={{ fontSize: "12px", fontWeight: "600", color: "#4E342E" }}>
                  Mã sản phẩm (MR-xxx) *
                  <input
                    {...fieldProps("productCode")}
                    required
                    readOnly
                    value={productModal.data.productCode || ""}
                    title="Mã được hệ thống cấp tự động và không tái sử dụng"
                    style={{ width: "100%", padding: "8px 10px", marginTop: "4px", border: "1px solid #D8CEC1", borderRadius: "4px", background: "#F3EFEA" }}
                  />
                  <small className="admin-products__field-hint">Hệ thống tự cấp mã tiếp theo và kiểm tra lại khi lưu.</small>
                  {fieldMessage("productCode")}
                </label>
                <label style={{ fontSize: "12px", fontWeight: "600", color: "#4E342E" }}>
                  Tên sản phẩm *
                  <input
                    {...fieldProps("name")}
                    required
                    value={productModal.data.name || ""}
                    onChange={(e) => setProductModal({ ...productModal, data: { ...productModal.data, name: e.target.value } })}
                    style={{ width: "100%", padding: "8px 10px", marginTop: "4px", border: "1px solid #D8CEC1", borderRadius: "4px" }}
                  />
                  {fieldMessage("name")}
                </label>
              </div>

              <div className="admin-products__form-grid admin-products__form-grid--3" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
                <label style={{ fontSize: "12px", fontWeight: "600", color: "#4E342E" }}>
                  Giá bán chuẩn (VNĐ) *
                  <CurrencyInput
                    {...fieldProps("price")}
                    value={productModal.data.price || 0}
                    onChange={updateStandardPrice}
                    style={{ width: "100%", padding: "8px 10px", marginTop: "4px", border: "1px solid #D8CEC1", borderRadius: "4px" }}
                  />
                  <small className="admin-products__field-hint">Tự cập nhật các SKU đang dùng giá chuẩn cũ; SKU có giá riêng được giữ nguyên.</small>
                  {fieldMessage("price")}
                </label>
                <label style={{ fontSize: "12px", fontWeight: "600", color: "#4E342E" }}>
                  Danh mục *
                  <select
                    value={productModal.data.category || "clothing"}
                    onChange={(e) => {
                      const category = e.target.value;
                      const sizes = (createMetadata.sizePresets?.[category] || DEFAULT_SIZE_PRESETS[category] || []).join(", ");
                      if (productModal.mode === "create") setProductModal((current) => ({ ...current, data: buildVariantMatrix(current.data, { category, variantSizes: sizes }) }));
                      else updateProductField("category", category);
                    }}
                    style={{ width: "100%", padding: "8px 10px", marginTop: "4px", border: "1px solid #D8CEC1", borderRadius: "4px" }}
                  >
                    <option value="clothing">Trang phục (Clothing)</option>
                    <option value="footwear">Giày dép (Footwear)</option>
                    <option value="accessories">Phụ kiện (Accessories)</option>
                  </select>
                </label>
                <label style={{ fontSize: "12px", fontWeight: "600", color: "#4E342E" }}>
                  Đối tượng *
                  <select
                    value={productModal.data.gender || "nam"}
                    onChange={(e) => setProductModal({ ...productModal, data: { ...productModal.data, gender: e.target.value } })}
                    style={{ width: "100%", padding: "8px 10px", marginTop: "4px", border: "1px solid #D8CEC1", borderRadius: "4px" }}
                  >
                    <option value="nam">Nam</option>
                    <option value="nữ">Nữ</option>
                    <option value="kids">Trẻ em (Kids)</option>
                  </select>
                </label>
              </div>

              <div className="admin-products__form-grid admin-products__form-grid--2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <label style={{ fontSize: "12px", fontWeight: "600", color: "#4E342E" }}>
                  Chất liệu chính
                  <input
                    value={productModal.data.material || ""}
                    onChange={(e) => setProductModal({ ...productModal, data: { ...productModal.data, material: e.target.value } })}
                    style={{ width: "100%", padding: "8px 10px", marginTop: "4px", border: "1px solid #D8CEC1", borderRadius: "4px" }}
                  />
                </label>
                <label style={{ fontSize: "12px", fontWeight: "600", color: "#4E342E" }}>
                  Bộ sưu tập
                  <input
                    value={productModal.data.collectionName || productModal.data.collection || ""}
                    onChange={(e) => setProductModal({ ...productModal, data: { ...productModal.data, collectionName: e.target.value } })}
                    style={{ width: "100%", padding: "8px 10px", marginTop: "4px", border: "1px solid #D8CEC1", borderRadius: "4px" }}
                  />
                </label>
              </div>

              <label style={{ fontSize: "12px", fontWeight: "600", color: "#4E342E" }}>
                Mô tả sản phẩm
                <textarea
                  rows="3"
                  value={productModal.data.description || ""}
                  onChange={(e) => setProductModal({ ...productModal, data: { ...productModal.data, description: e.target.value } })}
                  style={{ width: "100%", padding: "8px 10px", marginTop: "4px", border: "1px solid #D8CEC1", borderRadius: "4px" }}
                />
              </label>

              {productModal.mode === "create" && <section className="admin-products__variant-builder">
                <div className="admin-products__section-heading"><div><p className="eyebrow">Bước 2</p><h3>Màu sắc và kích cỡ</h3><small>Nhập cách nhau bằng dấu phẩy. Hệ thống tự sinh mọi tổ hợp SKU bên dưới.</small></div><strong>{splitOptions(productModal.data.variantColors).length} màu · {splitOptions(productModal.data.variantSizes).length} size · {(productModal.data.variants || []).length} SKU</strong></div>
                <div className="admin-products__form-grid admin-products__form-grid--2">
                  <label>Màu sắc *<input {...fieldProps("variantColors")} value={productModal.data.variantColors || ""} onChange={(event) => updateVariantBuilder("variantColors", event.target.value)} placeholder="Brown, Navy, Ivory" />{fieldMessage("variantColors")}</label>
                  <label>Kích cỡ *<input {...fieldProps("variantSizes")} value={productModal.data.variantSizes || ""} onChange={(event) => updateVariantBuilder("variantSizes", event.target.value.toUpperCase())} placeholder={productModal.data.category === "accessories" ? "ONE SIZE" : productModal.data.category === "footwear" ? "36, 37, 38" : "S, M, L"} />{fieldMessage("variantSizes")}</label>
                </div>
                <div className="admin-products__token-row">{splitOptions(productModal.data.variantColors).map((color) => <span key={color}>{color}</span>)}{splitOptions(productModal.data.variantSizes).map((size) => <span className="is-size" key={size}>{size.toUpperCase()}</span>)}</div>
                <div className="admin-products__section-heading admin-products__section-heading--defaults"><div><h3>Giá và tồn kho mặc định</h3><small>Mọi SKU mới kế thừa các giá trị này; admin vẫn có thể chỉnh riêng từng dòng.</small></div></div>
                <div className="admin-products__defaults-grid">
                  <label>Giá vốn<CurrencyInput value={productModal.data.defaultCostPrice || 0} onChange={(value) => updateVariantBuilder("defaultCostPrice", value)} /></label>
                  <label>Giá sàn<CurrencyInput value={productModal.data.defaultFloorPrice || 0} onChange={(value) => updateVariantBuilder("defaultFloorPrice", value)} /></label>
                  <label>Tồn ban đầu<IntegerInput value={productModal.data.defaultStock || 0} onChange={(value) => updateVariantBuilder("defaultStock", value)} /></label>
                  <label>Min<IntegerInput value={productModal.data.defaultMinStock || 0} onChange={(value) => updateVariantBuilder("defaultMinStock", value)} /></label>
                  <label>Max<IntegerInput value={productModal.data.defaultMaxStock || 0} onChange={(value) => updateVariantBuilder("defaultMaxStock", value)} /></label>
                </div>
              </section>}

              <section id="product-variant-editor" style={{ borderTop: "1px solid #E8E1D6", paddingTop: "16px", scrollMarginTop: "130px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: "16px" }}>SKU, giá và tồn kho</h3>
                    <small style={{ color: "#806D60" }}>Tồn kho của SKU hiện có chỉ được thay đổi tại chức năng Điều chỉnh kho để đảm bảo lịch sử kiểm toán.</small>
                  </div>
                  <button type="button" onClick={() => updateProductField("variants", [...(productModal.data.variants || []), emptyVariant(productModal.data.price)])} style={{ padding: "7px 12px", border: 0, borderRadius: "4px", background: "#4E342E", color: "#FFF", cursor: "pointer" }}>+ Thêm SKU riêng</button>
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", minWidth: "930px" }}>
                    <thead><tr style={{ background: "#FAF6F0" }}><th>Mã SKU</th><th>Màu</th><th>Size</th><th>Giá bán</th><th>Giá vốn</th><th>Giá sàn</th><th>Tồn</th><th>Min</th><th>Max</th><th></th></tr></thead>
                    <tbody>{(productModal.data.variants || []).map((variant, index) => <tr key={variant.id || `new-${index}`} style={{ borderBottom: "1px solid #EEE7DE" }}>
                      {["sku", "color", "size", "price", "costPrice", "floorPrice", "stock", "minStock", "maxStock"].map((field) => {
                        const isMoney = ["price", "costPrice", "floorPrice"].includes(field);
                        const isQuantity = ["stock", "minStock", "maxStock"].includes(field);
                        const disabled = (field === "sku" || field === "stock") && !variant.isNew;
                        const fieldKey = `variants.${index}.${field}`;
                        const sharedProps = { ...fieldProps(fieldKey), disabled, value: variant[field] ?? "", style: { width: field === "sku" ? "145px" : isMoney ? "108px" : "78px", boxSizing: "border-box", padding: "7px", border: "1px solid #D8CEC1", borderRadius: "4px", background: disabled ? "#F3EFEA" : "#FFF" } };
                        return <td key={field} style={{ padding: "6px 4px", verticalAlign: "top" }}>{isMoney ? <CurrencyInput {...sharedProps} onChange={(value) => updateEditorVariant(index, field, value)} /> : isQuantity ? <IntegerInput {...sharedProps} onChange={(value) => updateEditorVariant(index, field, value)} /> : <input {...sharedProps} type="text" onChange={(event) => updateEditorVariant(index, field, event.target.value.toUpperCase())} />}{fieldMessage(fieldKey)}</td>;
                      })}
                      <td><button type="button" disabled={!variant.isNew} title={variant.isNew ? "Bỏ SKU chưa lưu" : "SKU hiện có được ngừng bán bằng thao tác xóa mềm"} onClick={() => updateProductField("variants", productModal.data.variants.filter((_, variantIndex) => variantIndex !== index))} style={{ border: 0, background: "transparent", color: variant.isNew ? "#B94A48" : "#B9ADA4", cursor: variant.isNew ? "pointer" : "not-allowed" }}>×</button></td>
                    </tr>)}</tbody>
                  </table>
                </div>
              </section>

              <section id="product-image-editor" style={{ borderTop: "1px solid #E8E1D6", paddingTop: "16px", scrollMarginTop: "130px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}><div><h3 style={{ margin: "0 0 4px", fontSize: "16px" }}>Ảnh sản phẩm theo màu</h3><small style={{ color: "#806D60" }}>Chọn nhóm ảnh trước khi tải. Ảnh đầu tiên của mỗi màu là ảnh đại diện màu đó.</small></div><label style={{ padding: "8px 13px", border: "1px solid #BDAA96", borderRadius: "5px", cursor: uploadingImages ? "wait" : "pointer", color: "#4E342E", fontSize: "12px", fontWeight: 600, whiteSpace: "nowrap" }}>{uploadingImages ? "Đang tải ảnh…" : "+ Tải ảnh từ máy"}<input type="file" multiple accept="image/webp,image/jpeg,image/png" disabled={uploadingImages} onChange={handleImageUpload} style={{ display: "none" }} /></label></div>
                <div className="admin-products__image-tabs"><button type="button" className={(productModal.data.selectedImageColor || "__general") === "__general" ? "active" : ""} onClick={() => updateProductField("selectedImageColor", "__general")}>Ảnh chung</button>{[...new Set((productModal.data.variants || []).map((variant) => variant.color).filter(Boolean))].map((color) => <button type="button" className={productModal.data.selectedImageColor === color ? "active" : ""} onClick={() => updateProductField("selectedImageColor", color)} key={color}>{color}</button>)}</div>
                {(() => {
                  const selectedColor = productModal.data.selectedImageColor || "__general";
                  const images = selectedColor === "__general" ? String(productModal.data.imageText || "").split(/\r?\n/).map((item) => item.trim()).filter(Boolean) : (productModal.data.colorImages?.[selectedColor] || []);
                  return <><div className="admin-products__image-grid">{images.map((image, index) => <div key={`${image}-${index}`} className={index === 0 ? "is-primary" : ""}><img src={normalizeImageUrl(image)} alt={`${selectedColor === "__general" ? "Ảnh chung" : selectedColor} ${index + 1}`} onError={(event) => { event.currentTarget.style.display = "none"; }} /><button type="button" onClick={() => removeModalImage(index)} aria-label="Xóa ảnh">×</button>{index === 0 && <span>Đại diện</span>}</div>)}</div>{images.length === 0 && <p className="admin-products__image-empty">Chưa có ảnh trong nhóm này.</p>}</>;
                })()}
                {(productModal.data.selectedImageColor || "__general") === "__general" && <details className="admin-products__advanced-images"><summary>Nhập đường dẫn ảnh nâng cao</summary><textarea rows="4" value={productModal.data.imageText || ""} onChange={(event) => updateProductField("imageText", event.target.value)} placeholder="/image/catalog/MR-xxx/front.webp&#10;/image/catalog/MR-xxx/back.webp" /></details>}
              </section>

              <div className="admin-products__modal-actions">
                <button
                  type="button"
                  onClick={closeProductModal}
                  style={{ padding: "9px 16px", backgroundColor: "#FAF6F0", border: "1px solid #D8CEC1", borderRadius: "4px", cursor: "pointer" }}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={busy || uploadingImages}
                  style={{ padding: "9px 20px", backgroundColor: "#8A5A36", color: "#FFF", border: "none", borderRadius: "4px", cursor: "pointer", fontWeight: "600" }}
                >
                  {busy ? "Đang lưu..." : productModal.mode === "create" ? "Tạo sản phẩm & SKU" : "Lưu toàn bộ thay đổi"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Create / Edit SKU Variant */}
      {variantModal && (
        <div className="admin-products__modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setVariantModal(null); }}>
          <div className="admin-products__modal" role="dialog" aria-modal="true" style={{ maxWidth: "500px", padding: "25px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "15px", alignItems: "flex-start" }}><h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "22px", margin: "0 0 15px", color: "#14100E" }}>
              {variantModal.mode === "create" ? "Thêm biến thể SKU mới" : `Chỉnh sửa SKU: ${variantModal.data.sku}`}
            </h2><button className="admin-products__modal-close" type="button" onClick={() => setVariantModal(null)} aria-label="Đóng cửa sổ">×</button></div>
            <form noValidate className="admin-products__editor" onSubmit={handleSaveVariant} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {formError && <div className="admin-products__form-error" role="alert"><i className="fas fa-exclamation-circle" /> <span>{formError}</span></div>}
              <label style={{ fontSize: "12px", fontWeight: "600", color: "#4E342E" }}>
                Mã SKU *
                <input
                  {...fieldProps("sku")}
                  required
                  disabled={variantModal.mode === "edit"}
                  value={variantModal.data.sku || ""}
                  onChange={(e) => setVariantModal({ ...variantModal, data: { ...variantModal.data, sku: e.target.value.toUpperCase() } })}
                  style={{ width: "100%", padding: "8px 10px", marginTop: "4px", border: "1px solid #D8CEC1", borderRadius: "4px" }}
                />
                {fieldMessage("sku")}
              </label>

              <div className="admin-products__form-grid admin-products__form-grid--2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <label style={{ fontSize: "12px", fontWeight: "600", color: "#4E342E" }}>
                  Màu sắc *
                  <input
                    {...fieldProps("color")}
                    required
                    value={variantModal.data.color || ""}
                    onChange={(e) => setVariantModal({ ...variantModal, data: { ...variantModal.data, color: e.target.value } })}
                    style={{ width: "100%", padding: "8px 10px", marginTop: "4px", border: "1px solid #D8CEC1", borderRadius: "4px" }}
                  />
                  {fieldMessage("color")}
                </label>
                <label style={{ fontSize: "12px", fontWeight: "600", color: "#4E342E" }}>
                  Kích cỡ *
                  <input
                    {...fieldProps("size")}
                    required
                    value={variantModal.data.size || ""}
                    onChange={(e) => setVariantModal({ ...variantModal, data: { ...variantModal.data, size: e.target.value } })}
                    style={{ width: "100%", padding: "8px 10px", marginTop: "4px", border: "1px solid #D8CEC1", borderRadius: "4px" }}
                  />
                  {fieldMessage("size")}
                </label>
              </div>

              <div className="admin-products__form-grid admin-products__form-grid--3" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px" }}>
                <label style={{ fontSize: "12px", fontWeight: "600", color: "#4E342E" }}>
                  Giá bán (VNĐ)
                  <CurrencyInput
                    {...fieldProps("price")}
                    value={variantModal.data.price || 0}
                    onChange={(value) => setVariantModal({ ...variantModal, data: { ...variantModal.data, price: value } })}
                    style={{ width: "100%", padding: "8px 10px", marginTop: "4px", border: "1px solid #D8CEC1", borderRadius: "4px" }}
                  />
                  {fieldMessage("price")}
                </label>
                <label style={{ fontSize: "12px", fontWeight: "600", color: "#4E342E" }}>
                  Giá vốn (Cost)
                  <CurrencyInput
                    {...fieldProps("costPrice")}
                    value={variantModal.data.costPrice || 0}
                    onChange={(value) => setVariantModal({ ...variantModal, data: { ...variantModal.data, costPrice: value } })}
                    style={{ width: "100%", padding: "8px 10px", marginTop: "4px", border: "1px solid #D8CEC1", borderRadius: "4px" }}
                  />
                  {fieldMessage("costPrice")}
                </label>
                <label style={{ fontSize: "12px", fontWeight: "600", color: "#4E342E" }}>
                  Giá sàn (Floor)
                  <CurrencyInput
                    {...fieldProps("floorPrice")}
                    value={variantModal.data.floorPrice || 0}
                    onChange={(value) => setVariantModal({ ...variantModal, data: { ...variantModal.data, floorPrice: value } })}
                    style={{ width: "100%", padding: "8px 10px", marginTop: "4px", border: "1px solid #D8CEC1", borderRadius: "4px" }}
                  />
                  {fieldMessage("floorPrice")}
                </label>
              </div>

              {variantModal.mode === "create" && (
                <label style={{ fontSize: "12px", fontWeight: "600", color: "#4E342E" }}>
                  Số lượng nhập ban đầu *
                  <IntegerInput
                    {...fieldProps("stock")}
                    value={variantModal.data.stock || 0}
                    onChange={(value) => setVariantModal({ ...variantModal, data: { ...variantModal.data, stock: value } })}
                    style={{ width: "100%", padding: "8px 10px", marginTop: "4px", border: "1px solid #D8CEC1", borderRadius: "4px" }}
                  />
                  {fieldMessage("stock")}
                </label>
              )}

              <div className="admin-products__form-grid admin-products__form-grid--2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <label style={{ fontSize: "12px", fontWeight: "600", color: "#4E342E" }}>
                  Tồn tối thiểu (Min alert)
                  <IntegerInput
                    {...fieldProps("minStock")}
                    value={variantModal.data.minStock ?? variantModal.data.lowStockThreshold ?? 3}
                    onChange={(value) => setVariantModal({ ...variantModal, data: { ...variantModal.data, minStock: value } })}
                    style={{ width: "100%", padding: "8px 10px", marginTop: "4px", border: "1px solid #D8CEC1", borderRadius: "4px" }}
                  />
                  {fieldMessage("minStock")}
                </label>
                <label style={{ fontSize: "12px", fontWeight: "600", color: "#4E342E" }}>
                  Tồn tối đa (Max capacity)
                  <IntegerInput
                    {...fieldProps("maxStock")}
                    value={variantModal.data.maxStock ?? variantModal.data.maxStockThreshold ?? 30}
                    onChange={(value) => setVariantModal({ ...variantModal, data: { ...variantModal.data, maxStock: value } })}
                    style={{ width: "100%", padding: "8px 10px", marginTop: "4px", border: "1px solid #D8CEC1", borderRadius: "4px" }}
                  />
                  {fieldMessage("maxStock")}
                </label>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "15px" }}>
                <button
                  type="button"
                  onClick={() => setVariantModal(null)}
                  style={{ padding: "8px 16px", backgroundColor: "#FAF6F0", border: "1px solid #D8CEC1", borderRadius: "4px", cursor: "pointer" }}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  style={{ padding: "8px 20px", backgroundColor: "#8A5A36", color: "#FFF", border: "none", borderRadius: "4px", cursor: "pointer", fontWeight: "600" }}
                >
                  {busy ? "Đang lưu..." : "Lưu SKU"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: View Inventory Movements Audit Trail */}
      {movementsModal && (
        <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
          <div style={{ backgroundColor: "#FFF", borderRadius: "8px", maxWidth: "800px", width: "100%", maxHeight: "85vh", overflowY: "auto", padding: "25px", border: "1px solid #D8CEC1" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "15px", borderBottom: "1px solid #E8E1D6", paddingBottom: "10px" }}>
              <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "22px", margin: 0, color: "#14100E" }}>
                Nhật Ký Kiểm Toán Biến Động Kho (Audit Trail)
              </h2>
              <button onClick={() => setMovementsModal(null)} style={{ background: "none", border: "none", fontSize: "16px", cursor: "pointer" }}>✕</button>
            </div>

            {movementsModal.movements.length === 0 ? (
              <p style={{ color: "#8A7350", fontStyle: "italic" }}>Chưa có bản ghi biến động kho nào cho sản phẩm này.</p>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12.5px" }}>
                <thead>
                  <tr style={{ backgroundColor: "#FAF6F0", borderBottom: "1px solid #E8E1D6", color: "#6B5A4B", textTransform: "uppercase", fontSize: "10.5px" }}>
                    <th style={{ padding: "8px 10px", textAlign: "left" }}>Thời gian</th>
                    <th style={{ padding: "8px 10px", textAlign: "left" }}>Loại biến động</th>
                    <th style={{ padding: "8px 10px", textAlign: "center" }}>Thay đổi</th>
                    <th style={{ padding: "8px 10px", textAlign: "center" }}>Tồn sau đổi</th>
                    <th style={{ padding: "8px 10px", textAlign: "left" }}>Ghi chú</th>
                    <th style={{ padding: "8px 10px", textAlign: "left" }}>Người thực hiện</th>
                  </tr>
                </thead>
                <tbody>
                  {movementsModal.movements.map((m) => (
                    <tr key={m.id} style={{ borderBottom: "1px solid #F0EAE1" }}>
                      <td style={{ padding: "8px 10px", color: "#6B5A4B" }}>{new Date(m.created_at).toLocaleString("vi-VN")}</td>
                      <td style={{ padding: "8px 10px", fontWeight: "600", color: "#4E342E" }}>{m.movement_type}</td>
                      <td style={{ padding: "8px 10px", textAlign: "center", fontWeight: "700", color: m.quantity_change > 0 ? "#2E8B57" : m.quantity_change < 0 ? "#D9534F" : "#8A7350" }}>
                        {m.quantity_change > 0 ? `+${m.quantity_change}` : m.quantity_change}
                      </td>
                      <td style={{ padding: "8px 10px", textAlign: "center", fontWeight: "600" }}>{m.resulting_stock}</td>
                      <td style={{ padding: "8px 10px", color: "#6B5A4B" }}>{m.note || "—"}</td>
                      <td style={{ padding: "8px 10px", color: "#8A5A36", fontWeight: "600" }}>{m.performed_by}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

