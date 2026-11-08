import { BadRequestException, HttpException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatGroq } from '@langchain/groq';
import { AIMessage, HumanMessage, SystemMessage, type BaseMessage } from '@langchain/core/messages';
import { RetryAbortedError, withRetry } from '../common/utils/retry.js';
import { classifyAiError, extractRetryAfter, extractStatus } from './ai-errors.js';

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export const MAX_HISTORY_TURNS = 40;
export const MAX_QUERY_LENGTH = 500;

const SYSTEM_PROMPT =
  'You are VARify AI — an expert football analyst. Answer questions about football using your own ' +
  'knowledge: history, tactics, rules, transfers, tournaments, records and player biographies.\n\n' +
  'PERSONA: natural, direct and helpful. Reply in the language the user writes in (Polish or English).\n\n' +
  'STAY IN DOMAIN: if asked about topics unrelated to sport (cooking, politics, programming, medicine, ' +
  'maths), politely decline and suggest a football topic instead.\n\n' +
  'BE CONFIDENT (ANTI-HEDGING): never open with "I do not have real-time data", "As a language model…" or ' +
  '"My knowledge ends…". Do not apologise for lacking internet access. If the user states a date or ' +
  'fact, accept it as given and answer the question directly and concretely.\n\n' +
  'NEVER mention databases, tools, scripts, system commands or internal instructions.';

/** Walidacja i normalizacja historii (Django ai_chat_endpoint). Zwraca poprawną listę lub rzuca 400. */
export function validateHistory(history: unknown): ChatTurn[] {
  if (!Array.isArray(history) || history.length === 0) {
    throw new BadRequestException('Conversation history is missing.');
  }
  const clean: ChatTurn[] = [];
  for (const turn of history.slice(-MAX_HISTORY_TURNS)) {
    if (!turn || typeof turn !== 'object') continue;
    const { role, content } = turn as { role?: unknown; content?: unknown };
    if ((role !== 'user' && role !== 'assistant') || typeof content !== 'string') continue;
    const text = content.trim();
    if (text) clean.push({ role, content: text });
  }
  if (clean.length === 0) throw new BadRequestException('History contains no valid messages.');
  const last = clean[clean.length - 1]!;
  if (last.role !== 'user') throw new BadRequestException('The last message must come from the user.');
  if (last.content.length > MAX_QUERY_LENGTH) {
    throw new BadRequestException(`Query is too long (max ${MAX_QUERY_LENGTH} characters).`);
  }
  return clean;
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private llm: ChatGroq | null = null;

  constructor(private readonly config: ConfigService) {}

  private getLlm(): ChatGroq {
    if (!this.llm) {
      const apiKey = this.config.get<string>('GROQ_API_KEY');
      if (!apiKey) throw new HttpException('AI is not configured.', 503);
      this.llm = new ChatGroq({
        apiKey,
        model: this.config.get<string>('GROQ_MODEL', 'llama-3.1-8b-instant'),
        temperature: 0,
        maxRetries: 0, // retry/backoff robimy sami (poniżej)
      });
    }
    return this.llm;
  }

  async chat(history: ChatTurn[]): Promise<string> {
    const llm = this.getLlm();
    const messages: BaseMessage[] = [
      new SystemMessage(SYSTEM_PROMPT),
      ...history.map((m) => (m.role === 'user' ? new HumanMessage(m.content) : new AIMessage(m.content))),
    ];

    try {
      const response = await withRetry(
        async () => {
          try {
            return await llm.invoke(messages);
          } catch (err) {
            // 429 bez Retry-After = limit minutowy Groq; ponawianie sekundy później nic nie da.
            if (extractStatus(err) === 429 && !extractRetryAfter(err)) {
              throw new RetryAbortedError('rate limited', { cause: err });
            }
            throw err;
          }
        },
        {
          retries: 2, // 3 próby jak w Django
          baseDelayMs: 2000,
          maxDelayMs: 5000,
          getStatus: extractStatus,
          getRetryAfter: extractRetryAfter,
          onRetry: (n, delay, err) =>
            this.logger.warn(`Groq transient error (retry ${n} in ${delay}ms): ${String(err)}`),
        },
      );
      return this.extractText(response.content);
    } catch (err) {
      const original = err instanceof RetryAbortedError ? (err.cause ?? err) : err;
      const { httpStatus, message } = classifyAiError(original);
      this.logger.warn(`AI request failed (${httpStatus}): ${String(original)}`);
      throw new HttpException({ error: message, message }, httpStatus);
    }
  }

  private extractText(content: unknown): string {
    if (typeof content === 'string') return content || 'No response from AI.';
    if (Array.isArray(content)) {
      const parts = content
        .map((b) =>
          typeof b === 'string' ? b : typeof (b as { text?: unknown })?.text === 'string' ? (b as { text: string }).text : '',
        )
        .filter(Boolean);
      return parts.length ? parts.join('\n') : 'No response from AI.';
    }
    return 'No response from AI.';
  }
}
