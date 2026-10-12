/**
 * src/ui/classification.js
 * Left panel classification summary component for Cases 1–4.
 * Displays project class breakdown according to the active case schema:
 * - Case 1 & 2: 1 Karet, 2 Kelapa sawit, 3 Lainnya.
 * - Case 3 (Role B): 1 Hutan, 2 Non-hutan.
 * - Case 4 (Role C): 1 Hutan, 2 Kebun sawit, 3 Kebun karet, 4 Sawah, 5 Lainnya.
 * 
 * Invariants:
 * - Shows delta badge when points are newly added.
 * - Action buttons for each active case workflow.
 * - Neutral styling for unmapped classes.
 * - Clean Indonesian numbers and labels.
 */

import {
  PROJECT_CLASSES,
  CASE3_FORESTRY_CLASSES,
  CASE4_TARGET_CLASSES,
  UNMAPPED_CLASS
} from '../domain/taxonomy.js';

export class ClassificationView {
  /**
   * @param {HTMLElement|string} containerElement
   * @param {import('../state/workspace.js').WorkspaceState} workspace
   * @param {Object} [actions] Workflow action callbacks
   * @param {Function} [actions.onOpenComplement] Case 1
   * @param {Function} [actions.onOpenContribute] Case 2
   * @param {Function} [actions.onToggleSampling] Case 2
   * @param {Function} [actions.onOpenPartnerReuse] Case 3
   * @param {Function} [actions.onOpenReview] Case 4
   */
  constructor(containerElement, workspace, actions = {}) {
    this.container = typeof containerElement === 'string'
      ? document.getElementById(containerElement)
      : containerElement;
    this.workspace = workspace;

    // Handle legacy callback or object
    if (typeof actions === 'function') {
      this.actions = { onOpenComplement: actions };
    } else {
      this.actions = actions || {};
    }

    this.init();
  }

  init() {
    if (!this.container) return;
    this.workspace.subscribe(state => this.render(state));
  }

  /**
   * Resolves schema for active case.
   */
  getSchemaForCase(caseId) {
    if (caseId === 3) return CASE3_FORESTRY_CLASSES;
    if (caseId === 4) return CASE4_TARGET_CLASSES;
    return PROJECT_CLASSES;
  }

  /**
   * Renders the class breakdown cards and source class breakdown.
   * @param {import('../state/workspace.js').WorkspaceState} state
   */
  render(state) {
    if (!this.container) return;
    this.container.textContent = ''; // Clear container

    const caseId = state.activeCaseId || 1;
    const schema = state.getActiveSchema();

    // Header container
    const headerWrapper = document.createElement('div');
    headerWrapper.className = 'panel-header';

    const titleEl = document.createElement('h2');
    titleEl.className = 'panel-title';
    titleEl.textContent = 'Skema Klasifikasi';
    headerWrapper.appendChild(titleEl);

    this.container.appendChild(headerWrapper);

    // List of classes
    const classList = document.createElement('div');
    classList.className = 'class-summary-list legend-flat-list';

    const counts = state.classCounts || { unmapped: 0, total: 0, sourceClasses: {} };

    // Render classes from active schema (flat compact NLCD visual style)
    for (const [key, def] of Object.entries(schema)) {
      const classId = Number(key);
      const count = counts[classId] || 0;

      const itemCard = document.createElement('div');
      itemCard.className = `class-card class-card-${classId} legend-row`;

      const swatch = document.createElement('span');
      swatch.className = 'class-color-badge class-color-swatch';
      swatch.style.backgroundColor = def.colour;
      itemCard.appendChild(swatch);

      const textGroup = document.createElement('div');
      textGroup.className = 'class-text-group legend-text-group';

      const labelEl = document.createElement('span');
      labelEl.className = 'class-name';
      labelEl.textContent = `${def.id}. ${def.label}`;
      textGroup.appendChild(labelEl);

      const countEl = document.createElement('span');
      countEl.className = 'class-count';
      if (count === 0) {
        countEl.textContent = '0 titik · Belum tersedia';
        countEl.classList.add('count-empty');
      } else {
        countEl.textContent = `${count.toLocaleString('id-ID')} titik`;
      }

      textGroup.appendChild(countEl);
      itemCard.appendChild(textGroup);

      // Add Data button for Case 1 & Case 2 (Lainnya)
      if ((caseId === 1 || caseId === 2) && classId === 3) {
        const actionRow = document.createElement('div');
        actionRow.className = 'legend-action-row';
        const addBtn = document.createElement('button');
        addBtn.className = 'btn-add-data-lainnya';
        addBtn.type = 'button';
        addBtn.textContent = '+ Tambah Data Rujukan';
        addBtn.setAttribute('aria-label', 'Buka katalog terbuka untuk melengkapi kelas Lainnya');
        addBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (typeof this.actions.onOpenComplement === 'function') {
            this.actions.onOpenComplement();
          }
        });
        actionRow.appendChild(addBtn);
        itemCard.appendChild(actionRow);
      }

