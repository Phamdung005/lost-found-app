import type { PoolClient } from "pg";

/** Close actionable workflows after an item has been physically returned. */
export async function closeWorkflowsForReturnedItem(
  client: PoolClient,
  foundItemId: number,
  completedClaimId?: number,
): Promise<number[]> {
  const params: Array<number> = [foundItemId];
  let filter = "found_item_id = $1 AND status IN ('pending', 'approved', 'redeeming')";
  if (Number.isInteger(completedClaimId) && completedClaimId! > 0) {
    params.push(completedClaimId!);
    filter += ` AND id <> $${params.length}`;
  }

  const claims = await client.query(
    `UPDATE found_item_claims
     SET status = 'cancelled',
         rejection_reason = COALESCE(rejection_reason, 'Món đồ đã được trao trả cho người nhận.'),
         claim_code = NULL,
         code_expires_at = NULL,
         updated_at = now()
     WHERE ${filter}
     RETURNING user_id`,
    params,
  );

  await client.query(
    `UPDATE lost_report_matches SET status = 'cancelled'
     WHERE found_item_id = $1 AND status <> 'cancelled'`,
    [foundItemId],
  );

  await client.query(
    `UPDATE lost_reports
     SET status = 'closed', updated_at = now()
     WHERE status IN ('searching', 'pending')
       AND id IN (
         SELECT lost_report_id FROM lost_report_matches WHERE found_item_id = $1
       )`,
    [foundItemId],
  );

  return [...new Set(claims.rows.map((row) => Number(row.user_id)).filter((id) => id > 0))];
}
