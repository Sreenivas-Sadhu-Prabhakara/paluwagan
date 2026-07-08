// settlement.js — pure balances + trust-score math. DOM-free, clock-free.
//
// Given a group (see model.js) and a reference date, compute:
//   - per-member balances (total contributed, total received, net)
//   - per-member trust scores (on-time payment rate)
//   - per-period status (pot size, who receives, who still owes)
//
// A payment is recorded in group.payments[memberId][periodIndex]. The value is
// either `true` (paid, on-time unknown) or a YYYY-MM-DD string (the date it was
// marked paid). A payment counts as "on time" when its recorded date is on or
// before that period's due date; a bare `true` is treated as on time.

import {
  buildSchedule,
  periodCount,
  parseISODateUTC,
  sanitizeAmount,
} from './model.js';

// Has member `memberId` paid into period `index`?
export function isPaid(group, memberId, index) {
  const forMember = group && group.payments ? group.payments[memberId] : undefined;
  if (!forMember) return false;
  return Boolean(forMember[index]);
}

// The recorded pay date (YYYY-MM-DD) for a payment, or null if paid-but-undated
// or unpaid.
export function paidDate(group, memberId, index) {
  const forMember = group && group.payments ? group.payments[memberId] : undefined;
  const v = forMember ? forMember[index] : undefined;
  if (!v) return null;
  if (v === true) return null;
  return typeof v === 'string' ? v : null;
}

// A period is "due" (its contributions are expected) when its due date is on or
// before the reference date. When the group has no start date, every period is
// considered due (so the ledger is usable immediately).
export function isPeriodDue(schedule, index, referenceDateStr) {
  const period = schedule[index];
  if (!period || !period.dueDate) return true;
  const ref = parseISODateUTC(referenceDateStr);
  const due = parseISODateUTC(period.dueDate);
  if (!ref || !due) return true;
  return due.getTime() <= ref.getTime();
}

// Per-member balances across the full cycle.
// Contributions: a member contributes `contribution` for every period they've paid.
// Receipts: a member receives the whole pot in the one period where they are the
// recipient — the pot equals contribution × (#members) once everyone has paid.
// Net = received − contributed.
export function computeBalances(group) {
  const g = group || {};
  const members = g.members || [];
  const schedule = buildSchedule(g);
  const n = periodCount(g);
  const contribution = sanitizeAmount(g.contribution);
  const potFull = round2(contribution * members.length);

  return members.map((member) => {
    let paidPeriods = 0;
    for (let i = 0; i < n; i += 1) {
      if (isPaid(g, member.id, i)) paidPeriods += 1;
    }
    const contributed = round2(contribution * paidPeriods);

    // received: for the period this member is the recipient, they receive the
    // pot for that period. We credit the pot amount that has actually been paid
    // in that period so partial periods reconcile; but the headline "received"
    // is the full pot when the group is settled. We compute actual received =
    // sum of contributions collected in the member's recipient period.
    let received = 0;
    const recipientPeriod = schedule.findIndex((p) => p.recipientId === member.id);
    if (recipientPeriod >= 0) {
      let collected = 0;
      for (const m of members) {
        if (isPaid(g, m.id, recipientPeriod)) collected += 1;
      }
      received = round2(contribution * collected);
    }

    return {
      memberId: member.id,
      name: member.name,
      paidPeriods,
      contributed,
      received,
      net: round2(received - contributed),
      // fullPotWhenSettled is the amount they get once everyone pays that period
      fullPot: potFull,
    };
  });
}

// Per-member trust score = on-time payments / periods that were due for them.
// "Due for them" = periods whose due date is on/before the reference date. A
// member is never the recipient of their own contribution obligation — they
// still contribute in the period they receive (that is the standard rule: the
// recipient also pays in, then takes the pot), so all periods count as due.
export function computeTrustScores(group, referenceDateStr) {
  const g = group || {};
  const members = g.members || [];
  const schedule = buildSchedule(g);
  const n = periodCount(g);

  return members.map((member) => {
    let due = 0;
    let paid = 0;
    let onTime = 0;
    for (let i = 0; i < n; i += 1) {
      const periodDue = isPeriodDue(schedule, i, referenceDateStr);
      if (!periodDue) continue;
      due += 1;
      if (isPaid(g, member.id, i)) {
        paid += 1;
        if (isOnTime(schedule, i, paidDate(g, member.id, i))) onTime += 1;
      }
    }
    const rate = due === 0 ? null : onTime / due;
    return {
      memberId: member.id,
      name: member.name,
      periodsDue: due,
      periodsPaid: paid,
      onTime,
      // null means "no periods due yet" -> UI shows a neutral placeholder
      trustRate: rate,
      trustPercent: rate === null ? null : Math.round(rate * 100),
    };
  });
}

// A payment is on time if no recorded date, or recorded date <= due date.
function isOnTime(schedule, index, payDateStr) {
  if (!payDateStr) return true; // undated payment treated as on time
  const period = schedule[index];
  if (!period || !period.dueDate) return true;
  const due = parseISODateUTC(period.dueDate);
  const pay = parseISODateUTC(payDateStr);
  if (!due || !pay) return true;
  return pay.getTime() <= due.getTime();
}

// Per-period summary for the ledger/dashboard.
export function computePeriodSummaries(group, referenceDateStr) {
  const g = group || {};
  const members = g.members || [];
  const schedule = buildSchedule(g);
  const contribution = sanitizeAmount(g.contribution);
  const fullPot = round2(contribution * members.length);

  return schedule.map((period) => {
    const paidMembers = [];
    const unpaidMembers = [];
    for (const m of members) {
      if (isPaid(g, m.id, period.index)) paidMembers.push(m);
      else unpaidMembers.push(m);
    }
    return {
      index: period.index,
      dueDate: period.dueDate,
      recipientId: period.recipientId,
      recipientName: period.recipientName,
      due: isPeriodDue(schedule, period.index, referenceDateStr),
      potCollected: round2(contribution * paidMembers.length),
      fullPot,
      paidCount: paidMembers.length,
      unpaidCount: unpaidMembers.length,
      unpaidMembers: unpaidMembers.map((m) => ({ id: m.id, name: m.name })),
    };
  });
}

// Aggregate whole-group totals (useful for a sanity check + the dashboard).
export function computeGroupTotals(group) {
  const balances = computeBalances(group);
  const totalContributed = round2(balances.reduce((s, b) => s + b.contributed, 0));
  const totalReceived = round2(balances.reduce((s, b) => s + b.received, 0));
  const totalNet = round2(balances.reduce((s, b) => s + b.net, 0));
  return { totalContributed, totalReceived, totalNet };
}

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}
