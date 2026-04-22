import { signInWithGoogle, signInWithMagicLink } from '../lib/auth.js';

const SVG_GOOGLE = `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#EA4335" d="M12 10.2v3.72h5.17c-.23 1.2-.93 2.22-1.98 2.91v2.42h3.2c1.87-1.72 2.95-4.26 2.95-7.29 0-.7-.06-1.37-.18-2.01H12z"/><path fill="#34A853" d="M12 21c2.67 0 4.91-.88 6.55-2.39l-3.2-2.42c-.88.59-2.01.94-3.35.94-2.58 0-4.77-1.74-5.55-4.09H3.11v2.56C4.74 18.79 8.08 21 12 21z"/><path fill="#FBBC05" d="M6.45 13.04a5.4 5.4 0 0 1 0-3.44V7.04H3.11a9 9 0 0 0 0 7.92l3.34-2.92z"/><path fill="#4285F4" d="M12 6.48c1.45 0 2.76.5 3.79 1.48l2.84-2.84C16.91 3.55 14.67 2.7 12 2.7c-3.92 0-7.26 2.21-8.89 5.34l3.34 2.56C7.23 8.22 9.42 6.48 12 6.48z"/></svg>`;

export function renderLogin(mount) {
  mount.innerHTML = `
    <div class="login-wrap">
      <div class="login-kicker"><span class="dot"></span>Song Flow</div>
      <div class="login-title">Worship <em>setlists</em>,<br>built for the room.</div>
      <p class="login-sub">Plan flow, key, tempo and chord charts. Sign in to keep your setlists synced.</p>
      <div class="login-card">
        <button class="login-google" id="google-btn">${SVG_GOOGLE} Continue with Google</button>
        <div class="login-divider">or email magic link</div>
        <label class="field-label" for="email-input">Email</label>
        <input class="field-input" id="email-input" type="email" inputmode="email" autocomplete="email" placeholder="you@example.com">
        <button class="sheet-save" id="magic-btn" style="width:100%">Send Magic Link</button>
        <div class="login-msg" id="login-msg" style="display:none"></div>
      </div>
      <div class="login-footer"><span class="divider"></span>One place for every set · Flow · Chords · Key</div>
    </div>
  `;

  const msg = mount.querySelector('#login-msg');
  const setMsg = (text, error = false) => {
    msg.textContent = text || '';
    msg.classList.toggle('error', !!error);
    msg.style.display = text ? '' : 'none';
  };

  mount.querySelector('#google-btn').addEventListener('click', async () => {
    setMsg('Redirecting to Google…');
    try {
      const { error } = await signInWithGoogle();
      if (error) throw error;
    } catch (e) {
      setMsg(e.message || 'Google sign-in failed', true);
    }
  });

  mount.querySelector('#magic-btn').addEventListener('click', async () => {
    const email = mount.querySelector('#email-input').value.trim();
    if (!email) { setMsg('Enter your email first', true); return; }
    setMsg('Sending…');
    try {
      const { error } = await signInWithMagicLink(email);
      if (error) throw error;
      setMsg(`Check ${email} for a magic link.`);
    } catch (e) {
      setMsg(e.message || 'Could not send link', true);
    }
  });

  mount.querySelector('#email-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') mount.querySelector('#magic-btn').click();
  });
}
