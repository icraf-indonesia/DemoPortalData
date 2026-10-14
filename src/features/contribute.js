/**
 * src/features/contribute.js
 * Implementation of Case 2: Contribution, Publication, and On-Screen Sampling.
 * 
 * Invariants:
 * - Separates owned initial plantation points (240: 122 rubber, 118 palm) from imported reference points (687).
 * - Distinguishes source unknown ownership from third-party data.
 * - Accepts explicit user declaration in source mode without rewriting original null rights/contributor/date.
 * - Operational Epistem crosswalk maps project classes independently to 21-leaf MASTER_TAXONOMY:
 *   - Karet (1) -> veg-tb-mono-rubber (code 1132)
 *   - Kelapa sawit (2) -> veg-tb-mono-oilpalm (code 1133)
 *   - Lainnya (borrowed reference) excluded from publication, no forced leaf.
 * - Form declarations: account name, owning institution, technical email, readonly Banyuasin, confirmed year 2026, GPS survey acquisition, responsibility checkbox.
 * - Summary includes counts, mappings, and declarations before final publication confirmation.
 * - On-screen map sampling creates draft point; requires class, year, imagery ref, reason, uncertainty.
 * - Idempotent publish and queue; cancellation does not publish.
 */

import {
  PROVISIONAL_HIERARCHY,
  PROJECT_CLASSES,
  EPISTEM_MASTER_TAXONOMY,
  getTaxonomyLeaves,
  findTaxonomyNode,
  DEFAULT_EPISTEM_CROSSWALK
} from '../domain/taxonomy.js';
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
    this.stagedPublicationDraft = null;
    this.publishedCollection = null; // Canonical snapshot 'data_kontribusi_mandiri'
    this.donatedCollection = null;   // Backward-compatibility alias
  }

  /**
   * Evaluates active or selected records to separate owned observations from imported third-party observations.
   * Separates 240 own plantation points (122 rubber, 118 palm) from 687 borrowed reference points.
   * Source unknown ownership on initial plantation is distinguished from third-party reference data.
   * @param {Array<Object>} records
   * @returns {{
   *   owned: Array<Object>,
   *   excludedImported: Array<{ record: Object, reason: string }>,
   *   summary: { total: number, ownedCount: number, excludedCount: number, rubberCount: number, palmCount: number }
   * }}
   */
  separateOwnedObservations(records = []) {
    const list = Array.isArray(records) ? records : [];
    const owned = [];
    const excludedImported = [];

    for (const r of list) {
      const canonId = resolveCanonicalDatasetId(r.dataset_archive);
      const archive = String(r.dataset_archive || '');
      const srcDatasetId = String(r.source_dataset_id || '');

      // Check if record is third-party borrowed reference data
      const isThirdParty =
        canonId === 'data_ref_mod_2b' ||
        canonId === 'data_ref_mod_f' ||
        canonId === 'data_hutan' ||
        canonId === 'data_sawah' ||
        srcDatasetId === 'data_ref_mod_2b' ||
        archive.includes('2_Data_Referensi') ||
        archive.includes('2b_Modular') ||
        archive.includes('Data_rujukan') ||
        archive.includes('3_Data_Koleksi_Pengguna_Mitra') ||
        r.contributor_id === 'pihak_ketiga' ||
        r.is_user_owned === false;

      // Check if record is user's own plantation observation (requires known plantation provenance)
      const isInitialPlantation =
        canonId === 'data_kebun_sawit_karet_f' ||
        archive.includes('Data_kebun_sawit_karet') ||
        archive.includes('1_Data_Pengguna') ||
        r.source_schema_id === 'schema_case1_plantation' ||
        r.source_schema_id === 'schema_pengguna_plantation_v1' ||
        r.contributor_id === 'pemilik_a' ||
        r.is_user_owned === true;

      if (!isThirdParty && isInitialPlantation) {
        owned.push(r);
      } else {
        excludedImported.push({
          record: r,
          reason: 'Koleksi rujukan pihak ketiga (data impor rujukan modular 2b) bukan milik pengguna dan dikecualikan dari kontribusi mandiri.'
        });
      }
    }

    let rubberCount = 0;
    let palmCount = 0;
    for (const r of owned) {
      if (r.project_class_id === 1 || String(r.source_class_label || '').toLowerCase().includes('karet')) {
        rubberCount += 1;
      } else if (r.project_class_id === 2 || String(r.source_class_label || '').toLowerCase().includes('sawit')) {
        palmCount += 1;
      }
    }

    return {
      owned,
      excludedImported,
      summary: {
        total: list.length,
        ownedCount: owned.length,
        excludedCount: excludedImported.length,
        rubberCount,
        palmCount
      }
    };
  }

  /**
   * Initializes or updates persistent publication draft.
   * @param {Object} partialDraft
   * @returns {Object} Staged publication draft
   */
  setPublicationDraft(partialDraft = {}) {
    this.stagedPublicationDraft = {
      selectedCollectionIds: partialDraft.selectedCollectionIds || ['data_kebun_sawit_karet_f'],
      accountName: partialDraft.accountName ?? '',
      owningInstitution: partialDraft.owningInstitution || 'Dinas Perkebunan Kabupaten Banyuasin',
      technicalEmail: partialDraft.technicalEmail ?? '',
      confirmedYear: Number(partialDraft.confirmedYear) || 2026,
      acquisitionMethod: partialDraft.acquisitionMethod || 'Survei GPS Lapangan',
      boundaryAoi: 'Kabupaten Banyuasin',
      responsibilityAccepted: Boolean(partialDraft.responsibilityAccepted),
      includeLumaMetadata: partialDraft.includeLumaMetadata !== undefined ? Boolean(partialDraft.includeLumaMetadata) : true,
      crosswalk: {
        1: partialDraft.crosswalk?.[1] || { ...DEFAULT_EPISTEM_CROSSWALK[1] },
        2: partialDraft.crosswalk?.[2] || { ...DEFAULT_EPISTEM_CROSSWALK[2] }
      },
      updatedAt: new Date().toISOString()
    };
    return this.stagedPublicationDraft;
  }

  /**
   * Creates an approved publication snapshot package from owned observations.
   * Rejects third-party reference data at domain boundary.
   * Preserves raw source attributes (nulls intact) while attaching explicit publication declaration.
   * @param {Array<Object>} ownedRecords 240 owned plantation points
   * @param {Object} [declarations] Metadata declarations
   * @param {Object} [crosswalk] Epistem crosswalk mappings
   * @returns {Object} Canonical published package
   */
  createPublishedPackage(ownedRecords, declarations = {}, crosswalk = DEFAULT_EPISTEM_CROSSWALK) {
    if (!Array.isArray(ownedRecords) || ownedRecords.length === 0) {
      throw new Error('Tidak ada observasi milik mandiri yang dipilih untuk dibagikan.');
    }

    // Boundary check: strictly reject third-party and unknown ownership records
    for (const r of ownedRecords) {
      const canonId = resolveCanonicalDatasetId(r.dataset_archive);
      const archive = String(r.dataset_archive || '');
      const srcDatasetId = String(r.source_dataset_id || '');
      const isThirdParty =
        canonId === 'data_ref_mod_2b' ||
        canonId === 'data_ref_mod_f' ||
        canonId === 'data_hutan' ||
        canonId === 'data_sawah' ||
        srcDatasetId === 'data_ref_mod_2b' ||
        archive.includes('2_Data_Referensi') ||
        archive.includes('2b_Modular') ||
        archive.includes('Data_rujukan') ||
        archive.includes('3_Data_Koleksi_Pengguna_Mitra') ||
        r.contributor_id === 'pihak_ketiga' ||
        r.is_user_owned === false;

      const isKnownOwned =
        canonId === 'data_kebun_sawit_karet_f' ||
        archive.includes('Data_kebun_sawit_karet') ||
        archive.includes('1_Data_Pengguna') ||
        r.source_schema_id === 'schema_case1_plantation' ||
        r.source_schema_id === 'schema_pengguna_plantation_v1' ||
        r.contributor_id === 'pemilik_a' ||
        r.is_user_owned === true;

      if (isThirdParty || !isKnownOwned) {
        throw new Error('Hanya observasi kebun mandiri milik pengguna yang dapat dibagikan. Data rujukan pihak ketiga ditolak di batas domain publikasi.');
      }
    }

    // Strict validation of user declarations
    const accountName = String(declarations.accountName || '').trim();
    if (!accountName) {
      throw new Error('Nama akun atau peneliti wajib diisi.');
    }

    const institution = String(declarations.owningInstitution || '').trim();
    if (!institution) {
      throw new Error('Lembaga pemilik data wajib diisi.');
    }

    const technicalEmail = String(declarations.technicalEmail || '').trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!technicalEmail || !emailRegex.test(technicalEmail)) {
      throw new Error('Email teknis wajib valid.');
    }

    if (declarations.responsibilityAccepted !== true) {
      throw new Error('Pernyataan tanggung jawab atas keabsahan data wajib disetujui.');
    }

    const confirmedYear = Number(declarations.confirmedYear);
    if (confirmedYear !== 2026) {
      throw new Error('Tahun observasi dan proyek wajib dikonfirmasi sebagai 2026.');
    }

    const acquisitionMethod = String(declarations.acquisitionMethod || '').trim();
    if (!acquisitionMethod) {
      throw new Error('Metode akuisisi data wajib dicantumkan.');
    }

    // Resolve operational crosswalk against taxonomy leaf nodes dynamically
    const resolvedCrosswalk = {};
    for (const [classKey, cwDef] of Object.entries(crosswalk)) {
      const classId = Number(classKey);
      const leafId = cwDef?.epistemLeafId || (classId === 1 ? 'veg-tb-mono-rubber' : 'veg-tb-mono-oilpalm');
      const leafNode = findTaxonomyNode(leafId, EPISTEM_MASTER_TAXONOMY);
      if (!leafNode || (leafNode.children && leafNode.children.length > 0)) {
        throw new Error(`Kelas daun taksonomi untuk kelas target ${classId} tidak valid.`);
      }
      resolvedCrosswalk[classId] = {
        projectClassId: classId,
        projectClassLabel: classId === 1 ? 'Karet' : 'Kelapa sawit',
        epistemLeafId: leafNode.id,
        code: leafNode.code,
        name: leafNode.name,
        path: leafNode.path || leafNode.name,
        colour: classId === 1 ? '#7B1FA2' : '#E91E63'
      };
    }

    // Versioning management: identical republish preserves version & createdAt
    let version = '1.0.0';
    let createdAt = new Date().toISOString();
    let updatedAt = createdAt;

    const prevPkg = this.publishedCollection;
    if (prevPkg && prevPkg.meta) {
      const isIdentical =
        prevPkg.records.length === ownedRecords.length &&
        prevPkg.records.every((rec, idx) => rec.observation_id === ownedRecords[idx].observation_id) &&
        JSON.stringify(prevPkg.meta.crosswalk) === JSON.stringify(resolvedCrosswalk) &&
        prevPkg.meta.institution === institution &&
        prevPkg.meta.accountName === accountName &&
        prevPkg.meta.year === confirmedYear &&
        prevPkg.meta.technicalEmail === technicalEmail &&
        prevPkg.meta.acquisitionMethod === acquisitionMethod;

      if (isIdentical) {
        version = prevPkg.meta.version || '1.0.0';
        createdAt = prevPkg.meta.createdAt || createdAt;
        updatedAt = prevPkg.meta.updatedAt || createdAt;
      } else {
        const parts = (prevPkg.meta.version || '1.0.0').split('.').map(Number);
        version = `${parts[0] || 1}.${parts[1] || 0}.${(parts[2] || 0) + 1}`;
        createdAt = prevPkg.meta.createdAt || createdAt;
        updatedAt = new Date().toISOString();
      }
    }

    const includeLuma = Boolean(declarations.includeLumaMetadata);
    const lumaModeling = (includeLuma && declarations.lumaContext)
      ? {
          activeModule: declarations.lumaContext.activeModule,
          status: declarations.lumaContext.activeModule === 7 ? 'Tervalidasi Akurasi Tematik (Modul 7)' : 'Draf Pra-Klasifikasi (Modul 6)',
          module4Separability: declarations.lumaContext.module4Separability || null,
          module6Classification: declarations.lumaContext.module6Classification || null,
          module7Validation: declarations.lumaContext.module7Validation || null
        }
      : null;

    const points = ownedRecords.map(r => {
      const pClassId = Number(r.project_class_id) || 1;
      const cw = resolvedCrosswalk[pClassId] || null;

      const rawProps = {
        rights_id: r.rights_id ?? null,
        contributor_id: r.contributor_id ?? null,
        observed_date: r.observed_date ?? r.observed_time ?? null,
        dataset_id: r.source_dataset_id || r.dataset_id || r.dataset_archive || null,
        ...(r.raw_properties || {}),
        ...(r.raw_attributes || {})
      };

      return {
        ...r,
        coordinates: r.coordinates || (r.geometry ? r.geometry.coordinates : null),
        project_class: r.project_class !== undefined ? r.project_class : r.project_class_id,
        raw_properties: rawProps,
        is_contributed: true,
        is_published: true,
        contribution_type: 'owned_plantation_publication',
        // Preserve raw original source attributes without forging or overwriting nulls
        contributor_id: r.contributor_id ?? null,
        rights_id: r.rights_id ?? null,
        quality_tier: r.quality_tier ?? null,
        observed_time: r.observed_time ?? null,
        method: r.method ?? 'unknown',
        // Declared metadata stored separate in publication metadata
        publication_metadata: {
          collection_id: 'data_kontribusi_mandiri',
          declared_institution: institution,
          declared_account_name: accountName,
          declared_email: technicalEmail,
          declared_year: confirmedYear,
          declared_method: acquisitionMethod,
          declared_rights: 'Izin Publikasi Data Terbuka Mandiri (User Declared)',
          crosswalk_leaf_id: cw ? cw.epistemLeafId : null,
          crosswalk_leaf_code: cw ? cw.code : null,
          crosswalk_leaf_name: cw ? cw.name : null,
          crosswalk_leaf_path: cw ? cw.path : null,
          luma_module: declarations.lumaContext ? declarations.lumaContext.activeModule : null,
          version,
          published_at: createdAt
        },
        simulated_owner: `${accountName} (${institution})`,
        simulated_rights_status: 'Izin Publikasi Data Terbuka Mandiri',
        review_priority: REVIEW_PRIORITIES.NORMAL,
        review_status: 'unreviewed',
        scenario_overlay: {
          owner: 'Pemilik A (Pengguna)',
          contributorDisplayName: `${accountName} (Kontribusi Mandiri)`,
          rightsStatus: 'Izin donasi terbuka konsorsium (Simulasi)',
          method: acquisitionMethod,
          qualityTier: 4,
          assumptions: [
            'Observasi kebun mandiri disumbangkan oleh Pemilik A untuk pelatihan konsorsium',
            'Status telaah awal: Tier 4 (Mandiri / Belum Ditelaah)'
          ]
        }
      };
    });

    const packageMeta = {
      id: 'data_kontribusi_mandiri',
      title: 'Data Kontribusi Mandiri (Perkebunan Banyuasin)',
      category: 'Koleksi Mitra',
      status: 'Mandiri / Belum Ditelaah',
      publicationStatus: 'published_unreviewed',
      version,
      description: `Observasi kebun mandiri kelapa sawit dan karet di Kabupaten Banyuasin yang disumbangkan oleh ${accountName} (${institution}) untuk analisis terbuka konsorsium.`,
      isPrimary: false,
      isPrivate: false,
      isPublished: true,
      isDonated: true,
      featureCount: points.length,
      institution,
      accountName,
      technicalEmail,
      year: confirmedYear,
      acquisitionMethod,
      boundary: 'Kabupaten Banyuasin',
      crosswalk: { ...resolvedCrosswalk },
      luma_modeling: lumaModeling,
      publication_metadata: {
        collection_id: 'data_kontribusi_mandiri',
        declared_institution: institution,
        declared_account_name: accountName,
        declared_email: technicalEmail,
        declared_year: confirmedYear,
        declared_method: acquisitionMethod,
        declared_rights: 'Izin Publikasi Data Terbuka Mandiri (User Declared)',
        crosswalk: { ...resolvedCrosswalk },
        luma_modeling: lumaModeling,
        version,
        published_at: createdAt
      },
      createdAt,
      updatedAt,
      kind: 'point_observations',
      lineage: {
        sourceDatasets: [...new Set(ownedRecords.map(r => r.dataset_archive || 'data_kebun_sawit_karet_f'))],
        ownedPointsPublished: points.length,
        originalObservationIds: points.map(p => p.observation_id),
        publishedVersion: version
      }
    };

    this.publishedCollection = {
      meta: packageMeta,
      records: points,
      originalObservationIds: points.map(p => p.observation_id),
      declarations: {
        accountName,
        owningInstitution: institution,
        technicalEmail,
        confirmedYear,
        acquisitionMethod,
        boundaryAoi: 'Kabupaten Banyuasin',
        responsibilityAccepted: true,
        includeLumaMetadata: includeLuma,
        luma_modeling: lumaModeling
      },
      crosswalk: { ...resolvedCrosswalk }
    };

    this.case2DonatedCollection = this.publishedCollection;
    this.donatedCollection = this.publishedCollection;

    return this.publishedCollection;
  }

  /**
   * Backward-compatible donation wrapper.
   * Does not bypass declarations.
   * @param {Array<Object>} ownedRecords
   * @param {Object} [declarations]
   * @param {Object} [crosswalk]
   * @returns {Object}
   */
  createDonatedPackage(ownedRecords, declarations = {}, crosswalk = DEFAULT_EPISTEM_CROSSWALK) {
    return this.createPublishedPackage(ownedRecords, declarations, crosswalk);
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
      observed_time: null,
      method: SAMPLING_ORIGINS.IMAGE_INTERPRETATION,
      imagery_ref: '',
      reason: '',
      uncertainty: null,
      evidence_refs: [],
      is_incomplete: true,
      review_status: 'draft',
      quality_tier: null,
      review_priority: REVIEW_PRIORITIES.HIGH,
      interpretation_version: 1,
      contributor_id: 'pemilik_a'
    };

    return this.stagedDraft;
  }

  /**
   * Validates and submits a sampling draft observation.
   * @param {Object} draftPayload
   * @param {Object} [aoiBoundary]
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

    // 5. Required Uncertainty
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
      quality_tier: isIncomplete ? null : 4,
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
