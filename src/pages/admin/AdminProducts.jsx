import { useCallback, useEffect, useState, useMemo } from "react";
import useDocumentTitle from "../../hooks/useDocumentTitle";
import { productsAPI } from "../../services/api";
import AdminPagination from "../../components/AdminPagination";

const money = (val) => Number(val || 0).toLocaleString("vi-VN") + "đ";
const PAGE_SIZE = 10;

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
  const [page, setPage] = useState(1);

  // Selected product for SKU & history views
  const [selectedProduct, setSelectedProduct] = useState(null);

  // Modals
  const [productModal, setProductModal] = useState(null); // { mode: 'create'|'edit', data: {...} }
  const [variantModal, setVariantModal] = useState(null); // { mode: 'create'|'edit', productId: ..., data: {...} }
  const [movementsModal, setMovementsModal] = useState(null); // { productId: ..., movements: [] }
  const [busy, setBusy] = useState(false);
  const [uploadingImages, setUploadingImages] = useState(false);

  const emptyVariant = (price = "") => ({
    sku: "", color: "", size: "", price, costPrice: "", floorPrice: "",
    stock: 0, minStock: 0, maxStock: 1, isNew: true,
  });

  const openCreateProduct = () => setProductModal({
    mode: "create",
    data: {
      productCode: "", name: "", price: "", category: "clothing", gender: "nam",
      description: "", material: "", collectionName: "", minAlert: 0,
      images: [], imageText: "", variants: [emptyVariant()],
    },
  });

  const openEditProduct = (product) => setProductModal({
    mode: "edit",
    data: {
      ...product,
      productCode: product.productCode || product.product_code,
      collectionName: product.collectionName || product.collection || "",
      imageText: (product.images || []).join("\n"),
      variants: (product.variants || []).map((variant) => ({
        ...variant,
        minStock: variant.minStock ?? variant.lowStockThreshold ?? 0,
        maxStock: variant.maxStock ?? variant.maxStockThreshold ?? 1,
        isNew: false,
      })),
    },
  });

  const updateProductField = (field, value) => setProductModal((current) => ({
    ...current, data: { ...current.data, [field]: value },
  }));

  const updateEditorVariant = (index, field, value) => setProductModal((current) => ({
    ...current,
    data: {
      ...current.data,
      variants: current.data.variants.map((variant, variantIndex) => variantIndex === index ? { ...variant, [field]: value } : variant),
    },
  }));

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
        const currentImages = String(current.data.imageText || "").split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
        const images = [...currentImages, ...uploaded];
        return { ...current, data: { ...current.data, imageText: images.join("\n") } };
      });
    } catch (uploadError) { setError(uploadError.message || "Không thể tải ảnh lên."); }
    finally { setUploadingImages(false); }
  };

  const loadProducts = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await productsAPI.getAllAdmin();
      setProducts(res.products || []);
      setSelectedProduct((current) => current ? (res.products.find((product) => product.id === current.id) || current) : null);
    } catch (err) {
      setError(err.message || "Không thể tải danh sách sản phẩm.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

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
  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / PAGE_SIZE));
  const pagedProducts = filteredProducts.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => setPage(1), [statusFilter, categoryFilter, search]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  // Product Actions
  const handleSaveProduct = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    setSuccessMsg("");
    try {
      const form = {
        ...productModal.data,
        images: String(productModal.data.imageText || "").split(/\r?\n/).map((item) => item.trim()).filter(Boolean),
        colors: [...new Set((productModal.data.variants || []).map((variant) => String(variant.color || "").trim()).filter(Boolean))],
      };
      if (!form.variants?.length) throw new Error("Sản phẩm phải có ít nhất một SKU.");
      for (const variant of form.variants) {
        if (!variant.sku?.trim() || !variant.color?.trim() || !variant.size?.trim()) throw new Error("Mỗi SKU phải có mã SKU, màu sắc và kích cỡ.");
        const price = Number(variant.price);
        const cost = Number(variant.costPrice);
        const floor = Number(variant.floorPrice);
        if (!(price > 0) || cost < 0 || floor < cost || floor > price) throw new Error(`SKU ${variant.sku}: giá phải thỏa mãn 0 ≤ giá vốn ≤ giá sàn ≤ giá bán.`);
        if (Number(variant.maxStock) <= Number(variant.minStock)) throw new Error(`SKU ${variant.sku}: mức tồn tối đa phải lớn hơn mức tối thiểu.`);
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
                  {pagedProducts.map((p) => {
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
                              onClick={() => openEditProduct(p)}
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
          <div style={{ backgroundColor: "#FFF", borderRadius: "8px", maxWidth: "1050px", width: "100%", maxHeight: "90vh", overflowY: "auto", padding: "25px", border: "1px solid #D8CEC1" }}>
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

              <section style={{ borderTop: "1px solid #E8E1D6", paddingTop: "16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: "16px" }}>SKU, giá và tồn kho</h3>
                    <small style={{ color: "#806D60" }}>Tồn kho của SKU hiện có chỉ được thay đổi tại chức năng Điều chỉnh kho để đảm bảo lịch sử kiểm toán.</small>
                  </div>
                  <button type="button" onClick={() => updateProductField("variants", [...(productModal.data.variants || []), emptyVariant(productModal.data.price)])} style={{ padding: "7px 12px", border: 0, borderRadius: "4px", background: "#4E342E", color: "#FFF", cursor: "pointer" }}>+ Thêm SKU</button>
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", minWidth: "930px" }}>
                    <thead><tr style={{ background: "#FAF6F0" }}><th>Mã SKU</th><th>Màu</th><th>Size</th><th>Giá bán</th><th>Giá vốn</th><th>Giá sàn</th><th>Tồn</th><th>Min</th><th>Max</th><th></th></tr></thead>
                    <tbody>{(productModal.data.variants || []).map((variant, index) => <tr key={variant.id || `new-${index}`} style={{ borderBottom: "1px solid #EEE7DE" }}>
                      {["sku", "color", "size", "price", "costPrice", "floorPrice", "stock", "minStock", "maxStock"].map((field) => <td key={field} style={{ padding: "6px 4px" }}><input required={field !== "stock"} disabled={(field === "sku" || field === "stock") && !variant.isNew} type={["price", "costPrice", "floorPrice", "stock", "minStock", "maxStock"].includes(field) ? "number" : "text"} min="0" value={variant[field] ?? ""} onChange={(event) => updateEditorVariant(index, field, event.target.type === "number" ? Number(event.target.value) : event.target.value.toUpperCase())} style={{ width: field === "sku" ? "145px" : "78px", boxSizing: "border-box", padding: "7px", border: "1px solid #D8CEC1", borderRadius: "4px", background: ((field === "sku" || field === "stock") && !variant.isNew) ? "#F3EFEA" : "#FFF" }} /></td>)}
                      <td><button type="button" disabled={!variant.isNew} title={variant.isNew ? "Bỏ SKU chưa lưu" : "SKU hiện có được ngừng bán bằng thao tác xóa mềm"} onClick={() => updateProductField("variants", productModal.data.variants.filter((_, variantIndex) => variantIndex !== index))} style={{ border: 0, background: "transparent", color: variant.isNew ? "#B94A48" : "#B9ADA4", cursor: variant.isNew ? "pointer" : "not-allowed" }}>×</button></td>
                    </tr>)}</tbody>
                  </table>
                </div>
              </section>

              <section style={{ borderTop: "1px solid #E8E1D6", paddingTop: "16px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}><div><h3 style={{ margin: "0 0 4px", fontSize: "16px" }}>Ảnh sản phẩm</h3><small style={{ color: "#806D60" }}>Ảnh đầu tiên được dùng làm ảnh đại diện. Khuyến nghị WebP, tỷ lệ 1:1.</small></div><label style={{ padding: "8px 13px", border: "1px solid #BDAA96", borderRadius: "5px", cursor: uploadingImages ? "wait" : "pointer", color: "#4E342E", fontSize: "12px", fontWeight: 600, whiteSpace: "nowrap" }}>{uploadingImages ? "Đang tải ảnh…" : "+ Tải ảnh từ máy"}<input type="file" multiple accept="image/webp,image/jpeg,image/png" disabled={uploadingImages} onChange={handleImageUpload} style={{ display: "none" }} /></label></div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(95px,1fr))", gap: "9px", marginTop: "12px" }}>{String(productModal.data.imageText || "").split(/\r?\n/).map((item) => item.trim()).filter(Boolean).map((image, index, images) => <div key={`${image}-${index}`} style={{ position: "relative", border: index === 0 ? "2px solid #8A5A36" : "1px solid #DDD2C5", borderRadius: "5px", overflow: "hidden", aspectRatio: "1" }}><img src={image} alt={`Ảnh sản phẩm ${index + 1}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} /><button type="button" onClick={() => updateProductField("imageText", images.filter((_, imageIndex) => imageIndex !== index).join("\n"))} aria-label="Xóa ảnh" style={{ position: "absolute", right: "4px", top: "4px", width: "22px", height: "22px", border: 0, borderRadius: "50%", background: "rgba(35,25,20,.8)", color: "#FFF", cursor: "pointer" }}>×</button>{index === 0 && <span style={{ position: "absolute", left: "4px", bottom: "4px", padding: "2px 5px", borderRadius: "3px", background: "rgba(35,25,20,.8)", color: "#FFF", fontSize: "9px" }}>Đại diện</span>}</div>)}</div>
                <small style={{ display: "block", color: "#806D60", marginTop: "10px" }}>Hoặc nhập đường dẫn ảnh, mỗi dòng một ảnh:</small>
                <textarea rows="4" value={productModal.data.imageText || ""} onChange={(event) => updateProductField("imageText", event.target.value)} placeholder="/image/catalog/MR-xxx/front.webp&#10;/image/catalog/MR-xxx/back.webp" style={{ width: "100%", boxSizing: "border-box", marginTop: "8px", padding: "9px", border: "1px solid #D8CEC1", borderRadius: "4px" }} />
              </section>

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

