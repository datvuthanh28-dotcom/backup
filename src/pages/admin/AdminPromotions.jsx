import { useEffect, useMemo, useState } from "react";
import { productsAPI, promotionAPI } from "../../services/api";

const money = (value) => `${Math.round(Number(value || 0)).toLocaleString("vi-VN")}đ`;
const now = () => new Date().toISOString().slice(0, 16);
const addDays = (days) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 16);
};

const empty = {
  name: "", description: "", businessGoal: "revenue_growth", discountType: "percentage",
  discountValue: 10, maximumDiscount: "", minimumOrderValue: 0, maxDiscountPerOrder: "",
  budgetTotal: "", isAutomatic: false, stackingPolicy: "none", priority: 0,
  customerRequirement: "any", usageLimitTotal: "", usageLimitPerCustomer: "",
  startAt: now(), endAt: "", status: "draft", targetType: "store", targetValues: "all",
  excludedValues: "", code: "", codeUsageLimit: "", codeDistribution: "public",
  codeDescription: "", assignedCustomerEmails: "", requiresOverride: false,
  overrideReason: "", approvalStatus: "pending", recommendationSnapshot: null,
};

const statusLabels = {
  active: "Đang chạy", scheduled: "Đã lên lịch", paused: "Tạm dừng", draft: "Bản nháp",
  expired: "Đã kết thúc", exhausted: "Hết lượt/ngân sách", archived: "Đã lưu trữ",
};
const approvalLabels = { pending: "Chờ duyệt", approved: "Đã duyệt", rejected: "Từ chối" };
const goalLabels = {
  revenue_growth: "Tăng doanh thu", inventory_clearance: "Giảm tồn kho", new_product: "Ra mắt sản phẩm",
  basket_growth: "Tăng giá trị đơn", customer_acquisition: "Thu hút khách mới", retention: "Khuyến khích quay lại",
};
const confidenceLabel = (value) => ({ high: "Cao", medium: "Trung bình", low: "Thấp" }[value] || "Thấp");
const toTargets = (form) => [
  ...form.targetValues.split(",").map((value) => value.trim()).filter(Boolean).map((value) => ({ type: form.targetType, value })),
  ...form.excludedValues.split(",").map((value) => value.trim()).filter(Boolean).map((value) => ({ type: form.targetType, value, excluded: true })),
];

