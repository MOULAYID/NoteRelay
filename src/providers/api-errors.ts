import { z } from "zod";
export class ProviderError extends Error {
  constructor(
    public retryable: boolean,
    message: string,
  ) {
    super(`NR:${message}`);
  }
}
const ErrorEnvelope = z.object({
  error: z.object({
    status: z.string().optional(),
    message: z.string().max(20000).optional(),
    details: z
      .array(z.object({ reason: z.string().optional() }).passthrough())
      .optional(),
  }),
});
const canonical = new Set([
  "INVALID_ARGUMENT",
  "FAILED_PRECONDITION",
  "NOT_FOUND",
  "PERMISSION_DENIED",
  "UNAUTHENTICATED",
  "RESOURCE_EXHAUSTED",
  "UNAVAILABLE",
  "INTERNAL",
  "DEADLINE_EXCEEDED",
  "OUT_OF_RANGE",
]);
/** Inspect provider details for classification only. Never return arbitrary provider text. */
export async function apiError(response: Response): Promise<ProviderError> {
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    data = undefined;
  }
  const parsed = ErrorEnvelope.safeParse(data);
  const error = parsed.success ? parsed.data.error : undefined;
  const status =
    error?.status && canonical.has(error.status) ? ` ${error.status}` : "";
  const prefix = `Gemini HTTP ${response.status}${status}: `;
  const details = error?.message ?? "";
  const reasons = error?.details?.map((d) => d.reason ?? "") ?? [];
  if (
    reasons.some((r) => ["API_KEY_INVALID", "API_KEY_EXPIRED"].includes(r)) ||
    /api key.*(invalid|not valid|expired|blocked|leaked)/i.test(details)
  )
    return new ProviderError(
      false,
      prefix +
        "Google rejected the API key. Replace it in Settings and test again.",
    );
  if (response.status === 429)
    return new ProviderError(
      true,
      prefix +
        "Quota or rate limit reached. Check your Google project usage and billing; retry later.",
    );
  if (response.status === 408 || response.status >= 500)
    return new ProviderError(
      true,
      prefix +
        "Google is temporarily unavailable or the request timed out. Saved audio is retained.",
    );
  if (
    response.status === 404 ||
    (/model/i.test(details) &&
      /(not found|not available|not supported|restricted|not have access)/i.test(
        details,
      ))
  )
    return new ProviderError(
      false,
      prefix +
        "The selected model is unavailable to this project or does not support this API. Load available models in Settings and test transcription audio. After changing models, create a new transcription version.",
    );
  if (
    response.status === 402 ||
    /(billing|free tier.*(unavailable|not available|not supported)|payment)/i.test(
      details,
    )
  )
    return new ProviderError(
      false,
      prefix +
        "Google reports a project billing or free-tier eligibility restriction. Check the project in Google AI Studio; changing the key alone may not resolve it.",
    );
  if (response.status === 401 || response.status === 403)
    return new ProviderError(
      false,
      prefix +
        "Gemini rejected the key or project access. Check API-key restrictions, API access, region, and billing in Google AI Studio.",
    );
  if (
    /(mime|audio).*(unsupported|not supported|invalid)|(unsupported|not supported).*audio/i.test(
      details,
    )
  )
    return new ProviderError(
      false,
      prefix +
        "The selected model rejected audio input or its format. Choose an audio-capable Gemini model and run Test transcription audio.",
    );
  if (
    /(response.?schema|response.?mime|json schema|structured output)/i.test(
      details,
    )
  )
    return new ProviderError(
      false,
      prefix +
        "The model rejected structured JSON output settings. Choose a model supporting audio and structured outputs.",
    );
  if (/(max.?output.?tokens|output token limit)/i.test(details))
    return new ProviderError(
      false,
      prefix +
        "The requested output exceeds this model’s limit. Choose a supported Gemini text-output model.",
    );
  if (response.status === 413)
    return new ProviderError(
      false,
      prefix + "The request is too large. Saved audio is retained.",
    );
  return new ProviderError(
    false,
    prefix +
      "Google rejected the request parameters. Test notes and transcription audio separately in Settings. Saved audio is retained.",
  );
}
