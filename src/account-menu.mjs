import { icon } from './icons.mjs';
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function accountMenu(status) {
  const signedIn = !!status?.signedIn;
  const letters = String(status?.email || '').split('@')[0].replace(/[^a-z]/gi, '').slice(0, 2).toUpperCase();
  const avatar = signedIn ? escape(letters || 'M') : icon('person');
  return `<details class="account-menu"><summary class="account-avatar" id="account-menu-toggle" aria-label="Account menu">${avatar}</summary>
    <div class="account-popover"><div class="account-popover-identity"><strong>${signedIn ? 'Munka account' : 'Local planner'}</strong><p>${signedIn ? escape(status.email) : 'Your plans are saved on this device.'}</p></div>
    ${signedIn ? '<button type="button" data-action="munka-account">Account details</button>' : '<button type="button" data-action="munka-account">Sign in or create account</button>'}
    <button type="button" data-view="settings">Settings</button>
    ${signedIn ? '<button type="button" data-action="munka-switch-account">Switch account</button><hr><button type="button" data-action="munka-signout">Sign out</button>' : ''}</div>
  </details>`;
}
