/**
 * src/domain/epistem-taxonomy.js
 * Epistem Master Taxonomy (21 leaf classes) extracted from real reference data.
 * Source: Epistem Rona Real Data (Ogan Ilir / Banyuasin operational taxonomy).
 * 
 * Invariants:
 * - Exactly 21 leaf classes across 4 hierarchy levels.
 * - Does not invent a 22nd class or display misleading discrepancy warnings.
 * - Leaf codes:
 *   - Natural Forest: 1111 (udf), 1112 (ldf), 1113 (umf), 1114 (lmf), 1115 (usf), 1116 (lsf)
 *   - Agroforestry: 1121 (coffee), 1122 (rubber), 1123 (mixed)
 *   - Monoculture Plantation: 1131 (ind), 1132 (rubber), 1133 (oilpalm), 1134 (other), 1135 (coffee)
 *   - Non-Tree Based: 121 (grass), 122 (shrub), 123 (paddy), 124 (cropland)
 *   - Non-Vegetation: 21 (settle), 22 (cleared), 23 (water)
 * - Default project crosswalk mappings:
 *   - Karet (Project Class 1): mapped to veg-tb-mono-rubber / code 1132 (Rubber Monoculture)
 *   - Kelapa sawit (Project Class 2): mapped to veg-tb-mono-oilpalm / code 1133 (Oil Palm Monoculture)
 */

export const EPISTEM_MASTER_TAXONOMY = Object.freeze([
  {
    id: 'veg',
    name: 'Vegetation',
    level: 1,
    parentId: null,
    code: '1',
    children: [
      {
        id: 'veg-tb',
        name: 'Tree Based System',
        level: 2,
        parentId: 'veg',
        code: '11',
        children: [
          {
            id: 'veg-tb-forest',
            name: 'Natural Forest',
            level: 3,
            parentId: 'veg-tb',
            code: '111',
            color: '#1e7e34',
            description: 'Tutupan tajuk pohon alami dengan dominasi kanopi kontinu',
            children: [
              { id: 'veg-tb-forest-udf', name: 'Undisturbed Dryland Forest', level: 4, parentId: 'veg-tb-forest', code: '1111', color: '#1e7e34' },
              { id: 'veg-tb-forest-ldf', name: 'Logged-Over Dryland Forest', level: 4, parentId: 'veg-tb-forest', code: '1112', color: '#28a745' },
              { id: 'veg-tb-forest-umf', name: 'Undisturbed Mangrove Forest', level: 4, parentId: 'veg-tb-forest', code: '1113', color: '#20c997' },
              { id: 'veg-tb-forest-lmf', name: 'Logged-Over Mangrove Forest', level: 4, parentId: 'veg-tb-forest', code: '1114', color: '#38d9a9' },
              { id: 'veg-tb-forest-usf', name: 'Undisturbed Swamp Forest', level: 4, parentId: 'veg-tb-forest', code: '1115', color: '#0b7285' },
              { id: 'veg-tb-forest-lsf', name: 'Logged-Over Swamp Forest', level: 4, parentId: 'veg-tb-forest', code: '1116', color: '#15aabf' }
            ]
          },
          {
            id: 'veg-tb-agro',
            name: 'Agroforestry',
            level: 3,
            parentId: 'veg-tb',
            code: '112',
            color: '#7048e8',
            description: 'Sistem campuran pepohonan dengan tanaman budidaya',
            children: [
              { id: 'veg-tb-agro-coffee', name: 'Coffee agroforestry', level: 4, parentId: 'veg-tb-agro', code: '1121', color: '#845ef7' },
              { id: 'veg-tb-agro-rubber', name: 'Rubber agroforestry', level: 4, parentId: 'veg-tb-agro', code: '1122', color: '#7048e8' },
              { id: 'veg-tb-agro-mixed', name: 'Mixed/home garden', level: 4, parentId: 'veg-tb-agro', code: '1123', color: '#5f3dc4' }
            ]
          },
          {
            id: 'veg-tb-mono',
            name: 'Monoculture Plantation',
            level: 3,
            parentId: 'veg-tb',
            code: '113',
            color: '#f59f00',
            description: 'Perkebunan budidaya komersial satu komoditas homogen',
            children: [
              { id: 'veg-tb-mono-ind', name: 'Industrial Tree Plantation', level: 4, parentId: 'veg-tb-mono', code: '1131', color: '#f59f00' },
              { id: 'veg-tb-mono-rubber', name: 'Rubber Monoculture', level: 4, parentId: 'veg-tb-mono', code: '1132', color: '#fcc419' },
              { id: 'veg-tb-mono-oilpalm', name: 'Oil Palm Monoculture', level: 4, parentId: 'veg-tb-mono', code: '1133', color: '#fd7e14' },
              { id: 'veg-tb-mono-other', name: 'Other Monoculture', level: 4, parentId: 'veg-tb-mono', code: '1134', color: '#e67700' },
              { id: 'veg-tb-mono-coffee', name: 'Coffee Monoculture', level: 4, parentId: 'veg-tb-mono', code: '1135', color: '#d9480f' }
            ]
          }
        ]
      },
      {
        id: 'veg-ntb',
        name: 'Non-Tree Based System',
        level: 2,
        parentId: 'veg',
        code: '12',
        color: '#40c057',
        children: [
          { id: 'veg-ntb-grass', name: 'Grass or Savanna', level: 3, parentId: 'veg-ntb', code: '121', color: '#94d82d' },
          { id: 'veg-ntb-shrub', name: 'Shrub', level: 3, parentId: 'veg-ntb', code: '122', color: '#a9e34b' },
          { id: 'veg-ntb-paddy', name: 'Paddy field', level: 3, parentId: 'veg-ntb', code: '123', color: '#40c057' },
          { id: 'veg-ntb-cropland', name: 'Cropland (Palawija, Horticulture)', level: 3, parentId: 'veg-ntb', code: '124', color: '#51cf66' }
        ]
      }
    ]
  },
  {
    id: 'nonveg',
    name: 'Non-Vegetation',
    level: 1,
    parentId: null,
    code: '2',
    color: '#64748b',
    children: [
      { id: 'nonveg-settle', name: 'Settlement', level: 2, parentId: 'nonveg', code: '21', color: '#e03131' },
      { id: 'nonveg-cleared', name: 'Cleared Land', level: 2, parentId: 'nonveg', code: '22', color: '#adb5bd' },
      { id: 'nonveg-water', name: 'Waterbody', level: 2, parentId: 'nonveg', code: '23', color: '#1c7ed6' }
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
 * 1 (Karet) -> 1132 (Rubber Monoculture)
 * 2 (Kelapa sawit) -> 1133 (Oil Palm Monoculture)
 */
export const DEFAULT_EPISTEM_CROSSWALK = Object.freeze({
  1: Object.freeze({
    projectClassId: 1,
    projectClassLabel: 'Karet',
    epistemLeafId: 'veg-tb-mono-rubber',
    code: '1132',
    name: 'Rubber Monoculture',
    colour: '#7B1FA2'
  }),
  2: Object.freeze({
    projectClassId: 2,
    projectClassLabel: 'Kelapa sawit',
    epistemLeafId: 'veg-tb-mono-oilpalm',
    code: '1133',
    name: 'Oil Palm Monoculture',
    colour: '#E91E63'
  })
});
