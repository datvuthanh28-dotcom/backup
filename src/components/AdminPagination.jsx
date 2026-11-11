export default function AdminPagination({ page, total, pageSize, onPageChange, itemLabel = "kết quả" }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;
  const safePage = Math.min(page, pages);
  const first = (safePage - 1) * pageSize + 1;
  const last = Math.min(safePage * pageSize, total);

  return (
    <div className="admin-pagination">
      <span>Hiển thị {first}–{last} trong {total} {itemLabel}</span>
      <div>
        <button type="button" disabled={safePage <= 1} onClick={() => onPageChange(safePage - 1)}>← Trước</button>
        <strong>Trang {safePage}/{pages}</strong>
        <button type="button" disabled={safePage >= pages} onClick={() => onPageChange(safePage + 1)}>Sau →</button>
      </div>
    </div>
  );
}
