/**
 * src/features/partner-reuse.js
 * Implementation of Case 3: Cross-sector partner reuse for Forestry workspace (Role B).
 * 
 * Invariants:
 * - Role B forestry workspace: source forest points (86 inside AOI) map to Hutan; Non-hutan starts at 0.
 * - Discovers partner paddy collection (166 inside AOI) and Case 2 donated plantation collection.
 * - Displays source class counts and simulated contributor/rights cards labelled scenario.
 * - Reuses selection/preview/dedup pipeline with projection to Non-hutan.
 * - Excludes forest / ambiguous source labels from candidate addition.
 * - Source attribution ledger: method, time, rights state, original class, current projected class.
 * - Never infers open licence from partner directory.
 * - Source mode with unknown permissions blocks reuse/export; scenario assumptions explicit.
 * - Preserves donor lineage; standalone replay uses labelled scenario fixture.
 */

import { CASE3_FORESTRY_CLASSES } from '../domain/taxonomy.js';
import { resolveCanonicalDatasetId, MODES } from '../demo/scenarios.js';

/**
 * Standard reproducible fallback scenario fixture for Case 2 donated points
 * used during standalone Case 3 replay when Case 2 has not run yet.
 * Uses explicitly labelled synthetic provenance and unique synthetic IDs.
 */
export const CASE2_STANDALONE_FIXTURE = Object.freeze([
  {
    observation_id: 'synthetic_case2_fixture_000000',
    geometry: { type: 'Point', coordinates: [104.4731045, -2.4255685] },
    dataset_archive: 'synthetic_fixtures/case2_donated_sample.json',
    identity_basis: 'synthetic_scenario_fixture',
    source_schema_id: 'schema_pengguna_plantation_v1',
    source_class_id: '1',
    source_class_label: 'Kebun sawit',
    project_class_id: 2,
    project_class_label: 'Kelapa sawit',
    observed_time: { year: 2026 },
    method: 'Survei Lapangan',
    is_within_aoi: true,
    contributor_id: 'pemilik_a',
    owner: 'Pemilik A (Pengguna)',
    rights_id: 'simulated_open_donor_consent',
    is_scenario_fixture: true,
    scenario_overlay: {
      owner: 'Pemilik A (Pengguna)',
      contributorDisplayName: 'Pemilik A (Donasi Percontohan)',
      rightsStatus: 'Izin donasi disimulasikan (Skenario Standalone)',
      method: 'Survei Lapangan',
      qualityTier: 4,
      assumptions: ['Titik donasi kebun sawit/karet disimulasikan untuk pengujian Kasus 3 mandiri']
    }
  },
  {
    observation_id: 'synthetic_case2_fixture_000001',
    geometry: { type: 'Point', coordinates: [104.4752102, -2.4278191] },
    dataset_archive: 'synthetic_fixtures/case2_donated_sample.json',
    identity_basis: 'synthetic_scenario_fixture',
    source_schema_id: 'schema_pengguna_plantation_v1',
    source_class_id: '2',
    source_class_label: 'Kebun karet',
    project_class_id: 1,
    project_class_label: 'Karet',
    observed_time: { year: 2026 },
    method: 'Survei Lapangan',
    is_within_aoi: true,
    contributor_id: 'pemilik_a',
    owner: 'Pemilik A (Pengguna)',
    rights_id: 'simulated_open_donor_consent',
    is_scenario_fixture: true,
    scenario_overlay: {
      owner: 'Pemilik A (Pengguna)',
      contributorDisplayName: 'Pemilik A (Donasi Percontohan)',
      rightsStatus: 'Izin donasi disimulasikan (Skenario Standalone)',
      method: 'Survei Lapangan',
      qualityTier: 4,
      assumptions: ['Titik donasi kebun sawit/karet disimulasikan untuk pengujian Kasus 3 mandiri']
    }
  }
]);

export class PartnerReuseWorkflow {
  constructor(workspace) {
    this.workspace = workspace;
    this.selectedPartnerSource = 'data_sawah';
    this.cachedPartnerRecords = [];
  }

