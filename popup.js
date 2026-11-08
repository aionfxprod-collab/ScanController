/* ScanController — popup : reglages (chrome.storage) + pilotage de l'onglet actif. */
(() => {
  'use strict';

  const DEFAULTS = { cruiseSpeed: 120, softness: 45, sensitivity: 50 };
  const $ = (id) => document.getElementById(id);

  const PAD_BODY = 'M7 6.5h10c2.5 0 4.2 1.7 4.7 4.2l1 5.4c.4 2-1 3.7-2.8 3.7-1.1 0-2-.6-2.6-1.6L16.1 16H7.9l-1.2 2.2c-.6 1-1.5 1.6-2.6 1.6-1.8 0-3.2-1.7-2.8-3.7l1-5.4C2.8 8.2 4.5 6.5 7 6.5z';
  const ICONS = {
    dualsense: '<svg viewBox="0 0 24 24"><path d="' + PAD_BODY + '"/><rect x="9.4" y="8.6" width="5.2" height="3.2" rx="1"/><circle cx="9" cy="13.6" r="1.1"/><circle cx="15" cy="13.6" r="1.1"/></svg>',
    xbox: '<svg viewBox="0 0 24 24"><path d="' + PAD_BODY + '"/><circle cx="7.4" cy="10.6" r="1.3"/><circle cx="14.6" cy="13.8" r="1.1"/><circle cx="16.8" cy="9.2" r=".6"/><circle cx="18.4" cy="10.8" r=".6"/></svg>',
    gamepad: '<svg viewBox="0 0 24 24"><path d="' + PAD_BODY + '"/><path d="M6.6 10.4v3M5.1 11.9h3"/><circle cx="16.4" cy="10.6" r=".7"/><circle cx="17.8" cy="12.6" r=".7"/></svg>',
    keyboard: '<svg viewBox="0 0 24 24"><rect x="2.5" y="6.5" width="19" height="11" rx="2.4"/><path d="M6 10h.01M9 10h.01M12 10h.01M15 10h.01M18 10h.01M8 14h8"/></svg>',
    none: '<svg viewBox="0 0 24 24"><rect x="5" y="3.5" width="14" height="17" rx="2"/><path d="M5 9.5h14M12.5 9.5l-2 11"/></svg>'
  };
  const STATUS = {
    dualsense: ['DualSense détectée', 'Pressez R2 pour doser le scroll'],
    xbox: ['Manette Xbox détectée', 'Pressez RT pour doser le scroll'],
    gamepad: ['Manette détectée', 'Gâchette droite pour doser le scroll'],
    keyboard: ['Mode clavier', 'Maintenez Espace pour freiner · touchez la manette pour la réveiller'],
    none: ['Aucun scan ouvert', 'Ouvrez une page web pour piloter le scroll']
  };
  const KEYS = {
    pad: [['✕ / A', 'Activer / pause'], ['R2 / RT', 'Frein analogique'], ['L2 / LT', 'Boost jusqu’à +150 %'], ['D-Pad', 'Vitesse ± 15 px/s'], ['Stick', 'Déplacement manuel']],
    keyboard: [['Alt + S', 'Activer / pause'], ['Espace', 'Frein progressif amorti'], ['Pilule', 'Clic = activer / pause']]
  };

  let tabId = null;
  let settings = Object.assign({}, DEFAULTS);

  /* ---------- reglages ---------- */
  const fmt = { cruiseSpeed: (v) => v + ' px/s', softness: (v) => v + '%', sensitivity: (v) => v + '%' };

  function paintField(key) {
    const input = $(key);
    const v = settings[key];
    input.value = String(v);
    input.style.setProperty('--p', (((v - input.min) / (input.max - input.min)) * 100).toFixed(1) + '%');
    $('v-' + key).textContent = fmt[key](v);
  }

  chrome.storage.local.get({ cruiseSpeed: null, baseSpeed: null, softness: null, sensitivity: null }, (res) => {
    settings = {
      cruiseSpeed: Number(res.cruiseSpeed != null ? res.cruiseSpeed : (res.baseSpeed != null ? res.baseSpeed : DEFAULTS.cruiseSpeed)),
      softness: Number(res.softness != null ? res.softness : DEFAULTS.softness),
      sensitivity: Number(res.sensitivity != null ? res.sensitivity : DEFAULTS.sensitivity)
    };
    Object.keys(DEFAULTS).forEach(paintField);
  });

  Object.keys(DEFAULTS).forEach((key) => {
    $(key).addEventListener('input', (e) => {
      settings[key] = Number(e.target.value);
      paintField(key);
      chrome.storage.local.set({ [key]: settings[key] }); // le content script ecoute storage.onChanged
    });
  });

  /* ---------- statut de l'onglet ---------- */
  function paintStatus(s) {
    const device = s ? s.device : 'none';
    document.body.dataset.device = device;
    document.body.dataset.on = s && s.enabled ? 'true' : 'false';
    $('statusIcon').innerHTML = ICONS[device];
    $('statusTitle').textContent = STATUS[device][0];
    $('statusSub').textContent = s && s.enabled ? 'Auto-scroll actif · ' + STATUS[device][1] : STATUS[device][1];
    $('liveSpeed').textContent = s ? String(s.enabled ? s.speed : s.settings.cruiseSpeed) : '–';
    const btn = $('toggle');
    btn.disabled = !s;
    btn.textContent = s && s.enabled ? 'Mettre en pause' : 'Lancer l’auto-scroll';

    const keys = device === 'keyboard' || device === 'none' ? KEYS.keyboard.concat(KEYS.pad.slice(0, 2)) : KEYS.pad.concat([KEYS.keyboard[1]]);
    const html = keys.map((k) => '<kbd>' + k[0] + '</kbd><span>' + k[1] + '</span>').join('');
    if ($('keys').innerHTML !== html) $('keys').innerHTML = html;
  }

  function send(type, cb) {
    if (tabId == null) { cb(null); return; }
    try {
      chrome.tabs.sendMessage(tabId, { type }, (res) => {
        if (chrome.runtime.lastError) { cb(null); return; }
        cb(res || null);
      });
    } catch (e) { cb(null); }
  }

  $('toggle').addEventListener('click', () => send('sc:toggle', paintStatus));

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    tabId = tabs && tabs[0] ? tabs[0].id : null;
    const poll = () => send('sc:status', paintStatus);
    poll();
    setInterval(poll, 350);
  });

  paintStatus(null);
  $('version').textContent = 'v' + chrome.runtime.getManifest().version;
})();
