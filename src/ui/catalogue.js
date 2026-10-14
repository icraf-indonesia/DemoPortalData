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

export class CatalogueView {
  /**
   * @param {HTMLElement|string} containerElement
   * @param {import('../state/workspace.js').WorkspaceState} workspace
   * @param {Function} onSelectDataset Callback when a dataset is chosen
   * @param {Object} [callbacks] Additional actions { onShareDataset, onDownloadDataset }
   */
  constructor(containerElement, workspace, onSelectDataset, callbacks = {}) {
    this.container = typeof containerElement === 'string'
      ? document.getElementById(containerElement)
      : containerElement;
    this.workspace = workspace;
    this.onSelectDataset = onSelectDataset;
    this.onShareDataset = callbacks.onShareDataset || null;
    this.onDownloadDataset = callbacks.onDownloadDataset || null;
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
        activeId === 'data_hutan' ||
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

    const titleEl = document.createElement('h2');
    titleEl.className = 'panel-title';
    titleEl.textContent = 'Katalog Koleksi Data';
    headerWrapper.appendChild(titleEl);

    const subtitleEl = document.createElement('p');
    subtitleEl.className = 'panel-subtitle';
    subtitleEl.textContent = 'Pilih koleksi data rujukan untuk memuat sebaran dan atribut pada peta.';
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
        i.id === 'data_hutan' ||
        i.id === 'case4_data_kombinasi_f'
      );
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
        catBadge.textContent = item.category || 'Koleksi Mitra';
        metaHeader.appendChild(catBadge);

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

        const countSpan = document.createElement('span');
        countSpan.className = 'footer-count';
        if (item.featureCount !== null && item.featureCount !== undefined) {
          if (item.archiveFeatureCount && item.archiveFeatureCount !== item.featureCount) {
            countSpan.textContent = `${item.featureCount} titik AOI (${item.archiveFeatureCount} arsip)`;
          } else {
            countSpan.textContent = `${item.featureCount} titik AOI`;
          }
        } else {
          countSpan.textContent = 'Inspeksi data';
        }
        detailsFooter.appendChild(countSpan);

        // Card actions wrapper
        const actionsWrapper = document.createElement('div');
        actionsWrapper.className = 'card-actions-wrapper';

        // Own card Share Button (in Data Anda tab)
        const isOwnCard = item.id === 'data_kebun_sawit_karet_f' || item.id === 'data_campuran_1';
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

        // Published Card Download Button (in Data Terbuka tab)
        if (item.isPublished) {
          const downloadBtn = document.createElement('button');
          downloadBtn.type = 'button';
          downloadBtn.className = 'btn-card-download';
          downloadBtn.setAttribute('data-dataset-id', item.id);
          downloadBtn.textContent = 'Unduh GeoJSON';
          downloadBtn.title = 'Unduh berkas GeoJSON publikasi lengkap dengan metadata';
          downloadBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // Stop propagation
            e.preventDefault();
            if (typeof this.onDownloadDataset === 'function') {
              this.onDownloadDataset(item.id);
            }
          });
          actionsWrapper.appendChild(downloadBtn);
        }

        if (item.isPrivate && !item.isPublished) {
          const privSpan = document.createElement('span');
          privSpan.className = 'footer-private';
          privSpan.textContent = 'Koleksi Privat';
          detailsFooter.appendChild(privSpan);
        }

        detailsFooter.appendChild(actionsWrapper);
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
    statusText.textContent = state.storageStatus.label || 'Status penyimpanan belum tersedia';
    storageBox.appendChild(statusText);

    this.container.appendChild(storageBox);
  }
}
