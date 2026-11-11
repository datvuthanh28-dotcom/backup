import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useStore } from "../../context/StoreContext";
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

function normalizeGender(value) {
  const gender = String(value || "").toLowerCase();
  if (["men", "male", "nam"].includes(gender)) return "nam";
  if (["women", "female", "nữ", "nu"].includes(gender)) return "nữ";
  if (["kids", "kid", "children", "trẻ em", "tre em"].includes(gender)) return "kids";
  return "";
}

function getVariantState(variant) {
  const stock = Number(variant.stock);
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

export default function StaffInventory() {
  useDocumentTitle("Staff Portal — Quản Lý Tồn Kho");
  const { products, updateVariantStock, getProductStock } = useStore();
  const [searchParams] = useSearchParams();

  const [genderFilter, setGenderFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const initialStockFilter = STOCK_FILTER_IDS.has(searchParams.get("stock")) ? searchParams.get("stock") : "all";
  const [stockStatusFilter, setStockStatusFilter] = useState(initialStockFilter);
  const [searchTerm, setSearchTerm] = useState(searchParams.get("search") || "");
  const [sortBy, setSortBy] = useState("stock_asc");
  const [page, setPage] = useState(1);
  const [editProduct, setEditProduct] = useState(null);
  const [selectedVariantId, setSelectedVariantId] = useState("");
  const [newStockValue, setNewStockValue] = useState("");
  const [minStockValue, setMinStockValue] = useState("3");
  const [maxStockValue, setMaxStockValue] = useState("20");
  const [stockNote, setStockNote] = useState("");
  const [toastMessage, setToastMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const toastTimerRef = useRef(null);
  // Movements modal
  const [selectedProductMovements, setSelectedProductMovements] = useState(null);
  const [movementsList, setMovementsList] = useState([]);
  const [loadingMovements, setLoadingMovements] = useState(false);

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

  const productTypes = useMemo(
    () => [...new Set(products.map((product) => product.productType || product.category).filter(Boolean))].sort(),
    [products]
  );

  const inventoryRows = useMemo(() => products.flatMap((product) =>
    (product.variants || []).map((variant) => ({
      product,
      variant,
      stock: Number(variant.stock),
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
    setSortBy("stock_asc");
  };

  const handleOpenEdit = (product, variantId = null) => {
    const firstVariant = product.variants?.find((variant) => String(variant.id) === String(variantId)) || product.variants?.[0];
    setEditProduct(product);
    setSelectedVariantId(firstVariant?.id || "");
    setNewStockValue(firstVariant ? String(firstVariant.stock) : String(getProductStock(product.id)));
    setMinStockValue(String(firstVariant?.lowStockThreshold ?? firstVariant?.low_stock_threshold ?? 3));
    setMaxStockValue(String(firstVariant?.maxStockThreshold ?? firstVariant?.max_stock_threshold ?? 20));
    setStockNote("");
  };

  const handleVariantChange = (variantId) => {
    const variant = editProduct?.variants?.find((item) => String(item.id) === String(variantId));
    setSelectedVariantId(variantId);
    setNewStockValue(variant ? String(variant.stock) : "");
    setMinStockValue(String(variant?.lowStockThreshold ?? variant?.low_stock_threshold ?? 3));
    setMaxStockValue(String(variant?.maxStockThreshold ?? variant?.max_stock_threshold ?? 20));
  };

  const handleSaveStock = async (e) => {
    e.preventDefault();
    if (!editProduct) return;
    const stockNum = parseInt(newStockValue, 10);
    const minStockNum = parseInt(minStockValue, 10);
    const maxStockNum = parseInt(maxStockValue, 10);
    if (isNaN(stockNum) || stockNum < 0) {
      alert("Số lượng tồn kho phải là số nguyên dương (>= 0).");
      return;
    }
    if (isNaN(minStockNum) || minStockNum < 0 || isNaN(maxStockNum) || maxStockNum <= minStockNum) {
      alert("Mức tối thiểu phải từ 0 trở lên và mức tối đa phải lớn hơn mức tối thiểu.");
      return;
    }
    if (stockNote.trim().length < 5) {
      alert("Vui lòng nhập lý do điều chỉnh tồn kho (tối thiểu 5 ký tự). Nội dung này sẽ được lưu vào lịch sử kiểm toán.");
      return;
    }

    setLoading(true);
    if (!selectedVariantId) {
      alert("Sản phẩm chưa có SKU biến thể hợp lệ để điều chỉnh.");
      return;
    }
    const res = await updateVariantStock(editProduct.id, selectedVariantId, stockNum, minStockNum, maxStockNum, stockNote);
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
          QUẢN LÝ KHO
        </h1>
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
                <th style={{ padding: "14px 18px", fontWeight: "600" }}>Tồn Kho</th>
                <th style={{ padding: "14px 18px", fontWeight: "600" }}>Tình Trạng</th>
                <th style={{ padding: "14px 18px", fontWeight: "600", textAlign: "right" }}>Điều Chỉnh & Lịch Sử</th>
              </tr>
            </thead>
            <tbody>
              {paginatedRows.length === 0 ? (
                <tr>
                  <td colSpan="7" className="inventory-empty-state">
                    <i className="fas fa-box-open" aria-hidden="true" />
                    <strong>Không tìm thấy sản phẩm phù hợp</strong>
                    <span>Hãy thay đổi từ khóa hoặc xóa các bộ lọc đang áp dụng.</span>
                    <button type="button" onClick={resetFilters}>Xóa bộ lọc</button>
                  </td>
                </tr>
              ) : (
                paginatedRows.map(({ product: p, variant, stock, state }, idx) => {
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

                      <td data-label="Tồn kho" style={{ padding: "12px 18px" }}>
                        <span
                          style={{
                            fontSize: "16px",
                            fontWeight: "700",
                            color: state.id === "out" ? "#D9534F" : state.id === "low" ? "#B8860B" : state.id === "over" ? "#2C6BA0" : "#2B211C",
                          }}
                        >
                          {stock}
                        </span>{" "}
                        <span style={{ fontSize: "12px", color: "#8A7350" }}>sản phẩm</span>
                        <div style={{ marginTop: 2, fontSize: "10.5px", color: "#A09384" }}>Min {variant.lowStockThreshold ?? 3} · Max {variant.maxStockThreshold ?? 20}</div>
                      </td>

                      <td data-label="Tình trạng" style={{ padding: "12px 18px" }}>
                        <span className={`inventory-stock-status is-${state.id}`}>{state.label}</span>
                      </td>

                      <td data-label="Thao tác" style={{ padding: "12px 18px", textAlign: "right" }}>
                        <div className="inventory-row-actions">
                          <button
                            onClick={() => handleOpenEdit(p, variant.id)}
                            className="inventory-adjust-button"
                          >
                            Điều chỉnh
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
              Điều Chỉnh Tồn Kho
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

              <div className="form-group">
                <label style={{ fontSize: "13px", fontWeight: "600" }}>Số lượng tồn kho khả dụng mới *</label>
                <input
                  type="number"
                  min="0"
                  value={newStockValue}
                  onChange={(e) => setNewStockValue(e.target.value)}
                  autoFocus
                  style={{
                    width: "100%",
                    padding: "10px",
                    borderRadius: "4px",
                    border: "1px solid #D8CEC1",
                    fontSize: "16px",
                    fontWeight: "600",
                  }}
                />
                <div className="inventory-stock-change-preview">
                  Hiện tại: <strong>{editProduct.variants?.find((item) => String(item.id) === String(selectedVariantId))?.stock ?? "—"}</strong>
                  <span aria-hidden="true">→</span>
                  Sau điều chỉnh: <strong>{newStockValue === "" ? "—" : newStockValue}</strong>
                </div>
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

              <div className="form-group" style={{ marginTop: "12px" }}>
                <label style={{ fontSize: "13px", fontWeight: "600" }}>Lý do điều chỉnh tồn kho *</label>
                <input
                  type="text"
                  value={stockNote}
                  onChange={(e) => setStockNote(e.target.value)}
                  placeholder="Ví dụ: Nhập bổ sung theo phiếu NK-102; điều chỉnh sau kiểm kê..."
                  style={{
                    width: "100%",
                    padding: "10px",
                    borderRadius: "4px",
                    border: "1px solid #D8CEC1",
                    fontSize: "13px",
                  }}
                />
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
                  disabled={loading || !selectedVariantId || stockNote.trim().length < 5 || newStockValue === "" || minStockValue === "" || maxStockValue === "" || Number(maxStockValue) <= Number(minStockValue)}
                  className="btn-primary"
                  style={{ padding: "10px 22px", fontSize: "13px" }}
                >
                  {loading ? "Đang lưu..." : "Xác nhận điều chỉnh"}
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
                          ? "Trừ kho do đặt đơn"
                          : m.movement_type === "order_cancellation_restore"
                          ? "Hoàn kho do hủy đơn"
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
                        {(m.quantity_change || m.quantityChange) > 0 ? `+${m.quantity_change || m.quantityChange}` : m.quantity_change || m.quantityChange}
                      </td>
                      <td style={{ padding: "10px", fontWeight: "600" }}>{m.resulting_stock || m.resultingStock}</td>
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
