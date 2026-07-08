import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createGroup, createMember } from '../src/model.js';
import {
  STORAGE_KEY,
  emptyState,
  loadState,
  saveState,
  parseState,
  normalizeState,
  exportState,
  importState,
  clearAll,
  createMemoryStorage,
} from '../src/store.js';

function sampleState() {
  const members = ['Ana', 'Ben'].map((n, i) => createMember(n, i));
  const g = createGroup({
    id: 'g_sample',
    name: 'Test Group',
    members,
    payoutOrder: members.map((m) => m.id),
    contribution: 750,
    currency: 'PHP',
    frequency: 'weekly',
    startDate: '2026-01-01',
    payments: { [members[0].id]: { 0: true } },
  });
  return { schemaVersion: 1, groups: { [g.id]: g }, activeGroupId: g.id };
}

test('save then load round-trips through storage', () => {
  const storage = createMemoryStorage();
  const state = sampleState();
  assert.equal(saveState(state, storage), true);
  const loaded = loadState(storage);
  assert.equal(loaded.activeGroupId, 'g_sample');
  assert.equal(loaded.groups.g_sample.name, 'Test Group');
  assert.equal(loaded.groups.g_sample.contribution, 750);
  assert.equal(loaded.groups.g_sample.members.length, 2);
  assert.equal(loaded.groups.g_sample.payments[loaded.groups.g_sample.members[0].id][0], true);
});

test('export then import is a faithful round-trip', () => {
  const state = sampleState();
  const json = exportState(state);
  // Export is valid, pretty-printed JSON and tags the app.
  assert.match(json, /"app": "paluwagan"/);
  const result = importState(json);
  assert.equal(result.ok, true);
  assert.equal(result.state.activeGroupId, 'g_sample');
  assert.deepEqual(
    Object.keys(result.state.groups),
    ['g_sample'],
  );
  assert.equal(result.state.groups.g_sample.contribution, 750);
});

test('loadState returns empty state when nothing is stored', () => {
  const storage = createMemoryStorage();
  const loaded = loadState(storage);
  assert.deepEqual(loaded, emptyState());
});

test('malformed JSON in storage degrades to empty state, no throw', () => {
  const storage = createMemoryStorage({ [STORAGE_KEY]: '{ not valid json ]' });
  const loaded = loadState(storage);
  assert.deepEqual(loaded, emptyState());
});

test('parseState tolerates wrong-shaped data', () => {
  assert.deepEqual(parseState('null'), emptyState());
  assert.deepEqual(parseState('42'), emptyState());
  assert.deepEqual(parseState('"a string"'), emptyState());
  assert.deepEqual(parseState('[1,2,3]'), emptyState());
});

test('normalizeState drops junk groups and repairs activeGroupId', () => {
  const dirty = {
    groups: {
      good: { id: 'good', name: 'Real', members: [{ id: 'x', name: 'X' }] },
      bad: null,
      alsoBad: 5,
    },
    activeGroupId: 'does-not-exist',
  };
  const state = normalizeState(dirty);
  assert.deepEqual(Object.keys(state.groups), ['good']);
  // active pointed at a missing group -> repaired to the surviving group.
  assert.equal(state.activeGroupId, 'good');
});

test('importState reports errors instead of throwing on bad input', () => {
  const result = importState('{ broken');
  assert.equal(result.ok, false);
  assert.deepEqual(result.state, emptyState());
  assert.ok(result.error && typeof result.error === 'string');
});

test('clearAll removes the stored key', () => {
  const storage = createMemoryStorage();
  saveState(sampleState(), storage);
  assert.notEqual(storage.getItem(STORAGE_KEY), null);
  assert.equal(clearAll(storage), true);
  assert.equal(storage.getItem(STORAGE_KEY), null);
  assert.deepEqual(loadState(storage), emptyState());
});

test('save/load tolerate storage that throws (quota / disabled)', () => {
  const throwing = {
    getItem() {
      throw new Error('blocked');
    },
    setItem() {
      throw new Error('quota');
    },
    removeItem() {
      throw new Error('blocked');
    },
  };
  assert.deepEqual(loadState(throwing), emptyState());
  assert.equal(saveState(sampleState(), throwing), false);
  assert.equal(clearAll(throwing), false);
});

test('imported group data is re-validated (junk contribution -> 0)', () => {
  const result = importState(
    JSON.stringify({ groups: { g: { id: 'g', name: 'G', contribution: 'lots', currency: 'ZZZ' } } }),
  );
  assert.equal(result.ok, true);
  assert.equal(result.state.groups.g.contribution, 0);
  assert.equal(result.state.groups.g.currency, 'PHP'); // bad currency normalized
});
