// ============================================================
// Access Inspector — background.js (service worker)
// ============================================================
// Runs in the extension's own background context.
// Has TWO jobs:
//
//   1. API REQUESTS — receive fetch requests from content-script.js
//      (forwarded from game.js), do the fetch from extension context
//      to bypass page CSP, send result back.
//
//   2. OVERLAY RELAYS — receive "show overlay" messages from the
//      popup, forward them to the active tab's content-script.
// ============================================================


chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  // ---------- JOB 1: API fetch ----------
  if (message.type === 'API_REQUEST') {
    fetch(message.url, message.options)
      .then(async (res) => {
        const text = await res.text();
        let data;
        try { data = JSON.parse(text); } catch { data = { raw: text }; }
        sendResponse({ ok: res.ok, status: res.status, data });
      })
      .catch((err) => {
        sendResponse({ ok: false, status: 0, error: err.message });
      });
    return true;  // async response
  }

  // ---------- JOB 3: Open a new tab (content scripts can't do this) ----------
  if (message.type === 'OPEN_TAB') {
    chrome.tabs.create({ url: message.url });
    return false;
  }

  // ---------- JOB 4: Start the game on the active tab ----------
  if (message.type === 'START_GAME') {
    (async () => {
      try {
        // a) Get active tab
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const url = tab?.url || '';

        // b) Block restricted pages
        const restricted = ['chrome://', 'chrome-extension://', 'edge://', 'about:', 'file://', 'chrome.google.com/webstore'];
        if (restricted.some(p => url.toLowerCase().startsWith(p))) {
          sendResponse({ ok: false, error: 'RESTRICTED_PAGE' });
          return;
        }

        // c) Get auth from storage
        const { token, username, fingerColor } = await chrome.storage.local.get(['token', 'username', 'fingerColor']);
        if (!token) { sendResponse({ ok: false, error: 'NOT_LOGGED_IN' }); return; }

        // d) API base
        const apiBase = 'https://endnote-grape-retiring.ngrok-free.dev/api';
        const tabId = tab.id;
        const extUrl = chrome.runtime.getURL('');

        // e) Inject Sa11y CSS + game filter overrides
        await chrome.scripting.insertCSS({ target: { tabId }, files: ['sa11y.css'] });
        await chrome.scripting.insertCSS({ target: { tabId }, files: ['game-override.css'] });

        // f) Set auth on the page before anything else runs
        await chrome.scripting.executeScript({
          target: { tabId, allFrames: false },
          world: 'MAIN',
          func: (auth, isPublic) => {
            window.__accessInspectorAuth = auth;
            window.__accessInspectorStartPublic = !!isPublic;
            // Allow re-injection so the public lobby startup code runs
            if (isPublic) window.__sa11yGameJsLoaded = false;
          },
          args: [{ token, username, fingerColor, apiBase, extUrl }, message.isPublic || false]
        });

        // g) Sa11y core
        await chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN', files: ['sa11y.umd.js'] });

        // h) English language pack
        await chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN', files: ['en.umd.js'] });

        // i) Initialize Sa11y (guarded so clicking Play twice is safe)
        await chrome.scripting.executeScript({
          target: { tabId },
          world: 'MAIN',
          func: () => {
            if (window.__sa11yGameStarted) return;
            window.__sa11yGameStarted = true;
            localStorage.setItem('sa11y-panel', 'closed');
            try { window.__sa11yInstance = new Sa11y.Sa11y({ checkRoot: 'body' }); }
            catch (e) { console.warn('Sa11y init error:', e.message); }
          }
        });

        // j) Inject the game logic
        await chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN', files: ['game-ui.js'] });
        await chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN', files: ['game.js'] });

        sendResponse({ ok: true });
      } catch (err) {
        console.error('START_GAME error:', err);
        sendResponse({ ok: false, error: err.message });
      }
    })();
    return true; // keep channel open for async sendResponse
  }

  // ---------- JOB 5: Open a URL in a new tab and inject the game ----------
  if (message.type === 'JOIN_AND_START') {
    const { url, auth } = message;
    // Open the target URL in a new tab
    chrome.tabs.create({ url }, (tab) => {
      // Wait for the tab to finish loading before injecting
      chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
        if (tabId !== tab.id || info.status !== 'complete') return;
        chrome.tabs.onUpdated.removeListener(listener);

        (async () => {
          const tid = tab.id;

          // Step 1: set auth + mark as joiner + pass sessionId
          const extUrl = chrome.runtime.getURL('');
          await chrome.scripting.executeScript({
            target: { tabId: tid }, world: 'MAIN',
            func: (a, sid, eu) => {
              window.__accessInspectorAuth = { ...a, extUrl: eu };
              window.__accessInspectorIsJoiner = true;
              window.__accessInspectorSessionId = sid;
            },
            args: [auth, message.sessionId, extUrl]
          });

          // Step 2: inject Sa11y only if not already on the page
          const [check] = await chrome.scripting.executeScript({
            target: { tabId: tid }, world: 'MAIN',
            func: () => !!customElements.get('sa11y-heading-label')
          });
          if (!check.result) {
            await chrome.scripting.insertCSS({ target: { tabId: tid }, files: ['sa11y.css'] });
            await chrome.scripting.executeScript({ target: { tabId: tid }, world: 'MAIN', files: ['sa11y.umd.js'] });
            await chrome.scripting.executeScript({ target: { tabId: tid }, world: 'MAIN', files: ['en.umd.js'] });
            await chrome.scripting.executeScript({
              target: { tabId: tid }, world: 'MAIN',
              func: () => {
                if (window.__sa11yGameStarted) return;
                window.__sa11yGameStarted = true;
                localStorage.setItem('sa11y-panel', 'closed');
                try { window.__sa11yInstance = new Sa11y.Sa11y({ checkRoot: 'body' }); }
                catch (e) { console.warn('Sa11y init:', e.message); }
              }
            });
          }

          // game-override.css ALWAYS injected — needed for warning filter regardless of whether Sa11y was pre-existing
          await chrome.scripting.insertCSS({ target: { tabId: tid }, files: ['game-override.css'] });

          // Step 3: inject game.js — always runs
          await chrome.scripting.executeScript({ target: { tabId: tid }, world: 'MAIN', files: ['game-ui.js'] });
          await chrome.scripting.executeScript({ target: { tabId: tid }, world: 'MAIN', files: ['game.js'] });
        })();
      });
    });
    return false;
  }

  // ---------- OPEN_WARMUP: open tutorial tab and inject game ----------
  if (message.type === 'OPEN_WARMUP') {
    const mainTabId = sender.tab?.id;
    chrome.tabs.create({ url: message.url }, (tab) => {
      chrome.storage.local.set({ warmupTabId: tab.id, warmupMainTabId: mainTabId });
      chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
        if (tabId !== tab.id || info.status !== 'complete') return;
        chrome.tabs.onUpdated.removeListener(listener);
        (async () => {
          const { token, username, fingerColor } = await chrome.storage.local.get(['token', 'username', 'fingerColor']);
          const apiBase = 'https://endnote-grape-retiring.ngrok-free.dev/api';
          const extUrl = chrome.runtime.getURL('');
          await chrome.scripting.executeScript({
            target: { tabId: tab.id }, world: 'MAIN',
            func: (auth) => { window.__accessInspectorAuth = auth; },
            args: [{ token, username, fingerColor, apiBase, extUrl }]
          });
          // Force Sa11y panel closed first (tutorial pages have Sa11y built-in)
          await chrome.scripting.executeScript({
            target: { tabId: tab.id }, world: 'MAIN',
            func: () => { localStorage.setItem('sa11y-panel', 'Closed'); }
          });

          // Only inject Sa11y if the page doesn't already have it
          const [check] = await chrome.scripting.executeScript({
            target: { tabId: tab.id }, world: 'MAIN',
            func: () => !!customElements.get('sa11y-heading-label')
          });
          if (!check.result) {
            await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ['sa11y.css'] });
            await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: 'MAIN', files: ['sa11y.umd.js'] });
            await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: 'MAIN', files: ['en.umd.js'] });
            await chrome.scripting.executeScript({
              target: { tabId: tab.id }, world: 'MAIN',
              func: () => {
                if (window.__sa11yGameStarted) return;
                window.__sa11yGameStarted = true;
                try { window.__sa11yInstance = new Sa11y.Sa11y({ checkRoot: 'body' }); }
                catch (e) { console.warn('Sa11y init:', e.message); }
              }
            });
          } else {
            // Sa11y already on page — close its panel if open
            await chrome.scripting.executeScript({
              target: { tabId: tab.id }, world: 'MAIN',
              func: () => {
                window.__sa11yGameStarted = true;
                setTimeout(() => {
                  const panel = document.querySelector('sa11y-control-panel');
                  if (!panel?.shadowRoot) return;
                  const toggle = panel.shadowRoot.querySelector('#toggle');
                  if (toggle && localStorage.getItem('sa11y-panel') === 'Open') toggle.click();
                }, 600);
              }
            });
          }
          await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: 'MAIN', files: ['game-ui.js'] });
          await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: 'MAIN', files: ['game.js'] });
        })();
      });
    });
    return false;
  }

  // ---------- CLOSE_WARMUP: close the warmup tab ----------
  if (message.type === 'CLOSE_WARMUP') {
    chrome.storage.local.get(['warmupTabId'], ({ warmupTabId }) => {
      if (warmupTabId) {
        chrome.tabs.remove(warmupTabId, () => {});
        chrome.storage.local.remove(['warmupTabId', 'warmupMainTabId']);
      }
    });
    return false;
  }

  // ---------- BACK_TO_LOBBY: close warmup tab and focus main tab ----------
  if (message.type === 'BACK_TO_LOBBY') {
    chrome.storage.local.get(['warmupTabId', 'warmupMainTabId'], ({ warmupTabId, warmupMainTabId }) => {
      if (warmupMainTabId) chrome.tabs.update(warmupMainTabId, { active: true });
      if (warmupTabId) chrome.tabs.remove(warmupTabId, () => {});
      chrome.storage.local.remove(['warmupTabId', 'warmupMainTabId']);
    });
    return false;
  }

  // ---------- JOB 2: Forward overlay command to active tab ----------
  if (message.type === 'OVERLAY_COMMAND') {
    // Get the currently active tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0] || !tabs[0].id) {
        sendResponse({ ok: false, error: 'No active tab.' });
        return;
      }
      // Forward to the content script on that tab
      chrome.tabs.sendMessage(tabs[0].id, message.payload, (response) => {
        sendResponse(response || { ok: false, error: chrome.runtime.lastError?.message });
      });
    });
    return true;  // async response
  }
});