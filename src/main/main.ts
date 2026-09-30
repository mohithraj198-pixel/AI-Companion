import { app, BrowserWindow, ipcMain, screen, globalShortcut, Tray, Menu, nativeImage } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { SecureStore } from './services/secureStore';
import { QuotaTracker } from './services/quotaTracker';
import { SettingsStore } from './services/settingsStore';
import { PrivacyShield } from './services/privacyShield';
import { ScreenMonitor } from './services/screenMonitor';
import { GroqClient } from './services/groqClient';
import { AppSettings, CatAnimationState, GroqSuggestion } from '../shared/types';

let catWindow: BrowserWindow | null = null;
let settingsWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

let secureStore: SecureStore;
let quotaTracker: QuotaTracker;
let settingsStore: SettingsStore;
let privacyShield: PrivacyShield;
let screenMonitor: ScreenMonitor;

// Allow text-to-speech voice playback without requiring prior window click gesture
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

function createCatWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;

  const winWidth = 320;
  const winHeight = 340;
  const posX = width - winWidth - 30;
  const posY = height - winHeight - 30;

  catWindow = new BrowserWindow({
    title: '',
    width: winWidth,
    height: winHeight,
    x: posX,
    y: posY,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    hasShadow: false,
    thickFrame: false,
    roundedCorners: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  // Prevent Windows title tooltip on hover
  catWindow.on('page-title-updated', (e) => e.preventDefault());

  // Keep on top even when switching full-screen apps
  catWindow.setAlwaysOnTop(true, 'screen-saver');

  const catHtmlPath = path.join(__dirname, '../renderer/cat/index.html');
  catWindow.loadFile(catHtmlPath);

  catWindow.on('closed', () => {
    catWindow = null;
  });
}

function openSettingsWindow() {
  if (settingsWindow) {
    if (settingsWindow.isMinimized()) settingsWindow.restore();
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    title: 'AI Companion - Settings & Privacy',
    width: 780,
    height: 720,
    minWidth: 640,
    minHeight: 550,
    backgroundColor: '#0f172a',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  const settingsHtmlPath = path.join(__dirname, '../renderer/settings/index.html');
  settingsWindow.loadFile(settingsHtmlPath);

  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

function createTrayBitmapIcon(): Electron.NativeImage {
  const w = 16;
  const h = 16;
  const buf = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const dx = x - 7.5;
      const dy = y - 7.5;
      const distSq = dx * dx + dy * dy;
      if (distSq <= 45) {
        // Indigo / purple companion head
        buf[idx] = 99;      // R (#6366f1)
        buf[idx + 1] = 102; // G
        buf[idx + 2] = 241; // B
        buf[idx + 3] = 255; // A

        // Cyan cat eyes
        if ((y === 6 || y === 7) && (x === 5 || x === 10)) {
          buf[idx] = 56;      // #38bdf8
          buf[idx + 1] = 189;
          buf[idx + 2] = 248;
        }
      } else if (distSq <= 56) {
        buf[idx] = 99;
        buf[idx + 1] = 102;
        buf[idx + 2] = 241;
        buf[idx + 3] = 130;
      } else {
        buf[idx + 3] = 0;
      }
    }
  }
  return nativeImage.createFromBitmap(buf, { width: w, height: h });
}

function setupTray() {
  const iconCandidatePaths = [
    path.join(__dirname, '../../resources/tray.png'),
    path.join(__dirname, '../../../resources/tray.png'),
    path.join(process.cwd(), 'resources', 'tray.png'),
    path.join(process.resourcesPath || '', 'resources', 'tray.png')
  ];

  let trayIcon: Electron.NativeImage | null = null;
  for (const p of iconCandidatePaths) {
    if (fs.existsSync(p)) {
      trayIcon = nativeImage.createFromPath(p);
      break;
    }
  }

  if (!trayIcon || trayIcon.isEmpty()) {
    trayIcon = createTrayBitmapIcon();
  }

  try {
    tray = new Tray(trayIcon);
    tray.setToolTip('AI Companion - Floating Coding Assistant');
  } catch (err) {
    console.warn('Tray icon setup skipped:', err);
  }

  const updateTrayMenu = () => {
    const isMonitoring = screenMonitor ? screenMonitor.isActive() : false;
    const settings = settingsStore.getSettings();

    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'AI Companion',
        enabled: false
      },
      { type: 'separator' },
      {
        label: isMonitoring ? '⏸ Pause Monitoring' : '▶ Resume Monitoring',
        click: () => {
          if (screenMonitor) {
            const active = screenMonitor.toggle();
            settingsStore.updateSettings({ monitoringEnabled: active });
            updateTrayMenu();
          }
        }
      },
      {
        label: settings.speechMuted ? '🔊 Unmute Voice' : '🔇 Mute Voice',
        click: () => {
          const updated = settingsStore.updateSettings({ speechMuted: !settings.speechMuted });
          if (catWindow) catWindow.webContents.send('settings-updated', updated);
          if (settingsWindow) settingsWindow.webContents.send('settings-updated', updated);
          updateTrayMenu();
        }
      },
      {
        label: '⚙ Settings & Privacy...',
        click: () => openSettingsWindow()
      },
      { type: 'separator' },
      {
        label: 'Exit AI Companion',
        click: () => app.quit()
      }
    ]);

    tray?.setContextMenu(contextMenu);
  };

  updateTrayMenu();
  tray?.on('double-click', () => openSettingsWindow());
}

