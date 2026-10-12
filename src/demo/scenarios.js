/**
 * src/demo/scenarios.js
 * Definitions and overlay logic for Local Scenario Mode vs Strict Source Browse Mode.
 * 
 * Invariants:
 * - Never mutates source properties.
 * - Source mode preserves null dates, rights, and quality.
 * - Scenario mode provides separate labelled overlay: "Metadatanya asumsi skenario".
 * - Strict eligible search in source mode excludes unknown dates with clear explanation.
 * - Demo mode includes documented year/quality/rights assumptions only.
 */

export const MODES = Object.freeze({
  SOURCE: 'source',     // Mode Sumber Nyata (strict, nulls retained)
  SCENARIO: 'scenario'  // Mode Skenario Percontohan (labelled assumptions overlay)
});

export const EXPORT_PURPOSES = Object.freeze({
  PRIVATE_TRAINING: 'PRIVATE_TRAINING',
  SHARING: 'SHARING'
});

export const SCENARIO_LABEL = 'Metadatanya asumsi skenario';

export const CASES_NAVIGATION = Object.freeze([
  {
    id: 1,
    title: 'Kasus 1',
    label: 'Kasus 1: Lengkapi Sampel',
    description: 'Melengkapi kelas Lainnya dari katalog terbuka Banyuasin',
    status: 'active'
  },
  {
    id: 2,
    title: 'Kasus 2',
    label: 'Kasus 2: Kontribusi Mandiri',
    description: 'Penyumbangan observasi milik mandiri dan sampling interaktif di peta',
    status: 'active'
  },
  {
    id: 3,
    title: 'Kasus 3',
    label: 'Kasus 3: Data Mitra',
    description: 'Penggunaan ulang titik rujukan lintas sektor (kehutanan dan sawah)',
    status: 'active'
  },
  {
    id: 4,
    title: 'Kasus 4',
    label: 'Kasus 4: Uji Mutu',
    description: 'Penelaahan independen buta dan penentuan tingkat mutu (Tier 1–4)',
    status: 'active'
  }
]);

export const PROJECT_CONTEXT = Object.freeze({
  projectId: 'epistem_banyuasin_2026',
  projectName: 'Proyek Rujukan Tutupan Lahan Banyuasin',
  aoiId: 'banyuasin',
  aoiName: 'Kabupaten Banyuasin',
  targetYear: 2026,
  sourceImageInterval: null, // UNKNOWN in source mode
  scenarioImageInterval: {
    precision: 'interval',
    start: '2026-01-01',
    end: '2026-06-30',
    basis: 'declared',
    label: 'Semester 1 2026 (Asumsi Skenario)'
  },
  discoveryWindow: {
    startYear: 2024,
    endYear: 2026
  }
});

/**
 * Resolves archive relative path or slug to canonical catalogue dataset ID.
 * Preserves original archive path in observation provenance while enabling scenario lookups.
 * @param {string} archiveOrId
 * @returns {string}
 */
export function resolveCanonicalDatasetId(archiveOrId) {
  if (!archiveOrId) return 'unknown';
  const s = String(archiveOrId).toLowerCase();
  if (s.includes('kebun_sawit_karet')) return 'data_kebun_sawit_karet_f';
  if (s.includes('data_ref_mod_2b')) return 'data_ref_mod_2b';
  if (s.includes('data_ref_mod_f') || s.includes('data_ref_mod')) return 'data_ref_mod_f';
  if (s.includes('data_hutan')) return 'data_hutan';
  if (s.includes('data_sawah')) return 'data_sawah';
  if (s.includes('case4_data_kombinasi') || s.includes('case4')) return 'case4_data_kombinasi_f';
  if (s.includes('data_campuran_1')) return 'data_campuran_1';
  if (s.includes('data_kontribusi_mandiri') || s.includes('kontribusi')) return 'data_kontribusi_mandiri';
  return s;
}

/**
 * Static scenario metadata definitions per dataset.
 */
