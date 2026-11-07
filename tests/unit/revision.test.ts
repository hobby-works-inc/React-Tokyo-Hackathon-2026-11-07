import { describe, expect, it } from 'vitest';
import { canApply } from '../../src/lib/revision';

const stamp = { requestId: 'r1', epoch: 1, stateRevision: 5, uiRevision: 2, modeRevision: 0, mode: 'challenge' as const };
const cur = { epoch: 1, stateRevision: 5, uiRevision: 2, modeRevision: 0, mode: 'challenge' as const, ended: false, latestRequestId: 'r1' };
const dec = { requestId: 'r1', basedOnStateRevision: 5, basedOnUiRevision: 2 };

describe('canApply', () => {
  it('一致すれば適用', () => expect(canApply(stamp, cur, dec)).toEqual({ ok: true }));
  it('カート等の状態が変わっていたら適用しない', () => expect(canApply(stamp, { ...cur, stateRevision: 6 }, dec)).toEqual({ ok: false, reason: 'state' }));
  it('UI が変わっていたら適用しない', () => expect(canApply(stamp, { ...cur, uiRevision: 3 }, dec)).toEqual({ ok: false, reason: 'ui' }));
  it('モード切替前の応答は適用しない', () => expect(canApply(stamp, { ...cur, mode: 'defend', modeRevision: 1 }, dec)).toEqual({ ok: false, reason: 'mode' }));
  it('リセット後は適用しない', () => expect(canApply(stamp, { ...cur, epoch: 2 }, dec)).toEqual({ ok: false, reason: 'epoch' }));
  it('終了後は適用しない', () => expect(canApply(stamp, { ...cur, ended: true }, dec)).toEqual({ ok: false, reason: 'ended' }));
  it('新しいリクエストに置き換えられていたら適用しない', () => expect(canApply(stamp, { ...cur, latestRequestId: 'r2' }, dec)).toEqual({ ok: false, reason: 'superseded' }));
  it('応答の基準リビジョンが違えば適用しない', () => expect(canApply(stamp, cur, { ...dec, basedOnStateRevision: 4 })).toEqual({ ok: false, reason: 'state' }));
});
