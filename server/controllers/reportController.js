import { db } from "../config/db.js";
import { retryEmailNotification as retryEmailDispatch } from "../services/emailService.js";

const revenuePeriodKey = ({ period = "all", from, to }) => period === "custom" ? `custom:${from || ""}:${to || ""}` : period;

export async function getRevenueReport(req, res) {
  try {
    const { period = "all", from: fromQuery, to: toQuery } = req.query;
    const now = new Date();
    const vnNow = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }));
    const atVnMidnight = (year, month, day) => new Date(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T00:00:00+07:00`);
    const parseDay = (value) => value ? new Date(`${value}T00:00:00+07:00`) : null;
    const addDays = (date, days) => new Date(date.getTime() + days * 86400000);
    let from = null;
    let to = null;

    if (period === "custom") {
      from = parseDay(fromQuery);
      to = parseDay(toQuery);
      if (!from || !to || Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
        return res.status(400).json({ success: false, error: "Khoảng ngày báo cáo không hợp lệ." });
      }
      to = addDays(to, 1);
    } else if (period === "last_7_days") {
      to = addDays(atVnMidnight(vnNow.getFullYear(), vnNow.getMonth() + 1, vnNow.getDate()), 1);
      from = addDays(to, -7);
    } else if (period === "this_month") {
      from = atVnMidnight(vnNow.getFullYear(), vnNow.getMonth() + 1, 1);
      to = atVnMidnight(vnNow.getFullYear(), vnNow.getMonth() + 2, 1);
    } else if (period === "last_month") {
      to = atVnMidnight(vnNow.getFullYear(), vnNow.getMonth() + 1, 1);
      from = atVnMidnight(vnNow.getFullYear(), vnNow.getMonth(), 1);
    } else if (period === "this_quarter") {
      const quarterMonth = Math.floor(vnNow.getMonth() / 3) * 3;
      from = atVnMidnight(vnNow.getFullYear(), quarterMonth + 1, 1);
      to = atVnMidnight(vnNow.getFullYear(), quarterMonth + 4, 1);
    } else if (period === "this_year") {
      from = atVnMidnight(vnNow.getFullYear(), 1, 1);
      to = atVnMidnight(vnNow.getFullYear() + 1, 1, 1);
    }

    const duration = from && to ? to.getTime() - from.getTime() : 0;
    const previousFrom = duration ? new Date(from.getTime() - duration) : null;
    const previousTo = duration ? from : null;
    const report = await db.getRevenueReport({ from, to, previousFrom, previousTo });
    report.target = await db.getRevenueTarget(revenuePeriodKey({ period, from: fromQuery, to: toQuery }));
    return res.json({ success: true, report });
  } catch (err) {
    console.error("[Revenue Report] Error:", err);
    return res.status(500).json({ success: false, error: "Không thể lấy báo cáo doanh thu." });
  }
}

export async function listEmailNotifications(req, res) {
  try {
    const { status, eventType, limit } = req.query;
    const notifications = await db.getEmailNotifications({
      status: status ? String(status).trim() : undefined,
      eventType: eventType ? String(eventType).trim() : undefined,
      limit: limit ? Number(limit) : 50,
    });
    return res.json({ success: true, notifications });
  } catch (err) {
    console.error("[Email Notifications] List Error:", err?.message || err);
    return res.status(500).json({ success: false, error: "Không thể lấy nhật ký gửi email." });
  }
}

export async function retryEmailNotification(req, res) {
  try {
    const result = await retryEmailDispatch(req.params.id);
    if (result.notFound) {
      return res.status(404).json({ success: false, error: result.error });
    }
    if (result.alreadySent) {
      return res.json({ success: true, alreadySent: true, notification: result.notification });
    }
    if (!result.success) {
      return res.status(502).json({
        success: false,
        error: result.error || "Không thể gửi lại email.",
        notification: result.notification || null,
      });
    }
    return res.json({
      success: true,
      messageId: result.messageId || null,
      notification: result.notification || null,
    });
  } catch (err) {
    console.error("[Email Notifications] Retry Error:", err?.message || err);
    return res.status(500).json({ success: false, error: "Lỗi hệ thống khi gửi lại email." });
  }
}

export async function updateRevenueTarget(req, res) {
  try {
    const { period = "all", from, to, periodLabel, targetRevenue, targetGrossProfit, note } = req.body || {};
    const revenue = Number(targetRevenue);
    const profit = targetGrossProfit === "" || targetGrossProfit == null ? null : Number(targetGrossProfit);
    if (!Number.isFinite(revenue) || revenue <= 0) return res.status(400).json({ success: false, error: "Mục tiêu doanh thu phải lớn hơn 0." });
    if (profit != null && (!Number.isFinite(profit) || profit < 0 || profit > revenue)) return res.status(400).json({ success: false, error: "Mục tiêu lợi nhuận phải từ 0 đến mục tiêu doanh thu." });
    const target = await db.upsertRevenueTarget({ periodKey: revenuePeriodKey({ period, from, to }), periodLabel, targetRevenue: revenue, targetGrossProfit: profit, note, updatedBy: req.user?.id });
    return res.json({ success: true, target });
  } catch (err) {
    console.error("[Revenue Target] Error:", err);
    return res.status(500).json({ success: false, error: "Không thể lưu mục tiêu doanh thu." });
  }
}

