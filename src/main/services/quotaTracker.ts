import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

interface QuotaData {
  date: string;
  requestsToday: number;
}

export class QuotaTracker {
  private filePath: string;
  private data: QuotaData;

  constructor() {
    this.filePath = path.join(app.getPath('userData'), 'quota_stats.json');
    this.data = this.load();
    this.checkDateReset();
  }

  private getTodayString(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  private load(): QuotaData {
    const today = this.getTodayString();
    if (fs.existsSync(this.filePath)) {
      try {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed.date === today) {
          return parsed;
        }
      } catch {
        // use default
      }
    }
    return { date: today, requestsToday: 0 };
  }

  private save() {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2));
    } catch {
      // ignore
    }
  }

  private checkDateReset() {
    const today = this.getTodayString();
    if (this.data.date !== today) {
      this.data.date = today;
      this.data.requestsToday = 0;
      this.save();
    }
  }

  public getRequestsToday(): number {
    this.checkDateReset();
    return this.data.requestsToday;
  }

  public canMakeRequest(dailyLimit: number): boolean {
    this.checkDateReset();
    if (dailyLimit <= 0) return true; // unlimited
    return this.data.requestsToday < dailyLimit;
  }

  public recordRequest(): number {
    this.checkDateReset();
    this.data.requestsToday++;
    this.save();
    return this.data.requestsToday;
  }

  public resetCount(): void {
    this.data.requestsToday = 0;
    this.save();
  }
}
