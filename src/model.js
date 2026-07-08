// model.js — pure, DOM-free group/schedule/rotation construction.
//
// Domain: a savings group (paluwagan / ROSCA / chit fund / tanda / susu / hui / ajo).
// Everyone contributes a fixed amount each period; each period exactly one member
// receives the whole pot; the receiving member rotates until everyone has received
// once. Therefore #members === #periods.
//
// Everything here is deterministic: any date-dependent function takes dates as
// parameters and never reads the clock. The UI supplies real dates; tests supply
// fixed ones.

export const FREQUENCIES = Object.freeze(['weekly', 'biweekly', 'monthly']);

export const CURRENCIES = Object.freeze([
  { code: 'PHP', symbol: '₱', label: 'Philippine Peso' },
  { code: 'USD', symbol: '$', label: 'US Dollar' },
  { code: 'EUR', symbol: '€', label: 'Euro' },
  { code: 'INR', symbol: '₹', label: 'Indian Rupee' },
]);

export const SCHEMA_VERSION = 1;

let idCounter = 0;

// Deterministic-ish id: caller may pass a seed for reproducibility in tests.
export function makeId(prefix = 'id', seed) {
  if (seed !== undefined) return `${prefix}_${seed}`;
  idCounter += 1;
  return `${prefix}_${idCounter.toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

// Create a member record.
export function createMember(name, seed) {
  const clean = String(name == null ? '' : name).trim();
  return { id: makeId('m', seed), name: clean };
}

// Validate + normalise a currency code, falling back to PHP.
export function normalizeCurrency(code) {
  const found = CURRENCIES.find((c) => c.code === code);
  return found ? found.code : 'PHP';
}

export function currencyMeta(code) {
  return CURRENCIES.find((c) => c.code === code) || CURRENCIES[0];
}

export function normalizeFrequency(freq) {
  return FREQUENCIES.includes(freq) ? freq : 'monthly';
}

// Build a fresh group. `members` is an array of names or member objects.
// `payoutOrder` (optional) is an array of member ids giving the rotation; if
// omitted the rotation follows member insertion order.
export function createGroup(input = {}) {
  const members = (input.members || []).map((m) =>
    typeof m === 'string' ? createMember(m) : { id: m.id || makeId('m'), name: String(m.name || '').trim() },
  );

  const memberIds = members.map((m) => m.id);
  let payoutOrder = Array.isArray(input.payoutOrder) ? input.payoutOrder.filter((id) => memberIds.includes(id)) : [];
  // Ensure every member appears exactly once in the rotation, preserving any
  // explicit order the caller gave and appending the rest in insertion order.
  for (const id of memberIds) {
    if (!payoutOrder.includes(id)) payoutOrder.push(id);
  }
  payoutOrder = payoutOrder.filter((id, i) => payoutOrder.indexOf(id) === i);

  return {
    schemaVersion: SCHEMA_VERSION,
    id: input.id || makeId('g'),
    name: String(input.name || '').trim() || 'Savings Group',
    currency: normalizeCurrency(input.currency),
    contribution: sanitizeAmount(input.contribution),
    frequency: normalizeFrequency(input.frequency),
    startDate: normalizeDateString(input.startDate),
    members,
    payoutOrder,
    // payments: { [memberId]: { [periodIndex]: paidDateISO | true } }
    payments: input.payments && typeof input.payments === 'object' ? input.payments : {},
  };
}

export function sanitizeAmount(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  // keep 2 decimals of precision without floating fuzz
  return Math.round(n * 100) / 100;
}

// Return YYYY-MM-DD or '' — never throws.
export function normalizeDateString(value) {
  if (!value) return '';
  const s = String(value);
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '';
  return isoDate(d);
}

// Format a Date as YYYY-MM-DD in UTC (deterministic, tz-independent).
export function isoDate(date) {
  const y = date.getUTCFullYear();
  const mo = String(date.getUTCMonth() + 1).padStart(2, '0');
  const da = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${mo}-${da}`;
}

// Add periods of the given frequency to a base YYYY-MM-DD date, returning YYYY-MM-DD.
// Uses UTC arithmetic so results never depend on the machine timezone.
export function addPeriods(startDateStr, frequency, count) {
  const base = parseISODateUTC(startDateStr);
  if (!base) return '';
  const freq = normalizeFrequency(frequency);
  const d = new Date(base.getTime());
  if (freq === 'weekly') {
    d.setUTCDate(d.getUTCDate() + 7 * count);
  } else if (freq === 'biweekly') {
    d.setUTCDate(d.getUTCDate() + 14 * count);
  } else {
    // monthly: clamp to end of month when needed (e.g. Jan 31 + 1mo -> Feb 28/29)
    const day = d.getUTCDate();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + count);
    const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    d.setUTCDate(Math.min(day, lastDay));
  }
  return isoDate(d);
}

export function parseISODateUTC(str) {
  const s = normalizeDateString(str);
  if (!s) return null;
  const [y, m, d] = s.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return Number.isNaN(date.getTime()) ? null : date;
}

// Build the full schedule: one period per member, in payout-rotation order.
// Returns an array of { index, dueDate, recipientId, recipientName }.
export function buildSchedule(group) {
  const g = group || {};
  const order = Array.isArray(g.payoutOrder) ? g.payoutOrder : [];
  const memberById = new Map((g.members || []).map((m) => [m.id, m]));
  return order.map((recipientId, index) => {
    const member = memberById.get(recipientId);
    return {
      index,
      dueDate: g.startDate ? addPeriods(g.startDate, g.frequency, index) : '',
      recipientId,
      recipientName: member ? member.name : '(removed member)',
    };
  });
}

export const periodCount = (group) => (group && Array.isArray(group.payoutOrder) ? group.payoutOrder.length : 0);

// The recipient for a given period index.
export function recipientForPeriod(group, index) {
  const order = (group && group.payoutOrder) || [];
  return order[index] || null;
}

// Determine the "current" period given a reference date (YYYY-MM-DD passed by the
// UI as today, or a fixed value in tests). The current period is the last period
// whose due date is on or before the reference date, clamped to the cycle. If the
// group hasn't started, returns 0. Returns an index in [0, periods-1], or -1 if
// the cycle is complete (reference is after the final due date).
export function currentPeriodIndex(group, referenceDateStr) {
  const n = periodCount(group);
  if (n === 0) return -1;
  const schedule = buildSchedule(group);
  const ref = parseISODateUTC(referenceDateStr);
  if (!ref || !group.startDate) return 0;
  let current = -1;
  for (const p of schedule) {
    const due = parseISODateUTC(p.dueDate);
    if (due && due.getTime() <= ref.getTime()) current = p.index;
  }
  // Before the first due date -> the first period is the active one.
  return current === -1 ? 0 : current;
}

// Is the whole cycle finished as of the reference date? (past the final due date)
export function isCycleComplete(group, referenceDateStr) {
  const n = periodCount(group);
  if (n === 0) return false;
  const schedule = buildSchedule(group);
  const last = schedule[n - 1];
  const ref = parseISODateUTC(referenceDateStr);
  const lastDue = parseISODateUTC(last.dueDate);
  if (!ref || !lastDue) return false;
  return ref.getTime() > lastDue.getTime();
}
