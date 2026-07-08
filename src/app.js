// app.js — the only file that touches the DOM. All domain logic lives in the
// framework-free modules (model.js, settlement.js, store.js), which take dates as
// parameters. Here we supply the real clock (today) and render.

import {
  createGroup,
  createMember,
  buildSchedule,
  currencyMeta,
  CURRENCIES,
  isoDate,
  currentPeriodIndex,
  periodCount,
} from './model.js';
import {
  computeBalances,
  computeTrustScores,
  computePeriodSummaries,
  isPaid,
  paidDate,
} from './settlement.js';
import {
  loadState,
  saveState,
  exportState,
  importState,
  clearAll,
  emptyState,
} from './store.js';

/* ------------------------------------------------------------------ state */

let state = loadState();
let viewPeriod = 0; // which period the ledger tab is showing
let editingGroupId = null; // group being edited in the dialog, or null for "new"
let draftMembers = []; // working member list inside the dialog

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

// Today, as YYYY-MM-DD. This is the ONE place the real clock enters the app.
const today = () => isoDate(new Date());

function activeGroup() {
  return state.activeGroupId ? state.groups[state.activeGroupId] : null;
}

function persist() {
  saveState(state);
}

function announce(msg) {
  const live = $('#live');
  if (live) {
    live.textContent = '';
    // reassign on next frame so repeated identical messages still announce
    requestAnimationFrame(() => {
      live.textContent = msg;
    });
  }
}

/* --------------------------------------------------------------- money fmt */

function fmtMoney(group, amount) {
  const meta = currencyMeta(group ? group.currency : 'PHP');
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: meta.code,
      maximumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    }).format(amount);
  } catch {
    return `${meta.symbol}${Number(amount).toLocaleString()}`;
  }
}

function fmtDate(str) {
  if (!str) return '';
  const [y, m, d] = str.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  try {
    return new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(date);
  } catch {
    return str;
  }
}

const FREQ_LABEL = { weekly: 'Weekly', biweekly: 'Every 2 weeks', monthly: 'Monthly' };

/* ------------------------------------------------------------------ render */

function render() {
  const group = activeGroup();
  const hasGroups = Object.keys(state.groups).length > 0;

  $('#view-empty').hidden = hasGroups;
  $('#view-group').hidden = !hasGroups;
  if (!hasGroups || !group) return;

  renderGroupSwitcher();
  const n = periodCount(group);
  // Clamp the viewed period and default it to the current one on (re)load.
  if (viewPeriod >= n) viewPeriod = Math.max(0, n - 1);

  renderDashboard(group);
  renderPeriodNav(group);
  renderLedger(group);
  renderMembers(group);
  renderSchedule(group);
}

function renderGroupSwitcher() {
  const sel = $('#group-select');
  sel.innerHTML = '';
  for (const id of Object.keys(state.groups)) {
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = state.groups[id].name;
    if (id === state.activeGroupId) opt.selected = true;
    sel.appendChild(opt);
  }
}

