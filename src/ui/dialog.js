/**
 * src/ui/dialog.js
 * Accessible modal dialog controller for staged complement flow and export confirmation.
 * 
 * Invariants:
 * - Keyboard accessible (ESC closes, Tab trap).
 * - ARIA role="dialog", aria-modal="true".
 * - Cancellable with zero mutations on Cancel / Backdrop click / ESC.
 */

export class ModalDialog {
  constructor() {
    this.modalOverlay = null;
    this.activeCloseCallback = null;
    this.createDom();
  }

  createDom() {
    let overlay = document.getElementById('app-modal-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'app-modal-overlay';
      overlay.className = 'modal-overlay';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.style.display = 'none';

      const dialogBox = document.createElement('div');
      dialogBox.id = 'app-modal-box';
      dialogBox.className = 'modal-box';

      overlay.appendChild(dialogBox);
      document.body.appendChild(overlay);

      // Close on backdrop click
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          this.close();
        }
      });

      // Close on Escape key
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && overlay.style.display !== 'none') {
          e.preventDefault();
          this.close();
        }
      });
    }
    this.modalOverlay = overlay;
  }

  /**
   * Opens the modal with custom DOM content and an optional cancel callback.
   * @param {HTMLElement} contentNode
   * @param {Function} [onCancel]
   */
  open(contentNode, onCancel = null) {
    this.activeCloseCallback = onCancel;
    const box = document.getElementById('app-modal-box');
    if (!box) return;

    box.textContent = '';
    box.appendChild(contentNode);
    this.modalOverlay.style.display = 'flex';

    // Set underlying UI inert and inaccessible while dialog is open
    if (typeof document !== 'undefined') {
      const siblings = Array.from(document.body.children).filter(el => el !== this.modalOverlay);
      for (const el of siblings) {
        el.setAttribute('inert', '');
      }

      // Trap focus inside modal
      if (this.trapFocusHandler) {
        document.removeEventListener('keydown', this.trapFocusHandler);
      }
      this.trapFocusHandler = (e) => {
        if (e.key !== 'Tab') return;
        const focusable = box.querySelectorAll(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) {
          e.preventDefault();
          return;
        }
        const firstEl = focusable[0];
        const lastEl = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === firstEl || !box.contains(document.activeElement)) {
            e.preventDefault();
            lastEl.focus();
          }
        } else {
          if (document.activeElement === lastEl || !box.contains(document.activeElement)) {
            e.preventDefault();
            firstEl.focus();
          }
        }
      };
      document.addEventListener('keydown', this.trapFocusHandler);
    }

    // Auto-focus first button or input inside box
    const focusable = box.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (focusable) {
      setTimeout(() => focusable.focus(), 50);
    }
  }

  /**
   * Closes the modal.
   */
  close() {
    if (this.modalOverlay) {
      this.modalOverlay.style.display = 'none';
      const box = document.getElementById('app-modal-box');
      if (box) box.textContent = '';
    }

    // Remove inert attribute from underlying UI and remove focus trap listener
    if (typeof document !== 'undefined') {
      const inertElements = document.querySelectorAll('[inert]');
      for (const el of inertElements) {
        el.removeAttribute('inert');
      }
      if (this.trapFocusHandler) {
        document.removeEventListener('keydown', this.trapFocusHandler);
        this.trapFocusHandler = null;
      }
    }

    if (typeof this.activeCloseCallback === 'function') {
      const cb = this.activeCloseCallback;
      this.activeCloseCallback = null;
      cb();
    }
  }
}
