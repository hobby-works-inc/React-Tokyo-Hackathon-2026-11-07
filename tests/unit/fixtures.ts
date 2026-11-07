import type { ObservationInput } from '../../src/lib/schema';

export function makeInput(over: Partial<ObservationInput> = {}): ObservationInput {
  return {
    sessionId: 's1',
    requestId: 'r1',
    pageId: 'product',
    mode: 'challenge',
    stateRevision: 3,
    uiRevision: 1,
    modeRevision: 0,
    trigger: 'observation_window',
    metricScopes: { regions: 'deltaWindow', regionsCumulative: 'sincePageView', recentEvents: 'contextWindow' },
    deltaWindow: { fromMs: 0, toMs: 5000 },
    contextWindowMs: 30000,
    pageState: {
      visible: true, focused: true, pointerType: 'mouse', lastInputMethod: 'pointer', scrollY: 0, viewportWidth: 1280, viewportHeight: 800,
      msSinceLastInteraction: 100, hostModalOpen: false, scroll: { downPx: 0, upPx: 0, reversals: 0, stops: 0 }, idleNotice: false,
    },
    regions: [
      { id: 'price', label: '価格', visibleRatio: 1, visibleMs: 5000, upperBandExposureMs: 3000, cursorDwellMs: 2000, cursorStationaryMs: 1000, revisitCount: 1, clickCount: 0, cumulative: { visibleMs: 5000, cursorDwellMs: 2000, revisitCount: 1, clickCount: 0 } },
      { id: 'purchase', label: '購入欄', visibleRatio: 1, visibleMs: 5000, upperBandExposureMs: 0, cursorDwellMs: 0, cursorStationaryMs: 0, revisitCount: 0, clickCount: 0, cumulative: { visibleMs: 5000, cursorDwellMs: 0, revisitCount: 0, clickCount: 0 } },
    ],
    recentEvents: [{ id: 'e1', atMs: 1000, type: 'click', regionId: 'price', isNew: true }],
    scenario: {
      task: 't', budgetYen: 50000,
      product: { id: 'aurora-nc700', name: 'A', priceYen: 49800, shippingYen: 0, shippingNote: '送料無料', options: [{ id: 'warranty', label: '延長保証', priceYen: 2980, description: 'd' }] },
      cart: { lines: [], totalYen: 0, shippingYen: 0 },
      pendingOptionIds: [],
    },
    currentUI: {
      pageSummary: 'p',
      availableSlots: [{ slot: 'near_price', description: 'x' }, { slot: 'near_purchase', description: 'y' }, { slot: 'overlay', description: 'z' }],
      regionDescriptions: [],
      widgets: [],
      maxActiveWidgets: 3,
    },
    recentInterventions: [],
    ...over,
  };
}

export const GOOD_TSX = `import React, { useState } from 'react';
export default function GeneratedWidget({ context, emit }) {
  const [x, setX] = useState(0);
  return <button data-action-id="b" onClick={() => { setX(x + 1); emit({ kind: 'dismiss' }); }}>¥{context.product.priceYen}</button>;
}`;