  /**
   * Initializes Role B Forestry Workspace with forest observations mapped to Hutan.
   * @param {Array<Object>} rawForestRecords Loaded records from data_hutan
   * @returns {Array<Object>} Normalized forestry records (Hutan = 1, Non-hutan = absent)
   */
  initForestryRole(rawForestRecords = []) {
    return rawForestRecords
      .filter(r => r.is_within_aoi !== false)
      .map(r => ({
        ...r,
        project_class_id: 1,
        project_class_label: 'Hutan',
        role_context: 'role_b_forestry'
      }));
  }

  /**
   * Discovers available partner collections in catalogue and from Case 2 donations.
   * Paddy count is derived from actual loaded records inside AOI.
   * @param {Object} [case2DonatedCollection] Optional actual Case 2 donated package
   * @param {Array<Object>} [paddyRecords] Optional loaded paddy records
   * @returns {Array<{ id: string, title: string, count: number, contributor: string, rights: string, isScenario: boolean, isFixture: boolean }>}
   */
  discoverPartnerCatalogues(case2DonatedCollection = null, paddyRecords = null) {
    const paddyCount = Array.isArray(paddyRecords)
      ? paddyRecords.filter(r => r.is_within_aoi !== false).length
      : 166;

    const list = [
      {
        id: 'data_sawah',
        title: 'Data Lahan Sawah (Dinas Pertanian)',
        count: paddyCount, // derived inside AOI
        contributor: 'Dinas Pertanian Daerah (Penyuluh)',
        rights: 'Izin data terbuka (Simulasi Skenario)',
        sourceRights: 'Belum tercatat (null)',
        method: 'Survei Lahan Pertanian',
        isScenario: true,
        isFixture: false
      }
    ];

    if (case2DonatedCollection && case2DonatedCollection.records?.length > 0) {
      list.push({
        id: 'data_kontribusi_mandiri',
        title: 'Data Donasi Kebun (Kasus 2 Aktif)',
        count: case2DonatedCollection.records.length,
        contributor: 'Pemilik A (Kontribusi Mandiri)',
        rights: 'Izin donasi internal terbuka (Simulasi)',
        sourceRights: 'Izin donasi disepakati',
        method: 'Survei Lapangan / Interpretasi Citra',
        isScenario: true,
        isFixture: false
      });
    } else {
      list.push({
        id: 'data_kontribusi_mandiri_fixture',
        title: 'Data Donasi Kebun (Simulasi Percontohan)',
        count: CASE2_STANDALONE_FIXTURE.length,
        contributor: 'Pemilik A (Simulasi Skenario)',
        rights: 'Izin disimulasikan untuk percontohan mandiri',
        sourceRights: 'Belum tercatat (null)',
        method: 'Survei Lapangan',
        isScenario: true,
        isFixture: true
      });
    }

    return list;
  }

