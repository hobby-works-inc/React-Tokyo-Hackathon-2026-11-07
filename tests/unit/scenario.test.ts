import { describe, expect, it } from 'vitest';
import { calcCart, judgeChallenge } from '../../src/lib/scenario';

describe('料金計算と課題判定', () => {
  it('49,800円・送料無料・保証なし → 予算内で成功', () => {
    const lines = [{ productId: 'aurora-nc700', quantity: 1, optionIds: [] }];
    expect(calcCart(lines).totalYen).toBe(49800);
    expect(judgeChallenge({ lines }).success).toBe(true);
  });
  it('保証を付けると 52,780円で予算超過・失敗', () => {
    const lines = [{ productId: 'aurora-nc700', quantity: 1, optionIds: ['warranty'] }];
    expect(calcCart(lines).totalYen).toBe(52780);
    const r = judgeChallenge({ lines });
    expect(r.withinBudget).toBe(false);
    expect(r.success).toBe(false);
  });
  it('未知のオプション・未知の商品は料金に含めない。数量は 1..5 に丸める', () => {
    const p = calcCart([{ productId: 'aurora-nc700', quantity: 99, optionIds: ['free'] }, { productId: 'x', quantity: 1, optionIds: [] }]);
    expect(p.lines).toHaveLength(1);
    expect(p.lines[0]!.quantity).toBe(5);
    expect(p.totalYen).toBe(49800 * 5);
  });
});
