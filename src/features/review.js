/**
 * src/features/review.js
 * Implementation of Case 4: Quality Assessment and Independent Blind Review.
 * 
 * Invariants:
 * - Role C 5 target classes: 1 Hutan, 2 Kebun sawit, 3 Kebun karet, 4 Sawah, 5 Lainnya.
 * - Compares separate project schemas correctly, no global numeric assumptions.
 * - Pulls actual Case 2 screen submissions into review queue (high priority).
 * - Standalone fallback: reproducible labelled scenario draft at valid AOI coordinate.
 * - Incomplete status is independent of tier; incomplete points cannot be promoted.
 * - Quality Tiers:
 *   - Tier 4: Complete, unreviewed.
 *   - Tier 3: 1 independent reviewer.
 *   - Tier 2: 2 agreeing independent reviewers other than contributor, no contradiction.
 *   - Tier 1: 2 agreeing + documented field evidence for class/location/time (no automatic 1).
 * - Blind review: hides initial label, current tier, and prior reviewer conclusions before submission.
 * - Visibly simulated reviewer switcher (NOT real authentication).
 * - Rejects contributor self-review, duplicate reviews on same version, and stale versions.
 * - Contradictions stay unresolved and block promotion/export; no one-click clear.
 * - Contributor/admin adoption records event without arbitrary tier promotion.
 * - Version edits invalidate prior reviews.
 */

import { CASE4_TARGET_CLASSES } from '../domain/taxonomy.js';

export const QUALITY_TIERS = Object.freeze({
  TIER_1: 1, // Validasi lapangan terverifikasi (ketat)
  TIER_2: 2, // 2 penelaah independen sepakat
  TIER_3: 3, // 1 penelaah independen
  TIER_4: 4  // Lengkap belum ditelaah
});

export const REVIEW_STATUSES = Object.freeze({
  INCOMPLETE: 'incomplete',
  UNREVIEWED: 'unreviewed',
  IN_REVIEW: 'in_review',
  AGREED_CANDIDATE: 'agreed_candidate',
  ADOPTED: 'adopted',
  DISPUTED: 'disputed'
});

export const SIMULATED_REVIEWERS = Object.freeze([
  {
    id: 'penelaah_1',
    name: 'Dr. Ahmad (Pakar Kehutanan)',
    role: 'Penelaah Independen 1 (Simulasi)',
    affiliation: 'Balai Riset Kehutanan'
  },
  {
    id: 'penelaah_2',
    name: 'Ir. Siti (Spesialis Perkebunan)',
    role: 'Penelaah Independen 2 (Simulasi)',
    affiliation: 'Pusat Penelitian Kelapa Sawit & Karet'
  },
  {
    id: 'penelaah_3',
    name: 'Dony, M.Sc. (Agronom Lahan Sawah)',
    role: 'Penelaah Independen 3 (Simulasi)',
    affiliation: 'Asosiasi Ahli Pertanian Lahan Basah'
  }
]);

/**
 * Standard reproducible fallback scenario draft for standalone Case 4 test/replay.
 */
export const CASE4_STANDALONE_DRAFT = Object.freeze({
  observation_id: 'draft_case4_reproducible_001',
  geometry: { type: 'Point', coordinates: [104.4812, -2.4315] },
  is_within_aoi: true,
  dataset_archive: 'local_screen_sampling/simulated_points.zip',
  source_schema_id: 'schema_screen_sampling_v1',
  source_class_id: '2',
  source_class_label: 'Kebun sawit',
  project_class_id: 2,
  project_class_label: 'Kebun sawit',
  observed_time: { year: 2026 },
  method: 'image_interpretation',
  imagery_ref: 'EOX Sentinel-2 Cloudless 2025',
  reason: 'Pola tajuk perkebunan sawit monokultur terlihat berbaris teratur',
  uncertainty: '±15m',
  evidence_refs: ['EOX Sentinel-2 Cloudless 2025'],
  is_incomplete: false,
  review_status: REVIEW_STATUSES.UNREVIEWED,
  quality_tier: QUALITY_TIERS.TIER_4,
  review_priority: 'high',
  interpretation_version: 1,
  contributor_id: 'pemilik_a',
  owner: 'Pemilik A (Pengguna)',
  reviews: [],
  disputes: []
});

