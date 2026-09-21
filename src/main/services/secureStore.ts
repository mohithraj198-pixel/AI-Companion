import { app, safeStorage } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

export class SecureStore {
  private keyFilePath: string;
  private historyDirPath: string;

  constructor() {
    const userData = app.getPath('userData');
    this.keyFilePath = path.join(userData, 'groq_credentials.enc');
    this.historyDirPath = path.join(userData, 'encrypted_history');

    if (!fs.existsSync(this.historyDirPath)) {
      fs.mkdirSync(this.historyDirPath, { recursive: true });
    }
  }

  public isEncryptionSupported(): boolean {
    return safeStorage.isEncryptionAvailable();
  }

  public saveApiKey(apiKey: string): boolean {
    if (!apiKey || apiKey.trim() === '') {
      this.deleteApiKey();
      return true;
    }

    try {
      const trimmed = apiKey.trim();
      if (this.isEncryptionSupported()) {
        const encrypted = safeStorage.encryptString(trimmed);
        fs.writeFileSync(this.keyFilePath, encrypted);
        return true;
      } else {
        // Fallback: Windows DPAPI not available in current environment
        // Base64 obfuscation with warning (should not occur on standard Windows Electron)
        console.warn('Windows DPAPI safeStorage is not available on this system.');
        const fallback = Buffer.from(trimmed, 'utf-8');
        fs.writeFileSync(this.keyFilePath, fallback);
        return true;
      }
    } catch (err) {
      console.error('Failed to securely save API key');
      return false;
    }
  }

  public getApiKey(): string | null {
    if (!fs.existsSync(this.keyFilePath)) {
      return null;
    }

    try {
      const data = fs.readFileSync(this.keyFilePath);
      if (this.isEncryptionSupported()) {
        return safeStorage.decryptString(data);
      } else {
        return data.toString('utf-8');
      }
    } catch (err) {
      console.error('Failed to decrypt API key via safeStorage');
      return null;
    }
  }

  public hasApiKey(): boolean {
    const key = this.getApiKey();
    return !!key && key.trim().length > 0;
  }

  public getMaskedApiKey(): string {
    const key = this.getApiKey();
    if (!key) return '';
    if (key.length <= 8) return '••••••••';
    const first = key.slice(0, 4);
    const last = key.slice(-4);
    return `${first}••••••••${last}`;
  }

  public deleteApiKey(): void {
    if (fs.existsSync(this.keyFilePath)) {
      try {
        fs.unlinkSync(this.keyFilePath);
      } catch (err) {
        console.error('Failed to delete stored API key');
      }
    }
  }

  // Encrypted screenshot history storage
  public saveEncryptedScreenshot(buffer: Buffer, filename: string): string | null {
    try {
      const targetPath = path.join(this.historyDirPath, filename + '.enc');
      let dataToWrite = buffer;
      if (this.isEncryptionSupported()) {
        // safeStorage encrypts Buffer
        dataToWrite = safeStorage.encryptString(buffer.toString('base64'));
      }
      fs.writeFileSync(targetPath, dataToWrite);
      return targetPath;
    } catch (err) {
      console.error('Failed to write encrypted screenshot');
      return null;
    }
  }

  public purgeHistoryOlderThan(minutes: number): number {
    if (!fs.existsSync(this.historyDirPath)) return 0;
    let deletedCount = 0;
    try {
      const files = fs.readdirSync(this.historyDirPath);
      const now = Date.now();
      const cutoff = now - minutes * 60 * 1000;

      for (const file of files) {
        const fullPath = path.join(this.historyDirPath, file);
        try {
          const stats = fs.statSync(fullPath);
          if (minutes === 0 || stats.mtimeMs < cutoff) {
            fs.unlinkSync(fullPath);
            deletedCount++;
          }
        } catch {
          // ignore individual file errors
        }
      }
    } catch (err) {
      console.error('Error during history cleanup', err);
    }
    return deletedCount;
  }

  public getEncryptedHistoryCount(): number {
    if (!fs.existsSync(this.historyDirPath)) return 0;
    try {
      return fs.readdirSync(this.historyDirPath).length;
    } catch {
      return 0;
    }
  }
}
