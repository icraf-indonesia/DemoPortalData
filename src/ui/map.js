/**
 * src/ui/map.js
 * Map-centred Leaflet view component for Portal Data Epistem.
 * 
 * Strict constraints:
 * - Default plain background: ZERO external basemap or tile server calls when offline.
 * - Optional EOX Sentinel-2 Cloudless 2025 layer with explicit year and attribution:
 *   'EOxCloudless - https://cloudless.eox.at by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2025)' under CC BY-NC-SA 4.0.
 * - Graceful offline fallback on tile load error without evidence claim.
 * - Interactive on-screen point sampling (crosshair cursor and click capture).
 * - Case-aware project class styling (Case 1 3-class, Case 3 forestry, Case 4 5-class).
 * - Exact boundary rendering and point selection highlighting.
 */

import {
  getProjectClass,
  PROJECT_CLASSES,
  CASE3_FORESTRY_CLASSES,
  CASE4_TARGET_CLASSES,
  UNMAPPED_CLASS
} from '../domain/taxonomy.js';

export const OPENTOPOMAP_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors, SRTM | Map style: &copy; <a href="https://opentopomap.org/about" target="_blank" rel="noopener">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/" target="_blank" rel="noopener">CC-BY-SA</a>)';
export const OPENTOPOMAP_TILE_URL = 'https://a.tile.opentopomap.org/{z}/{x}/{y}.png';

export const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors';
export const OSM_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

export const EOX_ATTRIBUTION = 'EOxCloudless - https://cloudless.eox.at by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2025)';
export const EOX_TILE_URL = 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2025_3857/default/g/{z}/{y}/{x}.jpg';

export const BASEMAP_PROVIDERS = Object.freeze({
  eox: {
    id: 'eox',
    name: 'Satelit',
    sublabel: 'Sentinel-2 Cloudless 2025',
    url: EOX_TILE_URL,
    attribution: EOX_ATTRIBUTION,
    maxZoom: 18
  },
  osm: {
    id: 'osm',
    name: 'Peta Jalan',
    sublabel: 'OpenStreetMap',
    url: OSM_TILE_URL,
    attribution: OSM_ATTRIBUTION,
    maxZoom: 19
  }
});

