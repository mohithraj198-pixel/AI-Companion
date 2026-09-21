# AI Companion 🐱⚡

**AI Companion** is a desktop application for Windows built with Electron and TypeScript. It features a small, friendly floating cat that sits on your desktop, observes your screen in real time, and provides concise, actionable coding suggestions and points out code mistakes/errors powered by **Groq Vision AI** (`qwen/qwen3.8-27b`).

---

## 🌟 Key Features

- **Desktop Floating Cat Companion**:
  - Transparent, frameless, always-on-top overlay.
  - Smooth desktop dragging (drag anywhere on the cat).
  - Expressive animations: breathing, ear twitches, tail wags, eye blinks, speaking, thinking, sleeping (paused), privacy-shielded (blindfold), and **interactive pointing animation when code mistakes or bugs are spotted**.
- **Groq Vision AI Integration**:
  - Uses Groq's endpoint: `https://api.groq.com/openai/v1/chat/completions`.
  - Vision model: `qwen/qwen3.8-27b`.
  - Specifically spots code errors, syntax mistakes, typos, missing variables, or runtime bugs and points them out clearly.
    ```json
    {
      "text": "one short helpful coding suggestion",
      "urgency": "low|medium|high",
      "confidence": 0.0-1.0
    }
    ```
- **Windows DPAPI Secure Key Storage (`safeStorage`)**:
  - Your Groq API key is encrypted using Windows Data Protection API (DPAPI) via Electron `safeStorage`.
  - Keys are **never** logged, never committed to git, and never written to plain-text files.
- **Privacy Shield & Active Window Blocker**:
  - Real-time foreground window detection.
  - Screen capture **pauses immediately** whenever an excluded app (e.g. 1Password, Bitwarden, KeePass, web browsers in private/incognito mode) or sensitive window title keyword (e.g. "password", "bank", "credential") is active.
- **Smart Difference Detection (Quota Saver)**:
  - Downsampled pixel comparison checks screen changes between intervals.
  - Skips unchanged screens to preserve network bandwidth and daily API quotas.
- **Windows Text-to-Speech (TTS)**:
  - Speaks suggestions aloud using Windows installed TTS voices (e.g., Microsoft David, Zira, Mark).
  - Speed (rate) and pitch controls.
  - Speech mute/unmute toggle — **text messages still appear on screen when voice is muted**.
- **Configurable Monitor Selection & Daily Quota**:
  - Select which connected display to monitor.
  - Set daily request caps (e.g. 100 requests/day) with automatic midnight reset.
  - Sensitivity threshold slider to fine-tune image diff triggers.
- **Encrypted Local History & Retention**:
  - Temporary screenshot caches are encrypted locally and automatically deleted after the selected retention schedule (e.g., immediate, 1h, 6h, 24h).
  - Manual "Purge Encrypted History Now" button.

---

## 🚀 Getting Started

### Prerequisites

- **Windows 10 or 11** (64-bit)
- **Node.js**: v18+ (tested on Node v24)
- **npm**: v9+ (tested on npm v11)

### Installation

1. Clone or open the repository folder in your terminal:
   ```bash
   cd d:\new
   ```

2. Install dependencies:
   ```bash
   cmd /c "npm install"
   ```

3. Build the native helper and bundles:
   ```bash
   cmd /c "npm run build"
   ```

---

## 🔑 Entering Your Groq API Key

You will enter your Groq API key manually after launching the application:

1. Launch the application:
   ```bash
   cmd /c "npm start"
   ```
2. On initial startup, the **Settings & Privacy** window opens automatically. (You can also open it at any time by double-clicking the floating cat, clicking the ⚙ gear button, or pressing <kbd>Ctrl</kbd> + <kbd>Alt</kbd> + <kbd>S</kbd>).
3. Navigate to the **⚡ Groq AI Config** tab.
4. Paste your Groq API key (`gsk_...`) into the **Groq API Key** field.
5. Click **Save Key**. The key is encrypted immediately into Windows DPAPI storage.
6. Click **⚡ Test Groq Connection** to verify your key and network connectivity.

