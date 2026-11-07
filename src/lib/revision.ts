// 古い画面・古いカート状態・切替前のモードに対するレスポンスを適用しないための判定。

export type Revisions = {
  /** リセットのたびに増える */
  epoch: number;
  /** ページ・カート・認証などの状態 */
  stateRevision: number;
  /** 生成ウィジェットの構成 */
  uiRevision: number;
  /** challenge/defend の切替 */
  modeRevision: number;
};

export type RequestStamp = Revisions & { requestId: string; mode: 'challenge' | 'defend' };

export type ApplyCheck =
  | { ok: true }
  | { ok: false; reason: 'ended' | 'epoch' | 'mode' | 'state' | 'ui' | 'request' | 'superseded' };

export function canApply(
  stamp: RequestStamp,
  current: Revisions & { mode: 'challenge' | 'defend'; ended: boolean; latestRequestId: string | null },
  decision: { requestId: string; basedOnStateRevision: number; basedOnUiRevision: number },
): ApplyCheck {
  if (current.ended) return { ok: false, reason: 'ended' };
  if (stamp.epoch !== current.epoch) return { ok: false, reason: 'epoch' };
  if (stamp.mode !== current.mode || stamp.modeRevision !== current.modeRevision) return { ok: false, reason: 'mode' };
  if (decision.requestId !== stamp.requestId) return { ok: false, reason: 'request' };
  if (current.latestRequestId !== null && current.latestRequestId !== stamp.requestId) return { ok: false, reason: 'superseded' };
  if (stamp.stateRevision !== current.stateRevision || decision.basedOnStateRevision !== stamp.stateRevision) {
    return { ok: false, reason: 'state' };
  }
  if (stamp.uiRevision !== current.uiRevision || decision.basedOnUiRevision !== stamp.uiRevision) {
    return { ok: false, reason: 'ui' };
  }
  return { ok: true };
}
