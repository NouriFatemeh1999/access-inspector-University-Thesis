// ============================================================
// game-ui.js — HTML template functions for Access Inspector
// Injected before game.js. Exposes window.__gameUI.* for game.js to call.
// ============================================================

window.__gameUI = {

  // Top progress bar + timer strip injected at top of page
  createHUDContainer() {
    const container = document.createElement('div');
    container.id = 'game-ui';
    container.innerHTML = `
      <div style="
        position: fixed;
        top: 0; left: 0; right: 0;
        background: #FAF3E7;
        border-radius: 12px;
        color: #0F0A0A;
        padding: 10px 20px;
        font-family: sans-serif;
        font-size: 14px;
        z-index: 99999;
        display: flex;
        margin: 10px;
        align-items: center;
        gap: 16px;
        pointer-events: none;
      ">
        <strong>Access Inspector</strong>
        <div id="game-progress-track" style="flex:1; display:flex; flex-direction:column; gap:6px; padding:2px 0;">
          <div style="display:flex; align-items:center; gap:8px;">
            <div style="flex:1; background:rgba(255,255,255,0.18); border-radius:20px; overflow:hidden; height:12px; box-shadow:inset 0 1px 3px rgba(0,0,0,0.25);">
              <div id="game-progress-bar" style="
                width: 0%;
                height: 100%;
                border-radius: 20px;
                transition: width 0.3s;
                box-shadow: inset 0 1px 0 rgba(255,255,255,0.45);
              "></div>
            </div>
            <span id="game-progress-label" style="font-size:11px; font-weight:700; color:#0F0A0A; min-width:32px; text-align:right;">0/0</span>
          </div>
        </div>
        <span id="game-timer" style="
          pointer-events:none; font-size:13px; font-weight:700;
          color:#0F0A0A; background:rgba(255,255,255,0.15);
          border-radius:8px; padding:3px 10px; display:none;
        ">⏱ –:––</span>
        <span id="game-budget" style="
          pointer-events:none; font-size:12px; font-weight:700;
          color:#0F0A0A; background:rgba(255,255,255,0.15);
          border-radius:8px; padding:3px 10px; display:none;
          white-space:nowrap;
        ">🔍 10 extra</span>
      </div>
    `;
    return container;
  },

  // Solo results overlay HTML
  soloResultsHTML({ score, correct, missed, candidates, fingerColor, mood, extUrl }) {
    const xp = Math.max(0, score);
    const svgStar = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"><g fill="none" stroke-width="1.5"><path d="M10.577 8.704C11.21 7.568 11.527 7 12 7s.79.568 1.423 1.704l.164.294c.18.323.27.484.41.59c.14.107.316.147.665.226l.318.072c1.23.278 1.845.417 1.991.888c.147.47-.273.96-1.111 1.941l-.217.254c-.238.278-.357.418-.41.59c-.055.172-.037.358 0 .73l.032.338c.127 1.308.19 1.962-.193 2.253c-.383.29-.958.026-2.11-.504l-.298-.138c-.327-.15-.49-.226-.664-.226c-.173 0-.337.076-.664.226l-.298.138c-1.152.53-1.727.795-2.11.504c-.383-.29-.32-.945-.193-2.253l.032-.338c.037-.372.055-.558 0-.73c-.053-.172-.172-.312-.41-.59l-.217-.254c-.838-.98-1.258-1.47-1.111-1.941c.146-.47.76-.61 1.99-.888l.319-.072c.35-.08.524-.119.665-.225c.14-.107.23-.268.41-.59z"/><path stroke-linecap="round" d="M12 2v2m0 16v2M2 12h2m16 0h2" opacity=".5"/><path stroke-linecap="round" d="m6 18l.343-.343M17.657 6.343L18 6m0 12l-.343-.343M6.343 6.343L6 6"/></g></svg>`;
    const svgCheck = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"><path fill="#22334A" fill-rule="evenodd" d="M20.8 6.2a.75.75 0 0 1 .04 1.06l-9.75 10.5a.75.75 0 0 1-1.117-.02l-4.75-5.5a.753.753 0 0 1 1.137-.983l4.2 4.87l9.18-9.89a.75.75 0 0 1 1.06-.039z" clip-rule="evenodd"/></svg>`;
    const svgAlert = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"><path fill="#22334A" d="M13 17.5a1 1 0 1 1-2 0a1 1 0 0 1 2 0m-.25-8.25a.75.75 0 0 0-1.5 0v4.5a.75.75 0 0 0 1.5 0z"/><path fill="#22334A" d="M9.836 3.244c.963-1.665 3.365-1.665 4.328 0l8.967 15.504c.963 1.667-.24 3.752-2.165 3.752H3.034c-1.926 0-3.128-2.085-2.165-3.752Zm3.03.751a1.002 1.002 0 0 0-1.732 0L2.168 19.499A1.002 1.002 0 0 0 3.034 21h17.932a1.002 1.002 0 0 0 .866-1.5L12.866 3.994Z"/></svg>`;
    const message = score > 20 ? 'Nice catch!' : score > 0 ? 'Keep Trying!' : 'OOPS!';
    return `
      <div class="ai-results-card ai-results-card--solo">
        ${extUrl ? `<div class="ai-results-avatar"><img src="${extUrl}icons/avatars/${fingerColor}-${mood}.svg" onerror="this.style.display='none'"/></div>` : ''}
        <h2 class="ai-results-title">${message}</h2>
        <div class="ai-results-stats">
          <div class="ai-results-stat-row">
            <span class="ai-results-stat-label">${svgStar} Total XP</span>
            <span class="ai-results-stat-value">${xp} XP</span>
          </div>
          <div class="ai-results-stat-row">
            <span class="ai-results-stat-label">${svgCheck} Issue Found</span>
            <span class="ai-results-stat-value">${correct}</span>
          </div>
          <div class="ai-results-stat-row">
            <span class="ai-results-stat-label">${svgAlert} Issue missed</span>
            <span class="ai-results-stat-value">${missed}</span>
          </div>
          ${candidates > 0 ? `
          <div style="border-top:1px dashed #ddd;margin-top:4px;padding-top:8px">
            <div class="ai-results-stat-row">
              <span class="ai-results-stat-label">🔍 New issues flagged</span>
              <span class="ai-results-stat-value" style="color:#FF6500">${candidates}</span>
            </div>
            <div style="margin-top:5px;padding:8px 10px;background:rgba(189,191,9,0.12);border-radius:8px;border-left:3px solid #BDBF09">
              <span style="font-size:11px;color:#5a5a1a;line-height:1.5">🌱 Pending reward: <strong>+${candidates * 2} XP</strong> if the community confirms your ${candidates === 1 ? 'discovery' : `${candidates} discoveries`}.</span>
            </div>
          </div>` : ''}
        </div>
        <button id="ai-results-close" class="ai-results-btn">Done</button>
      </div>
    `;
  },

  // Multiplayer results overlay HTML
  multiResultsHTML({ players, extUrl }) {
    if (!players || players.length === 0) {
      return `<div class="ai-results-card ai-results-card--multi" style="text-align:center">
        <h2 class="ai-results-title ai-results-title--multi">⏳ Calculating results…</h2>
        <p style="font-family:'Fraunces',Georgia,serif;color:#555;margin-bottom:20px">Waiting for all players to finish.</p>
        <button id="ai-results-close" class="ai-results-btn ai-results-btn--full">Close</button>
      </div>`;
    }
    const sorted = [...players].sort((a, b) => Math.max(0, b.finalScore || 0) - Math.max(0, a.finalScore || 0));
    const topScore = Math.max(0, sorted[0]?.finalScore || 0);
    const isTie = sorted.every(p => Math.max(0, p.finalScore || 0) === topScore);
    const rankLabel = ['Winner', '2nd', '3rd', '4th'];
    return `
      <div class="ai-results-card ai-results-card--multi">
        <h2 class="ai-results-title ai-results-title--multi">${isTie ? "It's a tie!" : 'Nice match!'}</h2>
        ${sorted.map((p, i) => `
          <div class="ai-results-player">
            <div class="ai-results-player-avatar${!isTie && i === 0 ? ' ai-results-player-avatar--winner' : ''}">
              ${extUrl ? `<img src="${extUrl}icons/avatars/${p.fingerColor||'peach'}-${p.mood||'happy'}.svg" onerror="this.style.display='none'"/>` : ''}
            </div>
            <div class="ai-results-player-info">
              ${!isTie ? `<div class="ai-results-player-rank">${rankLabel[i] || i + 1}</div>` : ''}
              <div class="ai-results-player-name${!isTie && i === 0 ? ' ai-results-player-name--winner' : ''}">${p.username}</div>
            </div>
            <div class="ai-results-player-xp">+${Math.max(0, p.finalScore || 0)} XP</div>
          </div>
        `).join('')}
        <button id="ai-results-close" class="ai-results-btn ai-results-btn--full">Continue</button>
      </div>
    `;
  },

  // Lobby overlay HTML
  lobbyOverlayHTML({ isHost }) {
    return `
      <div style="background:#FAF3E7;border-radius:24px;padding:32px 28px;width:340px;max-width:92vw;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.4)">
        <div style="font-size:11px;font-weight:700;color:#FF6500;letter-spacing:1.5px;margin-bottom:8px">MULTIPLAYER LOBBY</div>
        <h2 style="font-size:22px;font-weight:800;color:#0F0A0A;font-style:italic;margin-bottom:4px">Game starting in</h2>
        <div id="ai-lobby-countdown" style="font-size:64px;font-weight:900;color:#0F0A0A;line-height:1;margin-bottom:20px">–</div>
        <div id="ai-lobby-players" style="margin-bottom:20px;text-align:center"></div>
        <button id="ai-lobby-warmup" style="width:100%;background:#BDBF09;color:#0F0A0A;border:none;border-radius:12px;padding:12px 16px;font-size:14px;font-weight:700;cursor:pointer;font-family:Fraunces;margin-bottom:10px;box-shadow: 0 4px 0 0 #97990A;transition: transform 0.1s, box-shadow 0.1s;">Warm up with a tutorial!</button>
        ${isHost
          ? `<button id="ai-lobby-start" style="width:100%;background:#FF6500;color:#0F0A0A;border:none;border-radius:12px;padding:12px 16px;font-size:14px;font-weight:700;cursor:pointer;font-family:Fraunces; box-shadow: 0 4px 0 0 #AC4501;transition: transform 0.1s, box-shadow 0.1s;">▶ Start Now</button>`
          : `<div style="font-size:12px;color:#0F0A0A;margin-top:4px">Waiting for host to start…</div>`}
        <div id="ai-lobby-msg" style="font-size:12px;color:#0F0A0A;margin-top:12px;min-height:16px"></div>
      </div>
    `;
  },

  // Single player row inside lobby player list
  lobbyPlayerRowHTML({ username, fingerColor, mood, extUrl }) {
    return `
      <div style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid rgba(34,51,74,0.08)">
        <div style="width:34px;height:34px;border-radius:50%;background:#e0d0c0;border:2px solid #22334A;overflow:hidden;flex-shrink:0">
          ${extUrl ? `<img src="${extUrl}icons/avatars/${fingerColor||'peach'}-${mood||'happy'}.svg" style="width:100%;height:100%;object-fit:cover" onerror="this.style.display='none'"/>` : ''}
        </div>
        <span style="font-size:14px;font-weight:600;color:#22334A">${username}</span>
      </div>
    `;
  },

  // Warmup panel HTML (shown during warmup round)
  warmupPanelHTML() {
    return `
      <div style="font-size:11px;font-weight:700;color:#e07b5a;letter-spacing:1px;margin-bottom:4px">🔥 WARMUP ROUND</div>
      <div style="font-size:12px;color:rgba(255,255,255,0.7);margin-bottom:6px">Lobby starts in <span id="ai-warmup-countdown" style="font-weight:700;color:white">–</span>s</div>
      <button id="ai-warmup-back" style="background:#e07b5a;color:white;border:none;border-radius:8px;padding:6px 12px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;width:100%">← Back to Lobby</button>
    `;
  },

  // Warmup panel "game started" state HTML
  warmupStartedHTML() {
    return `
      <div style="font-size:13px;font-weight:700;color:#e07b5a">⚡ Multiplayer starting!</div>
      <div style="font-size:12px;color:rgba(255,255,255,0.8);margin-top:4px">Switch to your other tab.</div>
      <button id="ai-warmup-back" style="background:#e07b5a;color:white;border:none;border-radius:8px;padding:6px 12px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;width:100%;margin-top:8px">← Go to game</button>
    `;
  },

};
