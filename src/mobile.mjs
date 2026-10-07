import { icon } from './icons.mjs';

export function mobileNavigation(view) {
  const secondary = ['courses','projects','habits','review','desktop','dev','settings','more'];
  return `<nav class="mobile-nav" aria-label="Main navigation">${[
    ['today','Home','home'], ['calendar','Calendar','calendar'], ['tasks','Tasks','tasks'], ['more','More','settings'],
  ].map(([id,label,glyph]) => `<button type="button" data-view="${id}" ${view === id || (id === 'more' && secondary.includes(view)) ? 'aria-current="page"' : ''}>${icon(glyph)}<span>${label}</span></button>`).join('')}</nav>`;
}

export function moreView({ heading, capabilities, dev }) {
  return heading('Your planner', 'Everything else, in one place.', null) +
    `<div class="mobile-destinations">${[
      ['courses','Courses','Classes and coursework','courses'],
      ['projects','Projects','Keep bigger work organized','projects'],
      ['habits','Habits','Make room for your routines','habits'],
      ['review','Weekly review','Reflect and plan ahead','review'],
      ['settings','Settings','Account, appearance and backups','settings'],
      ...(capabilities.overlays ? [['desktop','Desktop', capabilities.wallpaper ? 'Overlays and wallpaper' : 'Desktop overlays','desktop']] : []),
      ...(dev ? [['dev','Dev Mode','Advanced planner tools','dev']] : []),
    ].map(([id,label,description,glyph]) => `<button data-view="${id}">${icon(glyph)}<span><strong>${label}</strong><small>${description}</small></span>${icon('arrow')}</button>`).join('')}</div>`;
}

let installPrompt;
let pendingUpdate, updateRequested = false;
globalThis.addEventListener?.('beforeinstallprompt', event => {
  event.preventDefault(); installPrompt = event;
  document.querySelector('#mobile-install')?.removeAttribute('hidden');
});
export function bindMobile({ drawer, toast }) {
  const button = document.querySelector('#mobile-install');
  if (button) button.onclick = async () => {
    if (installPrompt) {
      await installPrompt.prompt();
      const result = await installPrompt.userChoice;
      if (result.outcome === 'accepted') installPrompt = null;
    } else {
      drawer('Install Munka', '<p>On iPhone, open this app in Safari, tap Share, then Add to Home Screen.</p><p>On Android, open it in Chrome and choose Install app or Add to Home screen from the menu.</p><p>Your plans stay on this device. Export a backup before clearing browser data.</p>');
    }
  };
  const update = document.querySelector('#mobile-update');
  if (update && pendingUpdate) update.hidden = false;
  if (update) update.onclick = () => {
    if (document.querySelector('.drawer') || document.querySelector('#quick-add input')?.value || document.querySelector('#calendar-quick-add [name=title]')?.value)
      return toast('Save or close your current draft before updating.');
    if (pendingUpdate) { updateRequested = true; pendingUpdate.postMessage({ type: 'ACTIVATE_UPDATE' }); }
  };
}

export async function registerMobile() {
  document.body.classList.add('web-app');
  const showConnectivity = () => { const target = document.querySelector('#mobile-connectivity'); if (target) target.textContent = navigator.onLine ? 'Plans stay on this device' : 'Offline · Plans stay on this device'; };
  addEventListener('online', showConnectivity); addEventListener('offline', showConnectivity);
  // Secure origin required by the browser. No auth/API responses are cached.
  if ('serviceWorker' in navigator && isSecureContext) {
    try {
      const registration = await navigator.serviceWorker.register('../sw.js');
      pendingUpdate = registration.waiting;
      navigator.serviceWorker.addEventListener('controllerchange', () => { if (updateRequested) location.reload(); });
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            pendingUpdate = registration.waiting;
            document.querySelector('#mobile-update')?.removeAttribute('hidden');
          }
        });
      });
    } catch { /* Online planner stays usable; no false offline-ready claim. */ }
  }
}