export const DATASET_SCENARIOS = Object.freeze({
  data_kebun_sawit_karet_f: {
    observedYear: 2026,
    owner: 'Pemilik A (Pengguna)',
    contributorDisplayName: 'Pemilik A',
    rightsStatus: 'Izin penggunaan internal (Simulasi)',
    method: 'Survei Lapangan',
    qualityTier: null,
    assumptions: [
      'Titik observasi awal diasumsikan diamati pada tahun 2026 oleh Pemilik A',
      'Izin penggunaan internal percontohan'
    ]
  },
  data_ref_mod_2b: {
    observedYear: 2025,
    owner: 'Koleksi Mitra Rujukan',
    contributorDisplayName: 'Tim Telaah Mitra',
    rightsStatus: 'Izin penggunaan terbuka (Simulasi Mitra)',
    method: 'Interpretasi Citra & Uji Lapang',
    qualityTier: 2,
    assumptions: [
      'Observasi referensi 2b diasumsikan diamati tahun 2025',
      'Telah melalui penelaahan independen Tier 2',
      'Izin penggunaan data terbuka untuk pelatihan'
    ]
  },
  data_hutan: {
    observedYear: 2024,
    owner: 'Konsorsium Mitra Kehutanan',
    contributorDisplayName: 'Mitra Kehutanan',
    rightsStatus: 'Izin data terbuka (Simulasi)',
    method: 'Inventarisasi Hutan',
    qualityTier: 3,
    assumptions: [
      'Titik hutan diamati tahun 2024 dengan izin terbuka mitra'
    ]
  },
  data_sawah: {
    observedYear: 2025,
    owner: 'Dinas Pertanian Daerah',
    contributorDisplayName: 'Penyuluh Pertanian',
    rightsStatus: 'Izin data terbuka (Simulasi)',
    method: 'Survei Lahan Pertanian',
    qualityTier: 3,
    assumptions: [
      'Titik sawah diamati tahun 2025 dengan izin terbuka dinas'
    ]
  },
  data_ref_mod_f: {
    observedYear: 2025,
    owner: 'Koleksi Referensi 2a',
    contributorDisplayName: 'Sumber Rujukan',
    rightsStatus: 'Belum terverifikasi',
    method: 'unknown',
    qualityTier: null,
    assumptions: [
      'Koleksi 2a tidak memiliki atribut label kelas sumber (unclassified)'
    ]
  },
  case4_data_kombinasi_f: {
    observedYear: 2025,
    owner: 'Koleksi Gabungan',
    contributorDisplayName: 'Multi-Sumber',
    rightsStatus: 'Simulasi Terpadu',
    method: 'Campuran',
    qualityTier: null,
    assumptions: [
      'Koleksi kombinasi multi-sumber untuk Kasus 4'
    ]
  },
  data_campuran_1: {
    observedYear: 2026,
    owner: 'Koleksi Gabungan Pengguna',
    contributorDisplayName: 'Pemilik A & Mitra',
    rightsStatus: 'Izin penggunaan internal percontohan (Simulasi)',
    method: 'Campuran',
    qualityTier: null,
    assumptions: [
      'Gabungan data kebun pengguna dan rujukan mitra'
    ]
  },
  data_kontribusi_mandiri: {
    observedYear: 2026,
    owner: 'Pemilik A (Pengguna)',
    contributorDisplayName: 'Pemilik A (Kontribusi Mandiri)',
    rightsStatus: 'Izin donasi internal terbuka (Simulasi)',
    method: 'Interpretasi Citra / Survei Lapangan',
    qualityTier: null,
    assumptions: [
      'Titik kontribusi mandiri diamati pada tahun 2026 oleh Pemilik A',
      'Izin donasi data untuk mitra konsorsium'
    ]
  }
});

/**
 * Returns a non-mutating scenario overlay for a given observation and dataset.
 * Accepts either dataset ID or raw archive path, maintaining separate source metadata.
 * @param {string} datasetIdOrArchive
 * @param {Object} [observation]
 * @returns {Object} Overlay descriptor
 */
export function getScenarioOverlay(datasetIdOrArchive, observation = null) {
  if (observation && observation.scenario_overlay) {
    return {
      isScenarioOverlay: true,
      scenarioLabel: SCENARIO_LABEL,
      ...observation.scenario_overlay
    };
  }

  const canonicalId = resolveCanonicalDatasetId(datasetIdOrArchive);
  const scenario = DATASET_SCENARIOS[canonicalId] || DATASET_SCENARIOS[datasetIdOrArchive];
  if (!scenario) {
    return {
      isScenarioOverlay: false,
      observedYear: null,
      rightsStatus: null,
      qualityTier: null,
      assumptions: []
    };
  }

  return {
    isScenarioOverlay: true,
    scenarioLabel: SCENARIO_LABEL,
    observedYear: scenario.observedYear,
    owner: scenario.owner,
    contributorDisplayName: scenario.contributorDisplayName,
    rightsStatus: scenario.rightsStatus,
    method: scenario.method,
    qualityTier: scenario.qualityTier,
    assumptions: [...scenario.assumptions]
  };
}

