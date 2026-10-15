/**
 * src/domain/epistem-taxonomy.js
 * Epistem Master Taxonomy (24 leaf classes) extracted from official reference data.
 * Source: Epistem Rona Real Data (Banyuasin operational taxonomy).
 * 
 * Invariants:
 * - 24 leaf classes with Indonesian terminology.
 * - Leaf codes:
 *   - Natural Forest: 1111 (Hutan Lahan Kering Primer), 1112 (Hutan Lahan Kering Sekunder), 1113 (Hutan Mangrove Primer), 1114 (Hutan Mangrove Sekunder), 1115 (Hutan Rawa Primer), 1116 (Hutan Rawa Sekunder), 1117 (Hutan Tanaman)
 *   - Agroforestry: 1121 (Agroforestri Kopi), 1122 (Agroforestri Karet), 1123 (Kebun Campuran / Pekarangan)
 *   - Monoculture Plantation: 1132 (Monokultur Karet), 1133 (Monokultur Kelapa Sawit), 1134 (Monokultur Kakao), 1135 (Monokultur Kelapa), 1136 (Monokultur Lainnya)
 *   - Non-Tree Based: 1210 (Lahan Pertanian Lain), 1220 (Sawah), 1310 (Rumput / Savana), 1320 (Semak belukar)
 *   - Non-Vegetation: 2100 (Permukiman), 2200 (Lahan Terbuka), 2300 (Pertambangan), 3100 (Badan Air), 3200 (Tambak)
 * - Default project crosswalk mappings:
 *   - Karet (Project Class 1): mapped to veg-tb-mono-rubber / code 1132 (Monokultur Karet)
 *   - Kelapa sawit (Project Class 2): mapped to veg-tb-mono-oilpalm / code 1133 (Monokultur Kelapa Sawit)
 */

export const EPISTEM_MASTER_TAXONOMY = Object.freeze([
  {
    id: 'veg',
    name: 'Vegetasi',
    level: 1,
    parentId: null,
    code: '1',
    children: [
      {
        id: 'veg-tb',
        name: 'Sistem Berbasis Pohon',
        level: 2,
        parentId: 'veg',
        code: '11',
        children: [
          {
            id: 'veg-tb-forest',
            name: 'Hutan Alami',
            level: 3,
            parentId: 'veg-tb',
            code: '111',
            color: '#1e7e34',
            description: 'Tutupan tajuk pohon alami dengan dominasi kanopi kontinu',
            children: [
              { id: 'veg-tb-forest-udf', name: 'Hutan Lahan Kering Primer', level: 4, parentId: 'veg-tb-forest', code: '1111', color: '#1e7e34' },
              { id: 'veg-tb-forest-ldf', name: 'Hutan Lahan Kering Sekunder', level: 4, parentId: 'veg-tb-forest', code: '1112', color: '#28a745' },
              { id: 'veg-tb-forest-umf', name: 'Hutan Mangrove Primer', level: 4, parentId: 'veg-tb-forest', code: '1113', color: '#20c997' },
              { id: 'veg-tb-forest-lmf', name: 'Hutan Mangrove Sekunder', level: 4, parentId: 'veg-tb-forest', code: '1114', color: '#38d9a9' },
              { id: 'veg-tb-forest-usf', name: 'Hutan Rawa Primer', level: 4, parentId: 'veg-tb-forest', code: '1115', color: '#0b7285' },
              { id: 'veg-tb-forest-lsf', name: 'Hutan Rawa Sekunder', level: 4, parentId: 'veg-tb-forest', code: '1116', color: '#15aabf' },
              { id: 'veg-tb-forest-ht', name: 'Hutan Tanaman', level: 4, parentId: 'veg-tb-forest', code: '1117', color: '#2b8a3e' }
            ]
          },
          {
            id: 'veg-tb-agro',
            name: 'Agroforestri',
            level: 3,
            parentId: 'veg-tb',
            code: '112',
            color: '#7048e8',
            description: 'Sistem campuran pepohonan dengan tanaman budidaya',
            children: [
              { id: 'veg-tb-agro-coffee', name: 'Agroforestri Kopi', level: 4, parentId: 'veg-tb-agro', code: '1121', color: '#845ef7' },
              { id: 'veg-tb-agro-rubber', name: 'Agroforestri Karet', level: 4, parentId: 'veg-tb-agro', code: '1122', color: '#7048e8' },
              { id: 'veg-tb-agro-mixed', name: 'Kebun Campuran / Pekarangan', level: 4, parentId: 'veg-tb-agro', code: '1123', color: '#5f3dc4' }
            ]
          },
          {
            id: 'veg-tb-mono',
            name: 'Perkebunan Monokultur',
            level: 3,
            parentId: 'veg-tb',
            code: '113',
            color: '#f59f00',
            description: 'Perkebunan budidaya komersial satu komoditas homogen',
            children: [
              { id: 'veg-tb-mono-rubber', name: 'Monokultur Karet', level: 4, parentId: 'veg-tb-mono', code: '1132', color: '#fcc419' },
              { id: 'veg-tb-mono-oilpalm', name: 'Monokultur Kelapa Sawit', level: 4, parentId: 'veg-tb-mono', code: '1133', color: '#fd7e14' },
              { id: 'veg-tb-mono-cocoa', name: 'Monokultur Kakao', level: 4, parentId: 'veg-tb-mono', code: '1134', color: '#d9480f' },
              { id: 'veg-tb-mono-coconut', name: 'Monokultur Kelapa', level: 4, parentId: 'veg-tb-mono', code: '1135', color: '#e67700' },
              { id: 'veg-tb-mono-other', name: 'Monokultur Lainnya', level: 4, parentId: 'veg-tb-mono', code: '1136', color: '#f59f00' }
            ]
          }
        ]
      },
      {
        id: 'veg-ntb',
        name: 'Sistem Bukan Pohon',
        level: 2,
        parentId: 'veg',
        code: '12',
        color: '#40c057',
        children: [
          { id: 'veg-ntb-cropland', name: 'Lahan Pertanian Lain', level: 3, parentId: 'veg-ntb', code: '1210', color: '#51cf66' },
          { id: 'veg-ntb-paddy', name: 'Sawah', level: 3, parentId: 'veg-ntb', code: '1220', color: '#40c057' },
          { id: 'veg-ntb-grass', name: 'Rumput / Savana', level: 3, parentId: 'veg-ntb', code: '1310', color: '#94d82d' },
          { id: 'veg-ntb-shrub', name: 'Semak belukar', level: 3, parentId: 'veg-ntb', code: '1320', color: '#a9e34b' }
        ]
      }
    ]
  },
  {
    id: 'nonveg',
    name: 'Non-Vegetasi',
    level: 1,
    parentId: null,
    code: '2',
    color: '#64748b',
    children: [
      { id: 'nonveg-settle', name: 'Permukiman', level: 2, parentId: 'nonveg', code: '2100', color: '#e03131' },
      { id: 'nonveg-cleared', name: 'Lahan Terbuka', level: 2, parentId: 'nonveg', code: '2200', color: '#adb5bd' },
      { id: 'nonveg-mining', name: 'Pertambangan', level: 2, parentId: 'nonveg', code: '2300', color: '#862e9c' },
      { id: 'nonveg-water', name: 'Badan Air', level: 2, parentId: 'nonveg', code: '3100', color: '#1c7ed6' },
      { id: 'nonveg-aquaculture', name: 'Tambak', level: 2, parentId: 'nonveg', code: '3200', color: '#1098ad' }
    ]
  }
]);

