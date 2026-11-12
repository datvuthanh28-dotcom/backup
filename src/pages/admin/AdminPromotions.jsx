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
  templateId: null, campaignType: "manual", isPublic: true, publicTitle: "", publicDescription: "", bannerUrl: "", slug: "",
  maxEffectiveDiscount: 25, deepDiscountReasonCode: "", deepDiscountReasonNote: "", targetDetails: [],
};

const statusLabels = {
  active: "Đang chạy", scheduled: "Đã lên lịch", paused: "Tạm dừng", draft: "Bản nháp",
  expired: "Đã kết thúc", exhausted: "Hết lượt/ngân sách", archived: "Đã lưu trữ", needs_review: "Cần duyệt lại",
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
const buildTargets = (form) => {
  const details = new Map((form.targetDetails || []).map((target) => [String(target.value), target]));
  const targets = toTargets(form);
  return (targets.length ? targets : [{ type: "store", value: "all" }]).map((target) => ({
    ...(details.get(String(target.value)) || {}),
    ...target,
    selectionSource: target.excluded ? "admin_exclusion" : (details.get(String(target.value))?.selectionSource || "admin"),
  }));
};

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
  const [templates, setTemplates] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [suggestionPage, setSuggestionPage] = useState(1);
  const [selectedSuggestions, setSelectedSuggestions] = useState(() => new Set());
  const [emailPromoDraft, setEmailPromoDraft] = useState(null);
  const suggestionsPerPage = 10;

  const load = async (forceRefresh = false) => {
    const results = await Promise.allSettled([
      promotionAPI.getAll(), promotionAPI.report(), promotionAPI.getSuggestions(forceRefresh), promotionAPI.getTemplates(), productsAPI.getAll(),
    ]);
    const [programsResult, reportResult, suggestionsResult, templatesResult, catalogResult] = results;
    if (programsResult.status === "fulfilled") setRows(programsResult.value.promotions || []);
    if (reportResult.status === "fulfilled") setReport(reportResult.value.report || []);
    if (suggestionsResult.status === "fulfilled") {
      const proposed = suggestionsResult.value;
      setSuggestions(proposed.suggestions || []);
      setSuggestionMeta({ generatedAt: proposed.generatedAt, methodology: proposed.methodology, refresh: proposed.refresh });
    }
    if (templatesResult.status === "fulfilled") setTemplates(templatesResult.value.templates || []);
    if (catalogResult.status === "fulfilled") setCatalog(catalogResult.value.products || catalogResult.value || []);

    const failures = results.map((result, index) => result.status === "rejected" ? {
      label: ["chương trình", "báo cáo ưu đãi", "đề xuất", "mẫu đợt sale", "danh mục sản phẩm"][index],
      error: result.reason,
    } : null).filter(Boolean);
    if (failures.length) {
      const hasNotFound = failures.some((failure) => failure.error?.status === 404);
      const details = failures.map((failure) => failure.label).join(", ");
      throw new Error(hasNotFound
        ? `Backend chưa đồng bộ API khuyến mãi (${details}). Hãy dừng tiến trình cũ, pull đúng nhánh, chạy migration rồi khởi động lại npm run dev.`
        : `Không thể tải: ${details}. ${failures[0].error?.message || "Vui lòng thử lại."}`);
    }
  };

  useEffect(() => {
    load().catch((error) => setMessage(error.message));
    const hourlyRefresh = window.setInterval(() => load().catch((error) => setMessage(error.message)), 60 * 60 * 1000);
    return () => window.clearInterval(hourlyRefresh);
  }, []);

  useEffect(() => {
    if (!message || !message.startsWith("Đã")) return undefined;
    const timer = window.setTimeout(() => setMessage(""), 4000);
    return () => window.clearTimeout(timer);
  }, [message]);

  const refreshSuggestions = async () => {
    setBusy(true); setMessage("");
    try { await load(true); setSuggestionPage(1); setMessage("Đã phân tích lại đề xuất theo dữ liệu mới nhất."); }
    catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  };

  const payload = useMemo(() => ({
    ...form,
    maximumDiscount: form.maximumDiscount || null,
    maxDiscountPerOrder: form.maxDiscountPerOrder || null,
    budgetTotal: form.budgetTotal || null,
    usageLimitTotal: form.usageLimitTotal || null,
    usageLimitPerCustomer: form.usageLimitPerCustomer || null,
    codeUsageLimit: form.codeUsageLimit || null,
    endAt: form.endAt || null,
    targets: buildTargets(form),
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
      maxEffectiveDiscount: Math.max(25, Number(row.recommendedPercent || 0)),
      targetDetails: [{ type: "variant", value: row.sku, selectionSource: "system", needScore: row.score, suggestedDiscount: row.recommendedPercent, approvedDiscount: row.recommendedPercent, selectionReason: (row.displayReasons || row.reasons).join(" · ") }],
      recommendationSnapshot: {
        variantId: row.variant_id, sku: row.sku, score: row.score, reasons: row.reasons,
        risks: row.risks, generatedAt: suggestionMeta?.generatedAt, expectedUnits: row.expectedUnits,
        projectedRevenue: row.projectedRevenue, projectedGrossProfit: row.projectedGrossProfit,
        confidence: row.confidence, financialSummary: row.financialSummary,
      },
    });
    setOpen(true);
  };

  const createFromSelected = (template = null, selectedRows = null) => {
    const selected = selectedRows || eligibleSuggestions.filter((row) => selectedSuggestions.has(row.variant_id));
    if (!selected.length) { setMessage("Hãy chọn ít nhất một SKU để tạo đợt sale."); return; }
    const percent = Math.min(...selected.map((row) => Number(row.recommendedPercent || 5)));
    const duration = Number(template?.default_duration_days || Math.max(...selected.map((row) => row.durationDays || 7)));
    setEditing(null); setSimulation(null);
    setForm({
      ...empty,
      name: template?.name ? `${template.name} ${new Date().getFullYear()}` : "Đợt sale theo đề xuất",
      description: template?.description || `Áp dụng ${selected.length} SKU được hệ thống đề xuất.`,
      businessGoal: "inventory_clearance", discountValue: percent,
      budgetTotal: template?.default_budget || selected.reduce((sum, row) => sum + Number(row.estimatedBudget || 0), 0),
      usageLimitTotal: selected.reduce((sum, row) => sum + Number(row.expectedUnits || 0), 0),
      usageLimitPerCustomer: 3, startAt: now(), endAt: addDays(duration),
      targetType: "variant", targetValues: selected.map((row) => row.sku).join(","), isAutomatic: true,
      templateId: template?.id || null, campaignType: template?.campaign_type || "suggested_sale",
      publicTitle: template?.public_title || template?.name || "Selected Sale",
      publicDescription: template?.public_description || "Giá đặc biệt trên số lượng giới hạn.",
      bannerUrl: template?.banner_url || "", isPublic: true,
      maxEffectiveDiscount: Math.min(35, Math.max(25, ...selected.map((row) => Number(row.recommendedPercent || 0)))),
      targetDetails: selected.map((row) => ({ type: "variant", value: row.sku, selectionSource: "system", fitScore: row.campaignFitScores?.[template?.campaign_type] ?? null, needScore: row.score, suggestedDiscount: row.recommendedPercent, approvedDiscount: percent, selectionReason: (row.displayReasons || row.reasons).join(" · ") })),
      recommendationSnapshot: { generatedAt: suggestionMeta?.generatedAt, variants: selected.map((row) => ({ variantId: row.variant_id, sku: row.sku, score: row.score, reasons: row.displayReasons || row.reasons })) },
    });
    setOpen(true);
  };

  const applyTemplate = async (template) => {
    if (selectedSuggestions.size) return createFromSelected(template);
    let source = eligibleSuggestions;
    const campaignType = String(template.campaign_type || "").toLowerCase();
    const hasFitData = source.some((row) => row.campaignFitScores && Object.prototype.hasOwnProperty.call(row.campaignFitScores, campaignType));
    if (!hasFitData) {
      setBusy(true); setMessage("");
      try {
        const refreshed = await promotionAPI.getSuggestions(true);
        const freshSuggestions = refreshed.suggestions || [];
        setSuggestions(freshSuggestions);
        setSuggestionMeta({ generatedAt: refreshed.generatedAt, methodology: refreshed.methodology, refresh: refreshed.refresh });
        source = freshSuggestions.filter((row) => row.eligible);
      } catch (error) {
        setMessage(error.message);
        return;
      } finally { setBusy(false); }
    }
    const fitted = source.filter((row) => Number(row.campaignFitScores?.[campaignType] || 0) >= Number(template.minimum_fit_score || 65));
    if (fitted.length) return createFromSelected(template, fitted);
    setMessage(`Hiện chưa có SKU đạt tối thiểu ${Number(template.minimum_fit_score || 65)} điểm phù hợp với ${template.name}.`);
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
    const excludedEntries = String(row.excluded_targets || "").split(", ").filter(Boolean).map((entry) => {
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
      excludedValues: excludedEntries.map((entry) => entry[1]).join(","),
      overrideReason: row.override_reason || "", approvalStatus: row.approval_status,
      maxEffectiveDiscount: Number(row.max_effective_discount || 25), deepDiscountReasonCode: row.deep_discount_reason_code || "", deepDiscountReasonNote: row.deep_discount_reason_note || "", targetDetails: [],
    });
    setOpen(true);
  };

  const toggleExpanded = (id) => setExpanded((current) => {
    const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next;
  });

  const totalDiscount = report.reduce((sum, row) => sum + Number(row.discount_total) + Number(row.shipping_discount_total), 0);
  const eligibleSuggestions = suggestions.filter((row) => row.eligible);
  const suggestionPages = Math.max(1, Math.ceil(eligibleSuggestions.length / suggestionsPerPage));
  const pagedSuggestions = eligibleSuggestions.slice((suggestionPage - 1) * suggestionsPerPage, suggestionPage * suggestionsPerPage);
  const codeRows = rows.filter((row) => row.codes);

  const openEmailWithCode = (row = null) => {
    setEmailPromoDraft(row ? {
      promoCode: String(row.codes || "").split(",")[0].trim().toUpperCase(),
      promoTitle: row.public_title || row.name || "",
      promoDescription: row.public_description || row.description || "",
      discountLabel: row.discount_type === "percentage" ? `${Number(row.discount_value)}% OFF` : row.discount_type === "free_shipping" ? "Complimentary Shipping" : `${Number(row.discount_value || 0).toLocaleString("en-US")} VND OFF`,
      minimumOrderText: Number(row.minimum_order_value || 0) > 0 ? `Minimum order of ${Number(row.minimum_order_value).toLocaleString("en-US")} VND` : "No minimum order required",
      validUntilText: row.end_at ? new Date(row.end_at).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : "While supplies last",
    } : null);
    setActiveView("email_campaign");
  };

  return <div className="promotion-admin">
    <header>
      <div><p className="eyebrow">Chính sách bán hàng</p><h1>QUẢN LÝ KHUYẾN MÃI</h1><p>Quyết định dựa trên doanh thu dự kiến, chi phí ưu đãi và lượng hàng có thể giải phóng.</p></div>
      <div className="promotion-header-actions"><button type="button" onClick={() => openEmailWithCode(null)}>Gửi mail ưu đãi</button><button onClick={() => openNew(true)}>Tạo mã giảm giá</button><button className="btn-primary" onClick={() => openNew(false)}>Tạo chương trình tự động</button></div>
    </header>

    {message && <div className={`promotion-toast ${message.startsWith("Đã") ? "promotion-toast--success" : "promotion-toast--error"}`} role="status"><span>{message}</span><button type="button" aria-label="Đóng thông báo" onClick={() => setMessage("")}>×</button></div>}

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
      <button className={activeView === "templates" ? "active" : ""} onClick={() => setActiveView("templates")}>Mẫu đợt sale ({templates.length})</button>
      <button className={activeView === "email_campaign" ? "active" : ""} onClick={() => setActiveView("email_campaign")}>Gửi email ưu đãi</button>
    </nav>

    {activeView === "recommendations" && <section className="promotion-suggestions">
      <div className="promotion-suggestions__heading">
        <div><p className="eyebrow">Đề xuất theo dữ liệu</p><h2>Sản phẩm nên xem xét khuyến mãi</h2><p>Hệ thống đã tính phần chi phí phía sau. Admin chỉ cần xem kết quả, điều chỉnh và quyết định.</p></div>
        <div className="promotion-refresh-summary"><strong>{eligibleSuggestions.length} SKU phù hợp</strong><small>Cập nhật {suggestionMeta?.generatedAt ? new Date(suggestionMeta.generatedAt).toLocaleString("vi-VN") : "—"}</small>{suggestionMeta?.refresh?.pendingChanges > 0 && <small>{suggestionMeta.refresh.pendingChanges} thay đổi đã được xử lý</small>}<small>Tự làm mới mỗi 1 giờ</small><button type="button" disabled={busy} onClick={refreshSuggestions}>{busy ? "Đang phân tích…" : "Làm mới đề xuất"}</button></div>
      </div>

      <div className="promotion-bulk-bar"><label><input type="checkbox" checked={eligibleSuggestions.length > 0 && selectedSuggestions.size === eligibleSuggestions.length} onChange={(event) => setSelectedSuggestions(event.target.checked ? new Set(eligibleSuggestions.map((row) => row.variant_id)) : new Set())} /> Chọn toàn bộ {eligibleSuggestions.length} SKU</label><strong>Đã chọn {selectedSuggestions.size}</strong><button className="btn-primary" disabled={!selectedSuggestions.size} onClick={() => createFromSelected()}>Tạo đợt sale</button></div>

      <div className="promotion-decision-list">
        {pagedSuggestions.map((row) => {
          const finance = row.financialSummary;
          const isOpen = expanded.has(row.variant_id);
          return <article className="promotion-decision-card" key={row.variant_id}><label className="promotion-select-suggestion"><input type="checkbox" checked={selectedSuggestions.has(row.variant_id)} onChange={(event) => setSelectedSuggestions((current) => { const next = new Set(current); if (event.target.checked) next.add(row.variant_id); else next.delete(row.variant_id); return next; })} /> Chọn SKU</label>
            <div className="promotion-decision-card__top">
              <div><span className={`promotion-recommendation promotion-recommendation--${finance?.netBenefitVsBaseline > 0 ? "positive" : "caution"}`}>{row.recommendationLabel}</span><h3>{row.name}</h3><p>{row.sku} · {row.color_name}/{row.size_name}</p></div>
              <div className="promotion-proposed-price"><small>Giá đề xuất</small><strong>{money(row.proposedPrice)}</strong><span>Giảm {row.recommendedPercent}% trong {row.durationDays} ngày</span></div>
            </div>
            <div className="promotion-reason-block"><strong>Lý do đề xuất</strong><ul>{(row.displayReasons?.length ? row.displayReasons : row.reasons).slice(0, 4).map((reason) => <li key={reason}>{reason}</li>)}</ul></div>
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
      <div className="promotion-pagination"><button disabled={suggestionPage <= 1} onClick={() => setSuggestionPage((page) => page - 1)}>← Trước</button><span>Trang {suggestionPage}/{suggestionPages} · {eligibleSuggestions.length} SKU</span><button disabled={suggestionPage >= suggestionPages} onClick={() => setSuggestionPage((page) => page + 1)}>Sau →</button></div>
      {eligibleSuggestions.length === 0 && <p className="promotion-empty">Hiện chưa có SKU đủ điều kiện khuyến mãi theo tồn kho, giá sàn và lịch sử bán.</p>}
      <details className="promotion-exclusions"><summary>{suggestions.filter((row) => !row.eligible).length} SKU chưa nên khuyến mãi</summary>{suggestions.filter((row) => !row.eligible).slice(0, 20).map((row) => <p key={row.variant_id}><strong>{row.sku}</strong>: {(row.exclusionReasons.length ? row.exclusionReasons : ["Chưa có tín hiệu kinh doanh đủ mạnh"]).join(" · ")}</p>)}</details>
    </section>}

    {activeView === "programs" && <ProgramTable rows={rows} beginEdit={beginEdit} act={act} openNew={openNew} />}
    {activeView === "codes" && <CodeTable rows={codeRows} openNew={openNew} openEmailWithCode={openEmailWithCode} />}
    {activeView === "templates" && <TemplateGallery templates={templates} applyTemplate={applyTemplate} selectedCount={selectedSuggestions.size} />}
    {activeView === "email_campaign" && <PromotionEmailPanel codeRows={codeRows} initialDraft={emailPromoDraft} setMessage={setMessage} />}

    {priceEdit && <PriceModal priceEdit={priceEdit} setPriceEdit={setPriceEdit} setBusy={setBusy} busy={busy} setMessage={setMessage} load={load} />}
    {open && <PromotionModal form={form} patch={patch} setForm={setForm} editing={editing} setOpen={setOpen} save={save} busy={busy} runSimulation={runSimulation} simulation={simulation} catalog={catalog} suggestions={suggestions} />}
  </div>;
}

function TemplateGallery({ templates, applyTemplate, selectedCount }) {
  return <section className="promotion-management-section"><div className="promotion-section-heading"><div><p className="eyebrow">Chiến dịch dựng sẵn</p><h2>Mẫu đợt sale</h2><p>Chọn SKU ở tab Đề xuất rồi áp dụng nhanh một mẫu, hoặc mở mẫu để tự chọn phạm vi.</p></div></div><div className="promotion-template-grid">{templates.map((template) => <article key={template.id}><span>{template.campaign_type.replaceAll("_", " ")}</span><h3>{template.name}</h3><p>{template.description}</p><strong>Giảm mặc định {Number(template.default_discount_percent)}% · {template.default_duration_days} ngày</strong><button className="btn-primary" onClick={() => applyTemplate(template)}>{selectedCount ? `Áp dụng cho ${selectedCount} SKU` : "Sử dụng mẫu"}</button></article>)}</div></section>;
}

function ProgramTable({ rows, beginEdit, act, openNew }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const pageSize = 8;
  const visibleRows = rows.filter((row) => {
    const matchesQuery = !query.trim() || `${row.name} ${row.codes || ""}`.toLowerCase().includes(query.trim().toLowerCase());
    const matchesStatus = status === "all" || row.effective_status === status || row.approval_status === status;
    return matchesQuery && matchesStatus;
  });
  const pages = Math.max(1, Math.ceil(visibleRows.length / pageSize));
  const pagedRows = visibleRows.slice((page - 1) * pageSize, page * pageSize);
  return <section className="promotion-management-section">
    <div className="promotion-section-heading"><div><p className="eyebrow">Vận hành</p><h2>Chương trình khuyến mãi</h2></div><button className="btn-primary" onClick={() => openNew(false)}>Tạo chương trình</button></div>
    <div className="promotion-program-toolbar"><label>Tìm chương trình<input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Tên hoặc mã giảm giá" /></label><label>Trạng thái<select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="all">Tất cả trạng thái</option><option value="active">Đang chạy</option><option value="draft">Bản nháp</option><option value="scheduled">Đã lên lịch</option><option value="paused">Tạm dừng</option><option value="needs_review">Cần duyệt lại</option><option value="pending">Chờ duyệt</option><option value="expired">Đã kết thúc</option></select></label><strong>{visibleRows.length} chương trình</strong></div>
    <div className="admin-insights__table-wrap"><table className="admin-insights__table"><thead><tr><th>Chương trình</th><th>Mục tiêu</th><th>Ưu đãi</th><th>Ngân sách</th><th>Phê duyệt</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>
      {pagedRows.map((row) => <tr key={row.id}><td className="promotion-program-name"><strong>{row.name}</strong><small>{row.codes || (row.is_automatic ? "Tự động áp dụng" : "Chưa có mã")}</small><small>{new Date(row.start_at).toLocaleDateString("vi-VN")} – {row.end_at ? new Date(row.end_at).toLocaleDateString("vi-VN") : "Không giới hạn"}</small><TargetSummary targets={row.targets} reservedCount={row.reserved_sku_count} /></td><td>{goalLabels[row.business_goal] || row.business_goal}</td><td>{row.discount_type === "percentage" ? `Giảm ${Number(row.discount_value)}%` : `${row.discount_type} · ${money(row.discount_value)}`}<small>Đơn tối thiểu {money(row.minimum_order_value)}</small></td><td>{row.budget_total ? <><strong>{money(Number(row.budget_reserved) + Number(row.budget_spent))} / {money(row.budget_total)}</strong><small>Giữ {money(row.budget_reserved)} · Đã chi {money(row.budget_spent)}</small></> : "Không giới hạn"}</td><td><span className={`promotion-status promotion-approval--${row.approval_status}`}>{approvalLabels[row.approval_status] || "Chờ duyệt"}</span></td><td><span className={`promotion-status promotion-status--${row.effective_status}`}>{statusLabels[row.effective_status]}</span></td><td><div className="promotion-actions"><button onClick={() => beginEdit(row)} disabled={Number(row.used_count) > 0}>Sửa</button>{row.approval_status === "pending" && !row.is_archived && <><button onClick={() => act(() => promotionAPI.approve(row.id, "approved", "Đã kiểm tra doanh thu, chi phí, phạm vi và ngân sách."))}>Duyệt</button><button onClick={() => act(() => promotionAPI.approve(row.id, "rejected", "Cần điều chỉnh chương trình."))}>Từ chối</button></>}{row.approval_status === "approved" && !row.is_archived && <button className={row.status === "active" ? "" : "btn-primary"} onClick={() => act(() => promotionAPI.setStatus(row.id, row.status === "active" ? "paused" : "active"))}>{row.status === "active" ? "Tạm dừng" : "Kích hoạt"}</button>}{!row.is_archived && <button onClick={() => window.confirm("Lưu trữ mềm chương trình này?") && act(() => promotionAPI.archive(row.id))}>Lưu trữ</button>}</div></td></tr>)}
      {pagedRows.length === 0 && <tr><td colSpan="7" className="promotion-table-empty">Không có chương trình phù hợp với bộ lọc.</td></tr>}
    </tbody></table></div>
    {pages > 1 && <div className="promotion-pagination"><button disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>← Trước</button><span>Trang {page}/{pages}</span><button disabled={page >= pages} onClick={() => setPage((value) => value + 1)}>Sau →</button></div>}
  </section>;
}

function TargetSummary({ targets, reservedCount }) {
  const entries = String(targets || "store:all").split(", ").filter(Boolean);
  const isStorewide = entries.some((entry) => entry === "store:all");
  if (isStorewide) return <small className="promotion-target-count">Áp dụng toàn cửa hàng</small>;
  return <details className="promotion-target-details"><summary>{entries.length} SKU được chọn{Number(reservedCount) > 0 ? ` · giữ ${reservedCount}` : ""}</summary><div>{entries.map((entry) => <span key={entry}>{entry.replace(/^variant:/, "")}</span>)}</div></details>;
}

function CodeTable({ rows, openNew, openEmailWithCode }) {
  return <section className="promotion-management-section">
    <div className="promotion-section-heading"><div><p className="eyebrow">Phân phối ưu đãi</p><h2>Mã giảm giá</h2><p>Mã công khai, mã riêng cho khách hàng hoặc mã nội bộ đều được quản lý tại đây.</p></div><button className="btn-primary" onClick={() => openNew(true)}>Tạo mã giảm giá</button></div>
    <div className="admin-insights__table-wrap"><table className="admin-insights__table"><thead><tr><th>Mã giảm giá</th><th>Chương trình</th><th>Ưu đãi</th><th>Đã sử dụng</th><th>Thời hạn</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>
      {rows.map((row) => { const codeExhausted = row.code_usage_limit && Number(row.code_used_count) >= Number(row.code_usage_limit); return <tr key={row.id}><td><strong>{row.codes}</strong></td><td>{row.name}</td><td>{row.discount_type === "percentage" ? `${Number(row.discount_value)}%` : money(row.discount_value)}</td><td>{Number(row.code_used_count || 0)}{row.code_usage_limit ? ` / ${row.code_usage_limit}` : " / Không giới hạn"}</td><td>{new Date(row.start_at).toLocaleDateString("vi-VN")} – {row.end_at ? new Date(row.end_at).toLocaleDateString("vi-VN") : "Không giới hạn"}</td><td><span className={`promotion-status promotion-status--${codeExhausted ? "exhausted" : row.effective_status}`}>{codeExhausted ? "Đã hết lượt" : statusLabels[row.effective_status]}</span></td><td><button type="button" onClick={() => openEmailWithCode(row)}>Gửi mail</button></td></tr>; })}
      {rows.length === 0 && <tr><td colSpan="7" className="promotion-table-empty">Chưa có mã giảm giá nào.</td></tr>}
    </tbody></table></div>
  </section>;
}

function PromotionEmailPanel({ codeRows, initialDraft, setMessage }) {
  const [selectedCodeKey, setSelectedCodeKey] = useState(initialDraft?.promoCode || "");
  const [promoCode, setPromoCode] = useState(initialDraft?.promoCode || "MAISON15");
  const [promoTitle, setPromoTitle] = useState(initialDraft?.promoTitle || "An Exclusive Privilege From Maison Rue");
  const [promoDescription, setPromoDescription] = useState(
    initialDraft?.promoDescription || "Enjoy a curated private privilege across our latest luxury collections for a limited time."
  );
  const [discountLabel, setDiscountLabel] = useState(initialDraft?.discountLabel || "15% OFF");
  const [minimumOrderText, setMinimumOrderText] = useState(initialDraft?.minimumOrderText || "No minimum order required");
  const [validUntilText, setValidUntilText] = useState(initialDraft?.validUntilText || "While supplies last");
  const [audience, setAudience] = useState("both");
  const [customEmails, setCustomEmails] = useState("");
  const [audienceInfo, setAudienceInfo] = useState(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!initialDraft) return;
    setSelectedCodeKey(initialDraft.promoCode || "");
    setPromoCode(initialDraft.promoCode || "");
    setPromoTitle(initialDraft.promoTitle || "An Exclusive Privilege From Maison Rue");
    setPromoDescription(initialDraft.promoDescription || "Enjoy a curated private privilege across our latest luxury collections for a limited time.");
    setDiscountLabel(initialDraft.discountLabel || "Exclusive Promotional Privilege");
    setMinimumOrderText(initialDraft.minimumOrderText || "No minimum order required");
    setValidUntilText(initialDraft.validUntilText || "While supplies last");
  }, [initialDraft]);

  useEffect(() => {
    promotionAPI.getEmailAudience().then((res) => setAudienceInfo(res.audience)).catch(() => {});
  }, []);

  const codeOptions = useMemo(() => {
    const items = [];
    for (const row of codeRows || []) {
      const codes = String(row.codes || "").split(",").map((c) => c.trim().toUpperCase()).filter(Boolean);
      for (const code of codes) {
        items.push({ code, row });
      }
    }
    return items;
  }, [codeRows]);

  const handleSelectExisting = (code) => {
    setSelectedCodeKey(code);
    if (!code) return;
    setPromoCode(code);
    const match = codeOptions.find((entry) => entry.code === code)?.row;
    if (!match) return;
    setPromoTitle(match.public_title || match.name || "An Exclusive Privilege From Maison Rue");
    setPromoDescription(
      match.public_description ||
      match.description ||
      "Enjoy a curated private privilege across our latest luxury collections for a limited time."
    );
    setDiscountLabel(
      match.discount_type === "percentage"
        ? `${Number(match.discount_value)}% OFF`
        : match.discount_type === "free_shipping"
        ? "Complimentary Shipping"
        : `${Number(match.discount_value || 0).toLocaleString("en-US")} VND OFF`
    );
    setMinimumOrderText(
      Number(match.minimum_order_value || 0) > 0
        ? `Minimum order of ${Number(match.minimum_order_value).toLocaleString("en-US")} VND`
        : "No minimum order required"
    );
    setValidUntilText(
      match.end_at
        ? new Date(match.end_at).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
        : "While supplies last"
    );
  };

  const handleSend = async (event) => {
    event.preventDefault();
    if (!promoCode.trim()) {
      setMessage("Vui lòng nhập mã ưu đãi trước khi gửi.");
      return;
    }
    setSending(true);
    setMessage("");
    try {
      const res = await promotionAPI.sendEmailCampaign({
        promoCode: promoCode.trim().toUpperCase(),
        audience,
        customEmails,
        promoTitle,
        promoDescription,
        discountLabel,
        minimumOrderText,
        validUntilText,
      });
      setMessage(res.message || `Đã gửi email mã ưu đãi ${promoCode.trim().toUpperCase()}.`);
    } catch (error) {
      setMessage(error.message || "Không thể gửi email ưu đãi.");
    } finally {
      setSending(false);
    }
  };

  const displayCode = (promoCode || "YOURCODE").trim().toUpperCase();

  return (
    <section className="promotion-management-section">
      <div className="promotion-section-heading">
        <div>
          <p className="eyebrow">Email Marketing (English Template)</p>
          <h2>Gửi mã ưu đãi qua Email cho khách hàng</h2>
          <p>Mẫu email tiếng Anh đã được thiết kế sẵn — chỉ cần chọn hoặc nhập mã Promotion Code để gửi tới khách hàng đăng ký Newsletter và khách hàng hệ thống.</p>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "24px", alignItems: "start" }}>
        <form onSubmit={handleSend} style={{ background: "#fff", border: "1px solid #e6dfd5", borderRadius: "8px", padding: "20px", display: "grid", gap: "14px" }}>
          <label style={{ display: "grid", gap: "6px", fontSize: "13px", fontWeight: "600" }}>
            Chọn nhanh từ mã giảm giá hiện có (tuỳ chọn)
            <select value={selectedCodeKey} onChange={(e) => handleSelectExisting(e.target.value)} style={{ padding: "10px", border: "1px solid #d8cec1", borderRadius: "4px" }}>
              <option value="">-- Nhập mã thủ công hoặc chọn mã có sẵn --</option>
              {codeOptions.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.code} — {item.row.name}
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: "grid", gap: "6px", fontSize: "13px", fontWeight: "600" }}>
            Mã ưu đãi (Promotion Code) *
            <input
              required
              value={promoCode}
              onChange={(e) => {
                setPromoCode(e.target.value.toUpperCase());
                setSelectedCodeKey("");
              }}
              placeholder="Ví dụ: MAISON15"
              style={{ padding: "10px 12px", border: "1px solid #b89b5e", borderRadius: "4px", fontWeight: "700", letterSpacing: "2px", fontSize: "15px" }}
            />
          </label>

          <label style={{ display: "grid", gap: "6px", fontSize: "13px", fontWeight: "600" }}>
            Nhóm người nhận
            <select value={audience} onChange={(e) => setAudience(e.target.value)} style={{ padding: "10px", border: "1px solid #d8cec1", borderRadius: "4px" }}>
              <option value="both">
                Tất cả (Newsletter + Khách hàng{audienceInfo ? `: ${audienceInfo.combinedCount} email` : ""})
              </option>
              <option value="newsletter">
                Chỉ khách đăng ký Newsletter{audienceInfo ? ` (${audienceInfo.newsletterCount} email)` : ""}
              </option>
              <option value="customers">
                Chỉ khách hàng có tài khoản{audienceInfo ? ` (${audienceInfo.customerCount} email)` : ""}
              </option>
              <option value="custom">Chỉ gửi danh sách email nhập bên dưới</option>
            </select>
          </label>

          <label style={{ display: "grid", gap: "6px", fontSize: "13px", fontWeight: "600" }}>
            Email nhận thêm / gửi thử (tuỳ chọn, cách nhau dấu phẩy)
            <input
              value={customEmails}
              onChange={(e) => setCustomEmails(e.target.value)}
              placeholder="client1@gmail.com, client2@gmail.com"
              style={{ padding: "10px", border: "1px solid #d8cec1", borderRadius: "4px" }}
            />
          </label>

          <details style={{ fontSize: "12.5px", color: "#6b5a4b", background: "#faf8f5", padding: "10px 12px", borderRadius: "4px", border: "1px solid #ece5dc" }}>
            <summary style={{ cursor: "pointer", fontWeight: "600", color: "#2b211c" }}>Tuỳ chỉnh nội dung phụ trong template (tuỳ chọn)</summary>
            <div style={{ display: "grid", gap: "10px", marginTop: "10px" }}>
              <label style={{ display: "grid", gap: "4px" }}>
                Headline (English)
                <input value={promoTitle} onChange={(e) => setPromoTitle(e.target.value)} style={{ padding: "8px", border: "1px solid #d8cec1", borderRadius: "4px" }} />
              </label>
              <label style={{ display: "grid", gap: "4px" }}>
                Offer Label (English)
                <input value={discountLabel} onChange={(e) => setDiscountLabel(e.target.value)} style={{ padding: "8px", border: "1px solid #d8cec1", borderRadius: "4px" }} />
              </label>
              <label style={{ display: "grid", gap: "4px" }}>
                Description (English)
                <textarea rows={2} value={promoDescription} onChange={(e) => setPromoDescription(e.target.value)} style={{ padding: "8px", border: "1px solid #d8cec1", borderRadius: "4px" }} />
              </label>
              <label style={{ display: "grid", gap: "4px" }}>
                Eligibility (English)
                <input value={minimumOrderText} onChange={(e) => setMinimumOrderText(e.target.value)} style={{ padding: "8px", border: "1px solid #d8cec1", borderRadius: "4px" }} />
              </label>
              <label style={{ display: "grid", gap: "4px" }}>
                Valid Until (English)
                <input value={validUntilText} onChange={(e) => setValidUntilText(e.target.value)} style={{ padding: "8px", border: "1px solid #d8cec1", borderRadius: "4px" }} />
              </label>
            </div>
          </details>

          <button type="submit" className="btn-primary" disabled={sending} style={{ padding: "12px 18px", fontWeight: "700" }}>
            {sending ? "Đang gửi email ưu đãi…" : `Gửi email mã ${displayCode} cho khách hàng`}
          </button>
        </form>

        <div style={{ background: "#f4f0ea", border: "1px solid #e6dfd5", borderRadius: "8px", padding: "16px" }}>
          <div style={{ fontSize: "11px", letterSpacing: "0.1em", textTransform: "uppercase", color: "#6c625b", marginBottom: "10px", fontWeight: "700" }}>
            Xem trước mẫu Email tiếng Anh sẽ gửi (Template sẵn)
          </div>
          <div style={{ background: "#ffffff", border: "1px solid #e6dfd5", fontFamily: "'Helvetica Neue', Arial, sans-serif", color: "#1a1615" }}>
            <div style={{ background: "#1a1615", color: "#ffffff", padding: "20px", textAlign: "center", borderBottom: "2px solid #d4af37" }}>
              <div style={{ fontFamily: "Georgia, serif", fontSize: "18px", letterSpacing: "0.26em", color: "#d4af37" }}>MAISON RUE</div>
              <div style={{ fontSize: "10px", letterSpacing: "0.14em", textTransform: "uppercase", color: "#d7cec4", marginTop: "4px" }}>Exclusive Client Privilege</div>
            </div>
            <div style={{ padding: "22px", fontSize: "13.5px", lineHeight: "1.6" }}>
              <p style={{ marginTop: 0 }}>Dear Valued Client,</p>
              <p><strong>{promoTitle}</strong></p>
              <p>{promoDescription}</p>
              <div style={{ margin: "18px 0", padding: "18px", background: "#faf8f5", border: "1px dashed #b89b5e", textAlign: "center" }}>
                <div style={{ fontSize: "10px", letterSpacing: "0.16em", textTransform: "uppercase", color: "#6c625b", marginBottom: "6px" }}>Your Promotional Code</div>
                <div style={{ fontFamily: "'Courier New', monospace", fontSize: "24px", fontWeight: "700", letterSpacing: "4px", color: "#1a1615" }}>{displayCode}</div>
                <div style={{ marginTop: "8px", fontSize: "13px", fontWeight: "600", color: "#7c5b2b" }}>{discountLabel}</div>
              </div>
              {(minimumOrderText || validUntilText) && (
                <div style={{ border: "1px solid #ede6dd", padding: "10px 14px", fontSize: "12.5px", marginBottom: "14px" }}>
                  {minimumOrderText && <div><strong>Eligibility:</strong> {minimumOrderText}</div>}
                  {validUntilText && <div><strong>Valid Until:</strong> {validUntilText}</div>}
                </div>
              )}
              <p style={{ fontSize: "12.5px", color: "#555", marginBottom: 0 }}>
                Simply enter code <strong>{displayCode}</strong> at checkout to apply your privilege.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function PriceModal({ priceEdit, setPriceEdit, setBusy, busy, setMessage, load }) {
  return <div className="promotion-modal" onClick={() => setPriceEdit(null)}><form className="promotion-pricing-form" onSubmit={async (event) => {
    event.preventDefault(); setBusy(true);
    try { await productsAPI.updateVariantPricing(priceEdit.product_id, priceEdit.variant_id, Number(priceEdit.costPrice), Number(priceEdit.floorPrice)); setPriceEdit(null); await load(); }
    catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  }} onClick={(event) => event.stopPropagation()}><button type="button" className="promotion-close" onClick={() => setPriceEdit(null)}>×</button><h2>Thiết lập giá SKU</h2><p><strong>{priceEdit.sku}</strong> · Giá bán {money(priceEdit.price)}</p><label>Giá vốn<input required type="number" min="0" value={priceEdit.costPrice} onChange={(event) => setPriceEdit({ ...priceEdit, costPrice: event.target.value })} /></label><label>Giá sàn<input required type="number" min={priceEdit.costPrice || 0} max={priceEdit.price} value={priceEdit.floorPrice} onChange={(event) => setPriceEdit({ ...priceEdit, floorPrice: event.target.value })} /></label><small>Điều kiện: giá vốn ≤ giá sàn ≤ giá bán.</small><div className="promotion-modal-actions"><button type="button" onClick={() => setPriceEdit(null)}>Hủy</button><button className="btn-primary" disabled={busy}>Lưu giá</button></div></form></div>;
}

