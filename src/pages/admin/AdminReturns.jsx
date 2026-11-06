import { useState, useEffect, useMemo } from "react";
import { useAuth } from "../../context/AuthContext";
import useDocumentTitle from "../../hooks/useDocumentTitle";
import {
  getReturnRequests,
  approveReturnRequest,
  rejectReturnRequest,
  updateReturnRequest,
  RETURN_UPDATE_EVENT,
} from "../../services/returnService";

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

const STATUS_BADGES = {
  PENDING: { label: "Chờ xét duyệt", color: "#B8860B", bg: "#FFF8DC", border: "#F0E68C" },
  APPROVED: { label: "Đã chấp thuận (Hoàn tiền)", color: "#1B5E20", bg: "#E8F5E9", border: "#C8E6C9" },
  REJECTED: { label: "Đã từ chối", color: "#C62828", bg: "#FFEBEE", border: "#FFCDD2" },
};

export default function AdminReturns({ isStaffView = false }) {
  const { role } = useAuth();
  const isAdmin = !isStaffView && role === "admin";

  useDocumentTitle(isAdmin ? "Admin — Quản Lý Đổi Trả & Hoàn Tiền" : "Staff — Kiểm Soát Đổi Trả");

  const [returnList, setReturnList] = useState([]);
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [searchTerm, setSearchTerm] = useState("");
  const [zoomedImage, setZoomedImage] = useState(null);
  const [toastMessage, setToastMessage] = useState("");
  const [processingId, setProcessingId] = useState(null);

  // Ghi chú tạm thời cho từng dòng
  const [notesState, setNotesState] = useState({});

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(""), 5000);
  };

  const loadRequests = () => {
    const data = getReturnRequests();
    setReturnList(data);
    // Khởi tạo notes state
    const initialNotes = {};
    data.forEach((r) => {
      initialNotes[r.id] = {
        adminNote: r.adminNote || "",
        staffNote: r.staffNote || "",
      };
    });
    setNotesState(initialNotes);
  };

  useEffect(() => {
    loadRequests();

    const handleUpdate = () => {
      loadRequests();
    };

    window.addEventListener(RETURN_UPDATE_EVENT, handleUpdate);
    window.addEventListener("storage", handleUpdate);
    return () => {
      window.removeEventListener(RETURN_UPDATE_EVENT, handleUpdate);
      window.removeEventListener("storage", handleUpdate);
    };
  }, []);

  const counts = useMemo(() => {
    return {
      all: returnList.length,
      pending: returnList.filter((r) => r.status === "PENDING").length,
      approved: returnList.filter((r) => r.status === "APPROVED").length,
      rejected: returnList.filter((r) => r.status === "REJECTED").length,
    };
  }, [returnList]);

  const filteredList = useMemo(() => {
    return returnList.filter((r) => {
      const matchStatus = filterStatus === "ALL" || r.status === filterStatus;
      const term = searchTerm.trim().toLowerCase();
      const matchSearch =
        !term ||
        r.id.toLowerCase().includes(term) ||
        r.customerEmail.toLowerCase().includes(term) ||
        (r.customerName && r.customerName.toLowerCase().includes(term)) ||
        (r.item && r.item.toLowerCase().includes(term)) ||
        (r.reason && r.reason.toLowerCase().includes(term));
      return matchStatus && matchSearch;
    });
  }, [returnList, filterStatus, searchTerm]);

  const handleNoteChange = (id, field, value) => {
    setNotesState((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        [field]: value,
      },
    }));
  };

  // ADMIN: Phê duyệt hoàn tiền
  const handleApprove = async (req) => {
    const adminNote = notesState[req.id]?.adminNote || "";
    if (!window.confirm(`Xác nhận CHẤP NHẬN hoàn tiền / đổi trả cho yêu cầu #${req.id}?\n\nHệ thống sẽ gửi email thông báo tự động tới khách hàng (${req.customerEmail}).`)) {
      return;
    }

    try {
      setProcessingId(req.id);
      const res = await approveReturnRequest({ id: req.id, adminNote });
      loadRequests();
      if (res.emailResult?.success) {
        showToast(`✅ Đã phê duyệt yêu cầu #${req.id} và gửi email thông báo thành công tới ${req.customerEmail}!`);
      } else {
        showToast(`✅ Đã duyệt yêu cầu #${req.id}. (EmailJS chưa gửi được: kiểm tra API Key)`);
      }
    } catch (err) {
      alert("Lỗi khi phê duyệt: " + err.message);
    } finally {
      setProcessingId(null);
    }
  };

  // ADMIN: Từ chối yêu cầu
  const handleReject = async (req) => {
    const adminNote = notesState[req.id]?.adminNote || "";
    if (!adminNote.trim()) {
      alert("Vui lòng nhập lý do từ chối vào ô 'Ghi chú phản hồi của Admin' trước khi bấm Từ chối.");
      return;
    }

    if (!window.confirm(`Bạn có chắc chắn muốn TỪ CHỐI yêu cầu #${req.id}?`)) {
      return;
    }

    try {
      setProcessingId(req.id);
      rejectReturnRequest({ id: req.id, adminNote });
      loadRequests();
      showToast(`❌ Đã cập nhật trạng thái Từ chối cho yêu cầu #${req.id}.`);
    } catch (err) {
      alert("Lỗi: " + err.message);
    } finally {
      setProcessingId(null);
    }
  };

  // STAFF: Lưu ghi chú xác minh nội bộ
  const handleSaveStaffNote = (req) => {
    const staffNote = notesState[req.id]?.staffNote || "";
    try {
      updateReturnRequest(req.id, { staffNote });
      loadRequests();
      showToast(`💾 Đã lưu ghi chú xác minh cho yêu cầu #${req.id}.`);
    } catch (err) {
      alert("Lỗi: " + err.message);
    }
  };

  return (
    <div style={{ padding: "10px 0 40px" }}>
      {/* Toast Notification */}
      {toastMessage && (
        <div
          style={{
            position: "fixed",
            top: "24px",
            right: "24px",
            backgroundColor: "#2B211C",
            color: "#FFF",
            padding: "14px 22px",
            borderRadius: "6px",
            boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
            zIndex: 9999,
            fontSize: "13.5px",
            display: "flex",
            alignItems: "center",
            gap: "10px",
            borderLeft: "4px solid #B89B5E",
          }}
        >
          <span>{toastMessage}</span>
          <button
            onClick={() => setToastMessage("")}
            style={{ background: "transparent", border: "none", color: "#FFF", cursor: "pointer", fontSize: "16px" }}
          >
            ×
          </button>
        </div>
      )}

      {/* Header Bar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: "25px",
          flexWrap: "wrap",
          gap: "15px",
        }}
      >
        <div>
          <h1
            style={{
              fontFamily: "'Cormorant Garamond', serif",
              fontSize: "30px",
              color: "#2B211C",
              margin: "0 0 6px",
              letterSpacing: "0.5px",
            }}
          >
            {isAdmin ? "QUẢN LÝ ĐỔI TRẢ & HOÀN TIỀN" : "KIỂM SOÁT ĐỔI TRẢ VẬN HÀNH"}
          </h1>
          <p style={{ color: "#6B5A4B", fontSize: "13.5px", margin: 0 }}>
            {isAdmin
              ? "Tiếp nhận yêu cầu từ trợ lý Rue, kiểm tra ảnh minh chứng lỗi sản phẩm và duyệt hoàn tiền qua EmailJS."
              : "Bộ phận vận hành & kho vận kiểm tra ảnh thực tế, đối soát tình trạng hàng và ghi chú xác minh."}
          </p>
        </div>

        {/* Quick Stat Counter */}
        <div style={{ display: "flex", gap: "10px" }}>
          <div
            style={{
              backgroundColor: "#FFF8DC",
              border: "1px solid #F0E68C",
              borderRadius: "6px",
              padding: "8px 16px",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: "11px", color: "#B8860B", textTransform: "uppercase", fontWeight: "700" }}>
              Chờ Xét Duyệt
            </div>
            <div style={{ fontSize: "20px", fontWeight: "bold", color: "#B8860B" }}>{counts.pending}</div>
          </div>
          <div
            style={{
              backgroundColor: "#E8F5E9",
              border: "1px solid #C8E6C9",
              borderRadius: "6px",
              padding: "8px 16px",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: "11px", color: "#1B5E20", textTransform: "uppercase", fontWeight: "700" }}>
              Đã Chấp Thuận
            </div>
            <div style={{ fontSize: "20px", fontWeight: "bold", color: "#1B5E20" }}>{counts.approved}</div>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div
        style={{
          backgroundColor: "#FFF",
          border: "1px solid #D8CEC1",
          borderRadius: "8px",
          padding: "16px 20px",
          marginBottom: "20px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "15px",
        }}
      >
        {/* Status Filter Tabs */}
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
          {[
            { key: "ALL", label: `Tất cả (${counts.all})` },
            { key: "PENDING", label: `Chờ duyệt (${counts.pending})` },
            { key: "APPROVED", label: `Đã duyệt (${counts.approved})` },
            { key: "REJECTED", label: `Đã từ chối (${counts.rejected})` },
          ].map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setFilterStatus(tab.key)}
              style={{
                padding: "8px 16px",
                borderRadius: "20px",
                border: filterStatus === tab.key ? "1px solid #8A5A36" : "1px solid #E8E1D6",
                backgroundColor: filterStatus === tab.key ? "#8A5A36" : "#FFF",
                color: filterStatus === tab.key ? "#FFF" : "#5A4A3E",
                fontSize: "13px",
                fontWeight: filterStatus === tab.key ? "600" : "400",
                cursor: "pointer",
                transition: "all 0.2s",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search input */}
        <div style={{ minWidth: "260px" }}>
          <input
            type="text"
            placeholder="Tìm theo mã RET, email, sản phẩm..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: "100%",
              padding: "8px 14px",
              border: "1px solid #D8CEC1",
              borderRadius: "6px",
              fontSize: "13px",
              outline: "none",
            }}
          />
        </div>
      </div>

      {/* Main Table */}
      {filteredList.length === 0 ? (
        <div
          style={{
            backgroundColor: "#FFF",
            border: "1px solid #D8CEC1",
            borderRadius: "8px",
            padding: "50px 20px",
            textAlign: "center",
            color: "#8A7350",
          }}
        >
          <div style={{ fontSize: "36px", marginBottom: "10px" }}>📦</div>
          <div style={{ fontSize: "16px", fontWeight: "600" }}>Không có yêu cầu đổi trả nào</div>
          <p style={{ fontSize: "13px", color: "#9E9E9E", margin: "6px 0 0" }}>
            {searchTerm ? "Không tìm thấy kết quả phù hợp với từ khóa." : "Hiện chưa có yêu cầu nào trong danh mục này."}
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {filteredList.map((req) => {
            const badge = STATUS_BADGES[req.status] || STATUS_BADGES.PENDING;
            const isPending = req.status === "PENDING";
            const isApproved = req.status === "APPROVED";
            const isBusy = processingId === req.id;

            return (
              <div
                key={req.id}
                style={{
                  backgroundColor: "#FFFFFF",
                  border: isPending ? "2px solid #E8C178" : "1px solid #D8CEC1",
                  borderRadius: "8px",
                  padding: "20px 24px",
                  boxShadow: isPending ? "0 4px 15px rgba(184, 134, 11, 0.08)" : "0 2px 6px rgba(0,0,0,0.03)",
                }}
              >
                {/* Top Info Header */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    borderBottom: "1px solid #F0EAE1",
                    paddingBottom: "12px",
                    marginBottom: "16px",
                    flexWrap: "wrap",
                    gap: "10px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <span style={{ fontSize: "16px", fontWeight: "700", color: "#1A1615", fontFamily: "monospace" }}>
                      #{req.id}
                    </span>
                    <span
                      style={{
                        padding: "4px 10px",
                        borderRadius: "12px",
                        fontSize: "12px",
                        fontWeight: "600",
                        backgroundColor: badge.bg,
                        color: badge.color,
                        border: `1px solid ${badge.border}`,
                      }}
                    >
                      {badge.label}
                    </span>
                    <span style={{ fontSize: "12.5px", color: "#8A7350" }}>
                      Thời gian: {formatDate(req.createdAt)}
                    </span>
                  </div>

                  <div style={{ fontSize: "13px", color: "#5A4A3E" }}>
                    Khách hàng: <strong>{req.customerName}</strong> ({req.customerEmail})
                  </div>
                </div>

                {/* Body Content Columns */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                    gap: "20px",
                    alignItems: "start",
                  }}
                >
                  {/* Left Column: Product & Description */}
                  <div>
                    <div style={{ marginBottom: "10px" }}>
                      <span style={{ fontSize: "12px", color: "#8A7350", textTransform: "uppercase", fontWeight: "700" }}>
                        Sản phẩm / Đơn hàng:
                      </span>
                      <div style={{ fontSize: "14.5px", fontWeight: "600", color: "#2B211C", marginTop: "2px" }}>
                        {req.item}
                      </div>
                    </div>

                    <div style={{ marginBottom: "10px" }}>
                      <span style={{ fontSize: "12px", color: "#8A7350", textTransform: "uppercase", fontWeight: "700" }}>
                        Lý do hoàn trả:
                      </span>
                      <div
                        style={{
                          display: "inline-block",
                          marginLeft: "6px",
                          padding: "2px 8px",
                          backgroundColor: "#FAF6F0",
                          borderRadius: "4px",
                          fontSize: "12.5px",
                          color: "#6B4226",
                          fontWeight: "500",
                        }}
                      >
                        {req.reason}
                      </div>
                    </div>

                    <div style={{ marginBottom: "12px" }}>
                      <span style={{ fontSize: "12px", color: "#8A7350", textTransform: "uppercase", fontWeight: "700" }}>
                        Mô tả chi tiết từ khách:
                      </span>
                      <div
                        style={{
                          marginTop: "4px",
                          padding: "10px 12px",
                          backgroundColor: "#FAF8F5",
                          borderRadius: "6px",
                          fontSize: "13px",
                          color: "#3B2A1A",
                          border: "1px solid #EEE7DE",
                          lineHeight: "1.5",
                        }}
                      >
                        {req.detailNote || "(Khách không nhập thêm mô tả chi tiết)"}
                      </div>
                    </div>

                    {/* Staff verification note display */}
                    {req.staffNote && (
                      <div style={{ fontSize: "12.5px", color: "#5A4A3E", marginTop: "8px" }}>
                        <strong>Ghi chú xác minh của Staff:</strong> <em>{req.staffNote}</em>
                      </div>
                    )}
                  </div>

                  {/* Middle Column: Proof Image */}
                  <div>
                    <span style={{ fontSize: "12px", color: "#8A7350", textTransform: "uppercase", fontWeight: "700", display: "block", marginBottom: "6px" }}>
                      Hình ảnh minh chứng (Ảnh chụp lỗi):
                    </span>

                    {req.proofImageBase64 ? (
                      <div style={{ position: "relative", display: "inline-block" }}>
                        <img
                          src={req.proofImageBase64}
                          alt="Ảnh minh chứng"
                          style={{
                            maxWidth: "200px",
                            maxHeight: "150px",
                            borderRadius: "6px",
                            border: "1px solid #D8CEC1",
                            cursor: "pointer",
                            objectFit: "cover",
                            display: "block",
                          }}
                          onClick={() => setZoomedImage(req.proofImageBase64)}
                          title="Bấm để phóng to xem chi tiết"
                        />
                        <button
                          type="button"
                          onClick={() => setZoomedImage(req.proofImageBase64)}
                          style={{
                            marginTop: "6px",
                            padding: "4px 10px",
                            backgroundColor: "#FAF6F0",
                            border: "1px solid #D8CEC1",
                            borderRadius: "4px",
                            fontSize: "11.5px",
                            color: "#6B4226",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            gap: "5px",
                          }}
                        >
                          🔍 Phóng to xem vết lỗi
                        </button>
                      </div>
                    ) : (
                      <div
                        style={{
                          padding: "20px 16px",
                          backgroundColor: "#FDFBF7",
                          border: "1px dashed #D8CEC1",
                          borderRadius: "6px",
                          fontSize: "12.5px",
                          color: "#9E9E9E",
                          textAlign: "center",
                        }}
                      >
                        Khách hàng không đính kèm hình ảnh
                      </div>
                    )}
                  </div>

                  {/* Right Column: Actions & Role Permissions */}
                  <div
                    style={{
                      backgroundColor: "#FAF8F5",
                      border: "1px solid #EEE7DE",
                      borderRadius: "6px",
                      padding: "16px",
                    }}
                  >
                    {isAdmin ? (
                      <div>
                        <div style={{ fontSize: "12px", color: "#8A5A36", textTransform: "uppercase", fontWeight: "700", marginBottom: "6px" }}>
                          Xử lý yêu cầu (Admin Portal)
                        </div>

                        <div style={{ marginBottom: "12px" }}>
                          <label style={{ fontSize: "12px", color: "#555", display: "block", marginBottom: "4px" }}>
                            Ghi chú phản hồi cho khách:
                          </label>
                          <textarea
                            rows={2}
                            placeholder="Nhập ghi chú gửi vào email khách (ví dụ: Bưu tá sẽ qua lấy hàng trong 24h...)"
                            value={notesState[req.id]?.adminNote ?? req.adminNote ?? ""}
                            onChange={(e) => handleNoteChange(req.id, "adminNote", e.target.value)}
                            disabled={!isPending && !isApproved}
                            style={{
                              width: "100%",
                              padding: "8px 10px",
                              fontSize: "12.5px",
                              border: "1px solid #D8CEC1",
                              borderRadius: "4px",
                              boxSizing: "border-box",
                              outline: "none",
                            }}
                          />
                        </div>

                        {/* Action buttons */}
                        {isPending ? (
                          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                            <button
                              type="button"
                              onClick={() => handleApprove(req)}
                              disabled={isBusy}
                              style={{
                                flex: 1,
                                padding: "9px 12px",
                                backgroundColor: "#1B5E20",
                                color: "#FFF",
                                border: "none",
                                borderRadius: "4px",
                                fontSize: "12.5px",
                                fontWeight: "600",
                                cursor: isBusy ? "not-allowed" : "pointer",
                                opacity: isBusy ? 0.7 : 1,
                              }}
                            >
                              {isBusy ? "Đang gửi email..." : "✅ Chấp nhận hoàn tiền"}
                            </button>

                            <button
                              type="button"
                              onClick={() => handleReject(req)}
                              disabled={isBusy}
                              style={{
                                padding: "9px 14px",
                                backgroundColor: "#FFF",
                                color: "#C62828",
                                border: "1px solid #C62828",
                                borderRadius: "4px",
                                fontSize: "12.5px",
                                fontWeight: "600",
                                cursor: isBusy ? "not-allowed" : "pointer",
                              }}
                            >
                              Từ chối
                            </button>
                          </div>
                        ) : (
                          <div style={{ fontSize: "12.5px", color: badge.color, fontWeight: "600" }}>
                            ✓ Đã xử lý ({badge.label})
                            {req.adminNote && (
                              <div style={{ fontSize: "12px", color: "#666", fontWeight: "normal", marginTop: "4px" }}>
                                Ghi chú đã gửi: {req.adminNote}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ) : (
                      /* STAFF VIEW */
                      <div>
                        <div style={{ fontSize: "12px", color: "#5A4A3E", textTransform: "uppercase", fontWeight: "700", marginBottom: "6px" }}>
                          Kiểm tra vận hành (Staff View)
                        </div>

                        <div style={{ marginBottom: "10px" }}>
                          <label style={{ fontSize: "12px", color: "#555", display: "block", marginBottom: "4px" }}>
                            Ghi chú xác minh kho / vận chuyển:
                          </label>
                          <textarea
                            rows={2}
                            placeholder="Nhập ghi chú tình trạng hàng, số lượng tồn kho..."
                            value={notesState[req.id]?.staffNote ?? req.staffNote ?? ""}
                            onChange={(e) => handleNoteChange(req.id, "staffNote", e.target.value)}
                            style={{
                              width: "100%",
                              padding: "8px 10px",
                              fontSize: "12.5px",
                              border: "1px solid #D8CEC1",
                              borderRadius: "4px",
                              boxSizing: "border-box",
                              outline: "none",
                            }}
                          />
                        </div>

                        <button
                          type="button"
                          onClick={() => handleSaveStaffNote(req)}
                          style={{
                            padding: "7px 14px",
                            backgroundColor: "#4E342E",
                            color: "#FFF",
                            border: "none",
                            borderRadius: "4px",
                            fontSize: "12px",
                            cursor: "pointer",
                            marginBottom: "8px",
                          }}
                        >
                          Lưu ghi chú xác minh
                        </button>

                        <div style={{ fontSize: "11px", color: "#8A7350", fontStyle: "italic" }}>
                          * Quyền hạn duyệt hoàn tiền và kích hoạt gửi email thuộc về Quản trị viên (Admin).
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Lightbox Modal để phóng to xem ảnh minh chứng */}
      {zoomedImage && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            backgroundColor: "rgba(0, 0, 0, 0.85)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 99999,
            padding: "20px",
          }}
          onClick={() => setZoomedImage(null)}
        >
          <div
            style={{
              position: "relative",
              maxWidth: "85%",
              maxHeight: "85%",
              backgroundColor: "#FFF",
              padding: "16px",
              borderRadius: "8px",
              boxShadow: "0 10px 40px rgba(0,0,0,0.5)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ width: "100%", display: "flex", justifyContent: "space-between", marginBottom: "10px" }}>
              <span style={{ fontSize: "14px", fontWeight: "600", color: "#2B211C" }}>
                Hình ảnh minh chứng thực tế
              </span>
              <button
                type="button"
                onClick={() => setZoomedImage(null)}
                style={{
                  background: "transparent",
                  border: "none",
                  fontSize: "18px",
                  cursor: "pointer",
                  color: "#666",
                }}
              >
                ✕
              </button>
            </div>

            <img
              src={zoomedImage}
              alt="Ảnh phóng to"
              style={{
                maxWidth: "100%",
                maxHeight: "75vh",
                objectFit: "contain",
                borderRadius: "4px",
                border: "1px solid #EEE",
              }}
            />

            <div style={{ marginTop: "12px", width: "100%", textAlign: "right" }}>
              <button
                type="button"
                onClick={() => setZoomedImage(null)}
                style={{
                  padding: "7px 18px",
                  backgroundColor: "#2B211C",
                  color: "#FFF",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer",
                  fontSize: "13px",
                }}
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

