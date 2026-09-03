// ============================================================
// Access Inspector — content-script.js
// ============================================================
// Runs in every webpage's isolated world (extension context).
// THREE jobs:
//   1. Bridge — game.js → background.js (for API calls bypassing CSP)
//   2. Overlays — show/close overlays on the page
//   3. Wire up interactive elements inside overlays (signup form, etc.)
// ============================================================

const API_BASE = 'https://endnote-grape-retiring.ngrok-free.dev/api';
const COLORS = ['peach', 'teal', 'orange', 'yellow', 'purple'];
const MOODS = ['confident', 'happy', 'worried', 'pokerface'];


// ============================================================
// JOB 1 — API bridge for game.js
// ============================================================
window.addEventListener('AccessInspectorRequest', async (event) => {
  const { requestId, url, options } = event.detail;
  try {
    const result = await chrome.runtime.sendMessage({
      type: 'API_REQUEST', url, options
    });
    window.dispatchEvent(new CustomEvent('AccessInspectorResponse', {
      detail: { requestId, result }
    }));
  } catch (err) {
    window.dispatchEvent(new CustomEvent('AccessInspectorResponse', {
      detail: { requestId, result: { ok: false, error: err.message } }
    }));
  }
});


// ============================================================
// JOB 2 — Overlay rendering
// ============================================================
let currentOverlay = null;
let escHandler = null;

function ensureStylesInjected() {
  if (document.getElementById('ai-overlay-styles')) return;
  const link = document.createElement('link');
  link.id = 'ai-overlay-styles';
  link.rel = 'stylesheet';
  link.href = chrome.runtime.getURL('overlay.css');
  document.head.appendChild(link);
}

function showOverlay(innerHTML) {
  if (currentOverlay) closeOverlay();
  ensureStylesInjected();

  const backdrop = document.createElement('div');
  backdrop.className = 'ai-overlay-backdrop';
  backdrop.innerHTML = `
    <div class="ai-overlay-card" role="dialog" aria-modal="true">
      <button class="ai-overlay-close" aria-label="Close">×</button>
      ${innerHTML}
    </div>
  `;
  document.body.appendChild(backdrop);
  currentOverlay = backdrop;

  // Close behaviors
  backdrop.querySelector('.ai-overlay-close').addEventListener('click', closeOverlay);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeOverlay(); });
  escHandler = (e) => { if (e.key === 'Escape') closeOverlay(); };
  document.addEventListener('keydown', escHandler);

  wireUpSignupForm(backdrop);
  wireUpLoginForm(backdrop);
  wireUpProfile(backdrop);
  wireUpLeaderboard(backdrop);
}

function closeOverlay() {
  if (currentOverlay) {
    currentOverlay.remove();
    currentOverlay = null;
  }
  if (escHandler) {
    document.removeEventListener('keydown', escHandler);
    escHandler = null;
  }
}


// ============================================================
// SIGNUP FORM behavior
// ============================================================
function wireUpSignupForm(root) {
  const form = root.querySelector('#ai-signup-submit');
  if (!form) return;  // not a signup overlay

  const avatarImg = root.querySelector('#ai-signup-avatar');
  const picker    = root.querySelector('#ai-color-picker');

  // --- Color picker: clicking a dot updates the avatar ---
  picker.addEventListener('click', (e) => {
    const dot = e.target.closest('.ai-color-dot');
    if (!dot) return;
    const color = dot.dataset.color;

    // Update avatar src
    avatarImg.src = chrome.runtime.getURL(`icons/avatars/${color}-happy.svg`);
    avatarImg.dataset.color = color;

    // Update selected state
    picker.querySelectorAll('.ai-color-dot').forEach(d => d.classList.remove('selected'));
    dot.classList.add('selected');
  });

  // --- Submit button: call the signup API ---
  form.addEventListener('click', async () => {
    const username = root.querySelector('#ai-signup-username').value.trim();
    const email    = root.querySelector('#ai-signup-email').value.trim();
    const password = root.querySelector('#ai-signup-password').value;
    const color    = avatarImg.dataset.color;
    const msg      = root.querySelector('#ai-signup-message');

    // Client-side validation
    if (!username || !email || !password) {
      return showMessage(msg, 'Please fill in all fields.', 'error');
    }
    if (password.length < 6) {
      return showMessage(msg, 'Password must be at least 6 characters.', 'error');
    }

    showMessage(msg, 'Creating your account…', 'info');
    form.disabled = true;

    // Make the API call via background.js (bypasses page CSP)
    const result = await chrome.runtime.sendMessage({
      type: 'API_REQUEST',
      url: `${API_BASE}/signup`,
      options: {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true'
        },
        body: JSON.stringify({ username, email, password, finger_color: color })
      }
    });

    if (result && result.ok) {
      // Save token + user info locally
      await chrome.storage.local.set({
        token: result.data.token,
        username: result.data.username,
        fingerColor: result.data.fingerColor
      });
      showMessage(msg, '✅ Account created! Welcome aboard.', 'success');
      setTimeout(closeOverlay, 1200);
    } else {
      const err = (result && result.data && result.data.error) || 'Sign up failed.';
      showMessage(msg, '⚠️ ' + err, 'error');
      form.disabled = false;
    }
  });
}

