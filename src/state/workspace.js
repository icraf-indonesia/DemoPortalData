/**
 * src/state/workspace.js
 * Central reactive workspace state for Portal Data Epistem across Cases 1–4.
 * Coordinates dataset selection, active points, table visibility, mode switching,
 * multi-case schema transitions, on-screen sampling, review events, and persistence.
 * 
 * Invariants:
 * - Independent boundary failure visibility.
 * - Concurrency control for dataset switching.
 * - Distinguishes between initial source dataset, private Data Campuran #1, and Case 2 donations.
 * - Case-aware schema resolution (Case 1/2: 3-class, Case 3: 2-class, Case 4: 5-class).
 * - Tracks latest added delta distinct from total.
 * - Restores project state on refresh and handles corrupt storage gracefully.
 */

import {
  computeClassCounts,
  PROJECT_CLASSES,
  CASE3_FORESTRY_CLASSES,
  CASE4_TARGET_CLASSES
} from '../domain/taxonomy.js';
import { mapScreenSubmissionToCase4 } from '../features/review.js';
import {
  savePreferences,
  loadPreferences,
  saveProjectState,
  loadProjectState,
  clearPreferences,
  PERSISTENCE_LABELS
} from './storage.js';
import { MODES } from '../demo/scenarios.js';

export class WorkspaceState {
  constructor() {
    this.activeDatasetId = 'data_kebun_sawit_karet_f';
    this.activeDatasetMeta = null;
    this.activeRecords = [];
    this.classCounts = { 1: 0, 2: 0, 3: 0, unmapped: 0, total: 0 };
    this.selectedPointId = null;
    this.isTableCollapsed = true; // Default closed initially for fresh profile
    this.isLeftCollapsed = false;  // Default open initially
    this.isRightCollapsed = false; // Default open initially
    this.boundaryData = null;
    this.catalogueItems = [];
    this.manifest = null;

    // Cases & mode states
    this.activeMode = MODES.SCENARIO; // Default to demo scenario mode
    this.activeCaseId = 1;
    this.lastDelta = 0;
    this.mixedDataset = null; // Stored private Data Campuran #1

    // Case 2, 3 & 4 persisted states
    this.case2DonatedCollection = null;
    this.case2ScreenSubmissions = [];
    this.case2SamplingDraft = null;
    this.case3PrivateCollection = null;
    this.case4Reviews = [];
    this.case4Adoptions = [];
    this.case4Queue = [];
    this.case4Interpretations = {};
    this.isSamplingActive = false;
    this.isEoxBasemapActive = false;

    this.storageStatus = {
      success: true,
      label: PERSISTENCE_LABELS.NOT_STORED,
      timestamp: null,
      error: null
    };
    this.errorMessage = null;
    this.storageRecoveryNotice = null;
    this.listeners = new Set();
  }

  /**
   * Subscribes a callback to state changes.
   * @param {Function} listener
   * @returns {Function} Unsubscribe function
   */
  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Notifies all listeners of state mutation.
   */
  notify() {
    for (const listener of this.listeners) {
      try {
        listener(this);
      } catch (err) {
        console.error('Error in workspace listener:', err);
      }
    }
  }

  /**
   * Resolves active taxonomy schema based on current activeCaseId.
   * @returns {Object}
   */
  getActiveSchema() {
    if (this.activeCaseId === 3) return CASE3_FORESTRY_CLASSES;
    if (this.activeCaseId === 4) return CASE4_TARGET_CLASSES;
    return PROJECT_CLASSES;
  }

