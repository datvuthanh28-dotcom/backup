import { useState } from "react";
import { useStore } from "../../context/StoreContext";
import { productsAPI } from "../../services/api";
import useDocumentTitle from "../../hooks/useDocumentTitle";

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
  const { products, updateProductStock, adjustStock, getProductStock } = useStore();

  const [categoryFilter, setCategoryFilter] = useState("all");
  const [stockStatusFilter, setStockStatusFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [editProduct, setEditProduct] = useState(null);
  const [newStockValue, setNewStockValue] = useState("");
  const [stockNote, setStockNote] = useState("");
  const [toastMessage, setToastMessage] = useState("");
  const [loading, setLoading] = useState(false);

  // Movements modal
  const [selectedProductMovements, setSelectedProductMovements] = useState(null);
  const [movementsList, setMovementsList] = useState([]);
  const [loadingMovements, setLoadingMovements] = useState(false);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(""), 4000);
  };

  const filteredProducts = products.filter((product) => {
    const currentStock = getProductStock(product.id);
    const matchesCategory = categoryFilter === "all" || product.category === categoryFilter;

    let matchesStock = true;
    if (stockStatusFilter === "out_of_stock") matchesStock = currentStock === 0;
    else if (stockStatusFilter === "low_stock") matchesStock = currentStock > 0 && currentStock <= 5;
    else if (stockStatusFilter === "in_stock") matchesStock = currentStock > 5;

    const term = searchTerm.trim().toLowerCase();
    const matchesSearch = !term || product.name.toLowerCase().includes(term) || String(product.id) === term;

    return matchesCategory && matchesStock && matchesSearch;
  });

  const handleOpenEdit = (product) => {
    setEditProduct(product);
    setNewStockValue(String(getProductStock(product.id)));
    setStockNote("Nhập thêm hàng kiểm kê");
  };

  const handleSaveStock = async (e) => {
    e.preventDefault();
    if (!editProduct) return;
    const stockNum = parseInt(newStockValue, 10);
    if (isNaN(stockNum) || stockNum < 0) {
      alert("Số lượng tồn kho phải là số nguyên dương (>= 0).");
      return;
    }

    setLoading(true);
    const res = await updateProductStock(editProduct.id, stockNum, stockNote);
    setLoading(false);

    if (res.success) {
      showToast(`Đã cập nhật tồn kho "${editProduct.name}" thành ${stockNum} sản phẩm.`);
      setEditProduct(null);
    } else {
      alert(res.error || "Không thể cập nhật tồn kho.");
    }
  };

  const handleQuickAdjust = async (productId, delta, productName) => {
    setLoading(true);
    const res = await adjustStock(productId, delta);
    setLoading(false);
    if (res.success) {
      showToast(`Đã điều chỉnh tồn kho ${productName} (${delta > 0 ? `+${delta}` : delta}).`);
    } else {
      alert(res.error || "Lỗi điều chỉnh tồn kho.");
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
    <div>
      <div style={{ marginBottom: "25px" }}>
        <h1
          style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontSize: "30px",
            color: "#2B211C",
            margin: "0 0 6px",
          }}
        >
          QUẢN LÝ TỒN KHO & BIẾN ĐỘNG SẢN PHẨM
        </h1>
        <p style={{ color: "#6B5A4B", fontSize: "14px", margin: 0 }}>
          Theo dõi mức tồn kho thực tế, ghi nhận điều chỉnh và kiểm toán lịch sử xuất/nhập kho Maison Rue.
        </p>
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
          <span>✓ {toastMessage}</span>
          <button
            onClick={() => setToastMessage("")}
            style={{ background: "none", border: "none", color: "#2E8B57", cursor: "pointer", fontSize: "16px" }}
          >
            ×
          </button>
        </div>
      )}

      {/* Filter and Search controls */}
      <div
        style={{
          backgroundColor: "#FFFFFF",
          border: "1px solid #D8CEC1",
          borderRadius: "8px",
          padding: "18px 24px",
          marginBottom: "25px",
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "space-between",
          gap: "15px",
          alignItems: "center",
        }}
      >
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
          {/* Category Filter */}
          <div style={{ display: "flex", gap: "6px" }}>
            {[
              { id: "all", label: "Tất cả DM" },
              { id: "men", label: "Nam" },
              { id: "women", label: "Nữ" },
              { id: "accessories", label: "Phụ kiện" },
            ].map((cat) => (
              <button
                key={cat.id}
                onClick={() => setCategoryFilter(cat.id)}
                style={{
                  padding: "6px 12px",
                  borderRadius: "4px",
                  border: "1px solid",
                  borderColor: categoryFilter === cat.id ? "#2B211C" : "#E8E1D6",
                  backgroundColor: categoryFilter === cat.id ? "#2B211C" : "#FAF6F0",
                  color: categoryFilter === cat.id ? "#F8F5F0" : "#2B211C",
                  fontSize: "12px",
                  fontWeight: "600",
                  cursor: "pointer",
                }}
              >
                {cat.label}
              </button>
            ))}
          </div>

          <div style={{ width: "1px", height: "24px", backgroundColor: "#D8CEC1", margin: "0 5px" }} />

          {/* Stock Status Filter */}
          <div style={{ display: "flex", gap: "6px" }}>
            {[
              { id: "all", label: "Mọi trạng thái" },
              { id: "low_stock", label: "⚠️ Sắp hết (≤ 5)" },
              { id: "out_of_stock", label: "❌ Hết hàng (0)" },
              { id: "in_stock", label: "✓ Đủ hàng (> 5)" },
            ].map((st) => (
              <button
                key={st.id}
                onClick={() => setStockStatusFilter(st.id)}
                style={{
                  padding: "6px 12px",
                  borderRadius: "4px",
                  border: "1px solid",
                  borderColor: stockStatusFilter === st.id ? "#4E342E" : "#E8E1D6",
                  backgroundColor: stockStatusFilter === st.id ? "#4E342E" : "#FFF",
                  color: stockStatusFilter === st.id ? "#F8F5F0" : "#4E342E",
                  fontSize: "12px",
                  fontWeight: "600",
                  cursor: "pointer",
                }}
              >
                {st.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ width: "260px" }}>
          <input
            type="text"
            placeholder="Tìm theo tên sản phẩm..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: "100%",
              padding: "8px 14px",
              borderRadius: "4px",
              border: "1px solid #D8CEC1",
              fontSize: "13px",
              outline: "none",
            }}
          />
        </div>
      </div>

      {/* Inventory Table */}
      <div
        style={{
          backgroundColor: "#FFFFFF",
          border: "1px solid #D8CEC1",
          borderRadius: "8px",
          overflow: "hidden",
          boxShadow: "0 2px 10px rgba(0,0,0,0.03)",
        }}
      >
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "13.5px" }}>
            <thead>
              <tr style={{ backgroundColor: "#FAF6F0", borderBottom: "1px solid #D8CEC1", color: "#4E342E" }}>
                <th style={{ padding: "14px 18px", fontWeight: "600", width: "80px" }}>Hình Ảnh</th>
                <th style={{ padding: "14px 18px", fontWeight: "600" }}>Tên Sản Phẩm</th>
                <th style={{ padding: "14px 18px", fontWeight: "600" }}>Danh Mục</th>
                <th style={{ padding: "14px 18px", fontWeight: "600" }}>Đơn Giá</th>
                <th style={{ padding: "14px 18px", fontWeight: "600" }}>Tồn Kho</th>
                <th style={{ padding: "14px 18px", fontWeight: "600" }}>Tình Trạng</th>
                <th style={{ padding: "14px 18px", fontWeight: "600", textAlign: "right" }}>Điều Chỉnh & Lịch Sử</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan="7" style={{ padding: "40px", textAlign: "center", color: "#6B5A4B" }}>
                    Không có sản phẩm nào phù hợp với điều kiện tìm kiếm.
                  </td>
                </tr>
              ) : (
                filteredProducts.map((p, idx) => {
                  const stock = getProductStock(p.id);
                  const isOut = stock === 0;
                  const isLow = stock > 0 && stock <= 5;
                  const firstImg = p.images ? p.images[0] : "";

                  return (
                    <tr
                      key={p.id}
                      style={{
                        borderBottom: "1px solid #F0EAE1",
                        backgroundColor: idx % 2 === 0 ? "#FFFFFF" : "#FCFBF9",
                      }}
                    >
                      <td style={{ padding: "12px 18px" }}>
                        {firstImg && (
                          <img
                            src={`/${firstImg}`}
                            alt={p.name}
                            style={{ width: "50px", height: "50px", objectFit: "cover", borderRadius: "4px" }}
                          />
                        )}
                      </td>

                      <td style={{ padding: "12px 18px" }}>
                        <strong style={{ color: "#2B211C" }}>{p.name}</strong>
                        <div style={{ fontSize: "12px", color: "#8A7350" }}>
                          Màu: {(p.colors || []).join(", ")}
                        </div>
                      </td>

                      <td style={{ padding: "12px 18px", textTransform: "capitalize", color: "#6B5A4B" }}>
                        {p.category} ({p.gender})
                      </td>

                      <td style={{ padding: "12px 18px", fontWeight: "600", color: "#B89B5E" }}>
                        {formatPrice(p.price)}
                      </td>

                      <td style={{ padding: "12px 18px" }}>
                        <span
                          style={{
                            fontSize: "16px",
                            fontWeight: "700",
                            color: isOut ? "#D9534F" : isLow ? "#B8860B" : "#2B211C",
                          }}
                        >
                          {stock}
                        </span>{" "}
                        <span style={{ fontSize: "12px", color: "#8A7350" }}>cái</span>
                      </td>

                      <td style={{ padding: "12px 18px" }}>
                        {isOut ? (
                          <span
                            style={{
                              display: "inline-block",
                              padding: "4px 10px",
                              borderRadius: "12px",
                              fontSize: "11.5px",
                              fontWeight: "700",
                              backgroundColor: "#FFF0F0",
                              color: "#D9534F",
                              border: "1px solid #F5C6CB",
                            }}
                          >
                            ● HẾT HÀNG
                          </span>
                        ) : isLow ? (
                          <span
                            style={{
                              display: "inline-block",
                              padding: "4px 10px",
                              borderRadius: "12px",
                              fontSize: "11.5px",
                              fontWeight: "700",
                              backgroundColor: "#FFF8DC",
                              color: "#B8860B",
                              border: "1px solid #FFE4B5",
                            }}
                          >
                            ● SẮP HẾT HÀNG (≤ 5)
                          </span>
                        ) : (
                          <span
                            style={{
                              display: "inline-block",
                              padding: "4px 10px",
                              borderRadius: "12px",
                              fontSize: "11.5px",
                              fontWeight: "600",
                              backgroundColor: "#F0FFF0",
                              color: "#2E8B57",
                              border: "1px solid #C3E6CB",
                            }}
                          >
                            ● ĐỦ HÀNG
                          </span>
                        )}
                      </td>

                      <td style={{ padding: "12px 18px", textAlign: "right" }}>
                        <div style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                          <button
                            onClick={() => handleQuickAdjust(p.id, -1, p.name)}
                            disabled={stock <= 0 || loading}
                            title="Giảm 1"
                            style={{
                              width: "28px",
                              height: "28px",
                              borderRadius: "4px",
                              border: "1px solid #D8CEC1",
                              backgroundColor: "#FAF6F0",
                              cursor: stock <= 0 ? "not-allowed" : "pointer",
                              opacity: stock <= 0 ? 0.4 : 1,
                              fontWeight: "700",
                            }}
                          >
                            -
                          </button>

                          <button
                            onClick={() => handleQuickAdjust(p.id, 1, p.name)}
                            disabled={loading}
                            title="Thêm 1"
                            style={{
                              width: "28px",
                              height: "28px",
                              borderRadius: "4px",
                              border: "1px solid #D8CEC1",
                              backgroundColor: "#FAF6F0",
                              cursor: "pointer",
                              fontWeight: "700",
                            }}
                          >
                            +
                          </button>

                          <button
                            onClick={() => handleOpenEdit(p)}
                            style={{
                              padding: "5px 12px",
                              backgroundColor: "#2B211C",
                              color: "#F8F5F0",
                              border: "none",
                              borderRadius: "4px",
                              fontSize: "12px",
                              fontWeight: "600",
                              cursor: "pointer",
                            }}
                          >
                            Nhập kho
                          </button>

                          <button
                            onClick={() => handleViewMovements(p)}
                            style={{
                              padding: "5px 10px",
                              backgroundColor: "#FAF6F0",
                              color: "#4E342E",
                              border: "1px solid #D8CEC1",
                              borderRadius: "4px",
                              fontSize: "12px",
                              cursor: "pointer",
                            }}
                            title="Xem lịch sử xuất nhập kho"
                          >
                            <i className="fas fa-history"></i>
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
              Cập Nhật Số Lượng Tồn Kho
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
                  Mã SP: {editProduct.id} | Giá: {formatPrice(editProduct.price)}
                </div>
              </div>
            </div>

            <form onSubmit={handleSaveStock}>
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
              </div>

              <div className="form-group" style={{ marginTop: "12px" }}>
                <label style={{ fontSize: "13px", fontWeight: "600" }}>Ghi chú điều chỉnh / Lý do nhập kho</label>
                <input
                  type="text"
                  value={stockNote}
                  onChange={(e) => setStockNote(e.target.value)}
                  placeholder="Ví dụ: Nhập bổ sung 10 áo; Hàng lỗi nhà sản xuất..."
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
                  disabled={loading}
                  className="btn-primary"
                  style={{ padding: "10px 22px", fontSize: "13px" }}
                >
                  {loading ? "Đang lưu..." : "Lưu Tồn Kho"}
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
                  Sổ Kiểm Toán Tồn Kho (Inventory Movements)
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
