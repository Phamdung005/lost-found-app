import sharp from "sharp";
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

export function evaluateHeuristicFilter(
  report: Record<string, unknown>,
  item: Record<string, unknown>,
): GeminiMatchResult | null {
  const reportCategory = String(report.category || "").trim().toLowerCase();
  const itemCategory = String(item.category || "").trim().toLowerCase();

  // 1. Nếu cả 2 đều có danh mục xác định (khác "other") và khác nhau hoàn toàn -> Loại bỏ luôn
  if (
    reportCategory &&
    itemCategory &&
    reportCategory !== "other" &&
    itemCategory !== "other" &&
    reportCategory !== itemCategory
  ) {
    return {
      score: 0.05,
      rationale: `Danh mục đồ vật không tương đồng (Báo mất: "${reportCategory}", Tìm thấy: "${itemCategory}").`,
      identifierScore: 0,
      textScore: 0.05,
      imageScore: 0,
      contextScore: 0.1,
    };
  }

  // 2. Mâu thuẫn thời gian: Đồ tìm thấy trước ngày báo mất hơn 48h
  if (report.lost_at && item.found_at) {
    const lostTime = new Date(String(report.lost_at)).getTime();
    const foundTime = new Date(String(item.found_at)).getTime();
    if (!Number.isNaN(lostTime) && !Number.isNaN(foundTime) && foundTime < lostTime - 172800000) {
      return {
        score: 0.05,
        rationale: "Thời điểm tìm thấy đồ vật diễn ra trước thời điểm báo mất quá lâu (> 48 giờ).",
        identifierScore: 0,
        textScore: 0.05,
        imageScore: 0,
        contextScore: 0,
      };
    }
  }

  // 3. Nếu cả 2 không có ảnh và tên món đồ không có từ khóa nào tương đồng
  const hasReportImage = Array.isArray(report.image_object_keys) && report.image_object_keys.length > 0;
  const hasItemImage = Array.isArray(item.image_object_keys) && item.image_object_keys.length > 0;
  if (!hasReportImage && !hasItemImage) {
    const reportWords = normalizeText(report.item_name).split(/\s+/).filter((w) => w.length > 1);
    const itemWords = new Set(normalizeText(item.item_name).split(/\s+/).filter((w) => w.length > 1));
    const commonWords = reportWords.filter((w) => itemWords.has(w));
    if (commonWords.length === 0 && reportCategory !== itemCategory) {
      return {
        score: 0.1,
        rationale: "Tên món đồ và đặc điểm không có từ khóa trùng khớp, không có hình ảnh đối chiếu.",
        identifierScore: 0,
        textScore: 0.1,
        imageScore: 0,
        contextScore: 0.1,
      };
    }
  }

  return null;
}

async function optimizeImageForAi(
  bytes: Uint8Array,
  contentType: string,
): Promise<{ mimeType: string; data: string } | null> {
  try {
    const resizedBuffer = await sharp(bytes)
      .resize({
        width: 800,
        height: 800,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 75, progressive: true })
      .toBuffer();

    return {
      mimeType: "image/jpeg",
      data: resizedBuffer.toString("base64"),
    };
  } catch (err) {
    console.warn("Resize/nén ảnh thất bại, dùng ảnh gốc:", err);
    try {
      return {
        mimeType: contentType || "image/jpeg",
        data: Buffer.from(bytes).toString("base64"),
      };
    } catch {
      return null;
    }
  }
}

function getGeminiConfig(): { apiKey: string; model: string } | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return null;
  return {
    apiKey,
    model: process.env.GEMINI_MODEL?.trim() || "gemini-1.5-flash",
  };
}