/**
 * Evaluates candidate points under strict source mode or scenario overlay mode.
 * @param {Array<Object>} observations Array of domain records
 * @param {string} datasetId Identifier of the source dataset
 * @param {string} mode 'source' or 'scenario'
 * @param {Object} [filterOptions] Filter parameters
 * @returns {{
 *   eligible: Array<Object>,
 *   excluded: Array<{ observation: Object, reason: string, explanation: string }>,
 *   counts: { total: number, eligible: number, excluded: number, byReason: Object }
 * }}
 */
export function evaluateCandidateEligibility(observations, datasetId, mode = MODES.SCENARIO, filterOptions = {}) {
  const opts = {
    withinAoi: filterOptions.withinAoi !== false,
    minYear: filterOptions.minYear ?? 2024,
    maxYear: filterOptions.maxYear ?? 2026,
    requireRights: filterOptions.requireRights !== false
  };

  const eligible = [];
  const excluded = [];
  const byReason = {};

  const addExclusion = (obs, reason, explanation) => {
    excluded.push({ observation: obs, reason, explanation });
    byReason[reason] = (byReason[reason] || 0) + 1;
  };

  const isScenario = mode === MODES.SCENARIO;
  const scenarioMeta = isScenario ? DATASET_SCENARIOS[datasetId] : null;

  for (const obs of observations) {
    // 1. Spatial AOI Check
    if (opts.withinAoi && obs.is_within_aoi === false) {
      addExclusion(obs, 'outside_aoi', 'Titik berada di luar batas wilayah Kabupaten Banyuasin.');
      continue;
    }

    // 2. Temporal Check (2024–2026)
    let year = null;
    if (isScenario && scenarioMeta && scenarioMeta.observedYear) {
      year = scenarioMeta.observedYear;
    } else if (obs.observed_time && typeof obs.observed_time.year === 'number') {
      year = obs.observed_time.year;
    }

    if (year === null) {
      // In source mode, unknown dates fail closed
      addExclusion(obs, 'unknown_time', 'Tahun observasi tidak tercatat di sumber asli (null). Pada mode sumber nyata, data tanpa tahun terverifikasi dikecualikan dari jendela 2024–2026.');
      continue;
    }

    if (year < opts.minYear || year > opts.maxYear) {
      addExclusion(obs, 'outside_period', `Tahun observasi (${year}) berada di luar rentang jendela pencarian ${opts.minYear}–${opts.maxYear}.`);
      continue;
    }

    // 3. Rights / Permission Check
    let hasRights = false;
    if (isScenario && scenarioMeta && scenarioMeta.rightsStatus) {
      hasRights = true;
    } else if (obs.rights_id) {
      hasRights = true;
    }

    if (opts.requireRights && !hasRights) {
      addExclusion(obs, 'permission_missing', 'Hak penggunaan atau lisensi observasi belum terverifikasi (null).');
      continue;
    }

    // Passed all checks
    eligible.push(obs);
  }

  return {
    eligible,
    excluded,
    counts: {
      total: observations.length,
      eligible: eligible.length,
      excluded: excluded.length,
      byReason
    }
  };
}

/**
 * Centralised evaluation of export eligibility.
 * Evaluates points against mode, role, active schema, quality tiers, ownership, and boundaries.
 * 
 * Invariants:
 * - Excludes incomplete, disputed, unmapped, outside-AOI records.
 * - Excludes unauthorized records in source mode (unknown rights/time).
 * - Third-party Tier 4 (unreviewed) is NEVER included.
 * - Tier 3 and own unreviewed points require explicit opt-ins (default false).
 * - Opt-ins cannot bypass spatial, mapping, completeness, or dispute gates.
 * 
 * @param {Array<Object>} records
 * @param {Object} [options]
 * @param {string} [options.mode] 'source' or 'scenario'
 * @param {Object} [options.activeSchema] Target class definitions
 * @param {boolean} [options.optInTier3]
 * @param {boolean} [options.optInOwnUnreviewed]
 * @param {string} [options.currentUserRole]
 * @param {Object} [options.boundaryGeoJson]
 * @returns {{
 *   eligible: Array<Object>,
 *   excluded: Array<{ observation: Object, reason: string, explanation: string }>,
 *   counts: { total: number, eligible: number, excluded: number, byReason: Object, byClass: Object }
 * }}
 */
