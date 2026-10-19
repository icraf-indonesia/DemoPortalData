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

import { WorkspaceState } from './state/workspace.js?v=20261015_4';
import { loadCatalogue, loadBoundary, loadDataset, CATALOGUE_DEFINITIONS } from './data/catalogue.js?v=20261015_4';
import { MapView } from './ui/map.js?v=20261015_4';
import { ClassificationView } from './ui/classification.js?v=20261015_4';
import { CatalogueView } from './ui/catalogue.js?v=20261015_4';
import { AttributeTableView } from './ui/attribute-table.js?v=20261015_4';
import { LayoutController } from './ui/layout.js?v=20261015_4';
import { ModalDialog } from './ui/dialog.js?v=20261015_4';
import { ComplementWorkflow, REF_MOD_2B_CLASSES, getComplementClassesForSource } from './features/complement.js?v=20261015_4';
import { ContributionWorkflow, SAMPLING_ORIGINS, REVIEW_PRIORITIES } from './features/contribute.js?v=20261015_4';
import { extractPrimitivesForRecords, loadPrimitivesReference } from './features/primitives.js';
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
} from './demo/scenarios.js?v=20261015_4';
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
import { DEMO_USERS, authenticateUser, getUserById, getUserByCaseId } from './features/auth.js';

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getDatasetComplementMeta(item) {
  if (!item) return { title: '', contributor: '', year: 2025, location: 'Kabupaten Banyuasin', category: 'Data Terbuka', rights: 'Terbuka', hasLabel: true };
  if (item.isPublished || item.category === 'Publikasi Mandiri') {
    return {
      title: item.title,
      contributor: item.institution || 'ICRAF Indonesia',
      year: item.year || 2026,
      location: item.location || 'Kabupaten Banyuasin',
      category: 'Publikasi Mandiri',
      rights: 'Terbuka (Mandiri)',
      hasLabel: true
    };
  }
  switch (item.id) {
    case 'data_ref_mod_2b':
      return {
        title: 'Data Referensi Modular (2b)',
        contributor: 'Tim Telaah Mitra (2025)',
        year: 2025,
        location: item.location || 'Kabupaten Banyuasin',
        category: 'Data Referensi',
        rights: 'Izin Terbuka Simulasi Mitra',
        hasLabel: true
      };
    case 'data_sawah':
      return {
        title: 'Data Lahan Sawah',
        contributor: 'Dinas Pertanian (2025)',
        year: 2025,
        location: item.location || 'Kabupaten Banyuasin',
        category: 'Kontribusi Pengguna',
        rights: 'Terbuka (Mitra Pertanian)',
        hasLabel: true
      };
    case 'data_hutan':
      return {
        title: 'Data Tutupan Hutan',
        contributor: 'Instansi Kehutanan B (2024)',
        year: 2024,
        location: item.location || 'Kabupaten Banyuasin',
        category: 'Kontribusi Pengguna',
        rights: 'Terbuka (Instansi Kehutanan B)',
        hasLabel: true
      };
    case 'data_ref_mod_f':
      return {
        title: 'Data Referensi Modular (2a)',
        contributor: 'Koleksi Referensi (2024)',
        year: 2024,
        location: item.location || 'Kabupaten Banyuasin',
        category: 'Data Referensi',
        rights: 'Terbuka (Modular)',
        hasLabel: false
      };
    case 'data_campuran_1':
      return {
        title: item.title || 'Data Campuran #1 (Sawit, Karet & Lainnya)',
        contributor: 'Pengguna A (2025–2026)',
        year: '2025–2026',
        location: item.location || 'Kabupaten Banyuasin',
        category: 'Data Campuran (Rujukan)',
        rights: 'Izin Terbuka (Koleksi Pengguna)',
        hasLabel: true
      };
    case 'case4_data_kombinasi_f':
      return {
        title: 'Data Kombinasi Multi-Sumber',
        contributor: 'Konsorsium Mitra (2025)',
        year: 2025,
        location: item.location || 'Kabupaten Banyuasin',
        category: 'Koleksi Terpadu (Kasus 4)',
        rights: 'Terbuka (Multi-Sumber)',
        hasLabel: true
      };
    default:
      return {
        title: item.title || item.id,
        contributor: item.institution || 'Tim Epistem',
        year: item.year || 2025,
        location: item.location || 'Kabupaten Banyuasin',
        category: item.category || 'Data Terbuka',
        rights: 'Terbuka',
        hasLabel: true
      };
  }
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
    this.currentUser = null;

    // Feature workflows
    this.complementWorkflow = new ComplementWorkflow(this.workspace);
    this.contributionWorkflow = new ContributionWorkflow(this.workspace);
    this.partnerReuseWorkflow = new PartnerReuseWorkflow(this.workspace);
    this.reviewWorkflow = new ReviewWorkflow(this.workspace);

    // Case 1: Complement search and filter state
    this.complementSearchQuery = '';
    this.complementFilterCategory = 'all';
    this.complementFilterLocation = 'all';
    this.complementFilterYear = 'all';
    this.complementFilterLabel = 'all';

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
        onDownloadDataset: (id) => this.downloadPublishedGeoJson(id),
        onOpenExplore: () => this.openComplementModal()
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

    // Sync User & Case Role Selector
    const selectUserRole = document.getElementById('select-active-user-header') || document.getElementById('select-user-role');
    const popoverUserRole = document.getElementById('popover-user-role-select');

    this.syncCase = async (caseKey) => {
      let caseId = 1;
      let userId = 'user_a';
      let targetDataset = 'data_kebun_sawit_karet_f';

      if (caseKey === 'case_2' || caseKey === 2) {
        caseId = 2;
        userId = 'user_a';
        targetDataset = this.workspace.case2DonatedCollection
          ? this.workspace.case2DonatedCollection.meta.id
          : 'data_kebun_sawit_karet_f';
      } else if (caseKey === 'case_3' || caseKey === 3 || caseKey === 'user_b') {
        caseId = 3;
        userId = 'user_b';
        targetDataset = this.workspace.case3PrivateCollection
          ? this.workspace.case3PrivateCollection.meta.id
          : 'data_hutan';
      } else if (caseKey === 'case_4' || caseKey === 4 || caseKey === 'user_c') {
        caseId = 4;
        userId = 'user_c';
        targetDataset = 'case4_data_kombinasi_f';
      } else {
        caseId = 1;
        userId = 'user_a';
        targetDataset = this.workspace.mixedDataset
          ? 'data_campuran_1'
          : 'data_kebun_sawit_karet_f';
      }

      const normalizedKey = `case_${caseId}`;
      if (selectUserRole) selectUserRole.value = normalizedKey;
      if (popoverUserRole) popoverUserRole.value = normalizedKey;

      // Disable sampling mode if switching away from case 2
      if (caseId !== 2 && this.workspace.isSamplingActive) {
        this.toggleMapSampling();
      }

      this.workspace.setCase(caseId);
      this.workspace.setActiveUser(userId);
      this.updateCaseNavHighlight(caseId);
      if (this.currentUser && this.currentUser.id === 'admin') {
        this.updateUserProfileUI(this.currentUser);
      } else {
        const matchedUser = getUserByCaseId(caseId);
        if (matchedUser) {
          this.currentUser = matchedUser;
          this.updateUserProfileUI(matchedUser);
        }
      }
      await this.switchDataset(targetDataset);
    };

    const currentCaseKey = this.workspace.getActiveCaseKey ? this.workspace.getActiveCaseKey() : `case_${this.workspace.activeCaseId || 1}`;
    if (selectUserRole) {
      selectUserRole.value = currentCaseKey;
      selectUserRole.addEventListener('change', (e) => this.syncCase(e.target.value));
    }
    if (popoverUserRole) {
      popoverUserRole.value = currentCaseKey;
      popoverUserRole.addEventListener('change', (e) => this.syncCase(e.target.value));
    }

    // Support URL search params e.g. ?case=2
    try {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.has('case')) {
        const c = Number(urlParams.get('case'));
        if (c >= 1 && c <= 4) {
          this.workspace.setCase(c);
        }
      }
    } catch (_) {}

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
      const expectedKey = state.getActiveCaseKey ? state.getActiveCaseKey() : `case_${state.activeCaseId || 1}`;
      if (selectUserRole && selectUserRole.value !== expectedKey) {
        selectUserRole.value = expectedKey;
      }
      if (popoverUserRole && popoverUserRole.value !== expectedKey) {
        popoverUserRole.value = expectedKey;
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

    // 7. Initialize Authentication & User Profile UI
    this.initAuthUI();
  }

  /**
   * Updates user profile pill and popover with active user details.
   * @param {Object} user
   */
  updateUserProfileUI(user) {
    if (!user) return;
    const userAvatarBadge = document.getElementById('user-avatar-badge');
    const userDisplayName = document.getElementById('user-display-name');
    const userDisplayRole = document.getElementById('user-display-role');
    const popoverAvatarBadge = document.getElementById('popover-avatar-badge');
    const popoverUserName = document.getElementById('popover-user-name');
    const popoverUserEmail = document.getElementById('popover-user-email');
    const popoverUserInst = document.getElementById('popover-user-inst');

    if (userAvatarBadge) {
      userAvatarBadge.textContent = user.avatarInitial || 'U';
      userAvatarBadge.style.backgroundColor = user.avatarBg || '#059669';
    }
    if (userDisplayName) userDisplayName.textContent = user.name;
    if (userDisplayRole) userDisplayRole.textContent = user.role;

    if (popoverAvatarBadge) {
      popoverAvatarBadge.textContent = user.avatarInitial || 'U';
      popoverAvatarBadge.style.backgroundColor = user.avatarBg || '#059669';
    }
    if (popoverUserName) popoverUserName.textContent = user.fullName || user.name;
    if (popoverUserEmail) popoverUserEmail.textContent = user.email;
    if (popoverUserInst) popoverUserInst.textContent = user.institution;
  }

  /**
   * Initializes login screen, demo account handlers, and user profile popover controls.
   */
  initAuthUI() {
    const loginScreen = document.getElementById('login-screen');
    const loginForm = document.getElementById('login-form');
    const inputEmail = document.getElementById('input-login-email');
    const inputPassword = document.getElementById('input-login-password');
    const errorBanner = document.getElementById('login-error-banner');
    const btnProfile = document.getElementById('btn-user-profile');
    const popoverProfile = document.getElementById('popover-profile');
    const btnCloseProfile = document.getElementById('btn-close-profile');
    const btnHeaderLogout = document.getElementById('btn-header-logout');

    // Profile Popover Toggle
    if (btnProfile && popoverProfile) {
      btnProfile.addEventListener('click', (e) => {
        e.stopPropagation();
        const isHidden = popoverProfile.style.display === 'none' || !popoverProfile.style.display;
        popoverProfile.style.display = isHidden ? 'block' : 'none';
        btnProfile.setAttribute('aria-expanded', isHidden ? 'true' : 'false');
      });
    }

    if (btnCloseProfile && popoverProfile) {
      btnCloseProfile.addEventListener('click', (e) => {
        e.stopPropagation();
        popoverProfile.style.display = 'none';
        if (btnProfile) btnProfile.setAttribute('aria-expanded', 'false');
      });
    }

    // Dismiss popover on outside click
    document.addEventListener('click', (e) => {
      if (popoverProfile && popoverProfile.style.display !== 'none') {
        const wrapper = document.getElementById('user-profile-wrapper');
        if (wrapper && !wrapper.contains(e.target)) {
          popoverProfile.style.display = 'none';
          if (btnProfile) btnProfile.setAttribute('aria-expanded', 'false');
        }
      }
    });

    // Logout Handler
    const handleLogout = () => {
      this.currentUser = null;
      if (popoverProfile) popoverProfile.style.display = 'none';
      if (btnProfile) btnProfile.setAttribute('aria-expanded', 'false');
      if (inputPassword) inputPassword.value = '';
      if (errorBanner) errorBanner.style.display = 'none';
      if (loginScreen) {
        loginScreen.style.display = 'flex';
        if (inputEmail) inputEmail.focus();
      }
    };

    if (btnHeaderLogout) btnHeaderLogout.addEventListener('click', handleLogout);

    // Login Form Submit
    if (loginForm) {
      loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = inputEmail ? inputEmail.value.trim() : '';
        const password = inputPassword ? inputPassword.value.trim() : '';

        const user = authenticateUser(email, password);
        if (!user) {
          if (errorBanner) {
            errorBanner.textContent = 'Email atau kata sandi tidak valid. Silakan periksa kembali email dan kata sandi Anda.';
            errorBanner.style.display = 'block';
          }
          if (inputPassword) {
            inputPassword.value = '';
            inputPassword.focus();
          }
          return;
        }

        // Login success
        if (errorBanner) errorBanner.style.display = 'none';
        this.currentUser = user;
        this.updateUserProfileUI(user);
        if (loginScreen) loginScreen.style.display = 'none';

        // Automatically launch the corresponding case
        await this.syncCase(user.defaultCaseId);

        // Invalidate map size so Leaflet renders properly
        window.setTimeout(() => {
          if (this.mapView && this.mapView.map) {
            this.mapView.map.invalidateSize();
          }
        }, 150);
      });
    }

    // Check URL parameters for autologin/test mode
    try {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.has('autologin') || urlParams.get('test') === 'true') {
        const autoKey = (urlParams.get('autologin') || '').toLowerCase();
        let autoUser = DEMO_USERS[autoKey] || getUserById(autoKey);
        if (!autoUser && urlParams.has('case')) {
          autoUser = getUserByCaseId(Number(urlParams.get('case')));
        }
        if (!autoUser) autoUser = DEMO_USERS.rizki;

        this.currentUser = autoUser;
        this.updateUserProfileUI(autoUser);
        if (loginScreen) loginScreen.style.display = 'none';
      } else {
        // By default, activate login screen for every launch as requested
        if (loginScreen) loginScreen.style.display = 'flex';
      }
    } catch (_) {
      if (loginScreen) loginScreen.style.display = 'flex';
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

    if (!datasetId) {
      this.workspace.clearActiveDataset();
      return;
    }

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

    const pub = (this.workspace.publishedCollections || []).find(p => p.meta && p.meta.id === datasetId);
    if (pub) {
      this.workspace.setActiveDataset(pub.meta.id, pub.meta, pub.records);
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

  async handleCaseNavigation(caseId) {
    const isAlreadyOnCase = this.workspace.activeCaseId === caseId;
    if (!isAlreadyOnCase) {
      await this.syncCase(`case_${caseId}`);
    }

    if (caseId === 2) {
      this.openContributeModal();
    } else if (caseId === 3 && isAlreadyOnCase) {
      this.openComplementModal();
    } else if (caseId === 4) {
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
      this.scenarioBadge.style.display = 'none';
    }
  }

  // ==========================================
  // CASE 1: STAGED COMPLEMENT FLOW (3-STEP WIZARD)
  // ==========================================

  openComplementModal() {
    this.complementSearchQuery = '';
    this.complementFilterCategory = 'all';
    this.complementFilterLocation = 'all';
    this.complementFilterYear = 'all';
    this.complementFilterLabel = 'all';
    this.renderComplementStepCatalogue();
  }

  renderComplementStepCatalogue() {
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
    subtitle.textContent = 'Cari dan pilih koleksi data terbuka';
    header.appendChild(subtitle);
    container.appendChild(header);

    const body = document.createElement('div');
    body.className = 'modal-body';

    // 1. Search Box
    const searchBox = document.createElement('div');
    searchBox.className = 'complement-search-box';

    const searchIcon = document.createElement('span');
    searchIcon.className = 'complement-search-icon';
    searchIcon.textContent = '🔍';
    searchBox.appendChild(searchIcon);

    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.className = 'complement-search-input';
    searchInput.placeholder = 'Cari nama koleksi, lembaga kontributor, kata kunci...';
    searchInput.value = this.complementSearchQuery;
    searchBox.appendChild(searchInput);
    body.appendChild(searchBox);

    // 2. Filter Grid
    const filterGrid = document.createElement('div');
    filterGrid.className = 'complement-filter-grid';

    // Kategori Filter
    const catGroup = document.createElement('div');
    catGroup.className = 'complement-filter-group';
    const catLabel = document.createElement('label');
    catLabel.className = 'complement-filter-label';
    catLabel.textContent = 'Kategori';
    const catSelect = document.createElement('select');
    catSelect.className = 'complement-filter-select';
    catSelect.innerHTML = `
      <option value="all">Semua Kategori</option>
      <option value="Data Referensi">Data Referensi</option>
      <option value="Kontribusi Pengguna">Kontribusi Pengguna</option>
      <option value="Koleksi Terpadu">Koleksi Terpadu</option>
    `;
    catSelect.value = this.complementFilterCategory;
    catGroup.appendChild(catLabel);
    catGroup.appendChild(catSelect);
    filterGrid.appendChild(catGroup);

    // Lokasi Filter (User requested: "please add filter based on location")
    const locGroup = document.createElement('div');
    locGroup.className = 'complement-filter-group';
    const locLabel = document.createElement('label');
    locLabel.className = 'complement-filter-label';
    locLabel.textContent = 'Lokasi / Wilayah';
    const locSelect = document.createElement('select');
    locSelect.className = 'complement-filter-select';
    locSelect.innerHTML = `
      <option value="all">Semua Lokasi</option>
      <option value="banyuasin">Kabupaten Banyuasin (AOI)</option>
      <option value="sumsel">Provinsi Sumatera Selatan</option>
      <option value="other">Wilayah Lain / Luar AOI</option>
    `;
    locSelect.value = this.complementFilterLocation;
    locGroup.appendChild(locLabel);
    locGroup.appendChild(locSelect);
    filterGrid.appendChild(locGroup);

    // Tahun Filter
    const yearGroup = document.createElement('div');
    yearGroup.className = 'complement-filter-group';
    const yearLabel = document.createElement('label');
    yearLabel.className = 'complement-filter-label';
    yearLabel.textContent = 'Tahun';
    const yearSelect = document.createElement('select');
    yearSelect.className = 'complement-filter-select';
    yearSelect.innerHTML = `
      <option value="all">Semua Tahun</option>
      <option value="2026">2026</option>
      <option value="2025">2025</option>
      <option value="2024">2024</option>
    `;
    yearSelect.value = this.complementFilterYear;
    yearGroup.appendChild(yearLabel);
    yearGroup.appendChild(yearSelect);
    filterGrid.appendChild(yearGroup);

    // Status Label Filter
    const labelGroup = document.createElement('div');
    labelGroup.className = 'complement-filter-group';
    const labelLabel = document.createElement('label');
    labelLabel.className = 'complement-filter-label';
    labelLabel.textContent = 'Status Label';
    const labelSelect = document.createElement('select');
    labelSelect.className = 'complement-filter-select';
    labelSelect.innerHTML = `
      <option value="all">Semua Status</option>
      <option value="labeled">Berlabel Kelas</option>
      <option value="unlabeled">Tanpa Label (Unlabeled)</option>
    `;
    labelSelect.value = this.complementFilterLabel;
    labelGroup.appendChild(labelLabel);
    labelGroup.appendChild(labelSelect);
    filterGrid.appendChild(labelGroup);

    body.appendChild(filterGrid);

    // 3. Card List Container
    const cardList = document.createElement('div');
    cardList.className = 'complement-card-list';
    body.appendChild(cardList);
    container.appendChild(body);

    // 4. Modal Footer
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
    container.appendChild(footer);

    // Function to render cards based on active search & filters
    const updateCardList = () => {
      cardList.textContent = '';

      const openItems = (this.workspace.catalogueItems || []).filter(i =>
        (i.isPublished && i.id !== 'data_hutan') ||
        i.id === 'data_campuran_1' ||
        i.id === 'data_kontribusi_mandiri' ||
        i.id === 'data_ref_mod_f' ||
        i.id === 'data_ref_mod_2b' ||
        i.id === 'data_sawah' ||
        i.id === 'case4_data_kombinasi_f'
      );

      const q = this.complementSearchQuery.trim().toLowerCase();
      const filtered = openItems.filter(item => {
        const meta = getDatasetComplementMeta(item);

        // Search text matching
        if (q) {
          const matchTitle = (item.title || '').toLowerCase().includes(q);
          const matchDesc = (item.description || '').toLowerCase().includes(q);
          const matchCat = (meta.category || item.category || '').toLowerCase().includes(q);
          const matchLoc = (meta.location || item.location || '').toLowerCase().includes(q);
          const matchInst = (meta.contributor || '').toLowerCase().includes(q);
          if (!matchTitle && !matchDesc && !matchCat && !matchLoc && !matchInst) {
            return false;
          }
        }

        // Category filter
        if (this.complementFilterCategory !== 'all') {
          if (this.complementFilterCategory === 'Publikasi Mandiri') {
            if (!item.isPublished && meta.category !== 'Publikasi Mandiri') return false;
          } else if (!meta.category.includes(this.complementFilterCategory) && !(item.category || '').includes(this.complementFilterCategory)) {
            return false;
          }
        }

        // Location filter
        if (this.complementFilterLocation !== 'all') {
          const locStr = (meta.location || item.location || '').toLowerCase();
          if (this.complementFilterLocation === 'banyuasin') {
            if (!locStr.includes('banyuasin')) return false;
          } else if (this.complementFilterLocation === 'sumsel') {
            if (!locStr.includes('sumatera selatan') && !locStr.includes('banyuasin')) return false;
          } else if (this.complementFilterLocation === 'other') {
            if (locStr.includes('banyuasin') || locStr.includes('sumatera')) return false;
          }
        }

        // Year filter
        if (this.complementFilterYear !== 'all') {
          if (String(meta.year) !== this.complementFilterYear) return false;
        }

        // Label status filter
        if (this.complementFilterLabel !== 'all') {
          if (this.complementFilterLabel === 'labeled' && !meta.hasLabel) return false;
          if (this.complementFilterLabel === 'unlabeled' && meta.hasLabel) return false;
        }

        return true;
      });

      if (filtered.length === 0) {
        const emptyNotice = document.createElement('div');
        emptyNotice.className = 'complement-empty-notice';
        emptyNotice.innerHTML = `
          <strong>Tidak ada koleksi data yang sesuai dengan kriteria filter.</strong><br>
          <span style="font-size:0.75rem;">Coba sesuaikan kata kunci pencarian atau ubah opsi filter lokasi/kategori/tahun.</span>
        `;
        cardList.appendChild(emptyNotice);
        return;
      }

      for (const item of filtered) {
        const meta = getDatasetComplementMeta(item);
        const card = document.createElement('div');
        card.className = 'complement-card';

        const cardHeader = document.createElement('div');
        cardHeader.className = 'complement-card-header';
        const cardTitle = document.createElement('div');
        cardTitle.className = 'complement-card-title';
        cardTitle.textContent = item.title;
        cardHeader.appendChild(cardTitle);

        const catBadge = document.createElement('span');
        catBadge.className = 'complement-card-badge';
        catBadge.textContent = meta.category || item.category || 'Data Terbuka';
        cardHeader.appendChild(catBadge);
        card.appendChild(cardHeader);

        const badgesRow = document.createElement('div');
        badgesRow.className = 'complement-card-badges';

        const countBadge = document.createElement('span');
        countBadge.className = 'complement-card-badge badge-count';
        countBadge.textContent = `📍 ${item.featureCount ?? 0} titik di AOI`;
        badgesRow.appendChild(countBadge);

        const locBadge = document.createElement('span');
        locBadge.className = 'complement-card-badge badge-loc';
        locBadge.textContent = `🗺️ ${meta.location}`;
        badgesRow.appendChild(locBadge);

        const instBadge = document.createElement('span');
        instBadge.className = 'complement-card-badge badge-inst';
        instBadge.textContent = `🏛️ ${meta.contributor}`;
        badgesRow.appendChild(instBadge);

        const labelBadge = document.createElement('span');
        labelBadge.className = 'complement-card-badge';
        labelBadge.textContent = meta.hasLabel ? '🏷️ Berlabel' : '🏷️ Tanpa Label';
        badgesRow.appendChild(labelBadge);

        card.appendChild(badgesRow);

        const cardDesc = document.createElement('div');
        cardDesc.className = 'complement-card-desc';
        cardDesc.textContent = item.description || '';
        card.appendChild(cardDesc);

        const cardFooter = document.createElement('div');
        cardFooter.className = 'complement-card-footer';

        const rightsNotice = document.createElement('span');
        rightsNotice.style.fontSize = '0.72rem';
        rightsNotice.style.color = 'var(--luma-muted)';
        rightsNotice.textContent = `Status Hak: ${meta.rights}`;
        cardFooter.appendChild(rightsNotice);

        const selectBtn = document.createElement('button');
        selectBtn.type = 'button';
        selectBtn.className = 'btn-select-collection';
        selectBtn.textContent = 'Pilih Koleksi Ini →';
        selectBtn.addEventListener('click', async () => {
          selectBtn.disabled = true;
          selectBtn.textContent = 'Memuat...';
          try {
            await this.selectComplementSource(item.id);
          } catch (err) {
            console.error(`Gagal memuat kandidat data ${item.id}:`, err);
            alert(`Gagal memuat kandidat data "${item.title || item.id}": ${err.message}`);
          } finally {
            if (selectBtn && selectBtn.isConnected) {
              selectBtn.disabled = false;
              selectBtn.textContent = 'Pilih Koleksi Ini →';
            }
          }
        });
        cardFooter.appendChild(selectBtn);
        card.appendChild(cardFooter);

        cardList.appendChild(card);
      }
    };

    searchInput.addEventListener('input', (e) => {
      this.complementSearchQuery = e.target.value;
      updateCardList();
    });

    catSelect.addEventListener('change', (e) => {
      this.complementFilterCategory = e.target.value;
      updateCardList();
    });

    locSelect.addEventListener('change', (e) => {
      this.complementFilterLocation = e.target.value;
      updateCardList();
    });

    yearSelect.addEventListener('change', (e) => {
      this.complementFilterYear = e.target.value;
      updateCardList();
    });

    labelSelect.addEventListener('change', (e) => {
      this.complementFilterLabel = e.target.value;
      updateCardList();
    });

    updateCardList();

    this.dialog.open(container, () => this.complementWorkflow.cancel());
  }

  async selectComplementSource(datasetId) {
    if (!this.loadedDatasetCache) {
      this.loadedDatasetCache = new Map();
    }

    let candidateRecords = [];

    // 1. Check published collections
    const pub = (this.workspace.publishedCollections || []).find(p => (p.meta && p.meta.id === datasetId) || p.id === datasetId);
    if (pub && pub.records && pub.records.length > 0) {
      candidateRecords = pub.records;
    } else if (
      this.workspace.case2DonatedCollection &&
      (datasetId === 'data_kontribusi_mandiri' || (this.workspace.case2DonatedCollection.meta && this.workspace.case2DonatedCollection.meta.id === datasetId))
    ) {
      // 2. Check Case 2 donated collection
      candidateRecords = this.workspace.case2DonatedCollection.records || [];
    } else if (
      this.workspace.mixedDataset &&
      (datasetId === 'data_campuran_1' || (this.workspace.mixedDataset.meta && this.workspace.mixedDataset.meta.id === datasetId))
    ) {
      // 3. Check mixed dataset
      candidateRecords = this.workspace.mixedDataset.records || [];
    } else if (
      this.workspace.case3PrivateCollection &&
      (this.workspace.case3PrivateCollection.meta && this.workspace.case3PrivateCollection.meta.id === datasetId)
    ) {
      // 4. Check Case 3 private collection
      candidateRecords = this.workspace.case3PrivateCollection.records || [];
    } else if (this.workspace.activeDatasetId === datasetId && this.workspace.records && this.workspace.records.length > 0) {
      // 5. Use active workspace records if already in memory
      candidateRecords = this.workspace.records;
    } else if (this.loadedDatasetCache.has(datasetId)) {
      // 6. Use cached dataset if previously fetched
      candidateRecords = this.loadedDatasetCache.get(datasetId).records || [];
    } else {
      // 7. Load from static derived GeoJSON
      try {
        const dataset = await loadDataset(datasetId);
        this.loadedDatasetCache.set(datasetId, dataset);
        candidateRecords = dataset.records;
      } catch (err) {
        this.datasetError = `Gagal memuat kandidat data ${datasetId}: ${err.message}`;
        this.updateErrorBanner();
        throw err;
      }
    }

    this.complementWorkflow.startFlow(candidateRecords, datasetId);
    this.renderComplementStepSelect();
  }

  renderComplementStepSelect() {
    const isScenario = this.workspace.activeMode === MODES.SCENARIO;
    const sourceId = this.complementWorkflow.selectedSourceId;
    const sourceClasses = (typeof this.complementWorkflow?.getSourceClasses === 'function')
      ? this.complementWorkflow.getSourceClasses()
      : getComplementClassesForSource(sourceId, this.workspace?.activeCaseId || 1, this.complementWorkflow?.cachedSourceRecords || []);

    const catalogItem = (this.workspace.catalogueItems || []).find(i => i.id === sourceId) ||
      (this.workspace.publishedCollections || []).find(p => p.meta && p.meta.id === sourceId) ||
      { id: sourceId, title: sourceId };
    const meta = getDatasetComplementMeta(catalogItem);

    const container = document.createElement('div');

    const isCase3 = this.workspace.activeCaseId === 3;
    const missingClassLabel = isCase3 ? '2. Non-hutan' : '3. Lainnya';

    const header = document.createElement('div');
    header.className = 'modal-header';
    const title = document.createElement('h3');
    title.className = 'modal-title';
    title.textContent = 'Tambah Data Rujukan → Pilih Kelas Sumber';
    header.appendChild(title);

    const subtitle = document.createElement('p');
    subtitle.className = 'modal-subtitle';
    subtitle.textContent = `Pilih kelas non-target dari ${meta.title} untuk melengkapi kelas proyek "${missingClassLabel}".`;
    header.appendChild(subtitle);

    container.appendChild(header);

    const body = document.createElement('div');
    body.className = 'modal-body';

    // Info bar for selected collection
    const infoBar = document.createElement('div');
    infoBar.className = 'selected-collection-infobar';
    infoBar.innerHTML = `
      <span>📦 Koleksi Terpilih: <strong>${escapeHtml(meta.title)}</strong> (${this.complementWorkflow.cachedSourceRecords.length} titik di AOI) · ${escapeHtml(meta.contributor)}</span>
      <span style="font-size:0.72rem;font-weight:normal;opacity:0.9;">Langkah 2 dari 3</span>
    `;
    body.appendChild(infoBar);

    const intro = document.createElement('p');
    intro.style.marginTop = '8px';
    intro.textContent = 'Pilih kelas sumber yang akan diklasifikasikan ulang berdasarkan skema klasifikasi Anda';
    body.appendChild(intro);

    const selectAllBtn = document.createElement('button');
    selectAllBtn.className = 'btn-select-all';
    selectAllBtn.type = 'button';
    selectAllBtn.textContent = isCase3
      ? 'Pilih semua kelas selain hutan'
      : 'Pilih semua kelas selain karet dan kelapa sawit';
    selectAllBtn.addEventListener('click', () => {
      this.complementWorkflow.selectNonTargetClasses();
      this.renderComplementStepSelect();
    });
    body.appendChild(selectAllBtn);

    const listWrapper = document.createElement('div');
    listWrapper.className = 'class-selector-list';

    for (const c of sourceClasses) {
      const itemWrapper = document.createElement('div');
      itemWrapper.className = `class-checkbox-item ${c.isTargetClass ? 'is-disabled' : ''}`;
      itemWrapper.style.display = 'flex';
      itemWrapper.style.alignItems = 'center';
      itemWrapper.style.justifyContent = 'space-between';

      const checkLabel = document.createElement('label');
      checkLabel.className = 'class-item-left-label';
      checkLabel.style.display = 'flex';
      checkLabel.style.alignItems = 'flex-start';
      checkLabel.style.gap = '10px';
      checkLabel.style.flex = '1';
      checkLabel.style.cursor = c.isTargetClass ? 'not-allowed' : 'pointer';

      const chk = document.createElement('input');
      chk.type = 'checkbox';
      chk.value = c.id;
      chk.disabled = c.isTargetClass;
      chk.checked = !c.isTargetClass && this.complementWorkflow.selectedClassIds.has(String(c.id));

      checkLabel.appendChild(chk);

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
      itemDesc.textContent = (c.description || '').replace(/\s*-\s*dikecualikan/gi, '').trim();
      infoBox.appendChild(itemDesc);

      checkLabel.appendChild(infoBox);
      itemWrapper.appendChild(checkLabel);

      // Target class mapping dropdown on the right side
      if (!c.isTargetClass) {
        const selectWrapper = document.createElement('div');
        selectWrapper.className = 'target-class-select-wrapper';
        selectWrapper.style.marginLeft = '12px';
        selectWrapper.style.display = 'flex';
        selectWrapper.style.alignItems = 'center';
        selectWrapper.style.gap = '6px';
        selectWrapper.style.flexShrink = '0';

        const selLabel = document.createElement('span');
        selLabel.style.fontSize = '0.72rem';
        selLabel.style.color = '#64748b';
        selLabel.style.whiteSpace = 'nowrap';
        selLabel.textContent = 'Petakan ke:';
        selectWrapper.appendChild(selLabel);

        const targetSelect = document.createElement('select');
        targetSelect.className = 'target-class-select';
        targetSelect.style.padding = '4px 8px';
        targetSelect.style.fontSize = '0.75rem';
        targetSelect.style.borderRadius = '4px';
        targetSelect.style.border = '1px solid #cbd5e1';
        targetSelect.style.backgroundColor = '#ffffff';
        targetSelect.style.cursor = 'pointer';
        targetSelect.disabled = !chk.checked;

        if (isCase3) {
          // Case 3 (Pengguna B): Hutan and Non-hutan, default Non-hutan
          const optForest = document.createElement('option');
          optForest.value = '1';
          optForest.textContent = 'Hutan';
          const optNonForest = document.createElement('option');
          optNonForest.value = '2';
          optNonForest.textContent = 'Non-hutan';
          targetSelect.appendChild(optForest);
          targetSelect.appendChild(optNonForest);
          const currentVal = this.complementWorkflow.targetClassMapping[String(c.id)] || '2';
          targetSelect.value = currentVal;
          this.complementWorkflow.setTargetClass(c.id, currentVal);
        } else {
          // Case 1 (Pengguna A): Kebun sawit, Kebun karet, Lainnya, default Lainnya
          const optSawit = document.createElement('option');
          optSawit.value = '1';
          optSawit.textContent = 'Kebun sawit';
          const optKaret = document.createElement('option');
          optKaret.value = '2';
          optKaret.textContent = 'Kebun karet';
          const optLainnya = document.createElement('option');
          optLainnya.value = '3';
          optLainnya.textContent = 'Lainnya';
          targetSelect.appendChild(optSawit);
          targetSelect.appendChild(optKaret);
          targetSelect.appendChild(optLainnya);
          const currentVal = this.complementWorkflow.targetClassMapping[String(c.id)] || '3';
          targetSelect.value = currentVal;
          this.complementWorkflow.setTargetClass(c.id, currentVal);
        }

        targetSelect.addEventListener('change', () => {
          this.complementWorkflow.setTargetClass(c.id, targetSelect.value);
        });

        targetSelect.addEventListener('click', (e) => e.stopPropagation());
        targetSelect.addEventListener('mousedown', (e) => e.stopPropagation());

        chk.addEventListener('change', () => {
          this.complementWorkflow.toggleClass(c.id, chk.checked);
          targetSelect.disabled = !chk.checked;
        });

        selectWrapper.appendChild(targetSelect);
        itemWrapper.appendChild(selectWrapper);
      } else {
        chk.addEventListener('change', () => {
          this.complementWorkflow.toggleClass(c.id, chk.checked);
        });
      }

      listWrapper.appendChild(itemWrapper);
    }
    body.appendChild(listWrapper);
    container.appendChild(body);

    const footer = document.createElement('div');
    footer.className = 'modal-footer';

    // Step 2 -> Back to Step 1 (Katalog)
    const backBtn = document.createElement('button');
    backBtn.className = 'btn-secondary';
    backBtn.type = 'button';
    backBtn.textContent = '← Kembali ke Katalog';
    backBtn.addEventListener('click', () => {
      this.renderComplementStepCatalogue();
    });
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

    const nextBtn = document.createElement('button');
    nextBtn.className = 'btn-primary';
    nextBtn.type = 'button';
    nextBtn.textContent = 'Tinjau Penambahan →';
    nextBtn.addEventListener('click', () => {
      if (this.complementWorkflow.selectedClassIds.size === 0) {
        alert(`Silakan pilih setidaknya satu kelas sumber untuk melengkapi kelas ${isCase3 ? 'Non-hutan' : 'Lainnya'}.`);
        return;
      }
      this.renderComplementStepPreview();
    });
    footer.appendChild(nextBtn);

    container.appendChild(footer);
    this.dialog.open(container, () => this.complementWorkflow.cancel());
  }

  renderComplementStepPreview() {
    const isScenario = this.workspace.activeMode === MODES.SCENARIO;
    const sourceId = this.complementWorkflow.selectedSourceId;
    const catalogItem = (this.workspace.catalogueItems || []).find(i => i.id === sourceId) ||
      (this.workspace.publishedCollections || []).find(p => p.meta && p.meta.id === sourceId) ||
      { id: sourceId, title: sourceId };
    const meta = getDatasetComplementMeta(catalogItem);

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

    addRow('Koleksi Sumber:', `${meta.title} (${meta.contributor})`);
    addRow('Lokasi & Wilayah:', `${meta.location}`);
    addRow('Mode Operasi:', isScenario ? 'Skenario Percontohan' : 'Sumber Nyata (Pencarian Ketat)');
    addRow('Waktu Pengamatan:', `${meta.year}`);
    const cleanRights = meta.rights ? String(meta.rights).replace(/\s*\((?:Simulasi|Asumsi)[^)]*\)/gi, '') : 'Belum terverifikasi';
    addRow('Status Hak/Izin:', isScenario ? cleanRights : 'Belum terverifikasi');
    addRow('Kandidat Sumber Total:', `${preview.totalSourceCandidates} titik`);
    addRow('Lolos Saringan Kriteria:', `${preview.eligibleAfterFilters} titik (${preview.excludedByFilter} dikecualikan)`);
    addRow('Titik Duplikat (Dilewati):', `${preview.duplicateCount} titik`);
    addRow('Titik Baru Bersih:', `+${preview.netNewCount} titik`);
    const isCase3 = this.workspace.activeCaseId === 3;
    const targetClassLabel = isCase3 ? 'Non-hutan' : 'Lainnya';

    addRow('Total Proyek Sebelum:', `${preview.currentTotalCount} titik`);
    addRow('Total Proyek Setelah:', `${preview.projectedTotalCount} titik (+${preview.netNewCount} titik baru)`);

    body.appendChild(table);

    // Custom dataset name input field (User requested: "Provide a column that user can filled out. and please implement this to the case 1 as well")
    const nameWrapper = document.createElement('div');
    nameWrapper.className = 'custom-dataset-name-field';
    nameWrapper.style.marginTop = '14px';
    nameWrapper.style.marginBottom = '8px';

    const nameLabel = document.createElement('label');
    nameLabel.style.display = 'block';
    nameLabel.style.fontSize = '0.78rem';
    nameLabel.style.fontWeight = '600';
    nameLabel.style.marginBottom = '4px';
    nameLabel.textContent = 'Nama Koleksi Data Campuran:';

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'custom-name-input';
    nameInput.style.width = '100%';
    nameInput.style.padding = '8px 10px';
    nameInput.style.fontSize = '0.8rem';
    nameInput.style.borderRadius = '4px';
    nameInput.style.border = '1px solid #cbd5e1';
    const defaultName = isCase3 ? 'Data Campuran Tutupan Lahan' : 'Data Campuran #1';
    nameInput.value = defaultName;
    nameInput.placeholder = 'Masukkan nama koleksi data gabungan...';

    nameWrapper.appendChild(nameLabel);
    nameWrapper.appendChild(nameInput);
    body.appendChild(nameWrapper);

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

    // Step 3 -> Back to Step 2 (Pilih Kelas)
    const backBtn = document.createElement('button');
    backBtn.className = 'btn-secondary';
    backBtn.type = 'button';
    backBtn.textContent = '← Kembali ke Pilihan Kelas';
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
    confirmBtn.textContent = 'Konfirmasi & Gabungkan Data';
    confirmBtn.addEventListener('click', () => {
      const customTitle = nameInput.value.trim() || defaultName;
      const res = this.complementWorkflow.confirmAddition(this.workspace.activeMode, customTitle);
      this.dialog.close();
      this.noticeMessage = `Berhasil membuat "${res.title || res.datasetId}": ditambahkan +${res.addedCount} titik rujukan baru untuk kelas ${targetClassLabel} (Total: ${res.totalCount} titik).`;
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
      if (this.workspace.activeCaseId === 3) {
        selectedDatasetId = this.workspace.case3PrivateCollection ? this.workspace.case3PrivateCollection.meta.id : 'data_hutan';
      } else {
        selectedDatasetId = this.workspace.mixedDataset ? 'data_campuran_1' : 'data_kebun_sawit_karet_f';
      }
    }

    const getRecordsForDataset = async (datasetId) => {
      if (datasetId === 'data_campuran_1' && this.workspace.mixedDataset) {
        return this.workspace.mixedDataset.records;
      }
      if (this.workspace.case3PrivateCollection && datasetId === this.workspace.case3PrivateCollection.meta.id) {
        return this.workspace.case3PrivateCollection.records;
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
    let separation = this.contributionWorkflow.separateOwnedObservations(currentRecords, this.workspace.activeCaseId);

    const isForestryDataset = selectedDatasetId === 'data_hutan' ||
      selectedDatasetId === 'data_hutan_campuran' ||
      selectedDatasetId === 'data_hutan_sawit_partisipatif' ||
      (this.workspace.case3PrivateCollection && selectedDatasetId === this.workspace.case3PrivateCollection.meta.id) ||
      this.workspace.activeCaseId === 3;

    const defaultAccountName = isForestryDataset ? 'Budi' : 'Rizki';
    const defaultEmail = isForestryDataset ? 'budi@mail.com' : 'rizki@mail.com';
    const defaultInstitution = isForestryDataset ? 'Instansi Kehutanan B' : 'Instansi Perkebunan A';
    const defaultMethod = isForestryDataset ? 'Inventarisasi Hutan' : 'Survei GPS Lapangan';

    // Staged draft: pre-filled with active user profile
    const draft = savedDraft || {
      accountName: defaultAccountName,
      owningInstitution: defaultInstitution,
      technicalEmail: defaultEmail,
      confirmedYear: 2026,
      acquisitionMethod: defaultMethod,
      boundaryAoi: 'Kabupaten Banyuasin',
      responsibilityAccepted: false,
      selectedDatasetId,
      crosswalk: isForestryDataset
        ? {
            1: { epistemLeafId: 'veg-tb-forest-udf' },
            2: { epistemLeafId: 'veg-ntb-cropland' }
          }
        : {
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
    subtitle.textContent = isForestryDataset
      ? 'Memisahkan observasi tutupan hutan mandiri dari data rujukan pihak ketiga untuk dipublikasikan secara terbuka ke konsorsium Epistem.'
      : 'Memisahkan observasi kebun mandiri dari data rujukan pihak ketiga untuk dipublikasikan secara terbuka ke konsorsium Epistem.';
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

    // Populate collection options based on activeCaseId
    if (this.workspace.activeCaseId === 3) {
      if (this.workspace.case3PrivateCollection) {
        const optC3Mixed = document.createElement('option');
        optC3Mixed.value = this.workspace.case3PrivateCollection.meta.id || 'data_hutan_campuran';
        const c3Title = (this.workspace.case3PrivateCollection.meta && this.workspace.case3PrivateCollection.meta.title) || 'Data Campuran Tutupan Lahan';
        const c3Total = this.workspace.case3PrivateCollection.records.length;
        optC3Mixed.textContent = `${c3Title} (${c3Total} titik: 86 mandiri, ${c3Total - 86} rujukan)`;
        collSelect.appendChild(optC3Mixed);
      }
      const optForest = document.createElement('option');
      optForest.value = 'data_hutan';
      optForest.textContent = 'Data Tutupan Hutan (86 titik mandiri)';
      collSelect.appendChild(optForest);
    } else {
      if (this.workspace.mixedDataset) {
        const optMixed = document.createElement('option');
        optMixed.value = 'data_campuran_1';
        const mixTitle = (this.workspace.mixedDataset.meta && this.workspace.mixedDataset.meta.title) || 'Data Campuran #1';
        const mixTotal = this.workspace.mixedDataset.records.length;
        optMixed.textContent = `${mixTitle} (${mixTotal} titik: 240 mandiri, ${mixTotal - 240} rujukan)`;
        collSelect.appendChild(optMixed);
      }
      const optPlantation = document.createElement('option');
      optPlantation.value = 'data_kebun_sawit_karet_f';
      optPlantation.textContent = 'Data Kebun Sawit & Karet (240 titik mandiri)';
      collSelect.appendChild(optPlantation);
    }

    collSelect.value = selectedDatasetId;
    collSection.appendChild(collSelect);

    // Step 1 Container: Pemilihan Koleksi & Integritas
    const step1Container = document.createElement('div');
    step1Container.className = 'modal-step-container step-1-container';
    step1Container.appendChild(collSection);

    // Separation summary box
    const sepBox = document.createElement('div');
    sepBox.className = 'separation-summary-box';
    step1Container.appendChild(sepBox);

    // Excluded explanation notice container
    const excBox = document.createElement('div');
    excBox.className = 'separation-excluded-box';
    step1Container.appendChild(excBox);

    body.appendChild(step1Container);

    const updateSeparationView = () => {
      const isForestry = selectedDatasetId === 'data_hutan' ||
        selectedDatasetId === 'data_hutan_campuran' ||
        (this.workspace.case3PrivateCollection && selectedDatasetId === this.workspace.case3PrivateCollection.meta.id);

      const breakdownText = isForestry
        ? `${separation.summary.ownedCount} Hutan`
        : `${separation.summary.rubberCount} Karet, ${separation.summary.palmCount} Kelapa sawit`;

      sepBox.innerHTML = `
        <div style="font-size: 0.78rem; line-height: 1.5; margin-bottom: 8px;">
          <p><strong>Observasi Aktif Terdeteksi:</strong> ${separation.summary.total} titik</p>
          <p style="color: #059669;"><strong>Observasi Milik Mandiri (Dapat Dikontribusikan):</strong> ${separation.summary.ownedCount} titik (${breakdownText})</p>
          ${separation.summary.excludedCount > 0 ? `<p style="color: #dc2626;"><strong>Koleksi Rujukan Pihak Ketiga (Dikecualikan):</strong> ${separation.summary.excludedCount} titik</p>` : ''}
        </div>
      `;

      if (separation.summary.excludedCount > 0) {
        excBox.innerHTML = `
          <div class="modal-banner banner-source" style="margin-bottom: 12px; font-size: 0.74rem;">
            <strong>Catatan Integritas:</strong> Titik rujukan (${separation.summary.excludedCount} titik) berasal dari koleksi impor pihak ketiga, bukan milik pengguna. Data pihak ketiga tidak dapat disumbangkan sebagai kontribusi mandiri dan dikecualikan secara otomatis.
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
      separation = this.contributionWorkflow.separateOwnedObservations(currentRecords, this.workspace.activeCaseId);
      primitivesRows = []; // Invalidate primitives cache so new selection is re-extracted
      updateSeparationView();
      updateSummarySection();
    });

    // Step 2 Container: Ekstraksi Primitives
    const step2Container = document.createElement('div');
    step2Container.className = 'modal-step-container step-2-container';
    step2Container.style.display = 'none';

    const searchBar = document.createElement('div');
    searchBar.className = 'primitives-search-bar';
    searchBar.innerHTML = `
      <input type="text" id="primitives-search-input" class="primitives-search-input" placeholder="Cari ID atau Kelas..." />
      <span id="primitives-count-badge" style="font-size: 0.74rem; font-weight: 600; color: #64748b; white-space: nowrap;">0 titik</span>
    `;
    step2Container.appendChild(searchBar);

    const tableWrap = document.createElement('div');
    tableWrap.className = 'primitives-table-wrapper';
    tableWrap.innerHTML = `
      <table class="primitives-table">
        <thead>
          <tr>
            <th data-col="id" style="width: 28%;">ID <span class="sort-icon">&#x25B4;&#x25BE;</span></th>
            <th data-col="class" style="width: 20%;">Kelas <span class="sort-icon">&#x25B4;&#x25BE;</span></th>
            <th data-col="waterbody" style="width: 18%;">Keberadaan Air <span class="sort-icon">&#x25B4;&#x25BE;</span></th>
            <th data-col="tree" style="width: 18%;">Keberadaan Pohon <span class="sort-icon">&#x25B4;&#x25BE;</span></th>
            <th data-col="veg" style="width: 16%;">Tinggi Tajuk (m) <span class="sort-icon">&#x25B4;&#x25BE;</span></th>
          </tr>
        </thead>
        <tbody id="primitives-table-body"></tbody>
      </table>
    `;
    step2Container.appendChild(tableWrap);

    const helperNote = document.createElement('div');
    helperNote.style.fontSize = '0.72rem';
    helperNote.style.color = '#64748b';
    helperNote.style.marginTop = '6px';
    helperNote.textContent = '* Klik angka pada kolom Tinggi Tajuk (m) untuk menampilkan slider pengubah nilai.';
    step2Container.appendChild(helperNote);

    body.appendChild(step2Container);

    let primitivesRows = [];
    let sortColumn = 'id';
    let sortAscending = true;
    let filterTerm = '';

    const renderPrimitivesTable = () => {
      const tbody = step2Container.querySelector('#primitives-table-body');
      const countBadge = step2Container.querySelector('#primitives-count-badge');
      if (!tbody) return;

      let displayList = [...primitivesRows];
      if (filterTerm) {
        const term = filterTerm.toLowerCase().trim();
        displayList = displayList.filter(row =>
          String(row.observation_id).toLowerCase().includes(term) ||
          String(row.classLabel).toLowerCase().includes(term)
        );
      }

      displayList.sort((a, b) => {
        let valA, valB;
        if (sortColumn === 'id') {
          valA = a.observation_id;
          valB = b.observation_id;
        } else if (sortColumn === 'class') {
          valA = a.classLabel;
          valB = b.classLabel;
        } else if (sortColumn === 'waterbody') {
          valA = a.waterbody;
          valB = b.waterbody;
        } else if (sortColumn === 'tree') {
          valA = a.tree_dominance;
          valB = b.tree_dominance;
        } else if (sortColumn === 'veg') {
          valA = a.vegetation_height;
          valB = b.vegetation_height;
        }
        if (valA < valB) return sortAscending ? -1 : 1;
        if (valA > valB) return sortAscending ? 1 : -1;
        return 0;
      });

      if (countBadge) {
        countBadge.textContent = `${displayList.length} titik`;
      }

      tbody.innerHTML = '';
      if (displayList.length === 0) {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td colspan="5" style="text-align: center; color: #94a3b8; padding: 16px;">Tidak ada data yang cocok dengan pencarian.</td>`;
        tbody.appendChild(tr);
        return;
      }

      for (const item of displayList) {
        const tr = document.createElement('tr');

        // 1. ID
        const tdId = document.createElement('td');
        tdId.style.fontWeight = '600';
        tdId.style.fontFamily = 'ui-monospace, monospace';
        tdId.style.fontSize = '0.72rem';
        tdId.textContent = item.observation_id;
        tr.appendChild(tdId);

        // 2. Kelas
        const tdClass = document.createElement('td');
        tdClass.textContent = item.classLabel;
        tr.appendChild(tdClass);

        // 3. Keberadaan Air
        const tdWb = document.createElement('td');
        const selWb = document.createElement('select');
        selWb.className = 'primitive-select';
        selWb.innerHTML = `
          <option value="0" ${item.waterbody === 0 ? 'selected' : ''}>Tidak ada</option>
          <option value="1" ${item.waterbody === 1 ? 'selected' : ''}>Ada</option>
        `;
        selWb.addEventListener('change', () => {
          item.waterbody = Number(selWb.value);
        });
        tdWb.appendChild(selWb);
        tr.appendChild(tdWb);

        // 4. Keberadaan Pohon
        const tdTree = document.createElement('td');
        const selTree = document.createElement('select');
        selTree.className = 'primitive-select';
        selTree.innerHTML = `
          <option value="0" ${item.tree_dominance === 0 ? 'selected' : ''}>Tidak ada</option>
          <option value="1" ${item.tree_dominance === 1 ? 'selected' : ''}>Ada</option>
        `;
        selTree.addEventListener('change', () => {
          item.tree_dominance = Number(selTree.value);
        });
        tdTree.appendChild(selTree);
        tr.appendChild(tdTree);

        // 5. Tinggi Tajuk (m)
        const tdVeg = document.createElement('td');
        const vegSpan = document.createElement('span');
        vegSpan.className = 'primitives-cell-veg';
        vegSpan.title = 'Klik untuk ubah tinggi tajuk';
        vegSpan.innerHTML = `<span>${item.vegetation_height}</span> <span style="font-size: 0.65rem; color: #64748b;">&#9998;</span>`;

        vegSpan.addEventListener('click', () => {
          tdVeg.innerHTML = '';
          const editor = document.createElement('div');
          editor.className = 'primitives-slider-editor';

          const valLabel = document.createElement('span');
          valLabel.style.minWidth = '20px';
          valLabel.style.fontWeight = '700';
          valLabel.style.color = '#0f172a';
          valLabel.textContent = String(item.vegetation_height);

          const slider = document.createElement('input');
          slider.type = 'range';
          slider.min = '0';
          slider.max = '50';
          slider.step = '1';
          slider.value = String(item.vegetation_height);
          slider.style.width = '70px';
          slider.style.accentColor = 'var(--luma-pink)';

          slider.addEventListener('input', () => {
            valLabel.textContent = slider.value;
            item.vegetation_height = Number(slider.value);
          });

          const okBtn = document.createElement('button');
          okBtn.type = 'button';
          okBtn.textContent = 'OK';
          okBtn.style.border = '1px solid #cbd5e1';
          okBtn.style.background = '#f1f5f9';
          okBtn.style.borderRadius = '3px';
          okBtn.style.padding = '1px 5px';
          okBtn.style.fontSize = '0.7rem';
          okBtn.style.cursor = 'pointer';

          okBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            tdVeg.innerHTML = '';
            vegSpan.querySelector('span').textContent = String(item.vegetation_height);
            tdVeg.appendChild(vegSpan);
          });

          editor.appendChild(valLabel);
          editor.appendChild(slider);
          editor.appendChild(okBtn);
          tdVeg.appendChild(editor);
          slider.focus();
        });

        tdVeg.appendChild(vegSpan);
        tr.appendChild(tdVeg);

        tbody.appendChild(tr);
      }
    };

    // Header sorting listeners
    tableWrap.querySelectorAll('th[data-col]').forEach(th => {
      th.addEventListener('click', () => {
        const col = th.getAttribute('data-col');
        if (sortColumn === col) {
          sortAscending = !sortAscending;
        } else {
          sortColumn = col;
          sortAscending = true;
        }
        renderPrimitivesTable();
      });
    });

    // Search input listener
    step2Container.querySelector('#primitives-search-input')?.addEventListener('input', (e) => {
      filterTerm = e.target.value;
      renderPrimitivesTable();
    });

    // Step 3 Container: Penyelarasan Taksonomi Epistem & Publikasi
    const step3Container = document.createElement('div');
    step3Container.className = 'modal-step-container step-3-container';
    step3Container.style.display = 'none';
    body.appendChild(step3Container);

    // Section 2: Penyelarasan Taksonomi Epistem (Operational 21-Leaf Crosswalk)
    const cwSection = document.createElement('div');
    cwSection.className = 'modal-section crosswalk-section';
    cwSection.style.marginTop = '10px';
    cwSection.style.marginBottom = '10px';

    const cwHeading = document.createElement('h4');
    cwHeading.style.fontSize = '0.8rem';
    cwHeading.style.fontWeight = '700';
    cwHeading.style.marginBottom = '4px';
    cwHeading.textContent = 'Penyelarasan Taksonomi Epistem:';
    cwSection.appendChild(cwHeading);

    const cwDesc = document.createElement('p');
    cwDesc.style.fontSize = '0.74rem';
    cwDesc.style.color = '#475569';
    cwDesc.style.marginBottom = '8px';
    cwDesc.textContent = 'Petakan kedua kelas proyek secara independen ke kelas daun taksonomi hierarkis Epistem.';
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

      // Visual Tree Hierarchy Card
      const treeContainer = document.createElement('div');
      treeContainer.className = 'taxonomy-tree-card';
      const renderTreeFlow = (leafId) => {
        const leaf = leaves.find(l => l.id === leafId) || findTaxonomyNode(leafId, EPISTEM_MASTER_TAXONOMY);
        if (!leaf) {
          treeContainer.innerHTML = '';
          return;
        }
        const pathStr = leaf.path || leaf.name;
        const segments = pathStr.split(' > ');
        treeContainer.innerHTML = `
          <div class="tree-flow-row">
            ${segments.map((seg, idx) => {
              const isLast = idx === segments.length - 1;
              const lvl = `L${idx + 1}`;
              const codeDisplay = isLast ? (leaf.code || '') : '';
              return `
                <div class="tree-flow-step ${isLast ? 'tree-flow-leaf' : ''}">
                  <span class="tree-level-badge ${isLast ? 'leaf-badge' : ''}">${isLast ? `${lvl} Daun` : lvl}</span>
                  <span class="tree-node-title">${escapeHtml(seg)}</span>
                  ${codeDisplay ? `<span class="tree-node-code">Kode: ${escapeHtml(codeDisplay)}</span>` : ''}
                </div>
                ${!isLast ? '<span class="tree-flow-arrow">&rarr;</span>' : ''}
              `;
            }).join('')}
          </div>
        `;
      };
      renderTreeFlow(currentSelectedId);
      pickerWrap.appendChild(treeContainer);

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
          renderTreeFlow(currentSelectedId);
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
      'Kebun karet (Ungu)',
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
      'Kebun sawit (Pink)',
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

    step3Container.appendChild(cwSection);

    // Section 2.5: Nama Koleksi Data (before Deklarasi Metadata & Legalitas)
    const isForestry = selectedDatasetId === 'data_hutan' ||
      selectedDatasetId === 'data_hutan_campuran' ||
      (this.workspace.case3PrivateCollection && selectedDatasetId === this.workspace.case3PrivateCollection.meta.id);

    const titleSection = document.createElement('div');
    titleSection.className = 'modal-section pub-title-section';
    titleSection.style.marginTop = '12px';

    const defaultTitle = draft.datasetTitle || (isForestry ? 'Data Referensi Tutupan Hutan, Banyuasin 2026' : 'Data Referensi Kelapa Sawit & Karet, Banyuasin 2026');
    titleSection.innerHTML = `
      <label for="pub-dataset-title" style="display:block; font-size:0.8rem; font-weight:700; margin-bottom:4px; color:#1e293b;">Nama Koleksi Data *:</label>
      <input type="text" id="pub-dataset-title" value="${escapeHtml(defaultTitle)}" placeholder="Masukkan nama koleksi data yang akan dibagikan" style="width:100%; padding:6px 8px; font-size:0.8rem; border:1px solid #cbd5e1; border-radius:4px; box-sizing:border-box;">
      <div id="err-dataset-title" style="color:#dc2626; font-size:0.7rem; display:none; margin-top:2px;"></div>
    `;
    step3Container.appendChild(titleSection);

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
      <input type="text" id="pub-account-name" value="${escapeHtml(draft.accountName || defaultAccountName)}" style="width:100%; padding:5px; font-size:0.75rem; border:1px solid #cbd5e1; border-radius:3px;">
      <div id="err-account-name" style="color:#dc2626; font-size:0.7rem; display:none; margin-top:2px;"></div>
    `;
    formFields.appendChild(accWrap);

    // Owning Institution
    const instWrap = document.createElement('div');
    const defaultInst = draft.owningInstitution || defaultInstitution;
    instWrap.innerHTML = `
      <label for="pub-institution" style="display:block; font-weight:700; margin-bottom:2px;">Lembaga Pemilik Data *:</label>
      <input type="text" id="pub-institution" value="${escapeHtml(defaultInst)}" style="width:100%; padding:5px; font-size:0.75rem; border:1px solid #cbd5e1; border-radius:3px;">
      <div id="err-institution" style="color:#dc2626; font-size:0.7rem; display:none; margin-top:2px;"></div>
    `;
    formFields.appendChild(instWrap);

    // Technical Email
    const emailWrap = document.createElement('div');
    emailWrap.innerHTML = `
      <label for="pub-email" style="display:block; font-weight:700; margin-bottom:2px;">Email Teknis *:</label>
      <input type="email" id="pub-email" value="${escapeHtml(draft.technicalEmail || defaultEmail)}" style="width:100%; padding:5px; font-size:0.75rem; border:1px solid #cbd5e1; border-radius:3px;">
      <div id="err-email" style="color:#dc2626; font-size:0.7rem; display:none; margin-top:2px;"></div>
    `;
    formFields.appendChild(emailWrap);

    // Editable Wilayah Kajian (Banyuasin)
    const aoiWrap = document.createElement('div');
    aoiWrap.innerHTML = `
      <label for="pub-aoi" style="display:block; font-weight:700; margin-bottom:2px;">Wilayah Kajian:</label>
      <input type="text" id="pub-aoi" value="${escapeHtml(draft.boundaryAoi || 'Kabupaten Banyuasin')}" style="width:100%; padding:5px; font-size:0.75rem; border:1px solid #cbd5e1; border-radius:3px;">
    `;
    formFields.appendChild(aoiWrap);

    // Editable Confirmed Year (2026)
    const yearWrap = document.createElement('div');
    yearWrap.innerHTML = `
      <label for="pub-year" style="display:block; font-weight:700; margin-bottom:2px;">Tahun Observasi & Proyek:</label>
      <input type="text" id="pub-year" value="${escapeHtml(String(draft.confirmedYear || 2026))}" style="width:100%; padding:5px; font-size:0.75rem; border:1px solid #cbd5e1; border-radius:3px;">
    `;
    formFields.appendChild(yearWrap);

    // Editable Acquisition Method
    const methodWrap = document.createElement('div');
    methodWrap.innerHTML = `
      <label for="pub-method" style="display:block; font-weight:700; margin-bottom:2px;">Metode Akuisisi Data:</label>
      <input type="text" id="pub-method" value="${escapeHtml(draft.acquisitionMethod || defaultMethod)}" style="width:100%; padding:5px; font-size:0.75rem; border:1px solid #cbd5e1; border-radius:3px;">
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

    step3Container.appendChild(formSection);

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
        datasetTitle: document.getElementById('pub-dataset-title')?.value || defaultTitle,
        accountName: document.getElementById('pub-account-name')?.value || defaultAccountName,
        owningInstitution: document.getElementById('pub-institution')?.value || defaultInstitution,
        technicalEmail: document.getElementById('pub-email')?.value || defaultEmail,
        confirmedYear: Number(document.getElementById('pub-year')?.value) || 2026,
        acquisitionMethod: document.getElementById('pub-method')?.value || defaultMethod,
        boundaryAoi: document.getElementById('pub-aoi')?.value || 'Kabupaten Banyuasin',
        responsibilityAccepted: Boolean(document.getElementById('pub-responsibility')?.checked),
        crosswalk: {
          1: { epistemLeafId: karetPicker.getSelectedLeafId() },
          2: { epistemLeafId: sawitPicker.getSelectedLeafId() }
        }
      });
    };

    const updateSummarySection = () => {
      const isForestry = selectedDatasetId === 'data_hutan' ||
        selectedDatasetId === 'data_hutan_campuran' ||
        (this.workspace.case3PrivateCollection && selectedDatasetId === this.workspace.case3PrivateCollection.meta.id);

      const titleInp = document.getElementById('pub-dataset-title')?.value || defaultTitle;
      const accInp = document.getElementById('pub-account-name')?.value || draft.accountName;
      const instInp = document.getElementById('pub-institution')?.value || defaultInst;
      const leaf1 = findTaxonomyNode(karetPicker.getSelectedLeafId(), EPISTEM_MASTER_TAXONOMY);
      const leaf2 = findTaxonomyNode(sawitPicker.getSelectedLeafId(), EPISTEM_MASTER_TAXONOMY);

      const countText = isForestry
        ? `${separation.summary.ownedCount} titik (Hutan)`
        : `${separation.summary.ownedCount} titik (${separation.summary.rubberCount} Karet, ${separation.summary.palmCount} Sawit)`;

      const mapText = isForestry
        ? `Hutan &rarr; ${leaf1 ? `${leaf1.code} ${leaf1.name}` : 'Belum dipilih'}`
        : `Kebun karet &rarr; ${leaf1 ? `${leaf1.code} ${leaf1.name}` : 'Belum dipilih'}, Kebun sawit &rarr; ${leaf2 ? `${leaf2.code} ${leaf2.name}` : 'Belum dipilih'}`;

      summaryCard.innerHTML = `
        <h5 style="margin:0 0 4px 0; font-size:0.78rem; font-weight:700; color:#1e293b;">Ringkasan Sebelum Konfirmasi:</h5>
        <div style="font-size:0.73rem; line-height:1.45; color:#334155;">
          <div>&bull; <strong>Nama Koleksi:</strong> ${escapeHtml(titleInp)}</div>
          <div>&bull; <strong>Titik Mandiri Dibagikan:</strong> ${countText}</div>
          <div>&bull; <strong>Pemetaan Taksonomi:</strong> ${mapText}</div>
          <div>&bull; <strong>Ekstraksi Primitives:</strong> ${primitivesRows.length > 0 ? `${primitivesRows.length} titik tertinjau (Air, Pohon, Tinggi Tajuk)` : 'Tersedia'}</div>
          <div>&bull; <strong>Lembaga & Peneliti:</strong> ${escapeHtml(accInp)} (${escapeHtml(instInp)})</div>
          <div>&bull; <strong>Tahun & Status:</strong> 2026 &bull; Mandiri / Belum Ditelaah (Tier 4)</div>
        </div>
      `;
    };
    updateSummarySection();
    step3Container.appendChild(summaryCard);

    const handleFormChange = () => {
      updateSummarySection();
      saveDraftState();
    };
    titleSection.addEventListener('input', handleFormChange);
    formSection.addEventListener('input', handleFormChange);

    container.appendChild(body);

    const footer = document.createElement('div');
    footer.className = 'modal-footer';

    // 1. Tombol Batal
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'btn-secondary';
    cancelBtn.textContent = 'Batal';
    cancelBtn.addEventListener('click', () => {
      this.dialog.close();
    });
    footer.appendChild(cancelBtn);

    // 2. Tombol Kembali
    const backBtn = document.createElement('button');
    backBtn.type = 'button';
    backBtn.className = 'btn-secondary';
    backBtn.textContent = 'Kembali';
    backBtn.style.display = 'none';
    footer.appendChild(backBtn);

    // 3. Tombol Lanjutkan (Langkah 1 -> Langkah 2)
    const nextBtn = document.createElement('button');
    nextBtn.type = 'button';
    nextBtn.className = 'btn-primary';
    nextBtn.textContent = 'Lanjutkan';
    footer.appendChild(nextBtn);

    // 4. Tombol Konfirmasi Nilai Primitives (Langkah 2 -> Langkah 3)
    const confirmPrimitivesBtn = document.createElement('button');
    confirmPrimitivesBtn.type = 'button';
    confirmPrimitivesBtn.className = 'btn-primary';
    confirmPrimitivesBtn.textContent = 'Konfirmasi nilai primitives';
    confirmPrimitivesBtn.style.display = 'none';
    footer.appendChild(confirmPrimitivesBtn);

    // 5. Tombol Konfirmasi & Bagikan Data (Langkah 3 final)
    const publishBtn = document.createElement('button');
    publishBtn.type = 'button';
    publishBtn.className = 'btn-primary';
    publishBtn.textContent = 'Konfirmasi & Bagikan Data';
    publishBtn.style.display = 'none';
    footer.appendChild(publishBtn);

    let currentStep = 1;
    let primitivesReference = null;

    const goToStep = (step) => {
      currentStep = step;
      if (modalErrBanner) modalErrBanner.style.display = 'none';

      if (step === 1) {
        title.textContent = 'Bagikan Data: Publikasi & Donasi Observasi Mandiri';
        subtitle.textContent = isForestryDataset
          ? 'Memisahkan observasi tutupan hutan mandiri dari data rujukan pihak ketiga untuk dipublikasikan secara terbuka ke konsorsium Epistem.'
          : 'Memisahkan observasi kebun mandiri dari data rujukan pihak ketiga untuk dipublikasikan secara terbuka ke konsorsium Epistem.';
        step1Container.style.display = 'block';
        step2Container.style.display = 'none';
        step3Container.style.display = 'none';

        cancelBtn.style.display = 'inline-block';
        backBtn.style.display = 'none';
        nextBtn.style.display = 'inline-block';
        confirmPrimitivesBtn.style.display = 'none';
        publishBtn.style.display = 'none';
      } else if (step === 2) {
        title.textContent = 'Ekstraksi Primitives';
        subtitle.textContent = 'Untuk setiap titik yang dibagikan, sistem akan melakukan ekstraksi terhadap komponen-komponen primitives. Silakan tinjau nilai primitives.';
        step1Container.style.display = 'none';
        step2Container.style.display = 'block';
        step3Container.style.display = 'none';

        cancelBtn.style.display = 'none';
        backBtn.style.display = 'inline-block';
        nextBtn.style.display = 'none';
        confirmPrimitivesBtn.style.display = 'inline-block';
        publishBtn.style.display = 'none';
      } else if (step === 3) {
        title.textContent = 'Bagikan Data: Penyelarasan Taksonomi & Publikasi';
        subtitle.textContent = 'Petakan kelas proyek ke taksonomi hierarkis Epistem dan lengkapi deklarasi legalitas publikasi.';
        step1Container.style.display = 'none';
        step2Container.style.display = 'none';
        step3Container.style.display = 'block';

        cancelBtn.style.display = 'inline-block';
        backBtn.style.display = 'inline-block';
        nextBtn.style.display = 'none';
        confirmPrimitivesBtn.style.display = 'none';
        publishBtn.style.display = 'inline-block';
      }
    };

    nextBtn.addEventListener('click', async () => {
      if (modalErrBanner) modalErrBanner.style.display = 'none';
      if (separation.summary.ownedCount === 0) {
        if (modalErrBanner) {
          modalErrBanner.textContent = 'Tidak ada observasi kebun mandiri milik pengguna yang dapat dibagikan pada koleksi ini.';
          modalErrBanner.style.display = 'block';
        }
        return;
      }

      if (!primitivesReference) {
        primitivesReference = await loadPrimitivesReference();
      }

      if (primitivesRows.length === 0) {
        primitivesRows = extractPrimitivesForRecords(separation.owned, primitivesReference);
      }

      renderPrimitivesTable();
      goToStep(2);
    });

    backBtn.addEventListener('click', () => {
      if (currentStep === 2) {
        goToStep(1);
      } else if (currentStep === 3) {
        goToStep(2);
      }
    });

    confirmPrimitivesBtn.addEventListener('click', () => {
      for (const item of primitivesRows) {
        if (item.record) {
          item.record.primitives = {
            waterbody: item.waterbody,
            tree_dominance: item.tree_dominance,
            vegetation_height: item.vegetation_height
          };
        }
      }
      updateSummarySection();
      goToStep(3);
    });

    publishBtn.addEventListener('click', () => {
      if (modalErrBanner) modalErrBanner.style.display = 'none';

      if (separation.owned.length === 0) {
        if (modalErrBanner) {
          modalErrBanner.textContent = 'Tidak ada observasi kebun mandiri milik pengguna yang dapat dibagikan pada koleksi ini.';
          modalErrBanner.style.display = 'block';
        }
        return;
      }

      const titleInp = document.getElementById('pub-dataset-title');
      const accInp = document.getElementById('pub-account-name');
      const instInp = document.getElementById('pub-institution');
      const emailInp = document.getElementById('pub-email');
      const respInp = document.getElementById('pub-responsibility');

      const errTitle = document.getElementById('err-dataset-title');
      const errAcc = document.getElementById('err-account-name');
      const errInst = document.getElementById('err-institution');
      const errEmail = document.getElementById('err-email');
      const errResp = document.getElementById('err-responsibility');

      let isValid = true;

      const titleVal = (titleInp?.value || '').trim();
      if (!titleVal) {
        if (errTitle) { errTitle.textContent = 'Nama koleksi data wajib diisi.'; errTitle.style.display = 'block'; }
        isValid = false;
      } else if (errTitle) { errTitle.style.display = 'none'; }

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
          modalErrBanner.textContent = 'Pilihan kelas taksonomi untuk Kebun karet wajib merupakan kelas daun (leaf node) yang valid.';
          modalErrBanner.style.display = 'block';
        }
        isValid = false;
      }

      if (!leaf2 || (leaf2.children && leaf2.children.length > 0)) {
        if (modalErrBanner) {
          modalErrBanner.textContent = 'Pilihan kelas taksonomi untuk Kebun sawit wajib merupakan kelas daun (leaf node) yang valid.';
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
          projectClassLabel: 'Kebun karet',
          epistemLeafId: leaf1.id,
          code: leaf1.code,
          name: leaf1.name,
          path: leaf1.path || leaf1.name,
          colour: '#7B1FA2'
        },
        2: {
          projectClassId: 2,
          projectClassLabel: 'Kebun sawit',
          epistemLeafId: leaf2.id,
          code: leaf2.code,
          name: leaf2.name,
          path: leaf2.path || leaf2.name,
          colour: '#E91E63'
        }
      };

      const primitivesMap = {};
      for (const item of primitivesRows) {
        primitivesMap[item.observation_id] = {
          waterbody: item.waterbody,
          tree_dominance: item.tree_dominance,
          vegetation_height: item.vegetation_height
        };
      }

      let publishedPkg;
      this.contributionWorkflow.publishedCollection = this.workspace.case2DonatedCollection;
      try {
        publishedPkg = this.contributionWorkflow.createPublishedPackage(
          separation.owned,
          {
            title: titleVal,
            accountName: accVal,
            owningInstitution: instVal,
            technicalEmail: emailVal,
            confirmedYear: Number(document.getElementById('pub-year')?.value) || 2026,
            acquisitionMethod: document.getElementById('pub-method')?.value || defaultMethod,
            boundaryAoi: document.getElementById('pub-aoi')?.value || 'Kabupaten Banyuasin',
            responsibilityAccepted: true,
            primitivesMap
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

    goToStep(1);

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
    pHeading.textContent = 'Pilih Kontribusi Pengguna yang Ditemukan:';
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
        <tr><th>Kontribusi Pengguna:</th><td>${escapeHtml(chosenId)}</td></tr>
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
          category: 'Kontribusi Pengguna Terpadu',
          description: 'Koleksi tutupan lahan kehutanan terpadu (Hutan dan Non-hutan dari kontribusi pengguna).',
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
        Tindakan ini hanya memengaruhi penyimpanan browser lokal (localStorage). Seluruh data campuran baru dan modifikasi lokal dari semua kasus (Kasus 1, Kasus 2, Kasus 3, dan ulasan Kasus 4) akan dihapus, dan aplikasi kembali ke kondisi data awal.
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
      if (this.currentUser && this.currentUser.id === 'admin') {
        this.updateUserProfileUI(DEMO_USERS.admin);
      } else {
        this.currentUser = DEMO_USERS.rizki;
        this.updateUserProfileUI(DEMO_USERS.rizki);
      }
      const selectUserRole = document.getElementById('select-active-user-header') || document.getElementById('select-user-role');
      const popoverUserRole = document.getElementById('popover-user-role-select');
      if (selectUserRole) selectUserRole.value = 'case_1';
      if (popoverUserRole) popoverUserRole.value = 'case_1';
      this.updateCaseNavHighlight(1);
      await this.switchDataset('data_kebun_sawit_karet_f');
      this.dialog.close();
      this.noticeMessage = 'Status percontohan lokal berhasil direset ke kondisi awal untuk seluruh kasus.';
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
