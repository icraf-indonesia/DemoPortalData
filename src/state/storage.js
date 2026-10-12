/**
 * src/state/storage.js
 * Browser local storage persistence for user preferences and active project state.
 * 
 * Invariants:
 * - Persists workspace preferences and local private dataset state separately from source data.
 * - Acknowledges successful storage with exact label: "Tersimpan di browser ini".
 * - Honest failure reporting: never claims saved when storage fails, is corrupted, or is blocked.
 * - Corrupted local storage is detected and actionable.
 */

export const STORAGE_KEY = 'portal_epistem_workspace_prefs_v1';
export const PROJECT_STORAGE_KEY = 'portal_epistem_project_state_v1';

export const PERSISTENCE_LABELS = Object.freeze({
  SAVED: 'Tersimpan di browser ini',
  SAVING: 'Menyimpan preferensi...',
  FAILED: 'Gagal menyimpan ke penyimpanan lokal',
  NOT_STORED: 'Belum disimpan'
});

/**
 * Saves workspace preferences to localStorage.
 * @param {Object} preferences { activeDatasetId, isTableCollapsed, activeMode, activeCaseId }
 * @returns {{ success: boolean, label: string, timestamp: string|null, error: string|null }}
 */
export function savePreferences(preferences) {
  const payload = {
    activeDatasetId: preferences.activeDatasetId || 'data_kebun_sawit_karet_f',
    isTableCollapsed: typeof preferences.isTableCollapsed === 'boolean' ? preferences.isTableCollapsed : true,
    isLeftCollapsed: typeof preferences.isLeftCollapsed === 'boolean' ? preferences.isLeftCollapsed : false,
    isRightCollapsed: typeof preferences.isRightCollapsed === 'boolean' ? preferences.isRightCollapsed : false,
    updatedAt: new Date().toISOString()
  };
  if (preferences.activeMode) payload.activeMode = preferences.activeMode;
  if (preferences.activeCaseId) payload.activeCaseId = preferences.activeCaseId;

  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      throw new Error('Penyimpanan lokal (localStorage) tidak tersedia di lingkungan ini.');
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    return {
      success: true,
      label: PERSISTENCE_LABELS.SAVED,
      timestamp: payload.updatedAt,
      error: null
    };
  } catch (err) {
    const errorMsg = err && err.message ? err.message : String(err);
    return {
      success: false,
      label: `${PERSISTENCE_LABELS.FAILED}: ${errorMsg}`,
      timestamp: null,
      error: errorMsg
    };
  }
}

/**
 * Loads persisted workspace preferences from localStorage.
 * Detects corruption and throws actionable error if unparseable.
 * @returns {Object|null} Persisted preferences or null
 */
export function loadPreferences() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return null;
    }
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const result = {
      activeDatasetId: typeof parsed.activeDatasetId === 'string' ? parsed.activeDatasetId : 'data_kebun_sawit_karet_f',
      isTableCollapsed: typeof parsed.isTableCollapsed === 'boolean' ? parsed.isTableCollapsed : true,
      isLeftCollapsed: typeof parsed.isLeftCollapsed === 'boolean' ? parsed.isLeftCollapsed : false,
      isRightCollapsed: typeof parsed.isRightCollapsed === 'boolean' ? parsed.isRightCollapsed : false
    };
    if (parsed.activeMode) result.activeMode = parsed.activeMode;
    if (parsed.activeCaseId) result.activeCaseId = parsed.activeCaseId;
    return result;
  } catch (err) {
    console.warn('Gagal memuat preferensi dari localStorage (mungkin korup):', err);
    throw new Error(`Data penyimpanan preferensi di peramban rusak: ${err.message}`);
  }
}

/**
 * Saves private project state (e.g. Data Campuran #1 records and delta).
 * @param {Object} state
 * @returns {{ success: boolean, timestamp: string|null, error: string|null }}
 */
export function saveProjectState(state) {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      throw new Error('Penyimpanan lokal tidak tersedia.');
    }
    const payload = {
      mixedDataset: state.mixedDataset || null,
      lastDelta: state.lastDelta || 0,
      case2DonatedCollection: state.case2DonatedCollection || null,
      publishedCollections: Array.isArray(state.publishedCollections)
        ? state.publishedCollections
        : (state.case2DonatedCollection ? [state.case2DonatedCollection] : []),
      case2PublicationDraft: state.case2PublicationDraft || null,
      activeUser: state.activeUser || 'user_a',
      case2ScreenSubmissions: Array.isArray(state.case2ScreenSubmissions) ? state.case2ScreenSubmissions : [],
      case4Reviews: Array.isArray(state.case4Reviews) ? state.case4Reviews : [],
      case3PrivateCollection: state.case3PrivateCollection || null,
      case4Adoptions: Array.isArray(state.case4Adoptions) ? state.case4Adoptions : [],
      case2SamplingDraft: state.case2SamplingDraft || null,
      case4Queue: Array.isArray(state.case4Queue) ? state.case4Queue : [],
      case4Interpretations: state.case4Interpretations || null,
      updatedAt: new Date().toISOString()
    };
    window.localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(payload));
    return { success: true, timestamp: payload.updatedAt, error: null };
  } catch (err) {
    return { success: false, timestamp: null, error: err.message };
  }
}

/**
 * Loads private project state.
 * @returns {Object|null}
 */
export function loadProjectState() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return null;
    }
    const raw = window.localStorage.getItem(PROJECT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      if (parsed.case2ScreenSubmissions !== undefined && parsed.case2ScreenSubmissions !== null && !Array.isArray(parsed.case2ScreenSubmissions)) {
        throw new Error('Struktur data proyek rusak: case2ScreenSubmissions bukan array');
      }
      if (parsed.case4Reviews !== undefined && parsed.case4Reviews !== null && !Array.isArray(parsed.case4Reviews)) {
        throw new Error('Struktur data proyek rusak: case4Reviews bukan array');
      }
      if (parsed.case4Adoptions !== undefined && parsed.case4Adoptions !== null && !Array.isArray(parsed.case4Adoptions)) {
        throw new Error('Struktur data proyek rusak: case4Adoptions bukan array');
      }
      if (parsed.publishedCollections !== undefined && parsed.publishedCollections !== null && !Array.isArray(parsed.publishedCollections)) {
        throw new Error('Struktur data proyek rusak: publishedCollections bukan array');
      }
    } else {
      throw new Error('Struktur data proyek rusak: payload bukan objek');
    }
    return parsed;
  } catch (err) {
    console.warn('Gagal memuat status proyek dari localStorage:', err);
    throw new Error(`Data proyek tersimpan di peramban rusak: ${err.message}`);
  }
}

/**
 * Clears stored preferences and project state (reset recovery).
 */
export function clearPreferences() {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(STORAGE_KEY);
      window.localStorage.removeItem(PROJECT_STORAGE_KEY);
    }
  } catch (err) {
    console.warn('Gagal membersihkan localStorage:', err);
  }
}
