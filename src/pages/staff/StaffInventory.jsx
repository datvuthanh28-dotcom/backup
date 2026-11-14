import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useStore } from "../../context/StoreContext";
import { useAuth } from "../../context/AuthContext";
import { productsAPI } from "../../services/api";
import useDocumentTitle from "../../hooks/useDocumentTitle";
import "./StaffInventory.css";

const PAGE_SIZE = 15;
const TYPE_LABELS = {
  Accessories: "Phụ kiện",
  accessories: "Phụ kiện",
  Footwear: "Giày dép",
  footwear: "Giày dép",
  Knitwear: "Đồ dệt kim",
  knitwear: "Đồ dệt kim",
  "One-Piece & Sets": "Đồ liền thân & bộ",
  "one-piece-&-sets": "Đồ liền thân & bộ",
  Outerwear: "Áo khoác",
  outerwear: "Áo khoác",
  Shirts: "Áo sơ mi",
  shirts: "Áo sơ mi",
  Trousers: "Quần",
  trousers: "Quần",
};

const GENDER_OPTIONS = [
  { id: "all", label: "Tất cả" },
  { id: "nam", label: "Nam" },
  { id: "nữ", label: "Nữ" },
  { id: "kids", label: "Trẻ em" },
];

const STOCK_OPTIONS = [
  { id: "all", label: "Tất cả", icon: "fa-layer-group" },
  { id: "attention", label: "Cần xử lý" },
  { id: "out_of_stock", label: "Hết hàng" },
  { id: "low_stock", label: "Sắp hết" },
  { id: "stable", label: "Ổn định" },
  { id: "overstock", label: "Vượt mức tồn" },
];
const STOCK_FILTER_IDS = new Set(STOCK_OPTIONS.map((option) => option.id));
const OPERATION_TYPES = [
  { id: "receipt", title: "Nhập hàng", description: "Nhận hàng từ nhà cung cấp vào kho.", icon: "fa-truck-ramp-box" },
  { id: "stocktake", title: "Kiểm kê", description: "Ghi nhận số lượng đếm thực tế.", icon: "fa-clipboard-check" },
  { id: "quarantine", title: "Chờ kiểm tra", description: "Tạm ngừng bán hàng lỗi hoặc cần kiểm định.", icon: "fa-shield" },
  { id: "release", title: "Đưa lại vào bán", description: "Mở bán hàng đã vượt qua kiểm tra.", icon: "fa-circle-check" },
  { id: "special_adjustment", title: "Điều chỉnh đặc biệt", description: "Sửa sai dữ liệu tồn kho có lưu vết.", icon: "fa-triangle-exclamation", adminOnly: true },
];

function normalizeGender(value) {
  const gender = String(value || "").toLowerCase();
  if (["men", "male", "nam"].includes(gender)) return "nam";
  if (["women", "female", "nữ", "nu"].includes(gender)) return "nữ";
  if (["kids", "kid", "children", "trẻ em", "tre em"].includes(gender)) return "kids";
  return "";
}

function getVariantState(variant) {
  const stock = Number(variant.availableQuantity ?? (Number(variant.stock || 0) - Number(variant.reservedQuantity || 0) - Number(variant.quarantineQuantity || 0)));
  const min = Number(variant.lowStockThreshold ?? variant.low_stock_threshold ?? 3);
  const max = Number(variant.maxStockThreshold ?? variant.max_stock_threshold ?? 20);
  if (stock === 0) return { id: "out", label: "Hết hàng" };
  if (stock <= min) return { id: "low", label: "Sắp hết" };
  if (stock >= max) return { id: "over", label: "Vượt mức tồn" };
  return { id: "stable", label: "Ổn định" };
}

function formatPrice(v) {
  return (v || 0).toLocaleString("vi-VN") + "đ";
}