export function evaluateExportEligibility(records = [], options = {}) {
  const mode = options.mode || MODES.SCENARIO;
  const isScenario = mode === MODES.SCENARIO;
  const purpose = options.purpose || EXPORT_PURPOSES.SHARING;
  const isPrivateTraining = purpose === EXPORT_PURPOSES.PRIVATE_TRAINING;
  const optInTier3 = Boolean(options.optInTier3);
  const optInOwnUnreviewed = Boolean(options.optInOwnUnreviewed);
  const currentUserRole = options.currentUserRole || 'pemilik_a';
  const activeSchema = options.activeSchema || null;

  const validClassIds = activeSchema
    ? new Set(Object.keys(activeSchema).map(k => Number(activeSchema[k].class_id ?? activeSchema[k].id ?? k)))
    : null;

  const eligible = [];
  const excluded = [];
  const byReason = {};
  const byClass = {};
  const unknownWarnings = new Set();

  const addExclusion = (obs, reason, explanation) => {
    excluded.push({ observation: obs, reason, explanation });
    byReason[reason] = (byReason[reason] || 0) + 1;
  };

  for (const obs of records) {
    if (!obs || typeof obs !== 'object') continue;

    // 1. Spatial AOI gate
    if (obs.is_within_aoi === false) {
      addExclusion(obs, 'outside_aoi', 'Titik berada di luar batas wilayah AOI Kabupaten Banyuasin.');
      continue;
    }

    // 2. Unmapped / invalid project class gate
    const projClass = obs.project_class_id;
    if (projClass === null || projClass === undefined || !Number.isInteger(Number(projClass)) || Number(projClass) <= 0) {
      addExclusion(obs, 'unmapped_class', 'Kelas proyek belum dipetakan (null atau non-integer).');
      continue;
    }
    const numClass = Number(projClass);
    if (validClassIds && !validClassIds.has(numClass)) {
      addExclusion(obs, 'unsupported_class', `Kelas proyek (${numClass}) tidak didukung dalam skema aktif.`);
      continue;
    }

    // 3. Completeness gate
    if (obs.is_incomplete === true || obs.review_status === 'draft_incomplete' || obs.review_status === 'incomplete') {
      addExclusion(obs, 'incomplete', 'Observasi tidak lengkap (kurang bukti citra/data survei).');
      continue;
    }

    // 4. Dispute gate (contradictions block promotion and export)
    if (obs.review_status === 'disputed' || obs.review_status === 'DISPUTED') {
      addExclusion(obs, 'disputed', 'Observasi dalam sengketa perbedaan pendapat penelaah independen.');
      continue;
    }

    // Explicit known no-use / denied rights gate (blocks all purposes)
    if (obs.rights_id === 'denied' || obs.rights_id === 'prohibited' || obs.rights_id === 'no_use') {
      addExclusion(obs, 'denied_rights', 'Hak penggunaan observasi secara eksplisit dilarang atau ditolak.');
      continue;
    }

    if (isPrivateTraining) {
      // PRIVATE TRAINING PURPOSE:
      // Unknown rights/date/quality become disclosed warnings, not blanket exclusion.
      // Raw values preserved, no tier promotion, no forged permissions/dates.
      if (!obs.rights_id || obs.rights_id === 'unknown' || obs.rights_id === 'simulated_open_donor_consent') {
        unknownWarnings.add('Status hak/izin penggunaan pada sebagian data belum diverifikasi secara independen.');
      }
      if (!obs.observed_time || !obs.observed_time.year) {
        unknownWarnings.add('Waktu perekaman observasi asli pada sebagian data belum tercatat (null).');
      }

      const canonId = resolveCanonicalDatasetId(obs.dataset_archive);
      const overlay = isScenario ? getScenarioOverlay(obs.dataset_archive, obs) : null;
      const tier = (obs.quality_tier !== undefined && obs.quality_tier !== null)
        ? obs.quality_tier
        : (isScenario ? (overlay?.qualityTier ?? null) : null);

      if (tier === null || tier === 4 || obs.review_status === 'unreviewed' || obs.review_status === 'draft') {
        unknownWarnings.add('Sebagian observasi belum melalui proses uji mutu independen (Tier 4 / mentah).');
      }

      // Optional advanced quality filter if requested by user
      if (options.qualityFilter && options.qualityFilter !== 'all') {
        if (options.qualityFilter === 'tier2_only' && tier !== 2) {
          addExclusion(obs, 'quality_filter', 'Filter kualitas lanjutan: hanya menyertakan titik konsensus Tier 2.');
          continue;
        }
        if (options.qualityFilter === 'tier2_and_3' && (tier !== 2 && tier !== 3)) {
          addExclusion(obs, 'quality_filter', 'Filter kualitas lanjutan: hanya menyertakan titik Tier 2 dan Tier 3.');
          continue;
        }
      }

      // Passed all checks for private training
      eligible.push(obs);
      byClass[String(numClass)] = (byClass[String(numClass)] || 0) + 1;
      continue;
    }

    // 5. Source mode permission & unknown metadata gate (DEFAULT / SHARING)
    if (!isScenario) {
      const hasRights = obs.rights_id && obs.rights_id !== 'unknown' && obs.rights_id !== 'simulated_open_donor_consent';
      if (!hasRights) {
        addExclusion(obs, 'unauthorised', 'Status hak/izin belum terverifikasi pada mode sumber nyata.');
        continue;
      }
      const hasTime = obs.observed_time && obs.observed_time.year;
      if (!hasTime) {
        addExclusion(obs, 'unknown_time', 'Waktu observasi belum tercatat pada mode sumber nyata.');
        continue;
      }
    }

    // 6. Quality Tier & Ownership gates (DEFAULT / SHARING)
    const canonId = resolveCanonicalDatasetId(obs.dataset_archive);
    const overlay = isScenario ? getScenarioOverlay(obs.dataset_archive, obs) : null;

    const isOwnPoint = isScenario
      ? Boolean(
          obs.contributor_id === currentUserRole ||
          obs.is_user_owned === true ||
          obs.is_screen_sample === true ||
          canonId === 'data_kebun_sawit_karet_f' ||
          obs.dataset_archive?.includes('Data_kebun_sawit_karet') ||
          obs.dataset_archive?.includes('1_Data_Pengguna')
        )
      : Boolean(
          (obs.contributor_id === currentUserRole || obs.is_user_owned === true) &&
          !obs.dataset_archive?.includes('2_Data_Rujukan') &&
          canonId !== 'data_ref_mod_2b' &&
          canonId !== 'data_ref_mod_f'
        );

    const tier = (obs.quality_tier !== undefined && obs.quality_tier !== null)
      ? obs.quality_tier
      : (isScenario ? (overlay?.qualityTier ?? null) : null);
    const isTier3 = tier === 3 || obs.review_status === 'in_review';
    const isTier4OrUnreviewed = tier === 4 ||
                                obs.review_status === 'unreviewed' ||
                                obs.review_status === 'draft' ||
                                tier === null;

    if (isTier3) {
      if (!optInTier3) {
        addExclusion(obs, 'tier3_excluded', 'Titik Tier 3 (hanya 1 penelaah) memerlukan persetujuan opt-in.');
        continue;
      }
    } else if (isTier4OrUnreviewed) {
      if (isOwnPoint) {
        if (!optInOwnUnreviewed) {
          addExclusion(obs, 'own_unreviewed_excluded', 'Titik mandiri belum ditelaah (Tier 4) memerlukan persetujuan opt-in.');
          continue;
        }
      } else {
        // Third-party Tier 4 is never included
        addExclusion(obs, 'third_party_tier4_excluded', 'Titik pihak ketiga Tier 4 (belum ditelaah) tidak memenuhi syarat ekspor.');
        continue;
      }
    }

    // Passed all gates
    eligible.push(obs);
    byClass[String(numClass)] = (byClass[String(numClass)] || 0) + 1;
  }

  return {
    eligible,
    excluded,
    purpose,
    unknownMetadataWarnings: Array.from(unknownWarnings),
    counts: {
      total: records.length,
      eligible: eligible.length,
      excluded: excluded.length,
      byReason,
      byClass
    }
  };
}
