/* ScanController — Analog Precision for Manga & Webtoons
 * Content script unique : moteur de scroll + lecture Gamepad / clavier + HUD "Floating Pill" en Shadow DOM.
 *
 * Peut aussi etre charge comme simple <script> (cf. showcase.html) : dans ce cas la page peut definir
 * window.ScanControllerConfig = { scroller, mount, styleHref, api: true } avant le chargement.
 */
(() => {
  'use strict';

  // Marqueur DOM (partage entre le monde isole de l'extension et la page) : une seule instance.
  const root = document.documentElement;
  if (!root || root.hasAttribute('data-scancontroller')) return;
  root.setAttribute('data-scancontroller', '');

  const CFG = Object.assign(
    { scroller: null, mount: null, styleHref: null, api: false },
    (typeof window.ScanControllerConfig === 'object' && window.ScanControllerConfig) || {}
  );

  const HAS_EXT = (() => {
    try { return !!(chrome && chrome.runtime && chrome.runtime.id); } catch (e) { return false; }
  })();

  /* ------------------------------------------------------------------ */
  /* Reglages                                                           */
  /* ------------------------------------------------------------------ */
  const DEFAULTS = { cruiseSpeed: 120, softness: 45, sensitivity: 50 };
  const MIN_SPEED         = 20;
  const MAX_SPEED         = 600;
  const SPEED_STEP        = 15;    // D-Pad haut / bas
  const TRIGGER_DEADZONE  = 0.04;  // R2 / L2
  const STICK_DEADZONE    = 0.2;   // joystick vertical
  const BOOST_FACTOR      = 1.5;   // L2 : +150 % de la vitesse de croisiere au maximum
  const MANUAL_FACTOR     = 2.5;   // deplacement manuel au stick
  const TOGGLE_DEBOUNCE   = 260;   // ms, Croix / A
  const DPAD_FIRST_DELAY  = 380;   // ms avant repetition D-Pad
  const DPAD_REPEAT_DELAY = 110;   // ms entre deux repetitions
  const MAX_DT            = 0.1;   // s, garde-fou si l'onglet a laggue
  const HUD_INTERVAL      = 33;    // ms entre deux rafraichissements du HUD
  const ARC_LEN           = 2 * Math.PI * 13; // circonference de l'arc de progression (r = 13)

  /* ------------------------------------------------------------------ */
  /* Etat                                                               */
  /* ------------------------------------------------------------------ */
  const settings = Object.assign({}, DEFAULTS);

  const state = {
    enabled: false,
    currentSpeed: 0,      // px/s lissee (mode auto)
    effSpeed: 0,          // px/s signee reellement appliquee cette frame
    acc: 0,               // accumulateur sous-pixel
    r2: 0,                // frein gachette, apres courbe de sensibilite
    l2: 0,
    brake: 0,             // frein final (gachette ou Espace)
    arc: 0,               // valeur affichee par l'arc (lissee)
    stick: 0,
    keyBrake: 0,
    keyBrakeTarget: 0,
    device: 'keyboard',   // 'dualsense' | 'xbox' | 'gamepad' | 'keyboard'
    padId: '',
    keyboardAnnounced: false,
    lastT: 0
  };

  // Entrees virtuelles (demo du showcase) : null = desactive
  const virtual = { trigger: null, boost: null, device: null };

  const prevBtn = { cross: false, up: false, down: false };
  let lastToggleAt = 0;
  let dpadNextAt = 0;

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerpFactor = (dt, tau) => 1 - Math.exp(-dt / Math.max(tau, 0.001));
  const deadzone = (v, d) => (v <= d ? 0 : (v - d) / (1 - d));

  // Souplesse 0..100 -> constante de temps du lissage de vitesse (s)
  const smoothTau = () => 0.04 + Math.pow(settings.softness / 100, 1.4) * 0.5;
  // Souplesse 0..100 -> amorti du frein clavier (s)
  const keyBrakeTau = () => 0.06 + (settings.softness / 100) * 0.34;
  // Sensibilite 0..100 -> exposant de la courbe gachette (2.2 = ferme, 0.44 = reactive)
  const triggerGamma = () => 2.2 * Math.pow(0.2, settings.sensitivity / 100);
  const triggerCurve = (v) => (v <= 0 ? 0 : Math.pow(v, triggerGamma()));

  function num(v, fallback, min, max) {
    const n = Math.round(Number(v));
    return v == null || !isFinite(n) ? fallback : clamp(n, min, max);
  }

  function sanitize(raw) {
    const s = raw || {};
    return {
      cruiseSpeed: num(s.cruiseSpeed != null ? s.cruiseSpeed : s.baseSpeed, DEFAULTS.cruiseSpeed, MIN_SPEED, MAX_SPEED), // baseSpeed = migration v1
      softness: num(s.softness, DEFAULTS.softness, 0, 100),
      sensitivity: num(s.sensitivity, DEFAULTS.sensitivity, 0, 100)
    };
  }

  /* ------------------------------------------------------------------ */
  /* Stockage (chrome.storage si extension, sinon localStorage)         */
  /* ------------------------------------------------------------------ */
  const STORE_KEY = 'scancontroller.settings';

  function loadSettings() {
    if (HAS_EXT) {
      try {
        chrome.storage.local.get({ cruiseSpeed: null, baseSpeed: null, softness: null, sensitivity: null }, (res) => {
          if (chrome.runtime.lastError) return;
          applySettings(sanitize({
            cruiseSpeed: res.cruiseSpeed != null ? res.cruiseSpeed : res.baseSpeed,
            softness: res.softness != null ? res.softness : DEFAULTS.softness,
            sensitivity: res.sensitivity != null ? res.sensitivity : DEFAULTS.sensitivity
          }));
        });
        chrome.storage.onChanged.addListener((changes, area) => {
          if (area !== 'local') return;
          const next = Object.assign({}, settings);
          let touched = false;
          ['cruiseSpeed', 'softness', 'sensitivity'].forEach((k) => {
            if (changes[k]) { next[k] = changes[k].newValue; touched = true; }
          });
          if (touched) applySettings(sanitize(next));
        });
      } catch (e) { /* contexte d'extension invalide */ }
      return;
    }
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) applySettings(sanitize(JSON.parse(raw)));
    } catch (e) { /* stockage indisponible */ }
  }

  let saveTimer = 0;
  function saveSettings() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const data = { cruiseSpeed: settings.cruiseSpeed, softness: settings.softness, sensitivity: settings.sensitivity };
      if (HAS_EXT) {
        try { chrome.storage.local.set(data); } catch (e) { /* ignore */ }
      } else {
        try { localStorage.setItem(STORE_KEY, JSON.stringify(data)); } catch (e) { /* ignore */ }
      }
    }, 250);
  }

  function applySettings(next) {
    Object.assign(settings, next);
    syncControls();
    requestPaint();
  }

  /* ------------------------------------------------------------------ */
  /* Cible du scroll (la page, ou le plus grand conteneur scrollable)   */
  /* ------------------------------------------------------------------ */
  let scroller = null;
  let scrollerCheckedAt = 0;

  function documentScrollable() {
    const de = document.documentElement;
    return de.scrollHeight > de.clientHeight + 2;
  }

  function pickScroller() {
    if (CFG.scroller && CFG.scroller.isConnected) return CFG.scroller;
    if (documentScrollable()) return window;
    let best = null, bestArea = 0;
    const nodes = document.querySelectorAll('div, main, section, article');
    for (let i = 0; i < nodes.length; i++) {
      const el = nodes[i];
      if (el.scrollHeight <= el.clientHeight + 4) continue;
      const ov = getComputedStyle(el).overflowY;
      if (ov !== 'auto' && ov !== 'scroll' && ov !== 'overlay') continue;
      const r = el.getBoundingClientRect();
      const area = r.width * r.height;
      if (area > bestArea) { bestArea = area; best = el; }
    }
    return best || window;
  }

  function refreshScroller(now) {
    const stale = !scroller ||
      (scroller === window && !documentScrollable() && !CFG.scroller) ||
      (scroller !== window && !scroller.isConnected);
    if (stale || now - scrollerCheckedAt > 2000) {
      scrollerCheckedAt = now;
      if (stale) scroller = pickScroller();
    }
  }

  function scrollByPx(px) {
    if (!scroller || scroller === window) window.scrollBy(0, px);
    else scroller.scrollTop += px;
  }

  /* ------------------------------------------------------------------ */
  /* Detection Plug & Play                                              */
  /* ------------------------------------------------------------------ */
  const DEVICES = {
    dualsense: { name: 'DualSense', toast: 'DualSense détectée', sub: 'Pressez R2 pour doser le scroll',
                 keys: [['✕', 'ON / OFF'], ['R2', 'Frein'], ['L2', 'Boost'], ['D-Pad', '± vitesse'], ['Stick', 'Manuel']] },
    xbox:      { name: 'Xbox', toast: 'Manette Xbox détectée', sub: 'Pressez RT pour doser le scroll',
                 keys: [['A', 'ON / OFF'], ['RT', 'Frein'], ['LT', 'Boost'], ['D-Pad', '± vitesse'], ['Stick', 'Manuel']] },
    gamepad:   { name: 'Manette', toast: 'Manette détectée', sub: 'Gâchette droite pour doser le scroll',
                 keys: [['A/✕', 'ON / OFF'], ['R2', 'Frein'], ['L2', 'Boost'], ['D-Pad', '± vitesse'], ['Stick', 'Manuel']] },
    keyboard:  { name: 'Clavier', toast: 'Mode clavier', sub: 'Maintenez Espace pour freiner en douceur',
                 keys: [['Alt S', 'ON / OFF'], ['Espace', 'Frein amorti'], ['Clic', 'Pilule = ON / OFF']] }
  };

  function classifyPad(id) {
    const s = (id || '').toLowerCase();
    if (/dualsense|dualshock|playstation|054c|wireless controller|ps5|ps4/.test(s)) return 'dualsense';
    if (/xbox|xinput|045e|microsoft/.test(s)) return 'xbox';
    return 'gamepad';
  }

  function getPad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let fallback = null;
    for (let i = 0; i < pads.length; i++) {
      const p = pads[i];
      if (!p || !p.connected) continue;
      if (classifyPad(p.id) !== 'gamepad') return p; // DualSense / Xbox en priorite
      if (!fallback) fallback = p;
    }
    return fallback;
  }

  function setDevice(device, announce) {
    if (device === state.device) return;
    const wasPad = state.device !== 'keyboard';
    state.device = device;
    syncControls();
    requestPaint();
    if (!announce) return;
    if (device === 'keyboard' && wasPad) {
      showToast('keyboard', 'Manette déconnectée', 'Espace prend le relais pour freiner');
    } else if (device !== 'keyboard') {
      showToast(device, DEVICES[device].toast, DEVICES[device].sub);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Manette                                                            */
  /* ------------------------------------------------------------------ */
  function buttonValue(pad, index) {
    if (!pad || !pad.buttons || pad.buttons.length <= index) return 0;
    const b = pad.buttons[index];
    if (!b) return 0;
    if (typeof b.value === 'number' && b.value > 0) return clamp(b.value, 0, 1);
    return b.pressed ? 1 : 0;
  }

  function buttonPressed(pad, index) {
    if (!pad || !pad.buttons || pad.buttons.length <= index) return false;
    const b = pad.buttons[index];
    return !!b && (b.pressed || b.value > 0.5);
  }

  // Joystick droit (axes[3]) en priorite, sinon joystick gauche (axes[1]).
  function readStick(pad) {
    if (!pad || !pad.axes) return 0;
    const right = pad.axes.length > 3 ? pad.axes[3] : 0;
    const left  = pad.axes.length > 1 ? pad.axes[1] : 0;
    const axis = Math.abs(right) > Math.abs(left) ? right : left;
    if (axis < -STICK_DEADZONE) return -deadzone(-axis, STICK_DEADZONE);
    if (axis >  STICK_DEADZONE) return  deadzone( axis, STICK_DEADZONE);
    return 0;
  }

  function readButtons(pad, now) {
    // Croix / A : ON / OFF (front montant + debounce)
    const cross = buttonPressed(pad, 0);
    if (cross && !prevBtn.cross && now - lastToggleAt > TOGGLE_DEBOUNCE) {
      lastToggleAt = now;
      setEnabled(!state.enabled);
    }
    prevBtn.cross = cross;

    // D-Pad haut / bas : vitesse de croisiere +/- 15 px/s (front montant puis repetition)
    const up = buttonPressed(pad, 12);
    const down = buttonPressed(pad, 13);
    const fresh = (up && !prevBtn.up) || (down && !prevBtn.down);
    if (up || down) {
      if (fresh) {
        bumpSpeed(up ? SPEED_STEP : -SPEED_STEP);
        dpadNextAt = now + DPAD_FIRST_DELAY;
      } else if (now >= dpadNextAt) {
        bumpSpeed(up ? SPEED_STEP : -SPEED_STEP);
        dpadNextAt = now + DPAD_REPEAT_DELAY;
      }
    }
    prevBtn.up = up;
    prevBtn.down = down;
  }

  /* ------------------------------------------------------------------ */
  /* Actions                                                            */
  /* ------------------------------------------------------------------ */
  function setEnabled(on) {
    state.enabled = !!on;
    if (!state.enabled) { state.currentSpeed = 0; state.acc = 0; }
    syncControls();
    requestPaint();
  }

  function bumpSpeed(delta) {
    settings.cruiseSpeed = clamp(Math.round((settings.cruiseSpeed + delta) / 5) * 5, MIN_SPEED, MAX_SPEED);
    syncControls();
    requestPaint();
    saveSettings();
  }

  /* ------------------------------------------------------------------ */
  /* Clavier : Espace = frein progressif amorti, Alt+S = ON / OFF       */
  /* ------------------------------------------------------------------ */
  function isTyping(el) {
    if (!el) return false;
    const tag = el.tagName;
    return el.isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
  }

  function announceKeyboard() {
    if (state.keyboardAnnounced || state.device !== 'keyboard') return;
    state.keyboardAnnounced = true;
    showToast('keyboard', DEVICES.keyboard.toast, DEVICES.keyboard.sub);
  }

  window.addEventListener('keydown', (e) => {
    if (isTyping(e.target) || isTyping(document.activeElement)) return;
    if (e.altKey && !e.ctrlKey && !e.metaKey && (e.code === 'KeyS')) {
      e.preventDefault();
      if (!e.repeat) { setEnabled(!state.enabled); announceKeyboard(); }
      return;
    }
    if (e.code !== 'Space' && e.key !== ' ') return;
    if (!state.enabled) return; // la barre Espace garde son comportement natif quand ScanController est en pause
    state.keyBrakeTarget = 1;
    e.preventDefault(); // evite le saut de page
    announceKeyboard();
  }, true);

  window.addEventListener('keyup', (e) => {
    if (e.code !== 'Space' && e.key !== ' ') return;
    if (state.keyBrakeTarget > 0) e.preventDefault();
    state.keyBrakeTarget = 0;
  }, true);

  window.addEventListener('blur', () => { state.keyBrakeTarget = 0; });

  /* ------------------------------------------------------------------ */
  /* Icones (SVG inline, 24x24, currentColor)                           */
  /* ------------------------------------------------------------------ */
  const PAD_BODY = 'M7 6.5h10c2.5 0 4.2 1.7 4.7 4.2l1 5.4c.4 2-1 3.7-2.8 3.7-1.1 0-2-.6-2.6-1.6L16.1 16H7.9l-1.2 2.2c-.6 1-1.5 1.6-2.6 1.6-1.8 0-3.2-1.7-2.8-3.7l1-5.4C2.8 8.2 4.5 6.5 7 6.5z';
  const ICONS = {
    dualsense: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + PAD_BODY + '"/>' +
      '<rect x="9.4" y="8.6" width="5.2" height="3.2" rx="1"/><circle cx="9" cy="13.6" r="1.1"/><circle cx="15" cy="13.6" r="1.1"/></svg>',
    xbox: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + PAD_BODY + '"/>' +
      '<circle cx="7.4" cy="10.6" r="1.3"/><circle cx="14.6" cy="13.8" r="1.1"/><circle cx="16.8" cy="9.2" r=".6"/><circle cx="18.4" cy="10.8" r=".6"/></svg>',
    gamepad: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + PAD_BODY + '"/>' +
      '<path d="M6.6 10.4v3M5.1 11.9h3"/><circle cx="16.4" cy="10.6" r=".7"/><circle cx="17.8" cy="12.6" r=".7"/></svg>',
    keyboard: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="6.5" width="19" height="11" rx="2.4"/>' +
      '<path d="M6 10h.01M9 10h.01M12 10h.01M15 10h.01M18 10h.01M8 14h8"/></svg>'
  };

  const LOGO = '<svg viewBox="0 0 64 64" aria-hidden="true">' +
    '<defs><linearGradient id="sc-lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FF2E63"/><stop offset="1" stop-color="#E11D48"/></linearGradient></defs>' +
    '<g fill="none" stroke="#F4F4F5" stroke-width="3.6" stroke-linejoin="round" stroke-linecap="round">' +
    '<rect x="12" y="11" width="27" height="38" rx="3.5"/><path d="M12 25.5H39M28 25.5L23 49"/></g>' +
    '<path d="M34 27.5h13.5c3.6 0 6.5 2.9 6.5 6.5v3.5c0 9.4-7.6 17-17 17h-.6c-2.7 0-4.4-2.8-3.2-5.2 1.6-3.1 2.4-6.6 2.4-10.3 0-2.6-.5-5-1.4-7.2C33.4 30 33.3 27.5 34 27.5z" fill="url(#sc-lg)" stroke="#121217" stroke-width="3" paint-order="stroke"/>' +
    '</svg>';

  /* ------------------------------------------------------------------ */
  /* HUD "Floating Pill" (Shadow DOM)                                   */
  /* ------------------------------------------------------------------ */
  const ui = {};
  let lastPaintAt = 0, paintDirty = true;

  function sliderRow(key, label, min, max, step, lo, hi) {
    return [
      '<label class="sc-field" data-key="' + key + '">',
      '  <span class="sc-field-top"><span>' + label + '</span><b class="sc-val"></b></span>',
      '  <input class="sc-range" type="range" min="' + min + '" max="' + max + '" step="' + step + '">',
      lo ? '  <span class="sc-field-ends"><span>' + lo + '</span><span>' + hi + '</span></span>' : '',
      '</label>'
    ].join('');
  }

  function buildHud() {
    const host = document.createElement('div');
    host.id = 'scancontroller-host';
    const inMount = !!(CFG.mount && CFG.mount.isConnected);
    // styles critiques en ligne : le HUD est bien place meme avant le chargement du CSS
    host.style.cssText =
      'position:' + (inMount ? 'absolute' : 'fixed') + ';right:16px;bottom:16px;z-index:2147483647;' +
      'width:0;height:0;margin:0;padding:0;border:0;background:none;pointer-events:none;';

    const shadow = host.attachShadow({ mode: 'open' });

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    let href = CFG.styleHref || 'styles.css';
    if (HAS_EXT && !CFG.styleHref) { try { href = chrome.runtime.getURL('styles.css'); } catch (e) { /* ignore */ } }
    link.href = href;

    const wrap = document.createElement('div');
    wrap.className = 'sc-root';
    wrap.style.visibility = 'hidden'; // revele une fois la feuille de style chargee
    link.addEventListener('load', () => { wrap.style.visibility = ''; });
    link.addEventListener('error', () => { wrap.style.visibility = ''; });
    shadow.appendChild(link);

    wrap.innerHTML = [
      '<div class="sc-toast" role="status" aria-live="polite">',
      '  <span class="sc-toast-icon"></span>',
      '  <span class="sc-toast-text"><b class="sc-toast-title"></b><span class="sc-toast-sub"></span></span>',
      '</div>',
      '<div class="sc-dock">',
      '  <div class="sc-panel" role="group" aria-label="Réglages ScanController">',
      '    <div class="sc-head">',
      '      <span class="sc-logo">' + LOGO + '</span>',
      '      <span class="sc-brand"><b>ScanController</b><small>Analog Precision</small></span>',
      '      <span class="sc-chip"><span class="sc-chip-icon"></span><span class="sc-chip-name"></span></span>',
      '    </div>',
      '    <button class="sc-toggle" type="button" aria-pressed="false">',
      '      <span class="sc-toggle-text"><b class="sc-toggle-title">Auto-scroll</b><span class="sc-toggle-sub"></span></span>',
      '      <span class="sc-switch"><i></i></span>',
      '    </button>',
      sliderRow('cruiseSpeed', 'Vitesse de croisière', MIN_SPEED, MAX_SPEED, 5),
      sliderRow('softness', 'Courbe de freinage', 0, 100, 1, 'Vive', 'Soyeuse'),
      '    <div class="sc-sens">',
      sliderRow('sensitivity', 'Sensibilité gâchette', 0, 100, 1, 'Ferme', 'Réactive'),
      '      <svg class="sc-curve" viewBox="0 0 48 32" aria-hidden="true">',
      '        <path class="sc-curve-grid" d="M2 30H46M2 30V2"/>',
      '        <path class="sc-curve-line" d=""/>',
      '        <circle class="sc-curve-dot" r="2.4" cx="2" cy="30"/>',
      '      </svg>',
      '    </div>',
      '    <div class="sc-keys"></div>',
      '    <div class="sc-wake">Manette ? Appuyez sur un bouton pour la réveiller.</div>',
      '  </div>',
      '  <button class="sc-pill" type="button" aria-label="ScanController : activer ou mettre en pause">',
      '    <span class="sc-gauge">',
      '      <svg class="sc-arc" viewBox="0 0 32 32" aria-hidden="true">',
      '        <defs><linearGradient id="sc-arc-g" x1="0" y1="0" x2="1" y2="1">',
      '          <stop offset="0" stop-color="#FF2E63"/><stop offset="1" stop-color="#E11D48"/></linearGradient></defs>',
      '        <circle class="sc-arc-track" cx="16" cy="16" r="13"/>',
      '        <circle class="sc-arc-fill" cx="16" cy="16" r="13" transform="rotate(-90 16 16)" stroke="url(#sc-arc-g)" stroke-dasharray="' + ARC_LEN.toFixed(2) + '" stroke-dashoffset="' + ARC_LEN.toFixed(2) + '"/>',
      '      </svg>',
      '      <span class="sc-dev-icon"></span>',
      '    </span>',
      '    <span class="sc-readout"><b class="sc-speed">0</b><small>px/s</small></span>',
      '    <span class="sc-dot"></span>',
      '  </button>',
      '</div>'
    ].join('');
    shadow.appendChild(wrap);

    const q = (s) => shadow.querySelector(s);
    ui.root      = wrap;
    ui.toast     = q('.sc-toast');
    ui.toastIcon = q('.sc-toast-icon');
    ui.toastT    = q('.sc-toast-title');
    ui.toastS    = q('.sc-toast-sub');
    ui.dock      = q('.sc-dock');
    ui.pill      = q('.sc-pill');
    ui.arc       = q('.sc-arc-fill');
    ui.devIcon   = q('.sc-dev-icon');
    ui.speed     = q('.sc-speed');
    ui.chipIcon  = q('.sc-chip-icon');
    ui.chipName  = q('.sc-chip-name');
    ui.toggle    = q('.sc-toggle');
    ui.toggleSub = q('.sc-toggle-sub');
    ui.keys      = q('.sc-keys');
    ui.curveLine = q('.sc-curve-line');
    ui.curveDot  = q('.sc-curve-dot');
    ui.fields    = {};
    shadow.querySelectorAll('.sc-field').forEach((f) => {
      ui.fields[f.dataset.key] = { input: f.querySelector('input'), val: f.querySelector('.sc-val') };
    });

    ui.pill.addEventListener('click', (e) => { e.stopPropagation(); setEnabled(!state.enabled); });
    ui.toggle.addEventListener('click', (e) => { e.stopPropagation(); setEnabled(!state.enabled); });

    Object.keys(ui.fields).forEach((key) => {
      ui.fields[key].input.addEventListener('input', (e) => {
        settings[key] = Number(e.target.value);
        syncControls();
        saveSettings();
      });
    });

    // Garder le panneau ouvert pendant qu'on fait glisser un slider, meme si le curseur sort de la zone.
    ui.dock.addEventListener('pointerdown', () => {
      ui.dock.dataset.holding = 'true';
      const release = () => {
        delete ui.dock.dataset.holding;
        window.removeEventListener('pointerup', release, true);
        window.removeEventListener('pointercancel', release, true);
      };
      window.addEventListener('pointerup', release, true);
      window.addEventListener('pointercancel', release, true);
    });

    // le HUD ne doit pas declencher les raccourcis / handlers de la page
    ['keydown', 'keyup', 'pointerdown', 'mousedown', 'click', 'wheel'].forEach((t) => {
      wrap.addEventListener(t, (e) => e.stopPropagation());
    });

    (inMount ? CFG.mount : (document.body || document.documentElement)).appendChild(host);
  }

  function curvePath() {
    const g = triggerGamma();
    let d = '';
    for (let i = 0; i <= 16; i++) {
      const x = i / 16;
      const y = Math.pow(x, g);
      d += (i ? 'L' : 'M') + (2 + x * 44).toFixed(1) + ' ' + (30 - y * 28).toFixed(1);
    }
    return d;
  }

  function syncControls() {
    if (!ui.root) return;
    const dev = DEVICES[state.device];
    ui.root.dataset.on = state.enabled ? 'true' : 'false';
    ui.root.dataset.device = state.device;
    ui.toggle.setAttribute('aria-pressed', state.enabled ? 'true' : 'false');
    ui.pill.setAttribute('aria-pressed', state.enabled ? 'true' : 'false');

    if (ui.devIcon.dataset.device !== state.device) {
      ui.devIcon.dataset.device = state.device;
      ui.devIcon.innerHTML = ICONS[state.device];
      ui.chipIcon.innerHTML = ICONS[state.device];
      ui.chipName.textContent = dev.name;
      ui.keys.innerHTML = dev.keys.map((k) => '<span><kbd>' + k[0] + '</kbd>' + k[1] + '</span>').join('');
    }

    const labels = {
      cruiseSpeed: settings.cruiseSpeed + ' px/s',
      softness: settings.softness + '%',
      sensitivity: settings.sensitivity + '%'
    };
    Object.keys(ui.fields).forEach((key) => {
      const f = ui.fields[key];
      const min = Number(f.input.min), max = Number(f.input.max);
      if (f.input !== f.input.getRootNode().activeElement) f.input.value = String(settings[key]);
      f.input.style.setProperty('--p', (((settings[key] - min) / (max - min)) * 100).toFixed(1) + '%');
      f.val.textContent = labels[key];
    });
    ui.curveLine.setAttribute('d', curvePath());
  }

  function requestPaint() {
    paintDirty = true;
    lastPaintAt = 0;
  }

  function paintHud(now) {
    if (!ui.root) return;
    if (!paintDirty && now - lastPaintAt < HUD_INTERVAL) return;
    lastPaintAt = now;
    paintDirty = false;

    const abs = Math.round(Math.abs(state.effSpeed));
    const shown = state.enabled || state.stick !== 0 ? abs : settings.cruiseSpeed;
    ui.speed.textContent = (state.effSpeed < -0.5 ? '↑' : '') + shown;

    ui.arc.setAttribute('stroke-dashoffset', (ARC_LEN * (1 - clamp(state.arc, 0, 1))).toFixed(2));

    const braking = state.enabled && state.brake > 0.02;
    const boosting = state.enabled && state.l2 > 0.02;
    ui.root.dataset.braking = braking ? 'true' : 'false';
    ui.root.dataset.boosting = boosting ? 'true' : 'false';
    ui.root.dataset.manual = state.stick !== 0 ? 'true' : 'false';

    ui.toggleSub.textContent = !state.enabled ? 'En pause'
      : braking ? 'Freinage ' + Math.round(state.brake * 100) + '%'
      : boosting ? 'Boost +' + Math.round(state.l2 * BOOST_FACTOR * 100) + '%'
      : 'Lecture en cours';

    // point de la courbe de sensibilite = position brute de la gachette
    const raw = state.rawTrigger || 0;
    ui.curveDot.setAttribute('cx', (2 + raw * 44).toFixed(1));
    ui.curveDot.setAttribute('cy', (30 - triggerCurve(raw) * 28).toFixed(1));
  }

  /* ------------------------------------------------------------------ */
  /* Toast                                                              */
  /* ------------------------------------------------------------------ */
  let toastTimer = 0;
  function showToast(device, title, sub) {
    if (!ui.toast) return;
    ui.toastIcon.innerHTML = ICONS[device] || ICONS.gamepad;
    ui.toastT.textContent = title;
    ui.toastS.textContent = sub;
    ui.toast.dataset.show = 'false';
    void ui.toast.offsetWidth; // relance l'animation
    ui.toast.dataset.show = 'true';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { ui.toast.dataset.show = 'false'; }, 3600);
  }

  /* ------------------------------------------------------------------ */
  /* Boucle principale                                                  */
  /* ------------------------------------------------------------------ */
  function frame(now) {
    requestAnimationFrame(frame);

    let dt = (now - state.lastT) / 1000;
    state.lastT = now;
    if (!(dt > 0)) dt = 0;
    if (dt > MAX_DT) dt = MAX_DT;

    const pad = getPad();
    const padDevice = virtual.device || (pad ? classifyPad(pad.id) : 'keyboard');
    if (padDevice !== state.device) setDevice(padDevice, true);

    let rawTrigger = deadzone(buttonValue(pad, 7), TRIGGER_DEADZONE);
    let rawBoost = deadzone(buttonValue(pad, 6), TRIGGER_DEADZONE);
    if (virtual.trigger != null) rawTrigger = clamp(virtual.trigger, 0, 1);
    if (virtual.boost != null) rawBoost = clamp(virtual.boost, 0, 1);
    state.rawTrigger = rawTrigger;
    state.r2 = triggerCurve(rawTrigger);
    state.l2 = rawBoost;
    state.stick = readStick(pad);
    if (pad) readButtons(pad, now);

    // frein clavier amorti (smooth damping)
    state.keyBrake += (state.keyBrakeTarget - state.keyBrake) * lerpFactor(dt, keyBrakeTau());
    if (state.keyBrake < 0.001) state.keyBrake = 0;

    state.brake = clamp(Math.max(state.r2, state.keyBrake), 0, 1);
    state.arc += (state.brake - state.arc) * lerpFactor(dt, 0.05);
    if (state.arc < 0.002) state.arc = 0;

    const base = settings.cruiseSpeed;
    if (state.stick !== 0) {
      // deplacement manuel au joystick (prioritaire sur l'auto-scroll)
      state.effSpeed = base * MANUAL_FACTOR * state.stick;
      state.currentSpeed += (0 - state.currentSpeed) * lerpFactor(dt, smoothTau());
    } else if (state.enabled) {
      const target = base * (1 - state.brake) + base * BOOST_FACTOR * state.l2;
      state.currentSpeed += (target - state.currentSpeed) * lerpFactor(dt, smoothTau());
      if (state.currentSpeed < 0.02) state.currentSpeed = 0;
      state.effSpeed = state.currentSpeed;
    } else {
      state.currentSpeed = 0;
      state.effSpeed = 0;
      state.acc = 0;
    }

    refreshScroller(now);

    if (state.effSpeed !== 0) {
      // accumulateur sous-pixel : on ne scrolle que par pixels entiers,
      // le reste est reporte sur la frame suivante (pas de saccade sous 1 px/frame)
      state.acc += state.effSpeed * dt;
      const whole = state.acc >= 0 ? Math.floor(state.acc) : Math.ceil(state.acc);
      if (whole !== 0) {
        state.acc -= whole;
        scrollByPx(whole);
      }
    }

    paintHud(now);
  }

  /* ------------------------------------------------------------------ */
  /* Popup <-> page                                                     */
  /* ------------------------------------------------------------------ */
  function snapshot() {
    return {
      enabled: state.enabled,
      device: state.device,
      deviceName: DEVICES[state.device].name,
      speed: Math.round(Math.abs(state.effSpeed)),
      brake: state.brake,
      rawTrigger: state.rawTrigger || 0,
      settings: Object.assign({}, settings)
    };
  }

  if (HAS_EXT) {
    try {
      chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
        if (!msg || typeof msg.type !== 'string') return;
        if (msg.type === 'sc:toggle') setEnabled(!state.enabled);
        if (msg.type === 'sc:set-enabled') setEnabled(!!msg.value);
        if (msg.type === 'sc:status' || msg.type === 'sc:toggle' || msg.type === 'sc:set-enabled') reply(snapshot());
      });
    } catch (e) { /* ignore */ }
  }

  // API page (showcase / demo) : uniquement hors extension, ou si explicitement demandee.
  if (!HAS_EXT || CFG.api) {
    window.ScanController = {
      setEnabled,
      toggle: () => setEnabled(!state.enabled),
      setVirtual: (v) => {
        if (!v) { virtual.trigger = virtual.boost = virtual.device = null; return; }
        if ('trigger' in v) virtual.trigger = v.trigger;
        if ('boost' in v) virtual.boost = v.boost;
        if ('device' in v) virtual.device = v.device;
      },
      expand: (on) => { if (ui.dock) { if (on) ui.dock.dataset.open = 'true'; else delete ui.dock.dataset.open; } },
      toast: (device, title, sub) => showToast(device, title, sub),
      getState: snapshot
    };
  }

  /* ------------------------------------------------------------------ */
  /* Demarrage                                                          */
  /* ------------------------------------------------------------------ */
  function start() {
    buildHud();
    syncControls();
    loadSettings();
    state.lastT = performance.now();
    requestAnimationFrame(frame);
  }

  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start, { once: true });
})();
