# Access Inspector

> A gamified Chrome Extension for Web Accessibility Testing, built on top of [Sa11y](https://sa11y.netlify.app/).

Access Inspector turns web accessibility testing into an engaging game. Users earn XP, level up, compete on a leaderboard, and play multiplayer sessions — all while detecting real accessibility issues on any website.

This project was developed as a Master's thesis at **Politecnico di Torino**, in the Communications and Computer Networks Engineering program.

---

## ✨ Features

- 🎮 **Single-player mode** — scan any webpage for accessibility issues and earn XP
- 🏆 **Leaderboard** — compete with other users globally
- 👥 **Multiplayer mode** — join a game session with other players in real time
- ⏳ **Warm-up lobby** — learn with tutorials while waiting for the game to start
- 🧬 **Avatar system** — choose your finger character and color; mood changes based on your rank
- 📊 **Profile dashboard** — track your level, XP, issues found, and sites visited
- 🔍 **Community verification** — flag accessibility issues not detected by Sa11y and earn rewards when confirmed by others

---

## 📸 Screenshots

<table>
  <tr>
    <td align="center"><b>Home</b></td>
    <td align="center"><b>Sign Up</b></td>
    <td align="center"><b>Profile</b></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/popup.png" width="220"/></td>
    <td><img src="docs/screenshots/signup.png" width="220"/></td>
    <td><img src="docs/screenshots/profile.png" width="220"/></td>
  </tr>
  <tr>
    <td align="center"><b>Leaderboard</b></td>
    <td align="center"><b>Multiplayer Lobby</b></td>
    <td align="center"><b>In Action</b></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/leaderboard.png" width="220"/></td>
    <td><img src="docs/screenshots/multiplayer.png" width="220"/></td>
    <td><img src="docs/screenshots/in-action.png" width="220"/></td>
  </tr>
</table>

---

## 🛠️ Installation

> No backend setup needed — just install the extension in Chrome!

1. Download or clone this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable **Developer mode** (toggle in the top right)
4. Click **Load unpacked**
5. Select the `extension/` folder
6. The Access Inspector icon will appear in your Chrome toolbar

---

## 🗂️ Project Structure

```
access-inspector/
├── extension/          # Chrome Extension (Manifest V3)
│   ├── game.js         # Core gamification logic (XP, levels, multiplayer)
│   ├── game-ui.js      # UI rendering for game elements
│   ├── content-script.js  # Injected into web pages
│   ├── background.js   # Service worker
│   ├── popup.html/js   # Extension popup
│   ├── sa11y.umd.js    # Sa11y accessibility checker (bundled)
│   └── icons/          # Avatar SVGs and app icons
└── backend/            # Node.js + Express + SQLite server
    ├── server.js       # API endpoints
    ├── Dockerfile
    └── docker-compose.yml
```

---

## 🧱 Tech Stack

| Layer | Technology |
|---|---|
| Extension | JavaScript, Chrome Manifest V3 |
| Accessibility engine | [Sa11y](https://sa11y.netlify.app/) |
| Backend | Node.js, Express, SQLite |
| Containerization | Docker |
| Tunneling | ngrok |

---

## 📚 Thesis

This extension was developed as part of the Master's thesis:

**"Adding Gamification Mechanics in a Web Exploratory GUI Testing Tool"**
Fatemeh Nouri — Politecnico di Torino, 2026–2027
Supervisors: Prof. Marco Torchiano, Dr. Tommaso Fulcini

---

## 📄 License

The gamification layer (all files in `extension/` except `sa11y.umd.js` and `en.umd.js`) was developed as original work for this thesis.
Sa11y is used under its own open-source license — see [Sa11y on GitHub](https://github.com/ryersondmp/sa11y).