function PromotionModal({ form, patch, setForm, editing, setOpen, save, busy, runSimulation, simulation, catalog, suggestions }) {
  return <div className="promotion-modal" onClick={() => setOpen(false)}><form onSubmit={save} onClick={(event) => event.stopPropagation()}>
    <button type="button" className="promotion-close" onClick={() => setOpen(false)}>×</button><h2>{editing ? "Chỉnh sửa bản nháp" : form.isAutomatic ? "Tạo chương trình tự động" : "Tạo mã giảm giá"}</h2><p className="promotion-step-note">Lưu bản nháp, kiểm tra kết quả, sau đó duyệt và kích hoạt trong danh sách chương trình.</p>
    <div className="promotion-form-grid">
      <label className="full">Tên chương trình<input required value={form.name} onChange={(event) => patch("name", event.target.value)} /></label><label className="full">Mô tả<textarea value={form.description} onChange={(event) => patch("description", event.target.value)} /></label>
      <label>Mục tiêu kinh doanh<select value={form.businessGoal} onChange={(event) => patch("businessGoal", event.target.value)}>{Object.entries(goalLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Loại ưu đãi<select value={form.discountType} onChange={(event) => patch("discountType", event.target.value)}><option value="percentage">Giảm phần trăm</option><option value="fixed_amount">Giảm số tiền</option><option value="free_shipping">Miễn phí vận chuyển</option><option value="shipping_amount">Giảm phí vận chuyển</option></select></label>
      <label>Giá trị ưu đãi<input type="number" min="0" max={form.discountType === "percentage" ? 100 : undefined} value={form.discountValue} onChange={(event) => patch("discountValue", event.target.value)} /></label><label>Giảm tối đa<input type="number" min="0" value={form.maximumDiscount} onChange={(event) => patch("maximumDiscount", event.target.value)} /></label><label>Đơn hàng tối thiểu<input type="number" min="0" value={form.minimumOrderValue} onChange={(event) => patch("minimumOrderValue", event.target.value)} /></label><label>Tối đa trên một đơn<input type="number" min="0" value={form.maxDiscountPerOrder} onChange={(event) => patch("maxDiscountPerOrder", event.target.value)} /></label><label>Ngân sách chương trình<input type="number" min="1" value={form.budgetTotal} onChange={(event) => patch("budgetTotal", event.target.value)} /></label>
      <label>Phạm vi<select value={form.targetType} onChange={(event) => { patch("targetType", event.target.value); patch("targetValues", event.target.value === "store" ? "all" : ""); patch("excludedValues", ""); }}><option value="store">Toàn cửa hàng</option><option value="audience">Đối tượng</option><option value="category">Danh mục</option><option value="product">Sản phẩm</option><option value="variant">SKU biến thể</option></select></label>{form.targetType === "store" ? <div className="promotion-scope-store">Áp dụng cho toàn bộ sản phẩm đủ điều kiện trong cửa hàng.</div> : ["product","variant"].includes(form.targetType) ? <ScopePicker catalog={catalog} suggestions={suggestions} type={form.targetType} selected={form.targetValues} excluded={form.excludedValues} onSelected={(value)=>patch("targetValues",value)} onExcluded={(value)=>patch("excludedValues",value)} /> : <><label>Giá trị được áp dụng<input value={form.targetValues} onChange={(event) => patch("targetValues", event.target.value)} placeholder={form.targetType === "audience" ? "men, women hoặc kids" : "Tên danh mục"} /></label><label className="full">Giá trị bị loại trừ<input value={form.excludedValues} onChange={(event) => patch("excludedValues", event.target.value)} placeholder="Giá trị không áp dụng" /></label></>}
      <label>Bắt đầu<input required type="datetime-local" value={form.startAt} onChange={(event) => patch("startAt", event.target.value)} /></label><label>Kết thúc<input type="datetime-local" value={form.endAt} onChange={(event) => patch("endAt", event.target.value)} /></label><label>Tổng lượt sử dụng<input type="number" min="1" value={form.usageLimitTotal} onChange={(event) => patch("usageLimitTotal", event.target.value)} /></label><label>Lượt mỗi khách<input type="number" min="1" value={form.usageLimitPerCustomer} onChange={(event) => patch("usageLimitPerCustomer", event.target.value)} /></label>
      <label>Chính sách kết hợp<select value={form.stackingPolicy} onChange={(event) => patch("stackingPolicy", event.target.value)}><option value="none">Không kết hợp</option><option value="allowed">Cho phép kết hợp</option><option value="shipping_only">Chỉ mã vận chuyển</option></select></label><label>Điều kiện khách hàng<select value={form.customerRequirement} onChange={(event) => patch("customerRequirement", event.target.value)}><option value="any">Mọi khách hàng</option><option value="authenticated">Phải đăng nhập</option></select></label>
      <label>Trần tổng mức giảm hiệu dụng<select value={form.maxEffectiveDiscount} onChange={(event) => patch("maxEffectiveDiscount", Number(event.target.value))}><option value="25">25% — mức thông thường</option><option value="30">30% — giảm sâu</option><option value="35">35% — trần tuyệt đối</option></select></label>
      {Number(form.maxEffectiveDiscount) > 25 && <><label>Lý do giảm sâu<select required value={form.deepDiscountReasonCode} onChange={(event) => patch("deepDiscountReasonCode", event.target.value)}><option value="">Chọn lý do</option><option value="aged_inventory">Hàng tồn kho lâu ngày</option><option value="overstock">Tồn vượt mức tối đa</option><option value="slow_sales">Sản phẩm bán chậm</option><option value="end_of_season">Kết thúc mùa hoặc bộ sưu tập</option><option value="low_conversion">Nhiều quan tâm nhưng tỷ lệ mua thấp</option><option value="major_event">Chương trình ngày lễ lớn</option><option value="broken_assortment">SKU tồn không đồng đều màu/kích cỡ</option><option value="other">Lý do khác</option></select></label>{form.deepDiscountReasonCode === "other" && <label className="full">Mô tả lý do khác<textarea required value={form.deepDiscountReasonNote} onChange={(event) => patch("deepDiscountReasonNote", event.target.value)} /></label>}</>}
      {!form.isAutomatic && <><label>Mã giảm giá<input required={!editing} disabled={editing} value={form.code} onChange={(event) => patch("code", event.target.value.toUpperCase())} placeholder="Ví dụ: MAISON15" /></label><label>Giới hạn riêng của mã<input disabled={editing} type="number" min="1" value={form.codeUsageLimit} onChange={(event) => patch("codeUsageLimit", event.target.value)} /></label>{!editing && <><label>Cách phân phối<select value={form.codeDistribution} onChange={(event) => patch("codeDistribution", event.target.value)}><option value="public">Công khai cho mọi khách</option><option value="targeted">Gán riêng theo khách hàng</option><option value="private">Riêng tư, không hiển thị</option></select></label><label>Mô tả hiển thị<input value={form.codeDescription} onChange={(event) => patch("codeDescription", event.target.value)} placeholder="Điều kiện ngắn gọn cho khách hàng" /></label>{form.codeDistribution === "targeted" && <label className="full">Email khách hàng được nhận<textarea required value={form.assignedCustomerEmails} onChange={(event) => patch("assignedCustomerEmails", event.target.value)} placeholder="customer@gmail.com; customer2@gmail.com" /></label>}</>}</>}
      <label className="promotion-check"><input type="checkbox" checked={form.isAutomatic} onChange={(event) => setForm({ ...form, isAutomatic: event.target.checked, code: event.target.checked ? "" : form.code })} /> Tự động áp dụng, không cần nhập mã</label><label className="full">Lý do ngoại lệ giá sàn<textarea value={form.overrideReason} onChange={(event) => patch("overrideReason", event.target.value)} placeholder="Chỉ điền khi mô phỏng cảnh báo vượt ngưỡng" /></label>
    </div>
    {simulation && <section className={`promotion-simulation ${simulation.requiresOverride || simulation.overBudget ? "has-warning" : "is-safe"}`}><h3>Kết quả kiểm tra trước khi lưu</h3><div className="promotion-simulation-summary"><span>{simulation.productCount} sản phẩm</span><span>{simulation.variantCount} SKU</span><span>Chi phí tối đa: {money(simulation.estimatedExposure)}</span></div>{simulation.overBudget && <p>Chi phí dự kiến đang vượt ngân sách.</p>}{simulation.forecast && <div className="promotion-simulation-scenarios"><section><strong>Giữ nguyên giá</strong><span>Doanh thu {money(simulation.forecast.baseline.projectedRevenue)}</span><span>Lợi nhuận {money(simulation.forecast.baseline.projectedGrossProfit)}</span><span>Tồn cuối kỳ {simulation.forecast.baseline.projectedEndingStock}</span></section><section><strong>Mở khuyến mãi</strong><span>Doanh thu {money(simulation.forecast.promotion.projectedRevenue)}</span><span>Lợi nhuận {money(simulation.forecast.promotion.projectedGrossProfit)}</span><span>Tồn cuối kỳ {simulation.forecast.promotion.projectedEndingStock}</span></section></div>}{simulation.aiStrategicCommentary && <p className="promotion-ai-summary">{simulation.aiStrategicCommentary}</p>}{simulation.warnings.map((warning) => <p key={warning}>{warning}</p>)}</section>}
    <div className="promotion-modal-actions"><button type="button" onClick={() => setOpen(false)}>Hủy</button><button type="button" onClick={runSimulation} disabled={busy}>{busy ? "Đang kiểm tra" : "Xem kết quả dự kiến"}</button><button className="btn-primary" type="submit" disabled={busy}>{busy ? "Đang lưu" : "Lưu bản nháp"}</button></div>
  </form></div>;
}

function ScopePicker({ catalog, suggestions, type, selected, excluded, onSelected, onExcluded }) {
  const [query, setQuery] = useState("");
  const [view, setView] = useState("selected");
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState(null);
  const [referenceTime] = useState(() => Date.now());
  const pageSize = 12;
  const chosen = new Set(String(selected || "").split(",").map((value) => value.trim()).filter(Boolean));
  const blocked = new Set(String(excluded || "").split(",").map((value) => value.trim()).filter(Boolean));
  const suggestionBySku = new Map((suggestions || []).map((row) => [String(row.sku), row]));
  const suggestionsByProduct = new Map();
  (suggestions || []).forEach((row) => {
    const key = String(row.product_id);
    if (!suggestionsByProduct.has(key)) suggestionsByProduct.set(key, []);
    suggestionsByProduct.get(key).push(row);
  });
  const options = (catalog || []).flatMap((product) => {
    const launchedAt = product.launched_at ? new Date(product.launched_at) : null;
    const isNew = launchedAt && !Number.isNaN(launchedAt.getTime()) && referenceTime - launchedAt.getTime() < 60 * 86400000;
    const protectedReason = product.is_classic ? "Sản phẩm Classic không áp dụng giảm giá" : product.is_bestseller ? "Best seller được bảo vệ khỏi giảm giá" : isNew ? "Sản phẩm mới ra mắt chưa đủ 60 ngày" : "";
    if (type === "product") {
      const productSuggestions = suggestionsByProduct.get(String(product.id)) || [];
      const recommended = productSuggestions.filter((row) => row.eligible).sort((a, b) => Number(b.score) - Number(a.score))[0];
      const stock = (product.variants || []).reduce((sum, variant) => sum + Number(variant.stock || 0), 0);
      return [{ key: String(product.id), product, image: product.images?.[0], label: product.name, code: product.productCode || product.product_code, stock, recommendation: recommended, relatedSuggestions: productSuggestions, hardBlock: protectedReason || (stock <= 0 ? "Sản phẩm đã hết hàng" : "") }];
    }
    return (product.variants || []).map((variant) => {
      const recommendation = suggestionBySku.get(String(variant.sku));
      const stock = Number(variant.stock || 0);
      const threshold = Number(variant.lowStockThreshold || 0);
      const missingPrice = Number(variant.price || 0) <= 0 || Number(variant.floorPrice || variant.floor_price || 0) <= 0;
      return { key: String(variant.sku || variant.id), product, variant, image: (product.colorImages?.[variant.color] || product.images || [])[0], label: product.name, code: variant.sku, stock, recommendation, hardBlock: protectedReason || (stock <= 0 ? "SKU đã hết hàng" : stock <= threshold ? "Tồn kho đang ở mức tối thiểu" : missingPrice ? "SKU chưa có đủ giá bán và giá sàn" : "") };
    });
  });
  const optionMap = new Map(options.map((item) => [item.key, item]));
  const matches = (item) => `${item.label} ${item.code || ""} ${item.variant?.color || ""} ${item.variant?.size || ""}`.toLowerCase().includes(query.trim().toLowerCase());
  const selectedItems = [...chosen].map((key) => optionMap.get(key) || { key, label: key, code: key }).filter(matches);
  const availableItems = options.filter((item) => !chosen.has(item.key) && !blocked.has(item.key) && matches(item));
  const excludedItems = [...blocked].map((key) => optionMap.get(key) || { key, label: key, code: key }).filter(matches);
  const currentItems = view === "selected" ? selectedItems : view === "available" ? availableItems : excludedItems;
  const pages = Math.max(1, Math.ceil(currentItems.length / pageSize));
  const shown = currentItems.slice((page - 1) * pageSize, page * pageSize);
  useEffect(() => { setPage(1); }, [query, view]);
  const commit = (nextChosen, nextBlocked) => { onSelected([...nextChosen].join(",")); onExcluded([...nextBlocked].join(",")); };
  const applyItem = (item) => { if (item.hardBlock) return; const nextChosen = new Set(chosen); const nextBlocked = new Set(blocked); nextChosen.add(item.key); nextBlocked.delete(item.key); commit(nextChosen, nextBlocked); };
  const excludeItem = (item) => { const nextChosen = new Set(chosen); const nextBlocked = new Set(blocked); nextChosen.delete(item.key); nextBlocked.add(item.key); commit(nextChosen, nextBlocked); };
  const restoreItem = (item) => { const nextChosen = new Set(chosen); const nextBlocked = new Set(blocked); nextBlocked.delete(item.key); nextChosen.add(item.key); commit(nextChosen, nextBlocked); };
  const reasonList = (item) => item.recommendation?.displayReasons || item.recommendation?.reasons || item.relatedSuggestions?.flatMap((row) => row.displayReasons || row.reasons || []).slice(0, 5) || [];
  const itemMeta = (item) => item.variant ? `${item.code} · ${item.variant.color}/${item.variant.size} · tồn ${item.stock}` : `${item.code || "Mã sản phẩm"} · ${item.stock} sản phẩm trong kho`;
  return <div className="promotion-scope-picker">
    <div className="promotion-scope-summary"><div><strong>{chosen.size} {type === "variant" ? "SKU" : "sản phẩm"} sẽ áp dụng</strong><small>{blocked.size ? `${blocked.size} mục bị loại trừ riêng khỏi chương trình này` : "Chưa có mục bị loại trừ"}</small></div></div>
    <div className="promotion-scope-tabs"><button type="button" className={view === "selected" ? "active" : ""} onClick={() => setView("selected")}>Sẽ áp dụng ({chosen.size})</button><button type="button" className={view === "available" ? "active" : ""} onClick={() => setView("available")}>Sản phẩm khác ({availableItems.length})</button><button type="button" className={view === "excluded" ? "active" : ""} onClick={() => setView("excluded")}>Đã loại trừ ({blocked.size})</button></div>
    <div className="promotion-scope-toolbar"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm tên sản phẩm, SKU, màu hoặc size"/><span>{currentItems.length} kết quả</span></div>
    <div className="promotion-scope-list">{shown.map((item) => <article key={item.key} className={item.hardBlock ? "is-blocked" : ""} onClick={() => setDetail(item)}><img src={item.image ? `/${String(item.image).replace(/^\//, "")}` : "/image/placeholder.webp"} alt=""/><div className="promotion-scope-identity"><strong>{item.label}</strong><small>{itemMeta(item)}</small><span className={item.recommendation?.eligible ? "is-system" : "is-manual"}>{item.recommendation?.eligible ? `Hệ thống đề xuất · ${item.recommendation.score} điểm` : chosen.has(item.key) ? "Admin thêm thủ công" : "Chưa được hệ thống đề xuất"}</span></div>{item.recommendation?.recommendedPercent > 0 && <div className="promotion-scope-discount"><small>Mức đề xuất</small><strong>{item.recommendation.recommendedPercent}%</strong></div>}{view === "selected" && <button type="button" className="exclude" onClick={(event) => { event.stopPropagation(); excludeItem(item); }}>Loại trừ</button>}{view === "available" && <button type="button" className="apply" disabled={Boolean(item.hardBlock)} title={item.hardBlock} onClick={(event) => { event.stopPropagation(); applyItem(item); }}>{item.hardBlock ? "Không thể thêm" : "Thêm áp dụng"}</button>}{view === "excluded" && <button type="button" className="restore" onClick={(event) => { event.stopPropagation(); restoreItem(item); }}>Hoàn tác loại trừ</button>}</article>)}</div>
    {!shown.length && <div className="promotion-scope-empty">Không có sản phẩm phù hợp với danh sách và bộ lọc hiện tại.</div>}
    {pages > 1 && <div className="promotion-pagination"><button type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>← Trước</button><span>Trang {page}/{pages}</span><button type="button" disabled={page >= pages} onClick={() => setPage((value) => value + 1)}>Sau →</button></div>}
    {detail && <div className="promotion-scope-detail-backdrop" onClick={() => setDetail(null)}><section className="promotion-scope-detail" onClick={(event) => event.stopPropagation()}><button type="button" className="promotion-close" onClick={() => setDetail(null)}>×</button><div className="promotion-scope-detail-head"><img src={detail.image ? `/${String(detail.image).replace(/^\//, "")}` : "/image/placeholder.webp"} alt=""/><div><p className="eyebrow">PHẠM VI KHUYẾN MÃI</p><h3>{detail.label}</h3><span>{itemMeta(detail)}</span></div></div><div className="promotion-scope-detail-grid"><div><small>Giá hiện tại</small><strong>{money(detail.recommendation?.price || detail.variant?.price || detail.product?.price)}</strong></div><div><small>Tồn kho</small><strong>{detail.stock} sản phẩm</strong></div><div><small>Mức giảm đề xuất</small><strong>{detail.recommendation?.recommendedPercent ? `${detail.recommendation.recommendedPercent}%` : "Chưa có"}</strong></div><div><small>Trạng thái</small><strong>{detail.hardBlock || (detail.recommendation?.eligible ? "Đủ điều kiện" : "Cần admin xem xét")}</strong></div></div><h4>Vì sao hệ thống đánh giá như vậy?</h4>{reasonList(detail).length ? <ul>{reasonList(detail).map((reason) => <li key={reason}>{reason}</li>)}</ul> : <p>SKU này chưa có tín hiệu đủ mạnh để hệ thống chủ động đề xuất. Admin vẫn có thể thêm nếu không vướng điều kiện bắt buộc.</p>}{detail.recommendation?.risks?.length > 0 && <div className="promotion-scope-warning"><strong>Lưu ý</strong><p>{detail.recommendation.risks.join(" · ")}</p></div>}<div className="promotion-modal-actions"><button type="button" onClick={() => setDetail(null)}>Đóng</button>{chosen.has(detail.key) ? <button type="button" className="exclude" onClick={() => { excludeItem(detail); setDetail(null); }}>Loại khỏi chương trình</button> : <button type="button" className="btn-primary" disabled={Boolean(detail.hardBlock)} onClick={() => { applyItem(detail); setDetail(null); }}>Thêm áp dụng</button>}</div></section></div>}
  </div>;
}
