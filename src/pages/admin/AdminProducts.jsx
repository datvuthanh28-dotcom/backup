import { useEffect, useState, useMemo } from "react";
import useDocumentTitle from "../../hooks/useDocumentTitle";
import { productsAPI } from "../../services/api";

const money = (val) => Number(val || 0).toLocaleString("vi-VN") + "đ";

export default function AdminProducts() {
  useDocumentTitle("Admin — Quản Lý Sản Phẩm & SKU");

  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Filters
  const [statusFilter, setStatusFilter] = useState("all"); // 'all', 'active', 'inactive'
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [search, setSearch] = useState("");

  // Selected product for SKU & history views
  const [selectedProduct, setSelectedProduct] = useState(null);

  // Modals
  const [productModal, setProductModal] = useState(null); // { mode: 'create'|'edit', data: {...} }
  const [variantModal, setVariantModal] = useState(null); // { mode: 'create'|'edit', productId: ..., data: {...} }
  const [movementsModal, setMovementsModal] = useState(null); // { productId: ..., movements: [] }
  const [busy, setBusy] = useState(false);

  const loadProducts = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await productsAPI.getAllAdmin();
      setProducts(res.products || []);
      if (selectedProduct) {
        const refreshed = res.products.find((p) => p.id === selectedProduct.id);
        if (refreshed) setSelectedProduct(refreshed);
      }
    } catch (err) {
      setError(err.message || "Không thể tải danh sách sản phẩm.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProducts();
  }, []);

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      if (statusFilter === "active" && !p.isActive) return false;
      if (statusFilter === "inactive" && p.isActive) return false;
      if (categoryFilter !== "all" && p.category !== categoryFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const code = (p.productCode || p.product_code || "").toLowerCase();
        const name = (p.name || "").toLowerCase();
        if (!code.includes(q) && !name.includes(q)) return false;
      }
      return true;
    });
  }, [products, statusFilter, categoryFilter, search]);

  // Product Actions
  const handleSaveProduct = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    setSuccessMsg("");
    try {
      const form = productModal.data;
      if (productModal.mode === "create") {
        await productsAPI.createProductAdmin(form);
        setSuccessMsg(`Đã tạo sản phẩm ${form.productCode} thành công.`);
      } else {
        await productsAPI.updateProductAdmin(form.id, form);
        setSuccessMsg(`Đã cập nhật sản phẩm ${form.productCode} thành công.`);
      }
      setProductModal(null);
      await loadProducts();
    } catch (err) {
      setError(err.message || "Lỗi khi lưu sản phẩm.");
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
    setSuccessMsg("");
    try {
      const { productId, mode, data } = variantModal;
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
      setError(err.message || "Lỗi khi lưu SKU biến thể.");
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
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "25px" }}>
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
        <button
          onClick={() => setProductModal({
            mode: "create",
            data: {
              productCode: `MR-${Math.floor(210 + Math.random() * 80)}`,
              name: "",
              price: 3500000,
              category: "clothing",
              gender: "nam",
              description: "",
              material: "100% Cotton hữu cơ",
              collectionName: "Riviera Summer",
              minAlert: 5,
              colors: ["NAVY BLUE", "WHITE"],
              sizes: ["S", "M", "L", "XL"],
              images: ["image/catalog/placeholder.webp"],
              variants: [
                { color: "NAVY BLUE", size: "M", price: 3500000, costPrice: 1800000, floorPrice: 2800000, stock: 10, minStock: 3, maxStock: 30 },
                { color: "NAVY BLUE", size: "L", price: 3500000, costPrice: 1800000, floorPrice: 2800000, stock: 8, minStock: 3, maxStock: 30 },
              ],
            },
          })}
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

      {/* Filter Bar */}
      <div style={{ display: "flex", gap: "15px", backgroundColor: "#FFF", padding: "16px 20px", borderRadius: "8px", border: "1px solid #E8E1D6", marginBottom: "25px", alignItems: "center" }}>
        <div style={{ flex: 1 }}>
          <input
            type="text"
            placeholder="Tìm theo mã sản phẩm (MR-xxx) hoặc tên..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: "100%", padding: "9px 14px", border: "1px solid #D8CEC1", borderRadius: "5px", fontSize: "13px", outline: "none", boxSizing: "border-box" }}
          />
        </div>
        <div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ padding: "9px 14px", border: "1px solid #D8CEC1", borderRadius: "5px", fontSize: "13px", backgroundColor: "#FFF" }}
          >
            <option value="all">Tất cả trạng thái</option>
            <option value="active">Đang kinh doanh (Active)</option>
            <option value="inactive">Đã ngừng bán (Soft-Deleted)</option>
          </select>
        </div>
        <div>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            style={{ padding: "9px 14px", border: "1px solid #D8CEC1", borderRadius: "5px", fontSize: "13px", backgroundColor: "#FFF" }}
          >
            <option value="all">Tất cả danh mục</option>
            <option value="clothing">Trang phục (Clothing)</option>
            <option value="footwear">Giày dép (Footwear)</option>
            <option value="accessories">Phụ kiện (Accessories)</option>
          </select>
        </div>
        <div style={{ fontSize: "13px", color: "#8A7350", fontWeight: "600", minWidth: "120px", textAlign: "right" }}>
          {filteredProducts.length} sản phẩm
        </div>
      </div>

      {/* Main Content Layout */}
      <div style={{ display: "grid", gridTemplateColumns: selectedProduct ? "1fr 1fr" : "1fr", gap: "25px" }}>
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
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", textAlign: "left" }}>
                <thead>
                  <tr style={{ backgroundColor: "#FAF6F0", borderBottom: "1px solid #E8E1D6", color: "#6B5A4B", textTransform: "uppercase", fontSize: "11px", letterSpacing: "0.5px" }}>
                    <th style={{ padding: "12px 16px" }}>Mã & Tên</th>
                    <th style={{ padding: "12px 14px" }}>Danh mục</th>
                    <th style={{ padding: "12px 14px" }}>Giá bán</th>
                    <th style={{ padding: "12px 14px" }}>Tồn kho</th>
                    <th style={{ padding: "12px 14px" }}>Trạng thái</th>
                    <th style={{ padding: "12px 16px", textAlign: "right" }}>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.map((p) => {
                    const isSelected = selectedProduct?.id === p.id;
                    return (
                      <tr
                        key={p.id}
                        onClick={() => setSelectedProduct(p)}
                        style={{
                          borderBottom: "1px solid #F0EAE1",
                          backgroundColor: isSelected ? "rgba(138, 90, 54, 0.08)" : "transparent",
                          cursor: "pointer",
                          transition: "background 0.15s",
                        }}
                      >
                        <td style={{ padding: "12px 16px" }}>
                          <strong style={{ color: "#14100E", display: "block" }}>{p.name}</strong>
                          <span style={{ fontSize: "11px", color: "#8A7350" }}>{p.productCode || p.product_code}</span>
                        </td>
                        <td style={{ padding: "12px 14px", color: "#6B5A4B" }}>
                          {p.category} • {p.gender}
                        </td>
                        <td style={{ padding: "12px 14px", fontWeight: "600", color: "#2B211C" }}>
                          {money(p.price)}
                        </td>
                        <td style={{ padding: "12px 14px" }}>
                          <span style={{ fontWeight: "600", color: p.activeStock <= 5 ? "#D9534F" : "#2E8B57" }}>
                            {p.activeStock}
                          </span>
                          <span style={{ fontSize: "11px", color: "#8A7350" }}> / {p.variants?.length || 0} SKU</span>
                        </td>
                        <td style={{ padding: "12px 14px" }}>
                          {p.isActive ? (
                            <span style={{ padding: "3px 8px", backgroundColor: "#E8F5E9", color: "#2E8B57", borderRadius: "12px", fontSize: "11px", fontWeight: "600" }}>
                              Kinh doanh
                            </span>
                          ) : (
                            <span style={{ padding: "3px 8px", backgroundColor: "#FFEBEE", color: "#D9534F", borderRadius: "12px", fontSize: "11px", fontWeight: "600" }}>
                              Ngừng bán
                            </span>
                          )}
                        </td>
                        <td style={{ padding: "12px 16px", textAlign: "right" }} onClick={(e) => e.stopPropagation()}>
                          <div style={{ display: "inline-flex", gap: "6px" }}>
                            <button
                              onClick={() => setProductModal({ mode: "edit", data: { ...p, productCode: p.productCode || p.product_code } })}
                              title="Sửa thông tin"
                              style={{ padding: "4px 8px", backgroundColor: "#FAF6F0", border: "1px solid #D8CEC1", borderRadius: "4px", fontSize: "11px", cursor: "pointer" }}
                            >
                              <i className="fas fa-edit"></i>
                            </button>
                            {p.isActive ? (
                              <button
                                onClick={() => handleSoftDeleteProduct(p)}
                                title="Xóa mềm (Ngừng bán)"
                                style={{ padding: "4px 8px", backgroundColor: "#FFF0F0", border: "1px solid #F5C6CB", color: "#D9534F", borderRadius: "4px", fontSize: "11px", cursor: "pointer" }}
                              >
                                <i className="fas fa-trash-alt"></i>
                              </button>
                            ) : (
                              <button
                                onClick={() => handleRestoreProduct(p)}
                                title="Khôi phục bán"
                                style={{ padding: "4px 8px", backgroundColor: "#F0FFF0", border: "1px solid #C3E6CB", color: "#2E8B57", borderRadius: "4px", fontSize: "11px", cursor: "pointer" }}
                              >
                                <i className="fas fa-trash-restore"></i>
                              </button>
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
                <button
                  onClick={() => setVariantModal({
                    mode: "create",
                    productId: selectedProduct.id,
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
                </button>
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
                    {(selectedProduct.variants || []).map((v) => (
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
                          {v.isActive ? (
                            <span style={{ color: "#2E8B57", fontSize: "11px", fontWeight: "600" }}>● Đang bán</span>
                          ) : (
                            <span style={{ color: "#D9534F", fontSize: "11px", fontWeight: "600" }}>● Ngừng bán</span>
                          )}
                        </td>
                        <td style={{ padding: "8px 10px", textAlign: "right" }}>
                          <div style={{ display: "inline-flex", gap: "5px" }}>
                            <button
                              onClick={() => setVariantModal({ mode: "edit", productId: selectedProduct.id, data: { ...v } })}
                              title="Sửa SKU"
                              style={{ padding: "3px 6px", backgroundColor: "#FAF6F0", border: "1px solid #D8CEC1", borderRadius: "3px", fontSize: "10px", cursor: "pointer" }}
                            >
                              <i className="fas fa-edit"></i>
                            </button>
                            {v.isActive ? (
                              <button
                                onClick={() => handleSoftDeleteVariant(selectedProduct.id, v)}
                                title="Ngừng bán SKU (Xóa mềm)"
                                style={{ padding: "3px 6px", backgroundColor: "#FFF0F0", border: "1px solid #F5C6CB", color: "#D9534F", borderRadius: "3px", fontSize: "10px", cursor: "pointer" }}
                              >
                                <i className="fas fa-ban"></i>
                              </button>
                            ) : (
                              <button
                                onClick={() => handleRestoreVariant(selectedProduct.id, v)}
                                title="Khôi phục SKU"
                                style={{ padding: "3px 6px", backgroundColor: "#F0FFF0", border: "1px solid #C3E6CB", color: "#2E8B57", borderRadius: "3px", fontSize: "10px", cursor: "pointer" }}
                              >
                                <i className="fas fa-undo"></i>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modal: Create / Edit Product */}
      {productModal && (
        <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
          <div style={{ backgroundColor: "#FFF", borderRadius: "8px", maxWidth: "650px", width: "100%", maxHeight: "90vh", overflowY: "auto", padding: "25px", border: "1px solid #D8CEC1" }}>
            <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "24px", margin: "0 0 15px", color: "#14100E" }}>
              {productModal.mode === "create" ? "Tạo Sản Phẩm Mới" : `Chỉnh Sửa Sản Phẩm: ${productModal.data.productCode}`}
            </h2>
            <form onSubmit={handleSaveProduct} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <label style={{ fontSize: "12px", fontWeight: "600", color: "#4E342E" }}>
                  Mã sản phẩm (MR-xxx) *
                  <input
                    required
                    disabled={productModal.mode === "edit"}
                    value={productModal.data.productCode || ""}
                    onChange={(e) => setProductModal({ ...productModal, data: { ...productModal.data, productCode: e.target.value.toUpperCase() } })}
                    style={{ width: "100%", padding: "8px 10px", marginTop: "4px", border: "1px solid #D8CEC1", borderRadius: "4px" }}
                  />
                </label>
                <label style={{ fontSize: "12px", fontWeight: "600", color: "#4E342E" }}>
                  Tên sản phẩm *
                  <input
                    required
                    value={productModal.data.name || ""}
                    onChange={(e) => setProductModal({ ...productModal, data: { ...productModal.data, name: e.target.value } })}
                    style={{ width: "100%", padding: "8px 10px", marginTop: "4px", border: "1px solid #D8CEC1", borderRadius: "4px" }}
                  />
                </label>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
                <label style={{ fontSize: "12px", fontWeight: "600", color: "#4E342E" }}>
                  Giá bán chuẩn (VNĐ) *
                  <input
                    required
                    type="number"
                    min="0"
                    step="1000"
                    value={productModal.data.price || 0}
                    onChange={(e) => setProductModal({ ...productModal, data: { ...productModal.data, price: Number(e.target.value) } })}
                    style={{ width: "100%", padding: "8px 10px", marginTop: "4px", border: "1px solid #D8CEC1", borderRadius: "4px" }}
                  />
                </label>
                <label style={{ fontSize: "12px", fontWeight: "600", color: "#4E342E" }}>
                  Danh mục *
                  <select
                    value={productModal.data.category || "clothing"}
                    onChange={(e) => setProductModal({ ...productModal, data: { ...productModal.data, category: e.target.value } })}
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

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
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

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "15px" }}>
                <button
                  type="button"
                  onClick={() => setProductModal(null)}
                  style={{ padding: "9px 16px", backgroundColor: "#FAF6F0", border: "1px solid #D8CEC1", borderRadius: "4px", cursor: "pointer" }}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  style={{ padding: "9px 20px", backgroundColor: "#8A5A36", color: "#FFF", border: "none", borderRadius: "4px", cursor: "pointer", fontWeight: "600" }}
                >
                  {busy ? "Đang lưu..." : "Lưu Thông Tin"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Create / Edit SKU Variant */}
      {variantModal && (
        <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
          <div style={{ backgroundColor: "#FFF", borderRadius: "8px", maxWidth: "500px", width: "100%", padding: "25px", border: "1px solid #D8CEC1" }}>
            <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "22px", margin: "0 0 15px", color: "#14100E" }}>
              {variantModal.mode === "create" ? "Thêm Biến Thể SKU Mới" : `Chỉnh Sửa SKU: ${variantModal.data.sku}`}
            </h2>
            <form onSubmit={handleSaveVariant} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <label style={{ fontSize: "12px", fontWeight: "600", color: "#4E342E" }}>
                Mã SKU *
                <input
                  required
                  disabled={variantModal.mode === "edit"}
                  value={variantModal.data.sku || ""}
                  onChange={(e) => setVariantModal({ ...variantModal, data: { ...variantModal.data, sku: e.target.value.toUpperCase() } })}
                  style={{ width: "100%", padding: "8px 10px", marginTop: "4px", border: "1px solid #D8CEC1", borderRadius: "4px" }}
                />
              </label>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <label style={{ fontSize: "12px", fontWeight: "600", color: "#4E342E" }}>
                  Màu sắc *
                  <input
                    required
                    value={variantModal.data.color || ""}
                    onChange={(e) => setVariantModal({ ...variantModal, data: { ...variantModal.data, color: e.target.value } })}
                    style={{ width: "100%", padding: "8px 10px", marginTop: "4px", border: "1px solid #D8CEC1", borderRadius: "4px" }}
                  />
                </label>
                <label style={{ fontSize: "12px", fontWeight: "600", color: "#4E342E" }}>
                  Kích cỡ *
                  <input
                    required
                    value={variantModal.data.size || ""}
                    onChange={(e) => setVariantModal({ ...variantModal, data: { ...variantModal.data, size: e.target.value } })}
                    style={{ width: "100%", padding: "8px 10px", marginTop: "4px", border: "1px solid #D8CEC1", borderRadius: "4px" }}
                  />
                </label>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px" }}>
                <label style={{ fontSize: "12px", fontWeight: "600", color: "#4E342E" }}>
                  Giá bán (VNĐ)
                  <input
                    required
                    type="number"
                    min="0"
                    value={variantModal.data.price || 0}
                    onChange={(e) => setVariantModal({ ...variantModal, data: { ...variantModal.data, price: Number(e.target.value) } })}
                    style={{ width: "100%", padding: "8px 10px", marginTop: "4px", border: "1px solid #D8CEC1", borderRadius: "4px" }}
                  />
                </label>
                <label style={{ fontSize: "12px", fontWeight: "600", color: "#4E342E" }}>
                  Giá vốn (Cost)
                  <input
                    type="number"
                    min="0"
                    value={variantModal.data.costPrice || 0}
                    onChange={(e) => setVariantModal({ ...variantModal, data: { ...variantModal.data, costPrice: Number(e.target.value) } })}
                    style={{ width: "100%", padding: "8px 10px", marginTop: "4px", border: "1px solid #D8CEC1", borderRadius: "4px" }}
                  />
                </label>
                <label style={{ fontSize: "12px", fontWeight: "600", color: "#4E342E" }}>
                  Giá sàn (Floor)
                  <input
                    type="number"
                    min="0"
                    value={variantModal.data.floorPrice || 0}
                    onChange={(e) => setVariantModal({ ...variantModal, data: { ...variantModal.data, floorPrice: Number(e.target.value) } })}
                    style={{ width: "100%", padding: "8px 10px", marginTop: "4px", border: "1px solid #D8CEC1", borderRadius: "4px" }}
                  />
                </label>
              </div>

              {variantModal.mode === "create" && (
                <label style={{ fontSize: "12px", fontWeight: "600", color: "#4E342E" }}>
                  Số lượng nhập ban đầu *
                  <input
                    required
                    type="number"
                    min="0"
                    value={variantModal.data.stock || 0}
                    onChange={(e) => setVariantModal({ ...variantModal, data: { ...variantModal.data, stock: Number(e.target.value) } })}
                    style={{ width: "100%", padding: "8px 10px", marginTop: "4px", border: "1px solid #D8CEC1", borderRadius: "4px" }}
                  />
                </label>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <label style={{ fontSize: "12px", fontWeight: "600", color: "#4E342E" }}>
                  Tồn tối thiểu (Min alert)
                  <input
                    type="number"
                    min="0"
                    value={variantModal.data.minStock ?? variantModal.data.lowStockThreshold ?? 3}
                    onChange={(e) => setVariantModal({ ...variantModal, data: { ...variantModal.data, minStock: Number(e.target.value) } })}
                    style={{ width: "100%", padding: "8px 10px", marginTop: "4px", border: "1px solid #D8CEC1", borderRadius: "4px" }}
                  />
                </label>
                <label style={{ fontSize: "12px", fontWeight: "600", color: "#4E342E" }}>
                  Tồn tối đa (Max capacity)
                  <input
                    type="number"
                    min="1"
                    value={variantModal.data.maxStock ?? variantModal.data.maxStockThreshold ?? 30}
                    onChange={(e) => setVariantModal({ ...variantModal, data: { ...variantModal.data, maxStock: Number(e.target.value) } })}
                    style={{ width: "100%", padding: "8px 10px", marginTop: "4px", border: "1px solid #D8CEC1", borderRadius: "4px" }}
                  />
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