function formatDate(isoStr) {
  if (!isoStr) return "";
  const d = new Date(isoStr);
  return d.toLocaleString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function getOperationBlockReason(type, row, role) {
  if (!row) return "Không tìm thấy dữ liệu SKU.";
  if (type === "quarantine" && row.stock <= 0) return "SKU không còn hàng có thể bán để chuyển sang chờ kiểm tra.";
  if (type === "release" && row.quarantine <= 0) return "SKU chưa có hàng chờ kiểm tra để đưa lại vào bán.";
  if (type === "special_adjustment" && role !== "admin") return "Chỉ Admin được thực hiện điều chỉnh đặc biệt.";
  return "";
}

const DOCUMENT_TYPE_LABELS = {
  receipt: "Nhập hàng",
  stocktake: "Kiểm kê",
  quarantine: "Chờ kiểm tra",
  release: "Đưa lại vào bán",
  special_adjustment: "Điều chỉnh đặc biệt",
};

const MOVEMENT_TYPE_LABELS = {
  receipt: "Nhập hàng",
  stocktake_adjustment: "Kiểm kê",
  special_adjustment: "Điều chỉnh đặc biệt",
  quarantine_hold: "Chuyển chờ kiểm tra",
  quarantine_release: "Đưa lại vào bán",
  document_reversal: "Đảo phiếu",
  order_reservation: "Giữ hàng cho đơn",
  reservation_release: "Giải phóng giữ hàng",
  order_deduction: "Xuất hàng theo đơn",
  order_cancelled_awaiting_return: "Chờ hàng hoàn về",
  return_restock: "Nhập lại hàng hoàn",
  exchange_deduction: "Xuất hàng đổi",
  initial_stock: "Tồn kho ban đầu",
  manual_adjustment: "Điều chỉnh thủ công",
  threshold_adjustment: "Đổi định mức",
};

export default function StaffInventory({ portal = "staff" }) {
  const isAdminPortal = portal === "admin";
  useDocumentTitle(isAdminPortal ? "Admin — Vận Hành Kho" : "Staff Portal — Quản Lý Tồn Kho");
  const { products, updateVariantStock, refreshProducts } = useStore();
  const { currentUser } = useAuth();
  const [searchParams] = useSearchParams();

  const [genderFilter, setGenderFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const initialStockFilter = STOCK_FILTER_IDS.has(searchParams.get("stock")) ? searchParams.get("stock") : "all";
  const [stockStatusFilter, setStockStatusFilter] = useState(initialStockFilter);
  const [searchTerm, setSearchTerm] = useState(searchParams.get("search") || "");
  const [sortBy, setSortBy] = useState("recent_desc");
  const [page, setPage] = useState(1);
  const [editProduct, setEditProduct] = useState(null);
  const [selectedVariantId, setSelectedVariantId] = useState("");
  const [minStockValue, setMinStockValue] = useState("3");
  const [maxStockValue, setMaxStockValue] = useState("20");
  const [toastMessage, setToastMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const toastTimerRef = useRef(null);
  // Movements modal
  const [selectedProductMovements, setSelectedProductMovements] = useState(null);
  const [movementsList, setMovementsList] = useState([]);
  const [loadingMovements, setLoadingMovements] = useState(false);
  const [operationRow, setOperationRow] = useState(null);
  const [operationType, setOperationType] = useState("");
  const [operationQuantity, setOperationQuantity] = useState("");
  const [operationReference, setOperationReference] = useState("");
  const [operationNote, setOperationNote] = useState("");
  const [operationSupplier, setOperationSupplier] = useState("");
  const [operationUnitCost, setOperationUnitCost] = useState("");
  const [operationSellable, setOperationSellable] = useState("");
  const [operationQuarantine, setOperationQuarantine] = useState("0");
  const [operationUpdateCost, setOperationUpdateCost] = useState(false);
  const [operationConfirm, setOperationConfirm] = useState(false);
  const [documents, setDocuments] = useState([]);
  const [loadingDocuments, setLoadingDocuments] = useState(false);
  const [reversingDocument, setReversingDocument] = useState(null);
  const [reversalReason, setReversalReason] = useState("");

  const showToast = (msg) => {
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    setToastMessage(msg);
    toastTimerRef.current = window.setTimeout(() => setToastMessage(""), 4000);
  };

  useEffect(() => () => {
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
  }, []);

  const loadDocuments = async () => {
    if (!isAdminPortal) return;
    setLoadingDocuments(true);
    try {
      const result = await productsAPI.getInventoryDocuments(50);
      if (!result.success) throw new Error(result.error || "Không thể tải lịch sử phiếu kho.");
      setDocuments(result.documents || []);
    } catch (error) {
      showToast(error.message);
    } finally {
      setLoadingDocuments(false);
    }
  };

  const submitReversal = async (event) => {
    event.preventDefault();
    if (!reversingDocument || reversalReason.trim().length < 10) return;
    setLoading(true);
    try {
      const result = await productsAPI.reverseInventoryDocument(reversingDocument.id, reversalReason.trim());
      if (!result.success) throw new Error(result.error || "Không thể đảo phiếu kho.");
      await refreshProducts();
      await loadDocuments();
      showToast(`Đã tạo ${result.document?.documentCode || "phiếu đảo"}.`);
      setReversingDocument(null);
      setReversalReason("");
    } catch (error) {
      alert(error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDocuments();
  // Chỉ tải lại khi đổi giữa cổng Staff/Admin.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdminPortal]);

  const productTypes = useMemo(
    () => [...new Set(products.map((product) => product.productType || product.category).filter(Boolean))].sort(),
    [products]
  );

  const inventoryRows = useMemo(() => products.flatMap((product) =>
    (product.variants || []).map((variant) => ({
      product,
      variant,
      stock: Number(variant.availableQuantity ?? (Number(variant.stock || 0) - Number(variant.reservedQuantity || 0) - Number(variant.quarantineQuantity || 0))),
      physical: Number(variant.stock || 0),
      reserved: Number(variant.reservedQuantity || 0),
      quarantine: Number(variant.quarantineQuantity || 0),
      incoming: Number(variant.incomingQuantity || 0),
      lastActivityAt: variant.lastInventoryActivityAt || null,
      state: getVariantState(variant),
    }))
  ), [products]);

  const filteredRows = useMemo(() => inventoryRows.filter((row) => {
    const { product, variant, state } = row;
    const matchesGender = genderFilter === "all" || normalizeGender(product.gender) === genderFilter;
    const matchesType = typeFilter === "all" || (product.productType || product.category) === typeFilter;

    let matchesStock = true;
    if (stockStatusFilter === "attention") matchesStock = state.id !== "stable";
    else if (stockStatusFilter === "out_of_stock") matchesStock = state.id === "out";
    else if (stockStatusFilter === "low_stock") matchesStock = state.id === "low";
    else if (stockStatusFilter === "stable") matchesStock = state.id === "stable";
    else if (stockStatusFilter === "overstock") matchesStock = state.id === "over";

    const term = searchTerm.trim().toLowerCase();
    const searchable = [
      product.id,
      product.name,
      product.category,
      product.productType,
      product.gender,
      variant.sku,
      variant.color,
      variant.size,
    ].join(" ").toLowerCase();
    const matchesSearch = !term || searchable.includes(term);

    return matchesGender && matchesType && matchesStock && matchesSearch;
  }), [inventoryRows, genderFilter, typeFilter, stockStatusFilter, searchTerm]);

  const sortedRows = useMemo(() => [...filteredRows].sort((a, b) => {
    const activityA = a.lastActivityAt ? new Date(a.lastActivityAt).getTime() : 0;
    const activityB = b.lastActivityAt ? new Date(b.lastActivityAt).getTime() : 0;
    if (sortBy === "recent_desc") return activityB - activityA || String(a.variant.sku).localeCompare(String(b.variant.sku));
    if (sortBy === "recent_asc") return (activityA || Number.MAX_SAFE_INTEGER) - (activityB || Number.MAX_SAFE_INTEGER) || String(a.variant.sku).localeCompare(String(b.variant.sku));
    if (sortBy === "stock_desc") return b.stock - a.stock;
    if (sortBy === "name_asc") return a.product.name.localeCompare(b.product.name, "vi") || String(a.variant.sku).localeCompare(String(b.variant.sku));
    if (sortBy === "name_desc") return b.product.name.localeCompare(a.product.name, "vi") || String(a.variant.sku).localeCompare(String(b.variant.sku));
    return a.stock - b.stock;
  }), [filteredRows, sortBy]);

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / PAGE_SIZE));
  const paginatedRows = sortedRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [genderFilter, typeFilter, stockStatusFilter, searchTerm, sortBy]);

  useEffect(() => {
    const requestedStock = searchParams.get("stock");
    setStockStatusFilter(STOCK_FILTER_IDS.has(requestedStock) ? requestedStock : "all");
    setSearchTerm(searchParams.get("search") || "");
  }, [searchParams]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const resetFilters = () => {
    setGenderFilter("all");
    setTypeFilter("all");
    setStockStatusFilter("all");
    setSearchTerm("");
    setSortBy("recent_desc");
  };

  const handleVariantChange = (variantId) => {
    const variant = editProduct?.variants?.find((item) => String(item.id) === String(variantId));
    setSelectedVariantId(variantId);
    setMinStockValue(String(variant?.lowStockThreshold ?? variant?.low_stock_threshold ?? 3));
    setMaxStockValue(String(variant?.maxStockThreshold ?? variant?.max_stock_threshold ?? 20));
  };

  const handleSaveStock = async (e) => {
    e.preventDefault();
    if (!editProduct) return;
    const selectedVariant = editProduct.variants?.find((item) => String(item.id) === String(selectedVariantId));
    const stockNum = Number(selectedVariant?.stock ?? 0);
    const minStockNum = parseInt(minStockValue, 10);
    const maxStockNum = parseInt(maxStockValue, 10);
    if (isNaN(minStockNum) || minStockNum < 0 || isNaN(maxStockNum) || maxStockNum <= minStockNum) {
      alert("Mức tối thiểu phải từ 0 trở lên và mức tối đa phải lớn hơn mức tối thiểu.");
      return;
    }
    const thresholdNote = `Cập nhật hạn mức tồn kho: Min ${minStockNum}, Max ${maxStockNum}.`;

    setLoading(true);
    if (!selectedVariantId) {
      alert("Sản phẩm chưa có SKU biến thể hợp lệ để điều chỉnh.");
      return;
    }
    const res = await updateVariantStock(editProduct.id, selectedVariantId, stockNum, minStockNum, maxStockNum, thresholdNote);
    setLoading(false);

    if (res.success) {
      const variant = editProduct.variants?.find((item) => String(item.id) === String(selectedVariantId));
      showToast(`Đã cập nhật ${variant?.color || "màu"} / ${variant?.size || "size"} thành ${stockNum} sản phẩm.`);
      setEditProduct(null);
    } else {
      alert(res.error || "Không thể cập nhật tồn kho.");
    }
  };

  const handleViewMovements = async (product) => {
    setSelectedProductMovements(product);
    setLoadingMovements(true);
    try {
      const res = await productsAPI.getMovements(product.id);
      if (res.success) {
        setMovementsList(res.movements || []);
      }
    } catch (err) {
      console.warn("Could not fetch movements:", err.message);
      setMovementsList([]);
    } finally {
      setLoadingMovements(false);
    }
  };

  const inventoryTotals = useMemo(() => inventoryRows.reduce((total, row) => ({
    physical: total.physical + row.physical,
    reserved: total.reserved + row.reserved,
    available: total.available + row.stock,
    quarantine: total.quarantine + row.quarantine,
    incoming: total.incoming + row.incoming,
  }), { physical: 0, reserved: 0, available: 0, quarantine: 0, incoming: 0 }), [inventoryRows]);

  const openOperation = (row) => {
    setOperationRow(row);
    setOperationType("");
    setOperationQuantity("");
    setOperationReference("");
    setOperationNote("");
    setOperationSupplier("");
    setOperationUnitCost("");
    setOperationSellable("");
    setOperationQuarantine("0");
    setOperationUpdateCost(false);
    setOperationConfirm(false);
  };

  const selectOperationType = (type) => {
    if (getOperationBlockReason(type, operationRow, currentUser?.role)) return;
    setOperationType(type);
    setOperationQuantity(type === "stocktake" || type === "special_adjustment" ? String(operationRow?.physical ?? 0) : "");
    setOperationSellable("");
    setOperationQuarantine("0");
    setOperationNote("");
    setOperationConfirm(false);
  };

  const operationPreview = useMemo(() => {
    if (!operationRow || !operationType) return null;
    const quantity = Number(operationQuantity);
    if (!Number.isInteger(quantity) || quantity < 0) return null;
    let physical = operationRow.physical;
    let quarantine = operationRow.quarantine;
    if (operationType === "receipt") {
      physical += quantity;
      quarantine += Number(operationQuarantine || 0);
    } else if (operationType === "stocktake" || operationType === "special_adjustment") physical = quantity;
    else if (operationType === "quarantine") quarantine += quantity;
    else if (operationType === "release") quarantine -= quantity;
    return { physical, quarantine, available: Math.max(0, physical - operationRow.reserved - quarantine) };
  }, [operationRow, operationType, operationQuantity, operationQuarantine]);

  const submitOperation = async (event) => {
    event.preventDefault();
    if (!operationRow || !operationType || !operationNote.trim()) return;
    const quantity = Number(operationQuantity);
    const blockedReason = getOperationBlockReason(operationType, operationRow, currentUser?.role);
    if (blockedReason) {
      alert(blockedReason);
      return;
    }
    if (!Number.isInteger(quantity) || quantity < 0 || (!["stocktake", "special_adjustment"].includes(operationType) && quantity === 0)) {
      alert("Số lượng chưa hợp lệ.");
      return;
    }
    if (operationType === "receipt") {
      const sellable = Number(operationSellable);
      const quarantine = Number(operationQuarantine);
      if (!operationSupplier.trim() || !Number.isFinite(Number(operationUnitCost)) || Number(operationUnitCost) <= 0) {
        alert("Phiếu nhập cần có nhà cung cấp và giá nhập hợp lệ.");
        return;
      }
      if (!Number.isInteger(sellable) || !Number.isInteger(quarantine) || sellable < 0 || quarantine < 0 || sellable + quarantine !== quantity) {
        alert("Số đạt chất lượng cộng số chờ kiểm tra phải bằng tổng số nhận.");
        return;
      }
    }
    if (operationType === "quarantine" && quantity > operationRow.stock) {
      alert(`Chỉ có ${operationRow.stock} sản phẩm có thể bán để chuyển sang chờ kiểm tra.`);
      return;
    }
    if (operationType === "release" && quantity > operationRow.quarantine) {
      alert(`Chỉ có ${operationRow.quarantine} sản phẩm đang chờ kiểm tra để đưa lại vào bán.`);
      return;
    }
    if (!operationConfirm) {
      alert("Vui lòng kiểm tra kết quả dự kiến và xác nhận trước khi ghi nhận.");
      return;
    }
    setLoading(true);
    try {
      const result = await productsAPI.createInventoryDocument({
        documentType: operationType,
        externalReference: operationReference.trim() || undefined,
        supplierName: operationSupplier.trim() || undefined,
        updateCostPrice: currentUser?.role === "admin" && operationUpdateCost,
        note: operationNote.trim(),
        items: [{
          productId: operationRow.product.id,
          variantId: operationRow.variant.id,
          expectedQuantity: operationRow.physical,
          actualQuantity: quantity,
          sellableQuantity: operationType === "receipt" ? Number(operationSellable) : undefined,
          quarantineQuantity: operationType === "receipt" ? Number(operationQuarantine) : undefined,
          unitCost: operationType === "receipt" ? Number(operationUnitCost) : undefined,
          note: operationNote.trim(),
        }],
      });
      if (!result.success) throw new Error(result.error || "Không thể ghi nhận nghiệp vụ kho.");
      await refreshProducts();
      await loadDocuments();
      showToast(`Đã ghi nhận ${result.document?.documentCode || "phiếu kho"}.`);
      setOperationRow(null);
    } catch (error) {
      alert(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="staff-inventory-page">
      <div style={{ marginBottom: "25px" }}>
        <h1
          style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontSize: "30px",
            color: "#2B211C",
            margin: 0,
          }}
        >
          {isAdminPortal ? "VẬN HÀNH KHO & KIỂM TOÁN" : "QUẢN LÝ KHO"}
        </h1>
        {isAdminPortal && <p className="inventory-page-lead">Thực hiện nghiệp vụ theo từng SKU; mọi thay đổi đều được ghi thành phiếu và lưu dấu vết kiểm toán.</p>}
      </div>

      {toastMessage && (
        <div
          style={{
            backgroundColor: "#F0FFF0",
            color: "#2E8B57",
            border: "1px solid #C3E6CB",
            padding: "12px 20px",
            borderRadius: "6px",
            marginBottom: "20px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span><i className="fas fa-circle-check" aria-hidden="true" /> {toastMessage}</span>
          <button
            onClick={() => setToastMessage("")}
            style={{ background: "none", border: "none", color: "#2E8B57", cursor: "pointer", fontSize: "16px" }}
          >
            ×
          </button>
        </div>
      )}

      <section className="inventory-kpi-grid" aria-label="Tổng quan tồn kho">
        <div><span>Tồn thực tế</span><strong>{inventoryTotals.physical}</strong></div>
        <div><span>Đang giữ cho đơn</span><strong>{inventoryTotals.reserved}</strong></div>
        <div><span>Có thể bán</span><strong>{inventoryTotals.available}</strong></div>
        <div><span>Chờ kiểm tra</span><strong>{inventoryTotals.quarantine}</strong></div>
        <div><span>Đang về kho</span><strong>{inventoryTotals.incoming}</strong></div>
      </section>

      <section className="inventory-filters" aria-label="Bộ lọc tồn kho">
        <div className="inventory-filter-group inventory-filter-gender">
          <span className="inventory-filter-label">Đối tượng</span>
          <div className="inventory-segmented" role="group" aria-label="Lọc theo đối tượng">
            {GENDER_OPTIONS.map((option) => (
              <button key={option.id} type="button" className={genderFilter === option.id ? "is-active" : ""} onClick={() => setGenderFilter(option.id)}>
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <label className="inventory-filter-group">
          <span className="inventory-filter-label">Loại sản phẩm</span>
          <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
            <option value="all">Tất cả loại sản phẩm</option>
            {productTypes.map((type) => <option key={type} value={type}>{TYPE_LABELS[type] || type}</option>)}
          </select>
        </label>

        <div className="inventory-filter-group inventory-filter-status">
          <span className="inventory-filter-label">Tình trạng kho</span>
          <div className="inventory-status-options" role="group" aria-label="Lọc theo tình trạng kho">
            {STOCK_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                className={`inventory-status-button inventory-status-${option.id} ${stockStatusFilter === option.id ? "is-active" : ""}`}
                onClick={() => setStockStatusFilter(option.id)}
              >
                {option.icon && <i className={`fas ${option.icon}`} aria-hidden="true" />}
                <span>{option.label}</span>
              </button>
            ))}
          </div>
        </div>

        <label className="inventory-filter-group inventory-search">
          <span className="inventory-filter-label">Tìm kiếm</span>
          <span className="inventory-input-icon">
            <i className="fas fa-magnifying-glass" aria-hidden="true" />
            <input type="search" placeholder="Tên, mã SKU, màu hoặc kích cỡ…" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} />
          </span>
        </label>

        <label className="inventory-filter-group inventory-sort">
          <span className="inventory-filter-label">Sắp xếp</span>
          <select value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
            <option value="recent_desc">Vừa cập nhật kho</option>
            <option value="recent_asc">Cập nhật kho cũ nhất</option>
            <option value="stock_asc">Tồn kho: thấp đến cao</option>
            <option value="stock_desc">Tồn kho: cao đến thấp</option>
            <option value="name_asc">Tên: A–Z</option>
            <option value="name_desc">Tên: Z–A</option>
          </select>
        </label>
      </section>

      <div className="inventory-result-summary">
        <span>Hiển thị <strong>{sortedRows.length}</strong> SKU phù hợp</span>
        {(genderFilter !== "all" || typeFilter !== "all" || stockStatusFilter !== "all" || searchTerm) && (
          <button type="button" onClick={resetFilters}><i className="fas fa-rotate-left" aria-hidden="true" /> Xóa bộ lọc</button>
        )}
      </div>

      {/* Inventory Table */}
      <div className="inventory-table-card">
        <div className="inventory-table-scroll">
          <table className="inventory-table">
            <thead>
              <tr style={{ backgroundColor: "#FAF6F0", borderBottom: "1px solid #D8CEC1", color: "#4E342E" }}>
                <th style={{ padding: "14px 18px", fontWeight: "600", width: "80px" }}>Hình Ảnh</th>
                <th style={{ padding: "14px 18px", fontWeight: "600" }}>Sản Phẩm</th>
                <th style={{ padding: "14px 18px", fontWeight: "600" }}>SKU / Thuộc Tính</th>
                <th style={{ padding: "14px 18px", fontWeight: "600" }}>Đơn Giá</th>
                <th style={{ padding: "14px 18px", fontWeight: "600" }}>Số Lượng Kho</th>
                <th style={{ padding: "14px 18px", fontWeight: "600" }}>Tình Trạng</th>
                <th style={{ padding: "14px 18px", fontWeight: "600" }}>Cập Nhật Kho</th>
                <th style={{ padding: "14px 18px", fontWeight: "600", textAlign: "right" }}>Điều Chỉnh & Lịch Sử</th>
              </tr>
            </thead>
            <tbody>
              {paginatedRows.length === 0 ? (
                <tr>
                  <td colSpan="8" className="inventory-empty-state">
                    <i className="fas fa-box-open" aria-hidden="true" />
                    <strong>Không tìm thấy sản phẩm phù hợp</strong>
                    <span>Hãy thay đổi từ khóa hoặc xóa các bộ lọc đang áp dụng.</span>
                    <button type="button" onClick={resetFilters}>Xóa bộ lọc</button>
                  </td>
                </tr>
              ) : (
                paginatedRows.map((row, idx) => {
                  const { product: p, variant, stock, state, physical, reserved, quarantine, incoming } = row;
                  const firstImg = p.images ? p.images[0] : "";

                  return (
                    <tr
                      key={variant.id}
                      style={{
                        borderBottom: "1px solid #F0EAE1",
                        backgroundColor: idx % 2 === 0 ? "#FFFFFF" : "#FCFBF9",
                      }}
                    >
                      <td data-label="Hình ảnh" style={{ padding: "12px 18px" }}>
                        {firstImg && (
                          <img
                            src={`/${firstImg}`}
                            alt={p.name}
                            style={{ width: "50px", height: "50px", objectFit: "cover", borderRadius: "4px" }}
                          />
                        )}
                      </td>

                      <td data-label="Sản phẩm" style={{ padding: "12px 18px" }}>
                        <strong style={{ color: "#2B211C" }}>{p.name}</strong>
                        <div className="inventory-variant-summary">Mã sản phẩm: {p.productCode || p.product_code || `MR-${String(p.id).padStart(3, "0")}`}</div>
                        <div style={{ marginTop: 3, fontSize: 11.5, color: "#8A7350" }}>{TYPE_LABELS[p.productType] || TYPE_LABELS[p.category] || p.productType || p.category} · {normalizeGender(p.gender) === "nam" ? "Nam" : normalizeGender(p.gender) === "nữ" ? "Nữ" : "Trẻ em"}</div>
                      </td>

                      <td data-label="SKU / Thuộc tính" style={{ padding: "12px 18px" }}>
                        <strong className="inventory-sku-code">{variant.sku}</strong>
                        <div style={{ marginTop: 4, fontSize: "12px", color: "#6B5A4B" }}>{variant.color || "Mặc định"} · Size {variant.size || "ONE SIZE"}</div>
                      </td>

                      <td data-label="Đơn giá" style={{ padding: "12px 18px", fontWeight: "600", color: "#B89B5E" }}>
                        {formatPrice(variant.price ?? p.price)}
                      </td>

                      <td data-label="Số lượng kho" style={{ padding: "12px 18px" }}>
                        <span
                          style={{
                            fontSize: "16px",
                            fontWeight: "700",
                            color: state.id === "out" ? "#D9534F" : state.id === "low" ? "#B8860B" : state.id === "over" ? "#2C6BA0" : "#2B211C",
                          }}
                        >
                          {stock}
                        </span>{" "}
                        <span style={{ fontSize: "12px", color: "#8A7350" }}>có thể bán</span>
                        <div className="inventory-quantity-breakdown">Thực tế {physical} · Giữ {reserved} · Kiểm tra {quarantine}{incoming ? ` · Đang về ${incoming}` : ""}</div>
                        <div style={{ marginTop: 2, fontSize: "10.5px", color: "#A09384" }}>Min {variant.lowStockThreshold ?? 3} · Max {variant.maxStockThreshold ?? 20}</div>
                      </td>

                      <td data-label="Tình trạng" style={{ padding: "12px 18px" }}>
                        <span className={`inventory-stock-status is-${state.id}`}>{state.label}</span>
                      </td>

                      <td data-label="Cập nhật kho" style={{ padding: "12px 18px" }}>
                        {variant.lastInventoryActivityAt ? (
                          <div className="inventory-last-activity">
                            <strong>{formatDate(variant.lastInventoryActivityAt)}</strong>
                            <span>{MOVEMENT_TYPE_LABELS[variant.lastInventoryMovementType] || variant.lastInventoryMovementType || "Biến động kho"}</span>
                            <small>
                              {variant.lastInventoryChange == null ? "" : `${Number(variant.lastInventoryChange) > 0 ? "+" : ""}${Number(variant.lastInventoryChange)}`}
                              {variant.lastInventoryActor ? `${variant.lastInventoryChange == null ? "" : " · "}${variant.lastInventoryActor}` : ""}
                            </small>
                          </div>
                        ) : <span className="inventory-no-activity">Chưa có lịch sử</span>}
                      </td>

                      <td data-label="Thao tác" style={{ padding: "12px 18px", textAlign: "right" }}>
                        <div className="inventory-row-actions">
                          <button
                            onClick={() => openOperation(row)}
                            className="inventory-adjust-button"
                          >
                            Nghiệp vụ
                          </button>

                          <button
                            onClick={() => handleViewMovements(p)}
                            className="inventory-history-button"
                            aria-label={`Xem lịch sử kho của ${p.name}`}
                            title="Xem lịch sử xuất nhập kho"
                          >
                            <i className="fas fa-history" aria-hidden="true" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {sortedRows.length > 0 && (
          <div className="inventory-pagination">
            <span>
              {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, sortedRows.length)} trên {sortedRows.length} SKU
            </span>
            <div>
              <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page === 1} aria-label="Trang trước">
                <i className="fas fa-chevron-left" aria-hidden="true" />
              </button>
              <span>Trang {page}/{totalPages}</span>
              <button type="button" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page === totalPages} aria-label="Trang sau">
                <i className="fas fa-chevron-right" aria-hidden="true" />
              </button>
            </div>
          </div>
        )}
      </div>

      {isAdminPortal && (
        <section className="inventory-documents" aria-label="Lịch sử phiếu kho">
          <div className="inventory-documents-heading">
            <div><span>Kiểm toán kho</span><h2>Phiếu kho gần đây</h2></div>
            <button type="button" onClick={loadDocuments} disabled={loadingDocuments}>
              <i className="fas fa-rotate" aria-hidden="true" /> {loadingDocuments ? "Đang tải..." : "Làm mới"}
            </button>
          </div>
          {documents.length === 0 ? (
            <div className="inventory-documents-empty">Chưa có phiếu kho nào được ghi nhận.</div>
          ) : (
            <div className="inventory-documents-table-wrap">
              <table className="inventory-documents-table">
                <thead><tr><th>Mã phiếu</th><th>Nghiệp vụ</th><th>Phạm vi</th><th>Chứng từ / Nhà cung cấp</th><th>Người thực hiện</th><th>Thời gian</th><th></th></tr></thead>
                <tbody>{documents.map((document) => (
                  <tr key={document.id}>
                    <td><strong>{document.document_code}</strong><small>{document.status === "reversed" ? "Đã đảo phiếu" : "Đã hoàn tất"}</small></td>
                    <td>{DOCUMENT_TYPE_LABELS[document.document_type] || document.document_type}</td>
                    <td>{Number(document.item_count || 0)} SKU<small>{Number(document.total_quantity || 0)} đơn vị biến động</small></td>
                    <td>{document.external_reference || "Không có mã ngoài"}<small>{document.supplier_name || "—"}</small></td>
                    <td>{document.created_by || "Hệ thống"}</td>
                    <td>{formatDate(document.created_at)}</td>
                    <td>{document.status === "completed" && document.document_type !== "reversal" && <button className="inventory-reverse-button" type="button" onClick={() => { setReversingDocument(document); setReversalReason(""); }}>Đảo phiếu</button>}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {reversingDocument && (
        <div className="inventory-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setReversingDocument(null)}>
          <form className="inventory-reversal-modal" onSubmit={submitReversal}>
            <div className="inventory-reversal-heading"><div><span>Kiểm toán kho</span><h3>Đảo phiếu {reversingDocument.document_code}</h3></div><button type="button" onClick={() => setReversingDocument(null)}>×</button></div>
            <p>Hệ thống sẽ tạo một phiếu ngược, không xóa lịch sử cũ. Thao tác bị từ chối nếu SKU đã có biến động mới hơn.</p>
            <label>Lý do đảo phiếu *<textarea minLength="10" required value={reversalReason} onChange={(event) => setReversalReason(event.target.value)} placeholder="Mô tả sai sót chứng từ hoặc số lượng cần khắc phục..." /></label>
            <div className="inventory-operation-actions"><button type="button" onClick={() => setReversingDocument(null)}>Hủy</button><button type="submit" disabled={loading || reversalReason.trim().length < 10}>{loading ? "Đang xử lý..." : "Xác nhận đảo phiếu"}</button></div>
          </form>
        </div>
      )}

      {operationRow && (
        <div className="inventory-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setOperationRow(null)}>
          <form className="inventory-operation-modal" onSubmit={submitOperation}>
            <div className="inventory-operation-heading">
              <img src={`/${operationRow.product.images?.[0] || ""}`} alt="" />
              <div><span>Nghiệp vụ kho theo SKU</span><h3>{operationRow.product.name}</h3><small>{operationRow.variant.sku} · {operationRow.variant.color} · Size {operationRow.variant.size}</small></div>
              <button type="button" onClick={() => setOperationRow(null)} aria-label="Đóng">×</button>
            </div>
            <div className="inventory-operation-current">
              <div><span>Tồn thực tế</span><strong>{operationRow.physical}</strong></div>
              <div><span>Đang giữ</span><strong>{operationRow.reserved}</strong></div>
              <div><span>Có thể bán</span><strong>{operationRow.stock}</strong></div>
              <div><span>Chờ kiểm tra</span><strong>{operationRow.quarantine}</strong></div>
            </div>
            {!operationType ? (
              <div className="inventory-operation-picker">
                <h4>Chọn nghiệp vụ cần thực hiện</h4>
                <div>
                  {OPERATION_TYPES.filter((item) => !item.adminOnly || currentUser?.role === "admin").map((item) => {
                    const blockReason = getOperationBlockReason(item.id, operationRow, currentUser?.role);
                    return (
                      <button type="button" key={item.id} disabled={Boolean(blockReason)} aria-disabled={Boolean(blockReason)} onClick={() => selectOperationType(item.id)} title={blockReason || item.description}>
                        <i className={`fas ${item.icon}`} aria-hidden="true" />
                        <span><strong>{item.title}</strong><small>{blockReason || item.description}</small></span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <>
                <div className="inventory-operation-selected">
                  <button type="button" onClick={() => setOperationType("")}><i className="fas fa-arrow-left" /> Chọn lại</button>
                  <strong>{OPERATION_TYPES.find((item) => item.id === operationType)?.title}</strong>
                </div>
                {operationType === "receipt" && (
                  <div className="inventory-operation-fields two-columns">
                    <label>Nhà cung cấp *<input value={operationSupplier} onChange={(e) => setOperationSupplier(e.target.value)} placeholder="Tên nhà cung cấp" required /></label>
                    <label>Giá nhập mỗi sản phẩm *<input type="number" min="1" step="1" value={operationUnitCost} onChange={(e) => setOperationUnitCost(e.target.value)} required /></label>
                  </div>
                )}
                <label>{operationType === "receipt" ? "Tổng số lượng nhận *" : operationType === "stocktake" ? "Số lượng đếm thực tế *" : operationType === "special_adjustment" ? "Tồn thực tế mới *" : "Số lượng *"}
                  <input type="number" min={["stocktake", "special_adjustment"].includes(operationType) ? "0" : "1"} max={operationType === "quarantine" ? operationRow.stock : operationType === "release" ? operationRow.quarantine : undefined} step="1" value={operationQuantity} onChange={(e) => {
                    setOperationQuantity(e.target.value);
                    if (operationType === "receipt") setOperationSellable(String(Math.max(0, Number(e.target.value || 0) - Number(operationQuarantine || 0))));
                    setOperationConfirm(false);
                  }} required />
                </label>
                {operationType === "receipt" && (
                  <>
                    <div className="inventory-receipt-guidance">Hàng đạt yêu cầu có thể nhập bán ngay. Chỉ phân vào “Chờ kiểm tra” khi lô hàng cần kiểm định thêm.</div>
                    <div className="inventory-operation-fields two-columns">
                      <label>Đạt chất lượng, có thể bán *<input type="number" min="0" max={operationQuantity || undefined} step="1" value={operationSellable} onChange={(e) => { setOperationSellable(e.target.value); setOperationConfirm(false); }} required /></label>
                      <label>Chờ kiểm tra (nếu có) *<input type="number" min="0" max={operationQuantity || undefined} step="1" value={operationQuarantine} onChange={(e) => { setOperationQuarantine(e.target.value); setOperationSellable(String(Math.max(0, Number(operationQuantity || 0) - Number(e.target.value || 0)))); setOperationConfirm(false); }} required /></label>
                    </div>
                  </>
                )}
                <label>Mã chứng từ bên ngoài <small>Không bắt buộc; mã phiếu kho do hệ thống tự sinh.</small>
                  <input value={operationReference} onChange={(e) => setOperationReference(e.target.value)} placeholder="Hóa đơn, PO hoặc vận đơn..." />
                </label>
                <label>Lý do / ghi chú kiểm toán *
                  <textarea value={operationNote} onChange={(e) => setOperationNote(e.target.value)} minLength="5" required placeholder={operationType === "stocktake" ? "Mô tả ca kiểm kê và nguyên nhân chênh lệch nếu có..." : "Nêu nguồn hàng, kết luận kiểm tra hoặc lý do điều chỉnh..."} />
                </label>
                {operationType === "receipt" && currentUser?.role === "admin" && (
                  <label className="inventory-operation-checkbox"><input type="checkbox" checked={operationUpdateCost} onChange={(e) => setOperationUpdateCost(e.target.checked)} /> Cập nhật giá vốn bình quân sau lô nhập này</label>
                )}
                {operationPreview && (
                  <div className="inventory-operation-preview">
                    <h4>Kết quả dự kiến</h4>
                    <div><span>Chỉ số</span><span>Trước</span><span>Sau</span></div>
                    <div><strong>Tồn thực tế</strong><span>{operationRow.physical}</span><b>{operationPreview.physical}</b></div>
                    <div><strong>Có thể bán</strong><span>{operationRow.stock}</span><b>{operationPreview.available}</b></div>
                    <div><strong>Chờ kiểm tra</strong><span>{operationRow.quarantine}</span><b>{operationPreview.quarantine}</b></div>
                  </div>
                )}
                <label className="inventory-operation-checkbox confirm"><input type="checkbox" checked={operationConfirm} onChange={(e) => setOperationConfirm(e.target.checked)} /> Tôi đã kiểm tra SKU và số lượng trước/sau.</label>
                <div className="inventory-operation-actions"><button type="button" onClick={() => setOperationRow(null)}>Hủy</button><button type="submit" disabled={loading || !operationConfirm || operationNote.trim().length < 5}>{loading ? "Đang lưu..." : `Xác nhận ${OPERATION_TYPES.find((item) => item.id === operationType)?.title.toLowerCase()}`}</button></div>
              </>
            )}
          </form>
        </div>
      )}

      {/* Edit Stock Modal */}
      {editProduct && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            backgroundColor: "rgba(43, 33, 28, 0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 3000,
            padding: "20px",
          }}
        >
          <div
            style={{
              backgroundColor: "#FFF",
              padding: "30px",
              borderRadius: "8px",
              maxWidth: "450px",
              width: "100%",
              boxShadow: "0 10px 40px rgba(0,0,0,0.2)",
            }}
          >
            <h3 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "24px", color: "#2B211C", marginTop: 0 }}>
              Cấu Hình Hạn Mức Tồn Kho
            </h3>

            <div style={{ display: "flex", gap: "15px", alignItems: "center", margin: "15px 0 20px" }}>
              {editProduct.images && (
                <img
                  src={`/${editProduct.images[0]}`}
                  alt={editProduct.name}
                  style={{ width: "60px", height: "60px", objectFit: "cover", borderRadius: "4px" }}
                />
              )}
              <div>
                <strong style={{ color: "#2B211C", fontSize: "15px" }}>{editProduct.name}</strong>
                <div style={{ fontSize: "12px", color: "#8A7350" }}>
                  Mã sản phẩm: {editProduct.productCode || editProduct.product_code || `MR-${String(editProduct.id).padStart(3, "0")}`} | Giá: {formatPrice(editProduct.price)}
                </div>
              </div>
            </div>

            <form onSubmit={handleSaveStock}>
              <div className="form-group" style={{ marginTop: "12px" }}>
                <label style={{ fontSize: "13px", fontWeight: "600" }}>Màu và kích cỡ *</label>
                <select
                  value={selectedVariantId}
                  onChange={(event) => handleVariantChange(event.target.value)}
                  style={{ width: "100%", padding: "10px", borderRadius: "4px", border: "1px solid #D8CEC1", fontSize: "13px", background: "#FFF" }}
                >
                  {(editProduct.variants || []).map((variant) => (
                    <option key={variant.id} value={variant.id}>
                      {variant.color} · {variant.size} · SKU {variant.sku} · hiện có {variant.stock}
                    </option>
                  ))}
                </select>
              </div>

              <div className="inventory-threshold-note">
                Tồn thực tế không được thay đổi tại đây. Hãy dùng nút <strong>Nghiệp vụ</strong> để nhập hàng, kiểm kê hoặc điều chỉnh đặc biệt có chứng từ.
              </div>

              <div className="inventory-stock-limits">
                <div className="form-group">
                  <label>Mức tối thiểu (Min) *</label>
                  <input type="number" min="0" value={minStockValue} onChange={(event) => setMinStockValue(event.target.value)} />
                </div>
                <div className="form-group">
                  <label>Mức tối đa (Max) *</label>
                  <input type="number" min="1" value={maxStockValue} onChange={(event) => setMaxStockValue(event.target.value)} />
                </div>
              </div>

              <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "25px" }}>
                <button
                  type="button"
                  onClick={() => setEditProduct(null)}
                  className="btn-secondary"
                  disabled={loading}
                  style={{ width: "auto", margin: 0, padding: "10px 18px", fontSize: "13px" }}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={loading || !selectedVariantId || minStockValue === "" || maxStockValue === "" || Number(maxStockValue) <= Number(minStockValue)}
                  className="btn-primary"
                  style={{ padding: "10px 22px", fontSize: "13px" }}
                >
                  {loading ? "Đang lưu..." : "Lưu hạn mức"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Product Movement Ledger Modal */}
      {selectedProductMovements && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            backgroundColor: "rgba(43, 33, 28, 0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 3000,
            padding: "20px",
          }}
        >
          <div
            style={{
              backgroundColor: "#FFF",
              padding: "30px",
              borderRadius: "8px",
              maxWidth: "680px",
              width: "100%",
              maxHeight: "85vh",
              overflowY: "auto",
              boxShadow: "0 10px 40px rgba(0,0,0,0.2)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <div>
                <span style={{ fontSize: "11px", color: "#8A7350", textTransform: "uppercase", fontWeight: "600" }}>
                  Lịch sử điều chỉnh tồn kho
                </span>
                <h3 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "24px", color: "#2B211C", margin: "2px 0 0" }}>
                  {selectedProductMovements.name}
                </h3>
              </div>
              <button
                onClick={() => setSelectedProductMovements(null)}
                style={{ background: "none", border: "none", fontSize: "26px", color: "#6B5A4B", cursor: "pointer" }}
              >
                ×
              </button>
            </div>

            {loadingMovements ? (
              <div style={{ padding: "30px", textAlign: "center", color: "#6B5A4B" }}>Đang tải lịch sử kho...</div>
            ) : movementsList.length === 0 ? (
              <div style={{ padding: "30px", textAlign: "center", color: "#6B5A4B" }}>
                Chưa có lịch sử biến động kho cho sản phẩm này.
              </div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", textAlign: "left" }}>
                <thead>
                  <tr style={{ backgroundColor: "#FAF6F0", borderBottom: "1px solid #D8CEC1" }}>
                    <th style={{ padding: "10px" }}>Thời Gian</th>
                    <th style={{ padding: "10px" }}>Loại Biến Động</th>
                    <th style={{ padding: "10px" }}>Thay Đổi</th>
                    <th style={{ padding: "10px" }}>Tồn Sau Cùng</th>
                    <th style={{ padding: "10px" }}>Thực Hiện Bởi</th>
                  </tr>
                </thead>
                <tbody>
                  {movementsList.map((m, idx) => (
                    <tr key={idx} style={{ borderBottom: "1px solid #F0EAE1" }}>
                      <td style={{ padding: "10px", color: "#8A7350" }}>{formatDate(m.created_at || m.createdAt)}</td>
                      <td style={{ padding: "10px", fontWeight: "600" }}>
                        {m.movement_type === "order_deduction"
                          ? "Xuất kho xử lý đơn"
                          : m.movement_type === "order_reservation"
                          ? "Giữ hàng cho đơn"
                          : m.movement_type === "order_reservation_release"
                          ? "Hủy giữ hàng"
                          : m.movement_type === "order_cancellation_restore"
                          ? "Hoàn kho do hủy đơn"
                          : m.movement_type === "receipt"
                          ? "Nhập hàng"
                          : m.movement_type === "stocktake_adjustment"
                          ? "Điều chỉnh sau kiểm kê"
                          : m.movement_type === "quarantine_hold"
                          ? "Chuyển chờ kiểm tra"
                          : m.movement_type === "quarantine_release"
                          ? "Đưa lại vào bán"
                          : m.movement_type === "special_adjustment"
                          ? "Điều chỉnh đặc biệt"
                          : m.movement_type === "threshold_adjustment"
                          ? "Điều chỉnh hạn mức"
                          : "Điều chỉnh thủ công"}
                        {m.note && <div style={{ fontSize: "11.5px", color: "#6B5A4B", fontWeight: "400" }}>{m.note}</div>}
                      </td>
                      <td
                        style={{
                          padding: "10px",
                          fontWeight: "700",
                          color: (m.quantity_change || m.quantityChange) > 0 ? "#2E8B57" : "#D9534F",
                        }}
                      >
                        {(m.quantity_change ?? m.quantityChange) > 0 ? `+${m.quantity_change ?? m.quantityChange}` : (m.quantity_change ?? m.quantityChange ?? 0)}
                      </td>
                      <td style={{ padding: "10px", fontWeight: "600" }}>{m.resulting_stock ?? m.resultingStock ?? 0}</td>
                      <td style={{ padding: "10px", color: "#4E342E" }}>{m.performed_by || m.performedBy}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <div style={{ textAlign: "right", marginTop: "20px" }}>
              <button
                onClick={() => setSelectedProductMovements(null)}
                className="btn-primary"
                style={{ padding: "8px 20px", fontSize: "13px" }}
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
