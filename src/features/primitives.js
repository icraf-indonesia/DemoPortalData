/**
 * src/features/primitives.js
 * Implementation of Primitives Extraction, Derivation, and Preview for Portal Data Epistem.
 * 
 * Provides:
 * - Loading and caching of pre-calculated primitives from Banyuasin_datarefmod_Case2b.
 * - Universal primitive derivation for all datasets across all cases (Air, Pohon, Tinggi Tajuk).
 * - Commodity-based extraction mapping for Case 2 ("Bagikan Data").
 * - Editable state model for Keberadaan Air (waterbody_), Keberadaan Pohon (tree_domin), and Tinggi Tajuk (vegetation).
 */

import { loadJsonResource } from '../data/source-adapters.js';

// Fallback representative sample rows from Banyuasin_datarefmod_Case2b for all 5 classes
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
  ],
  hutan: [
    { sample_id: 7, LULCrcl: 'Hutan', waterbody_: 0, tree_domin: 1, vegetation: 20 },
    { sample_id: 24, LULCrcl: 'Hutan', waterbody_: 0, tree_domin: 1, vegetation: 12 },
    { sample_id: 52, LULCrcl: 'Hutan', waterbody_: 0, tree_domin: 0, vegetation: 5 },
    { sample_id: 58, LULCrcl: 'Hutan', waterbody_: 0, tree_domin: 0, vegetation: 19 },
    { sample_id: 112, LULCrcl: 'Hutan', waterbody_: 1, tree_domin: 0, vegetation: 15 },
    { sample_id: 140, LULCrcl: 'Hutan', waterbody_: 0, tree_domin: 1, vegetation: 21 },
    { sample_id: 163, LULCrcl: 'Hutan', waterbody_: 0, tree_domin: 1, vegetation: 30 },
    { sample_id: 164, LULCrcl: 'Hutan', waterbody_: 0, tree_domin: 1, vegetation: 40 },
    { sample_id: 165, LULCrcl: 'Hutan', waterbody_: 0, tree_domin: 1, vegetation: 38 },
    { sample_id: 166, LULCrcl: 'Hutan', waterbody_: 0, tree_domin: 1, vegetation: 34 }
  ],
  sawah: [
    { sample_id: 38, LULCrcl: 'Sawah', waterbody_: 1, tree_domin: 0, vegetation: 9 },
    { sample_id: 40, LULCrcl: 'Sawah', waterbody_: 1, tree_domin: 0, vegetation: 14 },
    { sample_id: 41, LULCrcl: 'Sawah', waterbody_: 0, tree_domin: 0, vegetation: 5 },
    { sample_id: 46, LULCrcl: 'Sawah', waterbody_: 0, tree_domin: 0, vegetation: 6 },
    { sample_id: 47, LULCrcl: 'Sawah', waterbody_: 0, tree_domin: 1, vegetation: 9 },
    { sample_id: 49, LULCrcl: 'Sawah', waterbody_: 0, tree_domin: 1, vegetation: 6 },
    { sample_id: 51, LULCrcl: 'Sawah', waterbody_: 1, tree_domin: 0, vegetation: 5 },
    { sample_id: 53, LULCrcl: 'Sawah', waterbody_: 1, tree_domin: 0, vegetation: 10 },
    { sample_id: 56, LULCrcl: 'Sawah', waterbody_: 0, tree_domin: 1, vegetation: 13 },
    { sample_id: 57, LULCrcl: 'Sawah', waterbody_: 1, tree_domin: 0, vegetation: 10 }
  ],
  lainnya: [
    { sample_id: 1, LULCrcl: 'Lainnya', waterbody_: 0, tree_domin: 1, vegetation: 11 },
    { sample_id: 2, LULCrcl: 'Lainnya', waterbody_: 0, tree_domin: 1, vegetation: 20 },
    { sample_id: 3, LULCrcl: 'Lainnya', waterbody_: 0, tree_domin: 1, vegetation: 13 },
    { sample_id: 4, LULCrcl: 'Lainnya', waterbody_: 0, tree_domin: 1, vegetation: 18 },
    { sample_id: 5, LULCrcl: 'Lainnya', waterbody_: 0, tree_domin: 1, vegetation: 10 },
    { sample_id: 6, LULCrcl: 'Lainnya', waterbody_: 0, tree_domin: 1, vegetation: 19 },
    { sample_id: 8, LULCrcl: 'Lainnya', waterbody_: 0, tree_domin: 1, vegetation: 15 },
    { sample_id: 9, LULCrcl: 'Lainnya', waterbody_: 0, tree_domin: 1, vegetation: 10 },
    { sample_id: 10, LULCrcl: 'Lainnya', waterbody_: 0, tree_domin: 1, vegetation: 13 },
    { sample_id: 11, LULCrcl: 'Lainnya', waterbody_: 0, tree_domin: 1, vegetation: 19 }
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
    ...DEFAULT_PRIMITIVES_SAMPLES.karet,
    ...DEFAULT_PRIMITIVES_SAMPLES.hutan,
    ...DEFAULT_PRIMITIVES_SAMPLES.sawah,
    ...DEFAULT_PRIMITIVES_SAMPLES.lainnya
  ];
  return cachedPrimitivesReference;
}