function renderDashboard(group) {
  const n = periodCount(group);
  const ref = today();
  const cur = currentPeriodIndex(group, ref);
  const summaries = computePeriodSummaries(group, ref);
  const schedule = buildSchedule(group);

  // Ring
  drawRing(group, cur);

  const curSummary = summaries[cur] || null;
  const nextIndex = cur + 1 < n ? cur + 1 : -1;

  $('#stat-now').textContent = curSummary ? curSummary.recipientName : '—';
  $('#stat-now-sub').textContent = curSummary
    ? `Period ${cur + 1} of ${n} · due ${fmtDate(curSummary.dueDate)}`
    : '';

  if (nextIndex >= 0) {
    $('#stat-next').textContent = summaries[nextIndex].recipientName;
    $('#stat-next-sub').textContent = `Period ${nextIndex + 1} · ${fmtDate(summaries[nextIndex].dueDate)}`;
  } else {
    $('#stat-next').textContent = 'Cycle complete';
    $('#stat-next-sub').textContent = 'Everyone has received the pot';
  }

  if (curSummary) {
    $('#stat-pot').textContent = fmtMoney(group, curSummary.potCollected);
    $('#stat-pot-sub').textContent = `of ${fmtMoney(group, curSummary.fullPot)} full pot`;
    $('#stat-owing').textContent = String(curSummary.unpaidCount);
    $('#stat-owing-sub').textContent = curSummary.unpaidCount
      ? curSummary.unpaidMembers.map((m) => m.name).join(', ')
      : 'Everyone has paid';
  } else {
    $('#stat-pot').textContent = '—';
    $('#stat-owing').textContent = '—';
  }

  const meta = currencyMeta(group.currency);
  $('#ring-caption').textContent = `${group.members.length} members · ${fmtMoney(group, group.contribution)} each · ${
    FREQ_LABEL[group.frequency]
  } · ${meta.code}`;
  void schedule;
}

// Signature element: the payout rotation drawn as a ring. Done periods filled
// green, the current recipient coral, upcoming ones hollow.
function drawRing(group, currentIndex) {
  const order = group.payoutOrder;
  const n = order.length;
  const size = 200;
  const c = size / 2;
  const r = 78;
  const memberById = new Map(group.members.map((m) => [m.id, m]));

  const parts = [];
  parts.push(`<svg viewBox="0 0 ${size} ${size}" role="img" aria-label="Payout rotation. Position ${
    currentIndex + 1
  } of ${n} is current.">`);
  parts.push(`<circle class="ring-track" cx="${c}" cy="${c}" r="${r}" />`);

  for (let i = 0; i < n; i += 1) {
    const angle = (i / n) * Math.PI * 2 - Math.PI / 2; // start at top
    const x = c + r * Math.cos(angle);
    const y = c + r * Math.sin(angle);
    const member = memberById.get(order[i]);
    const initial = (member && member.name.trim()[0]) || '?';
    let cls = 'ring-node';
    if (i < currentIndex) cls += ' done';
    else if (i === currentIndex) cls += ' current';
    const radius = i === currentIndex ? 15 : 12;
    const title = member ? member.name : '(removed)';
    parts.push(
      `<g class="${cls}"><title>Period ${i + 1}: ${escapeHtml(title)}</title>` +
        `<circle class="ring-node-dot" cx="${x}" cy="${y}" r="${radius}" />` +
        `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="central" font-size="${
          i === currentIndex ? 13 : 11
        }" font-weight="700" fill="${i <= currentIndex ? '#fff' : 'var(--ink-2)'}">${escapeHtml(
          initial.toUpperCase(),
        )}</text></g>`,
    );
  }

  const curMember = memberById.get(order[currentIndex]);
  parts.push(
    `<text class="ring-center-label" x="${c}" y="${c - 10}" text-anchor="middle">Now</text>` +
      `<text class="ring-center-value" x="${c}" y="${c + 8}" text-anchor="middle">${escapeHtml(
        curMember ? firstName(curMember.name) : '—',
      )}</text>` +
      `<text class="ring-center-label" x="${c}" y="${c + 24}" text-anchor="middle">${currentIndex + 1} / ${n}</text>`,
  );
  parts.push('</svg>');
  $('#ring-wrap').innerHTML = parts.join('');
}

function firstName(name) {
  const first = String(name).trim().split(/\s+/)[0] || '';
  return first.length > 10 ? `${first.slice(0, 9)}…` : first;
}

