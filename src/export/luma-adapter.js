/**
 * src/export/luma-adapter.js
 * Generates export packages conforming to Luma receiver requirements and contract invariants.
 * Produces ZIP package containing:
 * - training_points.shp, .shx, .dbf, .prj, .cpg (ESRI Point Shapefile with numeric class_id first)
 * - training_points.csv (Companion table)
 * - training_points.geojson (Companion vector layer)
 * - manifest.json (Lineage, assumptions, and receiver_verification: untested)
 * 
 * Uses vendored JSZip distribution.
 */

import { generatePointShapefile } from './shapefile.js';
import { buildExportManifest } from './manifest.js';
import { getScenarioOverlay, MODES } from '../demo/scenarios.js';

/**
 * Resolves the JSZip constructor in both Browser and Node.js environments.
 * @returns {Promise<any>}
 */
export async function getJSZip() {
  if (typeof window !== 'undefined' && window.JSZip) {
    return window.JSZip;
  }
  // Try importing vendored JSZip in Node or browser module
  try {
    const mod = await import('../../vendor/jszip/jszip.min.js');
    return mod.default || mod;
  } catch (err) {
    // Fallback for Node test runner
    if (typeof process !== 'undefined') {
      const { createRequire } = await import('node:module');
      const require = createRequire(import.meta.url);
      return require('../../vendor/jszip/jszip.min.js');
    }
    throw new Error('JSZip tidak tersedia untuk membuat berkas ZIP.');
  }
}

/**
 * Validates export records strictly at the export boundary.
 * Rejects unmapped project classes (null/undefined), fractional classes, unsupported classes,
 * duplicate IDs, missing IDs, and invalid/out-of-range coordinates.
 * Never silently invents fallback class (3/Lainnya) or default coordinates ([0,0]).
 * @param {Array<Object>} records
 * @param {Array<Object>} [targetClasses]
 */
export function validateExportRecords(records, targetClasses = null) {
  if (!Array.isArray(records)) {
    throw new Error('Daftar observasi untuk ekspor harus berupa array.');
  }

  const allowedClasses = Array.isArray(targetClasses) && targetClasses.length > 0
    ? new Set(targetClasses.map(c => Number(c.class_id ?? c.id)))
    : null;

  const seenIds = new Set();

  for (let i = 0; i < records.length; i++) {
    const pt = records[i];
    if (!pt || typeof pt !== 'object') {
      throw new Error(`Observasi pada indeks ${i} tidak valid.`);
    }

    const id = pt.observation_id;
    if (!id || typeof id !== 'string' || !id.trim()) {
      throw new Error(`Observasi pada indeks ${i} tidak memiliki observation_id yang valid.`);
    }

    if (seenIds.has(id)) {
      throw new Error(`Observasi dengan ID "${id}" duplikat dalam paket ekspor.`);
    }
    seenIds.add(id);

    // 1. Strict validation of project_class_id: reject null, undefined, NaN, fractional, out of target schema
    if (pt.project_class_id === null || pt.project_class_id === undefined) {
      throw new Error(`Observasi "${id}" memiliki kelas proyek yang belum terpetakan (null). Ekspor menolak record tanpa kelas target proyek yang valid.`);
    }
    const numClass = Number(pt.project_class_id);
    if (!Number.isInteger(numClass) || numClass <= 0) {
      throw new Error(`Observasi "${id}" memiliki kelas proyek tidak valid (${pt.project_class_id}). Kelas target harus berupa bilangan bulat positif.`);
    }

    if (allowedClasses) {
      if (!allowedClasses.has(numClass)) {
        throw new Error(`Observasi "${id}" memiliki kelas target (${numClass}) yang tidak didukung dalam skema ekspor.`);
      }
    } else {
      // Default schema boundary check
      const isCase4 = records.some(r => r.source_schema_id === 'schema_case4_lulc' || r.source_schema_id === 'schema_case4' || r.source_schema_id === 'schema_case4_kombinasi');
      const maxClass = isCase4 ? 5 : 3;
      if (numClass > maxClass) {
        throw new Error(`Observasi "${id}" memiliki kelas target (${numClass}) yang tidak didukung (maksimum kelas: ${maxClass}).`);
      }
    }

    // 2. Strict validation of Point geometry and coordinates: reject missing, non-array, non-finite, out of range
    if (!pt.geometry || pt.geometry.type !== 'Point' || !Array.isArray(pt.geometry.coordinates) || pt.geometry.coordinates.length < 2) {
      throw new Error(`Observasi "${id}" tidak memiliki geometri Point yang valid.`);
    }
    const [lon, lat] = pt.geometry.coordinates;
    if (typeof lon !== 'number' || typeof lat !== 'number' || !Number.isFinite(lon) || !Number.isFinite(lat)) {
      throw new Error(`Observasi "${id}" memiliki koordinat non-finit [${lon}, ${lat}]. Ekspor menolak koordinat tidak valid.`);
    }

    if (lon < -180 || lon > 180 || lat < -90 || lat > 90) {
      throw new Error(`Observasi "${id}" memiliki koordinat di luar rentang valid [-180..180, -90..90]: [${lon}, ${lat}].`);
    }
  }
}