/**
 * Derives the 3 primitive components for an observation record across any dataset.
 * - Keberadaan Air (waterbody: 1 = 'Ada', 0 = 'Tidak Ada')
 * - Keberadaan Pohon (tree_dominance: 1 = 'Ada', 0 = 'Tidak Ada')
 * - Tinggi Tajuk (vegetation_height: number in meters)
 * 
 * @param {Object} record
 * @param {Array<Object>} [referenceRows]
 * @returns {{ waterbody: number, tree_dominance: number, vegetation_height: number }}
 */
export function derivePrimitivesForRecord(record, referenceRows = null) {
  if (!record) {
    return { waterbody: 0, tree_dominance: 0, vegetation_height: 0 };
  }

  // 1. If explicitly attached on the record or publication metadata
  if (record.primitives && typeof record.primitives === 'object') {
    return {
      waterbody: Number(record.primitives.waterbody) === 1 ? 1 : 0,
      tree_dominance: Number(record.primitives.tree_dominance) === 1 ? 1 : 0,
      vegetation_height: Number.isFinite(Number(record.primitives.vegetation_height))
        ? Math.round(Number(record.primitives.vegetation_height))
        : 0
    };
  }

  // 2. If present in raw_attributes or raw_properties (e.g. native 2b or shapefile)
  const raw = record.raw_attributes || record.raw_properties || {};
  if (raw.waterbody_ !== undefined && raw.tree_domin !== undefined) {
    return {
      waterbody: Number(raw.waterbody_) === 1 ? 1 : 0,
      tree_dominance: Number(raw.tree_domin) === 1 ? 1 : 0,
      vegetation_height: Number.isFinite(Number(raw.vegetation))
        ? Math.round(Number(raw.vegetation))
        : (Number.isFinite(Number(raw.z_coordinate)) ? Math.round(Number(raw.z_coordinate)) : 0)
    };
  }

  // 3. Derive based on class and z_coordinate
  const rawLabel = String(
    record.project_class_label ||
    record.source_class_label ||
    raw.LULC ||
    raw.LULCrcl ||
    ''
  ).toLowerCase();

  let classKey = 'lainnya';
  if (rawLabel.includes('sawit') || record.project_class_id === 1) {
    classKey = 'sawit';
  } else if (rawLabel.includes('karet') || record.project_class_id === 2) {
    classKey = 'karet';
  } else if (rawLabel.includes('hutan') || record.project_class_id === 3 || record.project_class_id === 4) {
    classKey = 'hutan';
  } else if (rawLabel.includes('sawah') || record.project_class_id === 5) {
    classKey = 'sawah';
  }

  const rows = Array.isArray(referenceRows) && referenceRows.length > 0
    ? referenceRows
    : (cachedPrimitivesReference || [
        ...DEFAULT_PRIMITIVES_SAMPLES.sawit,
        ...DEFAULT_PRIMITIVES_SAMPLES.karet,
        ...DEFAULT_PRIMITIVES_SAMPLES.hutan,
        ...DEFAULT_PRIMITIVES_SAMPLES.sawah,
        ...DEFAULT_PRIMITIVES_SAMPLES.lainnya
      ]);

  const targetLabel = classKey === 'sawit' ? 'Kebun sawit'
    : classKey === 'karet' ? 'Kebun karet'
    : classKey === 'hutan' ? 'Hutan'
    : classKey === 'sawah' ? 'Sawah'
    : 'Lainnya';

  const classSamples = rows.filter(r => r.LULCrcl === targetLabel);
  const samplePool = classSamples.length > 0 ? classSamples : DEFAULT_PRIMITIVES_SAMPLES[classKey];

  // Deterministic sample selection using observation_id or source_record_index
  const idStr = String(record.observation_id || record.source_record_index || '0');
  let hash = 0;
  for (let i = 0; i < idStr.length; i++) {
    hash = ((hash << 5) - hash) + idStr.charCodeAt(i);
    hash |= 0;
  }
  const sampleIdx = Math.abs(hash) % samplePool.length;
  const sample = samplePool[sampleIdx];

  const waterbody = Number(sample.waterbody_) === 1 ? 1 : 0;
  const treeDominance = Number(sample.tree_domin) === 1 ? 1 : 0;

  // Use raw z_coordinate if available, else sample vegetation
  let vegHeight = 0;
  if (raw.z_coordinate !== undefined && Number.isFinite(Number(raw.z_coordinate))) {
    vegHeight = Math.max(0, Math.round(Number(raw.z_coordinate)));
  } else if (sample.vegetation !== undefined && Number.isFinite(Number(sample.vegetation))) {
    vegHeight = Math.max(0, Math.round(Number(sample.vegetation)));
  } else {
    vegHeight = classKey === 'hutan' ? 25 : classKey === 'karet' ? 15 : classKey === 'sawit' ? 10 : classKey === 'sawah' ? 2 : 5;
  }

  return {
    waterbody,
    tree_dominance: treeDominance,
    vegetation_height: vegHeight
  };
}

/**
 * Maps and extracts primitive components for a set of owned records in Case 2 contribution.
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
