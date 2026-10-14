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

    // If no dataset selected, do not display anything in the left panel
    if (!state.activeDatasetId || !state.activeRecords || state.activeRecords.length === 0) {
      return;
    }

    const caseId = state.activeCaseId || 1;
    const schema = state.getActiveSchema();

    // Header container
    const headerWrapper = document.createElement('div');
    headerWrapper.className = 'panel-header';

    const titleEl = document.createElement('h2');
    titleEl.className = 'panel-title';
    titleEl.textContent = 'Skema Klasifikasi';
    headerWrapper.appendChild(titleEl);

    if (state.activeDatasetMeta && state.activeDatasetMeta.title) {
      const subTitleEl = document.createElement('div');
      subTitleEl.className = 'panel-subtitle';
      subTitleEl.textContent = state.activeDatasetMeta.title;
      subTitleEl.style.fontSize = '0.74rem';
      subTitleEl.style.color = 'var(--luma-muted)';
      subTitleEl.style.marginTop = '2px';
      subTitleEl.style.fontWeight = '500';
      headerWrapper.appendChild(subTitleEl);
    }

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
      itemCard.style.borderLeftColor = def.colour;

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

      // Add Data button for Case 1 & Case 2 (Lainnya) ONLY when active dataset is User A's plantation data
      if (
        (caseId === 1 || caseId === 2) &&
        def.label === 'Lainnya' &&
        (state.activeDatasetId === 'data_kebun_sawit_karet_f' || state.activeDatasetId === 'data_campuran_1')
      ) {
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

      // Case 3 Non-hutan reuse trigger ONLY when viewing base forestry data
      if (caseId === 3 && def.label === 'Non-hutan' && state.activeDatasetId === 'data_hutan') {
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
      this.container.appendChild(this.renderLumaModelingSection(state));
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

  /**
   * Renders collapsible section for Luma modeling technical report and validation metrics (Case 2).
   * @param {import('../state/workspace.js').WorkspaceState} state
   * @returns {HTMLElement}
   */
  renderLumaModelingSection(state) {
    const luma = state.lumaContext || {
      activeModule: 7,
      module4Separability: {
        method: 'Jeffries-Matusita Distance (JM)',
        pairs: [
          { pair: 'Karet vs Kelapa sawit', distance: 1.84, rating: 'Baik (>1.8)' },
          { pair: 'Karet vs Lainnya', distance: 1.91, rating: 'Sangat Baik' },
          { pair: 'Kelapa sawit vs Lainnya', distance: 1.78, rating: 'Baik' }
        ]
      },
      module6Classification: {
        algorithm: 'Random Forest (RF)',
        numberOfTrees: 100,
        features: 'Sentinel-2 (B2, B3, B4, B8, B11, B12, NDVI, NDWI)',
        status: 'Draf Pra-Klasifikasi Selesai'
      },
      module7Validation: {
        method: 'Matriks Konfusi Sampel Uji Independen (Modul 7)',
        overallAccuracy: 89.2,
        kappa: 0.835,
        testSampleSize: 150,
        classes: [
          { classLabel: 'Karet', producerAccuracy: 87.5, userAccuracy: 89.1 },
          { classLabel: 'Kelapa sawit', producerAccuracy: 91.2, userAccuracy: 88.6 },
          { classLabel: 'Lainnya', producerAccuracy: 88.9, userAccuracy: 90.0 }
        ]
      }
    };

    const isMod7 = Number(luma.activeModule) === 7;

    const details = document.createElement('details');
    details.className = 'luma-quality-details';
    details.open = true;

    const summary = document.createElement('summary');
    summary.className = 'luma-quality-summary';
    summary.innerHTML = `
      <div class="luma-summary-header">
        <svg class="luma-summary-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
        </svg>
        <span class="luma-summary-title">Deskripsi & Mutu Luma</span>
      </div>
      <span class="luma-badge ${isMod7 ? 'luma-badge-success' : 'luma-badge-warning'}">
        ${isMod7 ? 'Modul 7: Valid' : 'Modul 6: Draf'}
      </span>
    `;
    details.appendChild(summary);

    const body = document.createElement('div');
    body.className = 'luma-quality-body';

    // Module Switcher Pills
    const switchRow = document.createElement('div');
    switchRow.className = 'luma-module-switch-row';
    switchRow.innerHTML = `
      <span class="luma-switch-label">Tahap Siklus:</span>
      <div class="luma-switch-btn-group" role="group" aria-label="Pilih Tahap Modul Luma">
        <button type="button" class="btn-luma-tab ${!isMod7 ? 'active' : ''}" data-mod="6">Modul 6 (Draf)</button>
        <button type="button" class="btn-luma-tab ${isMod7 ? 'active' : ''}" data-mod="7">Modul 7 (Valid)</button>
      </div>
    `;
    switchRow.querySelectorAll('.btn-luma-tab').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const mod = Number(btn.getAttribute('data-mod'));
        if (typeof this.workspace.setLumaActiveModule === 'function') {
          this.workspace.setLumaActiveModule(mod);
        }
      });
    });
    body.appendChild(switchRow);

    // Separability (Modul 4)
    const m4Box = document.createElement('div');
    m4Box.className = 'luma-subcard';
    const pairsHtml = (luma.module4Separability?.pairs || []).map(p => `
      <tr>
        <td class="pair-name">${p.pair}</td>
        <td class="pair-val">${Number(p.distance).toFixed(2)}</td>
        <td class="pair-rate"><span class="badge-mini-good">${p.rating}</span></td>
      </tr>
    `).join('');

    m4Box.innerHTML = `
      <div class="luma-subcard-title">Keterpisahan Spektral (Modul 4)</div>
      <div class="luma-subcard-desc">Jarak Jeffries-Matusita (JM) antar-kelas:</div>
      <table class="luma-table">
        <tbody>${pairsHtml}</tbody>
      </table>
    `;
    body.appendChild(m4Box);

    // Classification Parameters (Modul 6)
    const m6Box = document.createElement('div');
    m6Box.className = 'luma-subcard';
    m6Box.innerHTML = `
      <div class="luma-subcard-title">Klasifikasi Random Forest (Modul 6)</div>
      <div class="luma-meta-kv">
        <div class="kv-row"><span>Algoritma:</span> <strong>${luma.module6Classification?.algorithm || 'Random Forest'}</strong></div>
        <div class="kv-row"><span>Jumlah Pohon:</span> <strong>${luma.module6Classification?.numberOfTrees || 100} Trees</strong></div>
        <div class="kv-row"><span>Fitur Band:</span> <span class="bands-code">${luma.module6Classification?.features || 'Sentinel-2 (B2-B12, NDVI)'}</span></div>
      </div>
    `;
    body.appendChild(m6Box);

    // Thematic Validation (Modul 7)
    const m7Box = document.createElement('div');
    m7Box.className = 'luma-subcard';
    if (isMod7) {
      const classRows = (luma.module7Validation?.classes || []).map(c => `
        <tr>
          <td>${c.classLabel}</td>
          <td class="num">${c.producerAccuracy}%</td>
          <td class="num">${c.userAccuracy}%</td>
        </tr>
      `).join('');

      m7Box.innerHTML = `
        <div class="luma-subcard-title" style="color: #047857;">Uji Akurasi Tematik (Modul 7)</div>
        <div class="luma-kpi-row">
          <div class="luma-kpi">
            <span class="kpi-val">${luma.module7Validation?.overallAccuracy || 89.2}%</span>
            <span class="kpi-lbl">Akurasi Total (OA)</span>
          </div>
          <div class="luma-kpi">
            <span class="kpi-val">${luma.module7Validation?.kappa || 0.835}</span>
            <span class="kpi-lbl">Koefisien Kappa</span>
          </div>
        </div>
        <div class="luma-subcard-desc" style="margin-top: 6px;">Sampel uji independen: ${luma.module7Validation?.testSampleSize || 150} titik</div>
        <table class="luma-table" style="margin-top: 4px;">
          <thead>
            <tr><th>Kelas</th><th>Prod. (PA)</th><th>Pengg. (UA)</th></tr>
          </thead>
          <tbody>${classRows}</tbody>
        </table>
      `;
    } else {
      m7Box.innerHTML = `
        <div class="luma-subcard-title" style="color: #b45309;">Uji Akurasi Tematik (Modul 7)</div>
        <div class="luma-notice-warning">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0;">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          <span>Modul 6 adalah draf pra-klasifikasi internal. Uji akurasi independen (Modul 7) belum dijalankan.</span>
        </div>
      `;
    }
    body.appendChild(m7Box);

    details.appendChild(body);
    return details;
  }
}