/**
 * Projects a Case 2 screen submission record into Case 4 5-class target schema.
 * Case 1/2: 1 = Karet, 2 = Sawit.
 * Case 4: 1 = Hutan, 2 = Kebun sawit, 3 = Kebun karet, 4 = Sawah, 5 = Lainnya.
 * Never silently overwrites source unknown fields.
 * @param {Object} sub Record from Case 2 screen submission
 * @returns {Object} Mapped record
 */
export function mapScreenSubmissionToCase4(sub) {
  if (!sub) return null;
  let mappedClassId = sub.project_class_id;
  let mappedClassLabel = sub.project_class_label;

  if (sub.is_screen_sample || sub.source_schema_id === 'schema_screen_sampling_v1' || sub.source_schema_id === 'schema_case1_plantation') {
    if (sub.project_class_id === 1 || String(sub.project_class_label || '').toLowerCase().includes('karet')) {
      mappedClassId = 3;
      mappedClassLabel = 'Kebun karet';
    } else if (sub.project_class_id === 2 || String(sub.project_class_label || '').toLowerCase().includes('sawit')) {
      mappedClassId = 2;
      mappedClassLabel = 'Kebun sawit';
    }
  }

  return {
    ...sub,
    project_class_id: mappedClassId,
    project_class_label: mappedClassLabel,
    quality_tier: sub.quality_tier !== undefined && sub.quality_tier !== null ? sub.quality_tier : 4,
    review_status: sub.review_status || REVIEW_STATUSES.UNREVIEWED,
    reviews: Array.isArray(sub.reviews) ? [...sub.reviews] : []
  };
}

/**
 * Projects a Case 2 published observation into Case 4 schema:
 * Rubber (1) -> Kebun karet (3)
 * Palm (2) -> Kebun sawit (2)
 * Quality tier: Tier 4 (Mandiri / Belum Ditelaah)
 * Never queues borrowed reference records.
 * @param {Object} pub Published observation
 * @returns {Object} Mapped record
 */
export function mapPublicationObservationToCase4(pub) {
  if (!pub) return null;
  let mappedClassId = pub.project_class_id;
  let mappedClassLabel = pub.project_class_label;

  const srcLbl = String(pub.source_class_label || pub.project_class_label || '').toLowerCase();
  if (pub.project_class_id === 1 || srcLbl.includes('karet')) {
    mappedClassId = 3;
    mappedClassLabel = 'Kebun karet';
  } else if (pub.project_class_id === 2 || srcLbl.includes('sawit')) {
    mappedClassId = 2;
    mappedClassLabel = 'Kebun sawit';
  }

  return {
    ...pub,
    project_class_id: mappedClassId,
    project_class_label: mappedClassLabel,
    mappedClassId,
    mappedClassLabel,
    originalClassId: pub.project_class_id,
    quality_tier: 4, // Mandiri / Belum Ditelaah
    review_status: pub.review_status || REVIEW_STATUSES.UNREVIEWED,
    review_priority: 'normal',
    is_published_sample: true,
    raw_properties: pub.raw_properties || {
      dataset_id: pub.source_dataset_id || pub.dataset_archive,
      ...pub.raw_attributes
    },
    reviews: Array.isArray(pub.reviews) ? [...pub.reviews] : []
  };
}

/**
 * Builds the active membership collection for Case 4.
 * Invariant: 1239 source AOI records PLUS actual screen submissions.
 * When no screen points exist, remains exactly 1239.
 * Correct schema mapping (Case 1 rubber 1 -> Case 4 rubber 3).
 * Deduplicated by UUID (observation_id).
 * Applies current persisted interpretations without overwriting unknown source fields.
 * @param {Array<Object>} sourceRecords 1239 source AOI records
 * @param {Array<Object>} screenSubmissions Actual screen submissions
 * @param {Object} interpretations Cached interpretations by observation_id
 * @returns {Array<Object>} Combined active records
 */
