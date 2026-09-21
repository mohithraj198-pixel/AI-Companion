import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { exec } from 'child_process';
import { ActiveWindowInfo } from '../../shared/types';

export class PrivacyShield {
  private exePath?: string;
  private psPath?: string;
  private excludedProcesses: Set<string>;
  private excludedKeywords: string[];
  private currentActiveWindow: ActiveWindowInfo = {
    processName: 'Unknown',
    windowTitle: '',
    isShielded: false
  };
  private onShieldStateChange?: (shielded: boolean, info: ActiveWindowInfo) => void;

  constructor(excludedProcesses: string[], excludedKeywords: string[]) {
    this.excludedProcesses = new Set(excludedProcesses.map(p => p.toLowerCase().trim()));
    this.excludedKeywords = excludedKeywords.map(k => k.toLowerCase().trim());

    // Resolve paths to active_window.exe and active_window.ps1
    const exeCandidatePaths = [
      path.join(process.cwd(), 'resources', 'active_window.exe'),
      path.resolve(__dirname, '../../resources/active_window.exe'),
      path.resolve(__dirname, '../../../resources/active_window.exe'),
      path.join(process.resourcesPath || '', 'active_window.exe'),
      path.join(process.resourcesPath || '', 'resources', 'active_window.exe')
    ];

    const psCandidatePaths = [
      path.join(process.cwd(), 'resources', 'active_window.ps1'),
      path.resolve(__dirname, '../../resources/active_window.ps1'),
      path.resolve(__dirname, '../../../resources/active_window.ps1'),
      path.join(process.resourcesPath || '', 'active_window.ps1'),
      path.join(process.resourcesPath || '', 'resources', 'active_window.ps1')
    ];

    try {
      if (app && typeof app.getAppPath === 'function') {
        const appPath = app.getAppPath();
        exeCandidatePaths.push(path.join(appPath, 'resources', 'active_window.exe'));
        psCandidatePaths.push(path.join(appPath, 'resources', 'active_window.ps1'));
      }
    } catch {}

    for (const p of exeCandidatePaths) {
      if (p && fs.existsSync(p)) {
        this.exePath = p;
        break;
      }
    }

    for (const p of psCandidatePaths) {
      if (p && fs.existsSync(p)) {
        this.psPath = p;
        break;
      }
    }
  }

  public updateExclusions(processes: string[], keywords: string[]) {
    this.excludedProcesses = new Set(processes.map(p => p.toLowerCase().trim()));
    this.excludedKeywords = keywords.map(k => k.toLowerCase().trim());
  }

  public setListener(callback: (shielded: boolean, info: ActiveWindowInfo) => void) {
    this.onShieldStateChange = callback;
  }

  public async checkActiveWindow(): Promise<ActiveWindowInfo> {
    return new Promise<ActiveWindowInfo>((resolve) => {
      const command = this.exePath
        ? `"${this.exePath}"`
        : (this.psPath ? `powershell -ExecutionPolicy Bypass -NoProfile -File "${this.psPath}"` : '');

      if (!command) {
        resolve(this.currentActiveWindow);
        return;
      }

      exec(command, { windowsHide: true, timeout: 2000 }, (error, stdout) => {
        if (error || !stdout) {
          resolve(this.currentActiveWindow);
          return;
        }

        const trimmed = stdout.trim();
        const sepIndex = trimmed.indexOf('|');
        let procName = 'Unknown';
        let winTitle = '';

        if (sepIndex !== -1) {
          procName = trimmed.slice(0, sepIndex).trim();
          winTitle = trimmed.slice(sepIndex + 1).trim();
        } else {
          procName = trimmed;
        }

        const lowerProc = procName.toLowerCase();
        const lowerTitle = winTitle.toLowerCase();

        let isShielded = false;
        let shieldReason = '';

        if (lowerProc === 'none' || lowerProc === 'idle') {
          procName = 'Desktop / None';
        } else {
          // Check process exclusion
          if (this.excludedProcesses.has(lowerProc) || this.excludedProcesses.has(lowerProc + '.exe')) {
            isShielded = true;
            shieldReason = `Excluded process: ${procName}`;
          }

          // Check title keyword exclusion
          if (!isShielded) {
            for (const kw of this.excludedKeywords) {
              if (kw && lowerTitle.includes(kw)) {
                isShielded = true;
                shieldReason = `Sensitive window title: "${kw}"`;
                break;
              }
            }
          }
        }

        const updated: ActiveWindowInfo = {
          processName: procName,
          windowTitle: winTitle,
          isShielded,
          shieldReason
        };

        const changed = 
          this.currentActiveWindow.isShielded !== updated.isShielded ||
          this.currentActiveWindow.processName !== updated.processName ||
          this.currentActiveWindow.windowTitle !== updated.windowTitle;

        this.currentActiveWindow = updated;

        if (changed && this.onShieldStateChange) {
          this.onShieldStateChange(updated.isShielded, updated);
        }

        resolve(updated);
      });
    });
  }

  public getLastActiveWindow(): ActiveWindowInfo {
    return this.currentActiveWindow;
  }
}
