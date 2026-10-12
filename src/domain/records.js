/**
 * src/domain/records.js
 * Invariants and normalization for Portal Data Epistem observations.
 * 
 * Invariants:
 * - Stable observation ID: {archive_sha256[:12]}_{source_record_index:06d}
 * - Canonical geometry: GeoJSON Point [longitude, latitude] in EPSG:4326 with finite numbers.
 * - Fails closed on invalid coordinates or missing provenance; never invents defaults.
 * - Explicit null metadata: unknown fields remain null, never fabricated.
 * - Project class ID is null if unmapped in Sprint 0; never defaults to Lainnya.
 */

/**
 * Normalizes a GeoJSON Feature into a canonical Domain Observation.
 * Validates finite coordinates and provenance at the boundary.
 * @param {Object} feature GeoJSON feature
 * @param {string} [datasetArchive] Archive relative path
 * @param {string} [datasetSha256] Archive SHA256
 * @returns {Object} Canonical observation record
 */
export function normalizeObservation(feature, datasetArchive = null, datasetSha256 = null) {
  if (!feature || typeof feature !== 'object') {
    throw new Error('Feature must be a valid GeoJSON object');
  }

  const props = feature.properties || {};
  const geom = feature.geometry || null;

  // Validate geometry coordinates strictly
  if (!geom || geom.type !== 'Point' || !Array.isArray(geom.coordinates) || geom.coordinates.length < 2) {
    throw new Error(`Invalid or missing Point geometry on feature: ${feature.id || 'unknown'}`);
  }

  const lon = Number(geom.coordinates[0]);
  const lat = Number(geom.coordinates[1]);
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
    throw new Error(`Non-finite point coordinates encountered: [${geom.coordinates.join(', ')}]`);
  }

  const sha = props.dataset_sha256 || datasetSha256;
  if (!sha || typeof sha !== 'string' || sha.length < 12) {
    throw new Error(`Missing or invalid dataset SHA256 provenance for feature: ${feature.id || 'unknown'}`);
  }

  const archive = props.dataset_archive || datasetArchive;
  if (!archive || typeof archive !== 'string') {
    throw new Error(`Missing dataset archive path for feature: ${feature.id || 'unknown'}`);
  }

  if (typeof props.source_record_index !== 'number' || !Number.isInteger(props.source_record_index) || props.source_record_index < 0) {
    throw new Error(`Missing or invalid source_record_index for feature: ${feature.id || 'unknown'}`);
  }
  const recIdx = props.source_record_index;

  const stableId = props.observation_id || feature.id || `${sha.slice(0, 12)}_${String(recIdx).padStart(6, '0')}`;

  // Project class ID: strictly number (1, 2, or 3) if mapped, otherwise null (never default to 3)
  const projClassId = (props.project_class_id !== null && props.project_class_id !== undefined)
    ? Number(props.project_class_id)
    : null;

  return {
    observation_id: stableId,
    geometry: {
      type: 'Point',
      coordinates: [lon, lat]
    },
    dataset_archive: archive,
    dataset_sha256: sha,
    source_record_index: recIdx,
    source_crs: props.source_crs || 'EPSG:4326',
    is_within_aoi: props.is_within_aoi !== false,

    // Source provenance & class
    source_schema_id: props.source_schema_id || 'schema_unknown',
    source_point_id: props.source_point_id || null,
    identity_basis: props.identity_basis || (props.source_point_id ? 'native_id' : 'archive_record_index'),
    source_class_id: props.source_class_id !== undefined ? props.source_class_id : null,
    source_class_label: props.source_class_label !== undefined ? props.source_class_label : null,

    // Project classification: null if unmapped
    project_class_id: projClassId,
    project_class_label: props.project_class_label || (projClassId ? String(projClassId) : null),

    // Raw source attributes preserved unmodified
    raw_attributes: props.raw_attributes ? { ...props.raw_attributes } : {},

    // Explicit null metadata invariants
    observed_time: props.observed_time || null,
    method: props.method || 'unknown',
    contributor_id: props.contributor_id || null,
    rights_id: props.rights_id || null,
    quality_tier: props.quality_tier !== undefined ? props.quality_tier : null,
    evidence_refs: Array.isArray(props.evidence_refs) ? [...props.evidence_refs] : []
  };
}

/**
 * Validates whether an observation satisfies the null-metadata invariant.
 * @param {Object} obs Normalized observation
 * @returns {boolean} True if invariant holds
 */
export function validateObservationInvariants(obs) {
  if (!obs.observation_id || typeof obs.observation_id !== 'string') return false;
  if (!obs.geometry || obs.geometry.type !== 'Point') return false;
  if (obs.observed_time !== null && typeof obs.observed_time !== 'object') return false;
  if (obs.contributor_id !== null && typeof obs.contributor_id !== 'string') return false;
  if (obs.quality_tier !== null && typeof obs.quality_tier !== 'number') return false;
  return true;
}

/**
 * Checks whether a 2D point [x, y] is inside a linear ring via ray-casting.
 * @param {[number, number]} point [lon, lat]
 * @param {Array<[number, number]>} ring
 * @returns {boolean}
 */
export function isPointInRing(point, ring) {
  if (!Array.isArray(point) || !Array.isArray(ring) || ring.length < 3) return false;
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const intersect = ((yi > y) !== (yj > y)) &&
      (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Checks whether a 2D point [x, y] is inside a polygon with holes.
 * @param {[number, number]} point [lon, lat]
 * @param {Array<Array<[number, number]>>} polygonRings [exterior, ...holes]
 * @returns {boolean}
 */
export function isPointInPolygon(point, polygonRings) {
  if (!Array.isArray(polygonRings) || polygonRings.length === 0) return false;
  if (!isPointInRing(point, polygonRings[0])) return false;
  for (let i = 1; i < polygonRings.length; i++) {
    if (isPointInRing(point, polygonRings[i])) return false;
  }
  return true;
}

/**
 * Checks whether a coordinate [lon, lat] is inside a GeoJSON boundary Polygon or MultiPolygon.
 * @param {[number, number]} point [lon, lat]
 * @param {Object} boundaryGeoJson
 * @returns {boolean}
 */
export function isPointInAoi(point, boundaryGeoJson) {
  if (!Array.isArray(point) || point.length < 2 || !boundaryGeoJson) return false;
  const [lon, lat] = point;
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return false;

  const features = boundaryGeoJson.type === 'FeatureCollection'
    ? boundaryGeoJson.features
    : (boundaryGeoJson.type === 'Feature' ? [boundaryGeoJson] : [{ geometry: boundaryGeoJson }]);

  for (const f of features) {
    const geom = f?.geometry || f;
    if (!geom) continue;
    if (geom.type === 'Polygon') {
      if (isPointInPolygon(point, geom.coordinates)) return true;
    } else if (geom.type === 'MultiPolygon') {
      for (const poly of geom.coordinates) {
        if (isPointInPolygon(point, poly)) return true;
      }
    }
  }
  return false;
}
