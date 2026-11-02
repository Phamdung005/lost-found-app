import { pool } from "../db.js";
import { logAudit } from "../utils/audit.js";
import { createNotification } from "../utils/notifications.js";
import { readObject } from "./object-storage.js";

interface GeminiMatchResult {
  score: number;
  rationale: string;
  identifierScore: number;
  textScore: number;
  imageScore: number;
  contextScore: number;
}

function boundedScore(value: unknown): number {
  const score = Number(value);
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(1, score));
}

function calculateWeightedScore(result: GeminiMatchResult): number {
  return Number((
    result.identifierScore * 0.5
    + result.imageScore * 0.25
    + result.textScore * 0.15
    + result.contextScore * 0.1
  ).toFixed(4));
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
      identifierScore: 1,
      textScore: 1,
      imageScore: 0,
      contextScore: 0,
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

  const candidate = parsed as {
    score?: unknown;
    rationale?: unknown;
    identifier_score?: unknown;
    text_score?: unknown;
    image_score?: unknown;
    context_score?: unknown;
  };
  const rationale = typeof candidate.rationale === "string" ? candidate.rationale.trim() : "";
  if (!rationale) {
    throw new Error("Gemini trả về rationale không hợp lệ");
  }
  const result = {
    score: boundedScore(candidate.score),
    rationale,
    identifierScore: boundedScore(candidate.identifier_score),
    textScore: boundedScore(candidate.text_score),
    imageScore: boundedScore(candidate.image_score),
    contextScore: boundedScore(candidate.context_score),
  };
  result.score = calculateWeightedScore(result);
  return result;
}

async function askGemini(report: Record<string, unknown>, item: Record<string, unknown>): Promise<GeminiMatchResult> {
  const config = getGeminiConfig();
  if (!config) throw new Error("Chưa cấu hình GEMINI_API_KEY");

  const imageParts: Array<{ inlineData: { mimeType: string; data: string } }> = [];
  const imageKeys = [
    ...(Array.isArray(report.image_object_keys) ? report.image_object_keys : []),
    ...(Array.isArray(item.image_object_keys) ? item.image_object_keys : []),
  ].filter((key): key is string => typeof key === "string" && key.trim().length > 0).slice(0, 6);

  for (const key of imageKeys) {
    try {
      const image = await readObject(key);
      imageParts.push({
        inlineData: {
          mimeType: image.contentType,
          data: Buffer.from(image.bytes).toString("base64"),
        },
      });
    } catch (error) {
      console.warn(`Không thể đọc ảnh matching ${key}:`, error);
    }
  }

  const textPart = {
    text: [
      "Bạn là bộ phận gợi ý đối chiếu đồ thất lạc. Chỉ so sánh dữ liệu, không khẳng định chủ sở hữu.",
      "Trả về duy nhất JSON hợp lệ dạng {\"identifier_score\": number, \"text_score\": number, \"image_score\": number, \"context_score\": number, \"score\": number, \"rationale\": string}. Mỗi điểm nằm từ 0 đến 1.",
      `BÁO MẤT: ${JSON.stringify({ ...report, image_object_keys: undefined })}`,
      `ĐỒ TÌM THẤY: ${JSON.stringify({ ...item, image_object_keys: undefined })}`,
      "Chấm điểm dựa trên tên, danh mục, đặc điểm, hình ảnh, thời gian và địa điểm. Hình ảnh chỉ là bằng chứng hỗ trợ; thiếu dữ liệu thì giảm điểm.",
    ].join("\n"),
  };

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:generateContent?key=${encodeURIComponent(config.apiKey)}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{
        parts: [textPart, ...imageParts],
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
       , lr.image_object_keys AS report_image_object_keys, fi.image_object_keys AS item_image_object_keys
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
    image_object_keys: row.report_image_object_keys,
  };
  const itemData = {
    item_name: row.item_name,
    category: row.category,
    description: row.description,
    found_location: row.found_location,
    found_at: row.found_at,
    image_object_keys: row.item_image_object_keys,
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
       SET score = $1, identifier_score = $2, text_score = $3, image_score = $4,
           context_score = $5, rationale = $6, provider = $7, model = $8, status = $9
       WHERE id = $10`,
      [result.score, result.identifierScore, result.textScore, result.imageScore, result.contextScore,
        result.rationale, provider, model, matchStatus, existing.rows[0].id],
    );
  } else {
    await pool.query(
      `INSERT INTO lost_report_matches
         (lost_report_id, found_item_id, score, identifier_score, text_score, image_score,
          context_score, rationale, provider, model, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [reportId, foundItemId, result.score, result.identifierScore, result.textScore,
        result.imageScore, result.contextScore, result.rationale, provider, model, matchStatus],
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
