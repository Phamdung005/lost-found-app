import { pool } from "../db.js";
import { logAudit } from "../utils/audit.js";
import { createNotification } from "../utils/notifications.js";

interface GeminiMatchResult {
  score: number;
  rationale: string;
}

function normalizeText(value: unknown): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase();
}

function findDistinctiveIdentifiers(value: unknown): string[] {
  return normalizeText(value).match(/\b\d{6,}\b/g) || [];
}

export function findExactMatch(report: Record<string, unknown>, item: Record<string, unknown>): GeminiMatchResult | null {
  const reportText = `${report.item_name || ""} ${report.description || ""}`;
  const itemText = `${item.item_name || ""} ${item.description || ""}`;
  const reportIdentifiers = findDistinctiveIdentifiers(reportText);
  const itemIdentifiers = new Set(findDistinctiveIdentifiers(itemText));
  const sharedIdentifier = reportIdentifiers.find((identifier) => itemIdentifiers.has(identifier));
  if (sharedIdentifier) {
    return {
      score: 1,
      rationale: `Khớp chính xác mã định danh ${sharedIdentifier} giữa đơn báo mất và mô tả vật lưu trữ.`,
    };
  }
  return null;
}

function getGeminiConfig(): { apiKey: string; model: string } | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return null;
  return {
    apiKey,
    model: process.env.GEMINI_MODEL?.trim() || "gemini-2.0-flash",
  };
}

function parseGeminiResult(text: string): GeminiMatchResult {
  const jsonText = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const parsed: unknown = JSON.parse(jsonText);
  if (!parsed || typeof parsed !== "object") throw new Error("Gemini trả về dữ liệu không hợp lệ");

  const candidate = parsed as { score?: unknown; rationale?: unknown };
  const score = Number(candidate.score);
  const rationale = typeof candidate.rationale === "string" ? candidate.rationale.trim() : "";
  if (!Number.isFinite(score) || score < 0 || score > 1 || !rationale) {
    throw new Error("Gemini trả về score/rationale không hợp lệ");
  }
  return { score, rationale };
}

async function askGemini(report: Record<string, unknown>, item: Record<string, unknown>): Promise<GeminiMatchResult> {
  const config = getGeminiConfig();
  if (!config) throw new Error("Chưa cấu hình GEMINI_API_KEY");

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:generateContent?key=${encodeURIComponent(config.apiKey)}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{
        parts: [{
          text: [
            "Bạn là bộ phận gợi ý đối chiếu đồ thất lạc. Chỉ so sánh dữ liệu, không khẳng định chủ sở hữu.",
            "Trả về duy nhất JSON hợp lệ dạng {\"score\": number, \"rationale\": string}. score nằm từ 0 đến 1.",
            `BÁO MẤT: ${JSON.stringify(report)}`,
            `ĐỒ TÌM THẤY: ${JSON.stringify(item)}`,
            "Chấm điểm dựa trên tên, danh mục, đặc điểm, thời gian và địa điểm. Thiếu dữ liệu thì giảm điểm.",
          ].join("\n"),
        }],
      }],
      generationConfig: { responseMimeType: "application/json" },
    }),
  });
  const payload = await response.json().catch(() => null) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    error?: { message?: string };
  } | null;
  if (!response.ok) {
    throw new Error(payload?.error?.message || `Gemini request failed (${response.status})`);
  }
  const text = payload?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini không trả về kết quả đối chiếu");
  return parseGeminiResult(text);
}

