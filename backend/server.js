// ============================================================
// Access Inspector — Backend Server
// Node.js + Express + SQLite (better-sqlite3) + JWT + bcrypt
// ============================================================
//
// Endpoints:
//   POST /api/signup       → create account (with finger_color), return JWT
//   POST /api/login        → login, return JWT
//   POST /api/scores       → save a game score (auth required)
//   GET  /api/profile      → current user's profile (auth required)
//   GET  /api/leaderboard  → top 50 users by total XP
//
// Run with:
//   npm install
//   npm start
// ============================================================

const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');

// ⚠️  In production, set this via environment variable.
// For local thesis demo, hardcoding is fine.
const JWT_SECRET = 'access-inspector-thesis-secret-change-me';
const PORT = 3000;

// ------------------------------------------------------------
// LEVEL SYSTEM
// ------------------------------------------------------------
// Each level requires progressively more XP (classic RPG curve).
// XP = sum of all score values across all games.
// ------------------------------------------------------------
const LEVELS = [
  { level:  1, minXp:     0, title: 'Newbie'     },
  { level:  2, minXp:  1000, title: 'Apprentice' },
  { level:  3, minXp:  2000, title: 'Detective'  },
  { level:  4, minXp:  3000, title: 'Inspector'  },
  { level:  5, minXp:  4000, title: 'Expert'     },
  { level:  6, minXp:  5000, title: 'Master'     },
  { level:  7, minXp:  6000, title: 'Specialist' },
  { level:  8, minXp:  7000, title: 'Auditor'    },
  { level:  9, minXp:  8000, title: 'Champion'   },
  { level: 10, minXp:  9000, title: 'Legend'     },
];

function computeLevel(xp) {
  // Find the highest level whose minXp the user has reached
  let current = LEVELS[0];
  for (const lvl of LEVELS) {
    if (xp >= lvl.minXp) current = lvl;
    else break;
  }
  // Find the next level (if not at max)
  const nextIndex = LEVELS.findIndex(l => l.level === current.level) + 1;
  const next = LEVELS[nextIndex] || null;

  return {
    level: current.level,
    title: current.title,
    currentXp: xp,
    levelMinXp: current.minXp,
    nextLevelMinXp: next ? next.minXp : null,  // null = max level reached
    xpToNextLevel: next ? next.minXp - xp : 0
  };
}

// ------------------------------------------------------------
// MOOD SYSTEM
// ------------------------------------------------------------
// Mood comes from leaderboard rank:
//   Top 25%      → confident (best)
//   25-50%       → happy
//   50-75%       → worried
//   Bottom 25%   → pokerface (worst, given up)
// LEVEL BOOST: if user is level 4+, mood is bumped up one step.
// ------------------------------------------------------------
const MOOD_ORDER = ['pokerface', 'worried', 'happy', 'confident'];  // worst to best

function computeMood(rankPosition, totalPlayers, level) {
  // If alone in the world, default to happy (no rank to compare)
  if (totalPlayers < 2) return 'happy';

  // Percentile: 0.0 (top) to 1.0 (bottom)
  const percentile = (rankPosition - 1) / totalPlayers;

  let baseMood;
  if (percentile <= 0.25)      baseMood = 'confident';
  else if (percentile <= 0.50) baseMood = 'happy';
  else if (percentile <= 0.75) baseMood = 'worried';
  else                          baseMood = 'pokerface';

  // Level boost: if level 4 or higher, bump mood up one step
  if (level >= 4) {
    const currentIdx = MOOD_ORDER.indexOf(baseMood);
    if (currentIdx < MOOD_ORDER.length - 1) {
      return MOOD_ORDER[currentIdx + 1];
    }
  }

  return baseMood;
}

// ------------------------------------------------------------
// APP SETUP
// ------------------------------------------------------------
const app = express();
app.use(cors());
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  next();
});
app.use(express.json());

// ------------------------------------------------------------
// STATIC FILES — serve Sa11y demo pages for the Tutorials feature
// ------------------------------------------------------------
const DEMO_PATH = process.env.DEMO_PATH || path.join(__dirname, '..', 'docs');
app.use('/sa11y-demo', express.static(DEMO_PATH));
console.log('✓ Serving demo files from:', DEMO_PATH);

