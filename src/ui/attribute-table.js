/**
 * src/ui/attribute-table.js
 * Collapsible bottom attribute table view component.
 * Displays canonical and source observation properties.
 * 
 * Invariants:
 * - Double-click on any row centres and highlights the point on the map.
 * - Keyboard accessible: Enter or Space selects and centres the row.
 * - Missing metadata displayed as clean Indonesian labels:
 *   "Belum tersedia", "Belum diketahui", "Belum dinilai", "Belum tercatat" (zero literal "(null)").
 * - In Scenario mode, overlay metadata is clearly labelled as assumption.
 * - Uses textContent exclusively for rendering text content.
 */

import { getProjectClass } from '../domain/taxonomy.js';
import { getScenarioOverlay, MODES } from '../demo/scenarios.js';

export class AttributeTableView {
  /**
   * @param {HTMLElement|string} containerElement
   * @param {import('../state/workspace.js').WorkspaceState} workspace
   * @param {Function} onRowDoubleClick Callback when a row is double-clicked (pointId, coords)
   */
  constructor(containerElement, workspace, onRowDoubleClick) {
    this.container = typeof containerElement === 'string'
      ? document.getElementById(containerElement)
      : containerElement;
    this.workspace = workspace;
    this.onRowDoubleClick = onRowDoubleClick;

    this.tableBody = null;
    this.rowMap = new Map();
    this.lastRecords = null;
    this.lastCollapsed = null;
    this.lastMode = null;

    this.init();
  }

  init() {
    if (!this.container) return;
    this.workspace.subscribe(state => this.render(state));
  }

  /**
   * Updates only the row selection classes without rebuilding table DOM.
   * @param {string|null} selectedPointId
   */
  updateSelection(selectedPointId) {
    for (const [id, row] of this.rowMap.entries()) {
      if (id === selectedPointId) {
        row.classList.add('is-selected');
        row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } else {
        row.classList.remove('is-selected');
      }
    }
  }