export function getGeminiStatus(): { configured: boolean; model: string } {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  return {
    configured: Boolean(apiKey),
    model: process.env.GEMINI_MODEL?.trim() || "gemini-1.5-flash",
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
  
  // Chỉ lấy tối đa 1 ảnh đại diện của đơn báo mất và 1 ảnh đại diện của đồ tìm thấy để tối ưu tốc độ
  const reportKeys = (Array.isArray(report.image_object_keys) ? report.image_object_keys : [])
    .filter((k): k is string => typeof k === "string" && k.trim().length > 0);
  const itemKeys = (Array.isArray(item.image_object_keys) ? item.image_object_keys : [])
    .filter((k): k is string => typeof k === "string" && k.trim().length > 0);

  const selectedKeys: string[] = [];
  const firstReportKey = reportKeys[0];
  if (firstReportKey) selectedKeys.push(firstReportKey);
  const firstItemKey = itemKeys[0];
  if (firstItemKey) selectedKeys.push(firstItemKey);

  // Đọc và nén ảnh song song
  const imageResults = await Promise.all(
    selectedKeys.map(async (key) => {
      try {
        const image = await readObject(key);
        return await optimizeImageForAi(image.bytes, image.contentType);
      } catch (error) {
        console.warn(`Không thể đọc ảnh matching ${key}:`, error);
        return null;
      }
    }),
  );

  for (const img of imageResults) {
    if (img) {
      imageParts.push({
        inlineData: {
          mimeType: img.mimeType,
          data: img.data,
        },
      });
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
  const requestBody = JSON.stringify({
    contents: [{
      parts: [textPart, ...imageParts],
    }],
    generationConfig: { responseMimeType: "application/json" },
  });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: requestBody,
    });
    const payload = await response.json().catch(() => null) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      error?: { message?: string };
    } | null;
    if (response.ok) {
      const text = payload?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error("Gemini không trả về kết quả đối chiếu");
      return parseGeminiResult(text);
    }

    const message = payload?.error?.message || `Gemini request failed (${response.status})`;
    const retryable = response.status === 429 || response.status === 500
      || response.status === 503 || response.status === 504;
    if (!retryable || attempt === 2) {
      throw new Error(message);
    }
    await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
  }
  throw new Error("Gemini matching retry limit reached");
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

  // Lọc nhanh bằng quy tắc Heuristic (danh mục khác nhau, thời gian vô lý,...) để tránh gọi AI lãng phí
  if (!result) {
    const heuristic = evaluateHeuristicFilter(reportData, itemData);
    if (heuristic) {
      result = heuristic;
      provider = "heuristic";
      model = "rule-filter";
    }
  }

  // Nếu vẫn chưa xác định được và cần phân tích hình ảnh/mô tả chuyên sâu -> Gọi Gemini
  if (!result) {
    try {
      result = await askGemini(reportData, itemData);
      provider = "gemini";
      model = process.env.GEMINI_MODEL || "gemini-1.5-flash";
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown matching error";
      await logAudit(null, "LOST_ITEM_MATCH_FAILED", {
        lost_report_id: reportId,
        found_item_id: foundItemId,
        error: errorMessage,
      });
      await createNotification({
        role: "admin",
        title: "⚠️ AI đối chiếu báo mất thất bại",
        message: `Không thể đối chiếu đơn #${reportId} với món đồ #${foundItemId}: ${errorMessage}`,
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
  const itemRes = await pool.query(
    "SELECT id, category, found_at FROM found_items WHERE id = $1",
    [foundItemId],
  );
  if (itemRes.rows.length === 0) return;
  const item = itemRes.rows[0];

  // Chỉ lấy các đơn báo mất có khả năng liên quan (cùng danh mục hoặc "other") và chưa từng so sánh
  const reports = await pool.query(
    `SELECT lr.id
     FROM lost_reports lr
     WHERE lr.status IN ('searching', 'pending')
       AND (
         lr.category = $1
         OR lr.category = 'other'
         OR $1 = 'other'
         OR lr.category IS NULL
         OR $1 IS NULL
       )
       AND lr.id NOT IN (
         SELECT lost_report_id FROM lost_report_matches WHERE found_item_id = $2
       )
     ORDER BY lr.created_at DESC
     LIMIT 10`,
    [item.category || "other", foundItemId],
  );

  for (const report of reports.rows) {
    await matchLostReportWithFoundItem(Number(report.id), foundItemId);
  }
}

export async function matchLostReportAgainstFoundItems(reportId: number): Promise<void> {
  const reportRes = await pool.query(
    "SELECT id, category, lost_at FROM lost_reports WHERE id = $1",
    [reportId],
  );
  if (reportRes.rows.length === 0) return;
  const report = reportRes.rows[0];

  // Chỉ lấy các món đồ có khả năng liên quan (cùng danh mục hoặc "other") và chưa từng so sánh
  const items = await pool.query(
    `SELECT fi.id
     FROM found_items fi
     WHERE fi.status <> 'returned'
       AND (
         fi.category = $1
         OR fi.category = 'other'
         OR $1 = 'other'
         OR fi.category IS NULL
         OR $1 IS NULL
       )
       AND fi.id NOT IN (
         SELECT found_item_id FROM lost_report_matches WHERE lost_report_id = $2
       )
     ORDER BY fi.created_at DESC
     LIMIT 10`,
    [report.category || "other", reportId],
  );

  // Không có món nào để đối chiếu thì không gọi AI và không hiển thị trạng thái
  // "đang tìm" giả. Giữ report ở pending để tự động thử lại khi có món mới.
  if (items.rows.length === 0) {
    await pool.query(
      `UPDATE lost_reports
       SET status = 'pending', updated_at = now()
       WHERE id = $1 AND status IN ('searching', 'pending')`,
      [reportId],
    );
    return;
  }

  for (const item of items.rows) {
    await matchLostReportWithFoundItem(reportId, Number(item.id));
  }
}

export async function scanOpenLostReports(): Promise<void> {
  const reports = await pool.query(
    `SELECT id FROM lost_reports
     WHERE status IN ('searching', 'pending')
     ORDER BY created_at DESC
     LIMIT 5`,
  );
  for (const report of reports.rows) {
    await matchLostReportAgainstFoundItems(Number(report.id));
  }
}
