import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createGroup,
  createMember,
  buildSchedule,
  addPeriods,
  currentPeriodIndex,
  isCycleComplete,
  normalizeCurrency,
  normalizeFrequency,
  sanitizeAmount,
  normalizeDateString,
  periodCount,
  CURRENCIES,
} from '../src/model.js';

function fixedGroup(overrides = {}) {
  return createGroup({
    id: 'g_test',
    name: 'Meetup Fund',
    currency: 'PHP',
    contribution: 1000,
    frequency: 'monthly',
    startDate: '2026-01-15',
    members: ['Ana', 'Ben', 'Cora', 'Dan'],
    ...overrides,
  });
}

test('n members produce exactly n periods', () => {
  const g = fixedGroup();
  const schedule = buildSchedule(g);
  assert.equal(g.members.length, 4);
  assert.equal(periodCount(g), 4);
  assert.equal(schedule.length, 4);
});

test('each member receives the pot exactly once', () => {
  const g = fixedGroup();
  const schedule = buildSchedule(g);
  const recipients = schedule.map((p) => p.recipientId);
  const unique = new Set(recipients);
  assert.equal(unique.size, g.members.length);
  for (const m of g.members) {
    const count = recipients.filter((id) => id === m.id).length;
    assert.equal(count, 1, `${m.name} should receive exactly once`);
  }
});

test('explicit payout order is respected and completed', () => {
  const members = ['Ana', 'Ben', 'Cora', 'Dan'].map((n, i) => createMember(n, i));
  const ids = members.map((m) => m.id);
  // Reverse rotation, but omit one id to prove it gets appended.
  const g = createGroup({
    members,
    payoutOrder: [ids[3], ids[1]],
    contribution: 500,
    startDate: '2026-01-01',
    frequency: 'weekly',
  });
  // First two follow the explicit order.
  assert.equal(g.payoutOrder[0], ids[3]);
  assert.equal(g.payoutOrder[1], ids[1]);
  // All members present exactly once.
  assert.equal(new Set(g.payoutOrder).size, 4);
  assert.deepEqual([...g.payoutOrder].sort(), [...ids].sort());
});

test('duplicate ids in payout order are de-duplicated', () => {
  const members = ['Ana', 'Ben'].map((n, i) => createMember(n, i));
  const [a, b] = members.map((m) => m.id);
  const g = createGroup({ members, payoutOrder: [a, a, b, b] });
  assert.deepEqual(g.payoutOrder, [a, b]);
});

test('addPeriods handles weekly, biweekly and monthly in UTC', () => {
  assert.equal(addPeriods('2026-01-01', 'weekly', 0), '2026-01-01');
  assert.equal(addPeriods('2026-01-01', 'weekly', 1), '2026-01-08');
  assert.equal(addPeriods('2026-01-01', 'biweekly', 2), '2026-01-29');
  assert.equal(addPeriods('2026-01-15', 'monthly', 1), '2026-02-15');
  assert.equal(addPeriods('2026-01-15', 'monthly', 3), '2026-04-15');
});

test('monthly rollover clamps to end of shorter months', () => {
  // Jan 31 + 1 month -> Feb 28 (2026 is not a leap year)
  assert.equal(addPeriods('2026-01-31', 'monthly', 1), '2026-02-28');
  // Jan 31 + 1 month in a leap year -> Feb 29
  assert.equal(addPeriods('2028-01-31', 'monthly', 1), '2028-02-29');
});

test('schedule due dates advance by frequency', () => {
  const g = fixedGroup({ frequency: 'monthly', startDate: '2026-01-15' });
  const schedule = buildSchedule(g);
  assert.deepEqual(
    schedule.map((p) => p.dueDate),
    ['2026-01-15', '2026-02-15', '2026-03-15', '2026-04-15'],
  );
});

test('currentPeriodIndex tracks the reference date', () => {
  const g = fixedGroup(); // monthly from 2026-01-15, 4 periods
  assert.equal(currentPeriodIndex(g, '2026-01-01'), 0, 'before start -> first period');
  assert.equal(currentPeriodIndex(g, '2026-01-15'), 0);
  assert.equal(currentPeriodIndex(g, '2026-02-20'), 1);
  assert.equal(currentPeriodIndex(g, '2026-04-15'), 3);
  assert.equal(currentPeriodIndex(g, '2026-12-01'), 3, 'after end clamps to last');
});

test('isCycleComplete is true only past the final due date', () => {
  const g = fixedGroup();
  assert.equal(isCycleComplete(g, '2026-04-15'), false);
  assert.equal(isCycleComplete(g, '2026-04-16'), true);
});

test('currencies and frequencies normalize with sane fallbacks', () => {
  assert.equal(normalizeCurrency('USD'), 'USD');
  assert.equal(normalizeCurrency('XXX'), 'PHP');
  assert.equal(normalizeFrequency('weekly'), 'weekly');
  assert.equal(normalizeFrequency('daily'), 'monthly');
  assert.ok(CURRENCIES.some((c) => c.code === 'PHP' && c.symbol === '₱'));
});

test('sanitizeAmount rejects junk and rounds to cents', () => {
  assert.equal(sanitizeAmount('1000.5'), 1000.5);
  assert.equal(sanitizeAmount(-5), 0);
  assert.equal(sanitizeAmount('abc'), 0);
  assert.equal(sanitizeAmount(10.005), 10.01);
});

test('normalizeDateString extracts YYYY-MM-DD or empty', () => {
  assert.equal(normalizeDateString('2026-03-09'), '2026-03-09');
  assert.equal(normalizeDateString('2026-03-09T12:00:00Z'), '2026-03-09');
  assert.equal(normalizeDateString(''), '');
  assert.equal(normalizeDateString('not a date'), '');
});

test('createGroup fills sensible defaults for empty input', () => {
  const g = createGroup({});
  assert.equal(g.name, 'Savings Group');
  assert.equal(g.currency, 'PHP');
  assert.equal(g.frequency, 'monthly');
  assert.equal(g.contribution, 0);
  assert.deepEqual(g.members, []);
  assert.deepEqual(g.payoutOrder, []);
});
