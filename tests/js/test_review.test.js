/**
 * tests/js/test_review.test.js
 * Unit and domain tests for Case 4: Quality Assessment and Independent Blind Review.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ReviewWorkflow,
  QUALITY_TIERS,
  REVIEW_STATUSES,
  SIMULATED_REVIEWERS,
  CASE4_STANDALONE_DRAFT,
  buildCase4ActiveRecords,
  mapScreenSubmissionToCase4
} from '../../src/features/review.js';
import { CASE4_TARGET_CLASSES } from '../../src/domain/taxonomy.js';

test('ReviewWorkflow: Case 4 target taxonomy defines exactly 5 classes', () => {
  const classes = Object.values(CASE4_TARGET_CLASSES);
  assert.equal(classes.length, 5);
  assert.equal(CASE4_TARGET_CLASSES[1].label, 'Hutan');
  assert.equal(CASE4_TARGET_CLASSES[2].label, 'Kebun sawit');
  assert.equal(CASE4_TARGET_CLASSES[3].label, 'Kebun karet');
  assert.equal(CASE4_TARGET_CLASSES[4].label, 'Sawah');
  assert.equal(CASE4_TARGET_CLASSES[5].label, 'Lainnya');
});

test('ReviewWorkflow: buildQueue prioritizes Case 2 screen submissions and falls back to standalone draft', () => {
  const workflow = new ReviewWorkflow();

  // 1. Without screen submissions: uses standalone reproducible draft
  const fallbackQueue = workflow.buildQueue([], []);
  assert.ok(fallbackQueue.length >= 1);
  assert.equal(fallbackQueue[0].observation_id, CASE4_STANDALONE_DRAFT.observation_id);
  assert.equal(fallbackQueue[0].review_priority, 'high');

  // 2. With screen submissions: prioritizes them first
  const screenPoint = {
    observation_id: 'sample_live_001',
    project_class_id: 2,
    project_class_label: 'Kebun sawit',
    contributor_id: 'pemilik_a',
    is_screen_sample: true
  };
  const activeQueue = workflow.buildQueue([screenPoint], [{ observation_id: 'gen_1' }]);
  assert.equal(activeQueue[0].observation_id, 'sample_live_001');
  assert.equal(activeQueue[0].review_priority, 'high');
});

test('ReviewWorkflow: blind review card strictly masks initial class, tier, and prior conclusions before submission', () => {
  const workflow = new ReviewWorkflow();
  workflow.buildQueue([], []);

  const point = workflow.queue[0];
  workflow.setActiveReviewer('penelaah_1');

  // BEFORE submission: check blind card masking
  const blindCardBefore = workflow.getBlindReviewCard(point, 'penelaah_1');
  assert.equal(blindCardBefore.hasCurrentReviewerSubmitted, false);
  assert.equal(blindCardBefore.blindedInitialClass, '(Disembunyikan untuk penelaahan buta)');
  assert.equal(blindCardBefore.blindedCurrentTier, '(Disembunyikan)');
  assert.equal(blindCardBefore.priorConclusionsVisible, false);

  // Submit vote by penelaah_1
  workflow.submitReview({
    observationId: point.observation_id,
    reviewerId: 'penelaah_1',
    proposedClassId: 2,
    reason: 'Struktur tajuk konsisten dengan kelapa sawit'
  });

  // AFTER submission: unmasked for penelaah_1
  const blindCardAfter = workflow.getBlindReviewCard(point, 'penelaah_1');
  assert.equal(blindCardAfter.hasCurrentReviewerSubmitted, true);
  assert.notEqual(blindCardAfter.blindedInitialClass, '(Disembunyikan untuk penelaahan buta)');
  assert.notEqual(blindCardAfter.blindedCurrentTier, '(Disembunyikan)');
  assert.equal(blindCardAfter.priorConclusionsVisible, true);
  assert.equal(blindCardAfter.blindedCurrentTier, QUALITY_TIERS.TIER_3, '1 reviewer promotes to Tier 3');

  // For penelaah_2 who has NOT submitted yet: STILL BLIND!
  const blindCardOther = workflow.getBlindReviewCard(point, 'penelaah_2');
  assert.equal(blindCardOther.hasCurrentReviewerSubmitted, false);
  assert.equal(blindCardOther.blindedInitialClass, '(Disembunyikan untuk penelaahan buta)');
  assert.equal(blindCardOther.blindedCurrentTier, '(Disembunyikan)');
  assert.equal(blindCardOther.priorConclusionsVisible, false);
});

test('ReviewWorkflow: rejects contributor self-review, duplicate review, and stale version', () => {
  const workflow = new ReviewWorkflow();

  const testPoint = {
    observation_id: 'test_obs_rules',
    project_class_id: 2,
    interpretation_version: 1,
    contributor_id: 'penelaah_1', // contributor is penelaah_1!
    is_incomplete: false,
    reviews: []
  };

  workflow.queue = [testPoint];

  // 1. Rejects contributor self-review
  assert.throws(() => {
    workflow.submitReview({
      observationId: 'test_obs_rules',
      reviewerId: 'penelaah_1', // self-review!
      proposedClassId: 2,
      reason: 'Mencoba menelaah data sendiri'
    });
  }, /self-review ditolak/);

  // Change contributor to pemilik_a to test other invariants
  testPoint.contributor_id = 'pemilik_a';

  // 2. First review by penelaah_1 succeeds
  workflow.submitReview({
    observationId: 'test_obs_rules',
    reviewerId: 'penelaah_1',
    proposedClassId: 2,
    reason: 'Ulasan pertama yang sah'
  });

  // 3. Rejects duplicate review on same version by same reviewer
  assert.throws(() => {
    workflow.submitReview({
      observationId: 'test_obs_rules',
      reviewerId: 'penelaah_1', // duplicate!
      proposedClassId: 2,
      reason: 'Mencoba mengulas ulang versi yang sama'
    });
  }, /Duplikasi ulasan ditolak/);

  // 4. Rejects review on stale version
  assert.throws(() => {
    workflow.submitReview({
      observationId: 'test_obs_rules',
      reviewerId: 'penelaah_2',
      proposedClassId: 2,
      reason: 'Versi salah',
      version: 99 // stale version!
    });
  }, /kadaluarsa/);
});

test('ReviewWorkflow: consensus logic promotes to Tier 2 on agreement and sets dispute on contradiction', () => {
  const workflow = new ReviewWorkflow();

  const testPoint = {
    observation_id: 'test_consensus_point',
    project_class_id: 2,
    interpretation_version: 1,
    contributor_id: 'pemilik_a',
    is_incomplete: false,
    reviews: []
  };

  workflow.queue = [testPoint];

  // Reviewer 1 votes Class 3 (Kebun karet) -> differing class does NOT certify old label as Tier 3
  workflow.submitReview({
    observationId: 'test_consensus_point',
    reviewerId: 'penelaah_1',
    proposedClassId: 3,
    reason: 'Tajuk karet tampak berbeda',
    evidence: 'Sentinel-2 2025'
  });

  assert.equal(testPoint.review_status, REVIEW_STATUSES.IN_REVIEW);
  assert.notEqual(testPoint.quality_tier, QUALITY_TIERS.TIER_3, 'Differing proposal does not certify old label as Tier 3');

  // Reviewer 2 votes Class 3 (Kebun karet) -> 2 agreements on differing class -> Candidate only, NOT Tier 2 yet!
  workflow.submitReview({
    observationId: 'test_consensus_point',
    reviewerId: 'penelaah_2',
    proposedClassId: 3,
    reason: 'Konfirmasi tajuk karet',
    evidence: 'Sentinel-2 2025'
  });

  assert.equal(testPoint.review_status, REVIEW_STATUSES.AGREED_CANDIDATE);
  assert.equal(testPoint.agreed_class_id, 3);
  assert.notEqual(testPoint.quality_tier, QUALITY_TIERS.TIER_2, 'Candidate for new class does not certify old label as Tier 2 before adoption');

  // Authorized contributor adoption promotes to Tier 2 with agreed class
  const adopted = workflow.adoptCandidate('test_consensus_point', 'pemilik_a', 'Adopsi hasil kesepakatan penelaah');
  assert.equal(adopted.review_status, REVIEW_STATUSES.ADOPTED);
  assert.equal(adopted.project_class_id, 3);
  assert.equal(adopted.quality_tier, QUALITY_TIERS.TIER_2);
  assert.equal(adopted.adopted_event.adopted_by, 'pemilik_a');

  // Test Contradiction scenario on a second point
  const disputePoint = {
    observation_id: 'test_dispute_point',
    project_class_id: 2,
    interpretation_version: 1,
    contributor_id: 'pemilik_a',
    is_incomplete: false,
    reviews: []
  };

  workflow.queue.push(disputePoint);

  workflow.submitReview({
    observationId: 'test_dispute_point',
    reviewerId: 'penelaah_1',
    proposedClassId: 2, // Kebun sawit
    reason: 'Melihat kelapa sawit'
  });

  workflow.submitReview({
    observationId: 'test_dispute_point',
    reviewerId: 'penelaah_2',
    proposedClassId: 3, // Kebun karet (CONTRADICTION!)
    reason: 'Menurut saya ini kebun karet rakyat'
  });

  assert.equal(disputePoint.review_status, REVIEW_STATUSES.DISPUTED);
  assert.equal(disputePoint.quality_tier, QUALITY_TIERS.TIER_4, 'Contradiction blocks promotion');
  assert.ok(disputePoint.dispute_reason.includes('perbedaan pendapat'));

  // Adoption of disputed point must be rejected
  assert.throws(() => {
    workflow.adoptCandidate('test_dispute_point', 'pemilik_a');
  }, /sengketa perbedaan pendapat/);
});

test('ReviewWorkflow: buildCase4ActiveRecords maintains 1239 base count and 1240 with screen submission', () => {
  // 1. Generate 1239 simulated source records
  const sourceRecords = Array.from({ length: 1239 }, (_, i) => ({
    observation_id: `src_c4_${i + 1}`,
    project_class_id: (i % 5) + 1,
    project_class_label: 'Kelas',
    geometry: { type: 'Point', coordinates: [104.5, -2.5] },
    is_within_aoi: true
  }));

  // Base Case 4 remains 1239 when no screen points
  const baseCollection = buildCase4ActiveRecords(sourceRecords, [], {});
  assert.equal(baseCollection.length, 1239, 'Base Case 4 collection is exactly 1239 when no screen points exist');

  // With 1 screen submission inside AOI, count increases to 1240 with schema mapping
  const screenPoint = {
    observation_id: 'screen_uuid_001',
    project_class_id: 1, // Karet in Case 1 schema
    project_class_label: 'Karet',
    source_schema_id: 'schema_screen_sampling_v1',
    geometry: { type: 'Point', coordinates: [104.48, -2.43] },
    is_screen_sample: true,
    is_within_aoi: true,
    contributor_id: 'pemilik_a',
    rights_id: 'simulated_open_donor_consent'
  };

  const withScreen = buildCase4ActiveRecords(sourceRecords, [screenPoint], {});
  assert.equal(withScreen.length, 1240, 'Case 4 collection increases to 1240 with screen submission');
  const found = withScreen.find(r => r.observation_id === 'screen_uuid_001');
  assert.ok(found);
  assert.equal(found.project_class_id, 3, 'Screen rubber (1) mapped to Case 4 rubber (3)');
  assert.equal(found.project_class_label, 'Kebun karet');
  assert.equal(found.contributor_id, 'pemilik_a', 'Preserves source contributor_id');

  // Load current persisted interpretation
  const interpretations = {
    screen_uuid_001: {
      project_class_id: 3,
      project_class_label: 'Kebun karet',
      quality_tier: 2,
      review_status: 'adopted',
      adopted_event: { adopted_by: 'admin', reason: 'Konsensus' }
    }
  };
  const withInterp = buildCase4ActiveRecords(sourceRecords, [screenPoint], interpretations);
  const interpretedPoint = withInterp.find(r => r.observation_id === 'screen_uuid_001');
  assert.equal(interpretedPoint.quality_tier, 2);
  assert.equal(interpretedPoint.review_status, 'adopted');
  assert.equal(interpretedPoint.adopted_event.adopted_by, 'admin');
});