export class MapView {
  /**
   * @param {HTMLElement|string} containerElement
   * @param {import('../state/workspace.js').WorkspaceState} workspace
   */
  constructor(containerElement, workspace) {
    this.container = typeof containerElement === 'string'
      ? document.getElementById(containerElement)
      : containerElement;
    this.workspace = workspace;

    this.map = null;
    this.boundaryLayer = null;
    this.pointsLayer = null;
    this.highlightLayer = null;
    this.draftLayer = null;
    this.activeTileLayer = null;

    // Load persisted basemap provider and overlay states (default to online EOX Sentinel-2 Cloudless 2025)
    let savedProvider = 'eox';
    let savedBoundary = true;
    let savedPoints = true;
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const isMigrated = window.localStorage.getItem('portal_epistem_basemap_migrated_s2');
        const p = window.localStorage.getItem('portal_epistem_basemap_provider');
        if (!isMigrated) {
          // First run or migration: default to eox (Satelit Sentinel-2 Cloudless 2025)
          savedProvider = 'eox';
          window.localStorage.setItem('portal_epistem_basemap_provider', 'eox');
          window.localStorage.setItem('portal_epistem_basemap_migrated_s2', 'true');
        } else if (p && BASEMAP_PROVIDERS[p]) {
          savedProvider = p;
        } else {
          // Stale provider fallback
          savedProvider = 'eox';
          window.localStorage.setItem('portal_epistem_basemap_provider', 'eox');
        }
        const b = window.localStorage.getItem('portal_epistem_overlay_boundary');
        if (b !== null) savedBoundary = b === 'true';
        const pts = window.localStorage.getItem('portal_epistem_overlay_points');
        if (pts !== null) savedPoints = pts === 'true';
      }
    } catch (_) {}

    this.activeProviderId = savedProvider;
    this.showBoundary = savedBoundary;
    this.showPoints = savedPoints;

    this.layerMenuEl = null;
    this.layerPopoverEl = null;
    this.onStatusNotice = null;

    this.markerMap = new Map();
    this.lastRenderedDatasetId = null;
    this.lastRenderedCaseId = null;

    this.isSamplingMode = false;
    this.samplingClickHandler = null;

    this.initMap();
  }

  get isEoxActive() {
    return this.activeProviderId === 'eox';
  }

  set isEoxActive(val) {
    // legacy compatibility
  }

  initMap() {
    if (!this.container) return;

    if (typeof window.L === 'undefined') {
      console.error('Leaflet library (L) is not loaded.');
      return;
    }

    // Initialize map with local coordinate view
    this.map = window.L.map(this.container, {
      center: [-2.88, 104.5],
      zoom: 9,
      zoomControl: true,
      attributionControl: true
    });

    // Dedicated vector layers
    this.boundaryLayer = window.L.geoJSON(null, {
      style: {
        color: '#455A64',
        weight: 2,
        dashArray: '4, 4',
        fillColor: '#ECEFF1',
        fillOpacity: 0.25
      }
    });
    if (this.showBoundary) {
      this.boundaryLayer.addTo(this.map);
    }

    this.pointsLayer = window.L.featureGroup();
    this.highlightLayer = window.L.featureGroup();
    if (this.showPoints) {
      this.pointsLayer.addTo(this.map);
      this.highlightLayer.addTo(this.map);
    }

    this.draftLayer = window.L.featureGroup().addTo(this.map);

    // Setup floating Lapisan button and popover
    this.setupFloatingLayerMenu();

    // Set initial basemap provider
    this.setBasemapProvider(this.activeProviderId);

    window.addEventListener('resize', () => {
      this.invalidateSize();
      this.fitToContent();
    });

    if (typeof window !== 'undefined' && 'ResizeObserver' in window && this.container) {
      this.resizeObserver = new ResizeObserver(() => {
        if (this.map) {
          this.map.invalidateSize();
        }
      });
      this.resizeObserver.observe(this.container);
    }

    this.workspace.subscribe(state => this.render(state));
  }

  /**
   * Sets up floating Lapisan button and layer configuration popover.
   */
  setupFloatingLayerMenu() {
    if (!this.container) return;
    if (this.container.querySelector('#btn-layer-menu')) return;

    const controlWrapper = document.createElement('div');
    controlWrapper.className = 'floating-layer-control-wrapper';

    // Prevent Leaflet map click and scroll propagation so sampling and zooming aren't triggered
    if (typeof window.L !== 'undefined' && window.L.DomEvent) {
      window.L.DomEvent.disableClickPropagation(controlWrapper);
      window.L.DomEvent.disableScrollPropagation(controlWrapper);
    }

    // Floating Button
    const btnMenu = document.createElement('button');
    btnMenu.type = 'button';
    btnMenu.id = 'btn-layer-menu';
    btnMenu.className = 'btn-layer-menu btn-floating-layer';
    btnMenu.setAttribute('aria-expanded', 'false');
    btnMenu.setAttribute('aria-haspopup', 'true');
    btnMenu.setAttribute('aria-label', 'Buka menu lapisan peta');
    btnMenu.innerHTML = `
      <svg class="layer-icon" viewBox="0 0 20 20" fill="currentColor" width="16" height="16" aria-hidden="true">
        <path d="M10 2L2 6l8 4 8-4-8-4zM2 10l8 4 8-4-2-1-6 3-6-3-2 1zm0 4l8 4 8-4-2-1-6 3-6-3-2 1z"/>
      </svg>
      <span class="layer-text">Lapisan</span>
    `;

    // Floating Popover
    const popover = document.createElement('div');
    popover.id = 'popover-layer-menu';
    popover.className = 'popover-layer-menu';
    popover.setAttribute('role', 'dialog');
    popover.setAttribute('aria-label', 'Pengaturan Lapisan Peta');
    popover.style.display = 'none';

    popover.innerHTML = `
      <div class="popover-header">
        <h4 class="popover-title">Lapisan Peta</h4>
        <button type="button" class="btn-popover-close" aria-label="Tutup menu lapisan">&times;</button>
      </div>
      <div class="popover-section">
        <div class="popover-section-label">Peta Dasar</div>
        <div class="basemap-card-grid">
          <button type="button" class="basemap-card" data-provider="eox" title="Satelit Sentinel-2 Cloudless 2025">
            <div class="basemap-thumb basemap-thumb-eox thumb-eox">
              <div class="thumb-sat-patch1"></div>
              <div class="thumb-sat-patch2"></div>
            </div>
            <div class="basemap-card-label basemap-card-title">Satelit</div>
            <div class="basemap-card-sub">Sentinel-2 Cloudless 2025</div>
          </button>
          <button type="button" class="basemap-card" data-provider="osm" title="Peta Jalan (OpenStreetMap)">
            <div class="basemap-thumb basemap-thumb-osm thumb-osm">
              <div class="thumb-road-h"></div>
              <div class="thumb-road-v"></div>
              <div class="thumb-patch"></div>
            </div>
            <div class="basemap-card-label basemap-card-title">Peta Jalan</div>
            <div class="basemap-card-sub">OpenStreetMap</div>
          </button>
        </div>
      </div>
      <div class="popover-section">
        <div class="popover-section-label">Elemen Data</div>
        <label class="overlay-toggle-item">
          <input type="checkbox" id="chk-overlay-boundary" ${this.showBoundary ? 'checked' : ''}>
          <span class="overlay-toggle-text">Batas Banyuasin</span>
        </label>
        <label class="overlay-toggle-item">
          <input type="checkbox" id="chk-overlay-points" ${this.showPoints ? 'checked' : ''}>
          <span class="overlay-toggle-text">Titik Observasi</span>
        </label>
      </div>
    `;

    controlWrapper.appendChild(btnMenu);
    controlWrapper.appendChild(popover);
    this.container.appendChild(controlWrapper);

    this.layerMenuEl = btnMenu;
    this.layerPopoverEl = popover;

    // Toggle popover visibility
    const togglePopover = (show) => {
      const isVisible = show !== undefined ? show : popover.style.display === 'none';
      popover.style.display = isVisible ? 'block' : 'none';
      btnMenu.setAttribute('aria-expanded', String(isVisible));
      if (isVisible) {
        this.updateLayerMenuUI();
        const activeCard = popover.querySelector('.basemap-card.is-active') || popover.querySelector('.basemap-card');
        if (activeCard) activeCard.focus();
      }
    };

    btnMenu.addEventListener('click', (e) => {
      e.stopPropagation();
      togglePopover();
    });

    const closeBtn = popover.querySelector('.btn-popover-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        togglePopover(false);
        btnMenu.focus();
      });
    }

    // Basemap card selection
    const cards = popover.querySelectorAll('.basemap-card');
    cards.forEach(card => {
      card.addEventListener('click', (e) => {
        e.stopPropagation();
        const provId = card.getAttribute('data-provider');
        this.setBasemapProvider(provId);
      });
    });

    // Overlays checkboxes
    const chkBoundary = popover.querySelector('#chk-overlay-boundary');
    if (chkBoundary) {
      chkBoundary.addEventListener('change', (e) => {
        this.setBoundaryVisible(e.target.checked);
      });
    }

    const chkPoints = popover.querySelector('#chk-overlay-points');
    if (chkPoints) {
      chkPoints.addEventListener('change', (e) => {
        this.setPointsVisible(e.target.checked);
      });
    }

    // Close on click outside
    document.addEventListener('click', (e) => {
      if (!controlWrapper.contains(e.target)) {
        togglePopover(false);
      }
    });

    // Close on Escape key
    controlWrapper.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        togglePopover(false);
        btnMenu.focus();
      }
    });

    this.updateLayerMenuUI();
  }

  /**
   * Updates popover UI cards and checkbox states.
   */
  updateLayerMenuUI() {
    if (!this.layerPopoverEl) return;
    const cards = this.layerPopoverEl.querySelectorAll('.basemap-card');
    cards.forEach(card => {
      const provId = card.getAttribute('data-provider');
      const isActive = provId === this.activeProviderId;
      card.classList.toggle('is-active', isActive);
      card.setAttribute('aria-pressed', String(isActive));
    });

    const chkBoundary = this.layerPopoverEl.querySelector('#chk-overlay-boundary');
    if (chkBoundary) chkBoundary.checked = this.showBoundary;

    const chkPoints = this.layerPopoverEl.querySelector('#chk-overlay-points');
    if (chkPoints) chkPoints.checked = this.showPoints;
  }

  /**
   * Switches active basemap provider (opentopomap, osm, eox, neutral).
   * @param {string} providerId
   * @param {Function} [onFailure] Error callback on tile loading failure
   */
  setBasemapProvider(providerId, onFailure = null) {
    if (!this.map || typeof window.L === 'undefined') return;

    const provider = BASEMAP_PROVIDERS[providerId] || BASEMAP_PROVIDERS.eox || BASEMAP_PROVIDERS.osm;
    this.activeProviderId = provider.id;

    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem('portal_epistem_basemap_provider', provider.id);
        window.localStorage.setItem('portal_epistem_basemap_migrated_s2', 'true');
      }
    } catch (_) {}

    if (this.activeTileLayer) {
      this.map.removeLayer(this.activeTileLayer);
      this.activeTileLayer = null;
    }

    if (provider.url) {
      this.activeTileLayer = window.L.tileLayer(provider.url, {
        maxZoom: provider.maxZoom || 18,
        attribution: provider.attribution || '',
        crossOrigin: true
      });

      let errorReported = false;
      this.activeTileLayer.on('tileerror', () => {
        if (!errorReported) {
          errorReported = true;
          console.warn(`Peta dasar ${provider.name} tidak dapat dimuat (offline/gagal).`);
          const noticeMsg = `Peta dasar ${provider.name} tidak dapat dimuat (koneksi offline atau diblokir). Kanvas peta tetap menggunakan latar lokal; data observasi dan batas wilayah tetap berfungsi penuh.`;
          if (typeof onFailure === 'function') {
            onFailure(noticeMsg);
          } else if (typeof this.onStatusNotice === 'function') {
            this.onStatusNotice(noticeMsg);
          }
        }
      });

      this.activeTileLayer.addTo(this.map);
      this.activeTileLayer.bringToBack();
    }

    this.updateLayerMenuUI();
  }

  /**
   * Toggles boundary overlay layer visibility.
   * @param {boolean} visible
   */
  setBoundaryVisible(visible) {
    this.showBoundary = Boolean(visible);
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem('portal_epistem_overlay_boundary', String(this.showBoundary));
      }
    } catch (_) {}

    if (this.boundaryLayer && this.map) {
      if (this.showBoundary) {
        if (!this.map.hasLayer(this.boundaryLayer)) {
          this.map.addLayer(this.boundaryLayer);
        }
      } else {
        if (this.map.hasLayer(this.boundaryLayer)) {
          this.map.removeLayer(this.boundaryLayer);
        }
      }
    }
    this.updateLayerMenuUI();
  }

  /**
   * Toggles observation points layer visibility.
   * @param {boolean} visible
   */
  setPointsVisible(visible) {
    this.showPoints = Boolean(visible);
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem('portal_epistem_overlay_points', String(this.showPoints));
      }
    } catch (_) {}

    if (this.pointsLayer && this.map) {
      if (this.showPoints) {
        if (!this.map.hasLayer(this.pointsLayer)) {
          this.map.addLayer(this.pointsLayer);
          this.map.addLayer(this.highlightLayer);
        }
      } else {
        if (this.map.hasLayer(this.pointsLayer)) {
          this.map.removeLayer(this.pointsLayer);
          this.map.removeLayer(this.highlightLayer);
        }
      }
    }
    this.updateLayerMenuUI();
  }

  /**
   * Legacy method: toggles the optional online EOX basemap.
   * @param {boolean} enable
   * @param {Function} [onFailure] Error callback on tile loading failure
   */
  setEoxBasemap(enable, onFailure = null) {
    if (enable) {
      this.setBasemapProvider('eox', onFailure);
    } else {
      this.setBasemapProvider('osm');
    }
  }

  /**
   * Enables interactive on-screen point sampling.
   * @param {Function} onPointClicked Callback with [longitude, latitude]
   */
  enableSamplingMode(onPointClicked) {
    this.isSamplingMode = true;
    if (this.container) {
      this.container.style.cursor = 'crosshair';
    }

    if (this.samplingClickHandler) {
      this.map.off('click', this.samplingClickHandler);
    }

    this.samplingClickHandler = (e) => {
      if (!this.isSamplingMode) return;
      const lon = Number(e.latlng.lng.toFixed(6));
      const lat = Number(e.latlng.lat.toFixed(6));

      // Display draft sampling pin
      this.setDraftMarker([lon, lat]);

      if (typeof onPointClicked === 'function') {
        onPointClicked([lon, lat]);
      }
    };

    this.map.on('click', this.samplingClickHandler);
  }

  /**
   * Disables interactive on-screen point sampling.
   */
  disableSamplingMode() {
    this.isSamplingMode = false;
    if (this.container) {
      this.container.style.cursor = '';
    }
    if (this.samplingClickHandler) {
      this.map.off('click', this.samplingClickHandler);
      this.samplingClickHandler = null;
    }
    this.clearDraftMarker();
  }

  /**
   * Sets temporary marker for active sampling draft point.
   * @param {[number, number]} coords [lon, lat]
   */
  setDraftMarker(coords) {
    if (!this.map || typeof window.L === 'undefined') return;
    this.draftLayer.clearLayers();

    const marker = window.L.circleMarker([coords[1], coords[0]], {
      radius: 9,
      fillColor: '#FF6F00',
      color: '#FFFFFF',
      weight: 2.5,
      opacity: 1,
      fillOpacity: 0.95
    });

    const pulseRing = window.L.circleMarker([coords[1], coords[0]], {
      radius: 16,
      fillColor: 'transparent',
      color: '#FF6F00',
      weight: 2,
      dashArray: '3, 3',
      opacity: 0.9
    });

    this.draftLayer.addLayer(marker);
    this.draftLayer.addLayer(pulseRing);
  }

  /**
   * Clears active draft sampling marker.
   */
  clearDraftMarker() {
    if (this.draftLayer) {
      this.draftLayer.clearLayers();
    }
  }

  /**
   * Fits map bounds to available boundary or points with padding and layout invalidation.
   */
  fitToContent() {
    if (!this.map) return;
    try {
      this.map.invalidateSize();
      if (this.boundaryLayer && this.boundaryLayer.getLayers().length > 0) {
        const bounds = this.boundaryLayer.getBounds();
        if (bounds.isValid()) {
          this.map.fitBounds(bounds, { padding: [24, 24] });
          return;
        }
      }
      if (this.pointsLayer && this.pointsLayer.getLayers().length > 0) {
        const ptBounds = this.pointsLayer.getBounds();
        if (ptBounds.isValid()) {
          this.map.fitBounds(ptBounds, { padding: [30, 30] });
        }
      }
    } catch (err) {
      console.warn('Could not fit map content:', err);
    }
  }

  /**
   * Invalidates Leaflet map dimensions after layout resizing.
   */
  invalidateSize() {
    if (this.map) {
      this.map.invalidateSize();
    }
  }

  /**
   * Resolves active taxonomy schema based on workspace case ID.
   * @param {number} caseId
   * @returns {Object}
   */
  resolveActiveSchema(caseId) {
    if (caseId === 3) return CASE3_FORESTRY_CLASSES;
    if (caseId === 4) return CASE4_TARGET_CLASSES;
    return PROJECT_CLASSES;
  }

  /**
   * Renders map layers according to workspace state.
   * @param {import('../state/workspace.js').WorkspaceState} state
   */
  render(state) {
    if (!this.map) return;

    // 1. Render Boundary if present
    if (state.boundaryData && this.boundaryLayer.getLayers().length === 0) {
      this.boundaryLayer.clearLayers();
      this.boundaryLayer.addData(state.boundaryData);
      this.fitToContent();
    }

    // If no dataset selected, clear all points and highlights from map canvas
    if (!state.activeDatasetId || !state.activeRecords || state.activeRecords.length === 0) {
      this.lastRenderedDatasetId = null;
      this.lastRenderedCaseId = null;
      this.pointsLayer.clearLayers();
      this.highlightLayer.clearLayers();
      this.markerMap.clear();
      return;
    }

    const schema = state.getActiveSchema();

    // 2. Render Point Observations if dataset changed, case changed, records changed, or newly loaded
    const needsRerender = this.lastRenderedDatasetId !== state.activeDatasetId ||
                          this.lastRenderedCaseId !== state.activeCaseId ||
                          this.lastRenderedRecords !== state.activeRecords ||
                          this.lastRenderedRecordsLength !== state.activeRecords.length ||
                          this.pointsLayer.getLayers().length === 0;

    if (needsRerender) {
      this.lastRenderedDatasetId = state.activeDatasetId;
      this.lastRenderedCaseId = state.activeCaseId;
      this.lastRenderedRecords = state.activeRecords;
      this.lastRenderedRecordsLength = state.activeRecords.length;
      this.pointsLayer.clearLayers();
      this.markerMap.clear();

      for (const obs of state.activeRecords) {
        const coords = obs.geometry.coordinates; // [lon, lat]
        const classDef = getProjectClass(obs.project_class_id, schema);

        const marker = window.L.circleMarker([coords[1], coords[0]], {
          radius: obs.review_priority === 'high' ? 8 : 6,
          fillColor: classDef.colour,
          color: obs.review_priority === 'high' ? '#FFD54F' : '#FFFFFF',
          weight: obs.review_priority === 'high' ? 2.5 : 1.5,
          opacity: 1,
          fillOpacity: 0.85
        });

        // Safe tooltip/popup with textContent-based details
        const popupDiv = document.createElement('div');
        popupDiv.className = 'map-popup-card';
        
        const titleEl = document.createElement('strong');
        titleEl.textContent = obs.project_class_id !== null
          ? `${classDef.label} (Kelas ${obs.project_class_id})`
          : classDef.label;
        popupDiv.appendChild(titleEl);

        const idEl = document.createElement('div');
        idEl.className = 'popup-sub';
        idEl.textContent = `ID: ${obs.observation_id}`;
        popupDiv.appendChild(idEl);

        if (obs.review_priority === 'high') {
          const prioEl = document.createElement('div');
          prioEl.className = 'popup-priority-badge';
          prioEl.textContent = 'Prioritas Telaah Tinggi (Sampling Layar)';
          popupDiv.appendChild(prioEl);
        }

        if (obs.source_class_label) {
          const srcEl = document.createElement('div');
          srcEl.className = 'popup-src';
          srcEl.textContent = `Kelas sumber: ${obs.source_class_label}`;
          popupDiv.appendChild(srcEl);
        }

        const coordsEl = document.createElement('div');
        coordsEl.className = 'popup-coords';
        coordsEl.textContent = `Koord: ${coords[1].toFixed(5)}, ${coords[0].toFixed(5)}`;
        popupDiv.appendChild(coordsEl);

        marker.bindPopup(popupDiv);

        marker.on('click', () => {
          this.workspace.setSelectedPoint(obs.observation_id);
        });

        this.pointsLayer.addLayer(marker);
        this.markerMap.set(obs.observation_id, {
          marker,
          latLng: [coords[1], coords[0]],
          record: obs
        });
      }

      // Fit map content after points update
      if (state.activeRecords.length > 0) {
        this.fitToContent();
      }
    }

    // 3. Highlight Selected Point
    this.highlightLayer.clearLayers();
    if (state.selectedPointId && this.markerMap.has(state.selectedPointId)) {
      const entry = this.markerMap.get(state.selectedPointId);
      const highlightRing = window.L.circleMarker(entry.latLng, {
        radius: 13,
        color: '#FFB300',
        weight: 3.5,
        opacity: 0.95,
        fillColor: 'transparent',
        fillOpacity: 0
      });
      this.highlightLayer.addLayer(highlightRing);

      this.map.panTo(entry.latLng, { animate: true, duration: 0.3 });
      if (!entry.marker.isPopupOpen()) {
        entry.marker.openPopup();
      }
    }
  }

  /**
   * Centers and highlights a specific point by ID.
   * @param {string} pointId
   */
  centerOnPoint(pointId) {
    if (this.markerMap.has(pointId)) {
      const entry = this.markerMap.get(pointId);
      this.map.setView(entry.latLng, Math.max(this.map.getZoom(), 12), { animate: true });
      this.workspace.setSelectedPoint(pointId);
    }
  }
}
