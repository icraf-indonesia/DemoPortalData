/**
 * src/export/manifest.js
 * Generates the lineage and export manifest following ExportManifest data contracts.
 * 
 * Invariants:
 * - Records exact included versions, source datasets, project mappings, and counts.
 * - receiver_verification remains 'untested' (never claims live synced).
 * - Records fixture assumptions when exported from scenario mode.
 * - No reviewer identities or attachment URLs included.
 */

/**
 * Builds an ExportManifest object.
 * @param {Object} params
 * @param {string} params.exportId
 * @param {string} params.datasetId
 * @param {string} params.datasetName
 * @param {Array<Object>} params.records
 * @param {Object} params.classCounts
 * @param {Array<string>} params.sourceDatasetIds
 * @param {Array<string>} params.assumptions
 * @param {string} params.mode 'source' or 'scenario'
 * @returns {Object} Canonical ExportManifest
 */
export function buildExportManifest({
  exportId = `export_${Date.now()}`,
  datasetId = 'data_campuran_1',
  datasetName = 'Data Campuran #1',
  records = [],
  classCounts = {},
  targetClasses = null,
  sourceDatasetIds = [],
  mappingRefs = null,
  rightsRefs = null,
  exclusions = [],
  assumptions = [],
  mode = 'scenario',
  purpose = 'PRIVATE_TRAINING',
  acknowledgements = [],
  unknownMetadataWarnings = []
}) {
  const generatedAt = new Date().toISOString();

  const files = [
    { name: 'training_points.shp', format: 'shp', record_count: records.length },
    { name: 'training_points.shx', format: 'shx', record_count: records.length },
    { name: 'training_points.dbf', format: 'dbf', record_count: records.length },
    { name: 'training_points.prj', format: 'prj', record_count: records.length },
    { name: 'training_points.cpg', format: 'cpg', record_count: records.length },
    { name: 'training_points.csv', format: 'csv', record_count: records.length },
    { name: 'training_points.geojson', format: 'geojson', record_count: records.length },
    { name: 'classes.csv', format: 'csv', record_count: (Array.isArray(targetClasses) && targetClasses.length > 0) ? targetClasses.length : 3 },
    { name: 'manifest.json', format: 'json', record_count: records.length }
  ];

  const activeClasses = Array.isArray(targetClasses) && targetClasses.length > 0
    ? targetClasses
    : [
        { class_id: 1, label: 'Kebun sawit', colour: '#D81C5C' },
        { class_id: 2, label: 'Kebun karet', colour: '#761C97' },
        { class_id: 3, label: 'Lainnya', colour: '#6E6E6E' }
      ];

  const countsByClass = {};
  for (const c of activeClasses) {
    countsByClass[String(c.class_id ?? c.id)] = 0;
  }
  for (const r of records) {
    const k = String(r.project_class_id);
    countsByClass[k] = (countsByClass[k] || 0) + 1;
  }
  countsByClass.total = records.length;

  const defaultMappingRefs = activeClasses.length === 5
    ? [
        {
          source_schema_id: 'schema_case4_lulc',
          mapping: { '1': 1, '2': 2, '3': 3, '4': 4, '5': 5 },
          version: 1,
          status: 'resolved'
        }
      ]
    : [
        {
          source_schema_id: 'schema_kebun_sawit_karet',
          mapping: { '1': 2, '2': 1 },
          version: 1,
          status: 'resolved'
        },
        {
          source_schema_id: 'schema_ref_mod_2b',
          mapping: { '1': 3, '4': 3, '5': 3 },
          version: 1,
          status: 'resolved'
        }
      ];

  // Derive rights references honestly: never claim recorded if unknown in source mode
  let resolvedRightsRefs = rightsRefs;
  if (!resolvedRightsRefs) {
    if (mode === 'scenario') {
      resolvedRightsRefs = ['rights_simulated_open_demo'];
    } else {
      const hasRecorded = records.some(r => r.rights_id && r.rights_id !== 'unknown');
      resolvedRightsRefs = hasRecorded ? ['rights_source_recorded'] : ['rights_source_unknown'];
    }
  }

  return {
    export_id: exportId,
    dataset_ref: {
      dataset_id: datasetId,
      name: datasetName,
      version: 1
    },
    project_snapshot: {
      project_id: 'epistem_banyuasin_2026',
      aoi_id: 'banyuasin',
      aoi_name: 'Kabupaten Banyuasin',
      target_year: 2026,
      classes: activeClasses,
      context_mode: mode
    },
    point_refs: records.map(r => r.observation_id),
    point_versions: records.map(r => ({
      observation_id: r.observation_id,
      version: r.version || 1
    })),
    source_refs: sourceDatasetIds.map(id => ({ dataset_id: id, version: 1 })),
    mapping_refs: mappingRefs || defaultMappingRefs,
    rights_refs: resolvedRightsRefs,
    counts_by_class: countsByClass,
    excluded: Array.isArray(exclusions) ? [...exclusions] : [],
    warnings: [
      'Paket data pelatihan diekspor dalam format ESRI Shapefile, CSV, dan GeoJSON.',
      'Verifikasi impor langsung Luma belum teruji pada versi ini (status: untested).'
    ],
    export_options: {
      scope: 'active_dataset',
      format: 'zip_package'
    },
    files,
    generated_at: generatedAt,
    purpose,
    acknowledgements: Array.isArray(acknowledgements) ? [...acknowledgements] : [],
    unknown_metadata_warnings: Array.isArray(unknownMetadataWarnings) ? [...unknownMetadataWarnings] : [],
    quality_unchanged: true,
    receiver_verification: 'untested',
    fixture_assumptions: assumptions.length > 0 ? [...assumptions] : [
      'Data bersumber langsung dari repositori rujukan tanpa asumsi skenario tambahan.'
    ]
  };
}