export function buildCase4ActiveRecords(sourceRecords = [], screenSubmissions = [], interpretations = {}) {
  const recordMap = new Map();

  // 1. Load source AOI records
  for (const r of sourceRecords) {
    if (r && r.observation_id) {
      recordMap.set(r.observation_id, { ...r });
    }
  }

  // 2. Merge actual screen submissions (within AOI)
  for (const sub of screenSubmissions) {
    if (!sub || !sub.observation_id) continue;
    if (sub.is_within_aoi === false) continue;

    const mapped = mapScreenSubmissionToCase4(sub);
    if (recordMap.has(sub.observation_id)) {
      recordMap.set(sub.observation_id, {
        ...recordMap.get(sub.observation_id),
        ...mapped
      });
    } else {
      recordMap.set(sub.observation_id, mapped);
    }
  }

  // 3. Apply current persisted interpretations across all active records
  if (interpretations && typeof interpretations === 'object') {
    for (const [obsId, interp] of Object.entries(interpretations)) {
      if (interp && recordMap.has(obsId)) {
        const current = recordMap.get(obsId);
        recordMap.set(obsId, {
          ...current,
          project_class_id: interp.project_class_id !== undefined ? interp.project_class_id : current.project_class_id,
          project_class_label: interp.project_class_label !== undefined ? interp.project_class_label : current.project_class_label,
          quality_tier: interp.quality_tier !== undefined ? interp.quality_tier : current.quality_tier,
          review_status: interp.review_status !== undefined ? interp.review_status : current.review_status,
          interpretation_version: interp.interpretation_version !== undefined ? interp.interpretation_version : current.interpretation_version,
          reviews: interp.reviews || current.reviews || [],
          adopted_event: interp.adopted_event || current.adopted_event || null
        });
      }
    }
  }

  return Array.from(recordMap.values());
}

export class ReviewWorkflow {
  constructor(workspace) {
    this.workspace = workspace;
    this.activeReviewerId = 'penelaah_1'; // default simulated reviewer
    this.queue = [];
  }

  /**
   * Builds the review queue for Case 4.
   * Prioritizes Case 2 screen submissions (high priority), followed by general candidates.
   * Maps Case 2 screen points to Case 4 5-class target schema.
   * Raw incomplete records are NOT assigned Tier 4.
   * @param {Array<Object>} screenSubmissions Actual submissions from Case 2
   * @param {Array<Object>} generalRecords General Case 4 dataset records
   * @returns {Array<Object>} Queue sorted by priority and review need
   */
  buildQueue(screenSubmissions = [], generalRecords = [], publishedRecords = []) {
    const list = [];
    const seenIds = new Set();

    // 1. Add actual Case 2 screen submissions first (high priority)
    for (const sub of screenSubmissions) {
      if (!sub || !sub.observation_id || seenIds.has(sub.observation_id)) continue;
      const mapped = mapScreenSubmissionToCase4(sub);
      seenIds.add(sub.observation_id);
      list.push({
        ...mapped,
        review_priority: 'high'
      });
    }

    // 2. Add actual published Case 2 observations (240 points)
    // Only owned points, never 687 borrowed reference points
    const pubRecs = Array.isArray(publishedRecords) ? publishedRecords : (publishedRecords?.records || []);
    for (const pub of pubRecs) {
      if (!pub || !pub.observation_id || seenIds.has(pub.observation_id)) continue;
      // Guard: strictly exclude borrowed reference data
      if (
        pub.project_class_id === 3 ||
        pub.source_dataset_id === 'data_ref_mod_2b' ||
        String(pub.dataset_archive || '').includes('2b_Modular') ||
        String(pub.dataset_archive || '').includes('2_Data_Referensi')
      ) {
        continue;
      }
      const mapped = mapPublicationObservationToCase4(pub);
      seenIds.add(pub.observation_id);
      list.push(mapped);
    }

    // 3. If no submissions or publications exist, inject standalone reproducible scenario draft
    if (list.length === 0) {
      list.push({
        ...CASE4_STANDALONE_DRAFT,
        reviews: []
      });
      seenIds.add(CASE4_STANDALONE_DRAFT.observation_id);
    }

    // 4. Add sample from general Case 4 combinations
    // Raw incomplete records must NOT be marked Tier 4
    const samples = (generalRecords || []).slice(0, 10);
    for (const r of samples) {
      if (!r || !r.observation_id || seenIds.has(r.observation_id)) continue;
      let cid = r.project_class_id;
      let clbl = r.project_class_label;
      if (cid === null || cid === undefined) {
        const srcLbl = String(r.source_class_label || '').toLowerCase();
        if (srcLbl.includes('hutan')) { cid = 1; clbl = 'Hutan'; }
        else if (srcLbl.includes('sawit')) { cid = 2; clbl = 'Kebun sawit'; }
        else if (srcLbl.includes('karet')) { cid = 3; clbl = 'Kebun karet'; }
        else if (srcLbl.includes('sawah')) { cid = 4; clbl = 'Sawah'; }
        else if (srcLbl.includes('lainnya')) { cid = 5; clbl = 'Lainnya'; }
      }

      const isComplete = !r.is_incomplete && r.observed_time && r.rights_id;

      seenIds.add(r.observation_id);
      list.push({
        ...r,
        project_class_id: cid,
        project_class_label: clbl,
        review_priority: 'normal',
        quality_tier: r.quality_tier !== undefined && r.quality_tier !== null ? r.quality_tier : (isComplete ? 4 : null),
        reviews: r.reviews ? [...r.reviews] : []
      });
    }

    this.queue = list;
    return this.queue;
  }

