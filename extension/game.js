// If re-injected for a public game, reset the guard so the full init runs again.
if (window.__sa11yGameJsLoaded && window.__accessInspectorStartPublic && !window.__publicSessionId) {
  window.__sa11yGameJsLoaded = false;
}

if (window.__sa11yGameJsLoaded) {
  console.log('Game already loaded!');
} else {
  window.__sa11yGameJsLoaded = true;

  const userClicks = new Map();
  const TOTAL_USERS = 2;
  let totalIssues = 0;
  let gameRevealed = false;

  // Click budget: user gets MAX 10 candidate clicks (non-Sa11y elements)
  const CANDIDATE_BUDGET = 10;
  let candidateBudgetUsed = 0;

  // ============================================================
  // SCORE SAVING — Access Inspector backend integration
  // ============================================================
  // popup.js injects `window.__accessInspectorAuth = { token, username, apiBase }`
  // into the page BEFORE this file runs. If a token is present, we save
  // the score automatically. If not (guest mode), we skip silently.
  // ============================================================
async function saveScoreToBackend(score, correct, wrong, missed) {
  const auth = window.__accessInspectorAuth;
  if (!auth || !auth.token) {
    console.log('No auth token — playing as guest, score not saved.');
    return;
  }

  // Send a request via the content-script bridge
  const requestId = 'req_' + Date.now() + '_' + Math.random();

  // Wait for the response with the matching requestId
  const responsePromise = new Promise((resolve) => {
    function handler(event) {
      if (event.detail.requestId !== requestId) return;
      window.removeEventListener('AccessInspectorResponse', handler);
      resolve(event.detail.result);
    }
    window.addEventListener('AccessInspectorResponse', handler);
  });

  // Dispatch the request event
  window.dispatchEvent(new CustomEvent('AccessInspectorRequest', {
    detail: {
      requestId,
      url: `${auth.apiBase}/scores`,
      options: {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${auth.token}`,
          'ngrok-skip-browser-warning': 'true'
        },
        body: JSON.stringify({
          score, correct, wrong, missed,
          page_url: window.location.href
        })
      }
    }
  }));

  const result = await responsePromise;
  if (result && result.ok) {
    console.log('✓ Score saved to backend');
    showSaveBadge('✓ Score saved!');
  } else {
    console.warn('Score save failed:', result && (result.error || result.status));
    showSaveBadge('⚠️ Score not saved');
  }
}

// Small badge that appears briefly next to the score
  function showSaveBadge(text) {
    const label = document.getElementById('game-progress-label');
    if (!label) return;
    const badge = document.createElement('span');
    badge.textContent = ' ' + text;
    badge.style.cssText = 'margin-left:8px;font-size:12px;opacity:0.9;';
    label.appendChild(badge);
    setTimeout(() => badge.remove(), 4000);
  }

  // ============================================================
  // VISUAL CLICK FEEDBACK (yellow → red → undo)
  // ============================================================
  function updateColor(el) {
    const count = userClicks.get(el) || 0;

    function getOverflowParents(element) {
      const parents = [];
      let parent = element.parentElement;
      while (parent && parent !== document.body) {
        const overflow = window.getComputedStyle(parent).overflow;
        if (overflow === 'hidden' || overflow === 'clip') {
          parents.push(parent);
        }
        parent = parent.parentElement;
      }
      return parents.length > 0 ? parents : [element];
    }

    const parents = getOverflowParents(el);
    const mainTarget = parents[0] || el;

    if (count === 0) {
      // Restore the hint ring if this element is in scope
      const fMap = window.__filteredMap;
      const type = fMap && fMap.get(el);
      if (type) {
        el.style.removeProperty('outline');
        el.style.removeProperty('outline-offset');
      } else {
        el.style.removeProperty('outline');
        el.style.removeProperty('box-shadow');
      }
      parents.forEach(p => {
        p.style.removeProperty('outline');
        p.style.removeProperty('box-shadow');
        p.style.removeProperty('overflow');
      });
    } else if (count === 1) {
      parents.forEach(p => {
        p.style.setProperty('overflow', 'visible', 'important');
      });
      mainTarget.style.setProperty('outline', '5px solid yellow', 'important');
      mainTarget.style.setProperty('box-shadow', '0 0 0 5px yellow', 'important');
    } else {
      parents.forEach(p => {
        p.style.setProperty('overflow', 'visible', 'important');
      });
      mainTarget.style.setProperty('outline', '5px solid red', 'important');
      mainTarget.style.setProperty('box-shadow', '0 0 0 5px red', 'important');
    }
  }

  function updateBudget() {
    const el = document.getElementById('game-budget');
    if (!el) return;
    const remaining = CANDIDATE_BUDGET - candidateBudgetUsed;
    el.style.display = 'inline';
    el.textContent = `🔍 ${remaining} extra`;
    el.style.background = remaining <= 3
      ? 'rgba(219,6,45,0.15)'   // red tint when almost out
      : 'rgba(255,255,255,0.15)';
  }

  function showBudgetToast() {
    if (document.getElementById('ai-budget-toast')) return;
    const toast = document.createElement('div');
    toast.id = 'ai-budget-toast';
    toast.textContent = '🔍 Extra click budget reached (10/10)';
    toast.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#22334A;color:white;padding:10px 18px;border-radius:12px;font-weight:700;font-size:13px;z-index:9999999;font-family:sans-serif;pointer-events:none';
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2500);
  }

  function updateProgress() {
    const progressLabel = document.getElementById('game-progress-label');
    // Count only clicks on filtered issues (ignore candidate clicks for progress)
    const filteredMap = window.__filteredMap || new Map();
    const clicked = [...userClicks.keys()].filter(el => filteredMap.has(el)).length;
    const total = window.__filteredTotal || totalIssues;
    const percent = total > 0 ? Math.min(Math.round((clicked / total) * 100), 100) : 0;
    window.__ownProgress = percent; // multiplayer poller reads this
    if (progressLabel) {
      progressLabel.textContent = clicked + '/' + total;
    }
    // Single player: update bar directly. Multiplayer: poller handles it.
    if (!window.__mpActive) {
      const progressBar = document.getElementById('game-progress-bar');
      if (progressBar) progressBar.style.width = percent + '%';
    }
  }

  function isElementVisible(el) {
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    return rect.width > 0 &&
           rect.height > 0 &&
           style.display !== 'none' &&
           style.visibility !== 'hidden' &&
           style.opacity !== '0';
  }

  function enableVoting() {
    const allElements = document.querySelectorAll(
      'p, h1, h2, h3, h4, h5, h6, img, a, input, li, td, th, figure, section, article, span, div'
    );

    allElements.forEach((el) => {
      if (el.closest('#game-ui')) return;

      el.style.cursor = 'pointer';

      el.addEventListener('click', (event) => {
        if (gameRevealed) return;
        // Ignore clicks on any game UI element (HUD, overlays, lobby, results)
        if (event.target.closest('#game-ui, #ai-results-overlay, [id^="ai-lobby"], [id^="ai-warmup"], #ai-budget-toast')) return;
        event.stopPropagation();
        event.preventDefault();

        const x = event.clientX;
        const y = event.clientY;

        const clickedEl = event.currentTarget;
        clickedEl.style.pointerEvents = 'none';
        const elementUnder = document.elementFromPoint(x, y);
        clickedEl.style.pointerEvents = '';

        let target = elementUnder && elementUnder.tagName === 'IMG'
          ? elementUnder
          : event.target;

        // Use the filtered map so only kept issues are valid targets
        const filteredMap  = window.__filteredMap     || new Map();
        const visualMap    = window.__filteredVisualMap || new Map();

        // Walk up from clicked element to find direct filteredMap entry
        let flaggedTarget = target;
        while (flaggedTarget && flaggedTarget !== document.body) {
          if (filteredMap.has(flaggedTarget)) break;
          flaggedTarget = flaggedTarget.parentElement;
        }

        // If direct walk-up failed, check if clicked element is a visual target
        // (overflow parent) that maps back to a filteredMap element
        if (!flaggedTarget || flaggedTarget === document.body) {
          let probe = target;
          while (probe && probe !== document.body) {
            if (visualMap.has(probe)) { flaggedTarget = visualMap.get(probe); break; }
            probe = probe.parentElement;
          }
        }

        if (!flaggedTarget || flaggedTarget === document.body) {
          flaggedTarget = target;
        }

        const isSa11yElement = filteredMap.has(flaggedTarget);
        const alreadyClicked = userClicks.has(flaggedTarget);

        // Enforce candidate budget: non-Sa11y clicks are limited to CANDIDATE_BUDGET
        if (!isSa11yElement && !alreadyClicked) {
          if (candidateBudgetUsed >= CANDIDATE_BUDGET) {
            showBudgetToast();
            return; // block the click
          }
          candidateBudgetUsed++;
          updateBudget();
        } else if (!isSa11yElement && alreadyClicked) {
          // Unchecking a candidate click — refund one budget slot
          candidateBudgetUsed = Math.max(0, candidateBudgetUsed - 1);
          updateBudget();
        }

        let count = userClicks.get(flaggedTarget) || 0;
        if (count < TOTAL_USERS) {
          count++;
          userClicks.set(flaggedTarget, count);
        } else {
          count = 0;
          userClicks.delete(flaggedTarget);
        }

        updateColor(flaggedTarget);
        updateProgress();
      });
    });

    // Special handling for images — capture phase runs BEFORE parent handlers
    document.querySelectorAll('img').forEach((img) => {
      if (img.closest('#game-ui')) return;

      img.addEventListener('click', (event) => {
        if (gameRevealed) return;
        if (event.target.closest('#game-ui, #ai-results-overlay, [id^="ai-lobby"], [id^="ai-warmup"]')) return;
        event.stopPropagation();
        event.preventDefault();

        let count = userClicks.get(img) || 0;
        if (count < TOTAL_USERS) {
          count++;
          userClicks.set(img, count);
        } else {
          count = 0;
          userClicks.delete(img);
        }

        updateColor(img);
        updateProgress();
      }, true);
    });

    updateBudget(); // show budget counter as soon as game starts
    console.log('Voting enabled!');
  }

  // ============================================================
  // FILTERED ISSUE MAP
  // ============================================================
  // Only these Sa11y warning test IDs are in scope for the game.
  // ALL errors (any test ID) are always kept.
  const ALLOWED_WARNING_TESTS = new Set([
    'LINK_IDENTICAL_NAME',
    'LINK_IMAGE_ALT',
    'LINK_IMAGE_ALT_AND_TEXT',
    'LINK_NEW_TAB',
    'IMAGE_DECORATIVE',
    // All contrast variants count as one "contrast" category
    'CONTRAST_WARNING',
    'CONTRAST_WARNING_GRAPHIC',
    'CONTRAST_ERROR',
    'CONTRAST_INPUT',
    'CONTRAST_PLACEHOLDER',
    'CONTRAST_PLACEHOLDER_UNSUPPORTED',
    'CONTRAST_ERROR_GRAPHIC',
    'CONTRAST_UNSUPPORTED',
  ]);

  // Builds a Map of { element → type } using only filtered results.
  // Also stores per-type counts for scoring and bonuses.
  function buildFilteredMap() {
    const all = window.sa11yCheckComplete?.results || [];

    // Build a set of elements that have ANY non-allowed warning — exclude those entirely
    // so elements with mixed issues (e.g. LINK_IDENTICAL_NAME + DUPLICATE_TITLE) don't confuse users
    const elementsWithNonAllowedWarning = new Set(
      all.filter(r => r.type === 'warning' && !ALLOWED_WARNING_TESTS.has(r.test)).map(r => r.element)
    );

    const filtered = all.filter(r => {
      if (r.type === 'error') return true;
      if (!ALLOWED_WARNING_TESTS.has(r.test)) return false;
      return !elementsWithNonAllowedWarning.has(r.element); // skip mixed elements
    });

    const map = new Map(filtered.map(r => [r.element, r.type]));

    // Also map visualTarget → original element so clicks on overflow parents resolve correctly
    const visualMap = new Map();
    filtered.forEach(r => {
      const vt = getVisualTarget(r.element);
      if (vt !== r.element) visualMap.set(vt, r.element);
    });

    const errorCount   = filtered.filter(r => r.type === 'error').length;
    const warningCount = filtered.filter(r => r.type === 'warning').length;

    console.log(
      `[AccessInspector] Filter: total Sa11y=${all.length} → kept=${filtered.length}` +
      ` (errors=${errorCount}, warnings=${warningCount})`
    );
    // Log the warning test names that survived the filter
    const keptTests = [...new Set(filtered.filter(r=>r.type==='warning').map(r=>r.test))];
    console.log('[AccessInspector] Kept warning categories:', keptTests);

    return { map, visualMap, errorCount, warningCount, totalFiltered: filtered.length };
  }

  // ============================================================
  // REVEAL ANSWERS + SAVE SCORE
  // ============================================================
  // ── Helper: find the visible target for an element (handles overflow:hidden parents)
  function getVisualTarget(el) {
    const parents = [];
    let p = el.parentElement;
    while (p && p !== document.body) {
      const ov = window.getComputedStyle(p).overflow;
      if (ov === 'hidden' || ov === 'clip') parents.push(p);
      p = p.parentElement;
    }
    return parents.length > 0 ? parents[0] : el;
  }

  // ── Helper: generate a stable CSS selector for an element (3-tier approach)
  // Tier 1: use the element's own id if it has one
  // Tier 2: anchor to the nearest ancestor with an id
  // Tier 3: full path from body using tag + nth-child
  function getDomSelector(el) {
    if (el.id) return '#' + CSS.escape(el.id);

    const parts = [];
    let current = el;
    while (current && current !== document.body) {
      const tag = current.tagName.toLowerCase();
      const siblings = current.parentElement
        ? Array.from(current.parentElement.children).filter(c => c.tagName === current.tagName)
        : [];
      const nth = siblings.length > 1 ? `:nth-of-type(${siblings.indexOf(current) + 1})` : '';
      parts.unshift(tag + nth);
      if (current.parentElement && current.parentElement.id) {
        parts.unshift('#' + CSS.escape(current.parentElement.id));
        return parts.join(' > ');
      }
      current = current.parentElement;
    }
    return 'body > ' + parts.join(' > ');
  }

  // ── Phase 1: Reveal visuals (borders) + run candidate popups
  // Stores score data on window. Does NOT save to backend or show overlay.
  async function revealAnswers() {
    if (window.__gameRevealed) return;
    window.__gameRevealed = true;
    gameRevealed = true;
    try {
    if (window.__timerInterval) { clearInterval(window.__timerInterval); window.__timerInterval = null; }

    if (!window.sa11yCheckComplete || !Array.isArray(window.sa11yCheckComplete.results)) {
      console.warn('[AccessInspector] sa11yCheckComplete not ready — firing RevealDone with empty results');
      window.dispatchEvent(new CustomEvent('AccessInspectorRevealDone'));
      return;
    }
    const sa11yMap   = window.__filteredMap || buildFilteredMap().map;
    const totalErrors   = window.__filteredErrorCount   ?? 0;
    const totalWarnings = window.__filteredWarningCount ?? 0;
    console.log('[AccessInspector] sa11yMap (filtered) size:', sa11yMap.size, '| userClicks:', userClicks.size);

    let correct = 0;
    let score = 0;
    const candidateClicks = [];

    let correctErrors = 0;
    let correctWarnings = 0;

    // Bucket A & B: what the user clicked
    userClicks.forEach((count, el) => {
      const target = getVisualTarget(el);
      if (sa11yMap.has(el)) {
        // Correct hit — show Sa11y color: red for errors, yellow for warnings
        correct++;
        const isError = sa11yMap.get(el) === 'error';
        score += isError ? 4 : 2;
        if (isError) correctErrors++; else correctWarnings++;
        if (isError) {
          target.style.setProperty('outline', '4px solid #DB062D', 'important');
          target.style.setProperty('box-shadow', '0 0 0 4px rgba(219,6,45,0.35)', 'important');
        } else {
          target.style.setProperty('outline', '4px solid #BDBF09', 'important');
          target.style.setProperty('box-shadow', '0 0 0 4px rgba(189,191,9,0.35)', 'important');
        }
      } else {
        // Candidate → gray dashed border, popup will ask for reason
        target.style.setProperty('outline', '4px dashed #888', 'important');
        target.style.setProperty('box-shadow', '0 0 0 3px rgba(0,0,0,0.15)', 'important');
        candidateClicks.push({ el, target });
      }
    });

    // Bucket C: Sa11y issues the user missed
    let missed = 0;
    let missedErrors = 0;
    sa11yMap.forEach((type, el) => {
      if (!userClicks.has(el)) {
        missed++;
        const target = getVisualTarget(el);
        const isError = type === 'error';
        if (isError) {
          missedErrors++;
          // penalty tracked separately — applied after loop, capped below
          target.style.setProperty('outline', '4px solid #DB062D', 'important');
          target.style.setProperty('box-shadow', '0 0 0 4px rgba(219,6,45,0.2)', 'important');
        } else {
          target.style.setProperty('outline', '4px solid #BDBF09', 'important');
          target.style.setProperty('box-shadow', '0 0 0 4px rgba(189,191,9,0.2)', 'important');
        }
      }
    });

    // Apply missed-error penalty: -2 per missed error.
    // Cap: penalty can never exceed HALF of what correct clicks earned,
    // so players always keep at least 50% of their earned score.
    const earnedFromCorrect = (correctErrors * 4) + (correctWarnings * 2);
    const rawPenalty = missedErrors * 2;
    const cappedPenalty = Math.min(rawPenalty, Math.floor(earnedFromCorrect / 2));
    score = Math.max(0, score - cappedPenalty);
    console.log(`[AI score] earned=${earnedFromCorrect} rawPenalty=${rawPenalty} cappedPenalty=${cappedPenalty} finalScore=${score}`);

    // Store for Phase 2 (revealScores)
    window.__pendingScore          = score;
    window.__pendingCorrect        = correct;
    window.__pendingMissed         = missed;
    window.__pendingCorrectErrors  = correctErrors;
    window.__pendingCorrectWarnings= correctWarnings;
    window.__pendingMissedErrors   = missedErrors;
    window.__pendingTotalErrors    = totalErrors;
    window.__pendingTotalWarnings  = totalWarnings;
    window.__candidateClicks = candidateClicks;
    window.__candidatePoints = 0; // will be incremented by popup submissions

    const progressLabel = document.getElementById('game-progress-label');
    if (progressLabel) progressLabel.textContent = '✅ Answers revealed!';
    const progressBar = document.getElementById('game-progress-bar');
    if (progressBar) progressBar.style.width = '100%';

    console.log('[AccessInspector] correct:', correct, '| missed:', missed, '| candidates:', candidateClicks.length);

    // Show candidate popups one-by-one, then fire event so button can change
    if (candidateClicks.length > 0) {
      console.log('[AccessInspector] showing', candidateClicks.length, 'candidate popup(s)');
      await showCandidatePopups(candidateClicks);
    }

      // Signal to watchSa11yButton that visual phase is done → change to "Reveal Scores"
      window.dispatchEvent(new CustomEvent('AccessInspectorRevealDone'));
    } catch (err) {
      console.error('[AccessInspector] revealAnswers error:', err);
      window.dispatchEvent(new CustomEvent('AccessInspectorRevealDone'));
    }
  }

  // ── Phase 2: Save scores and show results overlay
  async function revealScores() {
    window.__scoresRevealed = true; // prevents auto-trigger from running a second time
    const score      = (window.__pendingScore   || 0) + (window.__candidatePoints || 0);
    const correct    = window.__pendingCorrect  || 0;
    const missed     = window.__pendingMissed   || 0;
    const candidates = (window.__candidateClicks || []).length;

    const progressLabel = document.getElementById('game-progress-label');
    if (progressLabel) progressLabel.textContent = '⏳ Saving…';

    // Claim warmup XP if this is a warmup tab
    const warmupSid = new URLSearchParams(location.search).get('__ai_warmup');
    if (warmupSid) {
      const auth = window.__accessInspectorAuth || {};
      gameApiRequest(`${auth.apiBase}/sessions/${warmupSid}/claim-warmup-xp`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${auth.token}`, 'ngrok-skip-browser-warning': 'true' }
      }).then(r => { if (r?.ok) showSaveBadge('🔥 +50 Warmup XP earned!'); });
    }

    const multiSessionId = window.__publicSessionId || window.__accessInspectorSessionId;
    if (multiSessionId) {
      showResultsOverlay(correct, candidates, missed, score, null);
      const finishResult = await gameApiRequest(`${window.__accessInspectorAuth.apiBase}/sessions/${multiSessionId}/finish`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${window.__accessInspectorAuth.token}`,
          'ngrok-skip-browser-warning': 'true'
        },
        body: JSON.stringify({ score, correct, wrong: candidates, missed })
      });
      showSaveBadge('✓ Score saved!');
      const auth = window.__accessInspectorAuth;
      let pollCount = 0;
      const pollForScores = async () => {
        pollCount++;
        const sessionResult = await gameApiRequest(`${auth.apiBase}/sessions/${multiSessionId}`, {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${auth.token}`, 'ngrok-skip-browser-warning': 'true' }
        });
        const players = sessionResult?.data?.players || finishResult?.data?.players || [];
        const allDone = players.length > 0 && players.every(p => p.finalScore !== null && p.finalScore !== undefined);
        if (allDone || pollCount >= 8) {
          showResultsOverlay(correct, candidates, missed, score, players);
        } else {
          setTimeout(pollForScores, 1000);
        }
      };
      setTimeout(pollForScores, 800);
    } else {
      showResultsOverlay(correct, candidates, missed, score, null);
      saveScoreToBackend(score, correct, candidates, missed);
    }
  }

  // ── Candidate popup: show one popup per candidate click, sequentially
  function showCandidatePopups(candidates) {
    return new Promise(resolve => {
      let index = 0;
      function showNext() {
        if (index >= candidates.length) { resolve(); return; }
        showCandidatePopup(candidates[index].el, candidates[index].target, () => {
          index++;
          showNext();
        });
      }
      showNext();
    });
  }

  const CANDIDATE_REASONS = [
    'Missing alt text on image',
    'Poor color contrast',
    'Missing label on form field',
    'Vague link text',
    'Missing heading or wrong heading order',
    'Keyboard not accessible',
  ];

  function showCandidatePopup(el, target, onDone) {
    const auth = window.__accessInspectorAuth || {};
    const total = (window.__candidateClicks || []).length;
    const current = (window.__candidateClicks || []).findIndex(c => c.el === el) + 1;

    // Scroll element into view and keep it highlighted while popup is open
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.style.setProperty('outline', '4px dashed #FF6500', 'important');
    target.style.setProperty('box-shadow', '0 0 0 6px rgba(255,101,0,0.3)', 'important');

    // Get a readable description of the element for the popup
    const elTag = el.tagName ? el.tagName.toLowerCase() : '?';
    const elText = (el.getAttribute('alt') || el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 60);
    const elDesc = elText ? `&lt;${elTag}&gt; "${elText}"` : `&lt;${elTag}&gt;`;

    const popup = document.createElement('div');
    popup.id = 'ai-candidate-popup';
    popup.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:rgba(34,51,74,0.75);font-family:Georgia,serif';
    popup.innerHTML = `
      <div style="background:#FAF3E7;border-radius:20px;width:360px;max-width:92vw;box-shadow:0 20px 60px rgba(0,0,0,0.5);overflow:hidden">
        <div style="background:#22334A;padding:16px 20px;display:flex;flex-direction:column;gap:6px">
          <span style="font-size:11px;font-weight:700;color:#BDBF09;letter-spacing:1px;text-transform:uppercase">🔍 New Issue Found (${current}/${total})</span>
          <span style="font-size:13px;color:#fff;font-weight:600;word-break:break-all">${elDesc}</span>
          <span style="font-size:12px;color:rgba(255,255,255,0.6)">↑ highlighted with orange border · What's wrong with it?</span>
        </div>
        <div style="padding:12px 16px;display:flex;flex-direction:column;gap:6px;max-height:220px;overflow-y:auto">
          ${CANDIDATE_REASONS.map(r => `
            <label style="display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:10px;border:2px solid #e8ddd0;cursor:pointer;font-size:13px;color:#22334A;background:#fff;transition:border-color 0.15s">
              <input type="radio" name="ai-cand-reason-${current}" value="${r}" style="accent-color:#BDBF09;width:15px;height:15px;flex-shrink:0"/> ${r}
            </label>`).join('')}
        </div>
        <div style="padding:12px 16px;background:#f0e8d8;display:flex;gap:8px">
          <button id="ai-cand-cancel" style="flex:1;background:#e8ddd0;color:#22334A;border:none;border-radius:10px;padding:11px 16px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">Not sure</button>
          <button id="ai-cand-submit" disabled style="flex:2;background:#BDBF09;color:#0F0A0A;border:none;border-radius:10px;padding:11px 16px;font-size:14px;font-weight:700;cursor:pointer;opacity:0.4;font-family:inherit;box-shadow:0 3px 0 #8a8c06;transition:opacity 0.15s">Submit</button>
        </div>
      </div>
    `;
    document.body.appendChild(popup);

    // Enable submit when a reason is selected
    popup.querySelectorAll(`input[name="ai-cand-reason-${current}"]`).forEach(radio => {
      radio.addEventListener('change', () => {
        const submitBtn = popup.querySelector('#ai-cand-submit');
        submitBtn.disabled = false;
        submitBtn.style.opacity = '1';
      });
    });

    // Cancel — restore gray border, close popup, move on without submitting
    popup.querySelector('#ai-cand-cancel').addEventListener('click', () => {
      target.style.setProperty('outline', '4px dashed #888', 'important');
      target.style.setProperty('box-shadow', '0 0 0 3px rgba(0,0,0,0.15)', 'important');
      popup.remove();
      onDone();
    });

    // Submit
    popup.querySelector('#ai-cand-submit').addEventListener('click', async () => {
      const selected = popup.querySelector(`input[name="ai-cand-reason-${current}"]:checked`);
      if (!selected) return;
      const reason_category = selected.value;
      const reason_text = '';

      const submitBtn = popup.querySelector('#ai-cand-submit');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Saving…';

      const selector = getDomSelector(el);
      const result = await gameApiRequest(`${auth.apiBase}/candidates`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${auth.token}`,
          'ngrok-skip-browser-warning': 'true'
        },
        body: JSON.stringify({
          url: window.location.href,
          dom_selector: selector,
          reason_category,
          reason_text,
          session_id: window.__publicSessionId || window.__accessInspectorSessionId || null
        })
      });

      if (result && result.ok) {
        const pts = result.pointsAwarded || 0;
        window.__candidatePoints = (window.__candidatePoints || 0) + pts;

        let badgeText;
        if (result.status === 'pending') {
          badgeText = '🌱 First discovery! +2 XP when confirmed by another user.';
        } else if (result.status === 'confirmed_now') {
          badgeText = '✅ Confirmed! +1 XP for you — the pioneer also earns +2 XP.';
        } else {
          badgeText = `✅ +${pts} XP (community-confirmed issue)`;
        }

        const badgeEl = document.createElement('div');
        badgeEl.textContent = badgeText;
        badgeEl.style.cssText = 'position:fixed;bottom:24px;right:24px;background:#22334A;color:white;padding:10px 18px;border-radius:12px;font-weight:700;font-size:13px;z-index:9999999;font-family:sans-serif;max-width:300px;line-height:1.4';
        document.body.appendChild(badgeEl);
        setTimeout(() => badgeEl.remove(), 3500);

        // Teal border = successfully submitted
        target.style.setProperty('outline', '4px solid #2292A4', 'important');
        target.style.setProperty('box-shadow', '0 0 0 4px rgba(34,146,164,0.3)', 'important');
      } else {
        showSaveBadge("⚠️ Couldn't record your finding, try again later");
        target.style.setProperty('outline', '4px dashed #888', 'important');
        target.style.setProperty('box-shadow', '0 0 0 3px rgba(0,0,0,0.15)', 'important');
      }

      popup.remove();
      onDone();
    });
  }

  function showResultsOverlay(correct, wrong, missed, score, players) {
    const existing = document.getElementById('ai-results-overlay');
    if (existing) existing.remove();

    const auth = window.__accessInspectorAuth || {};
    // Inject overlay styles inline so they don't depend on overlay.css loading in time
    if (!document.getElementById('ai-overlay-styles')) {
      const s = document.createElement('style');
      s.id = 'ai-overlay-styles';
      s.textContent = `
        .ai-results-backdrop{position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.55);font-family:'Fraunces',Georgia,serif}
        .ai-results-card{background:radial-gradient(circle at 115% -10%,rgba(189,191,9,0.28) 40%,transparent 40%),radial-gradient(circle at -15% 115%,rgba(217,108,6,0.24) 40%,transparent 40%),#FAF3E7;padding:32px 24px;max-width:90vw;box-shadow:0 20px 60px rgba(0,0,0,0.3);border-radius:24px}
        .ai-results-card--solo{width:300px;text-align:center}
        .ai-results-card--multi{width:320px}
        .ai-results-avatar{width:110px;height:110px;border-radius:50%;margin:0 auto 14px;overflow:hidden}
        .ai-results-avatar img{width:100%;height:100%;object-fit:cover;display:block}
        .ai-results-title{font-size:30px;font-weight:800;color:#0F0A0A;font-style:italic;font-family:'Fraunces',Georgia,serif;margin-bottom:18px}
        .ai-results-title--multi{font-size:32px;text-align:center;margin-bottom:24px}
        .ai-results-stats{text-align:left;margin-bottom:20px;width:100%}
        .ai-results-stat-row{display:flex;align-items:center;justify-content:space-between;font-size:13px;color:#0F0A0A;font-family:'Fraunces',Georgia,serif;padding:5px 0}
        .ai-results-stat-label{display:flex;align-items:center;gap:7px;font-weight:500}
        .ai-results-stat-value{font-weight:700;font-family:'Fraunces',Georgia,serif}
        .ai-results-btn{display:block;margin:8px auto 0;width:fit-content;min-width:150px;background:#BDBF09;color:#0F0A0A;border:none;border-radius:12px;padding:9px 22px;font-size:13px;font-weight:700;cursor:pointer;font-family:'Fraunces',Georgia,serif;box-shadow:0 4px 0 0 #97990A}
        .ai-results-btn--full{width:100%}
        .ai-results-player{display:flex;align-items:center;gap:12px;margin-bottom:14px}
        .ai-results-player-avatar{overflow:hidden;flex-shrink:0;width:62px;height:62px}
        .ai-results-player-avatar--winner{width:76px;height:76px}
        .ai-results-player-avatar img{width:100%;height:100%;object-fit:cover}
        .ai-results-player-info{flex:1}
        .ai-results-player-rank{font-size:11px;font-weight:700;color:#0F0A0A;opacity:0.6;text-transform:uppercase;letter-spacing:1px}
        .ai-results-player-name{font-size:15px;font-weight:700;color:#0F0A0A}
        .ai-results-player-name--winner{font-size:18px}
        .ai-results-player-xp{background:#FF6500;box-shadow:0 4px 0 0 #a34e04;color:#0F0A0A;border-radius:12px;padding:6px 14px;font-size:13px;font-weight:700}
      `;
      document.head.appendChild(s);
    }
    const extUrl = auth.extUrl || '';
    const isMulti = !!(window.__publicSessionId || window.__accessInspectorSessionId) || (players && players.length > 1);

    const overlay = document.createElement('div');
    overlay.id = 'ai-results-overlay';
    overlay.className = 'ai-results-backdrop';

    if (isMulti) {
      overlay.innerHTML = window.__gameUI.multiResultsHTML({ players, extUrl });
    } else {
      const mood = score > 20 ? 'confident' : score > 0 ? 'happy' : 'worried';
      overlay.innerHTML = window.__gameUI.soloResultsHTML({
        score, correct, missed,
        candidates: (window.__candidateClicks || []).length,
        fingerColor: auth.fingerColor || 'peach',
        mood, extUrl
      });
    }

    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
    overlay.querySelector('#ai-results-close').addEventListener('click', () => overlay.remove());

    // Confetti: solo when correct > 0, multiplayer when current user has the highest score
    const myUsername = auth.username || auth.fingerColor;
    const myFingerColor = auth.fingerColor;
    let shouldCelebrate = false;
    if (!isMulti) {
      shouldCelebrate = correct > 0;
    } else if (players && players.length > 0) {
      const sorted = [...players].sort((a, b) =>
        (b.final_score ?? b.finalScore ?? 0) - (a.final_score ?? a.finalScore ?? 0)
      );
      const winnerScore = sorted[0]?.final_score ?? sorted[0]?.finalScore ?? 0;
      // If it's a tie give everyone confetti, otherwise only the top scorer
      const isTie = sorted.length > 1 && (sorted[1]?.final_score ?? sorted[1]?.finalScore ?? 0) === winnerScore;
      const meInTop = sorted.find(p =>
        (myUsername && p.username === myUsername) ||
        (myFingerColor && p.fingerColor === myFingerColor)
      );
      shouldCelebrate = meInTop && (meInTop.final_score ?? meInTop.finalScore ?? 0) > 0;
    }
    if (shouldCelebrate) {
      // Small delay so the overlay is painted; always fire from screen center
      setTimeout(() => launchConfetti(window.innerWidth / 2, window.innerHeight / 2), 80);
    }
  }

  function launchConfetti(originX, originY) {
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:2147483647';
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
    document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d');

    const COLORS = ['#BDBF09','#FF6500','#2292A4','#D9B1D4','#FFB38E','#DB062D','#8DB600'];
    const pieces = Array.from({ length: 140 }, () => {
      const angle = Math.random() * Math.PI * 2;
      const speed = 4 + Math.random() * 14;
      return {
        x: originX, y: originY,
        w: 7 + Math.random() * 8, h: 4 + Math.random() * 4,
        r: Math.random() * Math.PI * 2,
        dr: (Math.random() - 0.5) * 0.25,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 4,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        alpha: 1,
      };
    });

    let frame, startTime = null;
    const DURATION = 2600;

    function draw(ts) {
      if (!startTime) startTime = ts;
      const elapsed = ts - startTime;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let alive = false;
      for (const p of pieces) {
        p.x  += p.vx;
        p.y  += p.vy;
        p.r  += p.dr;
        p.vx *= 0.98;
        p.vy += 0.35;
        p.alpha = Math.max(0, 1 - Math.max(0, elapsed - DURATION * 0.55) / (DURATION * 0.45));
        if (p.y < canvas.height + 20 && p.alpha > 0) alive = true;
        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.r);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
      if (alive && elapsed < DURATION + 400) {
        frame = requestAnimationFrame(draw);
      } else {
        canvas.remove();
      }
    }
    frame = requestAnimationFrame(draw);
  }

  function openSa11yPanel() {
    const panel = document.querySelector('sa11y-control-panel');
    if (panel && panel.shadowRoot) {
      const btn = panel.shadowRoot.querySelector('#toggle');
      if (btn) btn.click();
    }
  }

  // setButtonStyle: shorthand to update the Sa11y toggle button appearance
  function setButtonStyle(style, bg, shadow, label, fontSize) {
    style.textContent = `
      #toggle {
        width: 100px !important; height: 80px !important;
        border-radius: 12px !important;
        background: ${bg} !important;
        box-shadow: 0 4px 0 0 ${shadow} !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
      }
      #toggle svg { display: none !important; }
      #toggle::after {
        content: "${label}" !important;
        font-size: ${fontSize || '11px'} !important;
        font-weight: bold !important;
        color: #0F0A0A !important;
        font-family: sans-serif !important;
        text-align: center !important;
        line-height: 1.3 !important;
        white-space: pre-wrap !important;
        display: block !important;
        width: 100% !important;
      }
    `;
  }

  function watchSa11yButton() {
    const interval = setInterval(() => {
      const panel = document.querySelector('sa11y-control-panel');
      if (panel && panel.shadowRoot) {
        const toggleBtn = panel.shadowRoot.querySelector('#toggle');
        if (toggleBtn) {
          clearInterval(interval);

          const hideEl = document.getElementById('ai-hide-sa11y-panel');
          if (hideEl) hideEl.remove();

          const style = document.createElement('style');
          panel.shadowRoot.appendChild(style);

          // Button states:
          // STATE 0 — "Recording answers"  yellow-green  (game in progress, user clicks elements)
          // STATE 1 — processing           orange        (borders showing + popups running, button disabled)
          // STATE 2 — "Reveal Scores"      green         (popups done, waiting for click)
          // STATE 3 — "See Sa11y panel"    orange        (overlay shown)
          // STATE 4 — "✅ Done"            cream         (Sa11y panel opened)
          let btnState = 0;
          setButtonStyle(style, '#BDBF09', '#8a8c06', 'Recording answers');

          // When visual reveal + popups finish → switch to STATE 2
          window.addEventListener('AccessInspectorRevealDone', () => {
            btnState = 2;
            setButtonStyle(style, '#8DB600', '#628000', 'Reveal Scores');
          }, { once: true });

          toggleBtn.addEventListener('click', async () => {
            if (window.__sa11yScanningMode) return;

            if (btnState === 0) {
              // First press → show borders + candidate popups
              btnState = 1;
              setButtonStyle(style, '#FF6500', '#AC4501', 'Processing...', '10px');
              revealAnswers(); // async — fires AccessInspectorRevealDone when done

            } else if (btnState === 2) {
              // Second press → show scores overlay
              btnState = 3;
              setButtonStyle(style, '#FF6500', '#AC4501', 'See the reasons');
              await revealScores();

            } else if (btnState === 3 && !window.__sa11yPanelOpened) {
              // Third press → open Sa11y panel
              btnState = 4;
              window.__sa11yPanelOpened = true;
              openSa11yPanel();
              setButtonStyle(style, '#FAF3E7', '#d4c9b0', '✅ Done');
              document.body.classList.remove('ai-game-active');
              if (window.__aiDismissObserver) { window.__aiDismissObserver.disconnect(); window.__aiDismissObserver = null; }
            }
          });

          console.log('Sa11y button customized!');
        }
      }
    }, 300);
  }

  function addGameUI() {
    if (document.getElementById('game-ui')) return;
    document.body.prepend(window.__gameUI.createHUDContainer());
  }

  // Helper: make an API call from game.js via the content-script bridge
  function gameApiRequest(url, options) {
    const requestId = 'req_' + Date.now() + '_' + Math.random();
    const responsePromise = new Promise((resolve) => {
      function handler(event) {
        if (event.detail.requestId !== requestId) return;
        window.removeEventListener('AccessInspectorResponse', handler);
        resolve(event.detail.result);
      }
      window.addEventListener('AccessInspectorResponse', handler);
    });
    window.dispatchEvent(new CustomEvent('AccessInspectorRequest', {
      detail: { requestId, url, options }
    }));
    return responsePromise;
  }

  const FINGER_COLORS = {
    yellow:  '#BDBF09',
    orange:  '#FF6500',
    teal:    '#2292A4',
    purple:  '#D9B1D4',
    peach:   '#FFB38E'
  };

  // Lighter highlight color for the inner shine on filled bars
  const FINGER_COLORS_LIGHT = {
    yellow:  '#D8DA3A',
    orange:  '#FF8C3A',
    teal:    '#4AAFBF',
    purple:  '#E8CCE4',
    peach:   '#FFC9A8'
  };

  function wireUpMultiplayerProgressBar(sessionId) {
    const auth = window.__accessInspectorAuth;
    if (!auth || !auth.token || !sessionId) return;

    const track = document.getElementById('game-progress-track');
    if (!track) return;

    // Switch to multiplayer mode — one bar, one colored line per player
    window.__mpActive = true;
    track.innerHTML = '';
    track.style.cssText = 'flex:1; display:flex; flex-direction:column; gap:4px; padding:2px 0;';

    // Single shared bar container
    const barWrap = document.createElement('div');
    barWrap.style.cssText = `
      position:relative; height:12px; border-radius:20px; overflow:hidden;
      background:rgba(255,255,255,0.18);
      box-shadow:inset 0 1px 3px rgba(0,0,0,0.25);
    `;
    track.appendChild(barWrap);

    // Label row (one chip per player)
    const labelRow = document.createElement('div');
    labelRow.style.cssText = 'display:flex; gap:6px; align-items:center;';
    track.appendChild(labelRow);

    window.__mpPollInterval = setInterval(async () => {
      const result = await gameApiRequest(`${auth.apiBase}/sessions/${sessionId}/progress`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${auth.token}`,
          'ngrok-skip-browser-warning': 'true'
        },
        body: JSON.stringify({ progress: window.__ownProgress || 0 })
      });

      if (!result || !result.ok) return;

      const players = result.data.players || [];

      players.forEach((player) => {
        const fillId  = `mp-fill-${player.userId}`;
        const labelId = `mp-label-${player.userId}`;
        const color      = FINGER_COLORS[player.fingerColor]       || '#BDBF09';
        const colorLight = FINGER_COLORS_LIGHT[player.fingerColor] || '#D8DA3A';

        // Create fill stripe if not yet present
        let fill = document.getElementById(fillId);
        if (!fill) {
          fill = document.createElement('div');
          fill.id = fillId;
          fill.style.cssText = `
            position:absolute; top:0; left:0;
            height:100%; width:0%;
            border-radius:20px;
            transition:width 0.5s ease;
            background:linear-gradient(to bottom, ${colorLight} 0%, ${color} 55%, ${color}cc 100%);
            box-shadow:inset 0 1px 0 rgba(255,255,255,0.45);
          `;
          barWrap.appendChild(fill);
        }

        // Create label chip if not yet present
        let label = document.getElementById(labelId);
        if (!label) {
          label = document.createElement('span');
          label.id = labelId;
          label.style.cssText = `
            font-size:10px; font-weight:700; color:#0F0A0A;
            background:${color}; border-radius:10px; padding:1px 6px;
            white-space:nowrap;
          `;
          labelRow.appendChild(label);
        }

        fill.style.width = (player.progress || 0) + '%';
        const found = player.issuesFound  != null ? player.issuesFound  : '–';
        const total = player.totalIssues  != null ? player.totalIssues  : '–';
        label.textContent = `${player.username || ''} ${found}/${total}`;
      });

      if (result.data.status === 'completed') {
        clearInterval(window.__mpPollInterval);
        const finalPlayers = result.data.players || [];
        if (!window.__scoresRevealed) {
          // Player hasn't gone through reveal flow yet — auto-trigger it
          window.__scoresRevealed = true;
          if (!window.__gameRevealed) await revealAnswers();
          revealScores();
        } else {
          // Player already revealed — update the placeholder with real scores now that all are in
          const score      = (window.__pendingScore   || 0) + (window.__candidatePoints || 0);
          const correct    = window.__pendingCorrect  || 0;
          const missed     = window.__pendingMissed   || 0;
          const candidates = (window.__candidateClicks || []).length;
          showResultsOverlay(correct, candidates, missed, score, finalPlayers);
        }
      }
    }, 3000);
  }

  function startGameTimer(elapsedSeconds) {
    if (window.__timerStarted) return;
    window.__timerStarted = true;
    const totalSeconds = Math.max(totalIssues * 6, 30);
    let secondsLeft = Math.max(0, totalSeconds - (elapsedSeconds || 0));
    const timerEl = document.getElementById('game-timer');
    if (!timerEl) return;
    timerEl.style.display = 'inline';
    const fmt = s => `⏱ ${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;
    timerEl.textContent = fmt(secondsLeft);
    window.__timerInterval = setInterval(() => {
      secondsLeft--;
      timerEl.textContent = fmt(secondsLeft);
      if (secondsLeft <= 10) timerEl.style.color = '#ff6b6b';
      if (secondsLeft <= 0) {
        clearInterval(window.__timerInterval);
        window.__timerInterval = null;
        timerEl.textContent = '⏱ 0:00';
        if (!window.__gameRevealed) revealAnswers();
      }
    }, 1000);
  }

  function wireUpPublicToggle() {
    const btn = document.getElementById('game-public-btn');
    const auth = window.__accessInspectorAuth;
    if (!btn || !auth || !auth.token) return;

    btn.disabled = false;
    let isPublic = false;
    let sessionId = null;
    let pollInterval = null;

    function updateButton(text, bg) {
      btn.textContent = text;
      btn.style.background = bg;
    }

    function setOn(id) {
      isPublic = true;
      sessionId = id;
      window.__publicSessionId = id;
      wireUpMultiplayerProgressBar(id);
      updateButton('🌐 Public · 1 player', '#A2CB8B');
      showLobbyOverlay(id, true);
      pollInterval = setInterval(async () => {
        const result = await gameApiRequest(`${auth.apiBase}/sessions/${sessionId}`, {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${auth.token}`, 'ngrok-skip-browser-warning': 'true' }
        });
        if (result && result.ok) {
          const count = result.data.players?.length || 1;
          updateButton(`🌐 Public · ${count} player${count !== 1 ? 's' : ''}`, '#A2CB8B');
          if (count > 1) btn.disabled = true; // lock once someone joined
        }
      }, 3000);
    }

    function setOff() {
      isPublic = false;
      sessionId = null;
      window.__publicSessionId = null;
      if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
      updateButton('🔒 Private', '#F4EFEB');
    }

    btn.addEventListener('click', async () => {
      btn.disabled = true;

      if (!isPublic) {
        updateButton('⏳ Creating…', '#ffc107');
        const result = await gameApiRequest(`${auth.apiBase}/sessions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${auth.token}`,
            'ngrok-skip-browser-warning': 'true'
          },
          body: JSON.stringify({ target_url: window.location.href })
        });
        if (result && result.ok) {
          setOn(result.data.sessionId);
        } else {
          setOff();
        }
      } else {
        updateButton('⏳ Closing…', '#ffc107');
        await gameApiRequest(`${auth.apiBase}/sessions/${sessionId}/leave`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${auth.token}`, 'ngrok-skip-browser-warning': 'true' }
        });
        setOff();
      }

      btn.disabled = false;
    });
  }

  // Leave/cancel session when tab is closed mid-game
  window.addEventListener('beforeunload', () => {
    const sid = window.__publicSessionId || window.__accessInspectorSessionId;
    const auth = window.__accessInspectorAuth;
    if (!sid || !auth || !auth.token) return;
    navigator.sendBeacon(
      `${auth.apiBase}/sessions/${sid}/leave`,
      new Blob([JSON.stringify({ token: auth.token })], { type: 'application/json' })
    );
  });

  // ============================================================
  // LOBBY OVERLAY
  // ============================================================
  const WARMUP_TUTORIALS = [
    'https://endnote-grape-retiring.ngrok-free.dev/sa11y-demo/demo/en/index.html',
    'https://endnote-grape-retiring.ngrok-free.dev/sa11y-demo/demo/en/errors.html',
    'https://endnote-grape-retiring.ngrok-free.dev/sa11y-demo/demo/en/warnings.html',
    'https://endnote-grape-retiring.ngrok-free.dev/sa11y-demo/demo/en/pass.html',
    'https://endnote-grape-retiring.ngrok-free.dev/sa11y-demo/demo/en/other.html'
  ];

  function showLobbyOverlay(sessionId, isHost) {
    if (document.getElementById('ai-lobby-overlay')) return;
    const auth = window.__accessInspectorAuth || {};

    const overlay = document.createElement('div');
    overlay.id = 'ai-lobby-overlay';
    overlay.style.cssText = `
      position:fixed; inset:0; z-index:9999998;
      display:flex; align-items:center; justify-content:center;
      background:rgba(34,51,74,0.85);
      font-family:'Fraunces',Georgia,serif;
    `;
    overlay.innerHTML = window.__gameUI.lobbyOverlayHTML({ isHost });
    document.body.appendChild(overlay);

    function renderPlayers(players) {
      const el = overlay.querySelector('#ai-lobby-players');
      if (!el) return;
      el.innerHTML = players.map(p => window.__gameUI.lobbyPlayerRowHTML({
        username: p.username,
        fingerColor: p.fingerColor,
        mood: p.mood,
        extUrl: auth.extUrl
      })).join('');
    }

    async function pollState() {
      const result = await gameApiRequest(`${auth.apiBase}/sessions/${sessionId}`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${auth.token}`, 'ngrok-skip-browser-warning': 'true' }
      });
      if (!result || !result.ok) return;
      const state = result.data;

      const cdEl = overlay.querySelector('#ai-lobby-countdown');
      if (cdEl && state.countdownRemaining !== null && state.countdownRemaining !== undefined) {
        cdEl.textContent = state.countdownRemaining;
      }
      if (state.players) renderPlayers(state.players);

      // Auto-start when countdown hits 0 (host triggers it)
      if (isHost && state.status === 'lobby' && state.countdownRemaining === 0) {
        gameApiRequest(`${auth.apiBase}/sessions/${sessionId}/start`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${auth.token}`, 'ngrok-skip-browser-warning': 'true',
                     'Content-Type': 'application/json' },
          body: JSON.stringify({ totalIssues: window.__filteredTotal || 0 })
        });
      }

      if (state.status === 'playing') {
        clearInterval(lobbyPoll);
        overlay.remove();
        if (!isHost) {
          wireUpMultiplayerProgressBar(sessionId);

          // Use the host's filteredTotal (stored on server) as the authoritative issue count.
          // This ensures host and guest show the same number even if their local Sa11y
          // scans found different amounts due to dynamic content or dismissed items.
          if (state.totalIssues != null && state.totalIssues > 0) {
            window.__filteredTotal = state.totalIssues;
            totalIssues = state.totalIssues;
            const labelEl = document.getElementById('game-progress-label');
            if (labelEl) labelEl.textContent = `0 / ${state.totalIssues} issues to find`;
          }
        }
        startGameTimer(state.playingElapsedSeconds || 0);
        window.dispatchEvent(new CustomEvent('AccessInspectorCloseWarmup'));
      }
    }

    // Immediate first poll + recurring
    const lobbyPoll = setInterval(pollState, 2000);
    pollState();

    // Warmup button
    overlay.querySelector('#ai-lobby-warmup').addEventListener('click', () => {
      const url = WARMUP_TUTORIALS[Math.floor(Math.random() * WARMUP_TUTORIALS.length)];
      window.dispatchEvent(new CustomEvent('AccessInspectorOpenWarmup', {
        detail: { url: `${url}?__ai_warmup=${sessionId}&ngrok-skip-browser-warning=true`, sessionId }
      }));
      const btn = overlay.querySelector('#ai-lobby-warmup');
      btn.textContent = '🔥 Warming up…';
      btn.disabled = true;
      const msg = overlay.querySelector('#ai-lobby-msg');
      if (msg) msg.textContent = 'Finish the tutorial to earn +50 XP!';
    });

    // Start Now (host only)
    const startBtn = overlay.querySelector('#ai-lobby-start');
    if (startBtn) {
      startBtn.addEventListener('click', async () => {
        startBtn.disabled = true;
        startBtn.textContent = '⏳ Starting…';
        await gameApiRequest(`${auth.apiBase}/sessions/${sessionId}/start`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${auth.token}`, 'ngrok-skip-browser-warning': 'true',
                     'Content-Type': 'application/json' },
          body: JSON.stringify({ totalIssues: window.__filteredTotal || 0 })
        });
      });
    }
  }

  // ============================================================
  // WARMUP MODE — detect if this tab was opened as a warmup
  // ============================================================
  const warmupSessionId = new URLSearchParams(location.search).get('__ai_warmup');
  if (warmupSessionId) {
    const auth = window.__accessInspectorAuth || {};

    // Floating panel: countdown + back button
    const panel = document.createElement('div');
    panel.id = 'ai-warmup-panel';
    panel.style.cssText = `
      position:fixed; bottom:16px; left:16px; z-index:999999;
      background:#22334A; color:white; border-radius:16px;
      padding:14px 18px; font-family:'Fraunces',Georgia,serif;
      box-shadow:0 4px 16px rgba(0,0,0,0.3); min-width:200px;
    `;
    panel.innerHTML = window.__gameUI.warmupPanelHTML();
    document.body.appendChild(panel);

    // Poll session countdown
    const warmupPoll = setInterval(async () => {
      const result = await gameApiRequest(`${auth.apiBase}/sessions/${warmupSessionId}`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${auth.token}`, 'ngrok-skip-browser-warning': 'true' }
      });
      if (!result || !result.ok) return;
      const state = result.data;
      const cdEl = document.getElementById('ai-warmup-countdown');
      if (cdEl && state.countdownRemaining !== null) cdEl.textContent = state.countdownRemaining;

      // Game started — warn user
      if (state.status === 'playing') {
        clearInterval(warmupPoll);
        panel.innerHTML = window.__gameUI.warmupStartedHTML();
        panel.querySelector('#ai-warmup-back').addEventListener('click', () => {
          window.dispatchEvent(new CustomEvent('AccessInspectorBackToLobby'));
        });
      }
    }, 2000);

    // Initial poll
    gameApiRequest(`${auth.apiBase}/sessions/${warmupSessionId}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${auth.token}`, 'ngrok-skip-browser-warning': 'true' }
    }).then(r => {
      if (r?.ok) {
        const cdEl = document.getElementById('ai-warmup-countdown');
        if (cdEl && r.data.countdownRemaining !== null) cdEl.textContent = r.data.countdownRemaining;
      }
    });

    // Back to Lobby button
    panel.querySelector('#ai-warmup-back').addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('AccessInspectorBackToLobby'));
    });
  }

  // ============================================================

  // Hide sa11y-control-panel immediately so the default blue icon never flashes.
  const hideSheet = document.createElement('style');
  hideSheet.id = 'ai-hide-sa11y-panel';
  hideSheet.textContent = 'sa11y-control-panel { visibility: hidden !important; }';
  document.head.appendChild(hideSheet);

  addGameUI();
  document.body.classList.add('ai-game-active');

  // Hide Sa11y dismiss buttons while game is active.
  // Tippy recreates tooltip DOM on every open, so we use a MutationObserver
  // to catch buttons the moment they appear and hide them inline.
  function hideDismissBtn(node) {
    if (node.nodeType !== 1) return;
    if (node.hasAttribute('data-sa11y-dismiss')) {
      node.style.setProperty('display', 'none', 'important');
    }
    node.querySelectorAll('[data-sa11y-dismiss]').forEach(btn => {
      btn.style.setProperty('display', 'none', 'important');
    });
  }
  const dismissObserver = new MutationObserver(mutations => {
    mutations.forEach(m => m.addedNodes.forEach(hideDismissBtn));
  });
  dismissObserver.observe(document.body, { childList: true, subtree: true });
  window.__aiDismissObserver = dismissObserver;

  // Apply the player's own finger color to the single-player progress bar
  (function applyOwnBarColor() {
    const auth = window.__accessInspectorAuth;
    const color = FINGER_COLORS[(auth && auth.fingerColor)] || '#BDBF09';
    const colorLight = FINGER_COLORS_LIGHT[(auth && auth.fingerColor)] || '#D8DA3A';
    const bar = document.getElementById('game-progress-bar');
    if (bar) bar.style.background = `linear-gradient(to bottom, ${colorLight} 0%, ${color} 55%, ${color}cc 100%)`;
  })();

  const pubBtn = document.getElementById('game-public-btn');

  if (window.__accessInspectorStartPublic && !window.__publicSessionId) {
    // Play Public: create session immediately and show lobby — no need to wait for scan
    if (pubBtn) pubBtn.style.display = 'none';
    const auth = window.__accessInspectorAuth;
    (async () => {
      const result = await gameApiRequest(`${auth.apiBase}/sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${auth.token}`,
          'ngrok-skip-browser-warning': 'true'
        },
        body: JSON.stringify({ target_url: window.location.href })
      });
      if (result && result.ok) {
        const id = result.data.sessionId;
        window.__publicSessionId = id;
        wireUpMultiplayerProgressBar(id);
        showLobbyOverlay(id, true);
      }
    })();
  } else if (!window.__accessInspectorIsJoiner) {
    wireUpPublicToggle();
  }
  watchSa11yButton();

  // If joiner: show lobby immediately, then poll to transition when game starts
  if (window.__accessInspectorIsJoiner && window.__accessInspectorSessionId) {
    const sid  = window.__accessInspectorSessionId;
    const auth = window.__accessInspectorAuth || {};
    // Show lobby right away — no need to wait for a network round-trip
    showLobbyOverlay(sid, false);
    wireUpMultiplayerProgressBar(sid);
  }

  const getCount = setInterval(() => {
    if (window.sa11yCheckComplete && window.sa11yCheckComplete.results) {
      clearInterval(getCount);

      const panel = document.querySelector('sa11y-control-panel');
      const badge = panel?.shadowRoot?.querySelector('#notification-count');
      const badgeCount = badge ? parseInt(badge.textContent.trim()) : 0;
      // Build the filtered map once at game start so progress bar uses filtered count
      const { map: fMap, visualMap: fVisual, totalFiltered, errorCount: fErr, warningCount: fWarn } = buildFilteredMap();
      window.__filteredMap          = fMap;
      window.__filteredVisualMap    = fVisual;
      window.__filteredTotal        = totalFiltered;
      window.__filteredErrorCount   = fErr;
      window.__filteredWarningCount = fWarn;
      totalIssues = totalFiltered;

      // Overwrite Sa11y's unfiltered badge and panel counts with filtered counts
      if (badge) badge.textContent = totalFiltered;
      const sa11yPanel = document.querySelector('sa11y-control-panel');
      const panelStatus = sa11yPanel?.shadowRoot?.querySelector('#status');
      if (panelStatus) {
        const filteredHTML = (fErr > 0 ? `ERRORS <span class="panel-count">${fErr}</span> ` : '') +
                             (fWarn > 0 ? `WARNINGS <span class="panel-count" id="warning-count">${fWarn}</span>` : '');
        const applyFilteredCounts = () => {
          if (panelStatus.innerHTML !== filteredHTML) panelStatus.innerHTML = filteredHTML;
        };
        applyFilteredCounts();
        // Watch for Sa11y re-writing the counts and override immediately
        const statusObserver = new MutationObserver(applyFilteredCounts);
        statusObserver.observe(panelStatus, { childList: true, subtree: true, characterData: true });
        window.__gameStatusObserver = statusObserver;
      }

      // Edge case: no filtered issues on this page → don't start game
      if (totalFiltered === 0) {
        const labelEl = document.getElementById('game-progress-label');
        if (labelEl) labelEl.textContent = '🎉 This page looks accessible in tracked categories! Try another page.';
        return;
      }

      const labelEl = document.getElementById('game-progress-label');
      if (labelEl) labelEl.textContent = `0 / ${totalFiltered} issues to find`;

      enableVoting();
      highlightFilteredElements();
      suppressNonFilteredSa11yStyles();
      hideNonFilteredAnnotations();

      // Sa11y re-scans when it detects DOM changes. Re-apply filtering each time.
      document.addEventListener('sa11y-check-complete', function() {
        if (!window.__filteredMap || window.__filteredMap.size === 0) return;
        suppressNonFilteredSa11yStyles();
        const fErr = window.__filteredErrorCount || 0;
        const fWarn = window.__filteredWarningCount || 0;
        const ps = document.querySelector('sa11y-control-panel')?.shadowRoot?.querySelector('#status');
        if (ps) {
          ps.innerHTML = (fErr  > 0 ? `ERRORS <span class="panel-count">${fErr}</span> ` : '') +
                         (fWarn > 0 ? `WARNINGS <span class="panel-count" id="warning-count">${fWarn}</span>` : '');
        }
      });
    }
  }, 300);
}

  // Show a subtle pulsing ring on all in-scope elements so the player
  // can see which elements are targetable before clicking.
  function highlightFilteredElements() {
    const fMap = window.__filteredMap;
    if (!fMap) return;
    fMap.forEach((type, el) => {
      const target = getVisualTarget(el);
      // No hint outline — elements are not visually pre-highlighted
    });
  }

  // Traverse every shadow root in the DOM (not just [data-sa11y-has-shadow-root]) to find elements.
  // Sa11y may insert sa11y-annotation elements inside shadow roots of Web Components on
  // pages like decathlon.it, making them invisible to document.querySelector().
  function findAllDeep(selector, root) {
    const results = [];
    try { root.querySelectorAll(selector).forEach(el => results.push(el)); } catch(e) {}
    try {
      root.querySelectorAll('*').forEach(el => {
        if (el.shadowRoot) results.push(...findAllDeep(selector, el.shadowRoot));
      });
    } catch(e) {}
    return results;
  }

  // Remove Sa11y yellow borders + ? icons for warnings NOT in the 6 categories.
  function suppressNonFilteredSa11yStyles() {
    const fMap = window.__filteredMap || new Map();
    const all = window.sa11yCheckComplete?.results || [];

    // 1. Hide ALL sa11y-annotation elements everywhere (main DOM + all shadow roots)
    findAllDeep('sa11y-annotation', document.body).forEach(ann => {
      ann.style.setProperty('display', 'none', 'important');
    });

    // 2. Cancel Sa11y yellow borders on ALL warning elements everywhere
    findAllDeep('[data-sa11y-warning]:not([data-sa11y-error])', document.body).forEach(el => {
      el.style.setProperty('outline', 'none', 'important');
      el.style.setProperty('box-shadow', 'none', 'important');
    });

    // 3. Show the annotation for each FILTERED element only.
    //    Sa11y inserts annotation beforebegin of loc → loc.previousElementSibling is the annotation.
    //    This works in both main DOM and shadow DOM.
    const shownLocs = new Set();
    all.forEach(r => {
      if (!fMap.has(r.element)) return;
      const loc = r.element.closest('a, button, [role="link"], [role="button"]') || r.element;
      if (!shownLocs.has(loc)) {
        shownLocs.add(loc);
        let sibling = loc.previousElementSibling;
        while (sibling && sibling.tagName === 'SA11Y-ANNOTATION') {
          sibling.style.setProperty('display', 'block', 'important');
          sibling = sibling.previousElementSibling;
        }
      }
    });
  }

  function hideNonFilteredAnnotations() { /* merged into suppressNonFilteredSa11yStyles */ }
