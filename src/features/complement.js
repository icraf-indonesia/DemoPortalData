/**
 * src/features/complement.js
 * Workflow logic and staged state management for Case 1: Complementing training samples.
 * 
 * Invariants:
 * - Cancellable staged flow with Back/Cancel guaranteeing 0 mutations.
 * - Selection uses schema/class IDs, excludes palm & rubber (target classes).
 * - Source 2b has 5 broad classes (never fabricate 22 classes).
 * - Stable deduplication by observation_id (coincident points with distinct IDs allowed).
 * - Confirmation creates private Data Campuran #1, preserving original source datasets.
 * - Records latest delta distinct from total.
 */

import { evaluateCandidateEligibility, MODES } from '../demo/scenarios.js';

export const COMPLEMENT_STEPS = Object.freeze({
  CLOSED: 'closed',
  CATALOGUE: 'catalogue',
  SELECTING: 'selecting',
  PREVIEWING: 'previewing'
});

/**
 * Known source classes for data_ref_mod_2b (5 broad classes, not 22).
 */
export const REF_MOD_2B_CLASSES = Object.freeze([
  { id: '1', label: 'Hutan', isTargetClass: false, description: 'Tutupan hutan alam / sekunder' },
  { id: '2', label: 'Kebun sawit', isTargetClass: true, description: 'Kelas target proyek (Kelapa sawit) - dikecualikan' },
  { id: '3', label: 'Kebun karet', isTargetClass: true, description: 'Kelas target proyek (Karet) - dikecualikan' },
  { id: '4', label: 'Sawah', isTargetClass: false, description: 'Lahan basah pertanian sawah' },
  { id: '5', label: 'Lainnya', isTargetClass: false, description: 'Tutupan non-perkebunan rujukan lainnya' }
]);

export const DATASET_COMPLEMENT_CLASSES = Object.freeze({
  data_ref_mod_2b: REF_MOD_2B_CLASSES,
  data_sawah: Object.freeze([
    { id: '1', label: 'Sawah', isTargetClass: false, description: 'Lahan basah pertanian sawah (Koleksi Mitra)' },
    { id: '4', label: 'Sawah', isTargetClass: false, description: 'Lahan basah pertanian sawah' },
    { id: '5', label: 'Sawah', isTargetClass: false, description: 'Lahan basah pertanian sawah' }
  ]),
  data_hutan: Object.freeze([
    { id: '1', label: 'Hutan', isTargetClass: false, description: 'Tutupan hutan alam / sekunder (Dinas Kehutanan 2024)' },
    { id: '4', label: 'Hutan', isTargetClass: false, description: 'Tutupan hutan alam / sekunder (Dinas Kehutanan 2024)' }
  ]),
  case4_data_kombinasi_f: Object.freeze([
    { id: '1', label: 'Hutan', isTargetClass: false, description: 'Tutupan lahan hutan' },
    { id: '2', label: 'Kebun sawit', isTargetClass: true, description: 'Kelas target proyek (Kelapa sawit) - dikecualikan' },
    { id: '3', label: 'Kebun karet', isTargetClass: true, description: 'Kelas target proyek (Karet) - dikecualikan' },
    { id: '4', label: 'Sawah', isTargetClass: false, description: 'Lahan pertanian sawah' },
    { id: '5', label: 'Lainnya', isTargetClass: false, description: 'Tutupan non-perkebunan lainnya' }
  ]),
  data_ref_mod_f: Object.freeze([
    { id: '1', label: 'Titik Rujukan (Tanpa Label)', isTargetClass: false, description: 'Titik rujukan sampling acak/grid tanpa label kelas sumber' }
  ])
});

export function getComplementClassesForSource(sourceId) {
  if (sourceId && DATASET_COMPLEMENT_CLASSES[sourceId]) {
    return DATASET_COMPLEMENT_CLASSES[sourceId];
  }
  return REF_MOD_2B_CLASSES;
}

export class ComplementWorkflow {
  constructor(workspace) {
    this.workspace = workspace;
    this.step = COMPLEMENT_STEPS.CLOSED;
    this.selectedSourceId = 'data_ref_mod_2b';
    this.selectedClassIds = new Set(['1', '4', '5']); // Default non-target classes
    this.cachedSourceRecords = [];
    this.lastOperationReceipt = null;
  }

  /**
   * Resolves available classes for current source dataset.
   * @returns {Array<Object>}
   */
  getSourceClasses() {
    return getComplementClassesForSource(this.selectedSourceId);
  }

  /**
   * Opens the staged complement flow.
   * @param {Array<Object>} sourceRecords Loaded raw records from selected source
   * @param {string} sourceId
   */
  startFlow(sourceRecords = [], sourceId = 'data_ref_mod_2b') {
    this.step = COMPLEMENT_STEPS.SELECTING;
    this.selectedSourceId = sourceId;
    this.cachedSourceRecords = sourceRecords;
    // Default to all non-target classes that exist in records
    this.selectNonTargetClasses();
  }

  /**
   * Selects all non-target classes (excluding sawit and karet).
   */
  selectNonTargetClasses() {
    const classes = this.getSourceClasses();
    this.selectedClassIds = new Set(
      classes
        .filter(c => !c.isTargetClass)
        .map(c => String(c.id))
    );
  }

  /**
   * Clears class selections.
   */
  clearSelections() {
    this.selectedClassIds.clear();
  }

