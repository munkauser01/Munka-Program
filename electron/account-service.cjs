const fs = require('node:fs');
const http = require('node:http');
const { randomBytes } = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');

function encryptedStorage(file, safeStorage) {
  const memory = new Map();
  const secure = safeStorage.isEncryptionAvailable();
  function read() {
    if (!secure || !fs.existsSync(file)) return Object.fromEntries(memory);
    try {
      return JSON.parse(safeStorage.decryptString(fs.readFileSync(file)));
    } catch {
      throw Error('The saved Munka account session could not be opened.');
    }
  }
  function write(values) {
    if (!secure) {
      memory.clear();
      for (const [key, value] of Object.entries(values)) memory.set(key, value);
      return;
    }
    const temporary = file + '.tmp';
    fs.writeFileSync(temporary, safeStorage.encryptString(JSON.stringify(values)));
    fs.renameSync(temporary, file);
  }
  return {
    secure,
    getItem: key => read()[key] ?? null,
    setItem: (key, value) => write({ ...read(), [key]: value }),
    removeItem: key => {
      const values = read();
      delete values[key];
      if (secure && !Object.keys(values).length) {
        if (fs.existsSync(file)) fs.unlinkSync(file);
      } else write(values);
    },
  };
}

function createAccountService({ url, publishableKey, file, safeStorage, openExternal, onSignedOut = () => {}, clientFactory = createClient, serverFactory = http.createServer, fetchImpl = fetch }) {
  const endpoint = new URL(url);
  if (endpoint.protocol !== 'https:' || endpoint.pathname !== '/' || !/^sb_publishable_[A-Za-z0-9_-]+$/.test(publishableKey))
    throw Error('Munka account configuration is invalid.');
  const storage = encryptedStorage(file, safeStorage);
  const client = clientFactory(url, publishableKey, {
    auth: { storage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, flowType: 'pkce' },
  });
  let pending = null;
  client.auth.onAuthStateChange?.(event => {
    if (event === 'SIGNED_OUT') queueMicrotask(onSignedOut);
  });
  const account = user => ({ signedIn: true, email: user.email || '', id: user.id, secure: storage.secure });
  const signedOut = () => ({ signedIn: false, secure: storage.secure });

  async function providers() {
    const response = await fetchImpl(new URL('/auth/v1/settings', endpoint), {
      headers: { apikey: publishableKey },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw Error('Could not check Munka sign-in options. Check your connection.');
    const settings = await response.json();
    return { email: settings.external?.email === true, google: settings.external?.google === true };
  }

  async function status() {
    const { data: sessionData, error: sessionError } = await client.auth.getSession();
    if (sessionError) throw Error('Could not restore the Munka account session.');
    if (!sessionData.session) return signedOut();
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) throw Error('Could not verify the Munka account. Check your connection.');
    return account(data.user);
  }
  async function signIn({ email, password } = {}) {
    if (typeof email !== 'string' || typeof password !== 'string' || email.length > 254 || password.length > 1024)
      throw Error('Enter a valid email and password.');
    const { data, error } = await client.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw Error(error.message);
    if (!data.session || !data.user) throw Error('Sign-in did not create a session.');
    return account(data.user);
  }
  async function register({ email, password } = {}) {
    if (typeof email !== 'string' || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim()) || email.length > 254 ||
        typeof password !== 'string' || password.length < 12 || password.length > 1024)
      throw Error('Use an email address and a password of at least 12 characters.');
    const { data, error } = await client.auth.signUp({ email: email.trim(), password });
    if (error) {
      if (error.code === 'email_address_not_authorized' || /email address not authorized/i.test(error.message))
        throw Error('Munka cannot send a confirmation email to this address yet. Try again later or use locally.');
      if (error.code === 'over_email_send_rate_limit' || error.code === 'over_request_rate_limit')
        throw Error('Too many account requests. Please wait before trying again.');
      throw Error(error.message);
    }
    if (!data?.user) throw Error('Account creation did not complete. Please try again.');
    return data.session && data.user ? account(data.user) : { ...signedOut(), confirmationRequired: true };
  }
  async function signOut() {
    const { error } = await client.auth.signOut({ scope: 'local' });
    if (error) throw Error('Could not sign out. Try again.');
    return signedOut();
  }
  function cancel() {
    if (pending) pending.finish(Error('Google sign-in was cancelled.'));
    return signedOut();
  }
  function google() {
    if (pending) throw Error('Finish or cancel the current sign-in first.');
    return new Promise((resolve, reject) => {
      const state = randomBytes(24).toString('base64url');
      let timer;
      let finished = false;
      let redeeming = false;
      const server = serverFactory(async (request, response) => {
        const callback = new URL(request.url, 'http://127.0.0.1');
        response.setHeader('Content-Type', 'text/plain; charset=utf-8');
        response.setHeader('Cache-Control', 'no-store');
        response.setHeader('Content-Security-Policy', "default-src 'none'");
        if (redeeming || request.method !== 'GET' || callback.pathname !== '/munka-account' || callback.searchParams.get('state') !== state) {
          response.writeHead(400);
          response.end('This Munka sign-in request is not valid.');
          return;
        }
        if (callback.searchParams.has('error')) {
          response.end('Google sign-in was not completed. Return to Munka.');
          finish(Error('Google sign-in was not completed.'));
          return;
        }
        const code = callback.searchParams.get('code');
        if (!code || code.length > 8192) {
          response.writeHead(400);
          response.end('Missing sign-in code.');
          return;
        }
        redeeming = true;
        response.end('Return to Munka to finish signing in.');
        try {
          const { data, error } = await client.auth.exchangeCodeForSession(code);
          if (error || !data.user || !data.session) throw Error('Google sign-in could not be completed.');
          finish(null, account(data.user));
        } catch (error) {
          finish(error);
        }
      });
      const finish = (error, value) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        server.close();
        pending = null;
        error ? reject(error) : resolve(value);
      };
      pending = { finish };
      server.on('error', () => finish(Error('Could not open the local sign-in callback.')));
      server.listen(0, '127.0.0.1', async () => {
        const redirectTo = `http://127.0.0.1:${server.address().port}/munka-account?state=${state}`;
        try {
          const { data, error } = await client.auth.signInWithOAuth({
            provider: 'google', options: { redirectTo, skipBrowserRedirect: true },
          });
          if (error || !data.url) throw Error('Google sign-in is not available yet. Check its Supabase provider setup.');
          const authorization = new URL(data.url);
          if (authorization.origin !== endpoint.origin || !authorization.pathname.startsWith('/auth/v1/authorize'))
            throw Error('Google sign-in returned an invalid authorization URL.');
          timer = setTimeout(() => finish(Error('Google sign-in timed out. Try again.')), 5 * 60 * 1000);
          timer.unref?.();
          await openExternal(data.url);
        } catch (error) {
          finish(error);
        }
      });
    });
  }
  async function cloud(action, data, expectedUser) {
    const verified = await status();
    if (!verified.signedIn || verified.id !== expectedUser) throw Error('Sign in again to sync this account.');
    const allowed = ['planner_read','planner_write','calendar_list','calendar_create','calendar_update','calendar_members','calendar_invite','calendar_access','calendar_revoke','calendar_leave','invitation_list','invitation_accept','invitation_revoke','event_write'];
    if (!allowed.includes(action)) throw Error('Unknown cloud action.');
    const { data: value, error } = await client.rpc('munka_cloud', { p_action: action, p_data: data || {} }).abortSignal(AbortSignal.timeout(20000));
    if (error) throw Object.assign(Error(error.message), { code: error.code });
    return value;
  }
  return { status, providers, signIn, register, signOut, google, cancel, cloud };
}

module.exports = { createAccountService, encryptedStorage };
