/**
 * src/ui/catalogue.js
 * Right panel dataset catalogue component for Portal Data Epistem.
 * Supports tabs: "Data Anda" (Private/User workspace) and "Data Terbuka" (Public published collections).
 * 
 * Invariants:
 * - Data Anda: shows workspace datasets for active user; own plantation/mixed cards have "Bagikan Data" button with stopPropagation.
 * - Data Terbuka: shows published collections with declared institution/year and status "Mandiri / Belum Ditelaah".
 * - Published cards are loadable onto map and have "Unduh GeoJSON" button for real download.
 * - User A / User B see same persisted published collection in Data Terbuka.
 * - Honest storage status acknowledgement and actionable recovery box.
 */

/**
 * Returns formatted year or year range for a catalogue item.
 * @param {Object} item
 * @returns {string}
 */
export function getDatasetYearText(item) {
  if (!item) return '2026';
  if (item.yearRange) return String(item.yearRange);

  // If item is mixed dataset
  if (item.id === 'data_campuran_1') {
    return '2025–2026';
  }
  if (item.id === 'data_hutan_sawit_partisipatif' || (item.title && item.title.toLowerCase().includes('campuran'))) {
    return '2024–2026';
  }
  if (item.isPublished || item.isDonated || item.id === 'data_kontribusi_mandiri') {
    return '2026';
  }

  if (item.year) return String(item.year);

  // Fallbacks by ID
  switch (item.id) {
    case 'data_hutan':
    case 'data_ref_mod_f':
      return '2024';
    case 'data_kebun_sawit_karet_f':
    case 'data_ref_mod_2b':
    case 'data_sawah':
      return '2025';
    case 'case4_data_kombinasi_f':
      return '2026';
    default:
      return '2025';
  }
}

export class CatalogueView {
  /**
   * @param {HTMLElement|string} containerElement
   * @param {import('../state/workspace.js').WorkspaceState} workspace
   * @param {Function} onSelectDataset Callback when a dataset is chosen
   * @param {Object} [callbacks] Additional actions { onShareDataset, onDownloadDataset, onOpenExplore }
   */
  constructor(containerElement, workspace, onSelectDataset, callbacks = {}) {
    this.container = typeof containerElement === 'string'
      ? document.getElementById(containerElement)
      : containerElement;
    this.workspace = workspace;
    this.onSelectDataset = onSelectDataset;
    this.onShareDataset = callbacks.onShareDataset || null;
    this.onDownloadDataset = callbacks.onDownloadDataset || null;
    this.onOpenExplore = callbacks.onOpenExplore || null;
    this.activeTab = 'data_anda'; // 'data_anda' or 'data_terbuka'

    this.init();
  }

  init() {
    if (!this.container) return;
    this.workspace.subscribe(state => this.render(state));
  }

  /**
   * Switches the active catalogue tab.
   * @param {'data_anda'|'data_terbuka'} tab
   */
  setActiveTab(tab) {
    this.activeTab = tab;
    // Check if current active dataset belongs to the newly activated tab
    const isUserB = this.workspace.activeUser === 'user_b';
    const activeId = this.workspace.activeDatasetId;
    let isPresentInNewTab = false;

    if (tab === 'data_anda') {
      if (isUserB) {
        isPresentInNewTab = (
          activeId === 'data_hutan' ||
          activeId === 'data_hutan_sawit_partisipatif' ||
          (this.workspace.case3PrivateCollection && activeId === this.workspace.case3PrivateCollection.meta.id)
        );
      } else {
        isPresentInNewTab = (
          activeId === 'data_kebun_sawit_karet_f' ||
          activeId === 'data_campuran_1'
        );
      }
    } else {
      isPresentInNewTab = (
        activeId === 'data_kontribusi_mandiri' ||
        activeId === 'data_ref_mod_f' ||
        activeId === 'data_ref_mod_2b' ||
        activeId === 'data_sawah' ||
        activeId === 'case4_data_kombinasi_f' ||
        (this.workspace.publishedCollections || []).some(p => p.meta && p.meta.id === activeId)
      );
    }

    if (!isPresentInNewTab && activeId !== null) {
      if (typeof this.onSelectDataset === 'function') {
        this.onSelectDataset(null);
      }
    }

    this.render(this.workspace);
  }

