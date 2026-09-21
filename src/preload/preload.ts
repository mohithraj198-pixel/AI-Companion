import { contextBridge, ipcRenderer } from 'electron';
import { AppSettings, DisplaySource, GroqSuggestion, CatAnimationState, ActiveWindowInfo, TestConnectionResult } from '../shared/types';

export const API = {
  // Settings & Configuration
  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke('get-settings'),
  updateSettings: (settings: Partial<AppSettings>): Promise<AppSettings> => ipcRenderer.invoke('update-settings', settings),
  saveApiKey: (apiKey: string): Promise<boolean> => ipcRenderer.invoke('save-api-key', apiKey),
  deleteApiKey: (): Promise<boolean> => ipcRenderer.invoke('delete-api-key'),
  testGroqConnection: (apiKey?: string, endpoint?: string, model?: string): Promise<TestConnectionResult> => 
    ipcRenderer.invoke('test-groq-connection', { apiKey, endpoint, model }),

  // Displays & Monitors
  getDisplays: (): Promise<DisplaySource[]> => ipcRenderer.invoke('get-displays'),

  // Monitoring
  toggleMonitoring: (): Promise<boolean> => ipcRenderer.invoke('toggle-monitoring'),
  isMonitoring: (): Promise<boolean> => ipcRenderer.invoke('is-monitoring'),

  // Window Controls
  openSettings: (): Promise<void> => ipcRenderer.invoke('open-settings'),
  closeSettings: (): Promise<void> => ipcRenderer.invoke('close-settings'),
  dismissSuggestion: (): Promise<void> => ipcRenderer.invoke('dismiss-suggestion'),
  purgeHistory: (): Promise<number> => ipcRenderer.invoke('purge-history'),
  getActiveWindow: (): Promise<ActiveWindowInfo> => ipcRenderer.invoke('get-active-window'),

  // Event Listeners
  onSuggestion: (callback: (suggestion: GroqSuggestion) => void) => {
    const handler = (_: any, data: GroqSuggestion) => callback(data);
    ipcRenderer.on('groq-suggestion', handler);
    return () => ipcRenderer.removeListener('groq-suggestion', handler);
  },
  onStateChange: (callback: (state: CatAnimationState, message?: string) => void) => {
    const handler = (_: any, data: { state: CatAnimationState; message?: string }) => callback(data.state, data.message);
    ipcRenderer.on('cat-state-change', handler);
    return () => ipcRenderer.removeListener('cat-state-change', handler);
  },
  onSettingsUpdated: (callback: (settings: AppSettings) => void) => {
    const handler = (_: any, data: AppSettings) => callback(data);
    ipcRenderer.on('settings-updated', handler);
    return () => ipcRenderer.removeListener('settings-updated', handler);
  },
  onShieldStatus: (callback: (info: ActiveWindowInfo) => void) => {
    const handler = (_: any, data: ActiveWindowInfo) => callback(data);
    ipcRenderer.on('shield-status', handler);
    return () => ipcRenderer.removeListener('shield-status', handler);
  }
};

contextBridge.exposeInMainWorld('api', API);
