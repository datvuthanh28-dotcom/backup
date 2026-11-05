import { db } from "../config/db.js";

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
    return res.json({ success: true, report });
  } catch (err) {
    console.error("[Revenue Report] Error:", err);
    return res.status(500).json({ success: false, error: "Không thể lấy báo cáo doanh thu." });
  }
}

