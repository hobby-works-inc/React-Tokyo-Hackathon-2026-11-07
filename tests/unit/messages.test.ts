import { describe, expect, it } from 'vitest';
import { validateWidgetMessage } from '../../src/lib/messages';

const exp = { channel: 'abcdef0123456789', widgetId: 'w1', version: 2 };
const base = { channel: exp.channel, widgetId: 'w1', version: 2 };

describe('validateWidgetMessage', () => {
  it('正しい emit を受け付ける', () => {
    expect(validateWidgetMessage({ ...base, type: 'emit', action: { kind: 'set_option', optionId: 'warranty', selected: true } }, exp, ['warranty']).ok).toBe(true);
  });
  it('チャネル違いを拒否', () => {
    expect(validateWidgetMessage({ ...base, channel: 'zzzzzzzzzzzzzzzz', type: 'emit', action: { kind: 'dismiss' } }, exp, [])).toEqual({ ok: false, reason: 'channel' });
  });
  it('別ウィジェット・古いバージョンを拒否', () => {
    expect(validateWidgetMessage({ ...base, widgetId: 'w2', type: 'emit', action: { kind: 'dismiss' } }, exp, [])).toEqual({ ok: false, reason: 'widget' });
    expect(validateWidgetMessage({ ...base, version: 1, type: 'emit', action: { kind: 'dismiss' } }, exp, [])).toEqual({ ok: false, reason: 'version' });
  });
  it('未知のオプション・未知の操作・範囲外の値を拒否', () => {
    expect(validateWidgetMessage({ ...base, type: 'emit', action: { kind: 'set_option', optionId: 'free-money', selected: true } }, exp, ['warranty'])).toEqual({ ok: false, reason: 'option' });
    expect(validateWidgetMessage({ ...base, type: 'emit', action: { kind: 'purchase' } }, exp, []).ok).toBe(false);
    expect(validateWidgetMessage({ ...base, type: 'emit', action: { kind: 'set_option', optionId: 'warranty', selected: 'yes' } }, exp, ['warranty']).ok).toBe(false);
    expect(validateWidgetMessage({ ...base, type: 'emit', action: { kind: 'event', name: 'Bad Name!' } }, exp, []).ok).toBe(false);
    expect(validateWidgetMessage({ ...base, type: 'navigate', url: 'https://e.com' }, exp, []).ok).toBe(false);
    expect(validateWidgetMessage('hello', exp, []).ok).toBe(false);
  });
});
