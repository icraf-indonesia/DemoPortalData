/**
 * src/features/contribute.js
 * Implementation of Case 2: Contribution and On-Screen Sampling.
 * 
 * Invariants:
 * - Separates owned initial plantation points from imported reference points.
 * - Shows excluded imported records and explains why (third-party reference data).
 * - Preserves source identity, raw labels, owner, and rights intact.
 * - Provisional hierarchical picker: Vegetasi > Sistem berbasis pohon > Perkebunan monokultur > Kebun karet / Kebun sawit.
 * - Records discrepancy: old MASTER_TAXONOMY has 21 leaf classes, not 22 authoritative.
 * - On-screen map sampling creates draft point; requires class, year, imagery ref, reason, uncertainty.
 * - Missing imagery evidence leaves draft incomplete; cannot become valid reviewed sample.
 * - Explicit origin: 'field_survey' vs 'image_interpretation'.
 * - Screen points assigned high review priority separately from quality tier.
 * - Idempotent submit, UUID-based IDs, persisted local simulated collection.
 */

import { PROVISIONAL_HIERARCHY, PROJECT_CLASSES } from '../domain/taxonomy.js';
import { resolveCanonicalDatasetId, MODES } from '../demo/scenarios.js';
import { isPointInAoi } from '../domain/records.js';

export const SAMPLING_ORIGINS = Object.freeze({
  FIELD_SURVEY: 'field_survey',
  IMAGE_INTERPRETATION: 'image_interpretation'
});

export const REVIEW_PRIORITIES = Object.freeze({
  NORMAL: 'normal',
  HIGH: 'high'
});

export class ContributionWorkflow {
  constructor(workspace) {
    this.workspace = workspace;
    this.activeMode = workspace?.activeMode || 'scenario';
    this.isSamplingModeActive = false;
    this.stagedDraft = null;
    this.donatedCollection = null; // 'data_kontribusi_mandiri'
  }

  /**
   * Evaluates active records to separate owned observations from imported third-party observations.
   * In source mode, folder paths cannot be used to infer ownership.
   * @param {Array<Object>} records
   * @returns {{
   *   owned: Array<Object>,
   *   excludedImported: Array<{ record: Object, reason: string }>,
   *   summary: { total: number, ownedCount: number, excludedCount: number }
   * }}
   */
  separateOwnedObservations(records = []) {
    const list = Array.isArray(records) ? records : [];
    const owned = [];
    const excludedImported = [];
    const mode = this.workspace?.activeMode || this.activeMode || 'scenario';
    const isSourceMode = mode === 'source';

    for (const r of list) {
      const canonId = resolveCanonicalDatasetId(r.dataset_archive);
      let isOwned = false;

      if (isSourceMode) {
        // In source mode, folder/archive path cannot infer ownership.
        isOwned = (r.contributor_id === 'pemilik_a' || r.is_user_owned === true) &&
                  !r.dataset_archive?.includes('2_Data_Rujukan') &&
                  canonId !== 'data_ref_mod_2b' &&
                  canonId !== 'data_ref_mod_f';
      } else {
        // In scenario mode, plantation observations have a labelled scenario assumption of ownership
        isOwned = (canonId === 'data_kebun_sawit_karet_f' ||
                   r.dataset_archive?.includes('Data_kebun_sawit_karet') ||
                   r.dataset_archive?.includes('1_Data_Pengguna') ||
                   r.contributor_id === 'pemilik_a' ||
                   r.is_user_owned === true) &&
                  !r.dataset_archive?.includes('2_Data_Rujukan') &&
                  canonId !== 'data_ref_mod_2b' &&
                  canonId !== 'data_ref_mod_f';
      }

      if (isOwned) {
        owned.push(r);
      } else {
        excludedImported.push({
          record: r,
          reason: 'Koleksi rujukan pihak ketiga (data impor rujukan modular 2b) bukan milik pengguna dan dikecualikan dari kontribusi mandiri.'
        });
      }
    }

    return {
      owned,
      excludedImported,
      summary: {
        total: list.length,
        ownedCount: owned.length,
        excludedCount: excludedImported.length
      }
    };
  }