function registerShortcuts() {
  // Global shortcut to toggle pause/resume monitoring: Ctrl+Alt+M
  globalShortcut.register('CommandOrControl+Alt+M', () => {
    if (screenMonitor) {
      const active = screenMonitor.toggle();
      settingsStore.updateSettings({ monitoringEnabled: active });
      const current = settingsStore.getSettings();
      if (catWindow) catWindow.webContents.send('settings-updated', current);
    }
  });

  // Global shortcut to open settings: Ctrl+Alt+S
  globalShortcut.register('CommandOrControl+Alt+S', () => {
    openSettingsWindow();
  });

  // Global shortcut to dismiss message: Ctrl+Alt+D
  globalShortcut.register('CommandOrControl+Alt+D', () => {
    if (catWindow) {
      catWindow.webContents.send('cat-state-change', { state: 'idle' });
    }
  });
}

function setupIpc() {
  ipcMain.handle('get-settings', () => {
    return settingsStore.getSettings();
  });

  ipcMain.handle('update-settings', (_, partial: Partial<AppSettings>) => {
    const updated = settingsStore.updateSettings(partial);
    screenMonitor.updateSettings(updated);
    privacyShield.updateExclusions(updated.excludedProcesses, updated.excludedTitleKeywords);

    if (partial.monitoringEnabled !== undefined) {
      if (partial.monitoringEnabled && !screenMonitor.isActive()) {
        screenMonitor.start();
      } else if (!partial.monitoringEnabled && screenMonitor.isActive()) {
        screenMonitor.stop();
      }
    }

    if (catWindow) catWindow.webContents.send('settings-updated', updated);
    if (settingsWindow) settingsWindow.webContents.send('settings-updated', updated);
    return updated;
  });

  ipcMain.handle('save-api-key', (_, apiKey: string) => {
    const ok = secureStore.saveApiKey(apiKey);
    const updated = settingsStore.getSettings();
    if (catWindow) catWindow.webContents.send('settings-updated', updated);
    if (settingsWindow) settingsWindow.webContents.send('settings-updated', updated);
    return ok;
  });

  ipcMain.handle('delete-api-key', () => {
    secureStore.deleteApiKey();
    const updated = settingsStore.getSettings();
    if (catWindow) catWindow.webContents.send('settings-updated', updated);
    if (settingsWindow) settingsWindow.webContents.send('settings-updated', updated);
    return true;
  });

  ipcMain.handle('test-groq-connection', async (_, { apiKey, endpoint, model }) => {
    const keyToTest = apiKey || secureStore.getApiKey() || '';
    const settings = settingsStore.getSettings();
    const endpointToTest = endpoint || settings.groqEndpoint;
    const modelToTest = model || settings.groqModel;
    return await GroqClient.testConnection(keyToTest, endpointToTest, modelToTest);
  });

  ipcMain.handle('get-displays', async () => {
    return await screenMonitor.getAvailableDisplays();
  });

  ipcMain.handle('toggle-monitoring', () => {
    const active = screenMonitor.toggle();
    settingsStore.updateSettings({ monitoringEnabled: active });
    return active;
  });

  ipcMain.handle('is-monitoring', () => {
    return screenMonitor.isActive();
  });

  ipcMain.handle('open-settings', () => {
    openSettingsWindow();
  });

  ipcMain.handle('close-settings', () => {
    if (settingsWindow) settingsWindow.close();
  });

  ipcMain.handle('dismiss-suggestion', () => {
    if (catWindow) {
      catWindow.webContents.send('cat-state-change', { state: 'idle' });
    }
  });

  ipcMain.handle('purge-history', () => {
    return screenMonitor.purgeOldHistory();
  });

  ipcMain.handle('get-active-window', () => {
    return privacyShield.getLastActiveWindow();
  });
}

app.whenReady().then(async () => {
  secureStore = new SecureStore();
  quotaTracker = new QuotaTracker();
  settingsStore = new SettingsStore(secureStore, quotaTracker);

  const initialSettings = settingsStore.getSettings();
  privacyShield = new PrivacyShield(initialSettings.excludedProcesses, initialSettings.excludedTitleKeywords);
  screenMonitor = new ScreenMonitor(secureStore, privacyShield, quotaTracker, initialSettings);

  screenMonitor.setCallbacks({
    onSuggestion: (suggestion: GroqSuggestion) => {
      if (catWindow) {
        catWindow.webContents.send('groq-suggestion', suggestion);
      }
    },
    onStateChange: (state: CatAnimationState, message?: string) => {
      if (catWindow) {
        catWindow.webContents.send('cat-state-change', { state, message });
      }
    },
    onQuotaUpdated: (requestsToday: number) => {
      const updated = settingsStore.getSettings();
      if (settingsWindow) {
        settingsWindow.webContents.send('settings-updated', updated);
      }
    },
    onError: (errMsg: string) => {
      if (catWindow) {
        catWindow.webContents.send('cat-state-change', { state: 'error', message: errMsg });
      }
    }
  });

  privacyShield.setListener((isShielded, info) => {
    if (isShielded) {
      if (catWindow) {
        catWindow.webContents.send('cat-state-change', {
          state: 'shielded',
          message: info.shieldReason || 'Sensitive app shielded'
        });
      }
    } else {
      if (catWindow && screenMonitor.isActive()) {
        catWindow.webContents.send('cat-state-change', { state: 'idle' });
      }
    }
    if (settingsWindow) {
      settingsWindow.webContents.send('shield-status', info);
    }
  });

  setupIpc();
  createCatWindow();
  setupTray();
  registerShortcuts();

  // If user hasn't given privacy consent or API key is missing, open settings automatically on first run
  if (!initialSettings.privacyConsentGiven || !initialSettings.hasApiKey) {
    openSettingsWindow();
  } else if (initialSettings.monitoringEnabled) {
    screenMonitor.start();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createCatWindow();
    }
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (screenMonitor) {
    screenMonitor.destroy();
  }
});

app.on('window-all-closed', () => {
  // On Windows, keep app running in background tray even if settings is closed
});