  /**
   * Toggles a source class ID selection.
   * Target classes (sawit and karet) cannot be selected.
   * @param {string} classId
   * @param {boolean} [forced]
   */
  toggleClass(classId, forced = null) {
    const classes = this.getSourceClasses();
    const classDef = classes.find(c => String(c.id) === String(classId));
    if (classDef && classDef.isTargetClass) {
      // Disallowed: cannot map target class to Lainnya
      return;
    }

    const strId = String(classId);
    if (forced !== null) {
      if (forced) this.selectedClassIds.add(strId);
      else this.selectedClassIds.delete(strId);
    } else {
      if (this.selectedClassIds.has(strId)) {
        this.selectedClassIds.delete(strId);
      } else {
        this.selectedClassIds.add(strId);
      }
    }
  }

  /**
   * Cancels flow and resets staging with zero mutations.
   */
  cancel() {
    this.step = COMPLEMENT_STEPS.CLOSED;
    this.cachedSourceRecords = [];
  }

  /**
   * Moves back to the class selection step without mutating workspace.
   */
  backToSelect() {
    this.step = COMPLEMENT_STEPS.SELECTING;
  }

  /**
   * Generates a preview summary of candidate additions.
   * @param {string} mode 'source' or 'scenario'
   * @returns {Object} Preview calculation details
   */
  calculatePreview(mode = MODES.SCENARIO) {
    const existingPoints = this.workspace.activeRecords || [];
    const existingIds = new Set(existingPoints.map(p => p.observation_id));

    // 1. Filter by candidate eligibility (spatial, temporal, rights)
    const evalResult = evaluateCandidateEligibility(
      this.cachedSourceRecords,
      this.selectedSourceId,
      mode,
      { withinAoi: true, minYear: 2024, maxYear: 2026, requireRights: true }
    );

    // 2. Filter eligible points by selected class IDs
    const matchedByClass = [];
    const excludedByClass = [];

    for (const obs of evalResult.eligible) {
      const srcCid = String(obs.source_class_id ?? obs.project_class_id ?? '');
      const projCid = String(obs.project_class_id ?? '');
      if (this.selectedClassIds.has(srcCid) || this.selectedClassIds.has(projCid)) {
        matchedByClass.push(obs);
      } else {
        excludedByClass.push(obs);
      }
    }

    // 3. Deduplicate against existing workspace points
    const netNewPoints = [];
    const duplicatePoints = [];

    for (const obs of matchedByClass) {
      if (existingIds.has(obs.observation_id)) {
        duplicatePoints.push(obs);
      } else {
        netNewPoints.push(obs);
      }
    }

    // Breakdown of selected points by source class
    const classes = this.getSourceClasses();
    const classBreakdown = {};
    for (const cid of this.selectedClassIds) {
      const def = classes.find(c => String(c.id) === String(cid));
      const label = def ? def.label : `Kelas ${cid}`;
      const count = netNewPoints.filter(p =>
        String(p.source_class_id) === String(cid) || String(p.project_class_id) === String(cid)
      ).length;
      if (count > 0 || !classBreakdown[label]) {
        classBreakdown[label] = (classBreakdown[label] || 0) + count;
      }
    }

    return {
      sourceId: this.selectedSourceId,
      mode,
      totalSourceCandidates: this.cachedSourceRecords.length,
      eligibleAfterFilters: evalResult.eligible.length,
      excludedByFilter: evalResult.excluded.length,
      filterExclusions: evalResult.counts.byReason,
      matchedSelectedClassesCount: matchedByClass.length,
      duplicateCount: duplicatePoints.length,
      netNewCount: netNewPoints.length,
      currentTotalCount: existingPoints.length,
      projectedTotalCount: existingPoints.length + netNewPoints.length,
      classBreakdown,
      netNewPoints,
      duplicatePoints
    };
  }

  /**
   * Commits staged addition to workspace.
   * Creates private Data Campuran #1, adds deduplicated points mapped to Lainnya (3),
   * records delta, and updates persistent project state.
   * @param {string} mode 'source' or 'scenario'
   * @returns {{ success: boolean, addedCount: number, totalCount: number, datasetId: string }}
   */
  confirmAddition(mode = MODES.SCENARIO) {
    const preview = this.calculatePreview(mode);
    const existingPoints = this.workspace.activeRecords || [];

    // Map each net new point to Project Class 3 (Lainnya) while preserving source properties
    const mappedNewPoints = preview.netNewPoints.map(obs => ({
      ...obs,
      project_class_id: 3,
      project_class_label: 'Lainnya',
      // Keep source lineage intact
      source_dataset_id: this.selectedSourceId
    }));

    const combinedRecords = [...existingPoints, ...mappedNewPoints];

    const mixedMeta = {
      id: 'data_campuran_1',
      title: 'Data Campuran #1',
      category: 'Data Campuran (Privat)',
      description: 'Koleksi gabungan Data Pengguna #1 dan titik rujukan kelas Lainnya terpilih.',
      isPrimary: false,
      isPrivate: true,
      kind: 'point_observations',
      featureCount: combinedRecords.length,
      lastDelta: mappedNewPoints.length,
      lastAddedSource: this.selectedSourceId,
      addedAt: new Date().toISOString()
    };

    // Update workspace state
    this.workspace.setMixedDataset(mixedMeta.id, mixedMeta, combinedRecords, mappedNewPoints.length);

    this.lastOperationReceipt = {
      operationId: `op_${Date.now()}`,
      addedCount: mappedNewPoints.length,
      duplicateSkipped: preview.duplicateCount,
      totalCount: combinedRecords.length,
      sourceId: this.selectedSourceId,
      timestamp: mixedMeta.addedAt
    };

    this.step = COMPLEMENT_STEPS.CLOSED;
    this.cachedSourceRecords = [];

    return {
      success: true,
      addedCount: mappedNewPoints.length,
      duplicateSkipped: preview.duplicateCount,
      totalCount: combinedRecords.length,
      datasetId: mixedMeta.id
    };
  }
}
