/**
 * tests/js/test_state_and_storage.test.js
 * Automated unit tests for workspace state transitions and storage persistence/failure.
 */

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { WorkspaceState } from '../../src/state/workspace.js';
import {
  STORAGE_KEY,
  PERSISTENCE_LABELS,
  savePreferences,
  loadPreferences,
  clearPreferences
} from '../../src/state/storage.js';

// Setup mock window.localStorage for Node environment
class MockLocalStorage {
  constructor() {
    this.store = new Map();
    this.shouldThrow = false;
  }
  getItem(key) {
    if (this.shouldThrow) throw new Error('Simulated QuotaExceededError or storage blocked');
    return this.store.has(key) ? this.store.get(key) : null;
  }
  setItem(key, value) {
    if (this.shouldThrow) throw new Error('Simulated QuotaExceededError or storage blocked');
    this.store.set(key, String(value));
  }
  removeItem(key) {
    if (this.shouldThrow) throw new Error('Simulated QuotaExceededError or storage blocked');
    this.store.delete(key);
  }
  clear() {
    this.store.clear();
  }
}

const mockStorage = new MockLocalStorage();
globalThis.window = { localStorage: mockStorage };

beforeEach(() => {
  mockStorage.clear();
  mockStorage.shouldThrow = false;
});

test('WorkspaceState handles dataset transitions and updates class totals', () => {
  const ws = new WorkspaceState();

  const mockMeta = { id: 'test_dataset', title: 'Test Dataset' };
  const mockRecords = [
    { observation_id: 'rec_1', project_class_id: 1 },
    { observation_id: 'rec_2', project_class_id: 2 },
    { observation_id: 'rec_3', project_class_id: 2 }
  ];

  let notificationCount = 0;
  ws.subscribe(() => {
    notificationCount += 1;
  });

  ws.setActiveDataset('test_dataset', mockMeta, mockRecords);

  assert.equal(ws.activeDatasetId, 'test_dataset');
  assert.equal(ws.activeDatasetMeta.title, 'Test Dataset');
  assert.equal(ws.activeRecords.length, 3);
  assert.equal(ws.classCounts[1], 1);
  assert.equal(ws.classCounts[2], 2);
  assert.equal(ws.classCounts[3], 0);
  assert.equal(ws.classCounts.total, 3);
  assert.equal(ws.selectedPointId, null);
  assert.equal(notificationCount, 1);
  // Also persists automatically
  assert.equal(ws.storageStatus.success, true);
  assert.equal(ws.storageStatus.label, PERSISTENCE_LABELS.SAVED);
});

test('WorkspaceState toggles collapsible attribute table and side panels and notifies', () => {
  const ws = new WorkspaceState();
  // Fresh profile: table closed (true), side panels open (false)
  assert.equal(ws.isTableCollapsed, true);
  assert.equal(ws.isLeftCollapsed, false);
  assert.equal(ws.isRightCollapsed, false);

  ws.toggleTable();
  assert.equal(ws.isTableCollapsed, false);

  ws.toggleTable(true);
  assert.equal(ws.isTableCollapsed, true);

  ws.toggleLeftPanel();
  assert.equal(ws.isLeftCollapsed, true);

  ws.toggleRightPanel();
  assert.equal(ws.isRightCollapsed, true);
});

test('savePreferences succeeds with honest label "Tersimpan di browser ini"', () => {
  const res = savePreferences({ activeDatasetId: 'koleksi_a', isTableCollapsed: true, isLeftCollapsed: false, isRightCollapsed: true });
  assert.equal(res.success, true);
  assert.equal(res.label, 'Tersimpan di browser ini');
  assert.ok(res.timestamp);

  const restored = loadPreferences();
  assert.deepEqual(restored, {
    activeDatasetId: 'koleksi_a',
    isTableCollapsed: true,
    isLeftCollapsed: false,
    isRightCollapsed: true
  });
});

test('savePreferences handles storage failure honestly and never claims saved', () => {
  mockStorage.shouldThrow = true;

  const res = savePreferences({ activeDatasetId: 'koleksi_b', isTableCollapsed: false });
  assert.equal(res.success, false);
  assert.ok(res.label.startsWith('Gagal menyimpan ke penyimpanan lokal'));
  assert.ok(res.error.includes('Simulated QuotaExceededError'));
  assert.equal(res.timestamp, null);
});

test('WorkspaceState restores persisted preferences on initialize', () => {
  mockStorage.setItem(STORAGE_KEY, JSON.stringify({
    activeDatasetId: 'restored_dataset',
    isTableCollapsed: true
  }));

  const ws = new WorkspaceState();
  ws.initPreferences();

  assert.equal(ws.activeDatasetId, 'restored_dataset');
  assert.equal(ws.isTableCollapsed, true);
});
