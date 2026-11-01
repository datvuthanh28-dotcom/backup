import { db } from "../config/db.js";

export async function getRevenueReport(req, res) {
  try {
    const report = await db.getRevenueReport();
    return res.json({ success: true, report });
  } catch (err) {
    console.error("[Revenue Report] Error:", err);
    return res.status(500).json({ success: false, error: "Không thể lấy báo cáo doanh thu." });
  }
}

