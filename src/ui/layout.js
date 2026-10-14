/**
 * src/ui/layout.js
 * Layout Controller for Portal Data Epistem Full-Canvas Workspace.
 * Coordinates:
 * - Floating left classification panel & reopen button.
 * - Floating right catalogue panel & reopen button.
 * - Bottom observation attribute table overlay drawer.
 * - Single source of truth driven by WorkspaceState.
 * - Keyboard accessibility, ARIA attributes, and focus transitions.
 * - Isolation of map scroll/click propagation on all floating controls.
 */

export class LayoutController {
  /**
   * @param {import('../state/workspace.js').WorkspaceState} workspace
   * @param {Object} [options]
   */
  constructor(workspace, options = {}) {
    this.workspace = workspace;
    this.options = options;

    // DOM Elements
    this.workspaceLayout = document.getElementById('workspace-layout');
    this.panelLeftContainer = document.getElementById('panel-left-container');
    this.btnCollapseLeft = document.getElementById('btn-collapse-left');
    this.btnReopenLeft = document.getElementById('btn-reopen-left');

    this.panelRightContainer = document.getElementById('panel-right-container');
    this.btnCollapseRight = document.getElementById('btn-collapse-right');
    this.btnReopenRight = document.getElementById('btn-reopen-right');

    this.panelBottom = document.getElementById('panel-bottom');

    this.lastFocusTarget = null;
    this.init();
  }

  init() {
    this.setupEventListeners();
    this.isolateMapEvents();

    // Subscribe to state changes to synchronize layout
    this.workspace.subscribe((state) => {
      this.syncLayout(state);
    });

    // Initial sync
    this.syncLayout(this.workspace);
  }

  setupEventListeners() {
    // Left panel toggle controls
    if (this.btnCollapseLeft) {
      this.btnCollapseLeft.addEventListener('click', () => {
        this.lastFocusTarget = 'reopen-left';
        this.workspace.toggleLeftPanel(true);
        if (this.btnReopenLeft) {
          window.requestAnimationFrame(() => this.btnReopenLeft.focus());
        }
      });
    }

    if (this.btnReopenLeft) {
      this.btnReopenLeft.addEventListener('click', () => {
        this.lastFocusTarget = 'collapse-left';
        this.workspace.toggleLeftPanel(false);
        if (this.btnCollapseLeft) {
          window.requestAnimationFrame(() => this.btnCollapseLeft.focus());
        }
      });
    }

    // Right panel toggle controls
    if (this.btnCollapseRight) {
      this.btnCollapseRight.addEventListener('click', () => {
        this.lastFocusTarget = 'reopen-right';
        this.workspace.toggleRightPanel(true);
        if (this.btnReopenRight) {
          window.requestAnimationFrame(() => this.btnReopenRight.focus());
        }
      });
    }

    if (this.btnReopenRight) {
      this.btnReopenRight.addEventListener('click', () => {
        this.lastFocusTarget = 'collapse-right';
        this.workspace.toggleRightPanel(false);
        if (this.btnCollapseRight) {
          window.requestAnimationFrame(() => this.btnCollapseRight.focus());
        }
      });
    }
  }

  /**
   * Prevents mouse clicks and wheel scrolling on overlay panels from propagating to Leaflet.
   */
  isolateMapEvents() {
    if (typeof window === 'undefined' || !window.L || !window.L.DomEvent) return;

    const elementsToIsolate = [
      this.panelLeftContainer,
      this.panelRightContainer,
      this.btnReopenLeft,
      this.btnReopenRight,
      this.panelBottom
    ].filter(Boolean);

    for (const el of elementsToIsolate) {
      window.L.DomEvent.disableClickPropagation(el);
      window.L.DomEvent.disableScrollPropagation(el);
    }
  }

  /**
   * Synchronizes DOM classes, ARIA states, and focusable status with workspace state.
   * @param {import('../state/workspace.js').WorkspaceState} state
   */
  syncLayout(state) {
    const hasActiveDataset = Boolean(state.activeDatasetId && state.activeRecords && state.activeRecords.length > 0);
    const isLeftCollapsed = Boolean(state.isLeftCollapsed);
    const isRightCollapsed = Boolean(state.isRightCollapsed);
    const isTableCollapsed = Boolean(state.isTableCollapsed);

    // 1. Workspace container layout modifier classes
    if (this.workspaceLayout) {
      this.workspaceLayout.classList.toggle('left-collapsed', isLeftCollapsed || !hasActiveDataset);
      this.workspaceLayout.classList.toggle('right-collapsed', isRightCollapsed);
      this.workspaceLayout.classList.toggle('table-expanded', !isTableCollapsed && hasActiveDataset);
    }

    // 2. Left Panel sync: completely hide if no active dataset
    if (this.panelLeftContainer) {
      if (!hasActiveDataset) {
        this.panelLeftContainer.style.display = 'none';
        this.panelLeftContainer.setAttribute('aria-hidden', 'true');
        this.panelLeftContainer.setAttribute('inert', '');
      } else {
        this.panelLeftContainer.style.display = '';
        this.panelLeftContainer.classList.toggle('is-collapsed', isLeftCollapsed);
        this.panelLeftContainer.setAttribute('aria-hidden', String(isLeftCollapsed));
        if (isLeftCollapsed) {
          this.panelLeftContainer.setAttribute('inert', '');
        } else {
          this.panelLeftContainer.removeAttribute('inert');
        }
      }
    }
    if (this.btnCollapseLeft) {
      this.btnCollapseLeft.setAttribute('aria-expanded', String(!isLeftCollapsed));
    }
    if (this.btnReopenLeft) {
      if (!hasActiveDataset) {
        this.btnReopenLeft.style.display = 'none';
      } else {
        this.btnReopenLeft.style.display = isLeftCollapsed ? 'inline-flex' : 'none';
        this.btnReopenLeft.setAttribute('aria-expanded', String(!isLeftCollapsed));
        this.btnReopenLeft.setAttribute('aria-hidden', String(!isLeftCollapsed));
      }
    }

    // 3. Right Panel sync
    if (this.panelRightContainer) {
      this.panelRightContainer.classList.toggle('is-collapsed', isRightCollapsed);
      this.panelRightContainer.setAttribute('aria-hidden', String(isRightCollapsed));
      if (isRightCollapsed) {
        this.panelRightContainer.setAttribute('inert', '');
      } else {
        this.panelRightContainer.removeAttribute('inert');
      }
    }
    if (this.btnCollapseRight) {
      this.btnCollapseRight.setAttribute('aria-expanded', String(!isRightCollapsed));
    }
    if (this.btnReopenRight) {
      this.btnReopenRight.style.display = isRightCollapsed ? 'inline-flex' : 'none';
      this.btnReopenRight.setAttribute('aria-expanded', String(!isRightCollapsed));
      this.btnReopenRight.setAttribute('aria-hidden', String(!isRightCollapsed));
    }

    // 4. Bottom Panel Drawer sync
    if (this.panelBottom) {
      this.panelBottom.classList.toggle('is-collapsed', isTableCollapsed);
    }
  }
}