export default function AdminPromotions() {
  const [rows, setRows] = useState([]);
  const [report, setReport] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [suggestionMeta, setSuggestionMeta] = useState(null);
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState(null);
  const [open, setOpen] = useState(false);
  const [simulation, setSimulation] = useState(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [priceEdit, setPriceEdit] = useState(null);
  const [activeView, setActiveView] = useState("recommendations");
  const [expanded, setExpanded] = useState(() => new Set());

  const load = async () => {
    const [data, stats, proposed] = await Promise.all([
      promotionAPI.getAll(), promotionAPI.report(), promotionAPI.getSuggestions(),
    ]);
    setRows(data.promotions || []);
    setReport(stats.report || []);
    setSuggestions(proposed.suggestions || []);
    setSuggestionMeta({ generatedAt: proposed.generatedAt, methodology: proposed.methodology });
  };

  useEffect(() => { load().catch((error) => setMessage(error.message)); }, []);

  const payload = useMemo(() => ({
    ...form,
    maximumDiscount: form.maximumDiscount || null,
    maxDiscountPerOrder: form.maxDiscountPerOrder || null,
    budgetTotal: form.budgetTotal || null,
    usageLimitTotal: form.usageLimitTotal || null,
    usageLimitPerCustomer: form.usageLimitPerCustomer || null,
    codeUsageLimit: form.codeUsageLimit || null,
    endAt: form.endAt || null,
    targets: toTargets(form).length ? toTargets(form) : [{ type: "store", value: "all" }],
  }), [form]);

  const patch = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  const act = async (action) => {
    setMessage("");
    try { await action(); await load(); } catch (error) { setMessage(error.message); }
  };

  const openNew = (asCode = false) => {
    setEditing(null);
    setSimulation(null);
    setForm({ ...empty, isAutomatic: !asCode });
    setOpen(true);
  };

  const createFromSuggestion = (row, asCode = false) => {
    setEditing(null);
    setSimulation(null);
    setForm({
      ...empty,
      name: `Ưu đãi ${row.name}`,
      description: `Đề xuất cho ${row.sku}: ${row.reasons.join("; ")}.`,
      businessGoal: row.businessGoal,
      discountValue: row.recommendedPercent,
      maximumDiscount: row.price - row.proposedPrice,
      budgetTotal: row.estimatedBudget || "",
      usageLimitTotal: row.expectedUnits || "",
      usageLimitPerCustomer: 1,
      startAt: now(),
      endAt: addDays(row.durationDays),
      targetType: "variant",
      targetValues: row.sku,
      isAutomatic: !asCode,
      codeDistribution: "public",
      codeDescription: `Giảm ${row.recommendedPercent}% cho ${row.name}`,
      recommendationSnapshot: {
        variantId: row.variant_id, sku: row.sku, score: row.score, reasons: row.reasons,
        risks: row.risks, generatedAt: suggestionMeta?.generatedAt, expectedUnits: row.expectedUnits,
        projectedRevenue: row.projectedRevenue, projectedGrossProfit: row.projectedGrossProfit,
        confidence: row.confidence, financialSummary: row.financialSummary,
      },
    });
    setOpen(true);
  };

  const runSimulation = async () => {
    setBusy(true); setMessage("");
    try { const result = await promotionAPI.simulate(payload); setSimulation(result.simulation); }
    catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  };

  const save = async (event) => {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const result = await promotionAPI.simulate(payload);
      setSimulation(result.simulation);
      if (result.simulation.hasBlockedVariants) throw new Error("Phạm vi có SKU đã chạm mức tồn tối thiểu. Hãy loại SKU này trước khi lưu chương trình.");
      if (result.simulation.requiresOverride && !form.overrideReason.trim()) throw new Error("Có SKU vượt giá sàn. Hãy ghi lý do ngoại lệ hoặc giảm mức ưu đãi.");
      if (!form.isAutomatic && !editing && !form.code.trim()) throw new Error("Chương trình dùng mã cần có mã giảm giá.");
      const finalPayload = { ...payload, requiresOverride: result.simulation.requiresOverride, status: "draft", approvalStatus: "pending" };
      if (editing) await promotionAPI.update(editing, finalPayload);
      else await promotionAPI.create(finalPayload);
      setOpen(false); setEditing(null); setForm(empty); setSimulation(null); setActiveView("programs");
      await load();
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  };

  const beginEdit = (row) => {
    const entries = String(row.targets || "store:all").split(", ").map((entry) => {
      const index = entry.indexOf(":"); return [entry.slice(0, index), entry.slice(index + 1)];
    });
    setEditing(row.id); setSimulation(null);
    setForm({
      ...empty, name: row.name, description: row.description || "", businessGoal: row.business_goal || "revenue_growth",
      discountType: row.discount_type, discountValue: Number(row.discount_value), maximumDiscount: row.maximum_discount || "",
      minimumOrderValue: Number(row.minimum_order_value), maxDiscountPerOrder: row.max_discount_per_order || "",
      budgetTotal: row.budget_total || "", isAutomatic: Boolean(row.is_automatic), stackingPolicy: row.stacking_policy,
      priority: row.priority, customerRequirement: row.customer_requirement, usageLimitTotal: row.usage_limit_total || "",
      usageLimitPerCustomer: row.usage_limit_per_customer || "", startAt: new Date(row.start_at).toISOString().slice(0, 16),
      endAt: row.end_at ? new Date(row.end_at).toISOString().slice(0, 16) : "", targetType: entries[0]?.[0] || "store",
      targetValues: entries.map((entry) => entry[1]).join(","), code: "", requiresOverride: Boolean(row.requires_override),
      overrideReason: row.override_reason || "", approvalStatus: row.approval_status,
    });
    setOpen(true);
  };

  const toggleExpanded = (id) => setExpanded((current) => {
    const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next;
  });

  const totalDiscount = report.reduce((sum, row) => sum + Number(row.discount_total) + Number(row.shipping_discount_total), 0);
  const eligibleSuggestions = suggestions.filter((row) => row.eligible);
  const codeRows = rows.filter((row) => row.codes);

  return <div className="promotion-admin">
    <header>
      <div><p className="eyebrow">Chính sách bán hàng</p><h1>QUẢN LÝ KHUYẾN MÃI</h1><p>Quyết định dựa trên doanh thu dự kiến, chi phí ưu đãi và lượng hàng có thể giải phóng.</p></div>
      <div className="promotion-header-actions"><button onClick={() => openNew(true)}>Tạo mã giảm giá</button><button className="btn-primary" onClick={() => openNew(false)}>Tạo chương trình tự động</button></div>
    </header>

    {message && <p className="admin-insights__error">{message}</p>}

    <div className="promotion-metrics">
      <article><span>Đang chạy</span><strong>{rows.filter((row) => row.effective_status === "active").length}</strong></article>
      <article><span>Đề xuất nên xem</span><strong>{eligibleSuggestions.length}</strong></article>
      <article><span>Doanh thu từ ưu đãi</span><strong>{money(report.reduce((sum, row) => sum + Number(row.attributed_net_revenue || 0), 0))}</strong></article>
      <article><span>Chi phí ưu đãi thực tế</span><strong>{money(totalDiscount)}</strong></article>
    </div>

    <nav className="promotion-view-tabs" aria-label="Khu vực quản lý khuyến mãi">
      <button className={activeView === "recommendations" ? "active" : ""} onClick={() => setActiveView("recommendations")}>Đề xuất ({eligibleSuggestions.length})</button>
      <button className={activeView === "programs" ? "active" : ""} onClick={() => setActiveView("programs")}>Chương trình ({rows.filter((row) => !row.is_archived).length})</button>
      <button className={activeView === "codes" ? "active" : ""} onClick={() => setActiveView("codes")}>Mã giảm giá ({codeRows.length})</button>
    </nav>

    {activeView === "recommendations" && <section className="promotion-suggestions">
      <div className="promotion-suggestions__heading">
        <div><p className="eyebrow">Đề xuất theo dữ liệu</p><h2>Sản phẩm nên xem xét khuyến mãi</h2><p>Hệ thống đã tính phần chi phí phía sau. Admin chỉ cần xem kết quả, điều chỉnh và quyết định.</p></div>
        <div><strong>{eligibleSuggestions.length} SKU phù hợp</strong><small>Cập nhật {suggestionMeta?.generatedAt ? new Date(suggestionMeta.generatedAt).toLocaleString("vi-VN") : "—"}</small></div>
      </div>

      <div className="promotion-decision-list">
        {eligibleSuggestions.slice(0, 12).map((row) => {
          const finance = row.financialSummary;
          const isOpen = expanded.has(row.variant_id);
          return <article className="promotion-decision-card" key={row.variant_id}>
            <div className="promotion-decision-card__top">
              <div><span className={`promotion-recommendation promotion-recommendation--${finance?.netBenefitVsBaseline > 0 ? "positive" : "caution"}`}>{row.recommendationLabel}</span><h3>{row.name}</h3><p>{row.sku} · {row.color_name}/{row.size_name}</p></div>
              <div className="promotion-proposed-price"><small>Giá đề xuất</small><strong>{money(row.proposedPrice)}</strong><span>Giảm {row.recommendedPercent}% trong {row.durationDays} ngày</span></div>
            </div>
            <div className="promotion-reason-block"><strong>Vì sao được đề xuất?</strong><ul>{row.reasons.slice(0, 4).map((reason) => <li key={reason}>{reason}</li>)}</ul></div>
            <div className="promotion-decision-summary">
              <div><span>Doanh thu dự kiến</span><strong>{money(finance?.promotion?.revenueRange?.low)} – {money(finance?.promotion?.revenueRange?.high)}</strong></div>
              <div><span>Chi phí ưu đãi tối đa</span><strong>{money(finance?.promotion?.discountCost)}</strong></div>
              <div><span>Dự kiến bán</span><strong>{row.expectedUnits} sản phẩm</strong></div>
              <div><span>Tồn kho sau chương trình</span><strong>{finance?.promotion?.endingStock} sản phẩm</strong></div>
            </div>
            <p className="promotion-ai-summary">{row.decisionSummary}</p>

            {isOpen && finance && <div className="promotion-financial-details">
              <div className="promotion-scenario-comparison">
                <section><h4>Nếu giữ nguyên giá</h4><p><span>Dự kiến bán</span><strong>{finance.baseline.units} sản phẩm</strong></p><p><span>Doanh thu</span><strong>{money(finance.baseline.revenue)}</strong></p><p><span>Lợi nhuận gộp</span><strong>{money(finance.baseline.grossProfit)}</strong></p><p><span>Tồn cuối kỳ</span><strong>{finance.baseline.endingStock} sản phẩm</strong></p><p><span>Chi phí giữ tồn</span><strong>{money(finance.baseline.holdingCost)}</strong></p></section>
                <section><h4>Nếu mở khuyến mãi</h4><p><span>Dự kiến bán</span><strong>{finance.promotion.units} sản phẩm</strong></p><p><span>Doanh thu</span><strong>{money(finance.promotion.revenue)}</strong></p><p><span>Lợi nhuận gộp</span><strong>{money(finance.promotion.grossProfit)}</strong></p><p><span>Tồn cuối kỳ</span><strong>{finance.promotion.endingStock} sản phẩm</strong></p><p><span>Chi phí giữ tồn</span><strong>{money(finance.promotion.holdingCost)}</strong></p></section>
              </div>
              <div className="promotion-cost-breakdown"><h4>Chi phí giữ hàng nếu chưa bán hết</h4><p><span>Vốn đang nằm trong hàng tồn</span><strong>{money(finance.baseline.endingStock * Number(row.cost_price || 0))}</strong></p><p><span>Chi phí sử dụng vốn</span><strong>{money(finance.baseline.holdingBreakdown.capital)}</strong></p><p><span>Kho và bảo quản</span><strong>{money(finance.baseline.holdingBreakdown.storage)}</strong></p><p><span>Rủi ro xuống giá</span><strong>{money(finance.baseline.holdingBreakdown.risk)}</strong></p><p className="total"><span>Tổng chi phí giữ thêm {row.durationDays} ngày</span><strong>{money(finance.baseline.holdingCost)}</strong></p></div>
              <div className="promotion-decision-notes"><p><strong>Chi phí giữ tồn có thể tránh:</strong> {money(finance.avoidedHoldingCost)}</p><p><strong>Có lợi hơn giữ giá:</strong> {money(finance.netBenefitVsBaseline)}</p><p><strong>Cần bán tối thiểu:</strong> {finance.breakEvenUnits == null ? "Không thể hòa vốn ở mức giá này" : `${finance.breakEvenUnits} sản phẩm`}</p><p><strong>Độ tin cậy:</strong> {confidenceLabel(row.confidence)} · {row.dataQuality?.label}</p><small>Các khoản giữ tồn đang dùng mức tham chiếu: vốn 12%, kho 6% và rủi ro xuống giá 8% mỗi năm. Đây là dự báo hỗ trợ quyết định, không phải cam kết doanh thu.</small></div>
            </div>}

            {row.risks.length > 0 && <p className="promotion-suggestion-risk">Lưu ý: {row.risks.join(" · ")}</p>}
            <div className="promotion-card-actions"><button type="button" onClick={() => toggleExpanded(row.variant_id)}>{isOpen ? "Thu gọn" : "Xem phân tích thêm"}</button><button type="button" onClick={() => setPriceEdit({ ...row, costPrice: row.cost_price || "", floorPrice: row.floor_price || "" })}>Giá vốn & giá sàn</button><button type="button" onClick={() => createFromSuggestion(row, true)}>Tạo mã giảm giá</button><button className="btn-primary" type="button" onClick={() => createFromSuggestion(row, false)}>Tạo chương trình</button></div>
          </article>;
        })}
      </div>
      {eligibleSuggestions.length === 0 && <p className="promotion-empty">Hiện chưa có SKU đủ điều kiện khuyến mãi theo tồn kho, giá sàn và lịch sử bán.</p>}
      <details className="promotion-exclusions"><summary>{suggestions.filter((row) => !row.eligible).length} SKU chưa nên khuyến mãi</summary>{suggestions.filter((row) => !row.eligible).slice(0, 20).map((row) => <p key={row.variant_id}><strong>{row.sku}</strong>: {(row.exclusionReasons.length ? row.exclusionReasons : ["Chưa có tín hiệu kinh doanh đủ mạnh"]).join(" · ")}</p>)}</details>
    </section>}

    {activeView === "programs" && <ProgramTable rows={rows} beginEdit={beginEdit} act={act} openNew={openNew} />}
    {activeView === "codes" && <CodeTable rows={codeRows} openNew={openNew} />}

    {priceEdit && <PriceModal priceEdit={priceEdit} setPriceEdit={setPriceEdit} setBusy={setBusy} busy={busy} setMessage={setMessage} load={load} />}
    {open && <PromotionModal form={form} patch={patch} setForm={setForm} editing={editing} setOpen={setOpen} save={save} busy={busy} runSimulation={runSimulation} simulation={simulation} />}
  </div>;
}

function ProgramTable({ rows, beginEdit, act, openNew }) {
  return <section className="promotion-management-section">
    <div className="promotion-section-heading"><div><p className="eyebrow">Vận hành</p><h2>Chương trình khuyến mãi</h2></div><button className="btn-primary" onClick={() => openNew(false)}>Tạo chương trình</button></div>
    <div className="admin-insights__table-wrap"><table className="admin-insights__table"><thead><tr><th>Chương trình</th><th>Mục tiêu</th><th>Ưu đãi</th><th>Ngân sách</th><th>Phê duyệt</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>
      {rows.map((row) => <tr key={row.id}><td><strong>{row.name}</strong><small>{row.codes || (row.is_automatic ? "Tự động áp dụng" : "Chưa có mã")}</small><small>{row.targets || "Toàn cửa hàng"}</small></td><td>{goalLabels[row.business_goal] || row.business_goal}</td><td>{row.discount_type === "percentage" ? `Giảm ${Number(row.discount_value)}%` : `${row.discount_type} · ${money(row.discount_value)}`}<small>Đơn tối thiểu {money(row.minimum_order_value)}</small></td><td>{row.budget_total ? <><strong>{money(Number(row.budget_reserved) + Number(row.budget_spent))} / {money(row.budget_total)}</strong><small>Giữ {money(row.budget_reserved)} · Đã chi {money(row.budget_spent)}</small></> : "Không giới hạn"}</td><td><span className={`promotion-status promotion-approval--${row.approval_status}`}>{approvalLabels[row.approval_status] || "Chờ duyệt"}</span></td><td><span className={`promotion-status promotion-status--${row.effective_status}`}>{statusLabels[row.effective_status]}</span></td><td><div className="promotion-actions"><button onClick={() => beginEdit(row)} disabled={Number(row.used_count) > 0}>Sửa</button>{row.approval_status === "pending" && !row.is_archived && <><button onClick={() => act(() => promotionAPI.approve(row.id, "approved", "Đã kiểm tra doanh thu, chi phí, phạm vi và ngân sách."))}>Duyệt</button><button onClick={() => act(() => promotionAPI.approve(row.id, "rejected", "Cần điều chỉnh chương trình."))}>Từ chối</button></>}{row.approval_status === "approved" && !row.is_archived && <button className={row.status === "active" ? "" : "btn-primary"} onClick={() => act(() => promotionAPI.setStatus(row.id, row.status === "active" ? "paused" : "active"))}>{row.status === "active" ? "Tạm dừng" : "Kích hoạt"}</button>}{!row.is_archived && <button onClick={() => window.confirm("Lưu trữ mềm chương trình này?") && act(() => promotionAPI.archive(row.id))}>Lưu trữ</button>}</div></td></tr>)}
      {rows.length === 0 && <tr><td colSpan="7" className="promotion-table-empty">Chưa có chương trình. Hãy tạo từ đề xuất hoặc tạo mới.</td></tr>}
    </tbody></table></div>
  </section>;
}

function CodeTable({ rows, openNew }) {
  return <section className="promotion-management-section">
    <div className="promotion-section-heading"><div><p className="eyebrow">Phân phối ưu đãi</p><h2>Mã giảm giá</h2><p>Mã công khai, mã riêng cho khách hàng hoặc mã nội bộ đều được quản lý tại đây.</p></div><button className="btn-primary" onClick={() => openNew(true)}>Tạo mã giảm giá</button></div>
    <div className="admin-insights__table-wrap"><table className="admin-insights__table"><thead><tr><th>Mã giảm giá</th><th>Chương trình</th><th>Ưu đãi</th><th>Đã sử dụng</th><th>Thời hạn</th><th>Trạng thái</th></tr></thead><tbody>
      {rows.map((row) => <tr key={row.id}><td><strong>{row.codes}</strong></td><td>{row.name}</td><td>{row.discount_type === "percentage" ? `${Number(row.discount_value)}%` : money(row.discount_value)}</td><td>{Number(row.used_count || 0)}{row.usage_limit_total ? ` / ${row.usage_limit_total}` : ""}</td><td>{new Date(row.start_at).toLocaleDateString("vi-VN")} – {row.end_at ? new Date(row.end_at).toLocaleDateString("vi-VN") : "Không giới hạn"}</td><td><span className={`promotion-status promotion-status--${row.effective_status}`}>{statusLabels[row.effective_status]}</span></td></tr>)}
      {rows.length === 0 && <tr><td colSpan="6" className="promotion-table-empty">Chưa có mã giảm giá nào.</td></tr>}
    </tbody></table></div>
  </section>;
}

function PriceModal({ priceEdit, setPriceEdit, setBusy, busy, setMessage, load }) {
  return <div className="promotion-modal" onClick={() => setPriceEdit(null)}><form className="promotion-pricing-form" onSubmit={async (event) => {
    event.preventDefault(); setBusy(true);
    try { await productsAPI.updateVariantPricing(priceEdit.product_id, priceEdit.variant_id, Number(priceEdit.costPrice), Number(priceEdit.floorPrice)); setPriceEdit(null); await load(); }
    catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  }} onClick={(event) => event.stopPropagation()}><button type="button" className="promotion-close" onClick={() => setPriceEdit(null)}>×</button><h2>Thiết lập giá SKU</h2><p><strong>{priceEdit.sku}</strong> · Giá bán {money(priceEdit.price)}</p><label>Giá vốn<input required type="number" min="0" value={priceEdit.costPrice} onChange={(event) => setPriceEdit({ ...priceEdit, costPrice: event.target.value })} /></label><label>Giá sàn<input required type="number" min={priceEdit.costPrice || 0} max={priceEdit.price} value={priceEdit.floorPrice} onChange={(event) => setPriceEdit({ ...priceEdit, floorPrice: event.target.value })} /></label><small>Điều kiện: giá vốn ≤ giá sàn ≤ giá bán.</small><div className="promotion-modal-actions"><button type="button" onClick={() => setPriceEdit(null)}>Hủy</button><button className="btn-primary" disabled={busy}>Lưu giá</button></div></form></div>;
}

function PromotionModal({ form, patch, setForm, editing, setOpen, save, busy, runSimulation, simulation }) {
  return <div className="promotion-modal" onClick={() => setOpen(false)}><form onSubmit={save} onClick={(event) => event.stopPropagation()}>
    <button type="button" className="promotion-close" onClick={() => setOpen(false)}>×</button><h2>{editing ? "Chỉnh sửa bản nháp" : form.isAutomatic ? "Tạo chương trình tự động" : "Tạo mã giảm giá"}</h2><p className="promotion-step-note">Lưu bản nháp, kiểm tra kết quả, sau đó duyệt và kích hoạt trong danh sách chương trình.</p>
    <div className="promotion-form-grid">
      <label className="full">Tên chương trình<input required value={form.name} onChange={(event) => patch("name", event.target.value)} /></label><label className="full">Mô tả<textarea value={form.description} onChange={(event) => patch("description", event.target.value)} /></label>
      <label>Mục tiêu kinh doanh<select value={form.businessGoal} onChange={(event) => patch("businessGoal", event.target.value)}>{Object.entries(goalLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Loại ưu đãi<select value={form.discountType} onChange={(event) => patch("discountType", event.target.value)}><option value="percentage">Giảm phần trăm</option><option value="fixed_amount">Giảm số tiền</option><option value="free_shipping">Miễn phí vận chuyển</option><option value="shipping_amount">Giảm phí vận chuyển</option></select></label>
      <label>Giá trị ưu đãi<input type="number" min="0" max={form.discountType === "percentage" ? 100 : undefined} value={form.discountValue} onChange={(event) => patch("discountValue", event.target.value)} /></label><label>Giảm tối đa<input type="number" min="0" value={form.maximumDiscount} onChange={(event) => patch("maximumDiscount", event.target.value)} /></label><label>Đơn hàng tối thiểu<input type="number" min="0" value={form.minimumOrderValue} onChange={(event) => patch("minimumOrderValue", event.target.value)} /></label><label>Tối đa trên một đơn<input type="number" min="0" value={form.maxDiscountPerOrder} onChange={(event) => patch("maxDiscountPerOrder", event.target.value)} /></label><label>Ngân sách chương trình<input type="number" min="1" value={form.budgetTotal} onChange={(event) => patch("budgetTotal", event.target.value)} /></label>
      <label>Phạm vi<select value={form.targetType} onChange={(event) => patch("targetType", event.target.value)}><option value="store">Toàn cửa hàng</option><option value="audience">Đối tượng</option><option value="category">Danh mục</option><option value="product">Mã sản phẩm</option><option value="variant">SKU biến thể</option></select></label><label>Giá trị được áp dụng<input value={form.targetValues} onChange={(event) => patch("targetValues", event.target.value)} placeholder="Nhiều giá trị cách nhau bằng dấu phẩy" /></label><label className="full">Giá trị bị loại trừ<input value={form.excludedValues} onChange={(event) => patch("excludedValues", event.target.value)} placeholder="SKU/sản phẩm không áp dụng" /></label>
      <label>Bắt đầu<input required type="datetime-local" value={form.startAt} onChange={(event) => patch("startAt", event.target.value)} /></label><label>Kết thúc<input type="datetime-local" value={form.endAt} onChange={(event) => patch("endAt", event.target.value)} /></label><label>Tổng lượt sử dụng<input type="number" min="1" value={form.usageLimitTotal} onChange={(event) => patch("usageLimitTotal", event.target.value)} /></label><label>Lượt mỗi khách<input type="number" min="1" value={form.usageLimitPerCustomer} onChange={(event) => patch("usageLimitPerCustomer", event.target.value)} /></label>
      <label>Chính sách kết hợp<select value={form.stackingPolicy} onChange={(event) => patch("stackingPolicy", event.target.value)}><option value="none">Không kết hợp</option><option value="allowed">Cho phép kết hợp</option><option value="shipping_only">Chỉ mã vận chuyển</option></select></label><label>Điều kiện khách hàng<select value={form.customerRequirement} onChange={(event) => patch("customerRequirement", event.target.value)}><option value="any">Mọi khách hàng</option><option value="authenticated">Phải đăng nhập</option></select></label>
      {!form.isAutomatic && <><label>Mã giảm giá<input required={!editing} disabled={editing} value={form.code} onChange={(event) => patch("code", event.target.value.toUpperCase())} placeholder="Ví dụ: MAISON15" /></label><label>Giới hạn riêng của mã<input disabled={editing} type="number" min="1" value={form.codeUsageLimit} onChange={(event) => patch("codeUsageLimit", event.target.value)} /></label>{!editing && <><label>Cách phân phối<select value={form.codeDistribution} onChange={(event) => patch("codeDistribution", event.target.value)}><option value="public">Công khai cho mọi khách</option><option value="targeted">Gán riêng theo khách hàng</option><option value="private">Riêng tư, không hiển thị</option></select></label><label>Mô tả hiển thị<input value={form.codeDescription} onChange={(event) => patch("codeDescription", event.target.value)} placeholder="Điều kiện ngắn gọn cho khách hàng" /></label>{form.codeDistribution === "targeted" && <label className="full">Email khách hàng được nhận<textarea required value={form.assignedCustomerEmails} onChange={(event) => patch("assignedCustomerEmails", event.target.value)} placeholder="customer@gmail.com; customer2@gmail.com" /></label>}</>}</>}
      <label className="promotion-check"><input type="checkbox" checked={form.isAutomatic} onChange={(event) => setForm({ ...form, isAutomatic: event.target.checked, code: event.target.checked ? "" : form.code })} /> Tự động áp dụng, không cần nhập mã</label><label className="full">Lý do ngoại lệ giá sàn<textarea value={form.overrideReason} onChange={(event) => patch("overrideReason", event.target.value)} placeholder="Chỉ điền khi mô phỏng cảnh báo vượt ngưỡng" /></label>
    </div>
    {simulation && <section className={`promotion-simulation ${simulation.requiresOverride || simulation.overBudget ? "has-warning" : "is-safe"}`}><h3>Kết quả kiểm tra trước khi lưu</h3><div className="promotion-simulation-summary"><span>{simulation.productCount} sản phẩm</span><span>{simulation.variantCount} SKU</span><span>Chi phí tối đa: {money(simulation.estimatedExposure)}</span></div>{simulation.overBudget && <p>Chi phí dự kiến đang vượt ngân sách.</p>}{simulation.forecast && <div className="promotion-simulation-scenarios"><section><strong>Giữ nguyên giá</strong><span>Doanh thu {money(simulation.forecast.baseline.projectedRevenue)}</span><span>Lợi nhuận {money(simulation.forecast.baseline.projectedGrossProfit)}</span><span>Tồn cuối kỳ {simulation.forecast.baseline.projectedEndingStock}</span></section><section><strong>Mở khuyến mãi</strong><span>Doanh thu {money(simulation.forecast.promotion.projectedRevenue)}</span><span>Lợi nhuận {money(simulation.forecast.promotion.projectedGrossProfit)}</span><span>Tồn cuối kỳ {simulation.forecast.promotion.projectedEndingStock}</span></section></div>}{simulation.aiStrategicCommentary && <p className="promotion-ai-summary">{simulation.aiStrategicCommentary}</p>}{simulation.warnings.map((warning) => <p key={warning}>{warning}</p>)}</section>}
    <div className="promotion-modal-actions"><button type="button" onClick={() => setOpen(false)}>Hủy</button><button type="button" onClick={runSimulation} disabled={busy}>{busy ? "Đang kiểm tra" : "Xem kết quả dự kiến"}</button><button className="btn-primary" type="submit" disabled={busy}>{busy ? "Đang lưu" : "Lưu bản nháp"}</button></div>
  </form></div>;
}