// ------------------------------------------------------------
// DATABASE SETUP
// ------------------------------------------------------------
const DB_PATH = process.env.DB_PATH || 'users.db';
const fs = require('fs');
const dbDir = path.dirname(DB_PATH);
if (dbDir && dbDir !== '.' && !fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// USERS table — now includes finger_color
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    finger_color TEXT NOT NULL DEFAULT 'peach',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// SCORES table — unchanged
db.exec(`
  CREATE TABLE IF NOT EXISTS scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    score INTEGER NOT NULL,
    correct INTEGER DEFAULT 0,
    wrong INTEGER DEFAULT 0,
    missed INTEGER DEFAULT 0,
    page_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )
`);

// SESSIONS table — one row per multiplayer game
db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    host_user_id INTEGER NOT NULL,
    target_url  TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'lobby',
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    started_at  DATETIME,
    total_issues INTEGER,
    FOREIGN KEY (host_user_id) REFERENCES users(id)
  )
`);
// Add total_issues to existing DBs that were created before this column existed
try { db.exec(`ALTER TABLE sessions ADD COLUMN total_issues INTEGER`); } catch (_) { /* already exists */ }

// SESSION_PLAYERS table — one row per player per session
db.exec(`
  CREATE TABLE IF NOT EXISTS session_players (
    session_id  INTEGER NOT NULL,
    user_id     INTEGER NOT NULL,
    progress    INTEGER NOT NULL DEFAULT 0,
    final_score INTEGER,
    status      TEXT NOT NULL DEFAULT 'waiting',
    joined_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (session_id, user_id),
    FOREIGN KEY (session_id) REFERENCES sessions(id),
    FOREIGN KEY (user_id)    REFERENCES users(id)
  )
`);

// CANDIDATE_FLAGS table — community verification feature
// Each row = one user flagging one element on one URL as a potential a11y issue.
// The identity of a candidate is (url + dom_selector + reason_category).
// When 2 distinct users flag the same trio, it becomes "confirmed".
db.exec(`
  CREATE TABLE IF NOT EXISTS candidate_flags (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    url              TEXT    NOT NULL,
    dom_selector     TEXT    NOT NULL,
    reason_category  TEXT    NOT NULL,
    reason_text      TEXT,
    user_id          INTEGER NOT NULL,
    session_id       INTEGER,
    confirmed        INTEGER NOT NULL DEFAULT 0,
    created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id)    REFERENCES users(id),
    FOREIGN KEY (session_id) REFERENCES sessions(id)
  )
