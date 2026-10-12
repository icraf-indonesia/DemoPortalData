/**
 * src/ui/catalogue.js
 * Right panel dataset catalogue component.
 * Allows inspecting and switching between available reference datasets and private mixed dataset.
 * 
 * Invariants:
 * - Includes all 6 point collections with honest metadata.
 * - Displays private Data Campuran #1 when created.
 * - Honest storage status acknowledgement.
 * - Actionable storage recovery when corrupted.
 */

export class CatalogueView {
  /**
   * @param {HTMLElement|string} containerElement
   * @param {import('../state/workspace.js').WorkspaceState} workspace
   * @param {Function} onSelectDataset Callback when a dataset is chosen
   */
  constructor(containerElement, workspace, onSelectDataset) {
    this.container = typeof containerElement === 'string'
      ? document.getElementById(containerElement)
      : containerElement;
    this.workspace = workspace;
    this.onSelectDataset = onSelectDataset;

    this.init();
  }

  init() {
    if (!this.container) return;
    this.workspace.subscribe(state => this.render(state));
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

    this.container.appendChild(headerWrapper);

    // List container
    const listWrapper = document.createElement('div');
    listWrapper.className = 'catalogue-item-list';

    for (const item of state.catalogueItems) {
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
      catBadge.textContent = item.category || 'Koleksi Data';
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
          countSpan.textContent = `${item.featureCount} titik`;
        }
      } else {
        countSpan.textContent = 'Inspeksi data';
      }
      detailsFooter.appendChild(countSpan);

      if (item.isPrivate) {
        const privSpan = document.createElement('span');
        privSpan.className = 'footer-private';
        privSpan.textContent = 'Koleksi Privat';
        detailsFooter.appendChild(privSpan);
      }

      card.appendChild(detailsFooter);

      // Event handlers
      const triggerSelect = () => {
        if (!isActive && typeof this.onSelectDataset === 'function') {
          this.onSelectDataset(item.id);
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
