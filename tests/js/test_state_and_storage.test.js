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

test('WorkspaceState setPublishedCollection handles storage failure honestly and preserves draft', () => {
  const ws = new WorkspaceState();
  const testDraft = { accountName: 'Peneliti 1', owningInstitution: 'Lembaga 1' };
  ws.setPublicationDraft(testDraft);

  mockStorage.shouldThrow = true;

  const pubPkg = {
    meta: { id: 'data_kontribusi_mandiri', title: 'Publikasi Uji' },
    records: [{ observation_id: 'pt_1', project_class_id: 1 }]
  };

  const res = ws.setPublishedCollection(pubPkg);
  assert.equal(res.success, false, 'Reports failure honestly when storage fails');
  assert.ok(res.error, 'Provides failure reason');
  assert.equal(ws.case2DonatedCollection, null, 'Does not commit collection on failure');
  assert.deepEqual(ws.case2PublicationDraft, testDraft, 'Preserves draft on failure for recovery');
});

test('WorkspaceState getActiveSchema adapts flexibly to active dataset selection', () => {
  const ws = new WorkspaceState();

  // Default plantation dataset: 3 classes (Karet, Sawit, Lainnya)
  ws.activeDatasetId = 'data_kebun_sawit_karet_f';
  let schema = ws.getActiveSchema();
  assert.equal(Object.keys(schema).length, 3);
  assert.equal(schema[1].label, 'Karet');
  assert.equal(schema[2].label, 'Kelapa sawit');
  assert.equal(schema[3].label, 'Lainnya');

  // Modular 2b dataset: 5 classes (Hutan, Kebun sawit, Kebun karet, Sawah, Lainnya)
  ws.activeDatasetId = 'data_ref_mod_2b';
  schema = ws.getActiveSchema();
  assert.equal(Object.keys(schema).length, 5);
  assert.equal(schema[1].label, 'Hutan');
  assert.equal(schema[2].label, 'Kebun sawit');
  assert.equal(schema[3].label, 'Kebun karet');
  assert.equal(schema[4].label, 'Sawah');
  assert.equal(schema[5].label, 'Lainnya');

  // Sawah partner dataset: 1 class (Sawah)
  ws.activeDatasetId = 'data_sawah';
  schema = ws.getActiveSchema();
  assert.equal(Object.keys(schema).length, 1);
  assert.equal(schema[1].label, 'Sawah');

  // Hutan partner dataset in Case 1/2: 1 class (Hutan)
  ws.activeCaseId = 1;
  ws.activeDatasetId = 'data_hutan';
  schema = ws.getActiveSchema();
  assert.equal(Object.keys(schema).length, 1);
  assert.equal(schema[1].label, 'Hutan');

  // Hutan dataset in Case 3: 2 classes (Hutan, Non-hutan)
  ws.activeCaseId = 3;
  ws.activeUser = 'user_b';
  schema = ws.getActiveSchema();
  assert.equal(Object.keys(schema).length, 2);
  assert.equal(schema[1].label, 'Hutan');
  assert.equal(schema[2].label, 'Non-hutan');

  // Modular 2a unlabeled reference dataset: 1 class (Titik Rujukan (Tanpa Label))
  ws.activeDatasetId = 'data_ref_mod_f';
  schema = ws.getActiveSchema();
  assert.equal(Object.keys(schema).length, 1);
  assert.equal(schema[1].label, 'Titik Rujukan (Tanpa Label)');

  // Case 4 multi-source combination: 5 classes
  ws.activeDatasetId = 'case4_data_kombinasi_f';
  schema = ws.getActiveSchema();
  assert.equal(Object.keys(schema).length, 5);

  // Pengguna A shared collection: 2 classes (Karet, Kelapa sawit - Lainnya excluded)
  ws.activeDatasetId = 'data_kontribusi_mandiri';
  schema = ws.getActiveSchema();
  assert.equal(Object.keys(schema).length, 2);
  assert.equal(schema[1].label, 'Karet');
  assert.equal(schema[2].label, 'Kelapa sawit');
  assert.equal(schema[3], undefined);

  // Cleared active dataset (no card selected): returns empty schema and 0 counts
  ws.clearActiveDataset();
  assert.equal(ws.activeDatasetId, null);
  assert.equal(ws.activeRecords.length, 0);
  assert.equal(ws.classCounts.total, 0);
  assert.deepEqual(ws.getActiveSchema(), {});
});

test('WorkspaceState handles 4-case dropdown switching with state and dataset isolation', () => {
  const ws = new WorkspaceState();

  // 1. Pengguna A (Kasus 1)
  ws.setActiveUser('case_1');
  assert.equal(ws.activeCaseId, 1);
  assert.equal(ws.activeUser, 'user_a');
  assert.equal(ws.getActiveCaseKey(), 'case_1');
  assert.equal(ws.activeDatasetId, 'data_kebun_sawit_karet_f');

  // 2. Pengguna A (Kasus 2)
  ws.setActiveUser('case_2');
  assert.equal(ws.activeCaseId, 2);
  assert.equal(ws.activeUser, 'user_a');
  assert.equal(ws.getActiveCaseKey(), 'case_2');
  assert.equal(ws.activeDatasetId, 'data_kebun_sawit_karet_f');

  // 3. Pengguna B (Kasus 3)
  ws.setActiveUser('case_3');
  assert.equal(ws.activeCaseId, 3);
  assert.equal(ws.activeUser, 'user_b');
  assert.equal(ws.getActiveCaseKey(), 'case_3');
  assert.equal(ws.activeDatasetId, 'data_hutan');

  // 4. Pengguna C (Kasus 4)
  ws.setActiveUser('case_4');
  assert.equal(ws.activeCaseId, 4);
  assert.equal(ws.activeUser, 'user_c');
  assert.equal(ws.getActiveCaseKey(), 'case_4');
  assert.equal(ws.activeDatasetId, 'case4_data_kombinasi_f');

  // Back to Case 1
  ws.setActiveUser('case_1');
  assert.equal(ws.activeCaseId, 1);
  assert.equal(ws.activeUser, 'user_a');
  assert.equal(ws.getActiveCaseKey(), 'case_1');
});
