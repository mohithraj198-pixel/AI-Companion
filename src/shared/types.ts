export type UrgencyLevel = 'low' | 'medium' | 'high';

export interface GroqSuggestion {
  text: string;
  urgency: UrgencyLevel;
  confidence: number;
  timestamp: number;
  hasMistake?: boolean;
}

export type CatAnimationState = 'idle' | 'thinking' | 'speaking' | 'pointing' | 'paused' | 'shielded' | 'error';

export interface AppSettings {
  // Groq API
  groqEndpoint: string;
  groqModel: string;
  hasApiKey: boolean;
  maskedApiKey: string;

  // Limits & Thresholds
  dailyLimit: number;
  requestsToday: number;
  sensitivity: number; // 1-100 screen difference sensitivity
  minConfidence: number; // 0..1 threshold

  // Screen Monitoring
  selectedDisplayId: string;
  captureIntervalSeconds: number;
  monitoringEnabled: boolean;

  // Speech & Voice
  speechMuted: boolean;
  speechRate: number;
  speechPitch: number;
  selectedVoiceURI: string;

  // Privacy Shield
  privacyConsentGiven: boolean;
  excludedProcesses: string[];
  excludedTitleKeywords: string[];
  historyRetentionMinutes: number; // 0 means do not save; 60 = 1 hr, etc.
  encryptedHistoryCount: number;
}

export interface ActiveWindowInfo {
  processName: string;
  windowTitle: string;
  isShielded: boolean;
  shieldReason?: string;
}

export interface DisplaySource {
  id: string;
  name: string;
  bounds: { x: number; y: number; width: number; height: number };
  isPrimary: boolean;
}

export interface TestConnectionResult {
  success: boolean;
  message: string;
  modelUsed?: string;
  roundTripMs?: number;
}
