// ============================================================
// Access Inspector — popup.js (launcher menu)
// ============================================================
const API_BASE = 'https://endnote-grape-retiring.ngrok-free.dev/api';
const COLORS = ['peach', 'teal', 'orange', 'yellow', 'purple'];
const DEFAULT_COLOR = 'peach';
const MOODS = ['confident', 'happy', 'worried', 'pokerface'];

const SVG = (path) => `<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" width="22" height="22">${path}</svg>`;

const TUTORIALS = [
  { icon: SVG('<polygon points="5 3 19 12 5 21 5 3"/>'),                                                                                                                                          color: '#2292A4', shadow: '#176e7d', title: 'Start Here',          desc: 'Mixed page — great first try',    url: 'https://endnote-grape-retiring.ngrok-free.dev/sa11y-demo/demo/en/index.html' },
  { icon: SVG('<circle cx="12" cy="12" r="9"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>'),                                                                    color: '#DB062D', shadow: '#9e0420', title: 'Spot the Errors',     desc: 'Serious issues like missing alt', url: 'https://endnote-grape-retiring.ngrok-free.dev/sa11y-demo/demo/en/errors.html' },
  { icon: SVG('<path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>'), color: '#BDBF09', shadow: '#8a8c06', title: 'Spot the Warnings', desc: 'Subtler quality issues',          url: 'https://endnote-grape-retiring.ngrok-free.dev/sa11y-demo/demo/en/warnings.html' },
  { icon: SVG('<circle cx="12" cy="12" r="9"/><polyline points="9 12 11 14 15 10"/>'),                                                                                                           color: '#8DB600', shadow: '#628000', title: 'Clean Page',          desc: 'No issues — can you resist?',    url: 'https://endnote-grape-retiring.ngrok-free.dev/sa11y-demo/demo/en/pass.html' },
  { icon: SVG('<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>'),                                                                                                  color: '#D96C06', shadow: '#a64e04', title: 'Other Issues',        desc: 'Miscellaneous a11y practice',    url: 'https://endnote-grape-retiring.ngrok-free.dev/sa11y-demo/demo/en/other.html' }
];

// ── View routing ─────────────────────────────────────────────
const ALL_VIEWS = ['main-view','login-view','signup-view','tutorials-view','join-view'];

function showView(id) {
  ALL_VIEWS.forEach(v => {
    document.getElementById(v).style.display = v === id ? 'block' : 'none';
  });
}

async function showOverlayOnPage(html) {
  // Make sure there's a usable tab first
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url.startsWith('edge://') || tab.url.startsWith('about:')) {
    alert('Please open a regular webpage first, then try again.');
    return;
  }

  const result = await chrome.runtime.sendMessage({
    type: 'OVERLAY_COMMAND',
    payload: { type: 'SHOW_OVERLAY', html }
  });
  if (result && result.ok) {
    window.close();
  } else {
    alert('Could not open overlay. Try refreshing the page and clicking again.');
  }
}