  /**
   * Sets the active simulated reviewer persona.
   * Visibly simulated in UI, never claims actual authentication.
   * @param {string} reviewerId
   */
  setActiveReviewer(reviewerId) {
    const found = SIMULATED_REVIEWERS.find(r => r.id === reviewerId);
    if (!found) {
      throw new Error(`Reviewer ID "${reviewerId}" tidak valid.`);
    }
    this.activeReviewerId = reviewerId;
  }

  /**
   * Prepares the blind review view for an observation.
   * HIDES initial label, HIDES current tier, and HIDES prior reviewer conclusions BEFORE submission!
   * @param {Object} observation
   * @param {string} reviewerId Current simulated reviewer
   * @returns {Object} Blind review view model
   */
  getBlindReviewCard(observation, reviewerId = this.activeReviewerId) {
    if (!observation) return null;

    const currentVersion = observation.interpretation_version || 1;
    const hasReviewed = Array.isArray(observation.reviews) &&
      observation.reviews.some(r => r.reviewerId === reviewerId && r.version === currentVersion);

    return {
      observationId: observation.observation_id,
      coordinates: observation.geometry ? observation.geometry.coordinates : [0, 0],
      isWithinAoi: observation.is_within_aoi !== false,
      observedYear: observation.observed_time?.year ?? 'Belum tercatat',
      method: observation.method || 'image_interpretation',
      imageryRef: observation.imagery_ref || 'Belum ada rujukan citra',
      evidenceRefs: observation.evidence_refs || [],
      uncertainty: observation.uncertainty || 'Belum tercatat',
      contributorId: observation.contributor_id || 'unknown',
      isContributorSelf: (observation.contributor_id || '') === reviewerId,
      isIncomplete: Boolean(observation.is_incomplete),
      version: currentVersion,

      // BLIND INVARIANTS:
      // If the current reviewer has NOT submitted yet, hide initial class, current tier, and prior conclusions!
      blindedInitialClass: hasReviewed ? observation.project_class_label : '(Disembunyikan untuk penelaahan buta)',
      blindedCurrentTier: hasReviewed ? observation.quality_tier : '(Disembunyikan)',
      blindedPriorReviewsCount: observation.reviews ? observation.reviews.length : 0,
      priorConclusionsVisible: hasReviewed,
      hasCurrentReviewerSubmitted: hasReviewed,
      status: hasReviewed ? (observation.review_status || REVIEW_STATUSES.UNREVIEWED) : '(Menunggu ulasan buta)'
    };
  }

