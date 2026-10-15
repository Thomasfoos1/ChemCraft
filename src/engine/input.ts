/** Keyboard + mouse state for first-person controls. Mouse deltas only count while pointer-locked. */
export class Input {
  keys = new Set<string>();
  mouseDX = 0;
  mouseDY = 0;
  left = false;
  right = false;
  rightPressed = false;
  leftPressed = false;
  wheel = 0;
  locked = false;
  private target: HTMLElement | null = null;
  onKey: ((code: string, e: KeyboardEvent) => void) | null = null;
  onLockChange: ((locked: boolean) => void) | null = null;

  attach(el: HTMLElement) {
    this.target = el;
    window.addEventListener('keydown', this.kd);
    window.addEventListener('keyup', this.ku);
    window.addEventListener('blur', this.blur);
    document.addEventListener('mousemove', this.mm);
    document.addEventListener('mousedown', this.md);
    document.addEventListener('mouseup', this.mu);
    document.addEventListener('wheel', this.wh, { passive: true });
    document.addEventListener('pointerlockchange', this.plc);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  detach() {
    window.removeEventListener('keydown', this.kd);
    window.removeEventListener('keyup', this.ku);
    window.removeEventListener('blur', this.blur);
    document.removeEventListener('mousemove', this.mm);
    document.removeEventListener('mousedown', this.md);
    document.removeEventListener('mouseup', this.mu);
    document.removeEventListener('wheel', this.wh);
    document.removeEventListener('pointerlockchange', this.plc);
  }

  lock() {
    if (!this.target || document.pointerLockElement === this.target) return;
    try {
      const p = this.target.requestPointerLock() as unknown as Promise<void> | undefined;
      if (p && typeof p.catch === 'function') p.catch(() => undefined);
    } catch {
      /* needs a user gesture; the "click to play" overlay covers this */
    }
  }

  unlock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  /** Read & reset per-frame accumulators. */
  consume() {
    const r = { dx: this.mouseDX, dy: this.mouseDY, rightPressed: this.rightPressed, leftPressed: this.leftPressed, wheel: this.wheel };
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.rightPressed = false;
    this.leftPressed = false;
    this.wheel = 0;
    return r;
  }

  down(...codes: string[]) {
    return codes.some((c) => this.keys.has(c));
  }

  private kd = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code) && this.locked) e.preventDefault();
    this.keys.add(e.code);
    if (!e.repeat) this.onKey?.(e.code, e);
  };
  private ku = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };
  private blur = () => {
    this.keys.clear();
    this.left = this.right = false;
  };
  private mm = (e: MouseEvent) => {
    if (!this.locked) return;
    // Ignore the occasional huge spike some browsers emit right after locking.
    if (Math.abs(e.movementX) > 300 || Math.abs(e.movementY) > 300) return;
    this.mouseDX += e.movementX;
    this.mouseDY += e.movementY;
  };
  private md = (e: MouseEvent) => {
    if (!this.locked) return;
    if (e.button === 0) { this.left = true; this.leftPressed = true; }
    if (e.button === 2) { this.right = true; this.rightPressed = true; }
  };
  private mu = (e: MouseEvent) => {
    if (e.button === 0) this.left = false;
    if (e.button === 2) this.right = false;
  };
  private wh = (e: WheelEvent) => {
    if (this.locked) this.wheel += Math.sign(e.deltaY);
  };
  private plc = () => {
    this.locked = document.pointerLockElement === this.target;
    if (!this.locked) {
      this.keys.clear();
      this.left = this.right = false;
    }
    this.onLockChange?.(this.locked);
  };
}