function renderPeriodNav(group) {
  const n = periodCount(group);
  const summaries = computePeriodSummaries(group, today());
  const s = summaries[viewPeriod];
  const nav = $('#period-nav');
  if (!s) {
    nav.innerHTML = '';
    return;
  }
  nav.innerHTML = `
    <div class="period-title">
      <span class="pt-main">Period ${viewPeriod + 1} of ${n}</span>
      <span class="pt-sub">${s.dueDate ? `Due ${escapeHtml(fmtDate(s.dueDate))}` : 'No date set'}</span>
    </div>
    <span class="period-recipient"><span class="tag">Receives</span> ${escapeHtml(s.recipientName)}</span>
    <div class="period-steppers">
      <button class="btn btn-ghost btn-sm" id="prev-period" ${viewPeriod === 0 ? 'disabled' : ''} aria-label="Previous period">‹ Prev</button>
      <button class="btn btn-ghost btn-sm" id="next-period" ${viewPeriod >= n - 1 ? 'disabled' : ''} aria-label="Next period">Next ›</button>
    </div>`;
  const prev = $('#prev-period');
  const next = $('#next-period');
  if (prev) prev.onclick = () => { viewPeriod = Math.max(0, viewPeriod - 1); renderPeriodNav(group); renderLedger(group); };
  if (next) next.onclick = () => { viewPeriod = Math.min(n - 1, viewPeriod + 1); renderPeriodNav(group); renderLedger(group); };
}

function renderLedger(group) {
  const body = $('#ledger-body');
  const idx = viewPeriod;
  const schedule = buildSchedule(group);
  const recipientId = schedule[idx] ? schedule[idx].recipientId : null;

  const list = document.createElement('div');
  list.className = 'ledger-list';

  for (const member of group.members) {
    const paid = isPaid(group, member.id, idx);
    const isRecipient = member.id === recipientId;
    const pDate = paidDate(group, member.id, idx);
    const due = schedule[idx] ? schedule[idx].dueDate : '';
    const late = paid && pDate && due && pDate > due;

    const row = document.createElement('div');
    row.className = 'ledger-row' + (isRecipient ? ' is-recipient' : '');

    const name = document.createElement('span');
    name.className = 'ledger-name';
    name.textContent = member.name || '(unnamed)';
    row.appendChild(name);

    if (isRecipient) {
      const badge = document.createElement('span');
      badge.className = 'ledger-badge';
      badge.textContent = 'receives pot';
      row.appendChild(badge);
    }

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'pay-toggle';
    toggle.setAttribute('aria-pressed', paid ? 'true' : 'false');
    toggle.setAttribute(
      'aria-label',
      `${member.name}: contribution for period ${idx + 1} ${paid ? 'paid' : 'unpaid'}. Activate to toggle.`,
    );
    toggle.innerHTML = `<span class="box" aria-hidden="true">${paid ? '✓' : ''}</span>${
      paid ? (late ? '<span>Paid</span><span class="late">late</span>' : '<span>Paid</span>') : '<span>Unpaid</span>'
    }`;
    toggle.addEventListener('click', () => togglePayment(member.id, idx));
    row.appendChild(toggle);

    list.appendChild(row);
  }

  body.innerHTML = '';
  body.appendChild(list);
}

function togglePayment(memberId, index) {
  const group = activeGroup();
  if (!group) return;
  if (!group.payments[memberId]) group.payments[memberId] = {};
  const record = group.payments[memberId];
  if (record[index]) {
    delete record[index];
    announce('Marked unpaid.');
  } else {
    // Record the real date so lateness can be computed against the due date.
    record[index] = today();
    announce('Marked paid.');
  }
  persist();
  // Re-render just what changed: the row, the dashboard, and dependent tabs.
  renderDashboard(group);
  renderLedger(group);
  renderMembers(group);
  renderSchedule(group);
}

