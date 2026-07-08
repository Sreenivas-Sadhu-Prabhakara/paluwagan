import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createGroup, createMember, buildSchedule } from '../src/model.js';
import {
  computeBalances,
  computeTrustScores,
  computePeriodSummaries,
  computeGroupTotals,
  isPaid,
} from '../src/settlement.js';

// Build a group with deterministic member ids and mark payments.
function buildFullyPaidGroup() {
  const members = ['Ana', 'Ben', 'Cora', 'Dan'].map((n, i) => createMember(n, i));
  const ids = members.map((m) => m.id);
  const payments = {};
  // Everyone pays every period, all on time (dated on/before due date).
  const g0 = createGroup({
    members,
    payoutOrder: ids,
    contribution: 1000,
    frequency: 'monthly',
    startDate: '2026-01-15',
  });
  const schedule = buildSchedule(g0);
  for (const m of members) {
    payments[m.id] = {};
    for (const p of schedule) {
      payments[m.id][p.index] = p.dueDate; // paid exactly on due date -> on time
    }
  }
  return createGroup({ ...g0, payments });
}

test('a fully completed cycle nets to ~0 for every member and overall', () => {
  const g = buildFullyPaidGroup();
  const balances = computeBalances(g);
  // Each member contributes 4×1000 = 4000 and receives the full pot 4×1000 = 4000.
  for (const b of balances) {
    assert.equal(b.contributed, 4000, `${b.name} contributed`);
    assert.equal(b.received, 4000, `${b.name} received`);
    assert.equal(b.net, 0, `${b.name} net`);
  }
  const totals = computeGroupTotals(g);
  assert.equal(totals.totalContributed, 4000 * 4);
  assert.equal(totals.totalReceived, 4000 * 4);
  assert.equal(totals.totalNet, 0);
});

test('totals contributed and received sum correctly mid-cycle', () => {
  const members = ['Ana', 'Ben', 'Cora'].map((n, i) => createMember(n, i));
  const ids = members.map((m) => m.id);
  // Only period 0 fully paid; Ana is the recipient of period 0.
  const payments = {
    [ids[0]]: { 0: true },
    [ids[1]]: { 0: true },
    [ids[2]]: { 0: true },
  };
  const g = createGroup({
    members,
    payoutOrder: ids,
    contribution: 500,
    frequency: 'weekly',
    startDate: '2026-01-01',
    payments,
  });
  const balances = computeBalances(g);
  const totals = computeGroupTotals(g);

  // Each of 3 members paid once -> contributed 500 each -> total 1500.
  assert.equal(totals.totalContributed, 1500);
  // Ana (recipient of period 0) collected the whole 3×500 = 1500 pot.
  const ana = balances.find((b) => b.memberId === ids[0]);
  assert.equal(ana.received, 1500);
  assert.equal(ana.net, 1500 - 500);
  // Others received nothing yet.
  assert.equal(balances.find((b) => b.memberId === ids[1]).received, 0);
  assert.equal(totals.totalReceived, 1500);
});

test('trust score is the on-time rate over due periods with mixed paid/unpaid', () => {
  const members = ['Ana', 'Ben'].map((n, i) => createMember(n, i));
  const [a, b] = members.map((m) => m.id);
  const payments = {
    // Ana: period 0 on time, period 1 late, period 2 unpaid.
    [a]: { 0: '2026-01-15', 1: '2026-03-01' /* due 2026-02-15 -> late */ },
    // Ben: period 0 on time, period 1 on time, period 2 undated (on time).
    [b]: { 0: '2026-01-10', 1: '2026-02-10', 2: true },
  };
  const g = createGroup({
    members,
    payoutOrder: [a, b],
    contribution: 100,
    frequency: 'monthly',
    startDate: '2026-01-15',
    payments,
  });
  // Only 2 members -> 2 periods. Reference well past both due dates so both due.
  const scores = computeTrustScores(g, '2026-06-01');
  const ana = scores.find((s) => s.memberId === a);
  const ben = scores.find((s) => s.memberId === b);

  // 2 periods due for each.
  assert.equal(ana.periodsDue, 2);
  // Ana: period 0 on time, period 1 late -> 1 on time of 2 due = 50%.
  assert.equal(ana.onTime, 1);
  assert.equal(ana.trustPercent, 50);
  // Ben: both on time -> 100%.
  assert.equal(ben.onTime, 2);
  assert.equal(ben.trustPercent, 100);
});

test('trust score only counts periods whose due date has arrived', () => {
  const members = ['Ana', 'Ben', 'Cora'].map((n, i) => createMember(n, i));
  const ids = members.map((m) => m.id);
  const g = createGroup({
    members,
    payoutOrder: ids,
    contribution: 100,
    frequency: 'monthly',
    startDate: '2026-01-15', // periods due 01-15, 02-15, 03-15
    payments: { [ids[0]]: { 0: '2026-01-15' } },
  });
  // Reference right after the first due date only.
  const scores = computeTrustScores(g, '2026-01-20');
  const ana = scores.find((s) => s.memberId === ids[0]);
  assert.equal(ana.periodsDue, 1, 'only the first period is due');
  assert.equal(ana.trustPercent, 100);
  // A member who has not paid the one due period.
  const ben = scores.find((s) => s.memberId === ids[1]);
  assert.equal(ben.periodsDue, 1);
  assert.equal(ben.trustPercent, 0);
});

test('trust rate is null when no periods are due yet', () => {
  const members = ['Ana', 'Ben'].map((n, i) => createMember(n, i));
  const ids = members.map((m) => m.id);
  const g = createGroup({
    members,
    payoutOrder: ids,
    contribution: 100,
    frequency: 'monthly',
    startDate: '2026-06-15',
  });
  const scores = computeTrustScores(g, '2026-01-01'); // before start
  for (const s of scores) {
    assert.equal(s.periodsDue, 0);
    assert.equal(s.trustRate, null);
    assert.equal(s.trustPercent, null);
  }
});

test('period summaries report pot, recipient and who still owes', () => {
  const members = ['Ana', 'Ben', 'Cora'].map((n, i) => createMember(n, i));
  const ids = members.map((m) => m.id);
  const g = createGroup({
    members,
    payoutOrder: ids,
    contribution: 200,
    frequency: 'monthly',
    startDate: '2026-01-15',
    payments: { [ids[0]]: { 0: true }, [ids[1]]: { 0: true } }, // Cora unpaid in period 0
  });
  const summaries = computePeriodSummaries(g, '2026-01-20');
  const p0 = summaries[0];
  assert.equal(p0.recipientId, ids[0]); // Ana receives first
  assert.equal(p0.paidCount, 2);
  assert.equal(p0.unpaidCount, 1);
  assert.equal(p0.potCollected, 400); // 2 × 200
  assert.equal(p0.fullPot, 600); // 3 × 200
  assert.deepEqual(
    p0.unpaidMembers.map((m) => m.name),
    ['Cora'],
  );
});

test('isPaid reflects toggles', () => {
  const members = ['Ana'].map((n, i) => createMember(n, i));
  const g = createGroup({ members, payoutOrder: [members[0].id], payments: { [members[0].id]: { 0: true } } });
  assert.equal(isPaid(g, members[0].id, 0), true);
  assert.equal(isPaid(g, members[0].id, 1), false);
  assert.equal(isPaid(g, 'nobody', 0), false);
});
