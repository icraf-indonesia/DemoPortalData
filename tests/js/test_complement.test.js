/**
 * tests/js/test_complement.test.js
 * Unit tests for ComplementWorkflow, deduplication, staged preview, and scenario vs source mode.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ComplementWorkflow, REF_MOD_2B_CLASSES } from '../../src/features/complement.js';
import { WorkspaceState } from '../../src/state/workspace.js';
import { MODES, evaluateCandidateEligibility } from '../../src/demo/scenarios.js';

test('REF_MOD_2B_CLASSES defines exactly 5 source classes and marks target classes', () => {
  assert.equal(REF_MOD_2B_CLASSES.length, 5, 'Must have exactly 5 classes, not 22');
  const labels = REF_MOD_2B_CLASSES.map(c => c.label);
  assert.deepEqual(labels, ['Hutan', 'Kebun sawit', 'Kebun karet', 'Sawah', 'Lainnya']);

  const sawit = REF_MOD_2B_CLASSES.find(c => c.label === 'Kebun sawit');
  assert.equal(sawit.isTargetClass, true);

  const karet = REF_MOD_2B_CLASSES.find(c => c.label === 'Kebun karet');
  assert.equal(karet.isTargetClass, true);

  const hutan = REF_MOD_2B_CLASSES.find(c => c.label === 'Hutan');
  assert.equal(hutan.isTargetClass, false);
});

test('evaluateCandidateEligibility excludes unknown dates in strict SOURCE mode and includes in SCENARIO mode', () => {
  const sampleRecords = [
    {
      observation_id: 'ref_1',
      is_within_aoi: true,
      observed_time: null, // null in raw source
      rights_id: null
    },
    {
      observation_id: 'ref_outside',
      is_within_aoi: false,
      observed_time: null,
      rights_id: null
    }
  ];

  // 1. Source Mode: strict evaluation fails closed for unknown dates
  const srcEval = evaluateCandidateEligibility(sampleRecords, 'data_ref_mod_2b', MODES.SOURCE);
  assert.equal(srcEval.eligible.length, 0);
  assert.equal(srcEval.counts.byReason.unknown_time, 1);
  assert.equal(srcEval.counts.byReason.outside_aoi, 1);

  // 2. Scenario Mode: documented scenario overlay applies (observed 2025, simulated rights)
  const scnEval = evaluateCandidateEligibility(sampleRecords, 'data_ref_mod_2b', MODES.SCENARIO);
  assert.equal(scnEval.eligible.length, 1);
  assert.equal(scnEval.eligible[0].observation_id, 'ref_1');
  assert.equal(scnEval.excluded.length, 1);
  assert.equal(scnEval.excluded[0].reason, 'outside_aoi');
});

test('ComplementWorkflow preview and confirm handles selection, deduplication, and delta correctly', () => {
  const workspace = new WorkspaceState();

  // Initial plantation points
  const initialPoints = [
    { observation_id: 'init_sawit_1', project_class_id: 2, project_class_label: 'Kelapa sawit', is_within_aoi: true },
    { observation_id: 'init_karet_1', project_class_id: 1, project_class_label: 'Karet', is_within_aoi: true }
  ];
  workspace.setActiveDataset('data_kebun_sawit_karet_f', { title: 'Data Kebun Sawit & Karet' }, initialPoints);
  assert.equal(workspace.classCounts.total, 2);
  assert.equal(workspace.classCounts[3], 0);

  const workflow = new ComplementWorkflow(workspace);

  // Candidate reference points from 2b
  const candidateRecords = [
    { observation_id: 'ref_hutan_1', source_class_id: '1', source_class_label: 'Hutan', is_within_aoi: true, geometry: { coordinates: [104.5, -2.5] } },
    { observation_id: 'ref_sawit_disallowed', source_class_id: '2', source_class_label: 'Kebun sawit', is_within_aoi: true, geometry: { coordinates: [104.6, -2.6] } },
    { observation_id: 'ref_sawah_1', source_class_id: '4', source_class_label: 'Sawah', is_within_aoi: true, geometry: { coordinates: [104.7, -2.7] } },
    { observation_id: 'ref_outside_aoi', source_class_id: '5', source_class_label: 'Lainnya', is_within_aoi: false, geometry: { coordinates: [105.0, -1.0] } }
  ];

  workflow.startFlow(candidateRecords, 'data_ref_mod_2b');

  // Preview before confirmation
  const preview = workflow.calculatePreview(MODES.SCENARIO);
  assert.equal(preview.totalSourceCandidates, 4);
  assert.equal(preview.eligibleAfterFilters, 3); // 1 outside excluded
  assert.equal(preview.matchedSelectedClassesCount, 2); // hutan(1) and sawah(4), sawit(2) excluded
  assert.equal(preview.duplicateCount, 0);
  assert.equal(preview.netNewCount, 2);
  assert.equal(preview.currentTotalCount, 2);
  assert.equal(preview.projectedTotalCount, 4);

  // Target class cannot be manually added to selection
  workflow.toggleClass('2', true);
  assert.equal(workflow.selectedClassIds.has('2'), false, 'Target class 2 cannot be selected');

  // Confirm addition
  const res = workflow.confirmAddition(MODES.SCENARIO);
  assert.equal(res.success, true);
  assert.equal(res.addedCount, 2);
  assert.equal(res.totalCount, 4);
  assert.equal(res.datasetId, 'data_campuran_1');

  // Verify workspace state
  assert.equal(workspace.activeDatasetId, 'data_campuran_1');
  assert.equal(workspace.classCounts.total, 4);
  assert.equal(workspace.classCounts[1], 1);
  assert.equal(workspace.classCounts[2], 1);
  assert.equal(workspace.classCounts[3], 2, 'Lainnya should have 2 points');
  assert.equal(workspace.lastDelta, 2);

  // Test repeat operation: re-importing the same points must be deduplicated
  const workflow2 = new ComplementWorkflow(workspace);
  workflow2.startFlow(candidateRecords, 'data_ref_mod_2b');
  const preview2 = workflow2.calculatePreview(MODES.SCENARIO);
  assert.equal(preview2.duplicateCount, 2, 'Existing points must be detected as duplicates');
  assert.equal(preview2.netNewCount, 0, 'Zero new points should be added on repeat');

  const res2 = workflow2.confirmAddition(MODES.SCENARIO);
  assert.equal(res2.addedCount, 0);
  assert.equal(res2.duplicateSkipped, 2);
  assert.equal(workspace.classCounts.total, 4);
});

test('ComplementWorkflow supports alternative sources (data_hutan from Dinas Kehutanan, data_sawah)', () => {
  const workspace = new WorkspaceState();
  const initialPoints = [
    { observation_id: 'init_sawit_1', project_class_id: 2, project_class_label: 'Kelapa sawit', is_within_aoi: true }
  ];
  workspace.setActiveDataset('data_kebun_sawit_karet_f', { title: 'Data Kebun Sawit & Karet' }, initialPoints);

  const workflow = new ComplementWorkflow(workspace);
  const forestRecords = [
    { observation_id: 'hutan_pt_1', source_class_id: '1', source_class_label: 'Hutan', is_within_aoi: true, observed_time: '2024-05-10', rights_id: 'rights_forestry' },
    { observation_id: 'hutan_pt_2', source_class_id: '1', source_class_label: 'Hutan', is_within_aoi: true, observed_time: '2024-06-15', rights_id: 'rights_forestry' }
  ];

  workflow.startFlow(forestRecords, 'data_hutan');
  const sourceClasses = workflow.getSourceClasses();
  assert.ok(sourceClasses.length >= 1);
  assert.equal(sourceClasses[0].label, 'Hutan');
  assert.equal(sourceClasses[0].isTargetClass, false);

  const preview = workflow.calculatePreview(MODES.SCENARIO);
  assert.equal(preview.netNewCount, 2);
  assert.equal(preview.projectedTotalCount, 3);

  const res = workflow.confirmAddition(MODES.SCENARIO);
  assert.equal(res.success, true);
  assert.equal(res.addedCount, 2);
  assert.equal(workspace.classCounts[3], 2); // 2 Lainnya points
});

test('ComplementWorkflow supports Case 3 (Pengguna B) with custom title and Non-hutan mapping', () => {
  const workspace = new WorkspaceState();
  workspace.setCase(3);
  workspace.setActiveUser('user_b');

  // Initial forest points (Hutan = 1)
  const initialForestPoints = [
    { observation_id: 'forest_1', project_class_id: 1, project_class_label: 'Hutan', is_within_aoi: true },
    { observation_id: 'forest_2', project_class_id: 1, project_class_label: 'Hutan', is_within_aoi: true }
  ];
  workspace.setActiveDataset('data_hutan', { id: 'data_hutan', title: 'Data Tutupan Hutan', category: 'Data Pengguna' }, initialForestPoints);
  assert.equal(workspace.classCounts.total, 2);
  assert.equal(workspace.classCounts[1], 2);
  assert.equal(workspace.classCounts[2], 0, 'Non-hutan must initially be 0');

  const workflow = new ComplementWorkflow(workspace);

  // Candidate reference points from 2b
  const candidateRecords = [
    { observation_id: 'ref_hutan_disallowed', source_class_id: '1', source_class_label: 'Hutan', is_within_aoi: true, geometry: { coordinates: [104.5, -2.5] } },
    { observation_id: 'ref_sawit_allowed', source_class_id: '2', source_class_label: 'Kebun sawit', is_within_aoi: true, geometry: { coordinates: [104.6, -2.6] } },
    { observation_id: 'ref_sawah_allowed', source_class_id: '4', source_class_label: 'Sawah', is_within_aoi: true, geometry: { coordinates: [104.7, -2.7] } }
  ];

  workflow.startFlow(candidateRecords, 'data_ref_mod_2b');

  // Verify class classification for Case 3: Hutan is target class, sawit and sawah are not target classes
  const classes = workflow.getSourceClasses();
  const hutanClass = classes.find(c => c.label === 'Hutan');
  const sawitClass = classes.find(c => c.label === 'Kebun sawit');
  assert.equal(hutanClass.isTargetClass, true, 'Hutan must be marked as target class in Case 3');
  assert.equal(sawitClass.isTargetClass, false, 'Kebun sawit must NOT be target class in Case 3');

  // Calculate preview
  const preview = workflow.calculatePreview(MODES.SCENARIO);
  assert.equal(preview.matchedSelectedClassesCount, 2, 'Sawit and sawah should be selected');
  assert.equal(preview.netNewCount, 2);

  // Confirm addition with custom title entered by user
  const customTitle = 'Data Campuran Tutupan Lahan Banyuasin';
  const res = workflow.confirmAddition(MODES.SCENARIO, customTitle);
  assert.equal(res.success, true);
  assert.equal(res.addedCount, 2);
  assert.equal(res.title, customTitle);

  // Verify workspace state in Case 3
  assert.ok(workspace.case3PrivateCollection);
  assert.equal(workspace.case3PrivateCollection.meta.title, customTitle);
  assert.equal(workspace.classCounts[1], 2, 'Hutan count unchanged');
  assert.equal(workspace.classCounts[2], 2, 'Non-hutan count must now be 2');
  assert.equal(workspace.classCounts.total, 4);

  // Verify catalogue contains the new dataset in Data Anda
  const catItem = workspace.catalogueItems.find(i => i.id === res.datasetId);
  assert.ok(catItem, 'Combined dataset must exist in catalogueItems');
  assert.equal(catItem.title, customTitle);
});

test('ComplementWorkflow supports custom dataset title in Case 1', () => {
  const workspace = new WorkspaceState();
  workspace.setCase(1);

  const initialPoints = [
    { observation_id: 'sawit_1', project_class_id: 2, project_class_label: 'Kelapa sawit', is_within_aoi: true }
  ];
  workspace.setActiveDataset('data_kebun_sawit_karet_f', { title: 'Data Kebun Sawit & Karet' }, initialPoints);

  const workflow = new ComplementWorkflow(workspace);
  const candidateRecords = [
    { observation_id: 'sawah_1', source_class_id: '4', source_class_label: 'Sawah', is_within_aoi: true }
  ];
  workflow.startFlow(candidateRecords, 'data_ref_mod_2b');

  const customTitle = 'Data Kebun & Rujukan Khusus';
  const res = workflow.confirmAddition(MODES.SCENARIO, customTitle);
  assert.equal(res.success, true);
  assert.equal(res.title, customTitle);
  assert.equal(workspace.mixedDataset.meta.title, customTitle);
});

test('ComplementWorkflow in Case 3 allows adding shared plantation data (sawit & karet) into Non-hutan', () => {
  const workspace = new WorkspaceState();
  workspace.setCase(3);
  workspace.setActiveUser('user_b');

  const initialForestPoints = [
    { observation_id: 'forest_1', project_class_id: 1, project_class_label: 'Hutan', is_within_aoi: true }
  ];
  workspace.setActiveDataset('data_hutan', { id: 'data_hutan', title: 'Data Tutupan Hutan', category: 'Data Pengguna' }, initialForestPoints);

  const workflow = new ComplementWorkflow(workspace);
  const sharedPlantationRecords = [
    { observation_id: 'rec_karet', project_class_id: 1, project_class_label: 'Karet', source_class_id: '2', is_within_aoi: true },
    { observation_id: 'rec_sawit', project_class_id: 2, project_class_label: 'Kelapa sawit', source_class_id: '1', is_within_aoi: true }
  ];

  workflow.startFlow(sharedPlantationRecords, 'data_kontribusi_mandiri');

  // In Case 3, both Karet and Sawit are NOT target classes (target is Hutan)
  const classes = workflow.getSourceClasses();
  assert.equal(classes.length, 2);
  const karetClass = classes.find(c => c.label === 'Karet');
  const sawitClass = classes.find(c => c.label === 'Kelapa sawit');
  assert.equal(karetClass.isTargetClass, false, 'Karet must be selectable in Case 3');
  assert.equal(sawitClass.isTargetClass, false, 'Kelapa sawit must be selectable in Case 3');
  assert.ok(workflow.selectedClassIds.has('1'), 'Karet class ID 1 is selected by default');
  assert.ok(workflow.selectedClassIds.has('2'), 'Sawit class ID 2 is selected by default');

  const preview = workflow.calculatePreview(MODES.SCENARIO);
  assert.equal(preview.matchedSelectedClassesCount, 2);
  assert.equal(preview.netNewCount, 2);

  const res = workflow.confirmAddition(MODES.SCENARIO, 'Data Hutan & Kebun Campuran');
  assert.equal(res.success, true);
  assert.equal(res.addedCount, 2);
  assert.equal(workspace.classCounts[1], 1, 'Hutan remains 1');
  assert.equal(workspace.classCounts[2], 2, 'Non-hutan is now 2');
  assert.equal(workspace.classCounts.total, 3);
});

test('ComplementWorkflow supports per-class target class selection in Case 1', () => {
  const workspace = new WorkspaceState();
  const initialPoints = [
    { observation_id: 'init_karet_1', project_class_id: 1, project_class_label: 'Karet', is_within_aoi: true }
  ];
  workspace.setActiveDataset('data_kebun_sawit_karet_f', { title: 'Data Kebun Sawit & Karet' }, initialPoints);

  const workflow = new ComplementWorkflow(workspace);
  const candidates = [
    { observation_id: 'ref_hutan', source_class_id: '1', source_class_label: 'Hutan', is_within_aoi: true },
    { observation_id: 'ref_sawah', source_class_id: '4', source_class_label: 'Sawah', is_within_aoi: true }
  ];

  workflow.startFlow(candidates, 'data_ref_mod_2b');
  assert.equal(workflow.targetClassMapping['1'], '3', 'Defaults to Lainnya (3)');
  assert.equal(workflow.targetClassMapping['4'], '3', 'Defaults to Lainnya (3)');

  // Explicitly customize target mapping:
  // Map class 1 (Hutan) to Kebun Sawit (2)
  workflow.setTargetClass('1', '2');
  // Leave class 4 (Sawah) mapped to Lainnya (3)

  const res = workflow.confirmAddition(MODES.SCENARIO, 'Custom Mapped Dataset');
  assert.equal(res.success, true);
  assert.equal(res.addedCount, 2);

  // Check the points in workspace
  const sawitPoint = workspace.activeRecords.find(p => p.observation_id === 'ref_hutan');
  assert.equal(sawitPoint.project_class_id, 2, 'Mapped to Kebun Sawit');
  assert.equal(sawitPoint.project_class_label, 'Kelapa sawit');

  const lainnyaPoint = workspace.activeRecords.find(p => p.observation_id === 'ref_sawah');
  assert.equal(lainnyaPoint.project_class_id, 3, 'Mapped to Lainnya');
  assert.equal(lainnyaPoint.project_class_label, 'Lainnya');
});

test('getDatasetYearText formats standard years and range for mixed collections', async () => {
  const { getDatasetYearText } = await import('../../src/ui/catalogue.js');
  assert.equal(getDatasetYearText({ id: 'data_hutan' }), '2024');
  assert.equal(getDatasetYearText({ id: 'data_ref_mod_f' }), '2024');
  assert.equal(getDatasetYearText({ id: 'data_ref_mod_2b' }), '2025');
  assert.equal(getDatasetYearText({ id: 'data_kebun_sawit_karet_f' }), '2025');
  assert.equal(getDatasetYearText({ id: 'data_sawah' }), '2025');
  assert.equal(getDatasetYearText({ id: 'case4_data_kombinasi_f' }), '2026');
  assert.equal(getDatasetYearText({ id: 'data_campuran_1' }), '2025–2026');
  assert.equal(getDatasetYearText({ id: 'data_hutan_sawit_partisipatif' }), '2024–2026');
  assert.equal(getDatasetYearText({ id: 'data_kontribusi_mandiri', isPublished: true }), '2026');
});



