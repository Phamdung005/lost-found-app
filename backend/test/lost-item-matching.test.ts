import assert from "node:assert/strict";
import test from "node:test";
import { findExactMatch } from "../src/services/lost-item-matching.js";

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