/**
 * Recursively extracts all leaf nodes from a taxonomy tree.
 * @param {Array<Object>} [tree]
 * @param {string} [parentPath]
 * @returns {Array<Object>}
 */
export function getTaxonomyLeaves(tree = EPISTEM_MASTER_TAXONOMY, parentPath = '') {
  const leaves = [];
  for (const node of tree) {
    const currentPath = parentPath ? `${parentPath} > ${node.name}` : node.name;
    if (Array.isArray(node.children) && node.children.length > 0) {
      leaves.push(...getTaxonomyLeaves(node.children, currentPath));
    } else {
      leaves.push({
        id: node.id,
        name: node.name,
        code: node.code,
        level: node.level,
        color: node.color || '#64748b',
        path: currentPath,
        parentId: node.parentId
      });
    }
  }
  return leaves;
}

/**
 * Finds a specific taxonomy node by its ID or code.
 * @param {string} idOrCode
 * @param {Array<Object>} [tree]
 * @returns {Object|null}
 */
export function findTaxonomyNode(idOrCode, tree = EPISTEM_MASTER_TAXONOMY) {
  for (const node of tree) {
    if (node.id === idOrCode || node.code === idOrCode) {
      return node;
    }
    if (Array.isArray(node.children) && node.children.length > 0) {
      const found = findTaxonomyNode(idOrCode, node.children);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Default operational crosswalk mapping from project classes to Epistem leaves.
 * 1 (Karet) -> 1132 (Monokultur Karet)
 * 2 (Kelapa sawit) -> 1133 (Monokultur Kelapa Sawit)
 */
export const DEFAULT_EPISTEM_CROSSWALK = Object.freeze({
  1: Object.freeze({
    projectClassId: 1,
    projectClassLabel: 'Karet',
    epistemLeafId: 'veg-tb-mono-rubber',
    code: '1132',
    name: 'Monokultur Karet',
    colour: '#7B1FA2'
  }),
  2: Object.freeze({
    projectClassId: 2,
    projectClassLabel: 'Kelapa sawit',
    epistemLeafId: 'veg-tb-mono-oilpalm',
    code: '1133',
    name: 'Monokultur Kelapa Sawit',
    colour: '#E91E63'
  })
});