  /**
   * Renders the catalogue list.
   * @param {import('../state/workspace.js').WorkspaceState} state
   */
  render(state) {
    if (!this.container) return;
    this.container.textContent = ''; // Clear container

    // Header container
    const headerWrapper = document.createElement('div');
    headerWrapper.className = 'panel-header';

    const titleRow = document.createElement('div');
    titleRow.className = 'panel-title-row';

    const titleEl = document.createElement('h2');
    titleEl.className = 'panel-title';
    titleEl.textContent = 'Katalog Koleksi Data';
    titleRow.appendChild(titleEl);

    const exploreBtn = document.createElement('button');
    exploreBtn.type = 'button';
    exploreBtn.className = 'btn-explore-data';
    exploreBtn.title = 'Buka katalog terbuka untuk menambah data referensi';
    exploreBtn.innerHTML = `
      <svg viewBox="0 0 20 20" fill="currentColor" width="13" height="13" aria-hidden="true">
        <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
        <path fill-rule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clip-rule="evenodd" />
      </svg>
      <span>Jelajahi Data</span>
    `;
    exploreBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (typeof this.onOpenExplore === 'function') {
        this.onOpenExplore();
      }
    });
    titleRow.appendChild(exploreBtn);
    headerWrapper.appendChild(titleRow);

    const subtitleEl = document.createElement('p');
    subtitleEl.className = 'panel-subtitle';
    subtitleEl.textContent = 'Pilih koleksi data referensi untuk memuat sebaran dan atribut pada peta.';
    headerWrapper.appendChild(subtitleEl);

    // Tab Navigation: Data Anda / Data Terbuka
    const tabNav = document.createElement('div');
    tabNav.className = 'catalogue-tabs-nav';
    tabNav.setAttribute('role', 'tablist');
    tabNav.setAttribute('aria-label', 'Kategori Koleksi Data');

    const tabAnda = document.createElement('button');
    tabAnda.type = 'button';
    tabAnda.className = `catalogue-tab-btn ${this.activeTab === 'data_anda' ? 'is-active' : ''}`;
    tabAnda.setAttribute('role', 'tab');
    tabAnda.setAttribute('aria-selected', String(this.activeTab === 'data_anda'));
    tabAnda.setAttribute('data-tab', 'data_anda');
    tabAnda.textContent = 'Data Anda';
    tabAnda.addEventListener('click', () => {
      this.setActiveTab('data_anda');
    });
    tabNav.appendChild(tabAnda);

    const tabTerbuka = document.createElement('button');
    tabTerbuka.type = 'button';
    tabTerbuka.className = `catalogue-tab-btn ${this.activeTab === 'data_terbuka' ? 'is-active' : ''}`;
    tabTerbuka.setAttribute('role', 'tab');
    tabTerbuka.setAttribute('aria-selected', String(this.activeTab === 'data_terbuka'));
    tabTerbuka.setAttribute('data-tab', 'data_terbuka');
    tabTerbuka.textContent = 'Data Terbuka';
    tabTerbuka.addEventListener('click', () => {
      this.setActiveTab('data_terbuka');
    });
    tabNav.appendChild(tabTerbuka);

    headerWrapper.appendChild(tabNav);
    this.container.appendChild(headerWrapper);

    // List container
    const listWrapper = document.createElement('div');
    listWrapper.className = 'catalogue-item-list';

    // Determine items to display based on activeTab and activeUser
    const isUserB = state.activeUser === 'user_b';
    let filteredItems = [];

    if (this.activeTab === 'data_anda') {
      if (isUserB) {
        // User B's workspace shows user-owned forestry datasets (data_hutan and Case 3 combined data_hutan_sawit_partisipatif)
        filteredItems = state.catalogueItems.filter(i =>
          i.id === 'data_hutan' ||
          i.id === 'data_hutan_sawit_partisipatif' ||
          (state.case3PrivateCollection && i.id === state.case3PrivateCollection.meta.id)
        );
      } else {
        // User A's workspace shows only user-owned plantation datasets (initial plantation and private mixed dataset)
        filteredItems = state.catalogueItems.filter(i =>
          i.id === 'data_kebun_sawit_karet_f' ||
          i.id === 'data_campuran_1'
        );
      }
    } else {
      // Data Terbuka: shows open reference data, partner collections, integrated Case 4 collection, and published collections
      filteredItems = state.catalogueItems.filter(i =>
        i.isPublished ||
        i.id === 'data_kontribusi_mandiri' ||
        i.id === 'data_ref_mod_f' ||
        i.id === 'data_ref_mod_2b' ||
        i.id === 'data_sawah' ||
        i.id === 'case4_data_kombinasi_f'
      );
      // Ensure 'data_ref_mod_f' (Data Referensi Modular) is placed at the very end of Data Terbuka
      filteredItems.sort((a, b) => {
        if (a.id === 'data_ref_mod_f') return 1;
        if (b.id === 'data_ref_mod_f') return -1;
        return 0;
      });
    }

    if (filteredItems.length === 0) {
      const emptyBox = document.createElement('div');
      emptyBox.className = 'catalogue-empty-notice';
      if (this.activeTab === 'data_terbuka') {
        emptyBox.textContent = 'Belum ada data observasi yang dipublikasikan secara terbuka. Gunakan tombol "Bagikan Data" pada data Anda untuk mempublikasikan.';
      } else {
        emptyBox.textContent = 'Tidak ada koleksi data pada tampilan ini.';
      }
      listWrapper.appendChild(emptyBox);
    } else {
      for (const item of filteredItems) {
        const isActive = item.id === state.activeDatasetId;

        const card = document.createElement('div');
        card.className = `catalogue-card ${isActive ? 'is-active' : ''} ${item.isPrivate ? 'is-private' : ''}`;
        card.setAttribute('data-dataset-id', item.id);
        card.tabIndex = 0;
        card.setAttribute('role', 'button');
        card.setAttribute('aria-pressed', String(isActive));

        const metaHeader = document.createElement('div');
        metaHeader.className = 'catalogue-card-meta';

        const catBadge = document.createElement('span');
        catBadge.className = `catalogue-badge ${item.isPrivate ? 'badge-private' : ''}`;
        const displayedCategory = item.category === 'Koleksi Mitra' ? 'Kontribusi Pengguna' : (item.category || 'Kontribusi Pengguna');
        catBadge.textContent = displayedCategory;
        metaHeader.appendChild(catBadge);

        const yearBadge = document.createElement('span');
        yearBadge.className = 'catalogue-badge catalogue-badge-year';
        yearBadge.textContent = getDatasetYearText(item);
        metaHeader.appendChild(yearBadge);

        const classBadge = document.createElement('span');
        classBadge.className = 'catalogue-badge catalogue-badge-classes';
        let numClasses = item.classCount;
        if (numClasses === undefined || numClasses === null) {
          if (item.id === 'data_ref_mod_f') numClasses = 0;
          else if (item.id === 'data_hutan' || item.id === 'data_sawah') numClasses = 1;
          else if (item.id === 'data_ref_mod_2b' || item.id === 'case4_data_kombinasi_f') numClasses = 5;
          else if (item.crosswalk) numClasses = Object.keys(item.crosswalk).length;
          else numClasses = 2;
        }
        classBadge.textContent = `${numClasses} Kelas`;
        metaHeader.appendChild(classBadge);

        if (item.isNew) {
          const newBadge = document.createElement('span');
          newBadge.className = 'catalogue-badge badge-new';
          newBadge.textContent = 'Baru';
          metaHeader.appendChild(newBadge);
        }

        if (isActive) {
          const activeBadge = document.createElement('span');
          activeBadge.className = 'catalogue-badge-active';
          activeBadge.textContent = 'Aktif';
          metaHeader.appendChild(activeBadge);
        }
        card.appendChild(metaHeader);

        const cardTitle = document.createElement('h3');
        cardTitle.className = 'catalogue-card-title';
        cardTitle.textContent = item.title;
        card.appendChild(cardTitle);

        const cardDesc = document.createElement('p');
        cardDesc.className = 'catalogue-card-desc';
        cardDesc.textContent = item.description;
        card.appendChild(cardDesc);

        const detailsFooter = document.createElement('div');
        detailsFooter.className = 'catalogue-card-footer';

        const countsCol = document.createElement('div');
        countsCol.className = 'footer-counts-col footer-counts-row';

        const totalRef = item.archiveFeatureCount || item.featureCount || 0;
        const aoiRef = item.featureCount !== null && item.featureCount !== undefined ? item.featureCount : 0;

        const countLeft = document.createElement('span');
        countLeft.className = 'footer-count-left';
        countLeft.textContent = `${totalRef} Titik Referensi`;
        countsCol.appendChild(countLeft);

        const countRight = document.createElement('span');
        countRight.className = 'footer-count-right';
        countRight.textContent = `${aoiRef} Titik dalam AOI`;
        countsCol.appendChild(countRight);

        detailsFooter.appendChild(countsCol);

        // Card actions wrapper
        const actionsWrapper = document.createElement('div');
        actionsWrapper.className = 'card-actions-wrapper';

        // Own card Share Button (in Data Anda tab)
        const isOwnCard = item.id === 'data_kebun_sawit_karet_f' ||
                          item.id === 'data_campuran_1' ||
                          item.id === 'data_hutan' ||
                          (state.case3PrivateCollection && item.id === state.case3PrivateCollection.meta.id) ||
                          item.id === 'data_hutan_campuran' ||
                          item.id === 'data_hutan_sawit_partisipatif';
        if (isOwnCard && this.activeTab === 'data_anda') {
          const shareBtn = document.createElement('button');
          shareBtn.type = 'button';
          shareBtn.className = 'btn-card-share';
          shareBtn.setAttribute('data-dataset-id', item.id);
          shareBtn.textContent = 'Bagikan';
          shareBtn.title = 'Bagikan data observasi mandiri ini ke konsorsium';
          shareBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // Stop propagation to avoid selecting/loading the card!
            e.preventDefault();
            if (typeof this.onShareDataset === 'function') {
              this.onShareDataset(item.id);
            }
          });
          actionsWrapper.appendChild(shareBtn);
        }

        if (item.isPrivate && !item.isPublished) {
          const privSpan = document.createElement('span');
          privSpan.className = 'footer-private';
          privSpan.textContent = 'Koleksi Privat';
          actionsWrapper.appendChild(privSpan);
        }

        // Review button for open reference data (in Data Terbuka tab)
        if (this.activeTab === 'data_terbuka') {
          const reviewBtn = document.createElement('a');
          reviewBtn.className = 'btn-card-review';
          reviewBtn.href = 'https://app.collect.earth/review-institution?institutionId=7162';
          reviewBtn.target = '_blank';
          reviewBtn.rel = 'noopener noreferrer';
          reviewBtn.title = 'Buka telaah mutu untuk data ini di Collect Earth Online';
          reviewBtn.innerHTML = `
            <span>Telaah Mutu</span>
            <svg viewBox="0 0 20 20" fill="currentColor" width="11" height="11" aria-hidden="true">
              <path fill-rule="evenodd" d="M4.25 5.5a.75.75 0 00-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 00.75-.75v-4a.75.75 0 011.5 0v4A2.25 2.25 0 0112.75 16h-8.5A2.25 2.25 0 012 13.75v-8.5A2.25 2.25 0 014.25 3h4a.75.75 0 010 1.5h-4z" clip-rule="evenodd" />
              <path fill-rule="evenodd" d="M6.19 12.75a.75.75 0 001.06 0l6.5-6.5h-3a.75.75 0 010-1.5h4.75a.75.75 0 01.75.75v4.75a.75.75 0 01-1.5 0v-3l-6.5 6.5a.75.75 0 00-1.06 0z" clip-rule="evenodd" />
            </svg>
          `;
          reviewBtn.addEventListener('click', (e) => {
            e.stopPropagation();
          });
          actionsWrapper.appendChild(reviewBtn);
        }

        if (actionsWrapper.hasChildNodes()) {
          detailsFooter.appendChild(actionsWrapper);
        }

        card.appendChild(detailsFooter);

        // Event handlers for selecting/toggling the card
        const triggerSelect = () => {
          if (typeof this.onSelectDataset === 'function') {
            if (isActive) {
              this.onSelectDataset(null);
            } else {
              this.onSelectDataset(item.id);
            }
          }
        };

        card.addEventListener('click', triggerSelect);
        card.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            triggerSelect();
          }
        });

        listWrapper.appendChild(card);
      }
    }

    this.container.appendChild(listWrapper);

    // Storage recovery notice if corrupted
    if (state.storageRecoveryNotice) {
      const recBox = document.createElement('div');
      recBox.className = 'catalogue-recovery-box';

      const recText = document.createElement('div');
      recText.className = 'recovery-text';
      recText.textContent = state.storageRecoveryNotice;
      recBox.appendChild(recText);

      const resetBtn = document.createElement('button');
      resetBtn.className = 'btn-reset-storage';
      resetBtn.type = 'button';
      resetBtn.textContent = 'Reset Penyimpanan Lokal';
      resetBtn.addEventListener('click', () => {
        this.workspace.resetWorkspace();
      });
      recBox.appendChild(resetBtn);

      this.container.appendChild(recBox);
    }

    // Persistence status footer
    const storageBox = document.createElement('div');
    storageBox.className = 'catalogue-storage-status';

    const statusIcon = document.createElement('span');
    statusIcon.className = `status-indicator ${state.storageStatus.success ? 'status-ok' : 'status-err'}`;
    storageBox.appendChild(statusIcon);

    const statusText = document.createElement('span');
    statusText.className = 'status-text';
    let label = state.storageStatus.label || 'Data Tersimpan';
    if (label === 'Tersimpan di browser ini' || (state.storageStatus && state.storageStatus.success)) {
      label = 'Data Tersimpan';
    }
    statusText.textContent = label;
    storageBox.appendChild(statusText);

    this.container.appendChild(storageBox);
  }
}