  /**
   * Creates a donated contribution package from owned observations.
   * Independently rejects imported records at domain boundary.
   * Preserves original source labels, IDs, rights, quality, and metadata intact.
   * @param {Array<Object>} ownedRecords
   * @returns {Object} Canonical donated collection metadata and points
   */
  createDonatedPackage(ownedRecords) {
    if (!Array.isArray(ownedRecords) || ownedRecords.length === 0) {
      throw new Error('Tidak ada observasi milik mandiri yang dipilih untuk dikontribusikan.');
    }

    // Boundary check: independently reject imported or non-owned partner records at domain boundary!
    const currentMode = this.workspace?.activeMode || this.activeMode || 'scenario';
    for (const r of ownedRecords) {
      const canonId = resolveCanonicalDatasetId(r.dataset_archive);
      const isNotOwned = canonId === 'data_ref_mod_2b' ||
                         canonId === 'data_ref_mod_f' ||
                         canonId === 'data_hutan' ||
                         r.dataset_archive?.includes('Data_ref_mod') ||
                         r.dataset_archive?.includes('2_Data_Rujukan') ||
                         r.dataset_archive?.includes('Data_hutan') ||
                         r.dataset_archive?.includes('3_Data_Koleksi_Pengguna_Mitra') ||
                         r.is_user_owned === false;
      if (isNotOwned) {
        throw new Error('Hanya observasi kebun mandiri milik pengguna yang dapat didonasikan. Koleksi rujukan impor atau data mitra (hutan) ditolak di batas domain kontribusi.');
      }

      // Source mode cannot treat simulated consent as a source licence
      if (currentMode === 'source' || currentMode === MODES.SOURCE) {
        if (!r.contributor_id || !r.rights_id) {
          throw new Error('Mode sumber ketat menolak donasi dengan kepemilikan atau hak izin yang belum terverifikasi (unknown).');
        }
      }
    }

    const points = ownedRecords.map(r => ({
      ...r,
      is_contributed: true,
      contribution_type: 'owned_plantation_donation',
      // Preserved source fields intact:
      contributor_id: r.contributor_id ?? null,
      rights_id: r.rights_id ?? null,
      quality_tier: r.quality_tier ?? null,
      observed_time: r.observed_time ?? null,
      method: r.method ?? 'unknown',
      // Scenario/current interpretation fields separate:
      simulated_owner: 'Pemilik A (Pengguna)',
      simulated_rights_status: 'Izin donasi terbuka konsorsium (Simulasi)',
      review_priority: REVIEW_PRIORITIES.NORMAL,
      scenario_overlay: {
        owner: 'Pemilik A (Pengguna)',
        contributorDisplayName: 'Pemilik A (Kontribusi Mandiri)',
        rightsStatus: 'Izin donasi terbuka konsorsium (Simulasi)',
        method: r.method || 'Survei Lapangan',
        qualityTier: 4,
        assumptions: [
          'Observasi kebun mandiri disumbangkan oleh Pemilik A untuk pelatihan konsorsium',
          'Status telaah awal: Tier 4 (Lengkap belum ditelaah)'
        ]
      }
    }));

    const packageMeta = {
      id: 'data_kontribusi_mandiri',
      title: 'Data Kontribusi Mandiri (Simulasi)',
      category: 'Koleksi Kontribusi Pengguna (Kasus 2)',
      description: 'Observasi kebun mandiri yang disumbangkan oleh pengguna untuk analisis lintas sektor.',
      isPrimary: false,
      isPrivate: false,
      isDonated: true,
      featureCount: points.length,
      createdAt: new Date().toISOString(),
      kind: 'point_observations'
    };

    this.donatedCollection = {
      meta: packageMeta,
      records: points
    };

    return this.donatedCollection;
  }

  /**
   * Initializes or updates an interactive on-screen sampling draft point.
   * Drafts have stable UUIDs and start with unknown time and uncertainty.
   * @param {[number, number]} coordinates [longitude, latitude]
   * @param {boolean} [isWithinAoi]
   * @param {Object} [boundaryGeoJson]
   * @returns {Object} Draft observation structure
   */
  createSamplingDraft(coordinates, isWithinAoi = true, boundaryGeoJson = null) {
    if (!Array.isArray(coordinates) || coordinates.length < 2) {
      throw new Error('Koordinat titik sampling harus berupa [lon, lat] yang valid.');
    }
    const [lon, lat] = coordinates;
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
      throw new Error(`Koordinat non-finit [${lon}, ${lat}] tidak dapat dijadikan titik draft.`);
    }

    const inAoi = boundaryGeoJson ? isPointInAoi([lon, lat], boundaryGeoJson) : Boolean(isWithinAoi);
    const draftId = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : '00000000-0000-4000-8000-000000000000';

    this.stagedDraft = {
      observation_id: draftId,
      geometry: {
        type: 'Point',
        coordinates: [lon, lat]
      },
      is_within_aoi: inAoi,
      dataset_archive: 'local_screen_sampling/simulated_points.zip',
      source_schema_id: 'schema_screen_sampling_v1',
      source_class_id: null,
      source_class_label: null,
      project_class_id: null,
      project_class_label: null,
      observed_time: null, // Unknown initially
      method: SAMPLING_ORIGINS.IMAGE_INTERPRETATION,
      imagery_ref: '',
      reason: '',
      uncertainty: null, // Unknown initially
      evidence_refs: [],
      is_incomplete: true, // Incomplete until required fields validated
      review_status: 'draft',
      quality_tier: null,
      review_priority: REVIEW_PRIORITIES.HIGH, // High review priority for new screen points
      interpretation_version: 1,
      contributor_id: 'pemilik_a'
    };