function wireUpLoginForm(root) {
  const form = root.querySelector('#ai-login-form');
  if (!form) return; // not a login overlay

  const submitButton = form.querySelector('#ai-login-submit');
  const msg = root.querySelector('#ai-login-message');

  const loginAction = async () => {
    const username = root.querySelector('#ai-login-username').value.trim();
    const password = root.querySelector('#ai-login-password').value;

    if (!username || !password) {
      return showMessage(msg, 'Please enter both username and password.', 'error');
    }

    showMessage(msg, 'Signing in…', 'info');
    submitButton.disabled = true;

    const result = await chrome.runtime.sendMessage({
      type: 'API_REQUEST',
      url: `${API_BASE}/login`,
      options: {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true'
        },
        body: JSON.stringify({ username, password })
      }
    });

    if (result && result.ok) {
      await chrome.storage.local.set({
        token: result.data.token,
        username: result.data.username,
        fingerColor: result.data.fingerColor
      });
      showMessage(msg, '✅ Logged in successfully.', 'success');
      setTimeout(closeOverlay, 1000);
    } else {
      const err = (result && result.data && result.data.error) || 'Login failed.';
      showMessage(msg, '⚠️ ' + err, 'error');
      submitButton.disabled = false;
    }
  };

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    loginAction();
  });

  submitButton.addEventListener('click', (event) => {
    event.preventDefault();
    loginAction();
  });
}


// ============================================================
// PROFILE OVERLAY
// ============================================================
function getAvatarPath(color, mood) {
  const safeColor = COLORS.includes(color) ? color : 'peach';
  const safeMood  = MOODS.includes(mood)   ? mood   : 'happy';
  return `icons/avatars/${safeColor}-${safeMood}.svg`;
}

async function wireUpProfile(root) {
  if (!root.querySelector('#ai-profile-avatar')) return;

  const { token } = await chrome.storage.local.get(['token']);
  if (!token) return;

  const result = await chrome.runtime.sendMessage({
    type: 'API_REQUEST',
    url: `${API_BASE}/profile`,
    options: { method: 'GET', headers: { 'Authorization': `Bearer ${token}`, 'ngrok-skip-browser-warning': 'true' } }
  });

  if (!result || !result.ok) return;
  const p = result.data;

  root.querySelector('#ai-profile-avatar').src = chrome.runtime.getURL(getAvatarPath(p.fingerColor, p.mood));
  root.querySelector('#ai-profile-username').textContent = p.username;
  root.querySelector('#ai-profile-level').textContent    = `LVL ${p.level} · ${(p.title || '').toUpperCase()}`;

  const xpPct = p.nextLevelMinXp == null ? 100
    : Math.round(((p.currentXp - p.levelMinXp) / (p.nextLevelMinXp - p.levelMinXp)) * 100);
  root.querySelector('#ai-profile-xp-fill').style.width = xpPct + '%';
  root.querySelector('#ai-profile-xp-text').textContent = p.nextLevelMinXp
    ? `${p.currentXp.toLocaleString()} / ${p.nextLevelMinXp.toLocaleString()} XP`
    : `${p.currentXp.toLocaleString()} XP — Max level!`;

  const set = (id, val) => { const el = root.querySelector('#' + id); if (el) el.textContent = val; };
  set('ai-stat-issues', (p.totalIssuesFound  || 0).toLocaleString());
  set('ai-stat-sites',  (p.totalSitesVisited || 0).toLocaleString());
  set('ai-stat-xp',     (p.totalXp           || 0).toLocaleString());
  set('ai-stat-rank',   p.totalPlayers > 1 ? `#${p.rank} of ${p.totalPlayers}` : '—');
  set('ai-chip-rank',   p.totalPlayers > 1 ? `#${p.rank}` : '—');
  set('ai-chip-xp',     (p.totalXp || 0).toLocaleString());
}