function buildProfileOverlayHtml() {
  return `
    <div class="ai-overlay-body" style="padding:16px;padding-top:32px;background:#FAF3E7;min-height:100%">
      <div style="background:#FFFFFF;border-radius:18px;padding:16px;display:flex;align-items:center;gap:14px;margin-bottom:18px;box-shadow:0 2px 8px rgba(0,0,0,0.06)">
        <div style="width:110px;height:110px;border-radius:50%;overflow:hidden;flex-shrink:0;background:#e0d0c0">
          <img id="ai-profile-avatar" src="" alt="Your avatar" style="width:100%;height:100%;object-fit:cover;display:block;"/>
        </div>
        <div style="flex:1;min-width:0">
          <div id="ai-profile-username" style="font-size:18px;font-weight:800;color:#0F0A0A;font-style:italic">…</div>
          <div id="ai-profile-level" style="font-size:11px;font-weight:700;color:#2292A4;letter-spacing:0.8px;margin-bottom:8px">LVL … · …</div>
          <div style="height:8px;background:#FAF3E7;border-radius:10px;overflow:hidden;margin-bottom:5px">
            <div id="ai-profile-xp-fill" style="height:100%;background:#BDBF09;border-radius:10px;width:0%;transition:width 0.6s ease"></div>
          </div>
          <div id="ai-profile-xp-text" style="font-size:10px;color:#888;font-weight:600">… / … XP</div>
        </div>
      </div>
      <div style="display:flex;margin-bottom:14px;border-bottom:2px solid #ddd">
        <div style="font-size:11px;font-weight:700;color:#0F0A0A;letter-spacing:0.8px;padding-bottom:8px;border-bottom:2px solid #8DB600;margin-bottom:-2px;margin-right:20px">DASHBOARD</div>
      </div>
      <div style="background:#FFFFFF;border-radius:14px;overflow:hidden;box-shadow:0 2px 6px rgba(0,0,0,0.05);margin-bottom:14px">
        ${[['Issues found','ai-stat-issues'],['Sites visited','ai-stat-sites'],['Total XP','ai-stat-xp'],['Rank','ai-stat-rank']]
          .map(([label, id], i, arr) => `
            <div style="display:flex;align-items:center;justify-content:space-between;padding:13px 16px;${i<arr.length-1?'border-bottom:1px solid #ede6d8;':''}">
              <span style="font-size:13px;color:#444">${label}</span>
              <span id="${id}" style="font-size:13px;font-weight:800;color:#0F0A0A">…</span>
            </div>`).join('')}
      </div>
      <div style="display:flex;gap:10px">
        <div style="flex:1;background:#2292A4;border-radius:18px;padding:14px 12px;text-align:center;">
          <div style="font-size:10px;font-weight:700;color:rgba(255,255,255,0.75);letter-spacing:0.8px;margin-bottom:4px">RANK</div>
          <div id="ai-chip-rank" style="font-size:22px;font-weight:900;color:#fff">…</div>
        </div>
        <div style="flex:1;background:#D96C06;border-radius:18px;padding:14px 12px;text-align:center;">
          <div style="font-size:10px;font-weight:700;color:rgba(255,255,255,0.75);letter-spacing:0.8px;margin-bottom:4px">TOTAL XP</div>
          <div id="ai-chip-xp" style="font-size:22px;font-weight:900;color:#fff">…</div>
        </div>
      </div>
    </div>
  `;
}

function buildLeaderboardOverlayHtml() {
  return `
    <div style="background:#FAF3E7;padding:20px 16px 0">
      <div style="text-align:center;font-size:18px;font-weight:800;color:#0F0A0A;margin-bottom:20px">🏆 Leaderboard</div>
      <div id="ai-lb-podium" style="display:flex;align-items:flex-end;justify-content:center;min-height:170px">
        <p style="color:#888;font-size:13px;align-self:center;width:100%;text-align:center">Loading…</p>
      </div>
    </div>
    <div class="ai-overlay-body" style="padding:14px 14px 16px;background:#FAF3E7">
      <div id="ai-leaderboard-list" style="display:flex;flex-direction:column;gap:8px"></div>
    </div>
  `;
}

// ── Auth state helpers ────────────────────────────────────────
async function getToken()    { return (await chrome.storage.local.get(['token'])).token || null; }

