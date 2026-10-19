/**
 * src/data/catalogue.js
 * Dataset catalogue discovery and descriptors for Portal Data Epistem.
 * 
 * Invariants:
 * - Includes all 6 point collections with honest metadata (no unsupported partner/method claims).
 * - Distinguishes polygon boundary layers (Banyuasin, Sumsel) from point collections.
 */

import { loadJsonResource, adaptObservationCollection, adaptBoundaryCollection } from './source-adapters.js';

export const CATALOGUE_DEFINITIONS = Object.freeze({
  data_kebun_sawit_karet_f: {
    id: 'data_kebun_sawit_karet_f',
    title: 'Data Kebun Sawit & Karet',
    category: 'Data Pengguna',
    year: 2025,
    location: 'Kabupaten Banyuasin',
    description: 'Titik observasi komoditas kelapa sawit dan karet di Banyuasin. Metode survei dan kontributor belum tercatat.',
    geojsonPath: 'data/derived/data_kebun_sawit_karet_f.geojson',
    isPrimary: true,
    kind: 'point_observations'
  },
  data_ref_mod_f: {
    id: 'data_ref_mod_f',
    title: 'Data Referensi Modular (2a)',
    category: 'Data Referensi',
    year: 2024,
    location: 'Kabupaten Banyuasin',
    description: 'Titik referensi modular tanpa label kelas sumber (hanya nomor titik). Metode dan kontributor belum tercatat.',
    geojsonPath: 'data/derived/data_ref_mod_f.geojson',
    isPrimary: false,
    kind: 'point_observations'
  },
  data_ref_mod_2b: {
    id: 'data_ref_mod_2b',
    title: 'Data Referensi Modular (2b)',
    category: 'Data Referensi',
    year: 2025,
    location: 'Kabupaten Banyuasin',
    description: 'Titik referensi modular dengan atribut kelas sumber LULCrcl. Metode dan kontributor belum tercatat.',
    geojsonPath: 'data/derived/data_ref_mod_2b.geojson',
    isPrimary: false,
    kind: 'point_observations'
  },
  data_hutan: {
    id: 'data_hutan',
    title: 'Data Tutupan Hutan',
    category: 'Data Pengguna',
    year: 2024,
    location: 'Kabupaten Banyuasin',
    description: 'Titik observasi tutupan hutan di Banyuasin. Metode survei inventarisasi hutan.',
    geojsonPath: 'data/derived/data_hutan.geojson',
    isPrimary: false,
    kind: 'point_observations'
  },
  data_sawah: {
    id: 'data_sawah',
    title: 'Data Lahan Sawah',
    category: 'Koleksi Mitra',
    year: 2025,
    location: 'Kabupaten Banyuasin',
    description: 'Titik rujukan lahan sawah. Metode pengumpulan dan identitas kontributor belum tercatat.',
    geojsonPath: 'data/derived/data_sawah.geojson',
    isPrimary: false,
    kind: 'point_observations'
  },
  case4_data_kombinasi_f: {
    id: 'case4_data_kombinasi_f',
    title: 'Data Kombinasi Multi-Sumber',
    category: 'Koleksi Terpadu (Kasus 4)',
    year: 2026,
    location: 'Kabupaten Banyuasin',
    description: 'Koleksi gabungan multi-sumber untuk studi Kasus 4. Metode dan kontributor belum tercatat.',
    geojsonPath: 'data/derived/case4_data_kombinasi_f.geojson',
    isPrimary: false,
    kind: 'point_observations'
  }
});

export const BOUNDARY_DEFINITIONS = Object.freeze({
  banyuasin_boundary: {
    id: 'banyuasin_boundary',
    title: 'Batas Kabupaten Banyuasin',
    geojsonPath: 'data/derived/banyuasin_boundary.geojson',
    kind: 'polygon_boundary'
  },
  sumsel_f: {
    id: 'sumsel_f',
    title: 'Batas Provinsi Sumatera Selatan',
    geojsonPath: 'data/derived/sumsel_f.geojson',
    kind: 'polygon_boundary'
  }
});

/**
 * Loads the canonical manifest and constructs the dataset catalogue list.
 * Only includes point observation datasets in the selectable catalogue.
 * @param {string} manifestUrl Path to manifest.json
 * @returns {Promise<{ manifest: Object, items: Array<Object> }>}
 */
