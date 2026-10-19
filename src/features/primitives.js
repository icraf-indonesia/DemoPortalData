/**
 * src/features/primitives.js
 * Implementation of Primitives Extraction and Preview for Case 2 ("Bagikan Data").
 * 
 * Provides:
 * - Loading and caching of pre-calculated primitives from Banyuasin_datarefmod_Case2b.
 * - Commodity-based extraction mapping (Kebun sawit samples -> palm, Kebun karet samples -> rubber).
 * - Editable state model for Keberadaan Air (waterbody_), Keberadaan Pohon (tree_domin), and Tinggi Tajuk (vegetation).
 */

import { loadJsonResource } from '../data/source-adapters.js';

// Fallback representative sample rows from Banyuasin_datarefmod_Case2b
export const DEFAULT_PRIMITIVES_SAMPLES = Object.freeze({
  sawit: [
    { sample_id: 69, LULCrcl: 'Kebun sawit', waterbody_: 1, tree_domin: 0, vegetation: 10 },
    { sample_id: 325, LULCrcl: 'Kebun sawit', waterbody_: 0, tree_domin: 1, vegetation: 9 },
    { sample_id: 333, LULCrcl: 'Kebun sawit', waterbody_: 0, tree_domin: 1, vegetation: 6 },
    { sample_id: 337, LULCrcl: 'Kebun sawit', waterbody_: 0, tree_domin: 1, vegetation: 9 },
    { sample_id: 414, LULCrcl: 'Kebun sawit', waterbody_: 0, tree_domin: 1, vegetation: 12 },
    { sample_id: 416, LULCrcl: 'Kebun sawit', waterbody_: 0, tree_domin: 0, vegetation: 16 },
    { sample_id: 417, LULCrcl: 'Kebun sawit', waterbody_: 0, tree_domin: 1, vegetation: 15 },
    { sample_id: 418, LULCrcl: 'Kebun sawit', waterbody_: 0, tree_domin: 1, vegetation: 11 },
    { sample_id: 419, LULCrcl: 'Kebun sawit', waterbody_: 0, tree_domin: 1, vegetation: 15 },
    { sample_id: 458, LULCrcl: 'Kebun sawit', waterbody_: 0, tree_domin: 1, vegetation: 12 }
  ],
  karet: [
    { sample_id: 181, LULCrcl: 'Kebun karet', waterbody_: 0, tree_domin: 1, vegetation: 37 },
    { sample_id: 310, LULCrcl: 'Kebun karet', waterbody_: 0, tree_domin: 1, vegetation: 16 },
    { sample_id: 312, LULCrcl: 'Kebun karet', waterbody_: 0, tree_domin: 1, vegetation: 16 },
    { sample_id: 313, LULCrcl: 'Kebun karet', waterbody_: 0, tree_domin: 0, vegetation: 14 },
    { sample_id: 366, LULCrcl: 'Kebun karet', waterbody_: 0, tree_domin: 1, vegetation: 13 },
    { sample_id: 369, LULCrcl: 'Kebun karet', waterbody_: 0, tree_domin: 0, vegetation: 13 },
    { sample_id: 371, LULCrcl: 'Kebun karet', waterbody_: 0, tree_domin: 1, vegetation: 11 },
    { sample_id: 437, LULCrcl: 'Kebun karet', waterbody_: 0, tree_domin: 0, vegetation: 11 },
    { sample_id: 662, LULCrcl: 'Kebun karet', waterbody_: 0, tree_domin: 1, vegetation: 18 },
    { sample_id: 663, LULCrcl: 'Kebun karet', waterbody_: 0, tree_domin: 1, vegetation: 16 }
  ]
});

let cachedPrimitivesReference = null;

/**
 * Loads the reference primitives dataset from JSON.
 * @param {string} [jsonPath]
 * @returns {Promise<Array<Object>>}
 */
export async function loadPrimitivesReference(jsonPath = 'data/primitives/primitives_case2b.json') {
  if (cachedPrimitivesReference && cachedPrimitivesReference.length > 0) {
    return cachedPrimitivesReference;
  }

  try {
    const data = await loadJsonResource(jsonPath);
    if (Array.isArray(data) && data.length > 0) {
      cachedPrimitivesReference = data;
      return cachedPrimitivesReference;
    }
  } catch (err) {
    // Graceful fallback to default samples if file not available over fetch
  }

  cachedPrimitivesReference = [
    ...DEFAULT_PRIMITIVES_SAMPLES.sawit,
    ...DEFAULT_PRIMITIVES_SAMPLES.karet
  ];
  return cachedPrimitivesReference;
}

/**
 * Maps and extracts primitive components for a set of owned records.
 * Uses commodity-based matching against the primitives reference.
 * 
 * @param {Array<Object>} ownedRecords
 * @param {Array<Object>} [referenceRows]
 * @returns {Array<Object>} Extracted primitive view models
 */
export function extractPrimitivesForRecords(ownedRecords = [], referenceRows = null) {
  const rows = Array.isArray(referenceRows) && referenceRows.length > 0
    ? referenceRows
    : (cachedPrimitivesReference || [...DEFAULT_PRIMITIVES_SAMPLES.sawit, ...DEFAULT_PRIMITIVES_SAMPLES.karet]);

  const sawitSamples = rows.filter(r => r.LULCrcl === 'Kebun sawit');
  const karetSamples = rows.filter(r => r.LULCrcl === 'Kebun karet');

  const safeSawit = sawitSamples.length > 0 ? sawitSamples : DEFAULT_PRIMITIVES_SAMPLES.sawit;
  const safeKaret = karetSamples.length > 0 ? karetSamples : DEFAULT_PRIMITIVES_SAMPLES.karet;

  let sawitIndex = 0;
  let karetIndex = 0;

  return ownedRecords.map((r, idx) => {
    const rawLabel = String(r.project_class_label || r.source_class_label || '').toLowerCase();
    const isKaret = rawLabel.includes('karet') || r.project_class_id === 2;
    const classLabel = isKaret ? 'Kebun karet' : 'Kebun sawit';

    const sample = isKaret
      ? safeKaret[karetIndex++ % safeKaret.length]
      : safeSawit[sawitIndex++ % safeSawit.length];

    const waterbody = Number(sample.waterbody_) === 1 ? 1 : 0;
    const treeDominance = Number(sample.tree_domin) === 1 ? 1 : 0;
    const vegetationHeight = typeof sample.vegetation === 'number' && !isNaN(sample.vegetation)
      ? Math.max(0, Math.min(50, Math.round(sample.vegetation)))
      : (isKaret ? 15 : 10);

    return {
      observation_id: r.observation_id || `obs_${String(idx + 1).padStart(6, '0')}`,
      classLabel,
      waterbody,           // 1 = 'Ada', 0 = 'Tidak Ada'
      tree_dominance: treeDominance, // 1 = 'Ada', 0 = 'Tidak Ada'
      vegetation_height: vegetationHeight, // number (m)
      record: r
    };
  });
}