  /**
   * Initializes workspace with persisted preferences and project state.
   */
  initPreferences() {
    try {
      const prefs = loadPreferences();
      if (prefs) {
        if (prefs.activeDatasetId) {
          this.activeDatasetId = prefs.activeDatasetId;
        }
        if (typeof prefs.isTableCollapsed === 'boolean') {
          this.isTableCollapsed = prefs.isTableCollapsed;
        }
        if (typeof prefs.isLeftCollapsed === 'boolean') {
          this.isLeftCollapsed = prefs.isLeftCollapsed;
        }
        if (typeof prefs.isRightCollapsed === 'boolean') {
          this.isRightCollapsed = prefs.isRightCollapsed;
        }
        if (prefs.activeMode) {
          this.activeMode = prefs.activeMode;
        }
        if (prefs.activeCaseId) {
          this.activeCaseId = prefs.activeCaseId;
        }
      }
    } catch (err) {
      this.storageRecoveryNotice = `Perhatian: ${err.message}. Anda dapat mereset data penyimpanan lokal jika diperlukan.`;
    }

    try {
      const proj = loadProjectState();
      if (proj) {
        if (proj.mixedDataset) {
          this.mixedDataset = proj.mixedDataset;
          this.lastDelta = proj.lastDelta || 0;
        }
        if (proj.case2DonatedCollection) {
          this.case2DonatedCollection = proj.case2DonatedCollection;
        }
        if (Array.isArray(proj.case2ScreenSubmissions)) {
          this.case2ScreenSubmissions = proj.case2ScreenSubmissions;
        }
        if (Array.isArray(proj.case4Reviews)) {
          this.case4Reviews = proj.case4Reviews;
        }
        if (proj.case3PrivateCollection) {
          this.case3PrivateCollection = proj.case3PrivateCollection;
        }
        if (Array.isArray(proj.case4Adoptions)) {
          this.case4Adoptions = proj.case4Adoptions;
        }
        if (proj.case2SamplingDraft) {
          this.case2SamplingDraft = proj.case2SamplingDraft;
        }
        if (Array.isArray(proj.case4Queue)) {
          this.case4Queue = proj.case4Queue;
        }
        if (proj.case4Interpretations && typeof proj.case4Interpretations === 'object') {
          this.case4Interpretations = proj.case4Interpretations;
        }
      }
    } catch (err) {
      this.storageRecoveryNotice = `Perhatian: ${err.message}. Anda dapat mereset data penyimpanan lokal jika diperlukan.`;
    }
  }

  /**
   * Sets catalogue and manifest data.
   * Ensures private Data Campuran #1, donated collections, and Case 3 collections are included in catalogue if present.
   * @param {Object} manifest
   * @param {Array<Object>} items
   */
  setCatalogue(manifest, items) {
    this.manifest = manifest;
    this.catalogueItems = [...items];

    // Restore mixed dataset if present
    if (this.mixedDataset && !this.catalogueItems.some(i => i.id === this.mixedDataset.meta.id)) {
      this.catalogueItems.push({
        id: this.mixedDataset.meta.id,
        title: this.mixedDataset.meta.title,
        category: this.mixedDataset.meta.category,
        description: this.mixedDataset.meta.description,
        geojsonPath: null,
        isPrimary: false,
        isPrivate: true,
        featureCount: this.mixedDataset.records.length,
        sha256: null
      });
    }

    // Restore donated collection if present
    if (this.case2DonatedCollection && !this.catalogueItems.some(i => i.id === this.case2DonatedCollection.meta.id)) {
      this.catalogueItems.push({
        id: this.case2DonatedCollection.meta.id,
        title: this.case2DonatedCollection.meta.title,
        category: this.case2DonatedCollection.meta.category,
        description: this.case2DonatedCollection.meta.description,
        geojsonPath: null,
        isPrimary: false,
        isPrivate: true,
        featureCount: this.case2DonatedCollection.records.length,
        sha256: null
      });
    }

    // Restore Case 3 private collection if present
    if (this.case3PrivateCollection && !this.catalogueItems.some(i => i.id === this.case3PrivateCollection.meta.id)) {
      this.catalogueItems.push({
        id: this.case3PrivateCollection.meta.id,
        title: this.case3PrivateCollection.meta.title,
        category: this.case3PrivateCollection.meta.category,
        description: this.case3PrivateCollection.meta.description,
        geojsonPath: null,
        isPrimary: false,
        isPrivate: true,
        featureCount: this.case3PrivateCollection.records.length,
        sha256: null
      });
    }

    this.notify();
  }

  /**
   * Sets boundary polygon GeoJSON data.
   * @param {Object} boundary
   */
  setBoundary(boundary) {
    this.boundaryData = boundary;
    this.notify();
  }

  /**
   * Sets active dataset and recalculates class totals and selections.
   * Persists changes to browser localStorage.
   * @param {string} datasetId
   * @param {Object} meta
   * @param {Array<Object>} records
   */
  setActiveDataset(datasetId, meta, records, delta = 0) {
    this.activeDatasetId = datasetId;
    this.activeDatasetMeta = meta;
    this.activeRecords = records || [];
    this.classCounts = computeClassCounts(this.activeRecords, this.getActiveSchema());
    this.selectedPointId = null;
    this.errorMessage = null;

    if (delta > 0) {
      this.lastDelta = delta;
    } else if (datasetId !== 'data_campuran_1' && datasetId !== 'data_kehutanan_terpadu') {
      this.lastDelta = 0;
    }

    const catItem = this.catalogueItems.find(i => i.id === datasetId);
    if (catItem) {
      if (meta && meta.featureCount !== undefined) catItem.featureCount = meta.featureCount;
      if (meta && meta.archiveFeatureCount !== undefined) catItem.archiveFeatureCount = meta.archiveFeatureCount;
    }

    this.persist();
    this.notify();
  }

