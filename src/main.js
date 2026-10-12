/**
 * src/main.js
 * Application entry point for Portal Data Epistem.
 * Orchestrates:
 * - Case 1: Complementing training samples from open catalogue.
 * - Case 2: Owned plantation contribution and interactive on-screen map sampling.
 * - Case 3: Cross-sector partner reuse for Forestry workspace (Role B).
 * - Case 4: Independent blind quality review and tier classification (Role C).
 * - Optional online EOX Sentinel-2 Cloudless 2025 basemap with offline fallback.
 * - Context-aware training export with strict boundary validation.
 * - Deterministic project state reset and localStorage recovery.
 * 
 * Strict constraints:
 * - Luma pink/purple/white theme, Indonesian measured copy, zero emojis, no em-dashes.
 * - Source metadata nulls preserved separately from labelled scenario assumptions.
 * - Rejects unmapped records and non-finite coordinates at export boundary.
 */

import { WorkspaceState } from './state/workspace.js';
import { loadCatalogue, loadBoundary, loadDataset, CATALOGUE_DEFINITIONS } from './data/catalogue.js';
import { MapView } from './ui/map.js';
import { ClassificationView } from './ui/classification.js';
import { CatalogueView } from './ui/catalogue.js';
import { AttributeTableView } from './ui/attribute-table.js';
import { LayoutController } from './ui/layout.js';
import { ModalDialog } from './ui/dialog.js';
import { ComplementWorkflow, REF_MOD_2B_CLASSES } from './features/complement.js';
import { ContributionWorkflow, SAMPLING_ORIGINS, REVIEW_PRIORITIES } from './features/contribute.js';
import { PartnerReuseWorkflow } from './features/partner-reuse.js';
import {
  ReviewWorkflow,
  SIMULATED_REVIEWERS,
  QUALITY_TIERS,
  REVIEW_STATUSES,
  buildCase4ActiveRecords,
  mapScreenSubmissionToCase4
} from './features/review.js';
import {
  MODES,
  CASES_NAVIGATION,
  EXPORT_PURPOSES,
  getScenarioOverlay,
  resolveCanonicalDatasetId,
  evaluateExportEligibility
} from './demo/scenarios.js';
import {
  PROJECT_CLASSES,
  CASE3_FORESTRY_CLASSES,
  CASE4_TARGET_CLASSES,
  PROVISIONAL_HIERARCHY,
  computeClassCounts,
  getTaxonomyLeaves,
  EPISTEM_MASTER_TAXONOMY,
  DEFAULT_EPISTEM_CROSSWALK,
  findTaxonomyNode
} from './domain/taxonomy.js';
import { isPointInAoi } from './domain/records.js';
import { createTrainingExportPackage, triggerBrowserDownload } from './export/luma-adapter.js';

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

class PortalApp {
  constructor() {
    this.workspace = new WorkspaceState();
    this.mapView = null;
    this.classificationView = null;
    this.catalogueView = null;
    this.attributeTableView = null;
    this.layoutController = null;
    this.dialog = new ModalDialog();

    // Feature workflows
    this.complementWorkflow = new ComplementWorkflow(this.workspace);
    this.contributionWorkflow = new ContributionWorkflow(this.workspace);
    this.partnerReuseWorkflow = new PartnerReuseWorkflow(this.workspace);
    this.reviewWorkflow = new ReviewWorkflow(this.workspace);

    // Header and global elements
    this.errorBanner = document.getElementById('error-banner');
    this.btnToggleMode = document.getElementById('btn-toggle-mode');
    this.modeToggleText = document.getElementById('mode-toggle-text');
    this.scenarioBadge = document.getElementById('scenario-disclaimer-badge');
    this.btnTopExport = document.getElementById('btn-top-export');
    this.btnResetDemo = document.getElementById('btn-reset-demo');
    this.btnToggleSampling = document.getElementById('btn-toggle-sampling');

    this.boundaryError = null;
    this.datasetError = null;
    this.noticeMessage = null;
    this.datasetRequestId = 0;
    this.lastCollapsedState = null;
  }

  async init() {
    this.updateErrorBanner();

    // 1. Initialize user preferences and project state from storage
    this.workspace.initPreferences();
    this.updateModeControls();

    // 2. Wire UI Views & Layout Controller
    this.layoutController = new LayoutController(this.workspace);
    this.mapView = new MapView('map', this.workspace);

    this.classificationView = new ClassificationView(
      'panel-left',
      this.workspace,
      {
        onOpenComplement: () => this.openComplementModal(),
        onOpenContribute: () => this.openContributeModal(),
        onToggleSampling: () => this.toggleMapSampling(),
        onOpenPartnerReuse: () => this.openPartnerReuseModal(),
        onOpenReview: () => this.openReviewModal()
      }
    );

    this.catalogueView = new CatalogueView(
      'panel-right',
      this.workspace,
      (id) => this.switchDataset(id),
      {
        onShareDataset: (id) => this.openContributeModal(null, id),
        onDownloadDataset: (id) => this.downloadPublishedGeoJson(id)
      }
    );

    this.attributeTableView = new AttributeTableView(
      'panel-bottom',
      this.workspace,
      (pointId) => {
        if (this.mapView) {
          this.mapView.centerOnPoint(pointId);
        }
      }
    );

    // Sync User Role Selector
    const selectUserRole = document.getElementById('select-active-user-header') || document.getElementById('select-user-role');
    const popoverUserRole = document.getElementById('popover-user-role-select');
    const syncUser = async (uid) => {
      if (selectUserRole) selectUserRole.value = uid;
      if (popoverUserRole) popoverUserRole.value = uid;
      this.workspace.setActiveUser(uid);
      if (uid === 'user_b') {
        const target = this.workspace.case3PrivateCollection ? this.workspace.case3PrivateCollection.meta.id : 'data_hutan';
        await this.switchDataset(target);
      } else {
        const target = this.workspace.mixedDataset ? 'data_campuran_1' : 'data_kebun_sawit_karet_f';
        await this.switchDataset(target);
      }
    };

    if (selectUserRole) {
      selectUserRole.value = this.workspace.activeUser || 'user_a';
      selectUserRole.addEventListener('change', (e) => syncUser(e.target.value));
    }
    if (popoverUserRole) {
      popoverUserRole.value = this.workspace.activeUser || 'user_a';
      popoverUserRole.addEventListener('change', (e) => syncUser(e.target.value));
    }

    // Listen to workspace for table collapse to invalidate map size without resetting centre or zoom
    this.workspace.subscribe((state) => {
      if (this.lastCollapsedState !== state.isTableCollapsed) {
        this.lastCollapsedState = state.isTableCollapsed;
        window.setTimeout(() => {
          if (this.mapView && this.mapView.map) {
            this.mapView.map.invalidateSize({ pan: false });
          }
        }, 260);
      }
      if (selectUserRole && selectUserRole.value !== state.activeUser) {
        selectUserRole.value = state.activeUser || 'user_a';
      }
      if (popoverUserRole && popoverUserRole.value !== state.activeUser) {
        popoverUserRole.value = state.activeUser || 'user_a';
      }
      this.updateModeControls();
      this.updateCaseNavHighlight(state.activeCaseId);
    });

    // 3. Wire Header and Global Controls
    this.wireHeaderControls();

    // 4. Load Catalogue and Boundary Data
    try {
      const { manifest, items } = await loadCatalogue();
      this.workspace.setCatalogue(manifest, items);

      // Load Banyuasin boundary independently
      try {
        const boundary = await loadBoundary();
        this.workspace.setBoundary(boundary);
      } catch (boundaryErr) {
        console.warn('Batas wilayah tidak dapat dimuat:', boundaryErr);
        this.boundaryError = `Peringatan: Berkas batas wilayah Banyuasin tidak dapat dimuat: ${boundaryErr.message}`;
        this.updateErrorBanner();
      }

      // 5. Restore or validate active dataset ID
      let targetDatasetId = this.workspace.activeDatasetId;
      if (targetDatasetId === 'data_campuran_1' && this.workspace.mixedDataset) {
        this.workspace.setActiveDataset(
          this.workspace.mixedDataset.meta.id,
          this.workspace.mixedDataset.meta,
          this.workspace.mixedDataset.records
        );
      } else if (targetDatasetId === 'data_kontribusi_mandiri' && this.workspace.case2DonatedCollection) {
        this.workspace.setActiveDataset(
          this.workspace.case2DonatedCollection.meta.id,
          this.workspace.case2DonatedCollection.meta,
          this.workspace.case2DonatedCollection.records
        );
      } else if (this.workspace.case3PrivateCollection && (targetDatasetId === this.workspace.case3PrivateCollection.meta.id || targetDatasetId === 'data_hutan_sawit_partisipatif')) {
        this.workspace.setActiveDataset(
          this.workspace.case3PrivateCollection.meta.id,
          this.workspace.case3PrivateCollection.meta,
          this.workspace.case3PrivateCollection.records
        );
      } else if (!targetDatasetId || !CATALOGUE_DEFINITIONS[targetDatasetId]) {
        console.warn(`Persisted dataset ID "${targetDatasetId}" is invalid. Resetting to primary.`);
        this.datasetError = `Peringatan: Pilihan koleksi sebelumnya ("${targetDatasetId}") tidak valid. Dialihkan ke koleksi utama.`;
        targetDatasetId = 'data_kebun_sawit_karet_f';
        await this.switchDataset(targetDatasetId);
      } else {
        await this.switchDataset(targetDatasetId);
      }

      // 6. Restore sampling draft marker if present
      if (this.workspace.case2SamplingDraft && Array.isArray(this.workspace.case2SamplingDraft.coordinates)) {
        this.mapView.setDraftMarker(this.workspace.case2SamplingDraft.coordinates);
      }

    } catch (err) {
      console.error('Fatal initialization error:', err);
      this.datasetError = `Gagal menginisialisasi Portal Data Epistem: ${err.message}`;
      this.updateErrorBanner();
    }
  }

  /**
   * Switches the active dataset with async concurrency guard.
   * Supports static datasets, private mixed datasets, and donated collections.
   * @param {string} datasetId
   */
  async switchDataset(datasetId) {
    const requestId = ++this.datasetRequestId;
    this.datasetError = null;
    this.updateErrorBanner();

    if (datasetId === 'data_campuran_1') {
      if (this.workspace.mixedDataset) {
        this.workspace.setActiveDataset(
          this.workspace.mixedDataset.meta.id,
          this.workspace.mixedDataset.meta,
          this.workspace.mixedDataset.records
        );
      }
      return;
    }

    if (datasetId === 'data_kontribusi_mandiri') {
      if (this.workspace.case2DonatedCollection) {
        this.workspace.setActiveDataset(
          this.workspace.case2DonatedCollection.meta.id,
          this.workspace.case2DonatedCollection.meta,
          this.workspace.case2DonatedCollection.records
        );
      }
      return;
    }

    if (datasetId === 'data_hutan_sawit_partisipatif' || (this.workspace.case3PrivateCollection && datasetId === this.workspace.case3PrivateCollection.meta.id)) {
      if (this.workspace.case3PrivateCollection) {
        this.workspace.setActiveDataset(
          this.workspace.case3PrivateCollection.meta.id,
          this.workspace.case3PrivateCollection.meta,
          this.workspace.case3PrivateCollection.records
        );
        return;
      }
    }

    try {
      const dataset = await loadDataset(datasetId);
      if (this.datasetRequestId !== requestId) return;
      let records = dataset.records;
      if (datasetId === 'case4_data_kombinasi_f') {
        records = buildCase4ActiveRecords(
          dataset.records,
          this.workspace.case2ScreenSubmissions || [],
          this.workspace.case4Interpretations || {}
        );
      }
      this.workspace.setActiveDataset(dataset.id, dataset.meta, records);
    } catch (err) {
      if (this.datasetRequestId !== requestId) return;
      console.error(`Failed to load dataset ${datasetId}:`, err);
      this.datasetError = `Gagal memuat dataset "${datasetId}": ${err.message}`;
      this.updateErrorBanner();
    }
  }

