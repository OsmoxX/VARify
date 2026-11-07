import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatGroq } from '@langchain/groq';
import { SystemMessage, HumanMessage, AIMessage } from '@langchain/core/messages';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * AiService — VARify AI Football Analyst
 * Odpowiednik Django: matches/services/ai_agent.py
 *
 * FIX BUG #8: retry z exponential backoff + prawidłowe rozróżnienie
 * błędów retryable (503) vs non-retryable (429).
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly llm: ChatGroq;

  constructor(private readonly config: ConfigService) {
    this.llm = new ChatGroq({
      apiKey: this.config.get<string>('GROQ_API_KEY'),
      model: 'llama-3.3-70b-versatile',
      temperature: 0.7,
      maxRetries: 0, // We handle retries ourselves (FIX BUG #8)
    });
  }

  private readonly systemPrompt = `You are VARify AI — an expert football analyst assistant.
You have deep knowledge of football tactics, player statistics, team history, and match analysis.
Answer questions concisely and accurately. Use emojis sparingly for readability.
If asked about a specific ongoing match, acknowledge you don't have real-time data access.`;

  private isRetryable(err: unknown): boolean {
    const text = String(err).toUpperCase();
    // FIX BUG #8: 429/RESOURCE_EXHAUSTED is NOT retryable (needs ~60s cooldown)
    return (
      text.includes('503') ||
      text.includes('UNAVAILABLE') ||
      text.includes('500') ||
      text.includes('INTERNAL')
    );
  }

  private classifyError(err: unknown): string {
    const text = String(err).toUpperCase();
    if (text.includes('429') || text.includes('RESOURCE_EXHAUSTED') || text.includes('RATE_LIMIT')) {
      return 'AI request limit reached. Please wait about a minute and try again.';
    }
    if (text.includes('503') || text.includes('UNAVAILABLE')) {
      return 'AI servers are currently overloaded. Please try again in a moment.';
    }
    if (text.includes('401') || text.includes('UNAUTHENTICATED')) {
      return 'AI authentication error. Please contact administrator.';
    }
    return 'An unexpected error occurred during AI analysis. Please try again.';
  }

  async chat(
    history: ChatMessage[],
    userMessage: string,
  ): Promise<string> {
    const messages = [
      new SystemMessage(this.systemPrompt),
      ...history.map((m) =>
        m.role === 'user'
          ? new HumanMessage(m.content)
          : new AIMessage(m.content),
      ),
      new HumanMessage(userMessage),
    ];

    const MAX_RETRIES = 2;
    const RETRY_DELAY_MS = 1500;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await this.llm.invoke(messages);
        const content = response.content;
        return typeof content === 'string'
          ? content
          : Array.isArray(content)
            ? content.map((c) => (typeof c === 'string' ? c : '')).join('')
            : String(content);
      } catch (err: unknown) {
        const isLast = attempt === MAX_RETRIES;
        const retryable = this.isRetryable(err);

        if (!retryable || isLast) {
          throw new Error(this.classifyError(err));
        }

        this.logger.warn(
          `AiService: retryable error (attempt ${attempt + 1}/${MAX_RETRIES}): ${String(err)}`,
        );
        await new Promise((resolve) =>
          setTimeout(resolve, RETRY_DELAY_MS * (attempt + 1)),
        );
      }
    }

    throw new Error('AI service unreachable after retries.');
  }
}