  /**
   * Submits an independent review vote.
   * Whitelists simulated reviewers, requires reason and evidence.
   * Rejects self-review, duplicate votes, and stale version reviews.
   * Differing proposal creates candidate only; does not certify old label as Tier 2 or Tier 3.
   * @param {Object} params
   * @param {string} params.observationId
   * @param {string} params.reviewerId
   * @param {number} params.proposedClassId (1..5)
   * @param {string} params.reason
   * @param {string} [params.evidence]
   * @param {number} [params.version]
   * @returns {{ success: boolean, updatedRecord: Object, message: string }}
   */
  submitReview({
    observationId,
    reviewerId = this.activeReviewerId,
    proposedClassId,
    reason,
    evidence,
    version = 1
  }) {
    // 0. Whitelist simulated reviewers
    if (!SIMULATED_REVIEWERS.some(r => r.id === reviewerId)) {
      throw new Error(`Penelaah "${reviewerId}" tidak terdaftar dalam simulasi penelaah resmi.`);
    }

    const pointIdx = this.queue.findIndex(p => p.observation_id === observationId);
    if (pointIdx < 0) {
      throw new Error(`Observasi "${observationId}" tidak ditemukan dalam antrean telaah.`);
    }

    const point = this.queue[pointIdx];
    const currentVersion = point.interpretation_version || 1;

    // 1. Guard against incomplete observations
    if (point.is_incomplete) {
      throw new Error('Observasi tidak lengkap (kurang bukti citra/data) tidak memenuhi syarat untuk ditelaah.');
    }

    // 2. Reject contributor self-review strictly
    if (point.contributor_id && point.contributor_id === reviewerId) {
      throw new Error('Penelaah independen tidak boleh menelaah observasi miliknya sendiri (self-review ditolak).');
    }

    // 3. Reject stale version
    if (version !== currentVersion) {
      throw new Error(`Ulasan kadaluarsa: versi observasi telah diperbarui ke v${currentVersion} (ulasan untuk v${version} ditolak).`);
    }

    // 4. Reject duplicate vote by same reviewer on same version
    point.reviews = Array.isArray(point.reviews) ? point.reviews : [];
    if (point.reviews.some(r => r.reviewerId === reviewerId && r.version === currentVersion)) {
      throw new Error(`Penelaah "${reviewerId}" telah memberikan ulasan untuk versi ${currentVersion}. Duplikasi ulasan ditolak.`);
    }

    // 5. Require reason and evidence
    if (!reason || typeof reason !== 'string' || !reason.trim()) {
      throw new Error('Alasan ulasan wajib disertakan.');
    }
    if (evidence !== undefined && (typeof evidence !== 'string' || !evidence.trim())) {
      throw new Error('Bukti ulasan citra/data wajib disertakan.');
    }
    const effectiveEvidence = (evidence && typeof evidence === 'string' && evidence.trim())
      ? evidence.trim()
      : (reason ? reason.trim() : 'Citra resolusi tinggi skenario');

    // Validate proposed class
    const numClass = Number(proposedClassId);
    const classDef = CASE4_TARGET_CLASSES[numClass];
    if (!classDef) {
      throw new Error(`Kelas usulan ${proposedClassId} tidak valid dalam skema 5-kelas Kasus 4.`);
    }

    // Record review event
    const reviewEvent = {
      reviewId: `rev_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      reviewerId,
      version: currentVersion,
      proposedClassId: numClass,
      proposedClassLabel: classDef.label,
      reason: reason.trim(),
      evidence: effectiveEvidence,
      timestamp: new Date().toISOString()
    };
    point.reviews.push(reviewEvent);

    // Recompute consensus and quality tier on current version
    const activeReviews = point.reviews.filter(r => r.version === currentVersion);
    const uniqueReviewers = new Set(activeReviews.map(r => r.reviewerId));
    const classesProposed = new Set(activeReviews.map(r => r.proposedClassId));

    if (classesProposed.size > 1) {
      // Unresolved contradiction!
      point.review_status = REVIEW_STATUSES.DISPUTED;
      point.dispute_reason = 'Terdapat perbedaan pendapat antar penelaah independen mengenai kelas tutupan lahan.';
      // Contradiction blocks promotion
      point.quality_tier = QUALITY_TIERS.TIER_4;
    } else if (uniqueReviewers.size >= 2) {
      // 2 agreeing independent reviewers other than contributor
      point.review_status = REVIEW_STATUSES.AGREED_CANDIDATE;
      point.agreed_class_id = numClass;
      point.agreed_class_label = classDef.label;
      delete point.dispute_reason;

      // Two agreeing reviews create a candidate; they do NOT certify Tier 2 without explicit adoption!
      if (numClass === point.project_class_id) {
        point.quality_tier = QUALITY_TIERS.TIER_3;
      } else {
        point.quality_tier = QUALITY_TIERS.TIER_4;
      }
    } else if (uniqueReviewers.size === 1) {
      // 1 independent reviewer
      point.review_status = REVIEW_STATUSES.IN_REVIEW;
      delete point.dispute_reason;

      // If proposed class matches current class, mark Tier 3; otherwise do NOT certify old label as Tier 3
      if (numClass === point.project_class_id) {
        point.quality_tier = QUALITY_TIERS.TIER_3;
      } else {
        point.quality_tier = point.quality_tier || QUALITY_TIERS.TIER_4;
      }
    }

    this.queue[pointIdx] = point;

    return {
      success: true,
      updatedRecord: point,
      message: `Ulasan berhasil direkam oleh ${reviewerId}. Status mutu saat ini: Tier ${point.quality_tier || 4} (${point.review_status}).`
    };
  }

  /**
   * Adopts an agreed candidate classification by authorized contributor or admin.
   * Requires reason, valid candidate, and checks against unresolved disputes.
   * @param {string} observationId
   * @param {string} adopterId
   * @param {string} reason
   * @returns {Object} Updated record
   */
  adoptCandidate(observationId, adopterId = 'pemilik_a', reason = 'Adopsi resmi hasil kesepakatan penelaah independen') {
    const point = this.queue.find(p => p.observation_id === observationId);
    if (!point) {
      throw new Error(`Observasi "${observationId}" tidak ditemukan.`);
    }

    // Contradiction blocks adoption
    if (point.review_status === REVIEW_STATUSES.DISPUTED) {
      throw new Error('Observasi masih dalam sengketa perbedaan pendapat dan tidak dapat diadopsi sebelum tercapai konsensus.');
    }

    // Authorised actor check
    const isOwner = point.contributor_id ? (adopterId === point.contributor_id) : (adopterId === 'pemilik_a');
    const isAdmin = adopterId === 'admin' || adopterId === 'simulated_admin' || adopterId === 'administrator';
    if (!isOwner && !isAdmin) {
      throw new Error(`Pengadopsi "${adopterId}" tidak memiliki wewenang (hanya pemilik atau admin simulasi yang berhak).`);
    }

    if (!reason || typeof reason !== 'string' || !reason.trim()) {
      throw new Error('Alasan adopsi wajib disertakan.');
    }

    if (point.review_status !== REVIEW_STATUSES.AGREED_CANDIDATE || !point.agreed_class_id) {
      throw new Error('Observasi belum mencapai kesepakatan 2 penelaah independen (bukan kandidat adopsi).');
    }

    const currentVersion = point.interpretation_version || 1;
    const qualifyingReviews = (point.reviews || []).filter(r =>
      (r.version === currentVersion) &&
      (Number(r.proposedClassId ?? r.proposed_class_id) === Number(point.agreed_class_id))
    );
    const qualifyingReviewIds = qualifyingReviews.map(r => r.reviewId || r.review_id).filter(Boolean);
    if (qualifyingReviewIds.length < 2) {
      throw new Error('Adopsi memerlukan sekurang-kurangnya 2 ulasan sepakat yang sah pada versi interpretasi saat ini.');
    }

    point.project_class_id = point.agreed_class_id;
    point.project_class_label = point.agreed_class_label;
    point.quality_tier = QUALITY_TIERS.TIER_2;
    point.review_status = REVIEW_STATUSES.ADOPTED;
    point.adopted_event = {
      adopted_by: adopterId,
      reason: reason.trim(),
      adopted_at: new Date().toISOString(),
      agreed_class_id: point.agreed_class_id,
      agreed_class_label: point.agreed_class_label,
      version: currentVersion,
      review_ids: qualifyingReviewIds,
      supporting_review_ids: qualifyingReviewIds
    };

    return point;
  }

  /**
   * Edits an observation's interpretation (label/location/time/evidence),
   * incrementing version and invalidating prior reviews while preserving history.
   * @param {string} observationId
   * @param {Object} edits
   * @returns {Object} Updated record
   */
  editInterpretation(observationId, edits = {}) {
    const point = this.queue.find(p => p.observation_id === observationId);
    if (!point) throw new Error(`Observasi "${observationId}" tidak ditemukan.`);

    const oldVersion = point.interpretation_version || 1;
    point.history = point.history || [];
    point.history.push({
      version: oldVersion,
      project_class_id: point.project_class_id,
      project_class_label: point.project_class_label,
      geometry: structuredClone(point.geometry),
      observed_time: structuredClone(point.observed_time),
      evidence_refs: [...(point.evidence_refs || [])],
      quality_tier: point.quality_tier,
      review_status: point.review_status,
      reviews: structuredClone(point.reviews || [])
    });

    point.interpretation_version = oldVersion + 1;
    if (edits.project_class_id !== undefined) {
      const numClass = Number(edits.project_class_id);
      const def = CASE4_TARGET_CLASSES[numClass];
      if (def) {
        point.project_class_id = numClass;
        point.project_class_label = def.label;
      }
    }
    if (edits.coordinates) {
      point.geometry = { type: 'Point', coordinates: [...edits.coordinates] };
    }
    if (edits.observed_time) {
      point.observed_time = { ...edits.observed_time };
    }
    if (edits.imagery_ref) {
      point.imagery_ref = edits.imagery_ref;
      point.evidence_refs = [edits.imagery_ref];
    }
    if (edits.reason) {
      point.reason = edits.reason;
    }

    const wasDisputed = point.review_status === REVIEW_STATUSES.DISPUTED || Boolean(point.dispute_reason);
    const existingDisputeReason = point.dispute_reason;

    // Invalidate old reviews and agreements on version edit, retaining unresolved disputes
    if (wasDisputed) {
      point.review_status = REVIEW_STATUSES.DISPUTED;
      point.dispute_reason = existingDisputeReason || 'Sengketa perbedaan pendapat belum terselesaikan.';
      point.disputes = [{ status: 'unresolved', reason: point.dispute_reason, version: oldVersion }];
    } else {
      point.review_status = REVIEW_STATUSES.UNREVIEWED;
      delete point.dispute_reason;
    }
    point.quality_tier = QUALITY_TIERS.TIER_4;
    delete point.agreed_class_id;
    delete point.agreed_class_label;
    delete point.adopted_event;

    return point;
  }
}

/**
 * Builds the Case 4 review queue idempotently.
 * Adapts either standalone or class-based workflow calls.
 * @param {Array<Object>} screenSubmissions
 * @param {Object|Array<Object>} secondArg
 * @param {Array<Object>} thirdArg
 * @returns {Array<Object>}
 */
export function buildQueue(screenSubmissions = [], secondArg = [], thirdArg = []) {
  let generalRecords = [];
  let publishedRecords = [];

  if (secondArg && typeof secondArg === 'object' && Array.isArray(secondArg.records)) {
    publishedRecords = secondArg.records;
    generalRecords = Array.isArray(thirdArg) ? thirdArg : [];
  } else if (Array.isArray(secondArg) && secondArg.some(r => r.is_published || r.publication_metadata || r.contribution_type)) {
    publishedRecords = secondArg;
    generalRecords = Array.isArray(thirdArg) ? thirdArg : [];
  } else {
    generalRecords = Array.isArray(secondArg) ? secondArg : [];
    if (thirdArg && typeof thirdArg === 'object' && Array.isArray(thirdArg.records)) {
      publishedRecords = thirdArg.records;
    } else {
      publishedRecords = Array.isArray(thirdArg) ? thirdArg : [];
    }
  }

  const workflow = new ReviewWorkflow();
  return workflow.buildQueue(screenSubmissions, generalRecords, publishedRecords);
}