`);

// Add new columns if they don't exist yet (ALTER TABLE ignores errors if already present)
try { db.exec(`ALTER TABLE sessions ADD COLUMN lobby_countdown_ends_at DATETIME`); } catch(_) {}
try { db.exec(`ALTER TABLE session_players ADD COLUMN warmup_xp_claimed INTEGER NOT NULL DEFAULT 0`); } catch(_) {}

console.log('✓ Database ready');

// ------------------------------------------------------------
// AUTH MIDDLEWARE
// ------------------------------------------------------------
function authRequired(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) return res.status(401).json({ error: 'Missing token.' });

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

function makeToken(user) {
  return jwt.sign(
    { userId: user.id, username: user.username },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
}

// ------------------------------------------------------------
// HELPER — get user's stats and rank
// ------------------------------------------------------------
const VALID_COLORS = ['peach', 'teal', 'orange', 'yellow', 'purple'];

function getUserProfile(userId) {
  const user = db.prepare('SELECT id, username, finger_color FROM users WHERE id = ?').get(userId);
  if (!user) return null;

  // Compute the user's stats from the scores table
  const stats = db.prepare(`
    SELECT
      COALESCE(SUM(score), 0)              AS total_xp,
      COALESCE(SUM(correct), 0)            AS total_issues_found,
      COUNT(DISTINCT page_url)             AS total_sites_visited,
      COUNT(*)                             AS total_games
    FROM scores
    WHERE user_id = ?
  `).get(userId);

  const todayStats = db.prepare(`
    SELECT COALESCE(SUM(score), 0) AS today_xp
    FROM scores WHERE user_id = ? AND date(created_at) = date('now')
  `).get(userId);

  const gamesWon = db.prepare(`
    SELECT COUNT(*) AS n FROM scores WHERE user_id = ? AND score > 0
  `).get(userId).n;

  // Compute the user's rank: how many users have MORE total XP than this user?
  // Rank 1 = highest XP. We use a subquery to sum each user's XP, then rank.
  const rankInfo = db.prepare(`
    SELECT
      COUNT(*) + 1 AS rank
    FROM (
      SELECT user_id, COALESCE(SUM(score), 0) AS xp
      FROM scores
      GROUP BY user_id
      HAVING xp > ?
    )
  `).get(stats.total_xp);

  const totalPlayers = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;

  // Compute level + mood
  const levelInfo = computeLevel(stats.total_xp);
  const mood = computeMood(rankInfo.rank, totalPlayers, levelInfo.level);

  return {
    username:            user.username,
    fingerColor:         user.finger_color,
    totalXp:             stats.total_xp,
    todayXp:             todayStats.today_xp,
    gamesWon:            gamesWon,
    totalIssuesFound:    stats.total_issues_found,
    totalSitesVisited:   stats.total_sites_visited,
    totalGames:          stats.total_games,
    rank:                rankInfo.rank,
    totalPlayers:        totalPlayers,
    mood:                mood,
    ...levelInfo  // level, title, currentXp, levelMinXp, nextLevelMinXp, xpToNextLevel
  };
}

// ============================================================
// POST /api/signup
// ============================================================
app.post('/api/signup', (req, res) => {
  const { username, email, password, finger_color, fingerColor } = req.body || {};

  if (!username || !email || !password) {
    return res.status(400).json({ error: 'Username, email, and password are required.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }
  if (username.length < 3) {
    return res.status(400).json({ error: 'Username must be at least 3 characters.' });
  }

  // Validate finger color (accept both camelCase and snake_case from client)
  const rawColor = finger_color || fingerColor;
  const color = VALID_COLORS.includes(rawColor) ? rawColor : 'peach';

  try {
    const password_hash = bcrypt.hashSync(password, 10);
    const stmt = db.prepare(
      'INSERT INTO users (username, email, password_hash, finger_color) VALUES (?, ?, ?, ?)'
    );
    const info = stmt.run(username, email, password_hash, color);

    const user = { id: info.lastInsertRowid, username };
    const token = makeToken(user);

    res.json({ token, username: user.username, fingerColor: color });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Username or email already taken.' });
    }
    console.error(err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// ============================================================
// POST /api/login
// ============================================================
app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required.' });
  }

  try {
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    if (!user) return res.status(401).json({ error: 'Invalid username or password.' });

    const ok = bcrypt.compareSync(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid username or password.' });

    const token = makeToken(user);
    res.json({ token, username: user.username, fingerColor: user.finger_color });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// ============================================================
// POST /api/scores  (auth required)
// ============================================================
app.post('/api/scores', authRequired, (req, res) => {
  const { score, correct, wrong, missed, page_url } = req.body || {};
  if (typeof score !== 'number') {
    return res.status(400).json({ error: 'Score (number) is required.' });
  }

  try {
    const stmt = db.prepare(`
      INSERT INTO scores (user_id, score, correct, wrong, missed, page_url)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const info = stmt.run(
      req.user.userId,
      Math.max(0, score || 0),
      correct || 0,
      wrong || 0,
      missed || 0,
      page_url || null
    );
    res.json({ ok: true, scoreId: info.lastInsertRowid });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not save score.' });
  }
});

// ============================================================
// GET /api/profile  (auth required)
// Returns the current user's full profile: stats, level, mood, color
// ============================================================
app.get('/api/profile', authRequired, (req, res) => {
  try {
    const profile = getUserProfile(req.user.userId);
    if (!profile) return res.status(404).json({ error: 'User not found.' });
    res.json(profile);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load profile.' });
  }
});