export async function matchLostReportWithFoundItem(reportId: number, foundItemId: number): Promise<void> {
  const pair = await pool.query(
    `SELECT
       lr.id AS report_id, lr.user_id AS report_user_id, lr.item_name AS report_item_name,
       lr.category AS report_category, lr.description AS report_description,
       lr.lost_location, lr.lost_at, lr.status AS report_status,
       fi.id AS item_id, fi.item_name, fi.category, fi.description,
       fi.found_location, fi.found_at, fi.status AS item_status, fi.tracking_code
     FROM lost_reports lr
     JOIN found_items fi ON fi.id = $2
     WHERE lr.id = $1`,
    [reportId, foundItemId],
  );
  if (pair.rows.length === 0) return;
  const row = pair.rows[0];
  if (!["searching", "pending"].includes(row.report_status) || row.item_status === "returned") return;

  const existing = await pool.query(
    "SELECT id, status FROM lost_report_matches WHERE lost_report_id = $1 AND found_item_id = $2",
    [reportId, foundItemId],
  );
  const reportData = {
    item_name: row.report_item_name,
    category: row.report_category,
    description: row.report_description,
    lost_location: row.lost_location,
    lost_at: row.lost_at,
  };
  const itemData = {
    item_name: row.item_name,
    category: row.category,
    description: row.description,
    found_location: row.found_location,
    found_at: row.found_at,
  };
  let result = findExactMatch(reportData, itemData);
  let provider = "deterministic";
  let model = "exact-identifier";

  if (!result && existing.rows.length > 0) return;

  if (!result) {
    try {
      result = await askGemini(reportData, itemData);
      provider = "gemini";
      model = process.env.GEMINI_MODEL || "gemini-2.0-flash";
    } catch (error) {
    await logAudit(null, "LOST_ITEM_MATCH_FAILED", {
      lost_report_id: reportId,
      found_item_id: foundItemId,
      error: error instanceof Error ? error.message : "Unknown matching error",
    });
    await createNotification({
      role: "admin",
      title: "⚠️ AI đối chiếu báo mất thất bại",
      message: `Không thể đối chiếu đơn #${reportId} với món đồ #${foundItemId}. Kiểm tra cấu hình Gemini hoặc log hệ thống.`,
      type: "warning",
    });
    return;
    }
  }

  const threshold = Number(process.env.GEMINI_MATCH_THRESHOLD || "0.78");
  const matchStatus = result.score >= threshold ? "notified" : "reviewed";
  if (existing.rows.length > 0) {
    await pool.query(
      `UPDATE lost_report_matches
       SET score = $1, rationale = $2, provider = $3, model = $4, status = $5
       WHERE id = $6`,
      [result.score, result.rationale, provider, model, matchStatus, existing.rows[0].id],
    );
  } else {
    await pool.query(
      `INSERT INTO lost_report_matches
         (lost_report_id, found_item_id, score, rationale, provider, model, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [reportId, foundItemId, result.score, result.rationale, provider, model, matchStatus],
    );
  }
  await logAudit(null, "LOST_ITEM_MATCHED", {
    lost_report_id: reportId,
    found_item_id: foundItemId,
    score: result.score,
    threshold,
    rationale: result.rationale,
  });

  if (result.score >= threshold && row.report_user_id && existing.rows[0]?.status !== "notified") {
    await pool.query(
      "UPDATE lost_reports SET status = 'found', updated_at = now() WHERE id = $1 AND status IN ('searching', 'pending')",
      [reportId],
    );
    await createNotification({
      userId: row.report_user_id,
      title: "🔎 Có món đồ tương tự báo mất của bạn",
      message: `Hệ thống tìm thấy món đồ có khả năng trùng với "${row.report_item_name}" (mã ${row.tracking_code}). Vui lòng kiểm tra và gửi yêu cầu nhận đồ nếu đúng.`,
      type: "success",
    });
    await logAudit(null, "LOST_ITEM_MATCH_NOTIFIED", {
      lost_report_id: reportId,
      found_item_id: foundItemId,
      user_id: row.report_user_id,
    });
  }
}

export async function matchFoundItemAgainstOpenReports(foundItemId: number): Promise<void> {
  const reports = await pool.query(
    "SELECT id FROM lost_reports WHERE status IN ('searching', 'pending') ORDER BY created_at ASC",
  );
  for (const report of reports.rows) {
    await matchLostReportWithFoundItem(Number(report.id), foundItemId);
  }
}

export async function matchLostReportAgainstFoundItems(reportId: number): Promise<void> {
  const items = await pool.query(
    "SELECT id FROM found_items WHERE status <> 'returned' ORDER BY created_at DESC",
  );
  for (const item of items.rows) {
    await matchLostReportWithFoundItem(reportId, Number(item.id));
  }
}

export async function scanOpenLostReports(): Promise<void> {
  const reports = await pool.query(
    "SELECT id FROM lost_reports WHERE status IN ('searching', 'pending') ORDER BY created_at ASC",
  );
  for (const report of reports.rows) {
    await matchLostReportAgainstFoundItems(Number(report.id));
  }
}