  /**
   * Renders the attribute table view and handles collapse state.
   * @param {import('../state/workspace.js').WorkspaceState} state
   */
  render(state) {
    if (!this.container) return;

    if (
      this.lastRecords === state.activeRecords &&
      this.lastCollapsed === state.isTableCollapsed &&
      this.lastMode === state.activeMode
    ) {
      this.updateSelection(state.selectedPointId);
      return;
    }

    this.lastRecords = state.activeRecords;
    this.lastCollapsed = state.isTableCollapsed;
    this.lastMode = state.activeMode;
    this.container.textContent = ''; // Clear container

    // Wrapper container
    const tableWrapper = document.createElement('div');
    tableWrapper.className = `table-panel-inner ${state.isTableCollapsed ? 'is-collapsed' : ''}`;

    // Header bar with collapse control
    const headerBar = document.createElement('div');
    headerBar.className = 'table-header-bar';

    const titleGroup = document.createElement('div');
    titleGroup.className = 'table-title-group';

    const titleEl = document.createElement('h3');
    titleEl.className = 'table-title';
    titleEl.textContent = 'Tabel Atribut Observasi';
    titleGroup.appendChild(titleEl);

    const countInfo = document.createElement('span');
    countInfo.className = 'table-count-info';
    const totalCount = state.activeRecords.length;
    countInfo.textContent = `${totalCount} rekaman dari "${state.activeDatasetMeta ? state.activeDatasetMeta.title : 'Koleksi Aktif'}"`;
    titleGroup.appendChild(countInfo);

    if (state.activeMode === MODES.SCENARIO) {
      const modeBadge = document.createElement('span');
      modeBadge.className = 'table-mode-badge';
      modeBadge.textContent = 'Asumsi Skenario';
      titleGroup.appendChild(modeBadge);
    }

    headerBar.appendChild(titleGroup);

    // Toggle button
    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'table-toggle-btn';
    toggleBtn.type = 'button';
    toggleBtn.setAttribute('aria-expanded', String(!state.isTableCollapsed));
    toggleBtn.setAttribute('aria-label', state.isTableCollapsed ? 'Buka tabel atribut' : 'Ciutkan tabel atribut');
    toggleBtn.textContent = state.isTableCollapsed ? '▲ Buka Tabel' : '▼ Ciutkan Tabel';
    toggleBtn.addEventListener('click', () => {
      this.workspace.toggleTable();
    });
    headerBar.appendChild(toggleBtn);

    tableWrapper.appendChild(headerBar);

    // Scrollable Table Content Container
    const scrollContainer = document.createElement('div');
    scrollContainer.className = 'table-scroll-container';

    const table = document.createElement('table');
    table.className = 'attribute-table';

    // Table Header
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    const columns = [
      'ID Observasi',
      'Kelas Proyek',
      'Kelas Sumber',
      'Koordinat (Bujur, Lintang)',
      'Waktu Pengamatan',
      'Metode Survei',
      'Tingkat Kualitas',
      'Hak & Lisensi'
    ];

    for (const colText of columns) {
      const th = document.createElement('th');
      th.textContent = colText;
      headerRow.appendChild(th);
    }
    thead.appendChild(headerRow);
    table.appendChild(thead);

    // Table Body
    const tbody = document.createElement('tbody');
    this.tableBody = tbody;
    this.rowMap.clear();

    const isScenario = state.activeMode === MODES.SCENARIO;

    if (state.activeRecords.length === 0) {
      const emptyRow = document.createElement('tr');
      const emptyCell = document.createElement('td');
      emptyCell.colSpan = columns.length;
      emptyCell.className = 'table-cell-empty';
      emptyCell.textContent = 'Tidak ada rekaman observasi dalam koleksi ini.';
      emptyRow.appendChild(emptyCell);
      tbody.appendChild(emptyRow);
    } else {
      for (const obs of state.activeRecords) {
        const tr = document.createElement('tr');
        tr.className = `table-row ${obs.observation_id === state.selectedPointId ? 'is-selected' : ''}`;
        tr.setAttribute('data-obs-id', obs.observation_id);
        tr.tabIndex = 0; // Accessible keyboard focus

        const classDef = getProjectClass(obs.project_class_id);
        const overlay = isScenario ? getScenarioOverlay(obs.dataset_archive || state.activeDatasetId, obs) : null;

        // 1. ID
        const tdId = document.createElement('td');
        tdId.className = 'td-id';
        tdId.textContent = obs.observation_id;
        tr.appendChild(tdId);

        // 2. Project Class
        const tdClass = document.createElement('td');
        const badge = document.createElement('span');
        badge.className = 'table-class-badge';
        badge.style.borderColor = classDef.colour;
        badge.style.color = classDef.colour;
        badge.textContent = obs.project_class_id !== null ? `${obs.project_class_id}. ${classDef.label}` : classDef.label;
        tdClass.appendChild(badge);
        tr.appendChild(tdClass);

        // 3. Source Class & Native Attributes
        const tdSource = document.createElement('td');
        tdSource.className = 'td-source';
        const srcLbl = obs.source_class_label || obs.source_point_id || '(tidak tercatat)';
        tdSource.textContent = srcLbl;
        tr.appendChild(tdSource);

        // 4. Coordinates
        const tdCoords = document.createElement('td');
        tdCoords.className = 'td-coords';
        const coords = obs.geometry.coordinates;
        tdCoords.textContent = `${coords[0].toFixed(5)}, ${coords[1].toFixed(5)}`;
        tr.appendChild(tdCoords);

        // 5. Observed Time (Clean Indonesian label, zero literal (null))
        const tdTime = document.createElement('td');
        if (overlay && overlay.observedYear) {
          tdTime.textContent = `${overlay.observedYear} (Asumsi)`;
        } else if (obs.observed_time && obs.observed_time.year) {
          tdTime.textContent = String(obs.observed_time.year);
        } else {
          tdTime.className = 'td-null';
          tdTime.textContent = 'Belum tersedia';
        }
        tr.appendChild(tdTime);

        // 6. Method
        const tdMethod = document.createElement('td');
        if (overlay && overlay.method && overlay.method !== 'unknown') {
          tdMethod.textContent = `${overlay.method} (Asumsi)`;
        } else if (obs.method && obs.method !== 'unknown') {
          tdMethod.textContent = obs.method;
        } else {
          tdMethod.className = 'td-null';
          tdMethod.textContent = 'Belum diketahui';
        }
        tr.appendChild(tdMethod);

        // 7. Quality Tier
        const tdQuality = document.createElement('td');
        if (overlay && overlay.qualityTier) {
          tdQuality.textContent = `Tier ${overlay.qualityTier} (Simulasi)`;
        } else if (obs.quality_tier !== null) {
          tdQuality.textContent = `Tier ${obs.quality_tier}`;
        } else {
          tdQuality.className = 'td-null';
          tdQuality.textContent = 'Belum dinilai';
        }
        tr.appendChild(tdQuality);

        // 8. Rights
        const tdRights = document.createElement('td');
        if (overlay && overlay.rightsStatus) {
          tdRights.textContent = overlay.rightsStatus;
        } else if (obs.rights_id) {
          tdRights.textContent = String(obs.rights_id);
        } else {
          tdRights.className = 'td-null';
          tdRights.textContent = 'Belum tercatat';
        }
        tr.appendChild(tdRights);

        // Interaction handlers
        const selectRow = () => {
          this.workspace.setSelectedPoint(obs.observation_id);
          if (typeof this.onRowDoubleClick === 'function') {
            this.onRowDoubleClick(obs.observation_id, coords);
          }
        };

        tr.addEventListener('dblclick', selectRow);
        tr.addEventListener('click', () => {
          this.workspace.setSelectedPoint(obs.observation_id);
        });

        tr.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            selectRow();
          }
        });

        this.rowMap.set(obs.observation_id, tr);
        tbody.appendChild(tr);
      }
    }

    table.appendChild(tbody);
    scrollContainer.appendChild(table);
    tableWrapper.appendChild(scrollContainer);
    this.container.appendChild(tableWrapper);
  }
}