  /**
   * Sets private Data Campuran #1 and commits it as active dataset.
   * @param {string} datasetId
   * @param {Object} meta
   * @param {Array<Object>} records
   * @param {number} delta
   */
  setMixedDataset(datasetId, meta, records, delta = 0) {
    this.mixedDataset = {
      meta,
      records: [...records],
      lastDelta: delta
    };
    this.lastDelta = delta;

    // Ensure it exists in catalogue list
    const existingIdx = this.catalogueItems.findIndex(i => i.id === datasetId);
    const catItem = {
      id: datasetId,
      title: meta.title,
      category: meta.category,
      description: meta.description,
      geojsonPath: null,
      isPrimary: false,
      isPrivate: true,
      featureCount: records.length,
      sha256: null
    };

    if (existingIdx >= 0) {
      this.catalogueItems[existingIdx] = catItem;
    } else {
      this.catalogueItems.push(catItem);
    }

    this.setActiveDataset(datasetId, meta, records);
    this.saveProject();
  }

  /**
   * Records a donated collection from Case 2.
   * @param {Object} collectionPackage
   */
  setDonatedCollection(collectionPackage) {
    this.case2DonatedCollection = collectionPackage;

    const existingIdx = this.catalogueItems.findIndex(i => i.id === collectionPackage.meta.id);
    const catItem = {
      id: collectionPackage.meta.id,
      title: collectionPackage.meta.title,
      category: collectionPackage.meta.category,
      description: collectionPackage.meta.description,
      geojsonPath: null,
      isPrimary: false,
      isPrivate: false,
      isDonated: true,
      featureCount: collectionPackage.records.length,
      sha256: null
    };

    if (existingIdx >= 0) {
      this.catalogueItems[existingIdx] = catItem;
    } else {
      this.catalogueItems.push(catItem);
    }

    this.saveProject();
    this.notify();
  }

  /**
   * Adds an on-screen sampling submission idempotently by UUID.
   * @param {Object} sampleRecord
   */
  addScreenSubmission(sampleRecord) {
    if (!sampleRecord || !sampleRecord.observation_id) return;
    const existingIdx = this.case2ScreenSubmissions.findIndex(s => s.observation_id === sampleRecord.observation_id);
    if (existingIdx >= 0) {
      this.case2ScreenSubmissions[existingIdx] = sampleRecord;
    } else {
      this.case2ScreenSubmissions.push(sampleRecord);
    }

    // If active dataset is plantation, mixed, donated, or Case 4 combination, include it in records idempotently
    if (
      this.activeDatasetId === 'data_kebun_sawit_karet_f' ||
      this.activeDatasetId === 'data_campuran_1' ||
      this.activeDatasetId === 'data_kontribusi_mandiri' ||
      this.activeDatasetId === 'case4_data_kombinasi_f'
    ) {
      const actIdx = this.activeRecords.findIndex(r => r.observation_id === sampleRecord.observation_id);
      let recordToAdd = sampleRecord;
      if (this.activeDatasetId === 'case4_data_kombinasi_f') {
        recordToAdd = mapScreenSubmissionToCase4(sampleRecord);
      }
      if (actIdx >= 0) {
        this.activeRecords[actIdx] = { ...this.activeRecords[actIdx], ...recordToAdd };
      } else {
        this.activeRecords.push(recordToAdd);
      }
      this.classCounts = computeClassCounts(this.activeRecords, this.getActiveSchema());
    }

    this.saveProject();
    this.notify();
  }

  /**
   * Records an audit review event for Case 4.
   * @param {Object} reviewEvent
   */
  recordReview(reviewEvent) {
    this.case4Reviews.push(reviewEvent);
    this.saveProject();
    this.notify();
  }

  /**
   * Persists private project state across cases.
   * Tracks project save failure independently so preference saves do not mask failure.
   */
  saveProject() {
    const res = saveProjectState({
      mixedDataset: this.mixedDataset,
      lastDelta: this.lastDelta,
      case2DonatedCollection: this.case2DonatedCollection,
      case2ScreenSubmissions: this.case2ScreenSubmissions,
      case4Reviews: this.case4Reviews,
      case3PrivateCollection: this.case3PrivateCollection,
      case4Adoptions: this.case4Adoptions,
      case2SamplingDraft: this.case2SamplingDraft,
      case4Queue: this.case4Queue,
      case4Interpretations: this.case4Interpretations
    });
    if (!res || !res.success) {
      this.lastProjectSaveError = (res && res.error) || 'Gagal menyimpan status proyek';
      this.storageStatus = {
        success: false,
        label: `${PERSISTENCE_LABELS.FAILED}: ${this.lastProjectSaveError}`,
        timestamp: null,
        error: this.lastProjectSaveError
      };
    } else {
      this.lastProjectSaveError = null;
    }
  }