    return this.stagedDraft;
  }

  /**
   * Validates and submits a sampling draft observation.
   * Plain map drafts without imagery evidence remain incomplete.
   * Unsupported classes (e.g. 999) cannot become complete.
   * @param {Object} draftPayload
   * @param {Object} [boundaryGeoJson]
   * @returns {{ valid: boolean, record: Object|null, errors: Array<string> }}
   */
  submitSamplingDraft(draftPayload, aoiBoundary = null) {
    const errors = [];

    if (!draftPayload) {
      return { valid: false, record: null, errors: ['Payload draft tidak boleh kosong.'] };
    }

    // 1. Required Class Selection in target taxonomy
    const numClass = Number(draftPayload.project_class_id);
    if (!draftPayload.project_class_id || !PROJECT_CLASSES[numClass]) {
      errors.push('Kelas tutupan lahan wajib dipilih dari taksonomi yang didukung.');
    }

    // 2. Required Year
    const year = Number(draftPayload.observed_time?.year || draftPayload.year);
    if (!year || year < 2020 || year > 2030) {
      errors.push('Tahun observasi/citra wajib diisi antara 2020–2030.');
    }

    // 3. Required Imagery Reference
    const imgRef = (draftPayload.imagery_ref || '').trim();
    if (!imgRef) {
      errors.push('Rujukan citra satelit wajib diisi untuk interpretasi layar.');
    }

    // 4. Required Reason / Rationale
    const reason = (draftPayload.reason || '').trim();
    if (!reason) {
      errors.push('Alasan/justifikasi penentuan kelas wajib disertakan.');
    }

    // 5. Required Uncertainty (or explicit 'unknown' response)
    const uncert = draftPayload.uncertainty !== undefined && draftPayload.uncertainty !== null
      ? String(draftPayload.uncertainty).trim()
      : '';
    if (!uncert) {
      errors.push('Ketidakpastian posisi (atau respon eksplisit "unknown") wajib disertakan.');
    }

    // 6. Spatial boundary check
    const coords = draftPayload.geometry?.coordinates || this.stagedDraft?.geometry?.coordinates;
    const hasExplicitBoundary = Boolean(this.workspace && ('boundaryData' in this.workspace));
    const trustedBoundary = aoiBoundary || this.workspace?.boundaryData;

    if (hasExplicitBoundary && !this.workspace?.boundaryData && !aoiBoundary) {
      // Explicitly missing or null trusted AOI cannot be bypassed by a true payload flag
      errors.push('Batas AOI terpercaya tidak tersedia atau belum dimuat.');
    } else if (trustedBoundary && coords) {
      if (!isPointInAoi(coords, trustedBoundary)) {
        errors.push('Titik berada di luar batas wilayah Kabupaten Banyuasin.');
      }
    } else if (!coords) {
      errors.push('Koordinat titik tidak ditemukan.');
    } else if (draftPayload.is_within_aoi === false) {
      errors.push('Titik berada di luar batas wilayah Kabupaten Banyuasin.');
    }

    const isIncomplete = errors.length > 0;
    const classDef = PROJECT_CLASSES[numClass];
    const classLabel = classDef ? classDef.label : (draftPayload.project_class_label || 'Taksonomi');

    const stableId = draftPayload.observation_id || this.stagedDraft?.observation_id ||
      ((typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : '00000000-0000-4000-8000-000000000000');

    const submittedPoint = {
      ...this.stagedDraft,
      ...draftPayload,
      observation_id: stableId,
      project_class_id: classDef ? numClass : null,
      project_class_label: classDef ? classLabel : null,
      source_class_id: String(draftPayload.project_class_id || ''),
      source_class_label: classLabel,
      observed_time: year ? { year } : null,
      imagery_ref: imgRef,
      reason,
      uncertainty: uncert || null,
      evidence_refs: Array.isArray(draftPayload.evidence_refs) && draftPayload.evidence_refs.length > 0
        ? [...draftPayload.evidence_refs]
        : (imgRef ? [imgRef] : []),
      is_incomplete: isIncomplete,
      review_status: isIncomplete ? 'draft_incomplete' : 'submitted',
      quality_tier: isIncomplete ? null : 4, // Tier 4 if complete unreviewed, null if incomplete
      review_priority: REVIEW_PRIORITIES.HIGH,
      interpretation_version: 1,
      submitted_at: new Date().toISOString(),
      is_screen_sample: true,
      contributor_id: 'pemilik_a',
      owner: 'Pemilik A (Pengguna)',
      rights_id: 'simulated_open_donor_consent',
      scenario_overlay: {
        owner: 'Pemilik A (Pengguna)',
        contributorDisplayName: 'Pemilik A (Sampling Layar)',
        rightsStatus: 'Izin donasi terbuka konsorsium (Simulasi)',
        method: draftPayload.method || SAMPLING_ORIGINS.IMAGE_INTERPRETATION,
        qualityTier: isIncomplete ? null : 4,
        assumptions: [
          'Titik sampling layar baru dibuat oleh Pemilik A',
          `Rujukan citra: ${imgRef || 'Belum ada'}`,
          'Prioritas telaah: Tinggi (Observasi layar baru)'
        ]
      }
    };

    if (isIncomplete) {
      return {
        valid: false,
        record: submittedPoint,
        errors
      };
    }

    return {
      valid: true,
      record: submittedPoint,
      errors: []
    };
  }
}