async function refreshUI() {
  const { token, username, fingerColor } = await chrome.storage.local.get(['token', 'username', 'fingerColor']);
  const loggedIn = !!username;

  document.getElementById('loggedin-actions').style.display  = loggedIn ? 'block' : 'none';
  document.getElementById('user-bar').style.display          = loggedIn ? 'flex'  : 'none';
  document.getElementById('header-loggedout').style.display  = loggedIn ? 'none'  : 'block';
  document.getElementById('btn-logout').style.display        = loggedIn ? 'inline': 'none';

  if (loggedIn) {
    const color = fingerColor || DEFAULT_COLOR;
    document.getElementById('header-avatar').src = chrome.runtime.getURL(`icons/avatars/${color}-happy.svg`);
    document.getElementById('header-subtitle').textContent = `Hi ${username} — ready to hunt?`;
    document.getElementById('stats-row').style.display = 'flex';
    document.getElementById('quest-box').style.display = 'block';

    // Open games badge
    try {
      const res = await fetch(`${API_BASE}/sessions/open`, { headers: { 'ngrok-skip-browser-warning': 'true' } });
      const data = await res.json();
      const count = data.sessions?.length || 0;
      const badge = document.getElementById('open-games-badge');
      badge.textContent = count;
      badge.style.display = count > 0 ? 'inline-block' : 'none';
    } catch (_) {}

    // XP + streak + quest
    try {
      const res = await fetch(`${API_BASE}/profile`, {
        headers: { 'Authorization': `Bearer ${token}`, 'ngrok-skip-browser-warning': 'true' }
      });
      const data = await res.json();

      document.getElementById('stat-xp').textContent = (data.totalXp || 0).toLocaleString();

      const today = new Date().toISOString().slice(0, 10);
      const stored = await chrome.storage.local.get(['streakDate', 'streakCount']);
      let streak = stored.streakCount || 0;
      if (data.todayXp > 0) {
        const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
        if (stored.streakDate === today) {
          // already counted today, keep streak
        } else if (stored.streakDate === yesterday) {
          streak += 1;
        } else {
          streak = 1;
        }
        await chrome.storage.local.set({ streakDate: today, streakCount: streak });
      } else if (stored.streakDate && stored.streakDate < today) {
        const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
        if (stored.streakDate < yesterday) { streak = 0; await chrome.storage.local.set({ streakCount: 0 }); }
      }
      document.getElementById('stat-streak').textContent = streak;

      const QUEST_GOAL = 5;
      const issuesFound = Math.min(Math.round((data.todayXp || 0) / 10), QUEST_GOAL);
      document.getElementById('quest-progress').textContent = `${issuesFound} / ${QUEST_GOAL}`;
      document.getElementById('quest-bar').style.width = `${Math.round(issuesFound / QUEST_GOAL * 100)}%`;

      const xpBadge = document.getElementById('xp-today-badge');
      if (xpBadge) xpBadge.style.display = 'none';
    } catch (_) {}
  } else {
    document.getElementById('stats-row').style.display = 'none';
    document.getElementById('quest-box').style.display = 'none';
  }
}

// ── Tutorials view ───────────────────────────────────────────
function renderTutorials() {
  const list = document.getElementById('tut-list');
  if (list.children.length > 0) return; // already rendered
  TUTORIALS.forEach(t => {
    const card = document.createElement('div');
    card.className = 'tut-card';
    card.innerHTML = `
      <div class="tut-icon-circle" style="background:${t.color}">
        ${t.icon}
      </div>
      <div class="tut-text">
        <div class="tut-title">${t.title}</div>
        <div class="tut-desc">${t.desc}</div>
      </div>
      <span class="tut-chevron">›</span>
    `;
    card.addEventListener('click', () => {
      chrome.tabs.create({ url: t.url });
      window.close();
    });
    list.appendChild(card);
  });
}

