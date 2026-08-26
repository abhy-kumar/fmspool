# 🎱 FMS POOL

<div align="center">

[![Play Live](https://img.shields.io/badge/PLAY_LIVE-fmspool.vercel.app-2ea44f?style=for-the-badge&logo=vercel)](https://fmspool.vercel.app/)
[![JavaScript](https://img.shields.io/badge/Language-ES2020%20Plain%20JS-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![Build](https://img.shields.io/badge/Build%20Step-ZERO%20(Native%20ESM)-blue?style=for-the-badge)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules)
[![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Web%20%7C%20Mobile%20%7C%20PWA-purple?style=for-the-badge)](https://fmspool.vercel.app/)

**A complete, browser-based 8-ball billiards game in retro pixel-art style.**  
*Featuring 240Hz deterministic physics, lookahead AI opponents, single-elimination tournament cups, non-destructive persistence, and a real-time global leaderboard.*

[**🕹️ Play Game Online**](https://fmspool.vercel.app/) • [**🏆 View Leaderboards**](https://fmspool.vercel.app/) • [**🤖 LLMs Context**](https://fmspool.vercel.app/llms.txt)

</div>

---

## 🌟 Key Features & Highlights

- **🎯 Authentic 2D Deterministic Physics (240Hz)**
  - Fixed-step substep integrator (`dt = 1/240s`) guaranteeing zero ball tunneling (`MAX_SPEED * DT < BALL_R`).
  - Realistic cushion rebound, rolling friction, elastic ball-ball pairwise collisions, and side/top/backspin deflection.

- **🤖 Intelligent Lookahead Pool AI**
  - 4 Difficulty Tiers: `ROOKIE`, `AMATEUR`, `PRO`, and `LEGEND`.
  - Candidate generation with ray-cast clearance, cut angle limits ($\le 78^\circ$), physics lookahead cloning, safety play fallbacks, and 7 distinct pixel AI personalities with custom taunts.

- **🏆 Single-Elimination Tournament Mode**
  - 4 Progressive Cups: **Bronze Cup**, **Silver Cup**, **Gold Cup**, and **Champion Invitational**.
  - 8-player bracket trees with instant AI-vs-AI weighted coin-flip resolutions and escalating coin payouts.

- **✨ 100% Procedural Generation (0 Binary Assets)**
  - **Zero image files**: All 16 balls $\times$ 4 roll frames, 2x2 Bayer dithered felt, 6 cue sticks, 7 AI portraits, and 6 tier badges are procedurally baked onto offscreen canvas caches at boot.
  - **Zero audio files**: Complete 8-bit procedural sound synthesizer built with the Web Audio API (5 algorithmic tunes + 10 dynamic SFX).

- **📊 6-Component Match Scoring & Bayesian Rating**
  - Metrics: Victory ($30\%$), Dominance ($15\%$), Precision ($20\%$), Discipline ($10\%$), Flair ($15\%$), and Tempo ($10\%$).
  - Bayesian shrunk rating formula ($conf = n/(n+3)$) safely ranking ~600 global players across 6 competitive tiers (Bronze to Master).

- **🛡️ Rock-Solid Offline-First Persistence**
  - Redundant `.bak` localStorage backups, mid-match snapshotting, and offline outbox queuing with exponential backoff.
  - Multi-tab synchronization and field-by-field MAX-not-SUM merge policy to eliminate double-counting across devices.

---

## 🕹️ Controls & How to Play

| Action | Mouse / Touch Controls | Keyboard Shortcut |
|---|---|---|
| **Aim** | Tap / drag anywhere on the table felt | `Arrow Left` / `Arrow Right` (Fine aim) |
| **Pull-back & Strike** | Drag back the cue stick or cue ball and release | `Spacebar` (hold to charge & release) |
| **Power Slider** | Drag the vertical power slider on the right | Keys `1` through `9`, `0` for 100% |
| **Hit Button** | Tap the dedicated green `HIT` button | `Spacebar` |
| **English / Spin** | Drag the red marker on the cue disc (bottom-right) | — |
| **Ball in Hand** | Drag the cue ball anywhere behind line / table | Touch & release |
| **Pause Menu** | Tap `=` at the top-left | `Escape` |

---

## 🛠️ Tech Stack & Zero-Build Philosophy

```
FMS POOL
├── Frontend Architecture : Plain JavaScript (ES2020 Modules)
├── Rendering Engine      : HTML5 Canvas 2D Context (512x288 @ Integer Pixel Scaling)
├── Audio Engine          : Web Audio API (Custom Fourier Pulse Waves + Noise synthesis)
├── Database & Backend    : Firebase Realtime Database (REST + Client SDK)
├── Deployment            : Vercel (Auto-deploy on git push)
└── Build Dependencies    : ZERO (0 npm packages, 0 bundlers, 0 transpilers)
```

---

## 🚀 Local Development

Since FMS POOL uses native ES modules with zero build tools, you can serve the directory with any local static HTTP server:

```bash
# Clone repository
git clone https://github.com/abhy-kumar/fmspool.git
cd fmspool

# Start local static server (Python)
python -m http.server 8000

# Or using Node http-server / npx serve
npx serve .
```

Open `http://localhost:8000` in your browser.

---

## 🔒 Firebase Realtime Database Security Rules

Copy `firebase.rules.json` into your Firebase Console under **Realtime Database > Rules** to secure the global leaderboard:

```json
{
  "rules": {
    "v1": {
      "runs": {
        "$playerId": {
          "$runId": {
            ".read": true,
            ".write": "!data.exists() && newData.exists() && newData.child('score').isNumber() && newData.child('score').val() >= 0 && newData.child('score').val() <= 10000"
          }
        }
      },
      "players": {
        "$playerId": {
          ".read": true,
          ".write": "auth != null || true",
          ".indexOn": ["rating", "bestRunScore", "longestRun", "precision", "titlesWeighted"]
        }
      }
    }
  }
}
```

---

## 🤖 AI & LLMs Discovery

FMS POOL provides machine-readable endpoints for AI agents and LLM indexers:
- **`llms.txt`**: [`https://fmspool.vercel.app/llms.txt`](https://fmspool.vercel.app/llms.txt)
- **`llms-full.txt`**: [`https://fmspool.vercel.app/llms-full.txt`](https://fmspool.vercel.app/llms-full.txt)
- **`sitemap.xml`**: [`https://fmspool.vercel.app/sitemap.xml`](https://fmspool.vercel.app/sitemap.xml)

---

## 📄 License

Distributed under the MIT License. Developed by **[abhy-kumar](https://github.com/abhy-kumar)**.
