export class InputManager {
  constructor() {
    this.dir = { x: 0, y: 0 };
    this.keys = new Set();
    this._touchActive = false;
    this._touchId = null;
    this._touchOrigin = { x: 0, y: 0 };

    window.addEventListener('keydown', (e) => this._onKey(e, true));
    window.addEventListener('keyup', (e) => this._onKey(e, false));

    this._detectTouch();
    this._setupTouchStick();
  }

  _detectTouch() {
    const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
    if (isTouch) document.body.classList.add('touch');
  }

  _onKey(e, down) {
    const k = e.key.toLowerCase();
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd'].includes(k)) {
      e.preventDefault();
    }
    if (down) this.keys.add(k); else this.keys.delete(k);
    this._updateFromKeys();
  }

  _updateFromKeys() {
    let x = 0, y = 0;
    if (this.keys.has('arrowleft') || this.keys.has('a')) x -= 1;
    if (this.keys.has('arrowright') || this.keys.has('d')) x += 1;
    if (this.keys.has('arrowup') || this.keys.has('w')) y -= 1;
    if (this.keys.has('arrowdown') || this.keys.has('s')) y += 1;
    if (this._touchActive) return; // touch takes priority while active
    const len = Math.hypot(x, y) || 1;
    this.dir.x = x / len;
    this.dir.y = y / len;
  }

  _setupTouchStick() {
    const zone = document.getElementById('touch-stick-zone');
    const base = document.getElementById('touch-stick-base');
    const knob = document.getElementById('touch-stick-knob');
    const maxR = 42;

    const placeBase = (cx, cy) => {
      base.style.left = (cx - 55) + 'px';
      base.style.top = (cy - 55) + 'px';
      knob.style.transform = 'translate(0px,0px)';
    };

    const start = (e) => {
      const t = e.changedTouches[0];
      this._touchId = t.identifier;
      this._touchActive = true;
      this._touchOrigin = { x: t.clientX, y: t.clientY };
      placeBase(t.clientX, t.clientY);
      e.preventDefault();
    };
    const move = (e) => {
      if (!this._touchActive) return;
      let t = null;
      for (const ct of e.changedTouches) {
        if (ct.identifier === this._touchId) { t = ct; break; }
      }
      if (!t) return;
      let dx = t.clientX - this._touchOrigin.x;
      let dy = t.clientY - this._touchOrigin.y;
      const len = Math.hypot(dx, dy);
      if (len > maxR) { dx = (dx / len) * maxR; dy = (dy / len) * maxR; }
      knob.style.transform = `translate(${dx}px,${dy}px)`;
      const mag = Math.min(len / maxR, 1);
      if (mag < 0.15) { this.dir.x = 0; this.dir.y = 0; }
      else {
        const nlen = Math.hypot(dx, dy) || 1;
        this.dir.x = (dx / nlen) * mag;
        this.dir.y = (dy / nlen) * mag;
      }
      e.preventDefault();
    };
    const end = (e) => {
      let matched = false;
      for (const ct of e.changedTouches) {
        if (ct.identifier === this._touchId) {
          matched = true;
          this._touchActive = false;
          this._touchId = null;
          this.dir.x = 0; this.dir.y = 0;
          knob.style.transform = 'translate(0px,0px)';
        }
      }
      // Only swallow the event if it belonged to the joystick touch - otherwise
      // this would suppress the synthetic click on every tap on the page
      // (e.g. level-up cards), since touchend bubbles to window regardless of target.
      if (matched) e.preventDefault();
    };

    zone.addEventListener('touchstart', start, { passive: false });
    window.addEventListener('touchmove', move, { passive: false });
    window.addEventListener('touchend', end, { passive: false });
    window.addEventListener('touchcancel', end, { passive: false });
  }
}