function renderMembers(group) {
  const ref = today();
  const balances = computeBalances(group);
  const scores = computeTrustScores(group, ref);
  const scoreById = new Map(scores.map((s) => [s.memberId, s]));

  const grid = document.createElement('div');
  grid.className = 'member-cards';

  for (const b of balances) {
    const s = scoreById.get(b.memberId);
    const pct = s && s.trustPercent !== null ? s.trustPercent : null;
    const { cls, label } = trustClass(pct);
    const netCls = b.net > 0 ? 'net-pos' : b.net < 0 ? 'net-neg' : '';

    const card = document.createElement('div');
    card.className = 'member-card';
    card.innerHTML = `
      <h3>${escapeHtml(b.name || '(unnamed)')}<span class="trust-badge ${cls}">${label}</span></h3>
      <div class="trust-meter" role="img" aria-label="Trust ${label}"><span style="width:${pct === null ? 0 : pct}%"></span></div>
      <p class="hint" style="margin-bottom:12px">${
        s && s.periodsDue
          ? `${s.onTime} of ${s.periodsDue} due contributions paid on time`
          : 'No contributions due yet'
      }</p>
      <div class="member-figures">
        <div><span class="fig-label">Contributed</span><span class="fig-val">${escapeHtml(fmtMoney(group, b.contributed))}</span></div>
        <div><span class="fig-label">Received</span><span class="fig-val">${escapeHtml(fmtMoney(group, b.received))}</span></div>
        <div><span class="fig-label">Net</span><span class="fig-val ${netCls}">${escapeHtml(fmtMoney(group, b.net))}</span></div>
      </div>`;
    grid.appendChild(card);
  }

  const body = $('#members-body');
  body.innerHTML = '';
  body.appendChild(grid);
}

function trustClass(pct) {
  if (pct === null) return { cls: 'trust-none', label: '—' };
  if (pct >= 90) return { cls: 'trust-high', label: `${pct}%` };
  if (pct >= 60) return { cls: 'trust-mid', label: `${pct}%` };
  return { cls: 'trust-low', label: `${pct}%` };
}

function renderSchedule(group) {
  const schedule = buildSchedule(group);
  const members = group.members;
  const cur = currentPeriodIndex(group, today());

  const rows = schedule
    .map((p) => {
      const cells = members
        .map((m) => {
          const paid = isPaid(group, m.id, p.index);
          const isRec = m.id === p.recipientId;
          const inner = isRec
            ? '<span class="recipient-pill">POT</span>'
            : paid
              ? '<span class="tick cell-paid" title="paid">✓</span>'
              : '<span class="tick cell-unpaid" title="unpaid">·</span>';
          return `<td class="${paid ? 'cell-paid' : 'cell-unpaid'}">${inner}</td>`;
        })
        .join('');
      const recName = escapeHtml(p.recipientName);
      const marker = p.index === cur ? ' ← now' : '';
      return `<tr class="${p.recipientId ? 'recipient-row' : ''}">
        <td class="period-col"><strong>P${p.index + 1}</strong>${marker}<br /><span class="pt-sub">${escapeHtml(
          fmtDate(p.dueDate),
        )}</span><br /><span class="recipient-pill">${recName}</span></td>
        ${cells}
      </tr>`;
    })
    .join('');

  const head = members.map((m) => `<th title="${escapeHtml(m.name)}">${escapeHtml(shortName(m.name))}</th>`).join('');

  $('#schedule-body').innerHTML = `
    <table class="schedule">
      <thead><tr><th class="period-col">Period</th>${head}</tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function shortName(name) {
  const s = String(name || '').trim();
  return s.length > 12 ? `${s.slice(0, 11)}…` : s || '?';
}

/* ---------------------------------------------------------------- tabs */

function initTabs() {
  const tabs = $$('.tab');
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => selectTab(tab));
    tab.addEventListener('keydown', (e) => {
      let target = null;
      if (e.key === 'ArrowRight') target = tabs[(i + 1) % tabs.length];
      else if (e.key === 'ArrowLeft') target = tabs[(i - 1 + tabs.length) % tabs.length];
      else if (e.key === 'Home') target = tabs[0];
      else if (e.key === 'End') target = tabs[tabs.length - 1];
      if (target) {
        e.preventDefault();
        selectTab(target);
        target.focus();
      }
    });
  });
}

function selectTab(tab) {
  $$('.tab').forEach((t) => {
    const selected = t === tab;
    t.setAttribute('aria-selected', selected ? 'true' : 'false');
    t.tabIndex = selected ? 0 : -1;
    const panel = $(`#${t.getAttribute('aria-controls')}`);
    if (panel) panel.hidden = !selected;
  });
}

