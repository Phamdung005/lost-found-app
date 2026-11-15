import assert from "node:assert/strict";
import test from "node:test";
import { findExactMatch, evaluateHeuristicFilter } from "../src/services/lost-item-matching.js";

test("prioritizes an exact identifier match over the AI score", () => {
  const result = findExactMatch(
    { item_name: "Thẻ sinh viên", description: "Mã sinh viên là 23010681, dây thẻ màu đỏ" },
    { item_name: "Thẻ sinh viên", description: "Mã sinh viên 23010681, dây thẻ đỏ" },
  );

  assert.equal(result?.score, 1);
  assert.match(result?.rationale || "", /23010681/);
});

test("does not force a match without a shared distinctive identifier", () => {
  const result = findExactMatch(
    { item_name: "Thẻ sinh viên", description: "Dây thẻ màu đỏ" },
    { item_name: "Thẻ sinh viên", description: "Dây thẻ màu xanh" },
  );

  assert.equal(result, null);
});

test("filters out incompatible categories early without calling AI", () => {
  const result = evaluateHeuristicFilter(
    { category: "electronics", item_name: "iPhone 13" },
    { category: "clothing", item_name: "Áo khoác gió" },
  );

  assert.ok(result);
  assert.equal(result.score, 0.05);
  assert.match(result.rationale, /Danh mục đồ vật không tương đồng/);
});

test("filters out impossible timelines early", () => {
  const result = evaluateHeuristicFilter(
    { category: "other", item_name: "Ví da", lost_at: "2026-11-15T10:00:00.000Z" },
    { category: "other", item_name: "Ví da", found_at: "2026-11-10T10:00:00.000Z" },
  );

  assert.ok(result);
  assert.equal(result.score, 0.05);
  assert.match(result.rationale, /trước thời điểm báo mất quá lâu/);
});

test("allows potentially matching items to proceed to AI analysis", () => {
  const result = evaluateHeuristicFilter(
    { category: "wallet", item_name: "Ví da cá sấu", image_object_keys: ["images/report.jpg"] },
    { category: "wallet", item_name: "Ví da màu đen", image_object_keys: ["images/item.jpg"] },
  );

  assert.equal(result, null);
});