/**
 * Builds CSV string representation of points.
 * Explicitly separates raw source metadata from scenario overlay values.
 * @param {Array<Object>} points
 * @param {string} mode
 * @returns {string}
 */
export function buildCsv(points, mode = MODES.SCENARIO) {
  validateExportRecords(points);

  const headers = [
    'observation_id',
    'class_id',
    'class_name',
    'source_dataset_id',
    'source_class_id',
    'source_class_label',
    'longitude',
    'latitude',
    'source_observed_year',
    'source_rights_status',
    'source_method',
    'scenario_observed_year',
    'scenario_rights_status',
    'is_scenario_assumption'
  ];

  const escapeCsv = (val) => {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const rows = [headers.join(',')];

  for (const pt of points) {
    const coords = pt.geometry.coordinates;
    const overlay = mode === MODES.SCENARIO ? getScenarioOverlay(pt.dataset_archive || 'unknown', pt) : null;
    const isScenario = overlay && overlay.isScenarioOverlay ? 'true' : 'false';

    rows.push([
      escapeCsv(pt.observation_id),
      escapeCsv(pt.project_class_id),
      escapeCsv(pt.project_class_label),
      escapeCsv(pt.dataset_archive),
      escapeCsv(pt.source_class_id),
      escapeCsv(pt.source_class_label),
      coords[0],
      coords[1],
      escapeCsv(pt.observed_time?.year ?? ''),
      escapeCsv(pt.rights_id ?? ''),
      escapeCsv(pt.method ?? 'unknown'),
      escapeCsv(mode === MODES.SCENARIO ? (overlay?.observedYear ?? '') : ''),
      escapeCsv(mode === MODES.SCENARIO ? (overlay?.rightsStatus ?? '') : ''),
      isScenario
    ].join(','));
  }

  return rows.join('\r\n');
}

/**
 * Builds GeoJSON FeatureCollection representation of points.
 * Preserves raw source attributes distinctly from scenario overlay assumptions.
 * @param {Array<Object>} points
 * @param {string} mode
 * @returns {Object}
 */
export function buildGeoJson(points, mode = MODES.SCENARIO) {
  validateExportRecords(points);

  return {
    type: 'FeatureCollection',
    features: points.map(pt => {
      const overlay = mode === MODES.SCENARIO ? getScenarioOverlay(pt.dataset_archive || 'unknown', pt) : null;
      return {
        type: 'Feature',
        id: pt.observation_id,
        geometry: {
          type: 'Point',
          coordinates: [Number(pt.geometry.coordinates[0]), Number(pt.geometry.coordinates[1])]
        },
        properties: {
          observation_id: pt.observation_id,
          class_id: Number(pt.project_class_id),
          class_name: pt.project_class_label,
          quality_tier: pt.quality_tier ?? null,
          review_status: pt.review_status ?? null,
          adopted_by: pt.adopted_event?.adopted_by ?? null,
          adoption_reason: pt.adopted_event?.reason ?? null,
          adopted_at: pt.adopted_event?.adopted_at ?? null,
          adopted_event: pt.adopted_event ?? null,
          source_dataset_id: pt.dataset_archive,
          source_class_id: pt.source_class_id,
          source_class_label: pt.source_class_label,
          source_observed_year: pt.observed_time?.year ?? null,
          source_rights_status: pt.rights_id ?? null,
          source_method: pt.method ?? 'unknown',
          waterbody_dominance: pt.primitives ? pt.primitives.waterbody : (pt.raw_properties?.waterbody_ ?? null),
          tree_dominance: pt.primitives ? pt.primitives.tree_dominance : (pt.raw_properties?.tree_domin ?? null),
          vegetation_height: pt.primitives ? pt.primitives.vegetation_height : (pt.raw_properties?.vegetation ?? null),
          scenario_observed_year: mode === MODES.SCENARIO ? (overlay?.observedYear ?? null) : null,
          scenario_rights_status: mode === MODES.SCENARIO ? (overlay?.rightsStatus ?? null) : null,
          is_scenario_assumption: Boolean(mode === MODES.SCENARIO && overlay?.isScenarioOverlay)
        }
      };
    })
  };
}

/**
 * Builds classes.csv companion table with ID, Land Cover Class, and Color.
 * Exactly matches Luma taxonomy import format:
 * ID,Land Cover Class,Color
 * @param {Array<Object>} [targetClasses]
 * @param {Array<Object>} [records]
 * @returns {string}
 */
export function buildClassesCsv(targetClasses = null, records = []) {
  const headers = ['ID', 'Land Cover Class', 'Color'];
  const rows = [headers.join(',')];

  const DEFAULT_COLORS = {
    1: '#D81C5C',
    2: '#761C97',
    3: '#6E6E6E',
    4: '#2E7D32',
    5: '#6E6E6E'
  };

  let classes = Array.isArray(targetClasses) && targetClasses.length > 0
    ? [...targetClasses]
    : null;

  if (!classes && Array.isArray(records) && records.length > 0) {
    const classMap = new Map();
    for (const r of records) {
      const id = Number(r.project_class_id);
      const label = String(r.project_class_label || `Kelas ${id}`);
      if (!classMap.has(id)) {
        classMap.set(id, { id, label, colour: DEFAULT_COLORS[id] || '#6E6E6E' });
      }
    }
    classes = Array.from(classMap.values()).sort((a, b) => a.id - b.id);
  }

  if (Array.isArray(classes)) {
    for (const c of classes) {
      const id = c.id ?? c.class_id;
      const label = c.label ?? c.class_name;
      const colour = c.colour ?? c.color ?? DEFAULT_COLORS[id] ?? '#6E6E6E';
      rows.push(`${id},${label},${colour}`);
    }
  }

  return rows.join('\r\n');
}

/**
 * Builds complete ZIP package containing Shapefile, CSV, GeoJSON, and Manifest.
 * Fails closed on unmapped records or invalid coordinates.
 * @param {Object} options
 * @param {Array<Object>} options.records Active dataset points
 * @param {string} [options.datasetId]
 * @param {string} [options.datasetName]
 * @param {Object} [options.classCounts]
 * @param {Array<Object>} [options.targetClasses]
 * @param {Array<string>} [options.sourceDatasetIds]
 * @param {Array<Object>} [options.mappingRefs]
 * @param {Array<string>} [options.rightsRefs]
 * @param {Array<Object>} [options.exclusions]
 * @param {string} [options.mode] 'source' or 'scenario'
 * @param {Array<string>} [options.assumptions]
 * @returns {Promise<{ zip: any, blob: Blob|null, buffer: Uint8Array, manifest: Object }>}
 */
export async function createTrainingExportPackage({
  records = [],
  datasetId = 'data_campuran_1',
  datasetName = 'Data Campuran #1',
  classCounts = {},
  targetClasses = null,
  sourceDatasetIds = ['data_kebun_sawit_karet_f', 'data_ref_mod_2b'],
  mappingRefs = null,
  rightsRefs = null,
  exclusions = [],
  mode = MODES.SCENARIO,
  assumptions = [],
  purpose = 'PRIVATE_TRAINING',
  acknowledgements = [],
  unknownMetadataWarnings = []
}) {
  validateExportRecords(records, targetClasses);

  const JSZip = await getJSZip();
  const zip = new JSZip();

  // 1. Prepare Shapefile records (strictly validated)
  const shpRecords = records.map(r => ({
    coordinates: [Number(r.geometry.coordinates[0]), Number(r.geometry.coordinates[1])],
    class_id: Number(r.project_class_id),
    class_name: String(r.project_class_label || `Kelas ${r.project_class_id}`),
    obs_id: String(r.observation_id || ''),
    ...(r.primitives ? {
      waterbody_: r.primitives.waterbody,
      tree_domin: r.primitives.tree_dominance,
      vegetation: r.primitives.vegetation_height
    } : (r.raw_properties?.waterbody_ !== undefined ? {
      waterbody_: r.raw_properties.waterbody_,
      tree_domin: r.raw_properties.tree_domin,
      vegetation: r.raw_properties.vegetation
    } : {}))
  }));

  if (shpRecords.length !== records.length) {
    throw new Error(`Inkonsistensi jumlah record ekspor: diharapkan ${records.length}, diperoleh ${shpRecords.length}.`);
  }

  const shapefileBuffers = generatePointShapefile(shpRecords);

  // Add Shapefile components to ZIP
  zip.file('training_points.shp', shapefileBuffers.shp);
  zip.file('training_points.shx', shapefileBuffers.shx);
  zip.file('training_points.dbf', shapefileBuffers.dbf);
  zip.file('training_points.prj', shapefileBuffers.prj);
  zip.file('training_points.cpg', shapefileBuffers.cpg);

  // 2. Add CSV companion
  const csvContent = buildCsv(records, mode);
  zip.file('training_points.csv', csvContent);

  // 3. Add GeoJSON companion
  const geoJsonContent = JSON.stringify(buildGeoJson(records, mode), null, 2);
  zip.file('training_points.geojson', geoJsonContent);

  // 4. Add classes.csv companion
  const classesCsvContent = buildClassesCsv(targetClasses, records);
  zip.file('classes.csv', classesCsvContent);

  // 5. Add Manifest JSON
  const manifest = buildExportManifest({
    datasetId,
    datasetName,
    records,
    classCounts,
    targetClasses,
    sourceDatasetIds,
    mappingRefs,
    rightsRefs,
    exclusions,
    assumptions,
    mode,
    purpose,
    acknowledgements,
    unknownMetadataWarnings
  });
  zip.file('manifest.json', JSON.stringify(manifest, null, 2));

  // Generate binary output
  const isBrowser = typeof window !== 'undefined' && typeof Blob !== 'undefined';
  let blob = null;
  let uint8Buffer = null;

  if (isBrowser) {
    blob = await zip.generateAsync({ type: 'blob' });
    const arrayBuffer = await blob.arrayBuffer();
    uint8Buffer = new Uint8Array(arrayBuffer);
  } else {
    uint8Buffer = await zip.generateAsync({ type: 'uint8array' });
  }

  return {
    zip,
    blob,
    buffer: uint8Buffer,
    manifest
  };
}

/**
 * Triggers a file download in the browser.
 * @param {Blob} blob
 * @param {string} filename
 */
export function triggerBrowserDownload(blob, filename = 'training_points_luma.zip') {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.style.display = 'none';
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 1000);
}