// ── Join Game view ───────────────────────────────────────────
async function loadJoinGame() {
  const sessionsEl = document.getElementById('join-sessions');
  const msgEl      = document.getElementById('join-msg');
  sessionsEl.innerHTML = '<p style="font-size:13px;color:#888">Loading…</p>';
  msgEl.textContent = '';

  const { token, fingerColor: myColor } = await chrome.storage.local.get(['token', 'fingerColor']);

  try {
    const res = await fetch(`${API_BASE}/sessions/open`, { headers: { 'ngrok-skip-browser-warning': 'true' } });
    const data = await res.json();
    const sessions = data.sessions || [];

    if (sessions.length === 0) {
      sessionsEl.innerHTML = '<p style="font-size:13px;color:#888;text-align:center;padding:10px 0">No open games right now.</p>';
      return;
    }

    sessionsEl.innerHTML = '';
    sessions.forEach(session => {
      const urlLabel = (() => { try { return new URL(session.targetUrl).pathname.toUpperCase(); } catch { return session.targetUrl.toUpperCase(); } })();
      const avatarSrc = chrome.runtime.getURL(`icons/avatars/${session.hostFingerColor || 'peach'}-happy.svg`);
      const card = document.createElement('div');
      card.className = 'join-card';
      card.innerHTML = `
        <div class="join-card-top">
          <img class="join-card-avatar" src="${avatarSrc}" alt="${session.hostUsername}"/>
          <div class="join-card-info">
            <div class="join-card-title">${session.hostUsername}'s game</div>
            <div class="join-card-sub">${urlLabel}</div>
          </div>
          <div class="join-card-count">${session.playerCount}/${session.maxPlayers || 4}</div>
        </div>
        <button class="join-btn">JOIN</button>
      `;
      card.querySelector('button').addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true; btn.textContent = '…';
        const joinRes = await fetch(`${API_BASE}/sessions/${session.id}/join`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'ngrok-skip-browser-warning': 'true' }
        });
        if (joinRes.ok) {
          await chrome.storage.local.set({ activeSession: { sessionId: session.id, targetUrl: session.targetUrl } });
          const { username, fingerColor } = await chrome.storage.local.get(['username', 'fingerColor']);
          chrome.runtime.sendMessage({
            type: 'JOIN_AND_START',
            url: session.targetUrl,
            sessionId: session.id,
            auth: { token, username, fingerColor, apiBase: API_BASE }
          });
          window.close();
        } else {
          const err = await joinRes.json().catch(() => ({}));
          msgEl.textContent = err.error || 'Could not join.';
          btn.disabled = false; btn.textContent = 'JOIN';
        }
      });
      sessionsEl.appendChild(card);
    });
  } catch (_) {
    sessionsEl.innerHTML = '<p style="font-size:13px;color:#DB062D">Could not load games.</p>';
  }
}

// ── Navigation ───────────────────────────────────────────────
document.getElementById('btn-login').addEventListener('click',  () => showView('login-view'));
document.getElementById('btn-signup').addEventListener('click', () => showView('signup-view'));
document.getElementById('login-back').addEventListener('click',  () => showView('main-view'));
document.getElementById('signup-back').addEventListener('click', () => showView('main-view'));
document.getElementById('il-to-signup').addEventListener('click', () => showView('signup-view'));

document.getElementById('btn-back-tutorials').addEventListener('click', () => showView('main-view'));
document.getElementById('btn-back-join').addEventListener('click',       () => showView('main-view'));

document.getElementById('btn-profile').addEventListener('click', () => {
  showOverlayOnPage(buildProfileOverlayHtml());
});
document.getElementById('btn-leaderboard').addEventListener('click', () => {
  showOverlayOnPage(buildLeaderboardOverlayHtml());
});
document.getElementById('btn-tutorials').addEventListener('click', () => {
  showView('tutorials-view');
  renderTutorials();
});
document.getElementById('btn-join-game').addEventListener('click', () => {
  showView('join-view');
  loadJoinGame();
});

document.getElementById('btn-host-game').addEventListener('click', async () => {
  const result = await chrome.runtime.sendMessage({ type: 'START_GAME', isPublic: true });
  if (result?.ok) {
    window.close();
  } else {
    document.getElementById('join-msg').textContent =
      result?.error === 'RESTRICTED_PAGE' ? 'Open the page you want to test first.' :
      result?.error === 'NOT_LOGGED_IN'   ? 'Please log in first.' :
      'Could not start: ' + (result?.error || 'unknown error');
  }
});

