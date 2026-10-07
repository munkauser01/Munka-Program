import { initialState, validateBackup, dateKey } from './domain.mjs';
import { webConfig } from './web-config.mjs';
import { platformCapabilities } from './platform.mjs';

// Planner records stay on this device. Account sessions are memory-only.
export function createBrowserBridge({ storage = localStorage, config = webConfig, clientFactory } = {}) {
  let mode = 'locked', user = null, clientPromise;
  const accessListeners = new Set(), changeListeners = new Set();
  const key = () => user && mode === 'account' ? `munka.account.${user.id}` : 'munka';
  const status = () => ({ mode, signedIn: mode === 'account' && !!user,
    email: user?.email || '', id: user?.id || '', secure: false });
  function requireOpen() { if (mode === 'locked') throw Error('Sign in or choose Use locally to open your planner.'); }
  function read() {
    const raw = storage.getItem(key());
    if (!raw) {
      const state = initialState();
      Object.assign(state.preferences, { widget: false, widgetProjects: false, background: false, calendarMode: 'agenda' });
      return state;
    }
    try { return validateBackup(JSON.parse(raw)); }
    catch { throw Error('Your saved planner could not be opened. Its data has not been overwritten. Restore a valid backup.'); }
  }
  async function client() {
    if (!clientPromise) clientPromise = (async () => {
      if (!config.url?.startsWith('https://') || !/^sb_publishable_[A-Za-z0-9_-]+$/.test(config.publishableKey || ''))
        throw Error('Account sign-in is not configured. You can use Munka locally.');
      if (!clientFactory && !globalThis.supabase?.createClient) await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = new URL('./vendor/supabase.js', import.meta.url).href;
        script.onload = resolve;
        script.onerror = () => { script.remove(); reject(Error('Sign-in could not load. Try again online or use locally.')); };
        document.head.append(script);
      });
      const factory = clientFactory || globalThis.supabase?.createClient;
      if (!factory) throw Error('Sign-in could not load. Try again online or use locally.');
      const instance = factory(config.url, config.publishableKey, {
        auth: { persistSession: false, autoRefreshToken: true, detectSessionInUrl: false },
      });
      instance.auth.onAuthStateChange?.(event => {
        if (event === 'SIGNED_OUT' && mode === 'account') {
          mode = 'locked'; user = null;
          queueMicrotask(() => accessListeners.forEach(listener => listener(status())));
        }
      });
      return instance;
    })().catch(error => { clientPromise = null; throw error; });
    return clientPromise;
  }
  async function account(action, credentials = {}) {
    if (action === 'status') {
      if (mode === 'account') {
        const { data, error } = await (await client()).auth.getUser();
        if (error || !data.user) throw Error('Could not verify your account. Reconnect or use locally.');
        user = data.user;
      }
      return status();
    }
    // Browser OAuth requires a deployed callback origin; do not advertise it early.
    if (action === 'providers') return { email: true, google: false, googlePending: true };
    if (action === 'cancel') return status();
    if (['useLocal', 'lock', 'signOut'].includes(action)) {
      mode = action === 'useLocal' ? 'local' : 'locked'; user = null;
      if (clientPromise) {
        const instance = await client();
        const { error } = await instance.auth.signOut({ scope: 'local' });
        // Clear locally even if revocation cannot reach the server.
        if (error) { instance.auth.stopAutoRefresh?.(); clientPromise = null; }
      }
      if (action === 'signOut') accessListeners.forEach(listener => listener(status()));
      return status();
    }
    if (!['signIn', 'register'].includes(action)) throw Error('This sign-in option is not available in the mobile beta.');
    const { email, password } = credentials;
    if (typeof email !== 'string' || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim()) || email.length > 254 ||
      typeof password !== 'string' || !password || password.length > 1024 || (action === 'register' && password.length < 12))
      throw Error('Enter your email and password. New passwords need at least 12 characters.');
    const instance = await client();
    const { data, error } = action === 'register'
      ? await instance.auth.signUp({ email: email.trim(), password })
      : await instance.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw Error(error.message);
    if (!data?.session) {
      if (action === 'register' && data?.user) return { ...status(), confirmationRequired: true };
      throw Error('Sign-in did not finish. Try again.');
    }
    const verified = await instance.auth.getUser();
    if (verified.error || !verified.data.user) throw Error('Could not verify your account. Try again.');
    user = verified.data.user; mode = 'account';
    return status();
  }
  globalThis.addEventListener?.('storage', event => {
    if (mode !== 'locked' && event.key === key()) {
      try { changeListeners.forEach(listener => listener(read())); } catch { /* Preserve invalid records. */ }
    }
  });
  return {
    capabilities: platformCapabilities(), account,
    cloud: async (action, data = {}, expectedUser) => {
      if (mode !== 'account' || user?.id !== expectedUser) throw Error('Sign in to sync this account.');
      const instance = await client(), identity = user.id;
      const verified = await instance.auth.getUser();
      if (verified.error || verified.data.user?.id !== identity) throw Error('Sign in again to sync this account.');
      const {data:value,error} = await instance.rpc('munka_cloud',{p_action:action,p_data:data}).abortSignal(AbortSignal.timeout(20000));
      if(mode!=='account'||user?.id!==identity)throw Error('Your account changed.');
      if(error)throw Object.assign(Error(error.message),{code:error.code});
      return value;
    },
    localPlanner: async () => { requireOpen(); const raw=storage.getItem('munka'); return raw?validateBackup(JSON.parse(raw)):initialState(); },
    version: async () => ({ version: config.version, build: 'Mobile web beta', platform: 'web', capabilities: platformCapabilities() }),
    load: async () => { requireOpen(); return read(); },
    save: async (next, expectedRevision, expectedAccount) => {
      requireOpen();
      const targetKey=key(),targetMode=mode,targetUser=user?.id;
      const write = () => {
        requireOpen();
        if(key()!==targetKey||mode!==targetMode||user?.id!==targetUser||
           (expectedAccount!==undefined && expectedAccount!==(mode==='account'?user?.id:null)))
          throw Error('Your account changed. Reopen the planner before saving.');
        const current = read();
        if (current.revision !== expectedRevision) throw Error('Your planner changed in another tab. Review the latest version and try again.');
        const checked = validateBackup(next);
        checked.revision = current.revision + 1;
        const raw = JSON.stringify(checked);
        if (raw.length > 4 * 1024 * 1024) throw Error('Device storage is nearly full. Export a backup and archive older plans.');
        try { storage.setItem(targetKey, raw); }
        catch { throw Error('This device could not save your plan. Free storage or leave private browsing, then try again.'); }
        return checked;
      };
      return globalThis.navigator?.locks ? navigator.locks.request(`munka-save:${targetKey}`, async () => write()) : write();
    },
    onChange: listener => { changeListeners.add(listener); return () => changeListeners.delete(listener); },
    onAccessChange: listener => { accessListeners.add(listener); return () => accessListeners.delete(listener); },
    desktop: async action => { if (action === 'displays') return []; throw Error('Desktop overlays are available in the Mac and Windows desktop apps.'); },
    exportFile: async (text, extension) => {
      requireOpen();
      if (!['json', 'csv'].includes(extension)) throw Error('Choose a supported export format.');
      const url = URL.createObjectURL(new Blob([text], { type: extension === 'json' ? 'application/json' : 'text/csv' }));
      const link = document.createElement('a'); link.href = url; link.download = `Munka-${dateKey()}.${extension}`;
      document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 10000);
      return true;
    },
    importFile: () => new Promise(resolve => {
      requireOpen();
      const input = document.createElement('input'); input.type = 'file'; input.accept = '.json,.csv,.ics';
      input.onchange = async () => {
        const file = input.files[0];
        if (!file) return resolve(null);
        if (file.size > 4 * 1024 * 1024) return resolve({ name: file.name, text: '' });
        resolve({ name: file.name, text: await file.text() });
      };
      input.oncancel = () => resolve(null); input.click();
    }),
  };
}
