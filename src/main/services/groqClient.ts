import { GroqSuggestion, TestConnectionResult } from '../../shared/types';

export interface GroqRequestOptions {
  apiKey: string;
  endpoint: string;
  model: string;
  base64Png: string;
}

export class GroqClient {
  private static sanitizeError(errMessage: string, apiKey?: string): string {
    let sanitized = errMessage;
    if (apiKey && apiKey.length > 5) {
      sanitized = sanitized.split(apiKey).join('[REDACTED]');
    }
    // Mask potential authorization headers or gsk_ tokens
    sanitized = sanitized.replace(/gsk_[a-zA-Z0-9_-]+/g, '[REDACTED_KEY]');
    sanitized = sanitized.replace(/Bearer\s+[a-zA-Z0-9_\-\.]+/gi, 'Bearer [REDACTED]');
    return sanitized;
  }

  public static async analyzeScreen(options: GroqRequestOptions): Promise<GroqSuggestion | null> {
    const { apiKey, endpoint, model, base64Png } = options;

    if (!apiKey) {
      throw new Error('Groq request failed (401). Check your API key.');
    }

    const promptText = 
      'You are a desktop AI coding companion observing the user\'s screen while they write code. ' +
      'Your job is to provide helpful, proactive coding assistance, catching real mistakes, bugs, and guiding them as they code. ' +
      'Check for: ' +
      '1. Real bugs, logic errors, undefined variables/functions, or visible compiler/terminal errors. ' +
      '2. Misspelled tags, API names, function calls, CSS properties, or syntax mistakes (unclosed brackets, quotes, unclosed tags). ' +
      '3. Helpful next-step coding tips or completions for the code they are currently writing. ' +
      'CRITICAL RULES: ' +
      '- DO NOT report missing semicolons (;). Never complain about missing semicolons in JavaScript, TypeScript, or CSS. ' +
      '- DO NOT interrupt for incomplete words or lines currently in the middle of being typed. ' +
      '- DO NOT give long essays, tutorials, or full block rewrites. ' +
      '- Keep responses extremely concise (1-2 sentences max). ' +
      '- Format: "Line [N]: [issue or suggestion]. Fix/Tip: [brief guidance]" (e.g. "Line 15: `fetchData` is called without `await`. Fix: Add `await fetchData()`"). ' +
      '- If the code looks fine or user is normally typing, return empty string in "text". ' +
      'Return ONLY a raw JSON object: ' +
      '{"text":"Line [N]: [suggestion or fix]","urgency":"low|medium|high","confidence":0..1}';

    const payload = {
      model: model || 'qwen/qwen3.8-27b',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: promptText
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/png;base64,${base64Png}`
              }
            }
          ]
        }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 250
    };

    let response: Response;
    let urlToUse = (endpoint || 'https://api.groq.com/openai/v1/chat/completions').trim();
    if (urlToUse.endsWith('/responses')) {
      urlToUse = urlToUse.replace(/\/responses$/, '/chat/completions');
    }

    try {
      response = await fetch(urlToUse, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey.trim()}`
        },
        body: JSON.stringify(payload)
      });
    } catch (netErr: any) {
      const sanitized = this.sanitizeError(netErr?.message || 'Network error', apiKey);
      throw new Error(`Unable to reach Groq API: ${sanitized}`);
    }

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Groq request failed (401). Check your API key.');
      } else if (response.status === 403) {
        throw new Error('Groq request forbidden (403). Check model permissions or API key access.');
      } else if (response.status === 404) {
        throw new Error(`Groq endpoint not found (404). Check API endpoint.`);
      } else if (response.status === 429) {
        throw new Error('Groq rate limit exceeded (429). Please wait before next request.');
      } else {
        let errorDetail = '';
        try {
          const errJson = await response.json();
          errorDetail = errJson?.error?.message || errJson?.message || '';
        } catch {
          // ignore
        }
        const cleanDetail = this.sanitizeError(errorDetail, apiKey);
        throw new Error(`Groq request failed (${response.status}). ${cleanDetail || 'Check your settings.'}`);
      }
    }

    const data: any = await response.json();
    let contentString = '';

    if (data?.choices && data.choices[0]?.message?.content) {
      contentString = data.choices[0].message.content;
    } else if (typeof data?.output === 'string') {
      contentString = data.output;
    } else if (data?.response) {
      contentString = typeof data.response === 'string' ? data.response : JSON.stringify(data.response);
    } else {
      contentString = JSON.stringify(data);
    }

    // Clean JSON markdown blocks if any
    let cleanedJson = contentString.trim();
    if (cleanedJson.startsWith('```json')) {
      cleanedJson = cleanedJson.slice(7);
    } else if (cleanedJson.startsWith('```')) {
      cleanedJson = cleanedJson.slice(3);
    }
    if (cleanedJson.endsWith('```')) {
      cleanedJson = cleanedJson.slice(0, -3);
    }
    cleanedJson = cleanedJson.trim();

    try {
      const parsed = JSON.parse(cleanedJson);
      const text = typeof parsed.text === 'string' ? parsed.text.trim() : '';
      let urgency: 'low' | 'medium' | 'high' = 'low';
      if (parsed.urgency === 'medium' || parsed.urgency === 'high') {
        urgency = parsed.urgency;
      }

      let confidence = 0.5;
      if (typeof parsed.confidence === 'number' && !isNaN(parsed.confidence)) {
        confidence = Math.max(0, Math.min(1, parsed.confidence));
      }

      if (!text) {
        return null;
      }

      // Suppress annoying semicolon complaints
      const lower = text.toLowerCase();
      if (lower.includes('semicolon') || lower.includes('missing ;') || lower.includes("missing ';'")) {
        return null;
      }

      // Check if suggestion points out an error or mistake
      const hasMistake = urgency === 'high' || urgency === 'medium' ||
        lower.includes('mistake') || lower.includes('error') || lower.includes('bug') ||
        lower.includes('typo') || lower.includes('fix:') || lower.includes('missing') ||
        lower.includes('undefined') || lower.includes('syntax') || lower.includes('exception');

      return {
        text,
        urgency,
        confidence,
        timestamp: Date.now(),
        hasMistake
      };
    } catch (parseErr) {
      // If AI didn't return perfect JSON but gave plain text
      if (cleanedJson.length > 0 && cleanedJson.length < 300 && !cleanedJson.startsWith('{')) {
        const lower = cleanedJson.toLowerCase();
        if (lower.includes('semicolon') || lower.includes('missing ;') || lower.includes("missing ';'")) {
          return null;
        }
        const hasMistake = lower.includes('mistake') || lower.includes('error') || lower.includes('bug') || lower.includes('fix');
        return {
          text: cleanedJson,
          urgency: 'low',
          confidence: 0.7,
          timestamp: Date.now(),
          hasMistake
        };
      }
      return null;
    }
  }

  public static async testConnection(apiKey: string, endpoint: string, model: string): Promise<TestConnectionResult> {
    if (!apiKey || apiKey.trim() === '') {
      return { success: false, message: 'API key cannot be empty. Please enter your Groq API key.' };
    }

    const startTime = Date.now();
    let urlToUse = (endpoint || 'https://api.groq.com/openai/v1/chat/completions').trim();
    if (urlToUse.endsWith('/responses')) {
      urlToUse = urlToUse.replace(/\/responses$/, '/chat/completions');
    }

    // Simple test prompt
    const payload = {
      model: model || 'qwen/qwen3.8-27b',
      messages: [
        {
          role: 'user',
          content: 'Reply with JSON: {"status":"ok","message":"connection successful"}'
        }
      ],
      response_format: { type: 'json_object' },
      max_tokens: 50
    };

    try {
      let response = await fetch(urlToUse, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey.trim()}`
        },
        body: JSON.stringify(payload)
      });

      const elapsed = Date.now() - startTime;

      if (response.ok) {
        return {
          success: true,
          message: `Connection successful (${elapsed}ms)`,
          modelUsed: model,
          roundTripMs: elapsed
        };
      } else {
        if (response.status === 401) {
          return { success: false, message: 'Groq request failed (401). Check your API key.' };
        } else if (response.status === 403) {
          return { success: false, message: 'Groq request forbidden (403). Check model permissions.' };
        } else if (response.status === 404) {
          return { success: false, message: `Groq endpoint not found (404): ${urlToUse}` };
        } else if (response.status === 429) {
          return { success: false, message: 'Groq rate limit reached (429).' };
        } else {
          return { success: false, message: `Groq request failed (${response.status}).` };
        }
      }
    } catch (err: any) {
      const sanitized = this.sanitizeError(err?.message || 'Unknown network error', apiKey);
      return {
        success: false,
        message: `Network error: ${sanitized}`
      };
    }
  }
}