---

## 🛡️ Privacy Behavior & Sensitive App Shield

- **Privacy Consent**: The companion requires you to accept the Privacy Consent agreement in the Settings window before any screenshots are taken.
- **Direct Transmission**: Screenshots are sent strictly to your personal Groq API endpoint only while monitoring is actively enabled.
- **Excluded Apps (Immediate Auto-Pause)**:
  - Default processes: `1password`, `bitwarden`, `keepass`, `lastpass`, `enpass`, `dashlane`, `nordpass`, `chrome`, `msedge`, `firefox`, `brave`, `opera`, `tor`.
  - Default title keywords: `incognito`, `private browsing`, `password`, `credential`, `credit card`, `banking`, `login`, `signin`, `secret`, `token`, `auth`.
  - Manage and add custom processes and keywords in the **🚫 Excluded Apps** tab.
  - When an excluded window is detected in the foreground, the floating cat wears a red `SHIELDED` blindfold, and screen captures are immediately skipped.

---

## ⌨️ Global Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| <kbd>Ctrl</kbd> + <kbd>Alt</kbd> + <kbd>M</kbd> | Pause / Resume Screen Monitoring |
| <kbd>Ctrl</kbd> + <kbd>Alt</kbd> + <kbd>S</kbd> | Open Settings & Privacy Window |
| <kbd>Ctrl</kbd> + <kbd>Alt</kbd> + <kbd>D</kbd> | Dismiss Current Speech Bubble |

---

## 📦 Building & Packaging for Windows

### Build Commands

- **Type Check**:
  ```bash
  cmd /c "npm run typecheck"
  ```
- **Compile Main & Preload**:
  ```bash
  cmd /c "npm run build:main"
  ```
- **Build Renderer with Vite**:
  ```bash
  cmd /c "npm run build:renderer"
  ```
- **Full Build**:
  ```bash
  cmd /c "npm run build"
  ```

### Windows Installer / Executable Packaging

To package the application into a standalone Windows installer (`.exe` in `release/`):

```bash
cmd /c "npm run package:win"
```

The output NSIS installer and unpacked binaries will be placed in the `release/` directory.

---

## 📁 Project Architecture

```
ai-companion/
├── resources/
│   ├── active_window.ps1     # Native Windows foreground window watcher (Device Guard safe)
│   ├── ActiveWindow.cs       # C# P/Invoke source for compiled fallback
│   └── active_window.exe     # Compiled native helper binary
├── src/
│   ├── main/
│   │   ├── main.ts           # Electron main process, window management, tray, hotkeys
│   │   └── services/
│   │       ├── secureStore.ts   # Windows DPAPI safeStorage for keys & encrypted history
│   │       ├── privacyShield.ts # Foreground window watcher & sensitive app auto-pause
│   │       ├── screenMonitor.ts # desktopCapturer, diff calculation, Groq vision loop
│   │       ├── groqClient.ts    # Groq API vision client, JSON parser, error sanitization
│   │       ├── quotaTracker.ts  # Daily request limits & midnight rollover
│   │       └── settingsStore.ts # Non-sensitive persistent settings
│   ├── preload/
│   │   └── preload.ts        # Type-safe IPC bridge exposed to renderer
│   ├── renderer/
│   │   ├── cat/              # Floating Cat Overlay (HTML, CSS animations, SpeechSynthesis)
│   │   └── settings/         # Settings & Privacy Window (Tabs, DPAPI key manager, Shield)
│   └── shared/
│       └── types.ts          # Shared TypeScript interfaces & types
├── package.json              # Project dependencies & packaging config
├── tsconfig.json             # TypeScript root bundler configuration
├── tsconfig.main.json        # Main process CommonJS TypeScript configuration
├── vite.config.ts            # Vite multi-page renderer bundling configuration
└── README.md                 # Complete documentation
```

---

## 📄 License

MIT License. Built for seamless and private desktop AI pair programming.
