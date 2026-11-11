import { useState, useEffect, useCallback, useRef } from "react";
import { employeeAPI } from "../../services/api";
import useDocumentTitle from "../../hooks/useDocumentTitle";
import AdminPagination from "../../components/AdminPagination";

const PAGE_SIZE = 10;

function formatDate(isoStr) {
  if (!isoStr) return "";
  const d = new Date(isoStr);
  return d.toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export default function AdminEmployees() {
  useDocumentTitle("Admin - Quản Lý Nhân Viên");

  const [staffList, setStaffList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingStaff, setEditingStaff] = useState(null);
  const [toastMessage, setToastMessage] = useState("");
  const [page, setPage] = useState(1);
  const toastTimerRef = useRef(null);

  // Form states
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
  });
  const [formErrors, setFormErrors] = useState({});

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

  const fetchStaff = useCallback(async () => {
    try {
      setLoading(true);
      const res = await employeeAPI.getAll();
      if (res.success && Array.isArray(res.staff)) {
        setStaffList(res.staff);
      }
    } catch (err) {
      console.error("[AdminEmployees] Failed to fetch staff:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStaff();
  }, [fetchStaff]);

  const filteredStaff = staffList.filter((s) => {
    const term = searchTerm.trim().toLowerCase();
    return (
      !term ||
      (s.name && s.name.toLowerCase().includes(term)) ||
      (s.email && s.email.toLowerCase().includes(term)) ||
      (s.phone && s.phone.includes(term))
    );
  });
  const totalPages = Math.max(1, Math.ceil(filteredStaff.length / PAGE_SIZE));
  const pagedStaff = filteredStaff.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => setPage(1), [searchTerm]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  const handleOpenAdd = () => {
    setFormData({ name: "", email: "", phone: "", password: "staff" + Math.floor(100 + Math.random() * 900) });
    setFormErrors({});
    setShowAddModal(true);
  };

  const handleOpenEdit = (staff) => {
    setEditingStaff(staff);
    setFormData({
      name: staff.name,
      email: staff.email,
      phone: staff.phone || "",
      password: "",
    });
    setFormErrors({});
  };

  const handleSaveAdd = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!formData.name.trim()) errs.name = "Họ và tên là bắt buộc.";
    if (!formData.email.trim()) errs.email = "Email là bắt buộc.";
    if (!formData.phone.trim()) errs.phone = "Số điện thoại là bắt buộc.";

    setFormErrors(errs);
    if (Object.keys(errs).length > 0) return;

    try {
      setSubmitting(true);
      const res = await employeeAPI.create({
        name: formData.name.trim(),
        email: formData.email.trim(),
        phone: formData.phone.trim(),
        password: formData.password || "staff123",
      });

      if (res.success) {
        showToast(res.message || `Đã tạo thành công tài khoản nhân viên cho ${formData.name}.`);
        setShowAddModal(false);
        await fetchStaff();
      }
    } catch (err) {
      setFormErrors({ form: err.message || "Không thể tạo tài khoản nhân viên." });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editingStaff) return;
    const errs = {};
    if (!formData.name.trim()) errs.name = "Họ và tên là bắt buộc.";
    if (!formData.phone.trim()) errs.phone = "Số điện thoại là bắt buộc.";
    if (formData.password?.trim() && formData.password.trim().length < 6) {
      errs.password = "Mật khẩu mới phải có ít nhất 6 ký tự.";
    }

    setFormErrors(errs);
    if (Object.keys(errs).length > 0) return;

    try {
      setSubmitting(true);
      const payload = {
        name: formData.name.trim(),
        phone: formData.phone.trim(),
      };
      if (formData.password?.trim()) {
        payload.password = formData.password.trim();
      }
      const res = await employeeAPI.update(editingStaff.id, payload);

      if (res.success) {
        showToast(res.message || `Đã cập nhật thông tin nhân viên ${formData.name}.`);
        setEditingStaff(null);
        await fetchStaff();
      }
    } catch (err) {
      setFormErrors({ form: err.message || "Lỗi cập nhật nhân viên." });
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = async (staff) => {
    const isActive = staff.is_active !== false && staff.active !== false;
    const action = isActive ? "vô hiệu hóa" : "kích hoạt lại";
    if (window.confirm(`Bạn có chắc chắn muốn ${action} tài khoản của ${staff.name} không?`)) {
      try {
        const res = await employeeAPI.toggleStatus(staff.id);
        showToast(res.message || `Đã cập nhật trạng thái tài khoản ${staff.name}.`);
        await fetchStaff();
      } catch (err) {
        alert("Lỗi thay đổi trạng thái: " + err.message);
      }
    }
  };

  const activeCount = staffList.filter((s) => s.is_active !== false && s.active !== false).length;
  const inactiveCount = staffList.filter((s) => s.is_active === false || s.active === false).length;

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "25px",
          flexWrap: "wrap",
          gap: "15px",
        }}
      >
        <div>
          <h1
            style={{
              fontFamily: "'Cormorant Garamond', serif",
              fontSize: "32px",
              color: "#2B211C",
              margin: "0 0 6px",
            }}
          >
            QUẢN LÝ TÀI KHOẢN NHÂN VIÊN
          </h1>
          <p style={{ color: "#6B5A4B", fontSize: "14px", margin: 0 }}>
            Phân quyền tài khoản Staff, cấp quyền xử lý đơn hàng và kiểm soát trạng thái kích hoạt nhân sự (MS SQL Server).
          </p>
        </div>

        <button
          onClick={handleOpenAdd}
          className="btn-primary"
          style={{ padding: "12px 24px", fontSize: "13px", display: "flex", alignItems: "center", gap: "8px" }}
        >
          <i className="fas fa-user-plus"></i> Thêm Nhân Viên Mới
        </button>
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

      {/* Staff Stats Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "15px", marginBottom: "25px" }}>
        <div style={{ backgroundColor: "#FFF", padding: "16px 20px", borderRadius: "8px", border: "1px solid #D8CEC1" }}>
          <span style={{ fontSize: "12px", color: "#6B5A4B", textTransform: "uppercase" }}>Tổng số nhân viên</span>
          <div style={{ fontSize: "24px", fontWeight: "700", color: "#2B211C" }}>{staffList.length}</div>
        </div>

        <div style={{ backgroundColor: "#FFF", padding: "16px 20px", borderRadius: "8px", border: "1px solid #D8CEC1" }}>
          <span style={{ fontSize: "12px", color: "#2E8B57", textTransform: "uppercase" }}>Đang hoạt động</span>
          <div style={{ fontSize: "24px", fontWeight: "700", color: "#2E8B57" }}>
            {activeCount}
          </div>
        </div>

        <div style={{ backgroundColor: "#FFF", padding: "16px 20px", borderRadius: "8px", border: "1px solid #D8CEC1" }}>
          <span style={{ fontSize: "12px", color: "#D9534F", textTransform: "uppercase" }}>Bị vô hiệu hóa</span>
          <div style={{ fontSize: "24px", fontWeight: "700", color: "#D9534F" }}>
            {inactiveCount}
          </div>
        </div>
      </div>

      {/* Search & Staff Table */}
      <div
        style={{
          backgroundColor: "#FFFFFF",
          border: "1px solid #D8CEC1",
          borderRadius: "8px",
          overflow: "hidden",
          boxShadow: "0 2px 10px rgba(0,0,0,0.03)",
        }}
      >
        <div style={{ padding: "16px 24px", borderBottom: "1px solid #E8E1D6", backgroundColor: "#FAF6F0" }}>
          <input
            type="text"
            placeholder="Tìm theo tên nhân viên, email, số điện thoại..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: "100%",
              maxWidth: "350px",
              padding: "9px 14px",
              borderRadius: "4px",
              border: "1px solid #D8CEC1",
              fontSize: "13px",
              outline: "none",
            }}
          />
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "13.5px" }}>
            <thead>
              <tr style={{ backgroundColor: "#FAF6F0", borderBottom: "1px solid #D8CEC1", color: "#4E342E" }}>
                <th style={{ padding: "14px 20px", fontWeight: "600" }}>Nhân Viên</th>
                <th style={{ padding: "14px 20px", fontWeight: "600" }}>Thông Tin Liên Hệ</th>
                <th style={{ padding: "14px 20px", fontWeight: "600" }}>Vai Trò Hệ Thống</th>
                <th style={{ padding: "14px 20px", fontWeight: "600" }}>Ngày Cấp Quyền</th>
                <th style={{ padding: "14px 20px", fontWeight: "600" }}>Trạng Thái</th>
                <th style={{ padding: "14px 20px", fontWeight: "600", textAlign: "right" }}>Thao Tác</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="6" style={{ padding: "40px", textAlign: "center", color: "#6B5A4B" }}>
                    <i className="fas fa-spinner fa-spin" style={{ marginRight: "8px" }}></i> Đang tải dữ liệu nhân sự...
                  </td>
                </tr>
              ) : filteredStaff.length === 0 ? (
                <tr>
                  <td colSpan="6" style={{ padding: "40px", textAlign: "center", color: "#6B5A4B" }}>
                    Không tìm thấy nhân viên nào phù hợp.
                  </td>
                </tr>
              ) : (
                pagedStaff.map((staff, idx) => {
                  const isActive = staff.is_active !== false && staff.active !== false;

                  return (
                    <tr
                      key={staff.id}
                      style={{
                        borderBottom: "1px solid #F0EAE1",
                        backgroundColor: idx % 2 === 0 ? "#FFFFFF" : "#FCFBF9",
                        opacity: isActive ? 1 : 0.65,
                      }}
                    >
                      <td style={{ padding: "14px 20px" }}>
                        <div style={{ fontWeight: "600", color: "#2B211C" }}>{staff.name}</div>
                        <div style={{ fontSize: "11px", color: "#8A7350" }}>ID: {staff.id}</div>
                      </td>

                      <td style={{ padding: "14px 20px" }}>
                        <div>{staff.email}</div>
                        <div style={{ fontSize: "12px", color: "#6B5A4B" }}>{staff.phone || "Chưa cập nhật"}</div>
                      </td>

                      <td style={{ padding: "14px 20px" }}>
                        <span
                          style={{
                            display: "inline-block",
                            padding: "3px 10px",
                            borderRadius: "4px",
                            fontSize: "11.5px",
                            fontWeight: "600",
                            backgroundColor: "#4E342E",
                            color: "#F8F5F0",
                            textTransform: "uppercase",
                          }}
                        >
                          Staff (Vận hành)
                        </span>
                      </td>

                      <td style={{ padding: "14px 20px", color: "#8A7350" }}>
                        {formatDate(staff.created_at || staff.createdAt)}
                      </td>

                      <td style={{ padding: "14px 20px" }}>
                        {isActive ? (
                          <span
                            style={{
                              display: "inline-block",
                              padding: "4px 12px",
                              borderRadius: "15px",
                              fontSize: "11.5px",
                              fontWeight: "600",
                              backgroundColor: "#F0FFF0",
                              color: "#2E8B57",
                              border: "1px solid #C3E6CB",
                            }}
                          >
                            ● Đang hoạt động
                          </span>
                        ) : (
                          <span
                            style={{
                              display: "inline-block",
                              padding: "4px 12px",
                              borderRadius: "15px",
                              fontSize: "11.5px",
                              fontWeight: "600",
                              backgroundColor: "#FFF0F0",
                              color: "#D9534F",
                              border: "1px solid #F5C6CB",
                            }}
                          >
                            ● Đã khóa tài khoản
                          </span>
                        )}
                      </td>

                      <td style={{ padding: "14px 20px", textAlign: "right" }}>
                        <div style={{ display: "inline-flex", gap: "8px" }}>
                          <button
                            onClick={() => handleOpenEdit(staff)}
                            style={{
                              padding: "6px 12px",
                              backgroundColor: "#FAF6F0",
                              border: "1px solid #D8CEC1",
                              borderRadius: "4px",
                              fontSize: "12px",
                              cursor: "pointer",
                              color: "#2B211C",
                              fontWeight: "600",
                            }}
                          >
                            Sửa
                          </button>

                          <button
                            onClick={() => handleToggleStatus(staff)}
                            style={{
                              padding: "6px 14px",
                              borderRadius: "4px",
                              fontSize: "12px",
                              fontWeight: "600",
                              cursor: "pointer",
                              border: "none",
                              backgroundColor: isActive ? "#FFF0F0" : "#F0FFF0",
                              color: isActive ? "#D9534F" : "#2E8B57",
                            }}
                          >
                            {isActive ? "Vô hiệu hóa" : "Kích hoạt"}
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
        <AdminPagination page={page} total={filteredStaff.length} pageSize={PAGE_SIZE} onPageChange={setPage} itemLabel="nhân viên" />
      </div>

      {/* Add Staff Modal */}
      {showAddModal && (
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
              maxWidth: "480px",
              width: "100%",
              boxShadow: "0 10px 40px rgba(0,0,0,0.2)",
            }}
          >
            <h3 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "24px", color: "#2B211C", marginTop: 0 }}>
              Thêm Nhân Viên Vận Hành Mới
            </h3>

            {formErrors.form && (
              <div style={{ backgroundColor: "#FFF0F0", color: "#D9534F", padding: "10px", borderRadius: "4px", fontSize: "13px", marginBottom: "15px" }}>
                {formErrors.form}
              </div>
            )}

            <form onSubmit={handleSaveAdd}>
              <div className="form-group">
                <label style={{ fontSize: "13px", fontWeight: "600" }}>Họ và tên nhân viên *</label>
                <input
                  type="text"
                  placeholder="Ví dụ: Hoàng Minh Trí"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  disabled={submitting}
                />
                {formErrors.name && <span className="error">{formErrors.name}</span>}
              </div>

              <div className="form-group">
                <label style={{ fontSize: "13px", fontWeight: "600" }}>Email công việc *</label>
                <input
                  type="email"
                  placeholder="staff@gmail.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  disabled={submitting}
                />
                {formErrors.email && <span className="error">{formErrors.email}</span>}
              </div>

              <div className="form-group">
                <label style={{ fontSize: "13px", fontWeight: "600" }}>Số điện thoại liên hệ *</label>
                <input
                  type="tel"
                  placeholder="0918..."
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  disabled={submitting}
                />
                {formErrors.phone && <span className="error">{formErrors.phone}</span>}
              </div>

              <div className="form-group">
                <label style={{ fontSize: "13px", fontWeight: "600" }}>Mật khẩu khởi tạo</label>
                <input
                  type="text"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  disabled={submitting}
                />
              </div>

              <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "25px" }}>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="btn-secondary"
                  style={{ width: "auto", margin: 0, padding: "10px 18px", fontSize: "13px" }}
                  disabled={submitting}
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  style={{ padding: "10px 22px", fontSize: "13px" }}
                  disabled={submitting}
                >
                  {submitting ? "Đang tạo..." : "Tạo Tài Khoản Staff"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Staff Modal */}
      {editingStaff && (
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
              maxWidth: "480px",
              width: "100%",
              boxShadow: "0 10px 40px rgba(0,0,0,0.2)",
            }}
          >
            <h3 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "24px", color: "#2B211C", marginTop: 0 }}>
              Cập Nhật Thông Tin Nhân Viên
            </h3>

            {formErrors.form && (
              <div style={{ backgroundColor: "#FFF0F0", color: "#D9534F", padding: "10px", borderRadius: "4px", fontSize: "13px", marginBottom: "15px" }}>
                {formErrors.form}
              </div>
            )}

            <div style={{ backgroundColor: "#FAF6F0", padding: "10px 14px", borderRadius: "4px", marginBottom: "15px", fontSize: "13px" }}>
              Email định danh: <strong>{editingStaff.email}</strong>
            </div>

            <form onSubmit={handleSaveEdit}>
              <div className="form-group">
                <label style={{ fontSize: "13px", fontWeight: "600" }}>Họ và tên nhân viên *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  disabled={submitting}
                />
                {formErrors.name && <span className="error">{formErrors.name}</span>}
              </div>

              <div className="form-group">
                <label style={{ fontSize: "13px", fontWeight: "600" }}>Số điện thoại liên hệ *</label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  disabled={submitting}
                />
                {formErrors.phone && <span className="error">{formErrors.phone}</span>}
              </div>

              <div className="form-group">
                <label style={{ fontSize: "13px", fontWeight: "600" }}>
                  Mật khẩu mới <span style={{ fontWeight: "normal", color: "#888", fontSize: "12px" }}>(để trống nếu giữ nguyên)</span>
                </label>
                <input
                  type="password"
                  placeholder="Nhập mật khẩu mới nếu muốn đổi (tối thiểu 6 ký tự)"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  disabled={submitting}
                />
                {formErrors.password && <span className="error">{formErrors.password}</span>}
              </div>

              <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "25px" }}>
                <button
                  type="button"
                  onClick={() => setEditingStaff(null)}
                  className="btn-secondary"
                  style={{ width: "auto", margin: 0, padding: "10px 18px", fontSize: "13px" }}
                  disabled={submitting}
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  style={{ padding: "10px 22px", fontSize: "13px" }}
                  disabled={submitting}
                >
                  {submitting ? "Đang lưu..." : "Lưu Thông Tin"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
