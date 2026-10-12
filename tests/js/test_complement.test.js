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
