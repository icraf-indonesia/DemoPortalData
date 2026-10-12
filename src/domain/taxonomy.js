/**
 * src/domain/taxonomy.js
 * Domain taxonomy definitions and class aggregation for Portal Data Epistem.
 * 
 * Project Classes:
 * 1: Karet (purple #7B1FA2)
 * 2: Kelapa sawit (pink #E91E63)
 * 3: Lainnya (grey #757575)
 * Unmapped / Unknown: styled neutrally (#90A4AE) and labelled "Belum dipetakan"
 */

import {
  EPISTEM_MASTER_TAXONOMY,
  getTaxonomyLeaves,
  findTaxonomyNode,
  DEFAULT_EPISTEM_CROSSWALK
} from './epistem-taxonomy.js';

export {
  EPISTEM_MASTER_TAXONOMY,
  getTaxonomyLeaves,
  findTaxonomyNode,
  DEFAULT_EPISTEM_CROSSWALK
};

export const PROJECT_CLASSES = Object.freeze({
  1: Object.freeze({
    id: 1,
    label: 'Karet',
    colour: '#7B1FA2',
    description: 'Tutupan lahan komoditas karet'
  }),
  2: Object.freeze({
    id: 2,
    label: 'Kelapa sawit',
    colour: '#E91E63',
    description: 'Tutupan lahan kelapa sawit'
  }),
  3: Object.freeze({
    id: 3,
    label: 'Lainnya',
    colour: '#757575',
    description: 'Tutupan non-perkebunan / referensi lainnya'
  })
});

export const UNMAPPED_CLASS = Object.freeze({
  id: null,
  label: 'Belum dipetakan',
  colour: '#90A4AE',
  description: 'Observasi sumber belum dipetakan ke kelas target proyek'
});

export const CASE3_FORESTRY_CLASSES = Object.freeze({
  1: Object.freeze({
    id: 1,
    label: 'Hutan',
    colour: '#1B5E20',
    description: 'Tutupan lahan hutan alam atau sekunder'
  }),
  2: Object.freeze({
    id: 2,
    label: 'Non-hutan',
    colour: '#78909C',
    description: 'Tutupan lahan non-hutan (perkebunan, sawah, dan rujukan lainnya)'
  })
});

export const CASE4_TARGET_CLASSES = Object.freeze({
  1: Object.freeze({
    id: 1,
    label: 'Hutan',
    colour: '#1B5E20',
    description: 'Tutupan lahan hutan'
  }),
  2: Object.freeze({
    id: 2,
    label: 'Kebun sawit',
    colour: '#E91E63',
    description: 'Tutupan perkebunan kelapa sawit'
  }),
  3: Object.freeze({
    id: 3,
    label: 'Kebun karet',
    colour: '#7B1FA2',
    description: 'Tutupan perkebunan karet'
  }),
  4: Object.freeze({
    id: 4,
    label: 'Sawah',
    colour: '#2E7D32',
    description: 'Lahan pertanian sawah basah'
  }),
  5: Object.freeze({
    id: 5,
    label: 'Lainnya',
    colour: '#757575',
    description: 'Tutupan non-perkebunan / non-hutan lainnya'
  })
});

/**
 * Provisional hierarchical taxonomy picker definitions based on old MASTER_TAXONOMY.
 * Documents the 21 leaf-class count discrepancy honestly without fabricating an authoritative 22nd class.
 */
export const PROVISIONAL_HIERARCHY = Object.freeze({
  metadata: {
    recordedLeafCount: 21,
    authoritativeClaim: false,
    discrepancyNote: 'Taksonomi rujukan terdahulu memiliki 21 kelas daun (bukan 22 kelas otoritatif). Hierarki digunakan secara provisional tanpa mengklaim keabsahan otoritatif.'
  },
  tree: [
    {
      id: 'veg',
      name: 'Vegetasi',
      children: [
        {
          id: 'veg-tb',
          name: 'Sistem berbasis pohon',
          children: [
            {
              id: 'veg-tb-mono',
              name: 'Perkebunan monokultur',
              children: [
                {
                  id: 'veg-tb-mono-rubber',
                  name: 'Kebun karet',
                  code: '1132',
                  targetClassId: 1, // in Case 1 schema
                  case4ClassId: 3   // in Case 4 schema
                },
                {
                  id: 'veg-tb-mono-oilpalm',
                  name: 'Kebun sawit',
                  code: '1133',
                  targetClassId: 2, // in Case 1 schema
                  case4ClassId: 2   // in Case 4 schema
                }
              ]
            }
          ]
        }
      ]
    }
  ]
});

/**
 * Returns the class definition for a given project class ID.
 * When null or unknown, returns UNMAPPED_CLASS (never defaults to Lainnya).
 * @param {number|string|null} classId
 * @param {Object} [schema] Optional schema map (e.g. CASE4_TARGET_CLASSES)
 * @returns {Object} Class definition
 */
export function getProjectClass(classId, schema = PROJECT_CLASSES) {
  if (classId === null || classId === undefined || classId === '') {
    return UNMAPPED_CLASS;
  }
  const num = Number(classId);
  return schema[num] || UNMAPPED_CLASS;
}

/**
 * Computes class totals from an array of canonical observations.
 * Tracks project classes according to active schema, unmapped counts, and source class breakdown.
 * @param {Array<Object>} observations
 * @param {Object} [schema] Schema classes dictionary (defaults to PROJECT_CLASSES)
 * @returns {Object} Project class counts, unmapped count, total, and source breakdown
 */
export function computeClassCounts(observations, schema = PROJECT_CLASSES) {
  const counts = {
    unmapped: 0,
    total: 0,
    sourceClasses: {}
  };

  for (const key of Object.keys(schema)) {
    counts[Number(key)] = 0;
  }

  if (!Array.isArray(observations)) {
    return counts;
  }

  for (const obs of observations) {
    const cid = obs.project_class_id !== null && obs.project_class_id !== undefined
      ? Number(obs.project_class_id)
      : null;

    if (cid !== null && schema[cid]) {
      counts[cid] += 1;
    } else {
      counts.unmapped += 1;
    }
    counts.total += 1;

    // Track source class distribution distinctly
    const srcLbl = obs.source_class_label || '(tanpa kelas sumber)';
    counts.sourceClasses[srcLbl] = (counts.sourceClasses[srcLbl] || 0) + 1;
  }

  return counts;
}

/**
 * Resolves source record attributes into a project class for Sprint 0:
 * ONLY initial plantation source (1 Kebun sawit -> 2, 2 Kebun karet -> 1) maps to project classes.
 * All other datasets retain source classes and remain unmapped (null) in Sprint 0.
 * @param {string} datasetSlug Dataset name or archive path
 * @param {Object} rawAttributes Raw attributes from source DBF/CSV
 * @returns {{ project_class_id: number|null, project_class_label: string|null }}
 */
export function resolveSourceToProjectClass(datasetSlug, rawAttributes = {}) {
  const slug = (datasetSlug || '').toLowerCase();
  
  if (slug.includes('kebun_sawit_karet') || slug.includes('data_kebun_sawit_karet')) {
    const val = rawAttributes.Id_LULC ?? rawAttributes.ID_LULC;
    if (val === 1 || val === '1') return { project_class_id: 2, project_class_label: 'Kelapa sawit' };
    if (val === 2 || val === '2') return { project_class_id: 1, project_class_label: 'Karet' };
    return { project_class_id: null, project_class_label: null };
  }

  // All other sources have unresolved project mapping in Sprint 0
  return { project_class_id: null, project_class_label: null };
}

