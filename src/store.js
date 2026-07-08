// store.js — localStorage persistence, export/import, hard delete.
//
// Every function accepts an explicit `storage` object (anything with getItem /
// setItem / removeItem), defaulting to the browser's localStorage. Tests inject a
// simple in-memory stub, so this module is exercised without a DOM.
//
// State is stored under one namespaced key as JSON. All reads are defensive: a
// missing, malformed, or wrong-shaped payload yields a safe empty state rather
// than throwing.

import { createGroup, SCHEMA_VERSION } from './model.js';

export const STORAGE_KEY = 'paluwagan.v1.state';

function defaultStorage() {
  if (typeof globalThis !== 'undefined' && globalThis.localStorage) return globalThis.localStorage;
  return null;
}

// Shape of persisted state. `groups` is a map keyed by group id; `activeGroupId`
// selects the group shown in the UI.
export function emptyState() {
  return { schemaVersion: SCHEMA_VERSION, groups: {}, activeGroupId: null };
}

// Read + validate the whole state. Never throws.
export function loadState(storage = defaultStorage()) {
  if (!storage) return emptyState();
  let raw;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch {
    return emptyState();
  }
  if (raw == null) return emptyState();
  return parseState(raw);
}

// Parse a JSON string into a validated state object. Exposed for import + tests.
export function parseState(raw) {
  let data;
  try {
    data = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return emptyState();
  }
  return normalizeState(data);
}

// Coerce arbitrary data into a valid state, dropping anything unusable. Runs each
// group through createGroup() so downstream code can trust the shape.
export function normalizeState(data) {
  const state = emptyState();
  if (!data || typeof data !== 'object') return state;

  const rawGroups = data.groups;
  if (rawGroups && typeof rawGroups === 'object') {
    for (const key of Object.keys(rawGroups)) {
      const g = rawGroups[key];
      if (!g || typeof g !== 'object') continue;
      const group = createGroup(g);
      state.groups[group.id] = group;
    }
  }

  const active = data.activeGroupId;
  if (typeof active === 'string' && state.groups[active]) {
    state.activeGroupId = active;
  } else {
    const ids = Object.keys(state.groups);
    state.activeGroupId = ids.length ? ids[0] : null;
  }
  return state;
}

// Persist state. Returns true on success, false if storage is unavailable/full.
export function saveState(state, storage = defaultStorage()) {
  if (!storage) return false;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(normalizeState(state)));
    return true;
  } catch {
    return false;
  }
}

// Serialize state for download. Pretty-printed for human inspection.
export function exportState(state) {
  const payload = {
    app: 'paluwagan',
    schemaVersion: SCHEMA_VERSION,
    exportedFields: ['groups', 'activeGroupId'],
    ...normalizeState(state),
  };
  return JSON.stringify(payload, null, 2);
}

// Parse an uploaded export back into a validated state. Never throws; returns
// { ok, state, error }.
export function importState(raw) {
  try {
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const state = normalizeState(data);
    return { ok: true, state };
  } catch (err) {
    return { ok: false, state: emptyState(), error: String(err && err.message ? err.message : err) };
  }
}

// Erase everything this app stored on the device.
export function clearAll(storage = defaultStorage()) {
  if (!storage) return false;
  try {
    storage.removeItem(STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

// A minimal in-memory storage implementation. Used by tests and as a safe
// fallback; mirrors the Web Storage getItem/setItem/removeItem contract.
export function createMemoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      map.set(key, String(value));
    },
    removeItem(key) {
      map.delete(key);
    },
    clear() {
      map.clear();
    },
    get length() {
      return map.size;
    },
  };
}
