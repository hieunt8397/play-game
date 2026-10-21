// Page-level stage setup (NFR6, AD-4, AD-7). Called once from main.ts before the game boots.
import { Scale } from 'phaser';

/**
 * iOS Safari ignores `user-scalable=no` and some gestures bypass `touch-action`, so the CSS
 * guards in stage.css are backed by event guards: no pinch/double-tap zoom, no context
 * menu (long-press "Save image"), no text selection, no image dragging, no pull-to-refresh.
 */
export function installPageGuards(doc: Document = document): void {
  const block = (e: Event): void => {
    if (e.cancelable) e.preventDefault();
  };
  const opts: AddEventListenerOptions = { passive: false };
  for (const type of ['gesturestart', 'gesturechange', 'gestureend', 'dblclick', 'contextmenu', 'selectstart', 'dragstart']) {
    doc.addEventListener(type, block, opts);
  }
  // Pinch (2+ fingers) and page scroll / pull-to-refresh.
  doc.addEventListener('touchmove', block, opts);
  for (const img of Array.from(doc.images)) img.draggable = false;
}

let scaleManagerPatched = false;

/**
 * In portrait, stage.css rotates the stage 90°. Phaser's ScaleManager measures its parent
 * (getParentBounds) and the canvas (updateCenter) with getBoundingClientRect(), which returns
 * the *rotated* (portrait) box: ENVELOP would letterbox and CENTER_BOTH would mis-centre the
 * landscape stage. clientWidth/offsetWidth are layout sizes, unaffected by transforms, so the
 * stage keeps its landscape cover layout. Pointer mapping under rotation (canvasBounds,
 * transformX/Y) is corrected separately in core/input/space.ts (Story 1.6).
 */
export function installRotationSafeScaleManager(): void {
  if (scaleManagerPatched) return;
  scaleManagerPatched = true;
  const proto = Scale.ScaleManager.prototype as Scale.ScaleManager;

  const originalParentBounds = proto.getParentBounds;
  proto.getParentBounds = function (this: Scale.ScaleManager): boolean {
    const parent = this.parent as unknown;
    if (this.parentIsWindow || !(parent instanceof HTMLElement)) return originalParentBounds.call(this);
    const width = parent.clientWidth;
    const height = parent.clientHeight;
    if (this.parentSize.width !== width || this.parentSize.height !== height) {
      this.parentSize.setSize(width, height);
      return true;
    }
    if (this.canvas) {
      const rect = this.canvas.getBoundingClientRect();
      if (rect.x !== this.canvasBounds.x || rect.y !== this.canvasBounds.y) return true;
    }
    return false;
  };

  proto.updateCenter = function (this: Scale.ScaleManager): void {
    if (this.autoCenter === Scale.Center.NO_CENTER) return;
    const style = this.canvas.style;
    let offsetX = Math.floor((this.parentSize.width - this.canvas.offsetWidth) / 2);
    let offsetY = Math.floor((this.parentSize.height - this.canvas.offsetHeight) / 2);
    if (this.autoCenter === Scale.Center.CENTER_HORIZONTALLY) offsetY = 0;
    else if (this.autoCenter === Scale.Center.CENTER_VERTICALLY) offsetX = 0;
    style.marginLeft = `${offsetX}px`;
    style.marginTop = `${offsetY}px`;
  };
}
