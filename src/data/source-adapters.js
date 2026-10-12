/**
 * src/data/source-adapters.js
 * Ingestion and adaptation of derived GeoJSON and manifest files into domain records.
 */

import { normalizeObservation } from '../domain/records.js';

/**
 * Loads a JSON/GeoJSON resource from a local URL.
 * @param {string} url Resource path
 * @returns {Promise<Object>} Parsed JSON
 */
export async function loadJsonResource(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Gagal memuat berkas (${res.status} ${res.statusText}): ${url}`);
    }
    return await res.json();
  } catch (err) {
    throw new Error(`Kesalahan pembacaan data [${url}]: ${err.message}`);
  }
}

/**
 * Adapts a FeatureCollection into canonical domain observations.
 * @param {Object} featureCollection GeoJSON FeatureCollection
 * @param {string} [archivePath] Optional archive identifier
 * @param {string} [sha256] Optional archive SHA256
 * @returns {Array<Object>} Normalized observation array
 */
export function adaptObservationCollection(featureCollection, archivePath = null, sha256 = null) {
  if (!featureCollection || !Array.isArray(featureCollection.features)) {
    return [];
  }

  return featureCollection.features.map(f => normalizeObservation(f, archivePath, sha256));
}

/**
 * Adapts boundary GeoJSON for Leaflet display.
 * @param {Object} featureCollection
 * @returns {Object} Valid boundary FeatureCollection
 */
export function adaptBoundaryCollection(featureCollection) {
  if (!featureCollection || !Array.isArray(featureCollection.features)) {
    return { type: 'FeatureCollection', features: [] };
  }
  return featureCollection;
}