  /**
   * Calculates candidate preview for mapping partner records into Non-hutan (2).
   * In source mode, unknown permissions blocks reuse (never invents consent).
   * Excludes any forest or ambiguous source labels.
   * @param {Array<Object>} partnerRecords
   * @param {string} sourceId
   * @param {string} mode 'source' or 'scenario'
   * @param {Array<Object>} currentForestRecords
   * @returns {Object} Preview calculation and permission status
   */
  calculateReusePreview(partnerRecords, sourceId, mode = MODES.SCENARIO, currentForestRecords = []) {
    const records = Array.isArray(partnerRecords) ? partnerRecords : [];
    const isScenario = mode === MODES.SCENARIO;

    // 1. Permission check: source mode requires recorded rights, never infers open licence or invents consent
    let permissionBlocked = false;
    let permissionMessage = null;

    if (!isScenario) {
      const hasUnverifiedRights = records.some(r => !r.rights_id || r.rights_id === 'unknown' || r.rights_id === 'simulated_open_donor_consent');
      if (hasUnverifiedRights) {
        permissionBlocked = true;
        permissionMessage = 'Hak penggunaan data mitra belum tercatat pada berkas sumber asli (null). Pada mode sumber nyata yang ketat, penggunaan ulang data pihak ketiga diblokir sampai lisensi resmi diverifikasi.';
      }
    }

    // 2. Filter eligible partner points (within AOI, exclude forest labels)
    const eligibleCandidates = [];
    const excludedCandidates = [];

    for (const r of records) {
      if (r.is_within_aoi === false) {
        excludedCandidates.push({ record: r, reason: 'Berada di luar batas wilayah AOI Banyuasin' });
        continue;
      }

      const srcLabel = String(r.source_class_label || '').toLowerCase();
      // Exclude forest or ambiguous labels when selecting Non-hutan
      if (srcLabel.includes('hutan') || srcLabel.includes('forest')) {
        excludedCandidates.push({ record: r, reason: 'Kelas sumber terindikasi Hutan, tidak dapat dipetakan ke Non-hutan' });
        continue;
      }

      eligibleCandidates.push(r);
    }

    // 3. Deduplicate against existing forest workspace points
    const existingIds = new Set(currentForestRecords.map(p => p.observation_id));
    const netNewPoints = [];
    const duplicatePoints = [];

    for (const r of eligibleCandidates) {
      if (existingIds.has(r.observation_id)) {
        duplicatePoints.push(r);
      } else {
        netNewPoints.push({
          ...r,
          project_class_id: 2, // Map to Non-hutan in Role B
          project_class_label: 'Non-hutan',
          donor_lineage: {
            donor_source_id: sourceId,
            original_source_class_id: r.source_class_id,
            original_source_class_label: r.source_class_label,
            donor_contributor: r.contributor_id || 'Mitra Pertanian / Perkebunan',
            reused_at: new Date().toISOString()
          }
        });
      }
    }

    // 4. Build source attribution ledger
    const ledger = netNewPoints.map(pt => ({
      observationId: pt.observation_id,
      sourceDataset: sourceId,
      contributor: pt.contributor_id || 'Mitra Dinas / Konsorsium',
      originalClass: pt.source_class_label || 'Tanpa label',
      projectedClass: 'Non-hutan',
      method: pt.method || 'Survei Lahan / Lapangan',
      observedYear: pt.observed_time?.year || (isScenario ? 2025 : 'Belum tercatat'),
      rightsState: isScenario ? 'Izin Terbuka (Simulasi Mitra)' : (pt.rights_id || 'Belum tercatat (null)'),
      isScenarioOverlay: isScenario
    }));

    return {
      sourceId,
      mode,
      permissionBlocked,
      permissionMessage,
      totalSourceCandidates: records.length,
      eligibleCandidateCount: eligibleCandidates.length,
      excludedCount: excludedCandidates.length,
      duplicateCount: duplicatePoints.length,
      netNewCount: netNewPoints.length,
      currentTotalCount: currentForestRecords.length,
      projectedTotalCount: currentForestRecords.length + netNewPoints.length,
      netNewPoints,
      duplicatePoints,
      ledger
    };
  }

  /**
   * Commits partner reuse into forestry workspace, producing combined dataset.
   * @param {Object} previewResult
   * @param {Array<Object>} currentForestRecords
   * @returns {{ success: boolean, combinedRecords: Array<Object>, addedCount: number }}
   */
  confirmPartnerReuse(previewResult, currentForestRecords = []) {
    if (previewResult.permissionBlocked) {
      throw new Error(`Penggunaan ulang data mitra gagal: ${previewResult.permissionMessage}`);
    }

    const combined = [...currentForestRecords, ...previewResult.netNewPoints];

    return {
      success: true,
      datasetId: 'data_kehutanan_terpadu',
      title: 'Data Kehutanan Terpadu (Hutan & Non-Hutan)',
      combinedRecords: combined,
      addedCount: previewResult.netNewPoints.length,
      totalCount: combined.length
    };
  }
}
