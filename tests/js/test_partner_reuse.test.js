/**
 * tests/js/test_partner_reuse.test.js
 * Unit and domain tests for Case 3: PartnerReuseWorkflow for Forestry Role B.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PartnerReuseWorkflow,
  CASE2_STANDALONE_FIXTURE
} from '../../src/features/partner-reuse.js';
import { MODES } from '../../src/demo/scenarios.js';

test('PartnerReuseWorkflow: initForestryRole normalizes forest records to Hutan (1)', () => {
  const workflow = new PartnerReuseWorkflow();

  const mockForestRaw = [
    {
      observation_id: 'forest_1',
      geometry: { type: 'Point', coordinates: [104.5, -2.5] },
      dataset_archive: '3_Data_Kehutanan/Data_hutan_F.zip',
      source_class_id: '1',
      source_class_label: 'Hutan primer',
      is_within_aoi: true
    },
    {
      observation_id: 'forest_outside',
      geometry: { type: 'Point', coordinates: [106.0, -1.0] },
      dataset_archive: '3_Data_Kehutanan/Data_hutan_F.zip',
      source_class_id: '1',
      source_class_label: 'Hutan primer',
      is_within_aoi: false // outside AOI
    }
  ];

  const forestryPoints = workflow.initForestryRole(mockForestRaw);

  assert.equal(forestryPoints.length, 1, 'Only points inside AOI are retained');
  assert.equal(forestryPoints[0].project_class_id, 1);
  assert.equal(forestryPoints[0].project_class_label, 'Hutan');
  assert.equal(forestryPoints[0].role_context, 'role_b_forestry');
});

test('PartnerReuseWorkflow: discoverPartnerCatalogues discovers partner paddy and respects Case 2 lineage without synthetic fixture', () => {
  const workflow = new PartnerReuseWorkflow();

  // 1. Without Case 2 donation: discovers only partner paddy, no synthetic fixture
  const catalogWithoutCase2 = workflow.discoverPartnerCatalogues(null);
  assert.equal(catalogWithoutCase2.length, 1, 'Only real partner paddy is discovered without publication');

  const paddyEntry = catalogWithoutCase2.find(c => c.id === 'data_sawah');
  assert.ok(paddyEntry);
  assert.equal(paddyEntry.count, 166);
  assert.equal(paddyEntry.contributor, 'Dinas Pertanian Daerah (Penyuluh)');

  const fixtureEntry = catalogWithoutCase2.find(c => c.id === 'data_kontribusi_mandiri_fixture');
  assert.equal(fixtureEntry, undefined, 'No synthetic fixture present when unpublished');

  // 2. With actual Case 2 donation
  const actualCase2Collection = {
    meta: { id: 'data_kontribusi_mandiri' },
    records: [
      { observation_id: 'pt_1', project_class_id: 1 },
      { observation_id: 'pt_2', project_class_id: 2 }
    ]
  };
  const catalogWithCase2 = workflow.discoverPartnerCatalogues(actualCase2Collection);
  assert.equal(catalogWithCase2.length, 2, 'Discovers both paddy and actual published collection');
  const donatedEntry = catalogWithCase2.find(c => c.id === 'data_kontribusi_mandiri');
  assert.ok(donatedEntry);
  assert.equal(donatedEntry.isFixture, false);
  assert.equal(donatedEntry.count, 2);
});

test('PartnerReuseWorkflow: calculateReusePreview blocks reuse in strict SOURCE mode with unverified rights', () => {
  const workflow = new PartnerReuseWorkflow();

  const partnerPoints = [
    {
      observation_id: 'paddy_1',
      geometry: { type: 'Point', coordinates: [104.6, -2.6] },
      source_class_id: '1',
      source_class_label: 'Sawah irigasi',
      rights_id: null, // unverified rights!
      is_within_aoi: true
    }
  ];

  // In SOURCE mode: unverified rights must block reuse
  const sourcePreview = workflow.calculateReusePreview(partnerPoints, 'data_sawah', MODES.SOURCE, []);
  assert.equal(sourcePreview.permissionBlocked, true);
  assert.ok(sourcePreview.permissionMessage.includes('diblokir'));

  // Attempting to confirm when blocked must throw error
  assert.throws(() => {
    workflow.confirmPartnerReuse(sourcePreview, []);
  }, /diblokir/);
});

test('PartnerReuseWorkflow: calculateReusePreview projects to Non-hutan, excludes forest labels, and generates attribution ledger', () => {
  const workflow = new PartnerReuseWorkflow();

  const currentForestPoints = [
    {
      observation_id: 'forest_existing_1',
      geometry: { type: 'Point', coordinates: [104.5, -2.5] },
      project_class_id: 1,
      project_class_label: 'Hutan'
    }
  ];

  const partnerPoints = [
    {
      observation_id: 'paddy_1',
      geometry: { type: 'Point', coordinates: [104.6, -2.6] },
      source_class_id: '4',
      source_class_label: 'Sawah pasang surut',
      contributor_id: 'dinas_pertanian',
      method: 'Survei Lapangan',
      observed_time: { year: 2025 },
      rights_id: 'simulated_partner_consent',
      is_within_aoi: true
    },
    {
      // Ambiguous/forest label in partner data - must be excluded from Non-hutan!
      observation_id: 'partner_forest_point',
      geometry: { type: 'Point', coordinates: [104.7, -2.7] },
      source_class_id: '9',
      source_class_label: 'Hutan rawa sekunder',
      is_within_aoi: true
    },
    {
      // Point outside AOI - must be excluded
      observation_id: 'outside_pt',
      geometry: { type: 'Point', coordinates: [106.5, -1.0] },
      source_class_id: '4',
      source_class_label: 'Sawah lebak',
      is_within_aoi: false
    },
    {
      // Duplicate of existing point
      observation_id: 'forest_existing_1',
      geometry: { type: 'Point', coordinates: [104.5, -2.5] },
      source_class_id: '4',
      source_class_label: 'Sawah',
      is_within_aoi: true
    }
  ];

  const preview = workflow.calculateReusePreview(partnerPoints, 'data_sawah', MODES.SCENARIO, currentForestPoints);

  assert.equal(preview.permissionBlocked, false);
  assert.equal(preview.totalSourceCandidates, 4);
  assert.equal(preview.excludedCount, 2, 'Excludes outside AOI and forest-labeled partner point');
  assert.equal(preview.duplicateCount, 1, 'Identifies duplicate existing point');
  assert.equal(preview.netNewCount, 1, 'Only 1 net new valid candidate');

  const netPoint = preview.netNewPoints[0];
  assert.equal(netPoint.observation_id, 'paddy_1');
  assert.equal(netPoint.project_class_id, 2, 'Projected to Non-hutan (2)');
  assert.equal(netPoint.project_class_label, 'Non-hutan');
  assert.equal(netPoint.donor_lineage.donor_source_id, 'data_sawah');
  assert.equal(netPoint.donor_lineage.original_source_class_label, 'Sawah pasang surut');

  // Verify attribution ledger
  assert.equal(preview.ledger.length, 1);
  assert.equal(preview.ledger[0].observationId, 'paddy_1');
  assert.equal(preview.ledger[0].originalClass, 'Sawah pasang surut');
  assert.equal(preview.ledger[0].projectedClass, 'Non-hutan');
  assert.equal(preview.ledger[0].isScenarioOverlay, true);

  // Confirm addition
  const confirmed = workflow.confirmPartnerReuse(preview, currentForestPoints);
  assert.equal(confirmed.success, true);
  assert.equal(confirmed.addedCount, 1);
  assert.equal(confirmed.totalCount, 2); // 1 existing forest + 1 added non-hutan
  assert.equal(confirmed.combinedRecords.length, 2);
});