      // Case 3 Non-hutan reuse trigger
      if (caseId === 3 && classId === 2) {
        const actionRow = document.createElement('div');
        actionRow.className = 'legend-action-row';
        const addPartnerBtn = document.createElement('button');
        addPartnerBtn.className = 'btn-add-data-lainnya';
        addPartnerBtn.type = 'button';
        addPartnerBtn.textContent = '+ Gunakan Data Mitra';
        addPartnerBtn.setAttribute('aria-label', 'Gunakan data mitra untuk melengkapi Non-hutan');
        addPartnerBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (typeof this.actions.onOpenPartnerReuse === 'function') {
            this.actions.onOpenPartnerReuse();
          }
        });
        actionRow.appendChild(addPartnerBtn);
        itemCard.appendChild(actionRow);
      }

      classList.appendChild(itemCard);
    }

    this.container.appendChild(classList);

    // Case Specific Action Section
    if (caseId === 2) {
      const case2Actions = document.createElement('div');
      case2Actions.className = 'case-action-box';
      case2Actions.innerHTML = `
        <h4 style="font-size: 0.8rem; font-weight: 600; color: #1e293b; margin-bottom: 8px;">Aksi Kontribusi Mandiri:</h4>
      `;

      const contributeBtn = document.createElement('button');
      contributeBtn.className = 'btn-case-action';
      contributeBtn.type = 'button';
      contributeBtn.textContent = 'Sumbangkan Observasi Kebun';
      contributeBtn.addEventListener('click', () => {
        if (typeof this.actions.onOpenContribute === 'function') {
          this.actions.onOpenContribute();
        }
      });
      case2Actions.appendChild(contributeBtn);

      const samplingBtn = document.createElement('button');
      samplingBtn.className = 'btn-case-action btn-sampling-toggle';
      samplingBtn.type = 'button';
      samplingBtn.textContent = state.isSamplingActive ? 'Nonaktifkan Sampling Peta' : 'Mode Sampling di Peta';
      samplingBtn.addEventListener('click', () => {
        if (typeof this.actions.onToggleSampling === 'function') {
          this.actions.onToggleSampling();
        }
      });
      case2Actions.appendChild(samplingBtn);

      this.container.appendChild(case2Actions);
    } else if (caseId === 4) {
      const case4Actions = document.createElement('div');
      case4Actions.className = 'case-action-box';
      case4Actions.innerHTML = `
        <h4 style="font-size: 0.8rem; font-weight: 600; color: #1e293b; margin-bottom: 8px;">Aksi Telaah Mutu:</h4>
      `;

      const reviewBtn = document.createElement('button');
      reviewBtn.className = 'btn-case-action';
      reviewBtn.type = 'button';
      reviewBtn.textContent = 'Buka Panel Telaah Mutu Buta';
      reviewBtn.addEventListener('click', () => {
        if (typeof this.actions.onOpenReview === 'function') {
          this.actions.onOpenReview();
        }
      });
      case4Actions.appendChild(reviewBtn);

      this.container.appendChild(case4Actions);
    }

    // Source Classes Breakdown Section (Optional Collapsible)
    const sourceDetails = document.createElement('details');
    sourceDetails.className = 'source-classes-details source-classes-section';

    const sourceHeading = document.createElement('summary');
    sourceHeading.className = 'source-section-title';
    sourceHeading.textContent = 'Distribusi Kelas Sumber';
    sourceDetails.appendChild(sourceHeading);

    const sourceList = document.createElement('ul');
    sourceList.className = 'source-class-list';

    const sourceEntries = Object.entries(counts.sourceClasses || {});
    if (sourceEntries.length === 0) {
      const emptyLi = document.createElement('li');
      emptyLi.textContent = 'Belum ada data kelas sumber.';
      sourceList.appendChild(emptyLi);
    } else {
      for (const [lbl, cnt] of sourceEntries) {
        const li = document.createElement('li');
        li.className = 'source-class-item';

        const nameSpan = document.createElement('span');
        nameSpan.className = 'source-item-name';
        nameSpan.textContent = lbl;
        li.appendChild(nameSpan);

        const countSpan = document.createElement('span');
        countSpan.className = 'source-item-count';
        countSpan.textContent = `${cnt.toLocaleString('id-ID')} titik`;
        li.appendChild(countSpan);

        sourceList.appendChild(li);
      }
    }
    sourceDetails.appendChild(sourceList);
    this.container.appendChild(sourceDetails);

    // Total footer
    const totalFooter = document.createElement('div');
    totalFooter.className = 'class-summary-total';

    const totalLabel = document.createElement('span');
    totalLabel.className = 'total-label';
    totalLabel.textContent = 'Total Observasi:';
    totalFooter.appendChild(totalLabel);

    const totalValue = document.createElement('span');
    totalValue.className = 'total-value';
    totalValue.textContent = `${(counts.total || 0).toLocaleString('id-ID')} titik`;
    totalFooter.appendChild(totalValue);

    this.container.appendChild(totalFooter);
  }
}
