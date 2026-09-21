import { desktopCapturer, screen } from 'electron';
import { SecureStore } from './secureStore';
import { PrivacyShield } from './privacyShield';
import { QuotaTracker } from './quotaTracker';
import { GroqClient } from './groqClient';
import { AppSettings, DisplaySource, GroqSuggestion, CatAnimationState } from '../../shared/types';

export class ScreenMonitor {
  private secureStore: SecureStore;
  private privacyShield: PrivacyShield;
  private quotaTracker: QuotaTracker;
  private settings: AppSettings;

  private isRunning: boolean = false;
  private isProcessing: boolean = false;
  private timer: NodeJS.Timeout | null = null;
  private cleanupTimer: NodeJS.Timeout | null = null;

  private lastGrayscaleSample: Uint8Array | null = null;
  private lastCaptureTime: number = 0;

  // Callbacks
  private onSuggestion?: (suggestion: GroqSuggestion) => void;
  private onStateChange?: (state: CatAnimationState, message?: string) => void;
  private onQuotaUpdated?: (requestsToday: number) => void;
  private onError?: (error: string) => void;

  constructor(
    secureStore: SecureStore,
    privacyShield: PrivacyShield,
    quotaTracker: QuotaTracker,
    initialSettings: AppSettings
  ) {
    this.secureStore = secureStore;
    this.privacyShield = privacyShield;
    this.quotaTracker = quotaTracker;
    this.settings = initialSettings;

    // Start background cleanup timer (every 10 minutes)
    this.cleanupTimer = setInterval(() => {
      this.purgeOldHistory();
    }, 10 * 60 * 1000);
  }

  public updateSettings(newSettings: Partial<AppSettings>) {
    this.settings = { ...this.settings, ...newSettings };
    if (newSettings.historyRetentionMinutes !== undefined) {
      this.purgeOldHistory();
    }
  }

  public setCallbacks(callbacks: {
    onSuggestion: (suggestion: GroqSuggestion) => void;
    onStateChange: (state: CatAnimationState, message?: string) => void;
    onQuotaUpdated: (requestsToday: number) => void;
    onError: (error: string) => void;
  }) {
    this.onSuggestion = callbacks.onSuggestion;
    this.onStateChange = callbacks.onStateChange;
    this.onQuotaUpdated = callbacks.onQuotaUpdated;
    this.onError = callbacks.onError;
  }

  public async getAvailableDisplays(): Promise<DisplaySource[]> {
    const displays = screen.getAllDisplays();
    const primary = screen.getPrimaryDisplay();

    return displays.map((d, index) => ({
      id: d.id.toString(),
      name: `Display ${index + 1} (${d.bounds.width}x${d.bounds.height})${d.id === primary.id ? ' - Primary' : ''}`,
      bounds: d.bounds,
      isPrimary: d.id === primary.id
    }));
  }

