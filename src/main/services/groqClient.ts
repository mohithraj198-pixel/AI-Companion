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
      'You are a desktop AI coding companion observing the user\'s screen while they code.\n' +
      'Your job is to read the code/terminal visible on screen and provide helpful, proactive assistance.\n' +
      '1. If there is a bug, mistake, error, or broken syntax: point out the line and the exact fix.\n' +
      '2. If the code is working normally: provide a helpful observation, next step, optimization tip, or brief explanation of what the current code does.\n' +
      '3. Only return empty "text" if there is no code, terminal, or programming editor visible on screen.\n' +
      'CRITICAL RULES:\n' +
      '- DO NOT output <think> tags or reasoning thoughts. Return ONLY raw JSON.\n' +
      '- DO NOT complain about missing semicolons in JS/TS.\n' +
      '- DO NOT give long essays. Keep responses concise (1-2 sentences max, 15-30 words).\n' +
      '- Format for mistakes: "Line [N]: [issue]. Fix: [brief guidance]"\n' +
      '- Format for tips: "Observing [component/function]: [insight or tip]"\n' +
      'Return ONLY a raw JSON object:\n' +
      '{"text":"[1-2 sentence suggestion or tip]","urgency":"low|medium|high","confidence":0.85}';

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
      max_tokens: 1024
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

    // Strip reasoning / thinking tags if emitted by model
    contentString = contentString.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    contentString = contentString.replace(/<thought>[\s\S]*?<\/thought>/gi, '').trim();

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

    // If surrounded by extra text or tags, extract substring between first { and last }
    const firstBrace = cleanedJson.indexOf('{');
    const lastBrace = cleanedJson.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      cleanedJson = cleanedJson.substring(firstBrace, lastBrace + 1);
    }

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
          content: 'Return ONLY the JSON: {"status":"ok","message":"connection successful"}. Do not output any think tags or reasoning.'
        }
      ],
      response_format: { type: 'json_object' },
      max_tokens: 350
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