// ── Login form ───────────────────────────────────────────────
document.getElementById('il-submit').addEventListener('click', async () => {
  const username = document.getElementById('il-username').value.trim();
  const password = document.getElementById('il-password').value;
  const msg = document.getElementById('il-msg');
  msg.textContent = '';
  if (!username || !password) { msg.textContent = 'Please fill in all fields.'; return; }
  try {
    const res = await fetch(`${API_BASE}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (!res.ok) { msg.textContent = data.error || 'Login failed.'; return; }
    await chrome.storage.local.set({ token: data.token, username: data.username, fingerColor: data.fingerColor });
    showView('main-view');
    refreshUI();
  } catch (e) { msg.textContent = 'Network error.'; }
});

// ── Signup form ──────────────────────────────────────────────
const COLOR_MAP = { peach:'#FFB38E', teal:'#2292A4', orange:'#FF6500', yellow:'#BDBF09', purple:'#a78bca' };
let selectedSignupColor = DEFAULT_COLOR;

const colorPicker = document.getElementById('is-color-picker');
COLORS.forEach(c => {
  const btn = document.createElement('button');
  btn.className = 'auth-color-dot' + (c === DEFAULT_COLOR ? ' selected' : '');
  btn.style.background = COLOR_MAP[c] || '#ccc';
  btn.dataset.color = c;
  btn.addEventListener('click', () => {
    selectedSignupColor = c;
    document.getElementById('is-avatar').src = chrome.runtime.getURL(`icons/avatars/${c}-happy.svg`);
    document.querySelectorAll('.auth-color-dot').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
  });
  colorPicker.appendChild(btn);
});
document.getElementById('is-avatar').src = chrome.runtime.getURL(`icons/avatars/${DEFAULT_COLOR}-happy.svg`);

document.getElementById('is-submit').addEventListener('click', async () => {
  const username = document.getElementById('is-username').value.trim();
  const email    = document.getElementById('is-email').value.trim();
  const password = document.getElementById('is-password').value;
  const msg = document.getElementById('is-msg');
  msg.textContent = '';
  if (!username || !email || !password) { msg.textContent = 'Please fill in all fields.'; return; }
  try {
    const res = await fetch(`${API_BASE}/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
      body: JSON.stringify({ username, email, password, fingerColor: selectedSignupColor })
    });
    const data = await res.json();
    if (!res.ok) { msg.textContent = data.error || 'Signup failed.'; return; }
    await chrome.storage.local.set({ token: data.token, username: data.username, fingerColor: data.fingerColor });
    showView('main-view');
    refreshUI();
  } catch (e) { msg.textContent = 'Network error.'; }
});

// ── Play buttons ─────────────────────────────────────────────
async function handlePlay(isPublic) {
  const btn      = document.getElementById(isPublic ? 'btn-play-public' : 'btn-play');
  const otherBtn = document.getElementById(isPublic ? 'btn-play' : 'btn-play-public');
  const errEl    = document.getElementById('play-error');
  errEl.style.display = 'none';
  btn.disabled = true; otherBtn.disabled = true;
  btn.querySelector('.btn-play-left').lastChild.textContent = ' Starting…';

  const result = await chrome.runtime.sendMessage({ type: 'START_GAME', isPublic });

  if (result?.ok) {
    window.close();
  } else {
    btn.disabled = false; otherBtn.disabled = false;
    btn.querySelector('.btn-play-left').lastChild.textContent = isPublic ? ' Play as a hand' : ' Play as a finger';
    if (result?.error === 'NOT_LOGGED_IN') {
      errEl.textContent = 'Please log in first.';
    } else if (result?.error === 'RESTRICTED_PAGE') {
      errEl.textContent = 'Open the page you want to test in another tab first.';
    } else {
      errEl.textContent = 'Could not start: ' + (result?.error || 'unknown error');
    }
    errEl.style.display = 'block';
  }
}

document.getElementById('btn-play').addEventListener('click',        () => handlePlay(false));
document.getElementById('btn-play-public').addEventListener('click', () => handlePlay(true));

document.getElementById('btn-logout').addEventListener('click', async () => {
  await chrome.storage.local.remove(['token', 'username', 'fingerColor']);
  refreshUI();
});

refreshUI();
