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

function setupTray() {
  // Create a simple SVG or default native image for tray
  const iconSvg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="#6366f1">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/>
      <circle cx="9" cy="10" r="1.5"/>
      <circle cx="15" cy="10" r="1.5"/>
      <path d="M12 15c-1.5 0-2.5-.5-3-1 1-1 2-1 3-1s2 0 3 1c-.5.5-1.5 1-3 1z"/>
    </svg>`;
  const iconBuffer = Buffer.from(iconSvg);
  const trayIcon = nativeImage.createFromBuffer(iconBuffer).resize({ width: 16, height: 16 });

  tray = new Tray(trayIcon);
  tray.setToolTip('AI Companion - Floating Coding Assistant');

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
  tray.on('double-click', () => openSettingsWindow());
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