  /**
   * Wires header buttons: mode toggle, case navigation, export, reset, basemap, and sampling.
   */
  wireHeaderControls() {
    // Settings toggle and popover
    const btnSettings = document.getElementById('btn-settings');
    const popoverSettings = document.getElementById('popover-settings');
    const btnCloseSettings = document.getElementById('btn-close-settings');
    if (btnSettings && popoverSettings) {
      btnSettings.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = popoverSettings.style.display !== 'none';
        popoverSettings.style.display = isOpen ? 'none' : 'block';
      });
      if (btnCloseSettings) {
        btnCloseSettings.addEventListener('click', (e) => {
          e.stopPropagation();
          popoverSettings.style.display = 'none';
        });
      }
      document.addEventListener('click', (e) => {
        if (!popoverSettings.contains(e.target) && e.target !== btnSettings && !btnSettings.contains(e.target)) {
          popoverSettings.style.display = 'none';
        }
      });
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && popoverSettings.style.display !== 'none') {
          popoverSettings.style.display = 'none';
          btnSettings.focus();
        }
      });
    }

    // Mode toggle button
    if (this.btnToggleMode) {
      this.btnToggleMode.addEventListener('click', () => {
        const nextMode = this.workspace.activeMode === MODES.SCENARIO ? MODES.SOURCE : MODES.SCENARIO;
        this.workspace.setMode(nextMode);
      });
    }

    // Task and case navigation buttons
    const navButtons = document.querySelectorAll('.task-nav-btn, .case-nav-btn');
    navButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const task = btn.getAttribute('data-task');
        const caseId = Number(btn.getAttribute('data-case-id'));
        if (task === 'export') {
          // Handled by this.btnTopExport
          return;
        } else if (task === 'catalogue' || caseId === 1) {
          this.handleCaseNavigation(1);
        } else if (task === 'contribute' || caseId === 2) {
          this.handleCaseNavigation(2);
        } else if (task === 'partner' || caseId === 3) {
          this.handleCaseNavigation(3);
        } else if (task === 'review' || caseId === 4) {
          this.handleCaseNavigation(4);
        }
      });
    });

    // Top export button
    if (this.btnTopExport) {
      this.btnTopExport.addEventListener('click', () => {
        this.openExportModal();
      });
    }

    // Reset button
    if (this.btnResetDemo) {
      this.btnResetDemo.addEventListener('click', () => {
        if (popoverSettings) popoverSettings.style.display = 'none';
        this.openResetConfirmationModal();
      });
    }

    // Connect map status notices
    if (this.mapView) {
      this.mapView.onStatusNotice = (msg) => {
        this.noticeMessage = msg;
        this.updateErrorBanner();
      };
    }

    // Map sampling floating toolbar button
    if (this.btnToggleSampling) {
      this.btnToggleSampling.addEventListener('click', () => {
        this.toggleMapSampling();
      });
    }
  }

  /**
   * Handles user switching case tabs (1..4).
   * @param {number} caseId
   */
  async handleCaseNavigation(caseId) {
    if (caseId === 1) {
      this.workspace.setCase(1);
      if (this.workspace.activeDatasetId !== 'data_kebun_sawit_karet_f' && this.workspace.activeDatasetId !== 'data_campuran_1') {
        await this.switchDataset(this.workspace.mixedDataset ? 'data_campuran_1' : 'data_kebun_sawit_karet_f');
      }
    } else if (caseId === 2) {
      const prevCaseId = this.workspace.activeCaseId;
      this.workspace.setCase(2);
      this.openContributeModal(() => {
        if (prevCaseId === 1) {
          this.workspace.setCase(1);
        }
      });
    } else if (caseId === 3) {
      this.workspace.setCase(3);
      if (this.workspace.case3PrivateCollection) {
        if (this.workspace.activeDatasetId !== this.workspace.case3PrivateCollection.meta.id) {
          this.workspace.setActiveDataset(
            this.workspace.case3PrivateCollection.meta.id,
            this.workspace.case3PrivateCollection.meta,
            this.workspace.case3PrivateCollection.records
          );
        }
      } else if (this.workspace.activeDatasetId !== 'data_hutan') {
        await this.switchDataset('data_hutan');
      }
      this.openPartnerReuseModal();
    } else if (caseId === 4) {
      this.workspace.setCase(4);
      if (this.workspace.activeDatasetId !== 'case4_data_kombinasi_f') {
        await this.switchDataset('case4_data_kombinasi_f');
      }
      this.openReviewModal();
    }
  }

  /**
   * Updates visual highlight on task and case navigation buttons.
   * @param {number} activeCaseId
   */
  updateCaseNavHighlight(activeCaseId) {
    const navButtons = document.querySelectorAll('.task-nav-btn, .case-nav-btn');
    navButtons.forEach(btn => {
      const id = Number(btn.getAttribute('data-case-id'));
      if (id === activeCaseId) {
        btn.classList.add('is-active');
        btn.setAttribute('aria-current', 'page');
      } else if (id) {
        btn.classList.remove('is-active');
        btn.removeAttribute('aria-current');
      }
    });
  }

  /**
   * Toggles map sampling mode on/off.
   */
  toggleMapSampling() {
    const willActive = !this.workspace.isSamplingActive;
    this.workspace.setSamplingActive(willActive);

    if (this.btnToggleSampling) {
      this.btnToggleSampling.classList.toggle('is-active', willActive);
      this.btnToggleSampling.title = willActive
        ? 'Klik pada peta untuk menempatkan titik sampling'
        : 'Mode sampling nonaktif';
    }

    if (this.mapView) {
      if (willActive) {
        this.mapView.enableSamplingMode((coords) => {
          this.openSamplingFormModal(coords);
        });
        this.noticeMessage = 'Mode sampling aktif: Silakan klik lokasi pada peta di dalam batas Banyuasin untuk menambah titik observasi baru.';
        this.updateErrorBanner();
      } else {
        this.mapView.disableSamplingMode();
        this.noticeMessage = null;
        this.updateErrorBanner();
      }
    }
  }

  /**
   * Synchronizes mode indicator UI with workspace state.
   */
  updateModeControls() {
    const isScenario = this.workspace.activeMode === MODES.SCENARIO;
    if (this.modeToggleText) {
      this.modeToggleText.textContent = isScenario ? 'Mode Skenario' : 'Mode Sumber Nyata';
    }
    if (this.scenarioBadge) {
      this.scenarioBadge.style.display = isScenario ? 'inline-block' : 'none';
    }
  }

  // ==========================================
  // CASE 1: STAGED COMPLEMENT FLOW
  // ==========================================

  async openComplementModal() {
    let candidateRecords = [];
    try {
      const candidateDataset = await loadDataset('data_ref_mod_2b');
      candidateRecords = candidateDataset.records;
    } catch (err) {
      this.datasetError = `Gagal memuat kandidat data referensi: ${err.message}`;
      this.updateErrorBanner();
      return;
    }

    this.complementWorkflow.startFlow(candidateRecords, 'data_ref_mod_2b');
    this.renderComplementStepSelect();
  }

  renderComplementStepSelect() {
    const isScenario = this.workspace.activeMode === MODES.SCENARIO;
    const container = document.createElement('div');

    const header = document.createElement('div');
    header.className = 'modal-header';
    const title = document.createElement('h3');
    title.className = 'modal-title';
    title.textContent = 'Tambah Data Rujukan → Katalog Terbuka';
    header.appendChild(title);

    const subtitle = document.createElement('p');
    subtitle.className = 'modal-subtitle';
    subtitle.textContent = 'Pilih kelas non-target dari Data Referensi Modular (2b) untuk melengkapi kelas proyek "3. Lainnya".';
    header.appendChild(subtitle);

    const banner = document.createElement('div');
    banner.className = `modal-banner ${isScenario ? 'banner-scenario' : 'banner-source'}`;
    banner.textContent = isScenario
      ? 'Skenario Percontohan: Metadatanya asumsi skenario (Tahun 2024–2026, Izin Terbuka Disimulasikan).'
      : 'Mode Sumber Nyata: Pencarian ketat mengecualikan observasi tanpa tanggal terverifikasi (null).';
    header.appendChild(banner);
    container.appendChild(header);

    const body = document.createElement('div');
    body.className = 'modal-body';

    const intro = document.createElement('p');
    intro.textContent = 'Pilih kelas sumber yang akan dipetakan ke kelas Lainnya. Komoditas target (Karet dan Kelapa sawit) dikecualikan:';
    body.appendChild(intro);

    const selectAllBtn = document.createElement('button');
    selectAllBtn.className = 'btn-select-all';
    selectAllBtn.type = 'button';
    selectAllBtn.textContent = 'Pilih semua kelas selain karet dan kelapa sawit';
    selectAllBtn.addEventListener('click', () => {
      this.complementWorkflow.selectNonTargetClasses();
      this.renderComplementStepSelect();
    });
    body.appendChild(selectAllBtn);

    const listWrapper = document.createElement('div');
    listWrapper.className = 'class-selector-list';

    for (const c of REF_MOD_2B_CLASSES) {
      const itemWrapper = document.createElement('label');
      itemWrapper.className = `class-checkbox-item ${c.isTargetClass ? 'is-disabled' : ''}`;

      const chk = document.createElement('input');
      chk.type = 'checkbox';
      chk.value = c.id;
      chk.disabled = c.isTargetClass;
      chk.checked = !c.isTargetClass && this.complementWorkflow.selectedClassIds.has(c.id);

      chk.addEventListener('change', () => {
        this.complementWorkflow.toggleClass(c.id, chk.checked);
      });

      itemWrapper.appendChild(chk);

      const infoBox = document.createElement('div');
      infoBox.className = 'class-item-info';

      const itemHeader = document.createElement('div');
      itemHeader.className = 'class-item-header';
      itemHeader.textContent = `${c.id}. ${c.label}`;

      if (c.isTargetClass) {
        const targetNotice = document.createElement('span');
        targetNotice.className = 'class-item-target-notice';
        targetNotice.textContent = '(Kelas Target Proyek - Dikecualikan)';
        itemHeader.appendChild(targetNotice);
      }
      infoBox.appendChild(itemHeader);

      const itemDesc = document.createElement('div');
      itemDesc.className = 'class-item-desc';
      itemDesc.textContent = c.description;
      infoBox.appendChild(itemDesc);

      itemWrapper.appendChild(infoBox);
      listWrapper.appendChild(itemWrapper);
    }
    body.appendChild(listWrapper);
    container.appendChild(body);

    const footer = document.createElement('div');
    footer.className = 'modal-footer';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn-secondary';
    cancelBtn.type = 'button';
    cancelBtn.textContent = 'Batal';
    cancelBtn.addEventListener('click', () => {
      this.complementWorkflow.cancel();
      this.dialog.close();
    });
    footer.appendChild(cancelBtn);

    const nextBtn = document.createElement('button');
    nextBtn.className = 'btn-primary';
    nextBtn.type = 'button';
    nextBtn.textContent = 'Tinjau Penambahan →';
    nextBtn.addEventListener('click', () => {
      this.renderComplementStepPreview();
    });
    footer.appendChild(nextBtn);

    container.appendChild(footer);
    this.dialog.open(container, () => this.complementWorkflow.cancel());
  }

  renderComplementStepPreview() {
    const isScenario = this.workspace.activeMode === MODES.SCENARIO;
    const preview = this.complementWorkflow.calculatePreview(this.workspace.activeMode);

    const container = document.createElement('div');

    const header = document.createElement('div');
    header.className = 'modal-header';
    const title = document.createElement('h3');
    title.className = 'modal-title';
    title.textContent = 'Tinjau Penambahan Titik Rujukan';
    header.appendChild(title);

    const subtitle = document.createElement('p');
    subtitle.className = 'modal-subtitle';
    subtitle.textContent = 'Verifikasi jumlah titik kandidat, kriteria kelayakan, dan estimasi perubahan sebelum melakukan komitmen.';
    header.appendChild(subtitle);
    container.appendChild(header);

    const body = document.createElement('div');
    body.className = 'modal-body';

    const table = document.createElement('table');
    table.className = 'preview-table';

    const addRow = (label, val) => {
      const tr = document.createElement('tr');
      const th = document.createElement('th');
      th.textContent = label;
      const td = document.createElement('td');
      if (typeof val === 'string') td.textContent = val;
      else td.appendChild(val);
      tr.appendChild(th);
      tr.appendChild(td);
      table.appendChild(tr);
    };

    addRow('Koleksi Sumber:', 'Data Referensi Modular (2b)');
    addRow('Mode Operasi:', isScenario ? 'Skenario Percontohan (Metadatanya asumsi skenario)' : 'Sumber Nyata (Pencarian Ketat)');
    addRow('Waktu Pengamatan:', isScenario ? '2025 (Asumsi Skenario Penelaahan Tier 2)' : 'Tidak tercatat (null - dikecualikan)');
    addRow('Status Hak/Izin:', isScenario ? 'Izin Terbuka Simulasi Mitra' : 'Belum terverifikasi');
    addRow('Kandidat Sumber Total:', `${preview.totalSourceCandidates} titik`);
    addRow('Lolos Saringan Kriteria:', `${preview.eligibleAfterFilters} titik (${preview.excludedByFilter} dikecualikan)`);
    addRow('Titik Duplikat (Dilewati):', `${preview.duplicateCount} titik`);
    addRow('Titik Baru Bersih:', `+${preview.netNewCount} titik`);
    addRow('Total Proyek Sebelum:', `${preview.currentTotalCount} titik`);
    addRow('Total Proyek Setelah:', `${preview.projectedTotalCount} titik (Lainnya: ${preview.netNewCount} titik)`);

    body.appendChild(table);

    const breakdownTitle = document.createElement('h4');
    breakdownTitle.style.fontSize = '0.82rem';
    breakdownTitle.style.marginTop = '10px';
    breakdownTitle.textContent = 'Rincian Kelas Sumber yang Ditambahkan:';
    body.appendChild(breakdownTitle);

    const ul = document.createElement('ul');
    ul.style.fontSize = '0.76rem';
    ul.style.paddingLeft = '18px';
    for (const [lbl, cnt] of Object.entries(preview.classBreakdown)) {
      const li = document.createElement('li');
      li.textContent = `${lbl}: ${cnt} titik`;
      ul.appendChild(li);
    }
    body.appendChild(ul);
    container.appendChild(body);

    const footer = document.createElement('div');
    footer.className = 'modal-footer';

    const backBtn = document.createElement('button');
    backBtn.className = 'btn-secondary';
    backBtn.type = 'button';
    backBtn.textContent = '← Kembali';
    backBtn.addEventListener('click', () => this.renderComplementStepSelect());
    footer.appendChild(backBtn);

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn-secondary';
    cancelBtn.type = 'button';
    cancelBtn.textContent = 'Batal';
    cancelBtn.addEventListener('click', () => {
      this.complementWorkflow.cancel();
      this.dialog.close();
    });
    footer.appendChild(cancelBtn);

    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'btn-primary';
    confirmBtn.type = 'button';
    confirmBtn.textContent = 'Konfirmasi Penambahan';
    confirmBtn.addEventListener('click', () => {
      const res = this.complementWorkflow.confirmAddition(this.workspace.activeMode);
      this.dialog.close();
      this.noticeMessage = `Berhasil membuat ${res.datasetId}: ditambahkan +${res.addedCount} titik rujukan baru untuk kelas Lainnya (Total: ${res.totalCount} titik).`;
      this.updateErrorBanner();
    });
    footer.appendChild(confirmBtn);

    container.appendChild(footer);
    this.dialog.open(container, () => this.complementWorkflow.cancel());
  }

  // ==========================================
  // CASE 2: CONTRIBUTION & SAMPLING FLOW
  // ==========================================

  downloadPublishedGeoJson(datasetId) {
    const pub = this.workspace.publishedCollections.find(p => p.meta.id === datasetId) ||
      (this.workspace.case2DonatedCollection?.meta.id === datasetId ? this.workspace.case2DonatedCollection : null);

    if (!pub) {
      alert('Koleksi data terpublikasi tidak ditemukan.');
      return;
    }

    const geojson = {
      type: 'FeatureCollection',
      metadata: {
        id: pub.meta.id,
        title: pub.meta.title,
        version: pub.meta.version || '1.0.0',
        status: pub.meta.status || 'Mandiri / Belum Ditelaah',
        institution: pub.meta.institution || 'ICRAF Indonesia',
        account_name: pub.meta.accountName || 'User A',
        technical_email: pub.meta.technicalEmail || 'usera@example.org',
        boundary: 'Kabupaten Banyuasin',
        declared_year: pub.meta.year || 2026,
        acquisition_method: pub.meta.acquisitionMethod || 'Survei GPS Lapangan',
        feature_count: pub.records.length,
        crosswalk: pub.crosswalk || null,
        created_at: pub.meta.createdAt || new Date().toISOString()
      },
      features: pub.records.map(r => ({
        type: 'Feature',
        id: r.observation_id,
        geometry: r.geometry,
        properties: {
          observation_id: r.observation_id,
          source_class_id: r.source_class_id,
          source_class_label: r.source_class_label,
          project_class_id: r.project_class_id,
          project_class_label: r.project_class_label,
          epistem_code: r.publication_metadata?.crosswalk_leaf_code || (r.project_class_id === 1 ? '1132' : '1133'),
          epistem_class: r.publication_metadata?.crosswalk_leaf_name || (r.project_class_id === 1 ? 'Rubber Monoculture' : 'Oil Palm Monoculture'),
          declared_institution: pub.meta.institution || 'ICRAF Indonesia',
          declared_year: pub.meta.year || 2026,
          declared_method: pub.meta.acquisitionMethod || 'Survei GPS Lapangan',
          raw_observed_time: r.observed_time,
          raw_contributor_id: r.contributor_id,
          raw_rights_id: r.rights_id,
          raw_attributes: r.raw_attributes
        }
      }))
    };

    triggerBrowserDownload(
      new Blob([JSON.stringify(geojson, null, 2)], { type: 'application/geo+json' }),
      `${datasetId}_published.geojson`
    );
  }

  // ==========================================
  // CASE 2: CONTRIBUTION & SAMPLING FLOW
  // ==========================================

  async openContributeModal(onClose, preselectedDatasetId = null) {
    let isCommitted = false;

    // 1. Determine active target dataset:
    // 1. Determine active target dataset:
    // Individual card preselects itself if provided;
    // Saved draft takes precedence if available; otherwise top button picks mixed dataset if exists.
    const savedDraft = this.workspace.case2PublicationDraft;
    let selectedDatasetId = preselectedDatasetId;
    if (!selectedDatasetId && savedDraft?.selectedDatasetId) {
      selectedDatasetId = savedDraft.selectedDatasetId;
    }
    if (!selectedDatasetId) {
      selectedDatasetId = this.workspace.mixedDataset ? 'data_campuran_1' : 'data_kebun_sawit_karet_f';
    }

    const getRecordsForDataset = async (datasetId) => {
      if (datasetId === 'data_campuran_1' && this.workspace.mixedDataset) {
        return this.workspace.mixedDataset.records;
      }
      if (this.workspace.activeDatasetId === datasetId && this.workspace.activeRecords.length > 0) {
        return this.workspace.activeRecords;
      }
      try {
        const ds = await loadDataset(datasetId);
        return ds.records;
      } catch (err) {
        return this.workspace.activeRecords;
      }
    };

    let currentRecords = await getRecordsForDataset(selectedDatasetId);
    let separation = this.contributionWorkflow.separateOwnedObservations(currentRecords);

    // Staged draft: required fields default blank, responsibility unchecked
    const draft = savedDraft || {
      accountName: '',
      owningInstitution: '',
      technicalEmail: '',
      confirmedYear: 2026,
      acquisitionMethod: 'Survei GPS Lapangan',
      boundaryAoi: 'Kabupaten Banyuasin',
      responsibilityAccepted: false,
      selectedDatasetId,
      crosswalk: {
        1: { epistemLeafId: 'veg-tb-mono-rubber' },
        2: { epistemLeafId: 'veg-tb-mono-oilpalm' }
      }
    };

    const container = document.createElement('div');
    container.className = 'contribution-modal-container';

    const header = document.createElement('div');
    header.className = 'modal-header';
    const title = document.createElement('h3');
    title.className = 'modal-title';
    title.textContent = 'Bagikan Data: Publikasi & Donasi Observasi Mandiri';
    header.appendChild(title);

    const subtitle = document.createElement('p');
    subtitle.className = 'modal-subtitle';
    subtitle.textContent = 'Memisahkan observasi kebun mandiri dari data rujukan pihak ketiga untuk dipublikasikan secara terbuka ke konsorsium Epistem.';
    header.appendChild(subtitle);
    container.appendChild(header);

    const body = document.createElement('div');
    body.className = 'modal-body';

    const modalErrBanner = document.createElement('div');
    modalErrBanner.className = 'modal-banner banner-source';
    modalErrBanner.style.display = 'none';
    modalErrBanner.style.marginBottom = '10px';
    modalErrBanner.style.color = '#dc2626';
    body.appendChild(modalErrBanner);

    // Section 1: Pemilihan Koleksi Data (Collection Selector)
    const collSection = document.createElement('div');
    collSection.className = 'modal-section coll-section';
    collSection.style.marginBottom = '10px';

    const collLabel = document.createElement('label');
    collLabel.style.display = 'block';
    collLabel.style.fontWeight = '700';
    collLabel.style.fontSize = '0.78rem';
    collLabel.style.marginBottom = '4px';
    collLabel.textContent = 'Pilih Koleksi Data untuk Dibagikan:';
    collSection.appendChild(collLabel);

    const collSelect = document.createElement('select');
    collSelect.id = 'pub-collection-select';
    collSelect.style.width = '100%';
    collSelect.style.padding = '6px';
    collSelect.style.fontSize = '0.78rem';
    collSelect.style.borderRadius = '4px';
    collSelect.style.border = '1px solid #cbd5e1';

    // Option: Mixed dataset if exists
    if (this.workspace.mixedDataset) {
      const optMixed = document.createElement('option');
      optMixed.value = 'data_campuran_1';
      optMixed.textContent = `Data Campuran #1 (${this.workspace.mixedDataset.records.length} titik: 240 mandiri, ${this.workspace.mixedDataset.records.length - 240} rujukan)`;
      collSelect.appendChild(optMixed);
    }

    // Option: Own plantation
    const optPlantation = document.createElement('option');
    optPlantation.value = 'data_kebun_sawit_karet_f';
    optPlantation.textContent = 'Data Kebun Sawit & Karet (240 titik mandiri)';
    collSelect.appendChild(optPlantation);

    collSelect.value = selectedDatasetId;
    collSection.appendChild(collSelect);
    body.appendChild(collSection);

    // Separation summary box
    const sepBox = document.createElement('div');
    sepBox.className = 'separation-summary-box';
    body.appendChild(sepBox);

    // Excluded explanation notice container
    const excBox = document.createElement('div');
    excBox.className = 'separation-excluded-box';
    body.appendChild(excBox);

    const updateSeparationView = () => {
      sepBox.innerHTML = `
        <div style="font-size: 0.78rem; line-height: 1.5; margin-bottom: 8px;">
          <p><strong>Observasi Aktif Terdeteksi:</strong> ${separation.summary.total} titik</p>
          <p style="color: #059669;"><strong>Observasi Milik Mandiri (Dapat Dikontribusikan):</strong> ${separation.summary.ownedCount} titik (${separation.summary.rubberCount} Karet, ${separation.summary.palmCount} Kelapa sawit)</p>
          ${separation.summary.excludedCount > 0 ? `<p style="color: #dc2626;"><strong>Koleksi Rujukan Pihak Ketiga (Dikecualikan):</strong> ${separation.summary.excludedCount} titik</p>` : ''}
        </div>
      `;

      if (separation.summary.excludedCount > 0) {
        excBox.innerHTML = `
          <div class="modal-banner banner-source" style="margin-bottom: 12px; font-size: 0.74rem;">
            <strong>Catatan Integritas:</strong> Titik rujukan modular 2b (${separation.summary.excludedCount} titik) berasal dari koleksi impor pihak ketiga, bukan milik pengguna. Data pihak ketiga tidak dapat disumbangkan sebagai kontribusi mandiri dan dikecualikan secara otomatis.
          </div>
        `;
      } else {
        excBox.innerHTML = '';
      }
    };
    updateSeparationView();

    collSelect.addEventListener('change', async () => {
      selectedDatasetId = collSelect.value;
      currentRecords = await getRecordsForDataset(selectedDatasetId);
      separation = this.contributionWorkflow.separateOwnedObservations(currentRecords);
      updateSeparationView();
      updateSummarySection();
    });

    // Section 2: Penyelarasan Taksonomi Epistem (Operational 21-Leaf Crosswalk)
    const cwSection = document.createElement('div');
    cwSection.className = 'modal-section crosswalk-section';
    cwSection.style.marginTop = '10px';
    cwSection.style.marginBottom = '10px';

    const cwHeading = document.createElement('h4');
    cwHeading.style.fontSize = '0.8rem';
    cwHeading.style.fontWeight = '700';
    cwHeading.style.marginBottom = '4px';
    cwHeading.textContent = 'Penyelarasan Taksonomi Epistem (Epistem Operational Crosswalk):';
    cwSection.appendChild(cwHeading);

    const cwDesc = document.createElement('p');
    cwDesc.style.fontSize = '0.74rem';
    cwDesc.style.color = '#475569';
    cwDesc.style.marginBottom = '8px';
    cwDesc.textContent = 'Petakan kedua kelas proyek secara independen ke 21 kelas daun taksonomi hierarkis Epistem (MASTER_TAXONOMY).';
    cwSection.appendChild(cwDesc);

    const leaves = getTaxonomyLeaves(EPISTEM_MASTER_TAXONOMY);

    const buildClassPicker = (classId, classLabel, pillColour, initialLeafId, searchId, selectId, onPickerChange) => {
      let currentSelectedId = initialLeafId;

      const pickerWrap = document.createElement('div');
      pickerWrap.className = 'class-crosswalk-picker';
      pickerWrap.style.marginBottom = '8px';
      pickerWrap.style.padding = '8px';
      pickerWrap.style.borderRadius = '4px';
      pickerWrap.style.border = '1px solid #e2e8f0';
      pickerWrap.style.backgroundColor = '#fafafa';

      const labelBar = document.createElement('div');
      labelBar.style.display = 'flex';
      labelBar.style.alignItems = 'center';
      labelBar.style.justifyContent = 'space-between';
      labelBar.style.marginBottom = '6px';

      const badge = document.createElement('span');
      badge.style.backgroundColor = pillColour;
      badge.style.color = '#ffffff';
      badge.style.padding = '2px 8px';
      badge.style.borderRadius = '3px';
      badge.style.fontSize = '0.74rem';
      badge.style.fontWeight = '700';
      badge.textContent = `Kelas Target ${classId}: ${classLabel}`;
      labelBar.appendChild(badge);

      pickerWrap.appendChild(labelBar);

      const searchInp = document.createElement('input');
      searchInp.type = 'text';
      searchInp.id = searchId;
      searchInp.className = 'cw-search-input';
      searchInp.placeholder = `Cari kelas taksonomi untuk ${classLabel}...`;
      searchInp.style.width = '100%';
      searchInp.style.padding = '4px 6px';
      searchInp.style.fontSize = '0.74rem';
      searchInp.style.border = '1px solid #cbd5e1';
      searchInp.style.borderRadius = '3px';
      searchInp.style.marginBottom = '4px';
      pickerWrap.appendChild(searchInp);

      const select = document.createElement('select');
      select.id = selectId;
      select.className = 'cw-select';
      select.style.width = '100%';
      select.style.padding = '5px';
      select.style.fontSize = '0.75rem';
      select.style.borderRadius = '3px';
      select.style.border = '1px solid #cbd5e1';

      const populateOptions = (filterText = '') => {
        select.innerHTML = '';
        const filter = filterText.toLowerCase().trim();

        const groups = {};
        let matchCount = 0;
        for (const leaf of leaves) {
          if (filter && !leaf.name.toLowerCase().includes(filter) && !leaf.code.includes(filter) && !leaf.path.toLowerCase().includes(filter)) {
            continue;
          }
          matchCount++;
          const groupName = leaf.path.split(' > ').slice(0, 3).join(' > ') || 'Kategori Lain';
          if (!groups[groupName]) groups[groupName] = [];
          groups[groupName].push(leaf);
        }

        if (matchCount === 0) {
          const emptyOpt = document.createElement('option');
          emptyOpt.value = '';
          emptyOpt.disabled = true;
          emptyOpt.selected = true;
          emptyOpt.textContent = 'Tidak ada kelas taksonomi yang cocok dengan pencarian';
          select.appendChild(emptyOpt);
          return;
        }

        let selectionFound = false;
        for (const [grp, grpLeaves] of Object.entries(groups)) {
          const optGroup = document.createElement('optgroup');
          optGroup.label = grp;
          for (const l of grpLeaves) {
            const opt = document.createElement('option');
            opt.value = l.id;
            opt.setAttribute('data-code', l.code);
            opt.setAttribute('data-name', l.name);
            opt.textContent = `${l.code}. ${l.name}`;
            if (l.id === currentSelectedId) {
              opt.selected = true;
              selectionFound = true;
            }
            optGroup.appendChild(opt);
          }
          select.appendChild(optGroup);
        }

        if (!selectionFound && filter) {
          const promptOpt = document.createElement('option');
          promptOpt.value = '';
          promptOpt.disabled = true;
          promptOpt.selected = true;
          promptOpt.textContent = '-- Pilih hasil pencarian untuk mengganti pilihan --';
          select.insertBefore(promptOpt, select.firstChild);
        }
      };

      populateOptions();

      searchInp.addEventListener('input', () => {
        populateOptions(searchInp.value);
      });

      select.addEventListener('change', () => {
        if (select.value) {
          currentSelectedId = select.value;
          if (typeof onPickerChange === 'function') {
            onPickerChange();
          }
        }
      });

      pickerWrap.appendChild(select);
      return {
        wrapper: pickerWrap,
        select,
        searchInp,
        getSelectedLeafId: () => currentSelectedId
      };
    };

    const karetInitialLeaf = draft.crosswalk?.[1]?.epistemLeafId || 'veg-tb-mono-rubber';
    const sawitInitialLeaf = draft.crosswalk?.[2]?.epistemLeafId || 'veg-tb-mono-oilpalm';

    const karetPicker = buildClassPicker(
      1,
      'Karet (Ungu)',
      '#7B1FA2',
      karetInitialLeaf,
      'cw-search-karet',
      'cw-select-karet',
      () => {
        updateSummarySection();
        saveDraftState();
      }
    );
    cwSection.appendChild(karetPicker.wrapper);

    const sawitPicker = buildClassPicker(
      2,
      'Kelapa sawit (Pink)',
      '#E91E63',
      sawitInitialLeaf,
      'cw-search-sawit',
      'cw-select-sawit',
      () => {
        updateSummarySection();
        saveDraftState();
      }
    );
    cwSection.appendChild(sawitPicker.wrapper);

    const cwLainnyaNote = document.createElement('p');
    cwLainnyaNote.style.fontSize = '0.72rem';
    cwLainnyaNote.style.color = '#64748b';
    cwLainnyaNote.style.marginTop = '4px';
    cwLainnyaNote.textContent = 'Observasi rujukan lainnya (kelas 3/Lainnya) dikecualikan secara otomatis dari publikasi dan tidak memerlukan penyelarasan kelas daun.';
    cwSection.appendChild(cwLainnyaNote);

    body.appendChild(cwSection);

    // Section 3: Deklarasi Metadata & Legalitas Form
    const formSection = document.createElement('div');
    formSection.className = 'modal-section pub-form-section';
    formSection.style.marginTop = '10px';

    const formHeading = document.createElement('h4');
    formHeading.style.fontSize = '0.8rem';
    formHeading.style.fontWeight = '700';
    formHeading.style.marginBottom = '6px';
    formHeading.textContent = 'Deklarasi Metadata & Legalitas Publikasi:';
    formSection.appendChild(formHeading);

    const formFields = document.createElement('div');
    formFields.style.display = 'grid';
    formFields.style.gridTemplateColumns = '1fr 1fr';
    formFields.style.gap = '8px';
    formFields.style.fontSize = '0.75rem';

    // Account Name
    const accWrap = document.createElement('div');
    accWrap.innerHTML = `
      <label for="pub-account-name" style="display:block; font-weight:700; margin-bottom:2px;">Nama Akun / Peneliti *:</label>
      <input type="text" id="pub-account-name" value="${escapeHtml(draft.accountName)}" style="width:100%; padding:5px; font-size:0.75rem; border:1px solid #cbd5e1; border-radius:3px;">
      <div id="err-account-name" style="color:#dc2626; font-size:0.7rem; display:none; margin-top:2px;"></div>
    `;
    formFields.appendChild(accWrap);

    // Owning Institution
    const instWrap = document.createElement('div');
    instWrap.innerHTML = `
      <label for="pub-institution" style="display:block; font-weight:700; margin-bottom:2px;">Lembaga Pemilik Data *:</label>
      <input type="text" id="pub-institution" value="${escapeHtml(draft.owningInstitution)}" style="width:100%; padding:5px; font-size:0.75rem; border:1px solid #cbd5e1; border-radius:3px;">
      <div id="err-institution" style="color:#dc2626; font-size:0.7rem; display:none; margin-top:2px;"></div>
    `;
    formFields.appendChild(instWrap);

    // Technical Email
    const emailWrap = document.createElement('div');
    emailWrap.innerHTML = `
      <label for="pub-email" style="display:block; font-weight:700; margin-bottom:2px;">Email Teknis *:</label>
      <input type="email" id="pub-email" value="${escapeHtml(draft.technicalEmail)}" style="width:100%; padding:5px; font-size:0.75rem; border:1px solid #cbd5e1; border-radius:3px;">
      <div id="err-email" style="color:#dc2626; font-size:0.7rem; display:none; margin-top:2px;"></div>
    `;
    formFields.appendChild(emailWrap);

    // Readonly Wilayah Kajian (Banyuasin)
    const aoiWrap = document.createElement('div');
    aoiWrap.innerHTML = `
      <label for="pub-aoi" style="display:block; font-weight:700; margin-bottom:2px;">Wilayah Kajian:</label>
      <input type="text" id="pub-aoi" value="Kabupaten Banyuasin" readonly style="width:100%; padding:5px; font-size:0.75rem; border:1px solid #e2e8f0; background:#f8fafc; border-radius:3px; color:#475569;">
    `;
    formFields.appendChild(aoiWrap);

    // Confirmed Year (2026)
    const yearWrap = document.createElement('div');
    yearWrap.innerHTML = `
      <label for="pub-year" style="display:block; font-weight:700; margin-bottom:2px;">Tahun Observasi & Proyek:</label>
      <input type="text" id="pub-year" value="2026" readonly style="width:100%; padding:5px; font-size:0.75rem; border:1px solid #e2e8f0; background:#f8fafc; border-radius:3px; color:#475569;">
      <span style="font-size:0.68rem; color:#64748b;">Deklarasi tahun 2026 terkonfirmasi untuk observasi contoh ini.</span>
    `;
    formFields.appendChild(yearWrap);

    // Acquisition Method (Survei GPS Lapangan)
    const methodWrap = document.createElement('div');
    methodWrap.innerHTML = `
      <label for="pub-method" style="display:block; font-weight:700; margin-bottom:2px;">Metode Akuisisi Data:</label>
      <input type="text" id="pub-method" value="Survei GPS Lapangan" readonly style="width:100%; padding:5px; font-size:0.75rem; border:1px solid #e2e8f0; background:#f8fafc; border-radius:3px; color:#475569;">
    `;
    formFields.appendChild(methodWrap);

    formSection.appendChild(formFields);

    // Responsibility Checkbox
    const respWrap = document.createElement('div');
    respWrap.style.marginTop = '8px';
    respWrap.innerHTML = `
      <label style="display:flex; align-items:flex-start; gap:6px; font-size:0.74rem; cursor:pointer;">
        <input type="checkbox" id="pub-responsibility" ${draft.responsibilityAccepted ? 'checked' : ''} style="margin-top:2px;">
        <span><strong>Pernyataan Tanggung Jawab:</strong> Saya menyatakan bahwa observasi kebun mandiri ini diperoleh secara sah dan disetujui untuk dibagikan secara terbuka kepada mitra konsorsium Epistem.</span>
      </label>
      <div id="err-responsibility" style="color:#dc2626; font-size:0.7rem; display:none; margin-top:2px; margin-left:20px;"></div>
    `;
    formSection.appendChild(respWrap);
    body.appendChild(formSection);

    // Section 4: Summary Box before final button
    const summaryCard = document.createElement('div');
    summaryCard.className = 'pub-final-summary-card';
    summaryCard.style.marginTop = '10px';
    summaryCard.style.padding = '8px';
    summaryCard.style.backgroundColor = '#f1f5f9';
    summaryCard.style.border = '1px solid #cbd5e1';
    summaryCard.style.borderRadius = '4px';

    const saveDraftState = () => {
      this.workspace.setPublicationDraft({
        selectedCollectionIds: [selectedDatasetId],
        selectedDatasetId,
        accountName: document.getElementById('pub-account-name')?.value || '',
        owningInstitution: document.getElementById('pub-institution')?.value || '',
        technicalEmail: document.getElementById('pub-email')?.value || '',
        confirmedYear: 2026,
        acquisitionMethod: 'Survei GPS Lapangan',
        boundaryAoi: 'Kabupaten Banyuasin',
        responsibilityAccepted: Boolean(document.getElementById('pub-responsibility')?.checked),
        crosswalk: {
          1: { epistemLeafId: karetPicker.getSelectedLeafId() },
          2: { epistemLeafId: sawitPicker.getSelectedLeafId() }
        }
      });
    };

    const updateSummarySection = () => {
      const accInp = document.getElementById('pub-account-name')?.value || draft.accountName;
      const instInp = document.getElementById('pub-institution')?.value || draft.owningInstitution;
      const leaf1 = findTaxonomyNode(karetPicker.getSelectedLeafId(), EPISTEM_MASTER_TAXONOMY);
      const leaf2 = findTaxonomyNode(sawitPicker.getSelectedLeafId(), EPISTEM_MASTER_TAXONOMY);

      summaryCard.innerHTML = `
        <h5 style="margin:0 0 4px 0; font-size:0.78rem; font-weight:700; color:#1e293b;">Ringkasan Sebelum Konfirmasi:</h5>
        <div style="font-size:0.73rem; line-height:1.45; color:#334155;">
          <div>&bull; <strong>Titik Mandiri Dibagikan:</strong> ${separation.summary.ownedCount} titik (${separation.summary.rubberCount} Karet, ${separation.summary.palmCount} Sawit)</div>
          <div>&bull; <strong>Pemetaan Taksonomi:</strong> Karet &rarr; ${leaf1 ? `${leaf1.code} ${leaf1.name}` : 'Belum dipilih'}, Kelapa sawit &rarr; ${leaf2 ? `${leaf2.code} ${leaf2.name}` : 'Belum dipilih'}</div>
          <div>&bull; <strong>Lembaga & Peneliti:</strong> ${escapeHtml(accInp)} (${escapeHtml(instInp)})</div>
          <div>&bull; <strong>Tahun & Status:</strong> 2026 &bull; Mandiri / Belum Ditelaah (Tier 4)</div>
        </div>
      `;
    };
    updateSummarySection();
    body.appendChild(summaryCard);

    formSection.addEventListener('input', () => {
      updateSummarySection();
      saveDraftState();
    });

    container.appendChild(body);

    const footer = document.createElement('div');
    footer.className = 'modal-footer';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'btn-secondary';
    cancelBtn.textContent = 'Batal';
    cancelBtn.addEventListener('click', () => {
      this.dialog.close();
    });
    footer.appendChild(cancelBtn);

    const publishBtn = document.createElement('button');
    publishBtn.type = 'button';
    publishBtn.className = 'btn-primary';
    publishBtn.textContent = 'Konfirmasi & Bagikan Data';
    publishBtn.addEventListener('click', () => {
      if (modalErrBanner) modalErrBanner.style.display = 'none';

      if (separation.owned.length === 0) {
        if (modalErrBanner) {
          modalErrBanner.textContent = 'Tidak ada observasi kebun mandiri milik pengguna yang dapat dibagikan pada koleksi ini.';
          modalErrBanner.style.display = 'block';
        }
        return;
      }

      const accInp = document.getElementById('pub-account-name');
      const instInp = document.getElementById('pub-institution');
      const emailInp = document.getElementById('pub-email');
      const respInp = document.getElementById('pub-responsibility');

      const errAcc = document.getElementById('err-account-name');
      const errInst = document.getElementById('err-institution');
      const errEmail = document.getElementById('err-email');
      const errResp = document.getElementById('err-responsibility');

      let isValid = true;

      const accVal = (accInp?.value || '').trim();
      if (!accVal) {
        if (errAcc) { errAcc.textContent = 'Nama akun wajib diisi.'; errAcc.style.display = 'block'; }
        isValid = false;
      } else if (errAcc) { errAcc.style.display = 'none'; }

      const instVal = (instInp?.value || '').trim();
      if (!instVal) {
        if (errInst) { errInst.textContent = 'Lembaga pemilik data wajib diisi.'; errInst.style.display = 'block'; }
        isValid = false;
      } else if (errInst) { errInst.style.display = 'none'; }

      const emailVal = (emailInp?.value || '').trim();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailVal || !emailRegex.test(emailVal)) {
        if (errEmail) { errEmail.textContent = 'Email teknis wajib valid (misal: user@example.org).'; errEmail.style.display = 'block'; }
        isValid = false;
      } else if (errEmail) { errEmail.style.display = 'none'; }

      const isResp = Boolean(respInp?.checked);
      if (!isResp) {
        if (errResp) { errResp.textContent = 'Pernyataan tanggung jawab wajib disetujui.'; errResp.style.display = 'block'; }
        isValid = false;
      } else if (errResp) { errResp.style.display = 'none'; }

      const leafId1 = karetPicker.getSelectedLeafId();
      const leafId2 = sawitPicker.getSelectedLeafId();
      const leaf1 = findTaxonomyNode(leafId1, EPISTEM_MASTER_TAXONOMY);
      const leaf2 = findTaxonomyNode(leafId2, EPISTEM_MASTER_TAXONOMY);

      if (!leaf1 || (leaf1.children && leaf1.children.length > 0)) {
        if (modalErrBanner) {
          modalErrBanner.textContent = 'Pilihan kelas taksonomi untuk Karet wajib merupakan kelas daun (leaf node) yang valid.';
          modalErrBanner.style.display = 'block';
        }
        isValid = false;
      }

      if (!leaf2 || (leaf2.children && leaf2.children.length > 0)) {
        if (modalErrBanner) {
          modalErrBanner.textContent = 'Pilihan kelas taksonomi untuk Kelapa sawit wajib merupakan kelas daun (leaf node) yang valid.';
          modalErrBanner.style.display = 'block';
        }
        isValid = false;
      }

      if (!isValid) {
        return;
      }

      const crosswalk = {
        1: {
          projectClassId: 1,
          projectClassLabel: 'Karet',
          epistemLeafId: leaf1.id,
          code: leaf1.code,
          name: leaf1.name,
          path: leaf1.path || leaf1.name,
          colour: '#7B1FA2'
        },
        2: {
          projectClassId: 2,
          projectClassLabel: 'Kelapa sawit',
          epistemLeafId: leaf2.id,
          code: leaf2.code,
          name: leaf2.name,
          path: leaf2.path || leaf2.name,
          colour: '#E91E63'
        }
      };

      let publishedPkg;
      this.contributionWorkflow.publishedCollection = this.workspace.case2DonatedCollection;
      try {
        publishedPkg = this.contributionWorkflow.createPublishedPackage(
          separation.owned,
          {
            accountName: accVal,
            owningInstitution: instVal,
            technicalEmail: emailVal,
            confirmedYear: 2026,
            acquisitionMethod: 'Survei GPS Lapangan',
            boundaryAoi: 'Kabupaten Banyuasin',
            responsibilityAccepted: true
          },
          crosswalk
        );
      } catch (err) {
        if (modalErrBanner) {
          modalErrBanner.textContent = err.message;
          modalErrBanner.style.display = 'block';
        }
        return;
      }

      const saveRes = this.workspace.setPublishedCollection(publishedPkg);
      if (!saveRes || !saveRes.success) {
        if (modalErrBanner) {
          modalErrBanner.textContent = `Gagal menyimpan publikasi: ${(saveRes && saveRes.error) || 'Kesalahan penyimpanan'}. Draf Anda tetap tersimpan dan dapat dicoba kembali.`;
          modalErrBanner.style.display = 'block';
        }
        return;
      }

      isCommitted = true;
      this.dialog.close();

      this.noticeMessage = `Berhasil membagikan dan menyumbangkan ${publishedPkg.records.length} titik kebun mandiri ke ${publishedPkg.meta.id}. Koleksi ini kini dipublikasikan pada Data Terbuka dan dapat ditemukan pada Kasus 3.`;
      this.updateErrorBanner();
    });
    footer.appendChild(publishBtn);

    container.appendChild(footer);
    this.dialog.open(container, () => {
      if (!isCommitted && typeof onClose === 'function') {
        onClose();
      }
    });
  }

  openSamplingFormModal(coords) {
    const isWithinAoi = isPointInAoi(coords, this.workspace.boundaryData);
    const draft = this.contributionWorkflow.createSamplingDraft(coords, isWithinAoi);
    this.workspace.setSamplingDraft(draft);

    const container = document.createElement('div');

    const header = document.createElement('div');
    header.className = 'modal-header';
    const title = document.createElement('h3');
    title.className = 'modal-title';
    title.textContent = 'Sampling Titik Baru di Peta (Interpretasi Layar)';
    header.appendChild(title);

    const subtitle = document.createElement('p');
    subtitle.className = 'modal-subtitle';
    subtitle.textContent = `Koordinat: ${coords[0].toFixed(6)}, ${coords[1].toFixed(6)} ${isWithinAoi ? '(Dalam Batas AOI Banyuasin)' : '(Peringatan: Di Luar Batas AOI)'}`;
    header.appendChild(subtitle);
    container.appendChild(header);

    const body = document.createElement('div');
    body.className = 'modal-body';

    const form = document.createElement('div');
    form.style.display = 'flex';
    form.style.flexDirection = 'column';
    form.style.gap = '10px';
    form.style.fontSize = '0.78rem';

    form.innerHTML = `
      <div>
        <label style="display: block; font-weight: 700; margin-bottom: 4px;">Pilih Kelas Tutupan Lahan Target:</label>
        <select id="sample-class-select" style="width: 100%; padding: 6px; border-radius: 4px; border: 1px solid #cbd5e1;">
          <option value="">-- Pilih Kelas Target --</option>
          <option value="1">1. Karet (Perkebunan karet)</option>
          <option value="2">2. Kelapa sawit (Perkebunan monokultur)</option>
        </select>
      </div>
      <div>
        <label style="display: block; font-weight: 700; margin-bottom: 4px;">Tahun Observasi / Citra:</label>
        <input type="number" id="sample-year-input" value="" placeholder="Misal: 2026" min="2020" max="2030" style="width: 100%; padding: 6px; border-radius: 4px; border: 1px solid #cbd5e1;">
      </div>
      <div>
        <label style="display: block; font-weight: 700; margin-bottom: 4px;">Rujukan Citra Satelit (Bukti):</label>
        <input type="text" id="sample-imgref-input" value="" placeholder="Misal: EOX Sentinel-2 Cloudless 2025" style="width: 100%; padding: 6px; border-radius: 4px; border: 1px solid #cbd5e1;">
        <span style="font-size: 0.7rem; color: #64748b;">Tanpa bukti citra satelit, observasi tetap berupa draft tidak lengkap.</span>
      </div>
      <div>
        <label style="display: block; font-weight: 700; margin-bottom: 4px;">Metode Pengamatan:</label>
        <select id="sample-method-select" style="width: 100%; padding: 6px; border-radius: 4px; border: 1px solid #cbd5e1;">
          <option value="image_interpretation">Interpretasi Citra Satelit (image_interpretation)</option>
          <option value="field_survey">Survei Lapangan Langsung (field_survey)</option>
        </select>
      </div>
      <div>
        <label style="display: block; font-weight: 700; margin-bottom: 4px;">Alasan & Justifikasi Penentuan Kelas:</label>
        <textarea id="sample-reason-input" rows="2" placeholder="Tuliskan alasan dan justifikasi penentuan kelas..." style="width: 100%; padding: 6px; border-radius: 4px; border: 1px solid #cbd5e1;"></textarea>
      </div>
      <div>
        <label style="display: block; font-weight: 700; margin-bottom: 4px;">Ketidakpastian Posisi:</label>
        <input type="text" id="sample-uncert-input" value="" placeholder="Misal: ±15m" style="width: 100%; padding: 6px; border-radius: 4px; border: 1px solid #cbd5e1;">
      </div>
      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 8px; border-radius: 4px; font-size: 0.72rem; color: #475569;">
        <strong>Kebijakan Mutu:</strong> Titik baru dari layar ini otomatis diberikan <em>Prioritas Telaah Tinggi</em> untuk masuk antrean uji mutu Kasus 4.
      </div>
    `;

    body.appendChild(form);
    container.appendChild(body);

    const footer = document.createElement('div');
    footer.className = 'modal-footer';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn-secondary';
    cancelBtn.type = 'button';
    cancelBtn.textContent = 'Batal';
    cancelBtn.addEventListener('click', () => {
      this.workspace.clearSamplingDraft();
      this.mapView.clearDraftMarker();
      this.dialog.close();
    });
    footer.appendChild(cancelBtn);

    const submitBtn = document.createElement('button');
    submitBtn.className = 'btn-primary';
    submitBtn.type = 'button';
    submitBtn.textContent = 'Simpan & Kirim Observasi';
    submitBtn.addEventListener('click', () => {
      const classId = document.getElementById('sample-class-select').value;
      const year = document.getElementById('sample-year-input').value;
      const imgRef = document.getElementById('sample-imgref-input').value;
      const method = document.getElementById('sample-method-select').value;
      const reason = document.getElementById('sample-reason-input').value;
      const uncert = document.getElementById('sample-uncert-input').value;

      if (!classId) {
        alert('Silakan pilih kelas tutupan lahan target terlebih dahulu.');
        return;
      }
      if (!year) {
        alert('Tahun observasi / citra wajib diisi.');
        return;
      }
      if (!imgRef || !imgRef.trim()) {
        alert('Rujukan citra satelit wajib diisi sebagai bukti.');
        return;
      }
      if (!reason || !reason.trim()) {
        alert('Alasan & justifikasi penentuan kelas wajib diisi.');
        return;
      }
      if (!uncert || !uncert.trim()) {
        alert('Ketidakpastian posisi wajib diisi.');
        return;
      }

      const subRes = this.contributionWorkflow.submitSamplingDraft({
        ...this.contributionWorkflow.stagedDraft,
        project_class_id: Number(classId),
        year: Number(year),
        imagery_ref: imgRef.trim(),
        method,
        reason: reason.trim(),
        uncertainty: uncert.trim(),
        is_within_aoi: isWithinAoi
      });

      if (!subRes.valid) {
        alert(`Pengiriman gagal:\n- ${subRes.errors.join('\n- ')}`);
        return;
      }

      this.workspace.clearSamplingDraft();
      this.workspace.addScreenSubmission(subRes.record);
      this.mapView.clearDraftMarker();
      this.dialog.close();
      this.noticeMessage = `Titik sampling baru berhasil disimpan (${subRes.record.observation_id}) dengan Prioritas Telaah Tinggi. Titik siap ditelaah pada Kasus 4.`;
      this.updateErrorBanner();
    });
    footer.appendChild(submitBtn);

    container.appendChild(footer);
    this.dialog.open(container, () => {
      this.workspace.clearSamplingDraft();
      this.mapView.clearDraftMarker();
    });
  }

  // ==========================================
  // CASE 3: CROSS-SECTOR PARTNER REUSE FLOW
  // ==========================================

  async openPartnerReuseModal() {
    let forestRecords = [];
    try {
      const fDataset = await loadDataset('data_hutan');
      forestRecords = this.partnerReuseWorkflow.initForestryRole(fDataset.records);
    } catch (err) {
      console.warn('Gagal memuat dataset hutan:', err);
    }

    const baseRecords = (this.workspace.case3PrivateCollection && Array.isArray(this.workspace.case3PrivateCollection.records))
      ? [...this.workspace.case3PrivateCollection.records]
      : forestRecords;

    let paddyRecords = [];
    try {
      const swDataset = await loadDataset('data_sawah');
      paddyRecords = swDataset.records;
    } catch (err) {
      console.warn('Gagal memuat dataset sawah untuk kalkulasi jumlah:', err);
    }

    const partnerCatalogues = this.partnerReuseWorkflow.discoverPartnerCatalogues(
      this.workspace.case2DonatedCollection,
      paddyRecords
    );

    const container = document.createElement('div');

    const header = document.createElement('div');
    header.className = 'modal-header';
    const title = document.createElement('h3');
    title.className = 'modal-title';
    title.textContent = 'Data Mitra: Penggunaan Ulang Data Lintas Sektor';
    header.appendChild(title);

    const subtitle = document.createElement('p');
    subtitle.className = 'modal-subtitle';
    subtitle.textContent = 'Ruang Kerja Kehutanan (Role B): Melengkapi kelas Non-hutan menggunakan data mitra pertanian dan donasi kebun.';
    header.appendChild(subtitle);
    container.appendChild(header);

    const body = document.createElement('div');
    body.className = 'modal-body';

    const pHeading = document.createElement('h4');
    pHeading.style.fontSize = '0.8rem';
    pHeading.style.fontWeight = '700';
    pHeading.style.marginBottom = '6px';
    pHeading.textContent = 'Pilih Koleksi Mitra yang Ditemukan:';
    body.appendChild(pHeading);

    const selectEl = document.createElement('select');
    selectEl.style.width = '100%';
    selectEl.style.padding = '8px';
    selectEl.style.fontSize = '0.78rem';
    selectEl.style.borderRadius = '4px';
    selectEl.style.border = '1px solid #cbd5e1';
    selectEl.style.marginBottom = '12px';

    for (const cat of partnerCatalogues) {
      const opt = document.createElement('option');
      opt.value = cat.id;
      opt.textContent = `${cat.title} (${cat.count} titik · ${cat.contributor})`;
      selectEl.appendChild(opt);
    }
    body.appendChild(selectEl);

    if (!this.workspace.case2DonatedCollection) {
      const pubNotice = document.createElement('div');
      pubNotice.className = 'modal-banner banner-source';
      pubNotice.style.marginBottom = '12px';
      pubNotice.textContent = 'Belum ada dataset perkebunan yang dipublikasikan. Anda dapat menggunakan data mitra sawah yang tersedia, atau publikasikan data perkebunan mandiri terlebih dahulu di Kasus 2.';
      body.appendChild(pubNotice);
    }

    const previewContainer = document.createElement('div');
    body.appendChild(previewContainer);

    const updatePreviewView = async () => {
      previewContainer.textContent = 'Memuat pratinjau data mitra...';
      const chosenId = selectEl.value;

      let candidateRecords = [];
      if (chosenId === 'data_sawah') {
        candidateRecords = paddyRecords.length > 0 ? paddyRecords : (await loadDataset('data_sawah')).records;
      } else if (chosenId === 'data_kontribusi_mandiri' && this.workspace.case2DonatedCollection) {
        candidateRecords = this.workspace.case2DonatedCollection.records;
      }

      const preview = this.partnerReuseWorkflow.calculateReusePreview(
        candidateRecords,
        chosenId,
        this.workspace.activeMode,
        baseRecords
      );

      previewContainer.innerHTML = '';

      if (preview.permissionBlocked) {
        const warn = document.createElement('div');
        warn.className = 'modal-banner banner-source';
        warn.textContent = preview.permissionMessage;
        previewContainer.appendChild(warn);
      } else {
        const okBanner = document.createElement('div');
        okBanner.className = 'modal-banner banner-scenario';
        okBanner.textContent = 'Simulasi Skenario Aktif: Hak izin terbuka disimulasikan untuk percontohan konsorsium.';
        previewContainer.appendChild(okBanner);
      }

      const summaryTable = document.createElement('table');
      summaryTable.className = 'preview-table';
      summaryTable.innerHTML = `
        <tr><th>Koleksi Mitra:</th><td>${escapeHtml(chosenId)}</td></tr>
        <tr><th>Kandidat Ditemukan:</th><td>${preview.totalSourceCandidates} titik</td></tr>
        <tr><th>Lolos Kriteria Non-hutan:</th><td>${preview.eligibleCandidateCount} titik (${preview.excludedCount} dikecualikan)</td></tr>
        <tr><th>Duplikat Terlewati:</th><td>${preview.duplicateCount} titik</td></tr>
        <tr><th>Tambahan Bersih Non-hutan:</th><td style="color: #059669; font-weight: 700;">+${preview.netNewCount} titik</td></tr>
        <tr><th>Total Kehutanan Terpadu:</th><td>${preview.projectedTotalCount} titik (Basis Koleksi: ${baseRecords.length}, Tambahan Non-hutan: ${preview.netNewCount})</td></tr>
      `;
      previewContainer.appendChild(summaryTable);

      // Attribution Ledger Table
      const lTitle = document.createElement('h5');
      lTitle.style.fontSize = '0.78rem';
      lTitle.style.fontWeight = '700';
      lTitle.style.marginTop = '12px';
      lTitle.style.marginBottom = '4px';
      lTitle.textContent = 'Buku Besar Atribusi Sumber (Attribution Ledger):';
      previewContainer.appendChild(lTitle);

      const ledgerWrapper = document.createElement('div');
      ledgerWrapper.className = 'ledger-table-wrapper';
      const lTable = document.createElement('table');
      lTable.className = 'ledger-table';
      lTable.innerHTML = `
        <thead>
          <tr>
            <th>ID Observasi</th>
            <th>Kelas Asli</th>
            <th>Kelas Proyeksi</th>
            <th>Kontributor</th>
            <th>Metode</th>
            <th>Tahun</th>
            <th>Status Izin</th>
          </tr>
        </thead>
        <tbody>
          ${preview.ledger.slice(0, 8).map(row => `
            <tr>
              <td><code>${escapeHtml(row.observationId)}</code></td>
              <td>${escapeHtml(row.originalClass)}</td>
              <td><strong>${escapeHtml(row.projectedClass)}</strong></td>
              <td>${escapeHtml(row.contributor)}</td>
              <td>${escapeHtml(row.method)}</td>
              <td>${escapeHtml(row.observedYear)}</td>
              <td>${escapeHtml(row.rightsState)}</td>
            </tr>
          `).join('')}
        </tbody>
      `;
      ledgerWrapper.appendChild(lTable);
      previewContainer.appendChild(ledgerWrapper);

      // Store preview for confirmation
      this.currentPartnerPreview = preview;
    };

    selectEl.addEventListener('change', () => updatePreviewView());
    await updatePreviewView();

    container.appendChild(body);

    const footer = document.createElement('div');
    footer.className = 'modal-footer';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn-secondary';
    cancelBtn.type = 'button';
    cancelBtn.textContent = 'Tutup';
    cancelBtn.addEventListener('click', () => this.dialog.close());
    footer.appendChild(cancelBtn);

    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'btn-primary';
    confirmBtn.type = 'button';
    confirmBtn.textContent = 'Gunakan Data Mitra (Komit Non-hutan)';
    confirmBtn.addEventListener('click', () => {
      if (!this.currentPartnerPreview || this.currentPartnerPreview.permissionBlocked) {
        alert('Penggunaan ulang diblokir karena status izin pada mode sumber belum terverifikasi.');
        return;
      }
      const confirmed = this.partnerReuseWorkflow.confirmPartnerReuse(this.currentPartnerPreview, baseRecords);
      this.workspace.setCase3PrivateCollection({
        meta: {
          id: 'data_hutan_sawit_partisipatif',
          title: 'Koleksi Kehutanan Terpadu (Kasus 3)',
          category: 'Koleksi Mitra Terpadu',
          description: 'Koleksi tutupan lahan kehutanan terpadu (Hutan dan Non-hutan dari mitra).',
          isPrimary: false,
          isPrivate: true,
          featureCount: confirmed.totalCount
        },
        records: confirmed.combinedRecords,
        addedCount: confirmed.addedCount
      });

      this.dialog.close();
      this.noticeMessage = `Berhasil memproyeksikan ${confirmed.addedCount} titik mitra ke kelas Non-hutan (Total: ${confirmed.totalCount} titik).`;
      this.updateErrorBanner();
    });
    footer.appendChild(confirmBtn);

    container.appendChild(footer);
    this.dialog.open(container);
  }

  // ==========================================
  // CASE 4: QUALITY REVIEW & TIER CLASSIFICATION
  // ==========================================

  async openReviewModal() {
    let generalRecords = [];
    try {
      const gDataset = await loadDataset('case4_data_kombinasi_f');
      generalRecords = gDataset.records;
    } catch (err) {
      console.warn('Gagal memuat dataset kombinasi Kasus 4:', err);
    }

    let queue = this.reviewWorkflow.queue;
    if (!queue || queue.length === 0) {
      if (this.workspace.case4Queue && this.workspace.case4Queue.length > 0) {
        queue = [...this.workspace.case4Queue];
        this.reviewWorkflow.queue = queue;
      } else {
        queue = this.reviewWorkflow.buildQueue(this.workspace.case2ScreenSubmissions, generalRecords);
        this.workspace.case4Queue = [...queue];
        this.workspace.saveProject();
      }
    }

    // Prepend any new screen submissions from Case 2 if not yet in queue
    if (this.workspace.case2ScreenSubmissions && this.workspace.case2ScreenSubmissions.length > 0) {
      for (const sub of this.workspace.case2ScreenSubmissions) {
        if (!queue.some(item => item.observation_id === sub.observation_id)) {
          const mapped = mapScreenSubmissionToCase4(sub);
          queue.unshift({
            ...mapped,
            review_priority: 'high'
          });
          this.workspace.case4Queue = [...queue];
          this.workspace.saveProject();
        }
      }
    }

    // Sync queue items with current persisted interpretations
    if (this.workspace.case4Interpretations) {
      for (let i = 0; i < queue.length; i++) {
        const interp = this.workspace.case4Interpretations[queue[i].observation_id];
        if (interp) {
          queue[i] = {
            ...queue[i],
            project_class_id: interp.project_class_id !== undefined ? interp.project_class_id : queue[i].project_class_id,
            project_class_label: interp.project_class_label !== undefined ? interp.project_class_label : queue[i].project_class_label,
            quality_tier: interp.quality_tier !== undefined ? interp.quality_tier : queue[i].quality_tier,
            review_status: interp.review_status !== undefined ? interp.review_status : queue[i].review_status,
            interpretation_version: interp.interpretation_version !== undefined ? interp.interpretation_version : queue[i].interpretation_version,
            reviews: interp.reviews || queue[i].reviews || [],
            adopted_event: interp.adopted_event || queue[i].adopted_event || null
          };
        }
      }
    }

    const container = document.createElement('div');

    const header = document.createElement('div');
    header.className = 'modal-header';
    const title = document.createElement('h3');
    title.className = 'modal-title';
    title.textContent = 'Telaah Mutu Buta Independen (Role C)';
    header.appendChild(title);

    const subtitle = document.createElement('p');
    subtitle.className = 'modal-subtitle';
    subtitle.textContent = 'Skema 5 Target Kelas: Hutan, Kebun sawit, Kebun karet, Sawah, Lainnya. Penelaahan dilakukan secara independen tanpa melihat label awal.';
    header.appendChild(subtitle);
    container.appendChild(header);

    const body = document.createElement('div');
    body.className = 'modal-body';

    // Reviewer selector bar
    const revBar = document.createElement('div');
    revBar.className = 'reviewer-selector-bar';
    revBar.innerHTML = `
      <span class="reviewer-label">Peran Penelaah Aktif:</span>
      <select class="reviewer-select" id="sim-reviewer-select">
        ${SIMULATED_REVIEWERS.map(r => `
          <option value="${r.id}" ${r.id === this.reviewWorkflow.activeReviewerId ? 'selected' : ''}>
            ${r.name} (${r.affiliation})
          </option>
        `).join('')}
      </select>
      <span class="simulated-pill-badge">Simulasi Peran</span>
    `;
    body.appendChild(revBar);

    const reviewCardsContainer = document.createElement('div');
    body.appendChild(reviewCardsContainer);

    const renderQueue = () => {
      reviewCardsContainer.innerHTML = '';
      const activeReviewerId = this.reviewWorkflow.activeReviewerId;

      for (const item of queue.slice(0, 4)) {
        const card = document.createElement('div');
        card.className = 'blind-review-card';

        const blindModel = this.reviewWorkflow.getBlindReviewCard(item, activeReviewerId);

        let priorityBadge = '';
        if (item.review_priority === 'high') {
          priorityBadge = '<span style="background-color: #fef08a; color: #854d0e; padding: 2px 6px; border-radius: 4px; font-weight: 700; font-size: 0.68rem;">Prioritas Tinggi (Sampling Layar)</span>';
        }

        let disputeBadge = '';
        let tierBadge = '';
        if (blindModel.hasCurrentReviewerSubmitted || item.review_status === REVIEW_STATUSES.ADOPTED) {
          if (item.review_status === REVIEW_STATUSES.DISPUTED) {
            disputeBadge = `<span class="dispute-badge">Sengketa / Perbedaan Pendapat (${escapeHtml(item.dispute_reason)})</span>`;
          }
          tierBadge = `<span class="tier-badge tier-badge-${item.quality_tier || 4}">Tier ${item.quality_tier || 4}</span>`;
        } else {
          tierBadge = '<span class="tier-badge" style="background:#e2e8f0;color:#64748b;">Mutu: Disembunyikan (Buta)</span>';
        }

        card.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
            <span style="font-weight: 700; font-size: 0.8rem;">Observasi: <code>${escapeHtml(item.observation_id)}</code> (v${blindModel.version})</span>
            <div style="display: flex; gap: 6px; align-items: center;">
              ${priorityBadge}
              ${disputeBadge}
              ${tierBadge}
            </div>
          </div>
          <div class="blind-banner">
            <strong>Penelaahan Buta (Blind Review):</strong> Label awal, tingkat mutu, dan ulasan penelaah lain disembunyikan sampai Anda mengirimkan ulasan independen.
          </div>
          <div style="font-size: 0.74rem; color: #475569; line-height: 1.4; margin-bottom: 8px;">
            <p><strong>Koordinat:</strong> ${blindModel.coordinates[1].toFixed(5)}, ${blindModel.coordinates[0].toFixed(5)}</p>
            <p><strong>Rujukan Citra:</strong> ${escapeHtml(blindModel.imageryRef)}</p>
            <p><strong>Tahun Observasi:</strong> ${escapeHtml(blindModel.observedYear)} | <strong>Metode:</strong> ${escapeHtml(blindModel.method)}</p>
            <p><strong>Ketidakpastian:</strong> ${escapeHtml(blindModel.uncertainty)}</p>
          </div>
        `;

        if (item.review_status === REVIEW_STATUSES.ADOPTED) {
          const adoptedNotice = document.createElement('div');
          adoptedNotice.style.backgroundColor = '#ecfdf5';
          adoptedNotice.style.border = '1px solid #a7f3d0';
          adoptedNotice.style.color = '#065f46';
          adoptedNotice.style.padding = '8px';
          adoptedNotice.style.borderRadius = '4px';
          adoptedNotice.style.fontSize = '0.74rem';
          adoptedNotice.innerHTML = `
            <strong>Telah Diadopsi Resmi (Tier 2):</strong> Kelas <strong>${escapeHtml(item.project_class_label)}</strong> diadopsi oleh <code>${escapeHtml(item.adopted_event?.adopted_by || 'pemilik_a')}</code>.
            <br>Alasan: <em>${escapeHtml(item.adopted_event?.reason || '')}</em>
          `;
          card.appendChild(adoptedNotice);

        } else if (blindModel.hasCurrentReviewerSubmitted) {
          const submittedNotice = document.createElement('div');
          submittedNotice.style.backgroundColor = '#ecfdf5';
          submittedNotice.style.border = '1px solid #a7f3d0';
          submittedNotice.style.color = '#065f46';
          submittedNotice.style.padding = '8px';
          submittedNotice.style.borderRadius = '4px';
          submittedNotice.style.fontSize = '0.74rem';
          submittedNotice.innerHTML = `
            <strong>Ulasan Terkirim:</strong> Penelaah ini telah mengirimkan ulasan untuk versi ${blindModel.version}.
            <br>Label awal asli: <em>${escapeHtml(blindModel.blindedInitialClass)}</em>
          `;
          card.appendChild(submittedNotice);

          // If agreed candidate, show adoption section with actor switch and mandatory reason
          if (item.review_status === REVIEW_STATUSES.AGREED_CANDIDATE) {
            const adoptBox = document.createElement('div');
            adoptBox.className = 'adopt-candidate-box';
            adoptBox.style.marginTop = '8px';
            adoptBox.style.padding = '8px';
            adoptBox.style.backgroundColor = '#f0fdf4';
            adoptBox.style.border = '1px solid #bbf7d0';
            adoptBox.style.borderRadius = '4px';
            adoptBox.innerHTML = `
              <div style="font-weight: 700; font-size: 0.74rem; color: #166534; margin-bottom: 6px;">
                Kandidat Adopsi Sepakat: ${escapeHtml(item.agreed_class_label)}
              </div>
              <div style="margin-bottom: 6px;">
                <label for="adopt-actor-select-${escapeHtml(item.observation_id)}" style="display: block; font-size: 0.72rem; font-weight: 700; color: #1e293b; margin-bottom: 2px;">
                  Aktor Pengadopsi (Wajib):
                </label>
                <select id="adopt-actor-select-${escapeHtml(item.observation_id)}" class="adopt-actor-select" style="width: 100%; padding: 4px; font-size: 0.72rem; border-radius: 4px; border: 1px solid #cbd5e1;">
                  <option value="">-- Pilih Aktor Pengadopsi --</option>
                  <option value="pemilik_a">Pemilik Data (pemilik_a)</option>
                  <option value="admin">Administrator Simulasi (admin)</option>
                </select>
              </div>
              <div style="margin-bottom: 6px;">
                <label for="adopt-reason-${escapeHtml(item.observation_id)}" style="display: block; font-size: 0.72rem; font-weight: 700; margin-bottom: 2px;">
                  Alasan Adopsi Resmi (Wajib):
                </label>
                <input type="text" id="adopt-reason-${escapeHtml(item.observation_id)}" class="adopt-reason-input" placeholder="Tuliskan alasan adopsi resmi..." style="width: 100%; padding: 4px; font-size: 0.72rem; border-radius: 4px; border: 1px solid #cbd5e1;">
              </div>
              <button type="button" class="btn-adopt-candidate" style="background-color: #059669; border: 1px solid #059669; color: #ffffff; padding: 6px 12px; border-radius: 6px; font-size: 0.74rem; font-weight: 700; cursor: pointer;">
                Adopsi Klasifikasi Sepakat (${escapeHtml(item.agreed_class_label)})
              </button>
            `;

            const btnAdopt = adoptBox.querySelector('.btn-adopt-candidate');
            btnAdopt.addEventListener('click', () => {
              const actorSel = adoptBox.querySelector('.adopt-actor-select').value;
              if (!actorSel) {
                alert('Aktor pengadopsi wajib dipilih secara eksplisit.');
                return;
              }
              const reasonInp = adoptBox.querySelector('.adopt-reason-input').value.trim();
              if (!reasonInp) {
                alert('Alasan adopsi resmi wajib diisi.');
                return;
              }
              try {
                const adoptedPoint = this.reviewWorkflow.adoptCandidate(item.observation_id, actorSel, reasonInp);
                this.workspace.recordAdoption(adoptedPoint.adopted_event);
                this.workspace.updateRecordInterpretation(adoptedPoint);
                this.workspace.case4Queue = [...queue];
                this.workspace.saveProject();
                renderQueue();
                this.noticeMessage = `Klasifikasi ${adoptedPoint.project_class_label} untuk ${adoptedPoint.observation_id} berhasil diadopsi resmi oleh ${actorSel}.`;
                this.updateErrorBanner();
              } catch (err) {
                alert(`Gagal mengadopsi: ${err.message}`);
              }
            });

            card.appendChild(adoptBox);
          }

        } else if (blindModel.isContributorSelf) {
          const selfNotice = document.createElement('div');
          selfNotice.style.backgroundColor = '#fef2f2';
          selfNotice.style.border = '1px solid #fecaca';
          selfNotice.style.color = '#991b1b';
          selfNotice.style.padding = '6px';
          selfNotice.style.borderRadius = '4px';
          selfNotice.style.fontSize = '0.72rem';
          selfNotice.textContent = 'Penelaahan ditolak: Penelaah aktif adalah pemilik/kontributor observasi ini (self-review tidak diizinkan). Silakan beralih ke penelaah independen lain.';
          card.appendChild(selfNotice);

        } else {
          // Review form with separate mandatory reason and evidence starting blank
          const revForm = document.createElement('div');
          revForm.className = 'rev-form';
          revForm.style.display = 'flex';
          revForm.style.flexDirection = 'column';
          revForm.style.gap = '6px';
          revForm.style.marginTop = '8px';
          revForm.style.padding = '8px';
          revForm.style.backgroundColor = '#f8fafc';
          revForm.style.border = '1px solid #e2e8f0';
          revForm.style.borderRadius = '4px';

          revForm.innerHTML = `
            <div>
              <label style="display: block; font-size: 0.72rem; font-weight: 700; margin-bottom: 2px;">Usulkan Kelas Target:</label>
              <select class="rev-class-sel" style="width: 100%; padding: 4px; font-size: 0.74rem; border-radius: 4px; border: 1px solid #cbd5e1;">
                <option value="">-- Pilih Kelas Usulan --</option>
                <option value="1">1. Hutan</option>
                <option value="2">2. Kebun sawit</option>
                <option value="3">3. Kebun karet</option>
                <option value="4">4. Sawah</option>
                <option value="5">5. Lainnya</option>
              </select>
            </div>
            <div>
              <label style="display: block; font-size: 0.72rem; font-weight: 700; margin-bottom: 2px;">Alasan Ulasan (Wajib):</label>
              <input type="text" class="rev-reason-inp" value="" placeholder="Tuliskan alasan interpretasi..." style="width: 100%; padding: 4px; font-size: 0.74rem; border-radius: 4px; border: 1px solid #cbd5e1;">
            </div>
            <div>
              <label style="display: block; font-size: 0.72rem; font-weight: 700; margin-bottom: 2px;">Bukti Independen (Wajib):</label>
              <input type="text" class="rev-evidence-inp" value="" placeholder="Rujukan citra / bukti pengamatan..." style="width: 100%; padding: 4px; font-size: 0.74rem; border-radius: 4px; border: 1px solid #cbd5e1;">
            </div>
            <button type="button" class="btn-primary send-rev-btn" style="padding: 6px 12px; font-size: 0.74rem; align-self: flex-end; margin-top: 4px;">
              Kirim Ulasan
            </button>
          `;

          const sendRevBtn = revForm.querySelector('.send-rev-btn');
          sendRevBtn.addEventListener('click', () => {
            const chosenClass = revForm.querySelector('.rev-class-sel').value;
            const enteredReason = revForm.querySelector('.rev-reason-inp').value.trim();
            const enteredEvidence = revForm.querySelector('.rev-evidence-inp').value.trim();

            if (!chosenClass) {
              alert('Silakan pilih kelas usulan terlebih dahulu.');
              return;
            }
            if (!enteredReason) {
              alert('Alasan ulasan wajib diisi (tidak boleh kosong).');
              return;
            }
            if (!enteredEvidence) {
              alert('Bukti independen wajib diisi (tidak boleh kosong).');
              return;
            }

            try {
              const res = this.reviewWorkflow.submitReview({
                observationId: item.observation_id,
                reviewerId: activeReviewerId,
                proposedClassId: Number(chosenClass),
                reason: enteredReason,
                evidence: enteredEvidence,
                version: blindModel.version
              });
              this.workspace.recordReview(res.updatedRecord.reviews.at(-1));
              this.workspace.updateRecordInterpretation(res.updatedRecord);
              this.workspace.case4Queue = [...queue];
              this.workspace.saveProject();
              renderQueue();
            } catch (err) {
              alert(err.message);
            }
          });

          card.appendChild(revForm);
        }

        reviewCardsContainer.appendChild(card);
      }
    };

    const selDropdown = revBar.querySelector('#sim-reviewer-select');
    selDropdown.addEventListener('change', (e) => {
      this.reviewWorkflow.setActiveReviewer(e.target.value);
      renderQueue();
    });

    renderQueue();
    container.appendChild(body);

    const footer = document.createElement('div');
    footer.className = 'modal-footer';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'btn-secondary';
    closeBtn.type = 'button';
    closeBtn.textContent = 'Tutup';
    closeBtn.addEventListener('click', () => this.dialog.close());
    footer.appendChild(closeBtn);

    container.appendChild(footer);
    this.dialog.open(container);
  }

  // ==========================================
  // EXPORT FLOW (CONTEXT-AWARE & QUALITY GATED)
  // ==========================================

  openExportModal() {
    const isScenario = this.workspace.activeMode === MODES.SCENARIO;
    const caseId = this.workspace.activeCaseId;
    const activeSchema = this.workspace.getActiveSchema();
    const container = document.createElement('div');

    const header = document.createElement('div');
    header.className = 'modal-header';
    const title = document.createElement('h3');
    title.className = 'modal-title';
    title.textContent = 'Ekspor Dataset Pelatihan Luma';
    header.appendChild(title);

    const subtitle = document.createElement('p');
    subtitle.className = 'modal-subtitle';
    subtitle.textContent = `Paket data pelatihan untuk koleksi aktif (${isScenario ? 'Mode Skenario' : 'Mode Sumber'}) siap diunduh.`;
    header.appendChild(subtitle);
    container.appendChild(header);

    const body = document.createElement('div');
    body.className = 'modal-body';

    let selectedQualityFilter = 'all';
    let ackWarnings = false;
    let confirmPartialExport = false;

    // Evaluate export eligibility under private training purpose
    const getEval = () => {
      return evaluateExportEligibility(this.workspace.activeRecords || [], {
        mode: this.workspace.activeMode,
        activeSchema,
        purpose: EXPORT_PURPOSES.PRIVATE_TRAINING,
        qualityFilter: selectedQualityFilter,
        currentUserRole: 'pemilik_a'
      });
    };

    // Quality filter selection
    const filterContainer = document.createElement('div');
    filterContainer.className = 'export-filter-container';
    filterContainer.style.background = '#f8fafc';
    filterContainer.style.border = '1px solid #e2e8f0';
    filterContainer.style.borderRadius = '6px';
    filterContainer.style.padding = '8px 12px';
    filterContainer.style.marginBottom = '12px';
    filterContainer.style.fontSize = '0.74rem';

    filterContainer.innerHTML = `
      <div style="font-weight: 700; margin-bottom: 6px; color: #334155;">Pilihan Penyaringan Mutu Data:</div>
      <label style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px; cursor: pointer;">
        <input type="radio" name="export-quality-filter" value="all" checked>
        <span>Semua data terverifikasi spasial (termasuk yang belum ditelaah independen)</span>
      </label>
      <label style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px; cursor: pointer;">
        <input type="radio" name="export-quality-filter" value="tier2_and_3">
        <span>Hanya data yang telah ditelaah (Tier 2 Konsensus &amp; Tier 3 Telaah Tunggal)</span>
      </label>
      <label style="display: flex; align-items: center; gap: 6px; cursor: pointer;">
        <input type="radio" name="export-quality-filter" value="tier2_only">
        <span>Hanya data dengan konsensus penuh (Tier 2)</span>
      </label>
    `;
    body.appendChild(filterContainer);

    filterContainer.querySelectorAll('input[name="export-quality-filter"]').forEach((radio) => {
      radio.addEventListener('change', (e) => {
        selectedQualityFilter = e.target.value;
        updateView();
      });
    });

    // Warning disclosure container
    const warningDisclosureContainer = document.createElement('div');
    warningDisclosureContainer.className = 'export-warning-disclosure-wrapper';
    body.appendChild(warningDisclosureContainer);

    const summary = document.createElement('div');
    body.appendChild(summary);

    const partialConfirmationContainer = document.createElement('div');
    partialConfirmationContainer.className = 'partial-export-confirmation-container';
    partialConfirmationContainer.style.marginTop = '10px';
    body.appendChild(partialConfirmationContainer);

    container.appendChild(body);

    const footer = document.createElement('div');
    footer.className = 'modal-footer';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn-secondary';
    cancelBtn.type = 'button';
    cancelBtn.textContent = 'Batal';
    cancelBtn.addEventListener('click', () => this.dialog.close());
    footer.appendChild(cancelBtn);

    const exportBtn = document.createElement('button');
    exportBtn.className = 'btn-primary';
    exportBtn.type = 'button';
    exportBtn.textContent = 'Unduh Paket ZIP';
    footer.appendChild(exportBtn);

    const updateView = () => {
      const evalRes = getEval();
      const eligibleCount = evalRes.eligible.length;
      const excludedCount = evalRes.counts.excluded;
      const totalCount = evalRes.counts.total;
      const hasWarnings = Array.isArray(evalRes.unknownMetadataWarnings) && evalRes.unknownMetadataWarnings.length > 0;

      // Render warnings disclosure
      if (hasWarnings) {
        warningDisclosureContainer.innerHTML = `
          <div class="export-warning-disclosure" style="background: #FAEDF2; border: 1px solid #E09EB8; border-radius: 6px; padding: 10px 12px; margin-bottom: 12px; font-size: 0.74rem; color: #5F037E;">
            <div style="font-weight: 700; margin-bottom: 4px;">Pemberitahuan Metadata Observasi:</div>
            <ul style="padding-left: 18px; margin: 4px 0 8px 0; color: #334155;">
              ${evalRes.unknownMetadataWarnings.map(w => `<li>${escapeHtml(w)}</li>`).join('')}
            </ul>
            <label style="display: flex; align-items: flex-start; gap: 8px; cursor: pointer; font-weight: 600; color: #A33960;">
              <input type="checkbox" id="chk-ack-warnings" ${ackWarnings ? 'checked' : ''} style="margin-top: 2px;">
              <span>Saya memahami dan menerima catatan metadata di atas untuk keperluan pelatihan mandiri (Private Training).</span>
            </label>
          </div>
        `;
        const chkAck = warningDisclosureContainer.querySelector('#chk-ack-warnings');
        chkAck.addEventListener('change', (e) => {
          ackWarnings = e.target.checked;
          checkButtonState();
        });
      } else {
        warningDisclosureContainer.innerHTML = '';
        ackWarnings = true;
      }

      // Partial export confirmation requirement (only when 0 < eligible < total)
      if (eligibleCount > 0 && excludedCount > 0) {
        partialConfirmationContainer.innerHTML = `
          <label style="display: flex; align-items: flex-start; gap: 8px; padding: 10px; background: #fff1f2; border: 1px solid #fecdd3; border-radius: 6px; font-size: 0.74rem; color: #9f1239; cursor: pointer;">
            <input type="checkbox" id="chk-confirm-partial" ${confirmPartialExport ? 'checked' : ''} style="margin-top: 2px;">
            <span><strong>Konfirmasi Ekspor Parsial Diperlukan:</strong> Saya menyetujui bahwa ${excludedCount} titik yang tidak memenuhi syarat akan dikecualikan dan hanya ${eligibleCount} titik yang akan dimasukkan ke dalam paket data pelatihan Luma.</span>
          </label>
        `;
        const chkConfirm = partialConfirmationContainer.querySelector('#chk-confirm-partial');
        chkConfirm.addEventListener('change', (e) => {
          confirmPartialExport = e.target.checked;
          checkButtonState();
        });
      } else {
        partialConfirmationContainer.innerHTML = '';
        confirmPartialExport = true;
      }

      const checkButtonState = () => {
        const canExport = eligibleCount > 0 &&
          (!hasWarnings || ackWarnings) &&
          (excludedCount === 0 || confirmPartialExport);
        exportBtn.disabled = !canExport;
      };

      checkButtonState();

      const reasonList = Object.entries(evalRes.counts.byReason)
        .map(([r, cnt]) => `<li>${escapeHtml(r)}: ${cnt} titik</li>`)
        .join('');

      summary.innerHTML = `
        <p style="font-size: 0.8rem; margin-bottom: 8px;"><strong>Dataset Aktif:</strong> ${this.workspace.activeDatasetMeta ? escapeHtml(this.workspace.activeDatasetMeta.title) : 'Koleksi Aktif'}</p>
        <p style="font-size: 0.8rem; margin-bottom: 8px;"><strong>Jumlah Titik Memenuhi Syarat Ekspor:</strong> ${eligibleCount} titik (${excludedCount} titik dikecualikan dari total ${totalCount} titik)</p>
        ${eligibleCount === 0 ? `<div style="padding: 8px 12px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 6px; color: #dc2626; font-size: 0.74rem; margin-bottom: 8px;">Tidak ada observasi yang memenuhi syarat untuk diekspor dalam konfigurasi filter saat ini.</div>` : ''}
        ${excludedCount > 0 ? `<ul style="font-size: 0.72rem; color: #64748b; padding-left: 18px; margin-bottom: 8px;">${reasonList}</ul>` : ''}
        <details class="export-components-details" style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px; font-size: 0.74rem; color: #334155; margin-bottom: 12px;">
          <summary style="font-weight: 600; color: #5F037E; cursor: pointer;">Rincian Berkas dalam Paket ZIP</summary>
          <ul style="padding-left: 18px; margin-top: 6px;">
            <li>ESRI Point Shapefile (<code>training_points.shp</code>, .shx, .dbf, .prj, .cpg) dengan <code>class_id</code> numerik atribut pertama</li>
            <li>Tabel CSV pendamping dengan metadata sumber asli terpisah dari asumsi skenario (<code>training_points.csv</code>)</li>
            <li>GeoJSON FeatureCollection (<code>training_points.geojson</code>)</li>
            <li>Manifest JSON (<code>manifest.json</code>) dengan status verifikasi penerima: Belum teruji (untested)</li>
          </ul>
        </details>
      `;
    };

    updateView();

    exportBtn.addEventListener('click', async () => {
      exportBtn.disabled = true;
      exportBtn.textContent = 'Membuat Paket...';

      try {
        const evalRes = getEval();
        if (evalRes.eligible.length === 0) {
          throw new Error('Tidak ada titik observasi yang memenuhi syarat untuk diekspor.');
        }
        const hasWarnings = Array.isArray(evalRes.unknownMetadataWarnings) && evalRes.unknownMetadataWarnings.length > 0;
        if (hasWarnings && !ackWarnings) {
          throw new Error('Persetujuan catatan metadata diperlukan sebelum mengunduh paket.');
        }
        if (evalRes.counts.excluded > 0 && !confirmPartialExport) {
          throw new Error('Konfirmasi ekspor parsial diperlukan sebelum mengunduh paket.');
        }

        const targetClasses = caseId === 4
          ? Object.values(CASE4_TARGET_CLASSES)
          : (caseId === 3 ? Object.values(CASE3_FORESTRY_CLASSES) : Object.values(PROJECT_CLASSES));

        const pkg = await createTrainingExportPackage({
          records: evalRes.eligible,
          datasetId: this.workspace.activeDatasetId,
          datasetName: this.workspace.activeDatasetMeta ? this.workspace.activeDatasetMeta.title : 'Koleksi Aktif',
          classCounts: evalRes.counts.byClass,
          targetClasses,
          exclusions: evalRes.excluded,
          mode: this.workspace.activeMode,
          assumptions: isScenario ? ['Observasi diasumsikan untuk percontohan lokal', 'Hak akses disimulasikan'] : [],
          purpose: EXPORT_PURPOSES.PRIVATE_TRAINING,
          acknowledgements: hasWarnings && ackWarnings ? ['Pengguna menerima catatan metadata untuk keperluan pelatihan mandiri'] : [],
          unknownMetadataWarnings: evalRes.unknownMetadataWarnings || []
        });

        if (pkg.blob) {
          triggerBrowserDownload(pkg.blob, `training_points_${this.workspace.activeDatasetId}.zip`);
        }

        this.dialog.close();
        this.noticeMessage = `Paket data pelatihan berhasil dibuat (${evalRes.eligible.length} titik). Status verifikasi penerima: Belum teruji (untested).`;
        this.updateErrorBanner();

      } catch (exportErr) {
        console.error('Export generation error:', exportErr);
        exportBtn.disabled = false;
        exportBtn.textContent = 'Unduh Paket ZIP';
        alert(`Gagal membuat paket ekspor: ${exportErr.message}`);
      }
    });

    container.appendChild(footer);
    this.dialog.open(container);
  }

  // ==========================================
  // RESET DEMO MODAL
  // ==========================================

  openResetConfirmationModal() {
    const container = document.createElement('div');

    const header = document.createElement('div');
    header.className = 'modal-header';
    const title = document.createElement('h3');
    title.className = 'modal-title';
    title.textContent = 'Konfirmasi Reset Percontohan Lokal';
    header.appendChild(title);
    container.appendChild(header);

    const body = document.createElement('div');
    body.className = 'modal-body';
    body.innerHTML = `
      <p style="font-size: 0.8rem; line-height: 1.4; margin-bottom: 8px;">
        Apakah Anda yakin ingin mereset seluruh data percontohan lokal?
      </p>
      <p style="font-size: 0.74rem; color: #64748b; line-height: 1.4;">
        Tindakan ini hanya memengaruhi penyimpanan browser lokal (localStorage). Koleksi Data Campuran #1, donasi Kasus 2, dan riwayat ulasan Kasus 4 akan dihapus, dan aplikasi kembali ke Kasus 1 dengan data sumber primer.
      </p>
    `;
    container.appendChild(body);

    const footer = document.createElement('div');
    footer.className = 'modal-footer';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn-secondary';
    cancelBtn.type = 'button';
    cancelBtn.textContent = 'Batal';
    cancelBtn.addEventListener('click', () => this.dialog.close());
    footer.appendChild(cancelBtn);

    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'btn-primary';
    confirmBtn.type = 'button';
    confirmBtn.textContent = 'Ya, Reset Sekarang';
    confirmBtn.addEventListener('click', async () => {
      this.workspace.resetWorkspace();
      await this.switchDataset('data_kebun_sawit_karet_f');
      this.dialog.close();
      this.noticeMessage = 'Status percontohan lokal berhasil direset ke kondisi awal.';
      this.updateErrorBanner();
    });
    footer.appendChild(confirmBtn);

    container.appendChild(footer);
    this.dialog.open(container);
  }

  /**
   * Updates error/notice banner display with transient notice support.
   */
  updateErrorBanner() {
    if (!this.errorBanner) return;
    const isError = Boolean(this.boundaryError || this.datasetError);
    const messages = [];
    if (this.boundaryError) messages.push(this.boundaryError);
    if (this.datasetError) messages.push(this.datasetError);
    if (this.noticeMessage) messages.push(this.noticeMessage);

    if (this.noticeTimeout) {
      clearTimeout(this.noticeTimeout);
      this.noticeTimeout = null;
    }

    if (messages.length > 0) {
      this.errorBanner.textContent = messages.join(' | ');
      this.errorBanner.style.display = 'block';

      if (isError) {
        this.errorBanner.style.backgroundColor = '#fef2f2';
        this.errorBanner.style.borderColor = '#fecaca';
        this.errorBanner.style.color = '#dc2626';
      } else {
        // Transient Luma tinted notice
        this.errorBanner.style.backgroundColor = '#FAEDF2';
        this.errorBanner.style.borderColor = '#CC4778';
        this.errorBanner.style.color = '#5F037E';

        this.noticeTimeout = setTimeout(() => {
          this.noticeMessage = null;
          this.updateErrorBanner();
        }, 5000);
      }
    } else {
      this.errorBanner.textContent = '';
      this.errorBanner.style.display = 'none';
    }
  }
}

// Bootstrap on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  const app = new PortalApp();
  window.portalApp = app;
  app.init().catch(err => {
    console.error('Unhandled app startup exception:', err);
  });
});