/* --------------------------------------------------- group create / edit */

function openGroupDialog(group) {
  editingGroupId = group ? group.id : null;
  $('#group-dialog-title').textContent = group ? 'Edit group' : 'New group';

  // currency select
  const curSel = $('#f-currency');
  curSel.innerHTML = CURRENCIES.map(
    (c) => `<option value="${c.code}">${c.symbol} ${c.code}</option>`,
  ).join('');

  $('#f-name').value = group ? group.name : '';
  $('#f-amount').value = group ? group.contribution : '';
  curSel.value = group ? group.currency : 'PHP';
  $('#f-frequency').value = group ? group.frequency : 'monthly';
  $('#f-start').value = group ? group.startDate || today() : today();

  // draft members preserve ids + rotation order
  if (group) {
    const byId = new Map(group.members.map((m) => [m.id, m]));
    draftMembers = group.payoutOrder
      .map((id) => byId.get(id))
      .filter(Boolean)
      .map((m) => ({ id: m.id, name: m.name }));
  } else {
    draftMembers = [];
  }
  renderMemberEditor();
  $('#member-error').hidden = true;
  $('#group-dialog').showModal();
  $('#f-name').focus();
}

function renderMemberEditor() {
  const ul = $('#member-editor');
  ul.innerHTML = '';
  draftMembers.forEach((m, i) => {
    const li = document.createElement('li');
    li.innerHTML = `
      <span class="mnum">${i + 1}</span>
      <span class="mname">${escapeHtml(m.name || '(unnamed)')}</span>
      <button type="button" class="miconbtn mup" title="Move up" aria-label="Move ${escapeHtml(m.name)} up" ${
        i === 0 ? 'disabled' : ''
      }>↑</button>
      <button type="button" class="miconbtn mdown" title="Move down" aria-label="Move ${escapeHtml(m.name)} down" ${
        i === draftMembers.length - 1 ? 'disabled' : ''
      }>↓</button>
      <button type="button" class="miconbtn mremove" title="Remove" aria-label="Remove ${escapeHtml(m.name)}">✕</button>`;
    li.querySelector('.mup').onclick = () => moveMember(i, -1);
    li.querySelector('.mdown').onclick = () => moveMember(i, 1);
    li.querySelector('.mremove').onclick = () => {
      draftMembers.splice(i, 1);
      renderMemberEditor();
    };
    ul.appendChild(li);
  });
}

function moveMember(i, dir) {
  const j = i + dir;
  if (j < 0 || j >= draftMembers.length) return;
  const tmp = draftMembers[i];
  draftMembers[i] = draftMembers[j];
  draftMembers[j] = tmp;
  renderMemberEditor();
}

function addDraftMember() {
  const input = $('#f-newmember');
  const name = input.value.trim();
  if (!name) return;
  draftMembers.push(createMember(name));
  input.value = '';
  renderMemberEditor();
  input.focus();
}

function saveGroupFromDialog(e) {
  e.preventDefault();
  const err = $('#member-error');
  if (draftMembers.length < 2) {
    err.textContent = 'Add at least two members — a savings circle needs people to rotate between.';
    err.hidden = false;
    return;
  }
  err.hidden = true;

  const input = {
    id: editingGroupId || undefined,
    name: $('#f-name').value,
    contribution: $('#f-amount').value,
    currency: $('#f-currency').value,
    frequency: $('#f-frequency').value,
    startDate: $('#f-start').value,
    members: draftMembers.map((m) => ({ id: m.id, name: m.name })),
    payoutOrder: draftMembers.map((m) => m.id),
    payments: editingGroupId && state.groups[editingGroupId] ? state.groups[editingGroupId].payments : {},
  };
  const group = createGroup(input);
  // Drop payments for members no longer present.
  const validIds = new Set(group.members.map((m) => m.id));
  for (const id of Object.keys(group.payments)) {
    if (!validIds.has(id)) delete group.payments[id];
  }

  state.groups[group.id] = group;
  state.activeGroupId = group.id;
  persist();
  $('#group-dialog').close();
  viewPeriod = currentPeriodIndex(group, today());
  if (viewPeriod < 0) viewPeriod = 0;
  render();
  announce(editingGroupId ? 'Group updated.' : 'Group created.');
}

