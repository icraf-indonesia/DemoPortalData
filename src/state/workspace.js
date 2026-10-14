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
  SHARED_PLANTATION_CLASSES,
  CASE3_FORESTRY_CLASSES,
  CASE4_TARGET_CLASSES,
  REF_MOD_2B_SCHEMA,
  DATA_SAWAH_SCHEMA,
  DATA_HUTAN_SCHEMA,
  DATA_REF_MOD_F_SCHEMA
} from '../domain/taxonomy.js';
import { mapScreenSubmissionToCase4, mapPublicationObservationToCase4 } from '../features/review.js';
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
    this.publishedCollections = [];
    this.case2PublicationDraft = null;
    this.activeUser = 'user_a'; // 'user_a' or 'user_b'
    this.case2ScreenSubmissions = [];
    this.case2SamplingDraft = null;
    this.case3PrivateCollection = null;
    this.case4Reviews = [];
    this.case4Adoptions = [];
    this.case4Queue = [];
    this.case4Interpretations = {};
    this.isSamplingActive = false;
    this.isEoxBasemapActive = false;

    // Luma modeling and technical quality context (Cases 1 & 2)
    this.lumaContext = {
      activeModule: 'module7', // 'module6' (draft) or 'module7' (thematic accuracy verified)
      aoiName: 'Kabupaten Banyuasin',
      targetYear: 2026,
      sensor: 'Komposit Landsat 9 / Sentinel-2 (2026)',
      separabilityReport: {
        method: 'Jeffries-Matusita Distance (Modul 4)',
        pairs: [
          { pair: 'Karet vs Kelapa sawit', distance: 1.88, status: 'Baik (Dapat Dipisahkan)' },
          { pair: 'Karet vs Lainnya', distance: 1.94, status: 'Sangat Baik' },
          { pair: 'Kelapa sawit vs Lainnya', distance: 1.91, status: 'Sangat Baik' }
        ]
      },
      modelParams: {
        algorithm: 'Random Forest (Modul 6)',
        numTrees: 100,
        minSplit: 2,
        baggingFraction: 0.8,
        predictors: ['Blue', 'Green', 'Red', 'NIR', 'SWIR1', 'SWIR2', 'NDVI', 'NDRE']
      },
      thematicAccuracy: {
        method: 'Matriks Konfusi Sampel Uji Independen (Modul 7)',
        overallAccuracy: 89.2,
        kappa: 0.835,
        testSampleSize: 150,
        classes: [
          { classLabel: 'Karet', producerAccuracy: 87.5, userAccuracy: 89.1 },
          { classLabel: 'Kelapa sawit', producerAccuracy: 91.2, userAccuracy: 88.6 },
          { classLabel: 'Lainnya', producerAccuracy: 88.9, userAccuracy: 90.0 }
        ]
      }
    };

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
    if (!this.activeDatasetId) {
      return {};
    }
    if (
      this.activeDatasetId === 'data_kontribusi_mandiri' ||
      (this.case2DonatedCollection && this.activeDatasetId === this.case2DonatedCollection.meta.id) ||
      (this.publishedCollections || []).some(p => (p.meta && p.meta.id === this.activeDatasetId) || p.id === this.activeDatasetId)
    ) {
      return SHARED_PLANTATION_CLASSES;
    }
    if (this.activeDatasetId === 'data_ref_mod_2b') {
      return REF_MOD_2B_SCHEMA;
    }
    if (this.activeDatasetId === 'data_sawah') {
      return DATA_SAWAH_SCHEMA;
    }
    if (this.activeDatasetId === 'data_ref_mod_f') {
      return DATA_REF_MOD_F_SCHEMA;
    }
    if (this.activeDatasetId === 'case4_data_kombinasi_f') {
      return CASE4_TARGET_CLASSES;
    }
    if (this.activeDatasetId === 'data_hutan') {
      if (this.activeCaseId === 3 || this.activeUser === 'user_b') {
        return CASE3_FORESTRY_CLASSES;
      }
      return DATA_HUTAN_SCHEMA;
    }
    if (
      this.activeDatasetId === 'data_hutan_sawit_partisipatif' ||
      (this.case3PrivateCollection && this.activeDatasetId === this.case3PrivateCollection.meta.id)
    ) {
      return CASE3_FORESTRY_CLASSES;
    }
    if (
      this.activeDatasetId === 'data_kebun_sawit_karet_f' ||
      this.activeDatasetId === 'data_campuran_1'
    ) {
      return PROJECT_CLASSES;
    }
    if (this.activeCaseId === 4) {
      return CASE4_TARGET_CLASSES;
    }
    if (this.activeCaseId === 3 || this.activeUser === 'user_b') {
      return CASE3_FORESTRY_CLASSES;
    }
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
        if (Array.isArray(proj.publishedCollections)) {
          this.publishedCollections = proj.publishedCollections;
        }
        if (proj.case2DonatedCollection) {
          this.case2DonatedCollection = proj.case2DonatedCollection;
        } else if (this.publishedCollections.length > 0) {
          this.case2DonatedCollection = this.publishedCollections[0];
        }
        if (proj.case2PublicationDraft) {
          this.case2PublicationDraft = proj.case2PublicationDraft;
        }
        if (proj.activeUser) {
          this.activeUser = proj.activeUser;
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
        if (proj.lumaActiveModule && this.lumaContext) {
          this.lumaContext.activeModule = Number(proj.lumaActiveModule);
        }
      }
    } catch (err) {
      this.storageRecoveryNotice = `Perhatian: ${err.message}. Anda dapat mereset data penyimpanan lokal jika diperlukan.`;
    }
  }

  /**
   * Sets catalogue and manifest data.
   * Ensures private Data Campuran #1, donated/published collections, and Case 3 collections are included in catalogue if present.
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

    // Restore published/donated collections
    const pubs = this.publishedCollections.length > 0
      ? this.publishedCollections
      : (this.case2DonatedCollection ? [this.case2DonatedCollection] : []);

    for (const pub of pubs) {
      if (pub && pub.meta && !this.catalogueItems.some(i => i.id === pub.meta.id)) {
        this.catalogueItems.push({
          id: pub.meta.id,
          title: pub.meta.title,
          category: 'Koleksi Mitra',
          status: pub.meta.status || 'Mandiri / Belum Ditelaah',
          description: pub.meta.description,
          geojsonPath: null,
          isPrimary: false,
          isPrivate: false,
          isPublished: true,
          isDonated: true,
          featureCount: pub.records.length,
          institution: pub.meta.institution || 'ICRAF Indonesia',
          year: pub.meta.year || 2026,
          accountName: pub.meta.accountName || 'User A',
          crosswalk: pub.meta.crosswalk || null,
          sha256: null
        });
      }
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
   * @param {string|null} datasetId
   * @param {Object|null} meta
   * @param {Array<Object>} records
   */
  setActiveDataset(datasetId, meta, records, delta = 0) {
    this.activeDatasetId = datasetId;
    this.activeDatasetMeta = meta;
    this.activeRecords = records || [];
    this.classCounts = datasetId
      ? computeClassCounts(this.activeRecords, this.getActiveSchema())
      : { unmapped: 0, total: 0, sourceClasses: {} };
    this.selectedPointId = null;
    this.errorMessage = null;

    if (delta > 0) {
      this.lastDelta = delta;
    } else if (datasetId !== 'data_campuran_1' && datasetId !== 'data_kehutanan_terpadu') {
      this.lastDelta = 0;
    }

    if (datasetId) {
      const catItem = this.catalogueItems.find(i => i.id === datasetId);
      if (catItem) {
        if (meta && meta.featureCount !== undefined) catItem.featureCount = meta.featureCount;
        if (meta && meta.archiveFeatureCount !== undefined) catItem.archiveFeatureCount = meta.archiveFeatureCount;
      }
    }

    this.persist();
    this.notify();
  }

  /**
   * Clears the active dataset selection so no collection is active.
   */
  clearActiveDataset() {
    this.setActiveDataset(null, null, []);
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
   * Sets active user identity ('user_a' or 'user_b').
   * Isolates workspaces and switches active datasets cleanly.
   * @param {string} userId
   */
  setActiveUser(userId) {
    const nextUser = userId === 'user_b' ? 'user_b' : 'user_a';
    this.activeUser = nextUser;

    if (this.activeUser === 'user_b') {
      this.activeCaseId = 3;
      if (this.case3PrivateCollection) {
        this.setActiveDataset(
          this.case3PrivateCollection.meta.id,
          this.case3PrivateCollection.meta,
          this.case3PrivateCollection.records
        );
      } else {
        this.activeDatasetId = 'data_hutan';
      }
    } else {
      this.activeCaseId = 1;
      if (this.mixedDataset) {
        this.setActiveDataset(
          this.mixedDataset.meta.id,
          this.mixedDataset.meta,
          this.mixedDataset.records
        );
      } else {
        this.activeDatasetId = 'data_kebun_sawit_karet_f';
      }
    }

    this.saveProject();
    this.notify();
  }

  /**
   * Sets or clears persistent publication draft.
   * @param {Object|null} draft
   */
  setPublicationDraft(draft) {
    this.case2PublicationDraft = draft;
    this.saveProject();
    this.notify();
  }

  /**
   * Records an approved published collection from Case 2.
   * Handles storage failure honestly and returns operation status.
   * Automatically queues the 240 owned points into Case 4 review queue (idempotently).
   * @param {Object} collectionPackage
   * @returns {{ success: boolean, error?: string }}
   */
  setPublishedCollection(collectionPackage) {
    if (!collectionPackage || !collectionPackage.meta) {
      return { success: false, error: 'Paket publikasi tidak valid.' };
    }

    const existingPubIdx = this.publishedCollections.findIndex(p => p.meta.id === collectionPackage.meta.id);
    const nextPubs = [...this.publishedCollections];
    if (existingPubIdx >= 0) {
      nextPubs[existingPubIdx] = collectionPackage;
    } else {
      nextPubs.push(collectionPackage);
    }

    // Attempt persistence before mutating local state
    const saveRes = saveProjectState({
      mixedDataset: this.mixedDataset,
      lastDelta: this.lastDelta,
      case2DonatedCollection: collectionPackage,
      publishedCollections: nextPubs,
      case2PublicationDraft: this.case2PublicationDraft,
      activeUser: this.activeUser,
      case2ScreenSubmissions: this.case2ScreenSubmissions,
      case4Reviews: this.case4Reviews,
      case3PrivateCollection: this.case3PrivateCollection,
      case4Adoptions: this.case4Adoptions,
      case2SamplingDraft: this.case2SamplingDraft,
      case4Queue: this.case4Queue,
      case4Interpretations: this.case4Interpretations
    });

    if (!saveRes || !saveRes.success) {
      const err = (saveRes && saveRes.error) || 'Gagal menyimpan status proyek ke penyimpanan lokal.';
      this.lastProjectSaveError = err;
      this.storageStatus = {
        success: false,
        label: `${PERSISTENCE_LABELS.FAILED}: ${err}`,
        timestamp: null,
        error: err
      };
      this.notify();
      return { success: false, error: err };
    }

    // Persistence succeeded: commit state mutations
    this.case2DonatedCollection = collectionPackage;
    this.publishedCollections = nextPubs;

    const catItem = {
      id: collectionPackage.meta.id,
      title: collectionPackage.meta.title,
      category: 'Koleksi Mitra',
      status: collectionPackage.meta.status || 'Mandiri / Belum Ditelaah',
      description: collectionPackage.meta.description,
      geojsonPath: null,
      isPrimary: false,
      isPrivate: false,
      isPublished: true,
      isDonated: true,
      featureCount: collectionPackage.records.length,
      institution: collectionPackage.meta.institution || 'ICRAF Indonesia',
      year: collectionPackage.meta.year || 2026,
      accountName: collectionPackage.meta.accountName || 'User A',
      crosswalk: collectionPackage.meta.crosswalk || null,
      sha256: null
    };

    const existingIdx = this.catalogueItems.findIndex(i => i.id === collectionPackage.meta.id);
    if (existingIdx >= 0) {
      this.catalogueItems[existingIdx] = catItem;
    } else {
      this.catalogueItems.push(catItem);
    }

    // Queue 240 owned points into Case 4 review queue exactly once (idempotently)
    for (const record of collectionPackage.records) {
      if (
        record.project_class_id === 3 ||
        record.source_dataset_id === 'data_ref_mod_2b' ||
        String(record.dataset_archive || '').includes('2b_Modular')
      ) {
        continue;
      }

      const mapped = mapPublicationObservationToCase4(record);
      const existingQueueIdx = this.case4Queue.findIndex(q => q.observation_id === mapped.observation_id);
      if (existingQueueIdx >= 0) {
        this.case4Queue[existingQueueIdx] = {
          ...mapped,
          ...this.case4Queue[existingQueueIdx]
        };
      } else {
        this.case4Queue.push(mapped);
      }
    }

    this.case2PublicationDraft = null;
    this.saveProject();
    this.notify();
    return { success: true };
  }

  /**
   * Records a donated collection from Case 2 (backward-compatible alias).
   * @param {Object} collectionPackage
   */
  setDonatedCollection(collectionPackage) {
    this.setPublishedCollection(collectionPackage);
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
   * Updates the active Luma module context (Module 6: Draf Pra-Klasifikasi, Module 7: Tervalidasi Akurasi Tematik).
   * @param {number|string} moduleId
   */
  setLumaActiveModule(moduleId) {
    const mod = Number(moduleId);
    if (mod === 6 || mod === 7) {
      if (!this.lumaContext) {
        this.lumaContext = {};
      }
      this.lumaContext.activeModule = mod;
      this.saveProject();
      this.notify();
    }
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
      publishedCollections: this.publishedCollections,
      case2PublicationDraft: this.case2PublicationDraft,
      activeUser: this.activeUser,
      case2ScreenSubmissions: this.case2ScreenSubmissions,
      case4Reviews: this.case4Reviews,
      case3PrivateCollection: this.case3PrivateCollection,
      case4Adoptions: this.case4Adoptions,
      case2SamplingDraft: this.case2SamplingDraft,
      case4Queue: this.case4Queue,
      case4Interpretations: this.case4Interpretations,
      lumaActiveModule: this.lumaContext ? this.lumaContext.activeModule : 7
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
    this.publishedCollections = [];
    this.case2PublicationDraft = null;
    this.activeUser = 'user_a';
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
