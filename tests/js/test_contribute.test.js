/**
 * tests/js/test_contribute.test.js
 * Unit and domain tests for Case 2: ContributionWorkflow and on-screen sampling.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ContributionWorkflow,
  SAMPLING_ORIGINS,
  REVIEW_PRIORITIES
} from '../../src/features/contribute.js';
import { PROVISIONAL_HIERARCHY } from '../../src/domain/taxonomy.js';

test('ContributionWorkflow: separates owned plantation observations from imported 2b reference data', () => {
  const workflow = new ContributionWorkflow();

  const mockRecords = [
    {
      observation_id: 'pt_owned_1',
      dataset_archive: '1_Data_Pengguna_1/Data_kebun_sawit_karet_F.zip',
      source_class_id: '1',
      source_class_label: 'Kebun sawit',
      project_class_id: 1,
      contributor_id: 'pemilik_a'
    },
    {
      observation_id: 'pt_owned_2',
      dataset_archive: '1_Data_Pengguna_1/Data_kebun_sawit_karet_F.zip',
      source_class_id: '2',
      source_class_label: 'Kebun karet',
      project_class_id: 2,
      contributor_id: 'pemilik_a'
    },
    {
      observation_id: 'pt_ref_1',
      dataset_archive: '2_Data_Referensi_1/2b_Modular/Data_rujukan_titik_F.zip',
      source_class_id: '3',
      source_class_label: 'Badan air',
      project_class_id: 3,
      contributor_id: 'pihak_ketiga'
    },
    {
      observation_id: 'pt_ref_2',
      dataset_archive: '2_Data_Referensi_1/2b_Modular/Data_rujukan_titik_F.zip',
      source_class_id: '4',
      source_class_label: 'Tanah terbuka',
      project_class_id: 3,
      contributor_id: 'pihak_ketiga'
    }
  ];

  const result = workflow.separateOwnedObservations(mockRecords);

  assert.equal(result.summary.total, 4);
  assert.equal(result.summary.ownedCount, 2);
  assert.equal(result.summary.excludedCount, 2);
  assert.equal(result.owned.length, 2);
  assert.equal(result.excludedImported.length, 2);

  // Check owned points identities
  assert.equal(result.owned[0].observation_id, 'pt_owned_1');
  assert.equal(result.owned[1].observation_id, 'pt_owned_2');

  // Check exclusion reason explicitly notes third-party data cannot be donated as self-contribution
  assert.ok(result.excludedImported[0].reason.includes('pihak ketiga'));
  assert.ok(result.excludedImported[0].reason.includes('bukan milik pengguna'));
});

test('ContributionWorkflow: createDonatedPackage preserves raw attributes and assigns simulated donation rights', () => {
  const workflow = new ContributionWorkflow();

  const ownedPoints = [
    {
      observation_id: 'pt_owned_1',
      geometry: { type: 'Point', coordinates: [104.5, -2.5] },
      dataset_archive: '1_Data_Pengguna_1/Data_kebun_sawit_karet_F.zip',
      source_class_id: '1',
      source_class_label: 'Kebun sawit',
      project_class_id: 1,
      project_class_label: 'Kelapa sawit',
      observed_time: { year: 2026 },
      method: 'Survei Lapangan'
    }
  ];

  const validDeclarations = {
    accountName: 'User A',
    owningInstitution: 'ICRAF Indonesia',
    technicalEmail: 'usera@example.org',
    confirmedYear: 2026,
    acquisitionMethod: 'Survei Lapangan',
    responsibilityAccepted: true
  };

  const pkg = workflow.createDonatedPackage(ownedPoints, validDeclarations);

  assert.equal(pkg.meta.id, 'data_kontribusi_mandiri');
  assert.equal(pkg.meta.isDonated, true);
  assert.equal(pkg.records.length, 1);

  const donatedPoint = pkg.records[0];
  assert.equal(donatedPoint.observation_id, 'pt_owned_1');
  assert.equal(donatedPoint.is_contributed, true);
  // Preserves original source attributes intact
  assert.equal(donatedPoint.contributor_id, null, 'Preserves original contributor_id');
  assert.equal(donatedPoint.rights_id, null, 'Preserves original rights_id');
  assert.equal(donatedPoint.quality_tier, null, 'Preserves original quality_tier');
  assert.equal(donatedPoint.scenario_overlay.owner, 'Pemilik A (Pengguna)');
  assert.equal(donatedPoint.scenario_overlay.rightsStatus, 'Izin donasi terbuka konsorsium (Simulasi)');
  assert.equal(donatedPoint.review_priority, REVIEW_PRIORITIES.NORMAL);
  assert.ok(donatedPoint.scenario_overlay.assumptions.length > 0);

  // Rejects missing/incomplete declarations
  assert.throws(() => {
    workflow.createDonatedPackage(ownedPoints, {});
  }, /Nama akun atau peneliti wajib diisi/);

  assert.throws(() => {
    workflow.createDonatedPackage(ownedPoints, { ...validDeclarations, responsibilityAccepted: false });
  }, /Pernyataan tanggung jawab atas keabsahan data wajib disetujui/);

  // Rejects empty donation
  assert.throws(() => {
    workflow.createDonatedPackage([], validDeclarations);
  }, /Tidak ada observasi milik mandiri/);

  // Rejects unknown or third party records
  assert.throws(() => {
    workflow.createDonatedPackage([{
      observation_id: 'unknown_1',
      dataset_archive: 'unknown_archive.zip',
      project_class_id: 1
    }], validDeclarations);
  }, /Hanya observasi kebun mandiri milik pengguna yang dapat dibagikan/);
});

test('PROVISIONAL_HIERARCHY: documents discrepancy note for 21 leaf classes without inventing 22nd class', () => {
  assert.ok(PROVISIONAL_HIERARCHY.metadata.discrepancyNote.includes('21 kelas daun'));
  assert.ok(PROVISIONAL_HIERARCHY.metadata.discrepancyNote.includes('bukan 22'));
  assert.equal(PROVISIONAL_HIERARCHY.tree[0].name, 'Vegetasi');
  assert.equal(PROVISIONAL_HIERARCHY.tree[0].children[0].name, 'Sistem berbasis pohon');
  assert.equal(PROVISIONAL_HIERARCHY.tree[0].children[0].children[0].name, 'Perkebunan monokultur');

  const leaves = PROVISIONAL_HIERARCHY.tree[0].children[0].children[0].children;
  assert.ok(leaves.some(l => l.name === 'Kebun karet'));
  assert.ok(leaves.some(l => l.name === 'Kebun sawit'));
});

test('ContributionWorkflow: on-screen sampling rejects non-finite coordinates and validates draft completeness', () => {
  const workflow = new ContributionWorkflow();

  // Rejects non-finite coordinates
  assert.throws(() => {
    workflow.createSamplingDraft([NaN, -2.5]);
  }, /Koordinat non-finit/);

  assert.throws(() => {
    workflow.createSamplingDraft([104.5, Infinity]);
  }, /Koordinat non-finit/);

  // Valid draft creation with stable UUID
  const draft = workflow.createSamplingDraft([104.48, -2.43], true);
  assert.match(draft.observation_id, /[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i, 'Draft has stable UUID');
  assert.equal(draft.method, SAMPLING_ORIGINS.IMAGE_INTERPRETATION);
  assert.equal(draft.review_priority, REVIEW_PRIORITIES.HIGH);
  assert.equal(draft.is_incomplete, true);

  // Missing imagery and reason marks submission as incomplete
  const incompleteResult = workflow.submitSamplingDraft({
    ...draft,
    project_class_id: 1,
    year: 2026,
    imagery_ref: '', // empty imagery!
    reason: ''       // empty reason!
  });

  assert.equal(incompleteResult.valid, false);
  assert.equal(incompleteResult.record.is_incomplete, true);
  assert.equal(incompleteResult.record.review_status, 'draft_incomplete');
  assert.equal(incompleteResult.record.quality_tier, null, 'Incomplete draft cannot receive a quality tier');
  assert.ok(incompleteResult.errors.some(e => e.includes('citra satelit')));
  assert.ok(incompleteResult.errors.some(e => e.includes('Alasan/justifikasi')));

  // Complete submission succeeds
  const completeResult = workflow.submitSamplingDraft({
    ...draft,
    project_class_id: 1,
    year: 2026,
    imagery_ref: 'EOX Sentinel-2 Cloudless 2025',
    reason: 'Pola tajuk kelapa sawit monokultur terlihat berbaris teratur pada citra resolusi tinggi',
    uncertainty: '±15m'
  });

  assert.equal(completeResult.valid, true);
  assert.equal(completeResult.record.is_incomplete, false);
  assert.equal(completeResult.record.review_status, 'submitted');
  assert.equal(completeResult.record.quality_tier, 4, 'Complete unreviewed sample is Tier 4');
  assert.equal(completeResult.record.review_priority, REVIEW_PRIORITIES.HIGH, 'Screen points have high review priority');
  assert.equal(completeResult.record.method, SAMPLING_ORIGINS.IMAGE_INTERPRETATION);
  assert.equal(completeResult.record.is_screen_sample, true);
});

test('ContributionWorkflow: setPublicationDraft defaults institution to Dinas Perkebunan and sets includeLumaMetadata', () => {
  const workflow = new ContributionWorkflow();

  const draft = workflow.setPublicationDraft({});

  assert.equal(draft.owningInstitution, 'Dinas Perkebunan Kabupaten Banyuasin');
  assert.equal(draft.confirmedYear, 2026);
  assert.equal(draft.acquisitionMethod, 'Survei GPS Lapangan');
  assert.equal(draft.boundaryAoi, 'Kabupaten Banyuasin');
  assert.equal(draft.includeLumaMetadata, true);
});

test('ContributionWorkflow: createPublishedPackage embeds Luma modeling metadata for Module 7 and Module 6', () => {
  const workflow = new ContributionWorkflow();

  const ownedPoints = [
    {
      observation_id: 'pt_owned_1',
      geometry: { type: 'Point', coordinates: [104.5, -2.5] },
      dataset_archive: '1_Data_Pengguna_1/Data_kebun_sawit_karet_F.zip',
      source_class_id: '1',
      source_class_label: 'Kebun sawit',
      project_class_id: 1,
      project_class_label: 'Kelapa sawit',
      observed_time: { year: 2026 },
      method: 'Survei GPS Lapangan'
    }
  ];

  const lumaContextMock = {
    activeModule: 7,
    module4Separability: {
      method: 'Jeffries-Matusita Distance (JM)',
      pairs: [{ pair: 'Karet vs Kelapa sawit', distance: 1.84, rating: 'Baik (>1.8)' }]
    },
    module6Classification: {
      algorithm: 'Random Forest (RF)',
      numberOfTrees: 100,
      features: 'Sentinel-2 (B2-B12, NDVI)'
    },
    module7Validation: {
      overallAccuracy: 89.2,
      kappa: 0.835,
      testSampleSize: 150
    }
  };

  const declarations = {
    title: 'Data Kebun Mandiri Sawit & Karet 2026',
    accountName: 'Staf GIS',
    owningInstitution: 'Dinas Perkebunan Kabupaten Banyuasin',
    technicalEmail: 'disbun@banyuasinkab.go.id',
    confirmedYear: 2026,
    acquisitionMethod: 'Survei GPS Lapangan',
    responsibilityAccepted: true,
    includeLumaMetadata: true,
    lumaContext: lumaContextMock
  };

  const pkg = workflow.createPublishedPackage(ownedPoints, declarations);

  assert.equal(pkg.meta.title, 'Data Kebun Mandiri Sawit & Karet 2026', 'Custom title must be used');
  assert.ok(pkg.meta.luma_modeling, 'Luma modeling must be attached to packageMeta');
  assert.equal(pkg.meta.luma_modeling.module4Separability, undefined, 'Separability must not be present');
  assert.equal(pkg.meta.luma_modeling.module6Classification, undefined);
  assert.equal(pkg.meta.luma_modeling.module7Validation, undefined);
  assert.equal(pkg.meta.luma_modeling.status, 'Metadata Terlampir');
});

