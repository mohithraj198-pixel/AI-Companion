import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { AppSettings } from '../../shared/types';
import { SecureStore } from './secureStore';
import { QuotaTracker } from './quotaTracker';

export class SettingsStore {
  private configPath: string;
  private settings: AppSettings;
  private secureStore: SecureStore;
  private quotaTracker: QuotaTracker;

  constructor(secureStore: SecureStore, quotaTracker: QuotaTracker) {
    this.secureStore = secureStore;
    this.quotaTracker = quotaTracker;
    this.configPath = path.join(app.getPath('userData'), 'config.json');

    const defaults: AppSettings = {
      groqEndpoint: 'https://api.groq.com/openai/v1/chat/completions',
      groqModel: 'qwen/qwen3.8-27b',
      hasApiKey: false,
      maskedApiKey: '',
      dailyLimit: 100,
      requestsToday: 0,
      sensitivity: 50,
      minConfidence: 0.35,
      selectedDisplayId: '',
      captureIntervalSeconds: 8,
      monitoringEnabled: true,
      speechMuted: false,
      speechRate: 1.0,
      speechPitch: 1.0,
      selectedVoiceURI: '',
      privacyConsentGiven: false,
      excludedProcesses: [
        '1password',
        'bitwarden',
        'keepass',
        'lastpass',
        'enpass',
        'dashlane',
        'nordpass',
        'chrome',
        'msedge',
        'firefox',
        'brave',
        'opera',
        'tor'
      ],
      excludedTitleKeywords: [
        'incognito',
        'private browsing',
        'inprivate',
        'password',
        'credential',
        'credit card',
        'banking',
        'login',
        'signin',
        'secret',
        'token',
        'auth'
      ],
      historyRetentionMinutes: 60,
      encryptedHistoryCount: 0
    };

    let loaded: Partial<AppSettings> = {};
    if (fs.existsSync(this.configPath)) {
      try {
        const content = fs.readFileSync(this.configPath, 'utf-8');
        loaded = JSON.parse(content);
      } catch (err) {
        console.error('Failed reading configuration file', err);
      }
    }

    if (loaded.groqEndpoint && loaded.groqEndpoint.includes('/responses')) {
      loaded.groqEndpoint = loaded.groqEndpoint.replace(/\/responses$/, '/chat/completions');
    }

    this.settings = {
      ...defaults,
      ...loaded,
      hasApiKey: this.secureStore.hasApiKey(),
      maskedApiKey: this.secureStore.getMaskedApiKey(),
      requestsToday: this.quotaTracker.getRequestsToday(),
      encryptedHistoryCount: this.secureStore.getEncryptedHistoryCount()
    };

    // If loaded had outdated endpoint, persist corrected settings
    if (loaded.groqEndpoint && loaded.groqEndpoint.includes('/chat/completions')) {
      this.updateSettings({ groqEndpoint: this.settings.groqEndpoint });
    }
  }

  public getSettings(): AppSettings {
    return {
      ...this.settings,
      hasApiKey: this.secureStore.hasApiKey(),
      maskedApiKey: this.secureStore.getMaskedApiKey(),
      requestsToday: this.quotaTracker.getRequestsToday(),
      encryptedHistoryCount: this.secureStore.getEncryptedHistoryCount()
    };
  }

  public updateSettings(partial: Partial<AppSettings>): AppSettings {
    this.settings = {
      ...this.settings,
      ...partial,
      hasApiKey: this.secureStore.hasApiKey(),
      maskedApiKey: this.secureStore.getMaskedApiKey(),
      requestsToday: this.quotaTracker.getRequestsToday(),
      encryptedHistoryCount: this.secureStore.getEncryptedHistoryCount()
    };

    // Strip sensitive fields before saving plain config.json!
    // NEVER save API key in plain config.json
    const toSave: any = { ...this.settings };
    delete toSave.hasApiKey;
    delete toSave.maskedApiKey;
    delete toSave.requestsToday;
    delete toSave.encryptedHistoryCount;

    try {
      fs.writeFileSync(this.configPath, JSON.stringify(toSave, null, 2), 'utf-8');
    } catch (err) {
      console.error('Failed saving configuration file', err);
    }

    return this.getSettings();
  }
}
