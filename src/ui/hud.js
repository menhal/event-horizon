// Heads-up display: writes readouts into elements tagged with data-f.

export class Hud {
  constructor(root) {
    this.root = root;
    this.fields = new Map();
    for (const el of root.querySelectorAll('[data-f]')) this.fields.set(el.dataset.f, el);
    this.probePanel = root.querySelector('.hud-probe');
  }

  set(field, text) {
    const el = this.fields.get(field);
    if (el && el.textContent !== text) el.textContent = text;
  }

  setBar(field, fraction) {
    const el = this.fields.get(field);
    if (el) el.style.transform = `scaleX(${Math.min(1, Math.max(0, fraction))})`;
  }

  showProbe(on) {
    this.probePanel.hidden = !on;
  }

  setProbeFrozen(frozen) {
    this.probePanel.classList.toggle('frozen', frozen);
  }
}
