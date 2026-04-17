const assert = require('assert');
const api = require('../api/index.js');

const rules = api._test;

assert.ok(rules, 'api._test should expose price rule helpers');

assert.deepStrictEqual(
  rules.normalizePricePlan(
    {
      type: 'venue_rate',
      campus: 'mabao',
      dateType: '工作日',
      startTime: '16:00',
      endTime: '20:00',
      unitPrice: '220',
      status: '',
      notes: '黄金时间'
    },
    'price-1',
    '2026-04-18T00:00:00.000Z'
  ),
  {
    id: 'price-1',
    type: 'venue_rate',
    campus: 'mabao',
    dateType: '工作日',
    startTime: '16:00',
    endTime: '20:00',
    unitPrice: 220,
    channel: '',
    productName: '',
    productType: '',
    businessType: '',
    durationMinutes: 0,
    salePrice: 0,
    status: 'active',
    effectiveFrom: '',
    effectiveTo: '',
    notes: '黄金时间',
    createdAt: '2026-04-18T00:00:00.000Z',
    updatedAt: '2026-04-18T00:00:00.000Z'
  },
  'venue price plan should normalize money, status, and empty channel fields'
);

assert.deepStrictEqual(
  rules.normalizePricePlan(
    {
      type: 'channel_product',
      channel: '大众点评',
      productName: '黄金时段 场地预定 1H',
      productType: '订场券',
      businessType: 'court',
      durationMinutes: '60',
      salePrice: '220',
      status: 'inactive'
    },
    'price-2',
    '2026-04-18T00:00:00.000Z'
  ),
  {
    id: 'price-2',
    type: 'channel_product',
    campus: '',
    dateType: '',
    startTime: '',
    endTime: '',
    unitPrice: 0,
    channel: '大众点评',
    productName: '黄金时段 场地预定 1H',
    productType: '订场券',
    businessType: 'court',
    durationMinutes: 60,
    salePrice: 220,
    status: 'inactive',
    effectiveFrom: '',
    effectiveTo: '',
    notes: '',
    createdAt: '2026-04-18T00:00:00.000Z',
    updatedAt: '2026-04-18T00:00:00.000Z'
  },
  'channel product price plan should normalize product fields'
);

assert.throws(
  () => rules.normalizePricePlan({ type: 'venue_rate', campus: 'mabao', dateType: '工作日', startTime: '20:00', endTime: '16:00', unitPrice: 220 }),
  /结束时间必须晚于开始时间/,
  'venue price plan requires a valid time range'
);

assert.throws(
  () => rules.normalizePricePlan({ type: 'channel_product', channel: '大众点评', productType: '订场券', businessType: 'court', salePrice: 220 }),
  /请填写渠道商品名称/,
  'channel product price plan requires product name'
);

const mabaoVenuePrices = [
  { id: 'weekday-early', type: 'venue_rate', campus: 'mabao', dateType: '工作日', startTime: '06:00', endTime: '08:00', unitPrice: 100, status: 'active' },
  { id: 'weekday-day', type: 'venue_rate', campus: 'mabao', dateType: '工作日', startTime: '08:00', endTime: '16:00', unitPrice: 140, status: 'active' },
  { id: 'weekday-prime', type: 'venue_rate', campus: 'mabao', dateType: '工作日', startTime: '16:00', endTime: '20:00', unitPrice: 220, status: 'active' },
  { id: 'weekday-night', type: 'venue_rate', campus: 'mabao', dateType: '工作日', startTime: '20:00', endTime: '22:00', unitPrice: 180, status: 'active' },
  { id: 'weekend-early', type: 'venue_rate', campus: 'mabao', dateType: '周末节假日', startTime: '06:00', endTime: '08:00', unitPrice: 100, status: 'active' },
  { id: 'weekend-day', type: 'venue_rate', campus: 'mabao', dateType: '周末节假日', startTime: '08:00', endTime: '22:00', unitPrice: 220, status: 'active' }
];

assert.deepStrictEqual(
  rules.quoteVenuePrice(mabaoVenuePrices, {
    campus: 'mabao',
    date: '2026-04-20',
    startTime: '16:00',
    endTime: '18:00'
  }),
  {
    pricePlanIds: ['weekday-prime'],
    dateType: '工作日',
    systemAmount: 440,
    originalAmount: 440,
    memberDiscount: 1,
    segments: [{ pricePlanId: 'weekday-prime', startTime: '16:00', endTime: '18:00', unitPrice: 220, amount: 440 }]
  },
  'weekday prime venue booking should quote by hour'
);

assert.strictEqual(
  rules.quoteVenuePrice(mabaoVenuePrices, {
    campus: 'mabao',
    date: '2026-04-20',
    startTime: '16:00',
    endTime: '17:00',
    memberDiscount: 0.9
  }).systemAmount,
  198,
  'member discount should apply to venue price'
);

assert.strictEqual(
  rules.quoteVenuePrice(mabaoVenuePrices, {
    campus: 'mabao',
    date: '2026-04-19',
    startTime: '08:00',
    endTime: '10:00'
  }).systemAmount,
  440,
  'weekend booking should use weekend venue price'
);

console.log('price rules tests passed');