  /**
   * Sets and persists Case 3 private combined collection.
   * @param {Object} collection
   */
  setCase3PrivateCollection(collection) {
    this.case3PrivateCollection = collection;
    if (this.case3PrivateCollection && !this.catalogueItems.some(i => i.id === this.case3PrivateCollection.meta.id)) {
      this.catalogueItems.push({
        id: this.case3PrivateCollection.meta.id,
        title: this.case3PrivateCollection.meta.title,
        category: this.case3PrivateCollection.meta.category,
        description: this.case3PrivateCollection.meta.description,
        geojsonPath: null,
        isPrimary: false,
        isPrivate: true,
        featureCount: this.case3PrivateCollection.records.length,
        sha256: null
      });
    }
    this.setActiveDataset(
      collection.meta.id,
      collection.meta,
      collection.records,
      collection.addedCount || 0
    );
    this.saveProject();
    this.notify();
  }

  /**
   * Saves active sampling UUID draft before final submit.
   * @param {Object} draft
   */
  setSamplingDraft(draft) {
    this.case2SamplingDraft = draft;
    this.saveProject();
    this.notify();
  }

  /**
   * Clears stored sampling draft upon submit or explicit cancel.
   */
  clearSamplingDraft() {
    this.case2SamplingDraft = null;
    this.saveProject();
    this.notify();
  }

  /**
   * Records an official candidate adoption event in Case 4.
   * @param {Object} adoptionEvent
   */
  recordAdoption(adoptionEvent) {
    this.case4Adoptions.push(adoptionEvent);
    this.saveProject();
    this.notify();
  }

  /**
   * Updates an observation record's interpretation and consensus across active records,
   * review queue, and persisted interpretation cache.
   * @param {Object} updatedPoint
   */
  updateRecordInterpretation(updatedPoint) {
    if (!updatedPoint || !updatedPoint.observation_id) return;
    const obsId = updatedPoint.observation_id;

    // 1. Update in activeRecords
    const idx = (this.activeRecords || []).findIndex(r => r.observation_id === obsId);
    if (idx !== -1) {
      this.activeRecords[idx] = {
        ...this.activeRecords[idx],
        project_class_id: updatedPoint.project_class_id,
        project_class_label: updatedPoint.project_class_label,
        quality_tier: updatedPoint.quality_tier,
        review_status: updatedPoint.review_status,
        interpretation_version: updatedPoint.interpretation_version,
        reviews: updatedPoint.reviews ? [...updatedPoint.reviews] : (this.activeRecords[idx].reviews || []),
        adopted_event: updatedPoint.adopted_event || this.activeRecords[idx].adopted_event || null
      };
    } else if (this.activeDatasetId === 'case4_data_kombinasi_f') {
      this.activeRecords.push({ ...updatedPoint });
    }
    this.classCounts = computeClassCounts(this.activeRecords, this.getActiveSchema());

    // 2. Update in case4Queue
    const qIdx = (this.case4Queue || []).findIndex(r => r.observation_id === obsId);
    if (qIdx !== -1) {
      this.case4Queue[qIdx] = { ...updatedPoint };
    } else {
      this.case4Queue.push({ ...updatedPoint });
    }

    // 3. Cache interpretation
    this.case4Interpretations = this.case4Interpretations || {};
    this.case4Interpretations[obsId] = {
      project_class_id: updatedPoint.project_class_id,
      project_class_label: updatedPoint.project_class_label,
      quality_tier: updatedPoint.quality_tier,
      review_status: updatedPoint.review_status,
      interpretation_version: updatedPoint.interpretation_version,
      reviews: updatedPoint.reviews ? [...updatedPoint.reviews] : [],
      adopted_event: updatedPoint.adopted_event || null
    };

    this.saveProject();
    this.notify();
  }

  /**
   * Switches display mode between 'source' (strict) and 'scenario' (demo overlay).
   * @param {string} mode
   */
  setMode(mode) {
    if (mode === MODES.SOURCE || mode === MODES.SCENARIO) {
      this.activeMode = mode;
      this.persist();
      this.notify();
    }
  }

