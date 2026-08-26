# FMS POOL — Retro Pixel 8-Ball Pool

**FMS POOL** is a production-grade, zero-build, browser-based 8-ball pool game built in retro pixel-art style, featuring a custom 2D deterministic physics engine, an intelligent lookahead AI opponent, tournament brackets, mid-match state snapshot preservation, and a non-destructive Firebase Realtime Database global leaderboard ranking ~600 players across many runs.

---

## 1. Quick Start / Running Locally

Because the project uses native ES modules (`import`/`export`), it **must be served over HTTP** (browsers block module scripts loaded via `file://`).

### Option A: Python 3
```bash
# In the repository root:
python -m http.server 8000
```
Open [http://localhost:8000](http://localhost:8000) in your browser.

### Option B: Node / npx
```bash
npx serve .
```

### Option C: VS Code Live Server
Right-click `index.html` and select **Open with Live Server**.

---

## 2. Deploying to GitHub Pages

1. Push this repository to your GitHub repository (e.g. `https://github.com/abhy-kumar/fmspool`).
2. In GitHub, navigate to **Settings** → **Pages**.
3. Under **Build and deployment**:
   - **Source**: Deploy from a branch
   - **Branch**: `main` / `/ (root)`
4. Click **Save**. GitHub Pages will serve the game directly from the root.

---

## 3. Firebase Security Rules Setup

To connect your own Firebase Realtime Database:
1. Open your [Firebase Console](https://console.firebase.google.com/).
2. Select your project and navigate to **Realtime Database** → **Rules**.
3. Copy and paste the entire contents of [`firebase.rules.json`](./firebase.rules.json) into the editor:

```json
{
  "rules": {
    "v1": {
      "meta": { ".read": true, ".write": false },
      "players": {
        ".read": true,
        "$pid": {
          ".write": true,
          ".validate": "newData.hasChildren(['displayName','updatedAt','revision']) && newData.child('displayName').isString() && newData.child('displayName').val().length <= 12 && newData.child('rating').val() >= 0 && newData.child('rating').val() <= 5000 && (!data.exists() || newData.child('revision').val() > data.child('revision').val())"
        }
      },
      "runs": {
        "$pid": {
          ".read": true,
          "$runId": {
            ".write": "!data.exists()",
            ".validate": "newData.hasChildren(['score','mode','at']) && newData.child('score').isNumber() && newData.child('score').val() >= 0 && newData.child('score').val() <= 20000 && newData.child('at').val() <= now + 60000"
          }
        }
      },
      "leaderboard": {
        "players": {
          ".read": true,
          ".indexOn": ["rating","bestRunScore","precision","longestRun","titlesWeighted"],
          "$pid": { ".write": true }
        },
        "runs": {
          ".read": true,
          ".indexOn": ["score","at"],
          "$runId": { ".write": "!data.exists()" }
        }
      },
      "nameIndex": {
        ".read": true,
        "$name": { "$pid": { ".write": "!data.exists()" } }
      }
    }
  }
}
```

> **Security Note**: These rules are open-write by design so the game works seamlessly without requiring third-party authentication. To harden further, enable Anonymous Auth in the Firebase Console and update write rules to require `auth != null && auth.uid == $pid`.

---

## 4. Controls Reference

| Action | Mouse / Touch | Keyboard |
|---|---|---|
| **Coarse Aim** | Click / Tap & Drag anywhere on felt | — |
| **Fine Aim** | Tap on-screen `◀` / `▶` buttons (0.15° / tap, 0.04° / frame held) | `←` / `→` (0.15°), `Shift + ←` / `Shift + →` (0.02°) |
| **Power Control** | Drag right-side power bar, or pull back from cue ball | Hold `Space` to charge (0→1 over 1.2s), Keys `1`–`9` (10%–90%), `0` (100%) |
| **Spin Control** | Tap / Drag red marker on bottom-right cue disc | — |
| **Ball in Hand** | Drag ghost cue ball onto legal table area | — |
| **Call Pocket (8-Ball)** | Tap glowing cyan pocket ring | — |
| **Pause Menu** | Tap top-left `☰` button | `Escape` |

---

## 5. Scoring & Bayesian Ranking Mathematics

### 5.1 The 6 Normalized Components (0..1)
1. **Victory ($V$, 30%)**: $1$ if won, $0$ if lost.
2. **Dominance ($D$, 15%)**: If won: $\text{oppBallsRemaining} / 7$. If lost: $0.5 \times (7 - \text{yourBallsRemaining}) / 7$.
3. **Precision ($P$, 20%)**: $\text{ownPots} / \max(1, \text{shots})$.
4. **Discipline ($C$, 10%)**: $1 - \text{clamp}((\text{fouls} + 2 \times \text{scratches}) / 8, 0, 1)$.
5. **Flair ($F$, 15%)**: $\text{clamp}(\text{longestRun}/8 + 0.15 \times \text{breakPots} + 0.25 \times \text{eightOnBreak} + (\text{tableRun} ? 0.5 : 0), 0, 1)$.
6. **Tempo ($T$, 10%)**: $\text{clamp}(1 - (\text{avgShotSeconds} - 4) / 16, 0, 1)$.

$$\text{Composite } S = 0.30 V + 0.15 D + 0.20 P + 0.10 C + 0.15 F + 0.10 T$$
$$\text{Match Score} = \text{round}(1000 \times S \times \text{DifficultyMult} \times \text{ModeMult})$$

### 5.2 Worked Examples

#### Example A — Strong Pro Win
- `shots=22, ownPots=13, fouls=1, scratches=0, longestRun=6, breakPots=1, eightOnBreak=0, tableRun=false, oppBallsRemaining=4, avgShotSeconds=7, won=true, difficulty=PRO (1.35), mode=T_SEMI (1.20)`
- $V = 1 \to 0.3000$
- $D = 4/7 = 0.5714 \to 0.0857$
- $P = 13/22 = 0.5909 \to 0.1182$
- $C = 1 - (1+0)/8 = 0.8750 \to 0.0875$
- $F = 6/8 + 0.15 \times 1 = 0.9000 \to 0.1350$
- $T = 1 - (7-4)/16 = 0.8125 \to 0.0813$
- **Total $S = 0.8077$** $\to 1000 \times 0.8077 \times 1.35 \times 1.20 = \mathbf{1308}$

#### Example B — Scrappy Loss
- `shots=18, ownPots=4, fouls=3, scratches=1, longestRun=2, yourBallsRemaining=3, avgShotSeconds=12, won=false, difficulty=AMATEUR (1.00), mode=RANKED (1.00)`
- $V = 0 \to 0$
- $D = 0.5 \times (7-3)/7 = 0.2857 \to 0.0429$
- $P = 4/18 = 0.2222 \to 0.0444$
- $C = 1 - (3+2)/8 = 0.3750 \to 0.0375$
- $F = 2/8 = 0.2500 \to 0.0375$
- $T = 1 - (12-4)/16 = 0.5000 \to 0.0500$
- **Total $S = 0.2123$** $\to 1000 \times 0.2123 \times 1.00 \times 1.00 = \mathbf{212}$

### 5.3 Player Rating (Bayesian Shrunk Top-5 Mean)
$$\text{Confidence } \text{conf} = \frac{n}{n + 3}$$
$$\text{Rating} = \text{round}(\text{rawTop5Mean} \times \text{conf} + 400 \times (1 - \text{conf}))$$

For runs `[1308, 1180, 1102, 980, 940, 720, 690]` ($n=7$):
- $\text{Top-5 Mean} = (1308+1180+1102+980+940)/5 = \mathbf{1102}$
- $\text{conf} = 7 / (7 + 3) = 0.70$
- $\text{Rating} = 1102 \times 0.70 + 400 \times 0.30 = \mathbf{891} \to \mathbf{GOLD}$

---

## 6. Non-Destructive Data Persistence & Merge Safety

The game uses an offline-first storage model designed to guarantee zero data loss across devices:

1. **Immutable Write-Once Runs**: Runs are given collision-proof UUIDs `${timestamp}-${pid}-${rand4}` and secured with `.write: "!data.exists()"`. Retries never overwrite or corrupt existing records.
2. **Atomic Player Transactions**: Player nodes are updated inside RTDB `runTransaction` with idempotency guards on `appliedRuns[runId]`.
3. **Field-by-Field Merge Strategy**:
   - `displayName`: Last-Write-Wins by `updatedAt`.
   - `firstSeenAt`, `fastestClearSeconds`: `MIN`.
   - `bestRunScore`, `longestRun`: `MAX`.
   - Monotonic Career Counters (`runsPlayed`, `matchesPlayed`, `matchesWon`, `shots`, `ownPots`, `fouls`): **`MAX` (Never SUM)** to prevent cross-device double-counting of shared history.
   - `unlocks`, `appliedRuns`: `UNION`.
   - `rating`, `tier`, `precision`: Always **RECOMPUTED** from merged inputs.
4. **Offline Outbox**: Pending cloud writes are stored in `fmspool.outbox.v1` with exponential backoff retries (`2s`, `6s`, `15s`, `45s`, `120s`).
5. **Local Backup Safety**: Every write to `fmspool.save.v1` creates a duplicate in `fmspool.save.v1.bak`. If corrupted, it automatically recovers. `localStorage.clear()` is never used.

---

## 7. Known Simplifications

- **2D Planar Physics**: Jump shots and extreme massé curve shots are not simulated.
- **Spin Model**: Spin decay and first-contact follow/draw and side cushion deflection are modeled linearly without 3D rotational inertia tensors.
- **Slop Allowed on Non-8 Balls**: On open table and group balls, slop pots count; called pockets are mandatory only for the 8-ball.