export async function loadCatalogue(manifestUrl = 'data/derived/manifest.json') {
  const manifest = await loadJsonResource(manifestUrl);
  const datasetsInfo = manifest.datasets || {};

  const items = [];
  for (const [key, def] of Object.entries(CATALOGUE_DEFINITIONS)) {
    const meta = datasetsInfo[key] || {};
    const archiveCount = meta.feature_count ?? meta.info?.header_count ?? null;
    const aoiCount = meta.reconciliation?.included_in_aoi ?? archiveCount;
    items.push({
      id: def.id,
      title: def.title,
      category: def.category,
      year: def.year || 2025,
      location: def.location || 'Kabupaten Banyuasin',
      description: def.description,
      geojsonPath: def.geojsonPath,
      isPrimary: def.isPrimary,
      sha256: meta.sha256 || null,
      featureCount: aoiCount,
      archiveFeatureCount: archiveCount,
      archive: meta.archive || null,
      reconciliation: meta.reconciliation || null
    });
  }

  return { manifest, items };
}

/**
 * Loads the Banyuasin AOI boundary polygon.
 * @param {string} [boundaryUrl]
 * @returns {Promise<Object>} GeoJSON FeatureCollection
 */
export async function loadBoundary(boundaryUrl = BOUNDARY_DEFINITIONS.banyuasin_boundary.geojsonPath) {
  const data = await loadJsonResource(boundaryUrl);
  return adaptBoundaryCollection(data);
}

/**
 * Loads a specific point observation dataset by ID.
 * @param {string} datasetId
 * @returns {Promise<{ id: string, meta: Object, records: Array<Object> }>}
 */
export async function loadDataset(datasetId) {
  const def = CATALOGUE_DEFINITIONS[datasetId];
  if (!def) {
    throw new Error(`Koleksi data "${datasetId}" tidak valid atau bukan merupakan layer observasi titik.`);
  }

  const rawData = await loadJsonResource(def.geojsonPath);
  const allRecords = adaptObservationCollection(rawData, def.title);
  let records = allRecords.filter(r => r.is_within_aoi === true);

  if (datasetId === 'case4_data_kombinasi_f') {
    const C4_MAP = {
      1: { id: 1, label: 'Hutan' },
      2: { id: 2, label: 'Kebun sawit' },
      3: { id: 3, label: 'Kebun karet' },
      4: { id: 4, label: 'Sawah' },
      5: { id: 5, label: 'Lainnya' }
    };
    records = records.map(r => {
      const srcId = Number(r.source_class_id);
      const c4 = C4_MAP[srcId];
      if (c4) {
        return {
          ...r,
          project_class_id: c4.id,
          project_class_label: c4.label
        };
      }
      return r;
    });
  } else if (datasetId === 'data_ref_mod_2b') {
    const REF_2B_MAP = {
      1: { id: 1, label: 'Hutan' },
      2: { id: 2, label: 'Kebun sawit' },
      3: { id: 3, label: 'Kebun karet' },
      4: { id: 4, label: 'Sawah' },
      5: { id: 5, label: 'Lainnya' }
    };
    records = records.map(r => {
      const srcId = Number(r.source_class_id);
      const mapped = REF_2B_MAP[srcId];
      if (mapped) {
        return {
          ...r,
          project_class_id: mapped.id,
          project_class_label: mapped.label
        };
      }
      return r;
    });
  } else if (datasetId === 'data_sawah') {
    records = records.map(r => ({
      ...r,
      project_class_id: 1,
      project_class_label: 'Sawah'
    }));
  } else if (datasetId === 'data_hutan') {
    records = records.map(r => ({
      ...r,
      project_class_id: 1,
      project_class_label: 'Hutan'
    }));
  } else if (datasetId === 'data_ref_mod_f') {
    records = records.map(r => ({
      ...r,
      project_class_id: 1,
      project_class_label: 'Titik Rujukan (Tanpa Label)'
    }));
  } else if (datasetId === 'data_kebun_sawit_karet_f') {
    records = records.map(r => {
      const srcId = Number(r.source_class_id);
      if (srcId === 1) {
        return {
          ...r,
          project_class_id: 1,
          project_class_label: 'Kebun sawit'
        };
      }
      if (srcId === 2) {
        return {
          ...r,
          project_class_id: 2,
          project_class_label: 'Kebun karet'
        };
      }
      return r;
    });
  }

  return {
    id: datasetId,
    meta: {
      ...def,
      archiveFeatureCount: allRecords.length,
      featureCount: records.length
    },
    records,
    allRecords
  };
}