/* ------------------------------------------------------------- data controls */

function doExport() {
  const json = exportState(state);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `paluwagan-backup-${today()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  setDataNote('Exported. Keep this file somewhere safe — it is the only copy off this device.');
}

function doImportFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    const result = importState(String(reader.result));
    if (!result.ok) {
      setDataNote(`Could not read that file: ${result.error}`, true);
      return;
    }
    if (Object.keys(result.state.groups).length === 0) {
      setDataNote('That file had no groups in it.', true);
      return;
    }
    state = result.state;
    persist();
    viewPeriod = 0;
    render();
    setDataNote('Imported. Your groups are loaded.');
    announce('Data imported.');
  };
  reader.onerror = () => setDataNote('Could not read the file.', true);
  reader.readAsText(file);
}

function doDelete() {
  const ok = window.confirm(
    'Delete everything?\n\nThis erases every group, member, and paid mark stored in this browser. It cannot be undone. Export first if you want a backup.',
  );
  if (!ok) return;
  clearAll();
  state = emptyState();
  viewPeriod = 0;
  $('#data-dialog').close();
  render();
  announce('All data deleted.');
}

function setDataNote(msg, isError = false) {
  const note = $('#data-note');
  note.textContent = msg;
  note.style.color = isError ? 'var(--coral)' : 'var(--paid)';
}

function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ------------------------------------------------------------------- wiring */

function init() {
  initTabs();

  // Empty-state actions
  $('#empty-create').addEventListener('click', () => openGroupDialog(null));
  $('#empty-import').addEventListener('click', () => {
    openDataDialog();
    $('#import-file').click();
  });

  // Group head
  $('#group-select').addEventListener('change', (e) => {
    state.activeGroupId = e.target.value;
    persist();
    viewPeriod = currentPeriodIndex(activeGroup(), today());
    if (viewPeriod < 0) viewPeriod = 0;
    render();
  });
  $('#new-group-btn').addEventListener('click', () => openGroupDialog(null));
  $('#edit-group-btn').addEventListener('click', () => openGroupDialog(activeGroup()));
  $('#data-btn').addEventListener('click', openDataDialog);

  // Group dialog
  $('#group-form').addEventListener('submit', saveGroupFromDialog);
  $('#group-cancel').addEventListener('click', () => $('#group-dialog').close());
  $('#add-member-btn').addEventListener('click', addDraftMember);
  $('#f-newmember').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addDraftMember();
    }
  });

  // Data dialog
  $('#export-btn').addEventListener('click', doExport);
  $('#import-btn').addEventListener('click', () => $('#import-file').click());
  $('#import-file').addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) doImportFile(file);
    e.target.value = '';
  });
  $('#delete-btn').addEventListener('click', doDelete);
  $('#data-close').addEventListener('click', () => $('#data-dialog').close());

  // Default the ledger to the current period on load.
  const g = activeGroup();
  if (g) {
    viewPeriod = currentPeriodIndex(g, today());
    if (viewPeriod < 0) viewPeriod = 0;
  }

  render();
  registerServiceWorker();
}

function openDataDialog() {
  setDataNote('');
  $('#data-dialog').showModal();
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    // Registered from the app's own origin; the SW only caches same-origin shell
    // assets. Failure is non-fatal — the app works fully without it.
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
