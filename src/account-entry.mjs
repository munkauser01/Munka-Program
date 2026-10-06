import { icon } from './icons.mjs';
const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[character]);
const eye = icon('eye');

export function mountAccountEntry({ host, bridge, version, onEnter, notice = '', returning = false }) {
  let creating = false, busy = false, googleReady = false, email = '', message = notice, alive = true;
  let providerText = bridge.account ? 'Checking Google sign-in...' : 'Account sign-in is available in the Windows app.';
  document.body.classList.add('account-entry-page');

  function render() {
    host.innerHTML = `<main id="main" tabindex="-1" class="account-entry" aria-labelledby="entry-title">
      <div class="entry-form-wrap">
        <header class="entry-heading">
          <div class="entry-logo"><img src="../assets/munka.png" alt=""><span>Munka</span></div>
          <h1 id="entry-title">${creating ? 'Create your account' : 'Welcome to Munka'}</h1>
          <p class="entry-lead">Your personal planner for school, work, and everyday life.</p>
        </header>
        <button type="button" id="munka-google" class="entry-google" ${googleReady ? '' : 'hidden'} ${googleReady && !busy ? '' : 'disabled'}>Continue with Google</button>
        <p class="entry-provider-note" id="munka-google-status">${escape(providerText)}</p>
        <div class="entry-divider" ${googleReady ? '' : 'hidden'}><span>${creating ? 'or create an account with email' : 'or sign in with email'}</span></div>
        <form id="entry-form" aria-busy="${busy}">
          <label class="field" for="entry-email"><span>Email</span><input id="entry-email" name="email" type="email" value="${escape(email)}" placeholder="you@example.com" required maxlength="254" autocomplete="username" autocapitalize="none" spellcheck="false"></label>
          <label class="field" for="entry-password"><span>Password</span><div class="entry-password"><input id="entry-password" name="password" type="password" required ${creating ? 'minlength="12" aria-describedby="entry-password-help"' : ''} maxlength="1024" autocomplete="${creating ? 'new-password' : 'current-password'}"><button type="button" id="entry-show-password" class="quiet" aria-label="Show password" aria-pressed="false">${eye}</button></div></label>
          ${creating ? '<p class="entry-help" id="entry-password-help">Use at least 12 characters.</p><label class="field" for="entry-confirm"><span>Confirm password</span><input id="entry-confirm" name="confirm" type="password" required maxlength="1024" autocomplete="new-password"></label>' : ''}
          <p id="entry-error" class="entry-error" role="alert"></p>
          <p id="munka-account-message" class="entry-message" role="status">${escape(message)}</p>
          <button class="primary entry-submit" type="submit" ${busy || !bridge.account ? 'disabled' : ''}>${creating ? 'Create account' : 'Sign in'}</button>
        </form>
        <button type="button" id="entry-cancel" class="quiet" hidden>Cancel Google sign-in</button>
        <p class="entry-switch">${creating ? 'Already have an account?' : 'New to Munka?'} <button type="button" class="quiet" id="entry-switch">${creating ? 'Sign in' : 'Create an account'}</button></p>
        <section class="entry-local" aria-labelledby="entry-local-title">
          <h2 id="entry-local-title">Keep your plans on this device</h2>
          <p>${bridge.capabilities?.platform === 'web' ? 'Tasks, calendar, courses, projects, habits, imports and backups work locally. AI, live calendar connections and background alerts are not available in this mobile beta.' : 'Tasks, calendar, imports and backups work locally. AI and connected calendars require sign-in.'}</p>
          <button type="button" id="munka-local">${returning ? 'Return to local planner' : 'Use locally'}</button>
        </section>
        <footer class="entry-about"><p class="entry-data-note">Cloud sync and shared calendars are coming later.</p><span class="entry-version">Munka ${escape(version)}</span></footer>
      </div>
    </main>`;
    host.querySelector('#entry-switch').onclick = () => {
      if (busy) return;
      email = host.querySelector('[name=email]').value;
      creating = !creating; message = ''; render(); host.querySelector('[name=email]').focus();
    };
    host.querySelector('#entry-show-password').onclick = event => {
      const input = host.querySelector('[name=password]');
      const shown = input.type === 'password';
      input.type = shown ? 'text' : 'password';
      const confirmation = host.querySelector('[name=confirm]');
      if (confirmation) confirmation.type = input.type;
      event.currentTarget.setAttribute('aria-label', shown ? 'Hide password' : 'Show password');
      event.currentTarget.setAttribute('aria-pressed', String(shown));
    };
    host.querySelector('#entry-form').onsubmit = async event => {
      event.preventDefault(); if (busy) return;
      const password = host.querySelector('[name=password]').value;
      if (creating && host.querySelector('[name=confirm]').value !== password) {
        showError(Error('Your passwords do not match. Enter the same password in both fields.'));
        return;
      }
      const credentials = { email: host.querySelector('[name=email]').value.trim(), password };
      email = credentials.email;
      await run(creating ? 'Creating account...' : 'Signing in...', async () => {
        const result = await bridge.account(creating ? 'register' : 'signIn', credentials);
        if (!alive) return;
        host.querySelectorAll('[name=password],[name=confirm]').forEach(input => { input.value = ''; });
        if (result.confirmationRequired) {
          creating = false;
          message = 'Check your email for a confirmation link. After confirming, return here to sign in. If you already have an account, sign in with your existing password.';
          busy = false; render(); host.querySelector('[name=password]').focus();
        } else if (result.signedIn && result.mode === 'account') await onEnter(result);
        else throw Error('Account creation did not complete. Please try again.');
      });
    };
    host.querySelector('#munka-google').onclick = () => run('Signing in with Google...', async () => {
      host.querySelector('#entry-cancel').hidden = false;
      host.querySelector('#munka-account-message').textContent = 'Complete sign-in in your browser, then return to Munka.';
      const result = await bridge.account('google'); if (alive) await onEnter(result);
    });
    host.querySelector('#entry-cancel').onclick = () => bridge.account('cancel').catch(showError);
    host.querySelector('#munka-local').onclick = () => run('Opening your planner...', async () => {
      const result = bridge.account ? await bridge.account('useLocal') : { mode: 'local', signedIn: false };
      if (alive) await onEnter(result);
    });
  }
  function showError(error) {
    if (!alive) return;
    const target = host.querySelector('#entry-error');
    target.textContent = error.message || 'Something went wrong. Please try again.';
    target.tabIndex = -1; target.focus();
  }
  async function run(label, action) {
    if (busy) return;
    busy = true;
    const form = host.querySelector('#entry-form'); form.setAttribute('aria-busy', 'true');
    host.querySelector('#entry-error').textContent = '';
    host.querySelector('#munka-account-message').textContent = '';
    const submit = host.querySelector('.entry-submit'), original = submit.textContent;
    submit.textContent = label;
    host.querySelectorAll('button,input').forEach(control => { if (control.id !== 'entry-cancel') control.disabled = true; });
    try { await action(); } catch (error) { showError(error); }
    finally {
      busy = false;
      if (alive && host.querySelector('#entry-form') === form) {
        form.setAttribute('aria-busy', 'false'); submit.textContent = original;
        host.querySelectorAll('button,input').forEach(control => { control.disabled = false; });
        host.querySelector('#munka-google').disabled = !googleReady;
        submit.disabled = !bridge.account; host.querySelector('#entry-cancel').hidden = true;
      }
    }
  }
  render();
  if (bridge.account) bridge.account('providers').then(providers => {
    googleReady = providers.google;
    providerText = googleReady ? 'Sign in securely through Google.' : 'Google sign-in is being set up. Email sign-in is available.';
    if (alive) { host.querySelector('#munka-google').disabled = busy || !googleReady; host.querySelector('#munka-google').hidden = !googleReady; host.querySelector('.entry-divider').hidden = !googleReady; host.querySelector('#munka-google-status').textContent = providerText; }
  }).catch(() => { if (alive) host.querySelector('#munka-google-status').textContent = 'Google is unavailable right now. Use email or continue locally.'; });
  return () => { alive = false; document.body.classList.remove('account-entry-page'); if (bridge.account) bridge.account('cancel').catch(() => {}); };
}