  public start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.scheduleNextTick(1000); // start after 1s
    if (this.onStateChange) {
      this.onStateChange('idle', 'Monitoring started');
    }
  }

  public stop(reason?: string) {
    this.isRunning = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.onStateChange) {
      this.onStateChange('paused', reason || 'Monitoring paused');
    }
  }

  public toggle(): boolean {
    if (this.isRunning) {
      this.stop();
      return false;
    } else {
      this.start();
      return true;
    }
  }

  public isActive(): boolean {
    return this.isRunning;
  }

  private scheduleNextTick(delayMs?: number) {
    if (!this.isRunning) return;
    if (this.timer) clearTimeout(this.timer);

    const interval = delayMs !== undefined ? delayMs : (this.settings.captureIntervalSeconds || 8) * 1000;
    this.timer = setTimeout(() => {
      this.tick();
    }, Math.max(2000, interval));
  }

  private async tick() {
    if (!this.isRunning || this.isProcessing) {
      return;
    }

    let nextDelayMs: number | undefined = undefined;
    try {
      this.isProcessing = true;
      await this.processCaptureCycle();
    } catch (err: any) {
      console.error('Screen monitor cycle error', err);
      const isRateLimit = err?.message?.includes('429') || err?.message?.toLowerCase().includes('rate limit');
      if (isRateLimit) {
        nextDelayMs = 25000; // Cooldown 25s to allow Groq rolling token window to reset
        if (this.onStateChange) {
          this.onStateChange('paused', 'Groq rate limit cooldown (waiting 25s)...');
        }
      } else if (this.onError) {
        this.onError(err?.message || 'Error capturing screen');
      }
    } finally {
      this.isProcessing = false;
      if (this.isRunning) {
        this.scheduleNextTick(nextDelayMs);
      }
    }
  }

  private async processCaptureCycle() {
    // 1. Check Privacy Consent
    if (!this.settings.privacyConsentGiven) {
      if (this.onStateChange) {
        this.onStateChange('paused', 'Awaiting privacy consent');
      }
      return;
    }

    // 2. Check Active Foreground Window via PrivacyShield
    const winInfo = await this.privacyShield.checkActiveWindow();
    if (winInfo.isShielded) {
      if (this.onStateChange) {
        this.onStateChange('shielded', winInfo.shieldReason || 'Sensitive application active');
      }
      // Immediate skip, do not capture screen
      return;
    }

    // 3. Check API Key
    const apiKey = this.secureStore.getApiKey();
    if (!apiKey) {
      if (this.onStateChange) {
        this.onStateChange('error', 'Groq API key not configured');
      }
      return;
    }

    // 4. Check Daily Limit
    if (!this.quotaTracker.canMakeRequest(this.settings.dailyLimit)) {
      if (this.onStateChange) {
        this.onStateChange('paused', `Daily API limit (${this.settings.dailyLimit}) reached`);
      }
      return;
    }

    // 5. Capture Screen Thumbnail using desktopCapturer (1280x720 balanced for quality & low Groq vision token usage)
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 1280, height: 720 }
    });

    if (sources.length === 0) {
      return;
    }

    // Find requested display source or default to first
    let selectedSource = sources[0];
    if (this.settings.selectedDisplayId) {
      const match = sources.find(s => s.display_id === this.settings.selectedDisplayId || s.id.includes(this.settings.selectedDisplayId));
      if (match) selectedSource = match;
    }

    const thumbnail = selectedSource.thumbnail;
    if (thumbnail.isEmpty()) {
      return;
    }

    // 6. Compute Screen Change / Difference
    const bitmap = thumbnail.toBitmap(); // raw BGRA buffer
    const imgSize = thumbnail.getSize();
    const hasScreenChanged = this.checkScreenDifference(bitmap, imgSize.width, imgSize.height);

    if (!hasScreenChanged) {
      // Screen is largely unchanged, skip to save quota!
      if (this.onStateChange) {
        this.onStateChange('idle', 'Observing screen changes...');
      }
      return;
    }

    // 7. Encrypt Temporary Screenshot locally if retention > 0
    const pngBuffer = thumbnail.toPNG();
    if (this.settings.historyRetentionMinutes > 0) {
      const filename = `snap_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      this.secureStore.saveEncryptedScreenshot(pngBuffer, filename);
    }

    // 8. Analyze with Groq Vision
    const now = Date.now();
    if (now - this.lastCaptureTime < 12000) {
      // Cooldown to stay safely under Groq's 7,000 TPM free tier rate limit
      return;
    }

    if (this.onStateChange) {
      this.onStateChange('thinking', 'Analyzing code...');
    }

    const base64Png = pngBuffer.toString('base64');
    const suggestion = await GroqClient.analyzeScreen({
      apiKey,
      endpoint: this.settings.groqEndpoint,
      model: this.settings.groqModel,
      base64Png
    });

    this.lastCaptureTime = Date.now();

    // Record request in quota tracker
    const requestsCount = this.quotaTracker.recordRequest();
    if (this.onQuotaUpdated) {
      this.onQuotaUpdated(requestsCount);
    }

    // 9. Handle Suggestion
    if (suggestion && suggestion.text && suggestion.text.trim().length > 0) {
      const minConf = this.settings.minConfidence !== undefined ? this.settings.minConfidence : 0.4;
      if (suggestion.confidence >= minConf) {
        if (this.onStateChange) {
          this.onStateChange(suggestion.hasMistake ? 'pointing' : 'speaking');
        }
        if (this.onSuggestion) {
          this.onSuggestion(suggestion);
        }
      } else {
        if (this.onStateChange) {
          this.onStateChange('idle');
        }
      }
    } else {
      if (this.onStateChange) {
        this.onStateChange('idle');
      }
    }
  }

  // Sensitive grid diff calculation capable of detecting localized code typing
  private checkScreenDifference(bitmap: Buffer, width: number, height: number): boolean {
    const sampleCols = 80;
    const sampleRows = 50;
    const totalSamples = sampleCols * sampleRows;
    const currentGrayscale = new Uint8Array(totalSamples);

    const stepX = Math.floor(width / sampleCols);
    const stepY = Math.floor(height / sampleRows);

    let idx = 0;
    for (let r = 0; r < sampleRows; r++) {
      const y = r * stepY;
      for (let c = 0; c < sampleCols; c++) {
        const x = c * stepX;
        const pixelOffset = (y * width + x) * 4;
        if (pixelOffset + 2 < bitmap.length) {
          const b = bitmap[pixelOffset];
          const g = bitmap[pixelOffset + 1];
          const rVal = bitmap[pixelOffset + 2];
          // Grayscale luminance
          currentGrayscale[idx++] = Math.round(0.299 * rVal + 0.587 * g + 0.114 * b);
        } else {
          currentGrayscale[idx++] = 0;
        }
      }
    }

    if (!this.lastGrayscaleSample) {
      this.lastGrayscaleSample = currentGrayscale;
      return true; // First frame always counts as changed
    }

    let diffSum = 0;
    let changedCells = 0;
    const cellLuminanceThreshold = 14;

    for (let i = 0; i < totalSamples; i++) {
      const cellDiff = Math.abs(currentGrayscale[i] - this.lastGrayscaleSample[i]);
      diffSum += cellDiff;
      if (cellDiff >= cellLuminanceThreshold) {
        changedCells++;
      }
    }

    const diffPercent = (diffSum / (totalSamples * 255)) * 100;

    // Sensitivity slider 1 to 100 (default 50)
    const sens = Math.max(1, Math.min(100, this.settings.sensitivity || 50));
    // For large screen changes (switching windows, scrolling)
    const diffPercentThreshold = Math.max(0.04, 2.5 - (sens / 100) * 2.45);
    // For localized code typing (a few characters or words typed in editor)
    // At sens 50 -> 6 changed cells out of 4000
    // At sens 100 -> 2 changed cells
    // At sens 1 -> 25 changed cells
    const changedCellsThreshold = Math.max(2, Math.round(18 - (sens / 100) * 16));

    const isDifferent = changedCells >= changedCellsThreshold || diffPercent >= diffPercentThreshold;

    if (isDifferent) {
      this.lastGrayscaleSample = currentGrayscale;
    }

    return isDifferent;
  }

  public purgeOldHistory(): number {
    return this.secureStore.purgeHistoryOlderThan(this.settings.historyRetentionMinutes);
  }

  public destroy() {
    this.stop();
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }
}
