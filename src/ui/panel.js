// Control panel: parameter sliders, presets and action buttons.

import { PARAM_DEFS, PRESETS, toSlider, fromSlider } from './params.js';
import { sci } from './format.js';

function formatValue(def, v) {
  if (def.key === 'mass') return `${sci(v, 2)} ${def.unit}`;
  if (def.key === 'diskTemp') return `${Math.round(v).toLocaleString('en-US')} K`;
  if (def.key === 'diskTilt') return `${v.toFixed(1)}°`;
  if (def.key === 'timeScale') return `${v.toFixed(2)}×`;
  return v.toFixed(2);
}

export class ControlPanel {
  /**
   * @param {HTMLElement} root
   * @param {object} handlers { onParam(key, value), onPreset(name), onAction(name) }
   */
  constructor(root, handlers) {
    this.root = root;
    this.handlers = handlers;
    this.inputs = new Map();
    this.build();
  }

  build() {
    const r = this.root;
    r.innerHTML = '';

    const head = document.createElement('div');
    head.className = 'panel-head';
    head.innerHTML = '<span>CONTROL</span><button class="icon-btn" data-act="collapse" title="Collapse (H)">—</button>';
    r.appendChild(head);
    head.querySelector('[data-act=collapse]').addEventListener('click', () => r.classList.toggle('collapsed'));

    const body = document.createElement('div');
    body.className = 'panel-body';
    r.appendChild(body);

    const presets = document.createElement('div');
    presets.className = 'preset-row';
    for (const name of Object.keys(PRESETS)) {
      const b = document.createElement('button');
      b.className = 'preset';
      b.textContent = name;
      b.dataset.preset = name;
      b.addEventListener('click', () => this.handlers.onPreset(name));
      presets.appendChild(b);
    }
    body.appendChild(section('Presets', presets));

    const sliders = document.createElement('div');
    for (const def of PARAM_DEFS) {
      const row = document.createElement('label');
      row.className = 'slider-row';
      const top = document.createElement('div');
      top.className = 'slider-top';
      const name = document.createElement('span');
      name.textContent = def.label;
      const val = document.createElement('span');
      val.className = 'slider-val';
      top.append(name, val);
      const input = document.createElement('input');
      input.type = 'range';
      input.min = String(toSlider(def, def.min));
      input.max = String(toSlider(def, def.max));
      input.step = def.scale === 'log' ? '0.01' : String(def.step);
      input.addEventListener('input', () => {
        const v = fromSlider(def, parseFloat(input.value));
        val.textContent = formatValue(def, v);
        this.markPreset(null);
        this.handlers.onParam(def.key, v);
      });
      row.append(top, input);
      sliders.appendChild(row);
      this.inputs.set(def.key, { input, val, def });
    }
    body.appendChild(section('Parameters', sliders));

    const actions = document.createElement('div');
    actions.className = 'action-grid';
    const acts = [
      ['probe', 'Drop probe', 'P'],
      ['flyin', 'Fly to horizon', 'F'],
      ['ring', 'Einstein ring', 'E'],
      ['cinematic', 'Cinematic', 'C'],
      ['reset', 'Reset view', 'R'],
      ['hud', 'Hide UI', 'H'],
    ];
    for (const [id, label, key] of acts) {
      const b = document.createElement('button');
      b.className = 'action';
      b.dataset.action = id;
      b.innerHTML = `<span>${label}</span><kbd>${key}</kbd>`;
      b.addEventListener('click', () => this.handlers.onAction(id));
      actions.appendChild(b);
    }
    body.appendChild(section('Actions', actions));

    const q = document.createElement('div');
    q.className = 'quality-row';
    q.innerHTML = '<span>Quality</span><select data-q><option value="auto">Auto</option></select>';
    this.qualitySelect = q.querySelector('select');
    this.qualitySelect.addEventListener('change', () => this.handlers.onQuality(this.qualitySelect.value));
    body.appendChild(q);
  }

  setQualityOptions(levels) {
    for (const [i, l] of levels.entries()) {
      const o = document.createElement('option');
      o.value = String(i);
      o.textContent = l.name;
      this.qualitySelect.appendChild(o);
    }
  }

  setValues(params) {
    for (const [key, { input, val, def }] of this.inputs) {
      if (!(key in params)) continue;
      input.value = String(toSlider(def, params[key]));
      val.textContent = formatValue(def, params[key]);
    }
  }

  markPreset(name) {
    for (const b of this.root.querySelectorAll('.preset')) b.classList.toggle('active', b.dataset.preset === name);
  }

  setActionActive(id, on) {
    const b = this.root.querySelector(`[data-action=${id}]`);
    if (b) b.classList.toggle('active', on);
  }
}

function section(title, content) {
  const s = document.createElement('section');
  const h = document.createElement('h3');
  h.textContent = title;
  s.append(h, content);
  return s;
}