// ============================================================
// LEADERBOARD OVERLAY
// ============================================================
async function wireUpLeaderboard(root) {
  const podiumEl = root.querySelector('#ai-lb-podium');
  const listEl   = root.querySelector('#ai-leaderboard-list');
  if (!podiumEl || !listEl) return;

  const { username: myUsername } = await chrome.storage.local.get(['username']);

  const result = await chrome.runtime.sendMessage({
    type: 'API_REQUEST',
    url: `${API_BASE}/leaderboard`,
    options: { method: 'GET', headers: { 'ngrok-skip-browser-warning': 'true' } }
  });

  if (!result || !result.ok) {
    podiumEl.innerHTML = '<p style="color:#888;font-size:13px;text-align:center;width:100%">Could not load leaderboard.</p>';
    return;
  }

  const entries = result.data.leaderboard || [];
  if (entries.length === 0) {
    podiumEl.innerHTML = '<p style="color:#888;font-size:13px;text-align:center;width:100%;align-self:center">No scores yet — be the first!</p>';
    return;
  }

  const top3          = [entries[1], entries[0], entries[2]];
  const podiumHeights = ['80px', '110px', '60px'];
  const podiumRanks   = ['2', '1', '3'];
  const shadowDepths  = ['6px', '8px', '5px'];
  const avatarSizes   = ['70px', '90px', '62px'];

  podiumEl.innerHTML = '';
  top3.forEach((entry, i) => {
    if (!entry) return;
    const isMe    = entry.username === myUsername;
    const isFirst = podiumRanks[i] === '1';
    const avatarSrc = chrome.runtime.getURL(getAvatarPath(entry.fingerColor, 'happy'));
    const col = document.createElement('div');
    col.style.cssText = 'display:flex;flex-direction:column;align-items:center;flex:1;';
    col.innerHTML = `
      <div style="position:relative;margin-bottom:8px;margin-top:${isFirst ? '0' : '12px'}">
        ${isFirst ? `<div style="position:absolute;top:-20px;left:50%;transform:translateX(-50%);font-size:22px;line-height:1">👑</div>` : ''}
        <img src="${avatarSrc}" style="width:${avatarSizes[i]};height:${avatarSizes[i]};border-radius:50%;object-fit:cover;display:block;background:#e0d9cf" alt="${entry.username}"/>
        <div style="background:#0F0A0A;border-radius:20px;padding:2px 6px;font-size:10px;font-weight:700;color:#FAF3E7;position:absolute;bottom:-9px;left:50%;transform:translateX(-50%);white-space:nowrap">${entry.totalXp.toLocaleString()} XP</div>
      </div>
      <div style="font-size:${isFirst ? '14px' : '12px'};font-weight:800;color:#0F0A0A;margin:16px 2px 6px;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:85px">${entry.username}${isMe ? ' (you)' : ''}</div>
      <div style="background:#BDBF09;border-radius:10px 10px 0 0;height:${podiumHeights[i]};width:100%;display:flex;align-items:center;justify-content:center;box-shadow:inset 0 3px 0 0 rgba(255,255,255,0.3),inset 0 -3px 0 0 #8a8c06,${shadowDepths[i]} ${shadowDepths[i]} 0 0 #8a8c06">
        <span style="font-size:38px;font-weight:900;color:rgba(255,255,255,0.75);text-shadow:0 2px 0 #8a8c06">${podiumRanks[i]}</span>
      </div>
    `;
    podiumEl.appendChild(col);
  });

  listEl.innerHTML = '';
  entries.slice(3).forEach(entry => {
    const isMe = entry.username === myUsername;
    const avatarSrc = chrome.runtime.getURL(getAvatarPath(entry.fingerColor, 'happy'));
    const row = document.createElement('div');
    row.style.cssText = `display:flex;align-items:center;gap:12px;padding:11px 14px;border-radius:16px;background:${isMe ? 'rgba(141,182,0,0.12)' : 'white'};border:2px solid ${isMe ? '#8DB600' : '#ede6d8'};box-shadow:0 1px 4px rgba(0,0,0,0.05)`;
    row.innerHTML = `
      <span style="font-size:13px;font-weight:800;color:#0F0A0A;width:18px;text-align:center;flex-shrink:0">${entry.rank}</span>
      <img src="${avatarSrc}" style="width:48px;height:48px;border-radius:50%;border:2px solid #2292A4;flex-shrink:0;object-fit:cover;background:#e0d9cf" alt="${entry.username}"/>
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:700;color:#0F0A0A;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${entry.username}${isMe ? ' (you)' : ''}</div>
        <div style="font-size:11px;color:#888;font-weight:600">LVL ${entry.level} · ${(entry.title||'').toUpperCase()}</div>
      </div>
      <div style="text-align:right;flex-shrink:0">
        <div style="font-size:14px;font-weight:800;color:#2292A4">${entry.totalXp.toLocaleString()}</div>
        <div style="font-size:10px;font-weight:700;color:#aaa;letter-spacing:0.5px">XP</div>
      </div>
    `;
    listEl.appendChild(row);
  });
}

// Small helper to show messages above the submit button
function showMessage(el, text, type) {
  el.textContent = text;
  el.className = 'ai-message ai-message-' + type;
}
// ============================================================
// Warmup tab relay — game.js (MAIN world) can't open/close tabs,
// so it fires custom events and content-script forwards them.
// ============================================================
window.addEventListener('AccessInspectorOpenWarmup', (e) => {
  chrome.runtime.sendMessage({ type: 'OPEN_WARMUP', url: e.detail.url });
});

window.addEventListener('AccessInspectorCloseWarmup', () => {
  chrome.runtime.sendMessage({ type: 'CLOSE_WARMUP' });
});

window.addEventListener('AccessInspectorBackToLobby', () => {
  chrome.runtime.sendMessage({ type: 'BACK_TO_LOBBY' });
});

// ============================================================
// Listen for messages from popup (via background.js)
// ============================================================
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SHOW_OVERLAY') {
    showOverlay(message.html);
    sendResponse({ ok: true });
    return false;
  }
  if (message.type === 'CLOSE_OVERLAY') {
    closeOverlay();
    sendResponse({ ok: true });
    return false;
  }
});