/** Klasyfikacja błędów Groq/LLM (Django ai_agent._classify_error / _is_retryable). */

export function extractStatus(err: unknown): number | undefined {
  const e = err as { status?: unknown; statusCode?: unknown; response?: { status?: unknown }; message?: unknown } | null;
  for (const v of [e?.status, e?.statusCode, e?.response?.status]) {
    if (typeof v === 'number') return v;
  }
  const text = typeof e?.message === 'string' ? e.message : String(err);
  const m = /\b([45]\d\d)\b/.exec(text);
  return m ? Number(m[1]) : undefined;
}

export function extractRetryAfter(err: unknown): string | undefined {
  const h = (err as { headers?: unknown } | null)?.headers;
  if (!h) return undefined;
  if (typeof (h as Headers).get === 'function') return (h as Headers).get('retry-after') ?? undefined;
  const v = (h as Record<string, unknown>)['retry-after'];
  return typeof v === 'string' ? v : undefined;
}

export interface ClassifiedAiError {
  /** Status HTTP, który zwracamy klientowi. */
  httpStatus: number;
  message: string;
}

export function classifyAiError(err: unknown): ClassifiedAiError {
  const status = extractStatus(err);
  const text = String(err instanceof Error ? err.message : err).toUpperCase();

  if (status === 429 || text.includes('RATE_LIMIT') || text.includes('RESOURCE_EXHAUSTED')) {
    return { httpStatus: 429, message: 'AI request limit reached. Please wait about a minute and try again.' };
  }
  if (status === 503 || text.includes('UNAVAILABLE')) {
    return { httpStatus: 503, message: 'AI servers are currently overloaded. Please try again in a few seconds.' };
  }
  if (status === 401 || status === 403 || text.includes('UNAUTHENTICATED')) {
    return { httpStatus: 502, message: 'AI authentication problem. Please contact the administrator.' };
  }
  if (status === 500 || status === 502 || status === 504 || text.includes('INTERNAL')) {
    return { httpStatus: 502, message: 'Internal error at the AI provider. Please try again shortly.' };
  }
  return { httpStatus: 500, message: 'An unexpected error occurred during AI analysis. Please try again.' };
}