// ============================================================
// GET /api/leaderboard  (public)
// Returns top 50 users ranked by total XP
// ============================================================
app.get('/api/leaderboard', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT
        u.username,
        u.finger_color,
        COALESCE(SUM(s.score), 0) AS total_xp,
        COUNT(s.id)               AS total_games
      FROM users u
      LEFT JOIN scores s ON s.user_id = u.id
      WHERE u.username IS NOT NULL AND u.username != ''
      GROUP BY u.id
      HAVING total_xp > 0
      ORDER BY total_xp DESC
      LIMIT 50
    `).all();

    // Add level info to each entry
    const enriched = rows.map((row, index) => {
      const levelInfo = computeLevel(row.total_xp);
      return {
        rank:        index + 1,
        username:    row.username,
        fingerColor: row.finger_color,
        totalXp:     row.total_xp,
        totalGames:  row.total_games,
        level:       levelInfo.level,
        title:       levelInfo.title
      };
    });

    res.json({ leaderboard: enriched });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load leaderboard.' });
  }
});

// ============================================================
// MULTIPLAYER SESSIONS
// ============================================================

// Helper: get full session state (used by several endpoints)
function getSessionState(sessionId) {
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
  if (!session) return null;

  const players = db.prepare(`
    SELECT sp.user_id, sp.progress, sp.final_score, sp.status, sp.joined_at,
           u.username, u.finger_color
    FROM session_players sp
    JOIN users u ON u.id = sp.user_id
    WHERE sp.session_id = ?
    ORDER BY sp.joined_at ASC
  `).all(sessionId);

  // Enrich each player with their current mood
  const enrichedPlayers = players.map(p => {
    const stats    = db.prepare('SELECT COALESCE(SUM(score),0) AS xp FROM scores WHERE user_id = ?').get(p.user_id);
    const rankInfo = db.prepare(`SELECT COUNT(*)+1 AS rank FROM (SELECT user_id, COALESCE(SUM(score),0) AS xp FROM scores GROUP BY user_id HAVING xp > ?)`).get(stats.xp);
    const total    = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
    const level    = computeLevel(stats.xp).level;
    const mood     = computeMood(rankInfo.rank, total, level);
    return {
      userId:     p.user_id,
      username:   p.username,
      fingerColor: p.finger_color,
      mood,
      progress:   p.progress,
      finalScore: p.final_score,
      status:     p.status
    };
  });

  const hostUser = db.prepare('SELECT username FROM users WHERE id=?').get(session.host_user_id);

  // Calculate seconds remaining in lobby countdown
  let countdownRemaining = null;
  if (session.status === 'lobby' && session.lobby_countdown_ends_at) {
    const endsAt = new Date(session.lobby_countdown_ends_at + 'Z').getTime();
    countdownRemaining = Math.max(0, Math.round((endsAt - Date.now()) / 1000));
  }

  return {
    id:                   session.id,
    hostUserId:           session.host_user_id,
    hostUsername:         hostUser?.username || '',
    targetUrl:            session.target_url,
    status:               session.status,
    createdAt:            session.created_at,
    startedAt:            session.started_at,
    lobbyCountdownEndsAt: session.lobby_countdown_ends_at,
    countdownRemaining,
    totalIssues:          session.total_issues ?? null,
    players:              enrichedPlayers,
    playingElapsedSeconds: (session.status === 'playing' && session.started_at)
      ? Math.max(0, Math.round((Date.now() - new Date(session.started_at + 'Z').getTime()) / 1000))
      : 0
  };
}

// Helper: clean up sessions older than 30 minutes that aren't completed
function cleanOldSessions() {
  try {
    // Delete child rows first to satisfy FK constraints
    db.prepare(`
      DELETE FROM session_players WHERE session_id IN (
        SELECT id FROM sessions
        WHERE status != 'completed'
        AND created_at < datetime('now', '-30 minutes')
      )
    `).run();
    db.prepare(`
      DELETE FROM sessions
      WHERE status != 'completed'
      AND created_at < datetime('now', '-30 minutes')
    `).run();
  } catch (err) {
    console.warn('cleanOldSessions skipped:', err.message);
  }
}

// ------------------------------------------------------------
// POST /api/sessions  — create a new session (host auto-joins)
// ------------------------------------------------------------
app.post('/api/sessions', authRequired, (req, res) => {
  const { target_url } = req.body || {};
  if (!target_url) return res.status(400).json({ error: 'target_url is required.' });

  try {
    const info = db.prepare(
      `INSERT INTO sessions (host_user_id, target_url, lobby_countdown_ends_at)
       VALUES (?, ?, datetime('now', '+60 seconds'))`
    ).run(req.user.userId, target_url);

    const sessionId = info.lastInsertRowid;

    // Host automatically joins
    db.prepare(
      'INSERT INTO session_players (session_id, user_id) VALUES (?, ?)'
    ).run(sessionId, req.user.userId);

    res.json({ sessionId, ...getSessionState(sessionId) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not create session.' });
  }
});

// ------------------------------------------------------------
// GET /api/sessions/open  — list joinable sessions
// ------------------------------------------------------------
app.get('/api/sessions/open', (req, res) => {
  try {
    cleanOldSessions();

    const rows = db.prepare(`
      SELECT s.id, s.target_url, u.username AS host_username,
             COUNT(sp.user_id) AS player_count
      FROM sessions s
      JOIN users u ON u.id = s.host_user_id
      JOIN session_players sp ON sp.session_id = s.id
      WHERE s.status = 'lobby'
      GROUP BY s.id
      HAVING player_count < 4
      ORDER BY s.created_at DESC
    `).all();

    res.json({ sessions: rows.map(r => ({
      id:           r.id,
      hostUsername: r.host_username,
      targetUrl:    r.target_url,
      playerCount:  r.player_count
    }))});
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not fetch sessions.' });
  }
});

// ------------------------------------------------------------
// POST /api/sessions/:id/join
// ------------------------------------------------------------
app.post('/api/sessions/:id/join', authRequired, (req, res) => {
  const sessionId = parseInt(req.params.id);
  try {
    const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
    if (!session)                    return res.status(404).json({ error: 'Session not found.' });
    if (session.status !== 'lobby')  return res.status(400).json({ error: 'Session already started or completed.' });

    const playerCount = db.prepare('SELECT COUNT(*) AS n FROM session_players WHERE session_id = ?').get(sessionId).n;
    if (playerCount >= 4)            return res.status(400).json({ error: 'Session is full.' });

    const already = db.prepare('SELECT 1 FROM session_players WHERE session_id = ? AND user_id = ?').get(sessionId, req.user.userId);
    if (already)                     return res.status(400).json({ error: 'Already in this session.' });

    db.prepare('INSERT INTO session_players (session_id, user_id) VALUES (?, ?)').run(sessionId, req.user.userId);

    // Reset countdown to 30s so the new player has time to warm up
    db.prepare(`UPDATE sessions SET lobby_countdown_ends_at=datetime('now', '+30 seconds') WHERE id=?`).run(sessionId);

    res.json(getSessionState(sessionId));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not join session.' });
  }
});

// ------------------------------------------------------------
// POST /api/sessions/:id/start  (host only)
// ------------------------------------------------------------
app.post('/api/sessions/:id/start', authRequired, (req, res) => {
  const sessionId = parseInt(req.params.id);
  try {
    const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
    if (!session)                          return res.status(404).json({ error: 'Session not found.' });
    if (session.host_user_id !== req.user.userId) return res.status(403).json({ error: 'Only the host can start.' });
    if (session.status !== 'lobby')        return res.status(400).json({ error: 'Session is not in lobby.' });

    const totalIssues = typeof req.body?.totalIssues === 'number' ? req.body.totalIssues : null;
    db.prepare(`UPDATE sessions SET status='playing', started_at=CURRENT_TIMESTAMP, total_issues=? WHERE id=?`).run(totalIssues, sessionId);
    db.prepare(`UPDATE session_players SET status='playing' WHERE session_id=?`).run(sessionId);

    res.json(getSessionState(sessionId));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not start session.' });
  }
});

// ------------------------------------------------------------
// POST /api/sessions/:id/progress  — update own progress, get everyone's
// ------------------------------------------------------------
app.post('/api/sessions/:id/progress', authRequired, (req, res) => {
  const sessionId = parseInt(req.params.id);
  const { progress } = req.body || {};
  if (typeof progress !== 'number' || progress < 0 || progress > 100) {
    return res.status(400).json({ error: 'progress must be a number 0-100.' });
  }
  try {
    const inSession = db.prepare('SELECT 1 FROM session_players WHERE session_id=? AND user_id=?').get(sessionId, req.user.userId);
    if (!inSession) return res.status(403).json({ error: 'Not in this session.' });

    db.prepare('UPDATE session_players SET progress=? WHERE session_id=? AND user_id=?').run(progress, sessionId, req.user.userId);

    // Check if all players are finished → auto-complete the session
    const state = getSessionState(sessionId);
    if (state.status === 'playing') {
      const allDone = state.players.every(p => p.status === 'finished');
      if (allDone) {
        db.prepare(`UPDATE sessions SET status='completed' WHERE id=?`).run(sessionId);
        state.status = 'completed';
      }
    }

    res.json(state);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not update progress.' });
  }
});

// ------------------------------------------------------------
// POST /api/sessions/:id/finish  — submit final score
// ------------------------------------------------------------
app.post('/api/sessions/:id/finish', authRequired, (req, res) => {
  const sessionId = parseInt(req.params.id);
  const { score, correct, wrong, missed } = req.body || {};
  if (typeof score !== 'number') return res.status(400).json({ error: 'score is required.' });

  try {
    const inSession = db.prepare('SELECT 1 FROM session_players WHERE session_id=? AND user_id=?').get(sessionId, req.user.userId);
    if (!inSession) return res.status(403).json({ error: 'Not in this session.' });

    // Save to the regular scores table so it counts toward XP
    const page_url = db.prepare('SELECT target_url FROM sessions WHERE id=?').get(sessionId)?.target_url;
    db.prepare('INSERT INTO scores (user_id, score, correct, wrong, missed, page_url) VALUES (?,?,?,?,?,?)')
      .run(req.user.userId, Math.max(0, score||0), correct||0, wrong||0, missed||0, page_url||null);

    // Mark player as finished in session
    db.prepare(`UPDATE session_players SET status='finished', final_score=?, progress=100 WHERE session_id=? AND user_id=?`)
      .run(score, sessionId, req.user.userId);

    // Move session out of lobby so it no longer appears in the join list
    db.prepare(`UPDATE sessions SET status='playing' WHERE id=? AND status='lobby'`).run(sessionId);

    const state = getSessionState(sessionId);

    // Auto-complete if everyone is done (works for both 'lobby' and 'playing' sessions)
    if (state.status === 'lobby' || state.status === 'playing') {
      const allDone = state.players.every(p => p.status === 'finished');
      if (allDone) {
        db.prepare(`UPDATE sessions SET status='completed' WHERE id=?`).run(sessionId);
        state.status = 'completed';
      }
    }

    res.json(state);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not finish session.' });
  }
});

// ------------------------------------------------------------
// ------------------------------------------------------------
// POST /api/sessions/:id/claim-warmup-xp
// ------------------------------------------------------------
app.post('/api/sessions/:id/claim-warmup-xp', authRequired, (req, res) => {
  const sessionId = parseInt(req.params.id);
  try {
    const inSession = db.prepare('SELECT * FROM session_players WHERE session_id=? AND user_id=?').get(sessionId, req.user.userId);
    if (!inSession) return res.status(403).json({ error: 'Not in this session.' });

    if (inSession.warmup_xp_claimed) return res.status(400).json({ error: 'Warmup XP already claimed.' });

    // Mark as claimed
    db.prepare('UPDATE session_players SET warmup_xp_claimed=1 WHERE session_id=? AND user_id=?').run(sessionId, req.user.userId);

    // Grant 50 XP via scores table
    const session = db.prepare('SELECT target_url FROM sessions WHERE id=?').get(sessionId);
    db.prepare('INSERT INTO scores (user_id, score, correct, wrong, missed, page_url) VALUES (?, 50, 0, 0, 0, ?)').run(req.user.userId, 'warmup:' + (session?.target_url || ''));

    res.json({ ok: true, granted: 50 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not claim warmup XP.' });
  }
});

// GET /api/sessions/:id  — poll full session state
// ------------------------------------------------------------
app.get('/api/sessions/:id', authRequired, (req, res) => {
  const sessionId = parseInt(req.params.id);
  try {
    const inSession = db.prepare('SELECT 1 FROM session_players WHERE session_id=? AND user_id=?').get(sessionId, req.user.userId);
    if (!inSession) return res.status(403).json({ error: 'Not in this session.' });

    const state = getSessionState(sessionId);
    if (!state) return res.status(404).json({ error: 'Session not found.' });
    res.json(state);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load session.' });
  }
});

// ------------------------------------------------------------
// POST /api/sessions/:id/leave
// ------------------------------------------------------------
app.post('/api/sessions/:id/leave', (req, res) => {
  // Accept token from header OR body (sendBeacon can't set headers)
  const authHeader = req.headers.authorization || '';
  const bodyToken = req.body?.token || '';
  const rawToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : bodyToken;
  if (!rawToken) return res.status(401).json({ error: 'Missing token.' });
  let user;
  try { user = jwt.verify(rawToken, JWT_SECRET); }
  catch { return res.status(401).json({ error: 'Invalid token.' }); }
  req.user = user;

  const sessionId = parseInt(req.params.id);
  try {
    const session = db.prepare('SELECT * FROM sessions WHERE id=?').get(sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found.' });

    // If the host leaves a lobby → cancel the whole session
    if (session.host_user_id === req.user.userId && session.status === 'lobby') {
      db.prepare('DELETE FROM session_players WHERE session_id=?').run(sessionId);
      db.prepare('DELETE FROM sessions WHERE id=?').run(sessionId);
      return res.json({ ok: true, cancelled: true });
    }

    // Otherwise just remove the player
    db.prepare('DELETE FROM session_players WHERE session_id=? AND user_id=?').run(sessionId, req.user.userId);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not leave session.' });
  }
});

// ============================================================
// DEV ONLY — wipe all non-completed sessions
// ============================================================
app.delete('/api/sessions/all', (req, res) => {
  db.prepare(`DELETE FROM session_players WHERE session_id IN (SELECT id FROM sessions WHERE status != 'completed')`).run();
  db.prepare(`DELETE FROM sessions WHERE status != 'completed'`).run();
  res.json({ ok: true, message: 'All active sessions cleared.' });
});

// ============================================================
// DEV ONLY — delete users with empty/null username
// ============================================================
app.delete('/api/users/unnamed', (req, res) => {
  db.prepare("DELETE FROM scores WHERE user_id IN (SELECT id FROM users WHERE TRIM(username) = '' OR username IS NULL)").run();
  db.prepare("DELETE FROM users WHERE TRIM(username) = '' OR username IS NULL").run();
  res.json({ ok: true });
});

// DEV — list all users (to debug)
app.get('/api/users/all', (req, res) => {
  const users = db.prepare("SELECT id, username, finger_color FROM users").all();
  res.json({ users });
});

// DEV — delete a user by id
app.delete('/api/users/:id', (req, res) => {
  const id = parseInt(req.params.id);
  db.prepare("DELETE FROM scores WHERE user_id = ?").run(id);
  db.prepare("DELETE FROM session_players WHERE user_id = ?").run(id);
  db.prepare("DELETE FROM users WHERE id = ?").run(id);
  res.json({ ok: true });
});

// ============================================================
// POST /api/candidates  (auth required)
// Body: { url, dom_selector, reason_category, reason_text, session_id }
//
// Teaching note: this endpoint does 4 things in sequence:
//   1. Reject duplicates (same user, same element+reason)
//   2. Insert the flag
//   3. Count distinct users who flagged the same (url, dom_selector, reason_category)
//   4. Award XP based on whether this user is Pioneer (N=1) or Confirmer (N>=2)
// ============================================================
app.post('/api/candidates', authRequired, (req, res) => {
  const { url, dom_selector, reason_category, reason_text, session_id } = req.body || {};

  const ALLOWED_REASONS = [
    'Missing alt text on image',
    'Poor color contrast',
    'Missing label on form field',
    'Vague link text',
    'Missing heading or wrong heading order',
    'Keyboard not accessible',
  ];

  if (!url || !dom_selector || !reason_category) {
    return res.status(400).json({ error: 'url, dom_selector, and reason_category are required.' });
  }
  if (!ALLOWED_REASONS.includes(reason_category)) {
    return res.status(400).json({ error: 'Invalid reason_category. Must be one of the allowed WCAG-aligned reasons.' });
  }

  try {
    // Step 1 — prevent duplicate flags from the same user for the same element+reason
    const alreadyFlagged = db.prepare(`
      SELECT id FROM candidate_flags
      WHERE url = ? AND dom_selector = ? AND reason_category = ? AND user_id = ?
    `).get(url, dom_selector, reason_category, req.user.userId);

    if (alreadyFlagged) {
      return res.status(409).json({ error: 'You already flagged this element with this reason.' });
    }

    // Step 2 — insert the flag
    db.prepare(`
      INSERT INTO candidate_flags (url, dom_selector, reason_category, reason_text, user_id, session_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(url, dom_selector, reason_category, reason_text || null, req.user.userId, session_id || null);

    // Step 3 — count how many DISTINCT users have now flagged this same trio
    const { n: distinctUsers } = db.prepare(`
      SELECT COUNT(DISTINCT user_id) AS n
      FROM candidate_flags
      WHERE url = ? AND dom_selector = ? AND reason_category = ?
    `).get(url, dom_selector, reason_category);

    // Step 4 — decide points and whether to mark confirmed
    // Pioneer (N=1): 0 points now — they earn +2 only when someone else confirms.
    // First confirmer (N=2): +1 now, AND retroactively give pioneer +2.
    // Further confirmers (N>2): +1 now, already confirmed.

    let status, pointsAwarded;

    if (distinctUsers === 1) {
      // Pioneer — no points yet, waiting for community confirmation
      status = 'pending';
      pointsAwarded = 0;

    } else if (distinctUsers === 2) {
      // First confirmer → confirm the issue, pay confirmer +1, pay pioneer +2
      status = 'confirmed_now';
      pointsAwarded = 1;

      // Mark ALL rows for this trio as confirmed
      db.prepare(`
        UPDATE candidate_flags SET confirmed = 1
        WHERE url = ? AND dom_selector = ? AND reason_category = ?
      `).run(url, dom_selector, reason_category);

      // Find the pioneer (the OTHER user who flagged this first)
      const pioneer = db.prepare(`
        SELECT user_id FROM candidate_flags
        WHERE url = ? AND dom_selector = ? AND reason_category = ? AND user_id != ?
        ORDER BY id ASC LIMIT 1
      `).get(url, dom_selector, reason_category, req.user.userId);

      if (pioneer) {
        // Retroactively award +2 to the pioneer
        db.prepare(`
          INSERT INTO scores (user_id, score, correct, wrong, missed, page_url)
          VALUES (?, 2, 0, 0, 0, ?)
        `).run(pioneer.user_id, url);
      }

    } else {
      // Third+ confirmer — already confirmed, award +1
      status = 'confirmed';
      pointsAwarded = 1;
    }

    // Step 5 — write the confirmer's points (pioneer gets 0 now, written above when N=2)
    if (pointsAwarded > 0) {
      db.prepare(`
        INSERT INTO scores (user_id, score, correct, wrong, missed, page_url)
        VALUES (?, ?, 0, 0, 0, ?)
      `).run(req.user.userId, pointsAwarded, url);
    }

    res.json({
      ok: true,
      status,        // 'pending' | 'confirmed_now' | 'confirmed'
      pointsAwarded, // 0 | 1 | 1
      distinctUsers
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not save candidate flag.' });
  }
});

// ============================================================
// GET /api/candidates?url=...  (public — for future "known issues" feature)
// Returns all CONFIRMED community candidates for a given URL
// ============================================================
app.get('/api/candidates', (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'url query param is required.' });

  try {
    const rows = db.prepare(`
      SELECT dom_selector, reason_category, reason_text, COUNT(DISTINCT user_id) AS vote_count
      FROM candidate_flags
      WHERE url = ? AND confirmed = 1
      GROUP BY dom_selector, reason_category
      ORDER BY vote_count DESC
    `).all(url);

    res.json({ candidates: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load candidates.' });
  }
});

// ============================================================
// HEALTH CHECK
// ============================================================
app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'Access Inspector backend' });
});

// ============================================================
// START SERVER
// ============================================================
app.listen(PORT, () => {
  console.log(`✓ Access Inspector backend running at http://localhost:${PORT}`);
});