  /**
   * Switches case navigation tab (Kasus 1–4).
   * @param {number} caseId
   */
  setCase(caseId) {
    this.activeCaseId = caseId;
    this.classCounts = computeClassCounts(this.activeRecords, this.getActiveSchema());
    this.persist();
    this.notify();
  }

  /**
   * Toggles sampling mode state.
   * @param {boolean} [forced]
   */
  setSamplingActive(forced = null) {
    this.isSamplingActive = forced !== null ? Boolean(forced) : !this.isSamplingActive;
    this.notify();
  }

  /**
   * Toggles optional EOX basemap active state.
   * @param {boolean} [forced]
   */
  setEoxBasemapActive(forced = null) {
    this.isEoxBasemapActive = forced !== null ? Boolean(forced) : !this.isEoxBasemapActive;
    this.notify();
  }

  /**
   * Sets selected observation point for highlighting and map centering.
   * @param {string|null} pointId
   */
  setSelectedPoint(pointId) {
    this.selectedPointId = pointId;
    this.notify();
  }

  /**
   * Toggles collapsible bottom attribute table.
   * @param {boolean} [forcedState]
   */
  toggleTable(forcedState = null) {
    this.isTableCollapsed = forcedState !== null ? Boolean(forcedState) : !this.isTableCollapsed;
    this.persist();
    this.notify();
  }

  /**
   * Toggles left classification panel visibility.
   * @param {boolean} [forcedState]
   */
  toggleLeftPanel(forcedState = null) {
    this.isLeftCollapsed = forcedState !== null ? Boolean(forcedState) : !this.isLeftCollapsed;
    this.persist();
    this.notify();
  }

  /**
   * Toggles right catalogue panel visibility.
   * @param {boolean} [forcedState]
   */
  toggleRightPanel(forcedState = null) {
    this.isRightCollapsed = forcedState !== null ? Boolean(forcedState) : !this.isRightCollapsed;
    this.persist();
    this.notify();
  }

  /**
   * Sets panel visibility by name ('left', 'right', 'table').
   * @param {'left'|'right'|'table'} panel
   * @param {boolean} isVisible
   */
  setPanelVisibility(panel, isVisible) {
    if (panel === 'left') this.isLeftCollapsed = !isVisible;
    else if (panel === 'right') this.isRightCollapsed = !isVisible;
    else if (panel === 'table') this.isTableCollapsed = !isVisible;
    this.persist();
    this.notify();
  }

  /**
   * Records a visible error message.
   * @param {string|null} message
   */
  setError(message) {
    this.errorMessage = message;
    this.notify();
  }

  /**
   * Persists workspace preferences.
   */
  persist() {
    const saveRes = savePreferences({
      activeDatasetId: this.activeDatasetId,
      isTableCollapsed: this.isTableCollapsed,
      isLeftCollapsed: this.isLeftCollapsed,
      isRightCollapsed: this.isRightCollapsed,
      activeMode: this.activeMode,
      activeCaseId: this.activeCaseId
    });
    if (this.lastProjectSaveError) {
      this.storageStatus = {
        success: false,
        label: `${PERSISTENCE_LABELS.FAILED}: ${this.lastProjectSaveError}`,
        timestamp: null,
        error: this.lastProjectSaveError
      };
    } else {
      this.storageStatus = saveRes;
    }
  }

  /**
   * Deterministic reset of workspace and stored local data.
   */
  resetWorkspace() {
    clearPreferences();
    this.lastProjectSaveError = null;
    this.mixedDataset = null;
    this.case2DonatedCollection = null;
    this.case2ScreenSubmissions = [];
    this.case2SamplingDraft = null;
    this.case3PrivateCollection = null;
    this.case4Reviews = [];
    this.case4Adoptions = [];
    this.case4Queue = [];
    this.case4Interpretations = {};
    this.isSamplingActive = false;
    this.isEoxBasemapActive = false;
    this.lastDelta = 0;
    this.isTableCollapsed = true;
    this.isLeftCollapsed = false;
    this.isRightCollapsed = false;
    this.activeDatasetId = 'data_kebun_sawit_karet_f';
    this.activeCaseId = 1;
    this.activeMode = MODES.SCENARIO;
    this.storageRecoveryNotice = null;
    // Remove mixed, donated, and Case 3 datasets from catalogue
    this.catalogueItems = this.catalogueItems.filter(
      i => i.id !== 'data_campuran_1' && i.id !== 'data_kontribusi_mandiri' && i.id !== 'data_kehutanan_terpadu'
    );
    this.persist();
    this.notify();
  }
}
