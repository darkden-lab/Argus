export interface AiErrorInfo {
  code: string;           // machine-readable error code
  message: string;        // user-friendly message (never expose technical details)
  isRetryable: boolean;   // whether the user should retry
  isConfigError: boolean; // whether this requires config changes
}

/**
 * Classify a raw AI error (string or object) into a structured AiErrorInfo.
 * Pattern matching is case-insensitive. Returns a user-friendly message
 * that never exposes internal/technical details.
 */
export function classifyAiError(
  raw: string | { error?: string; content?: string; message?: string }
): AiErrorInfo {
  // Extract error string from input
  const text =
    typeof raw === "string"
      ? raw
      : raw.error ?? raw.content ?? raw.message ?? "";

  const lower = text.toLowerCase();

  // Azure APIM patterns
  if (lower.includes("401") || lower.includes("subscription key") || lower.includes("ocp-apim")) {
    return {
      code: "auth_failed",
      message: "Authentication failed. Check your API key or subscription key in Settings > AI.",
      isRetryable: false,
      isConfigError: true,
    };
  }

  if (lower.includes("429") || lower.includes("rate limit") || lower.includes("quota")) {
    return {
      code: "rate_limited",
      message: "Rate limit exceeded. Please wait a moment before trying again.",
      isRetryable: true,
      isConfigError: false,
    };
  }

  if (lower.includes("403") || lower.includes("forbidden")) {
    return {
      code: "forbidden",
      message: "Access denied. Check your API permissions.",
      isRetryable: false,
      isConfigError: true,
    };
  }

  // Provider connection errors
  if (lower.includes("econnrefused") || lower.includes("enotfound") || lower.includes("connect etimedout")) {
    return {
      code: "connection_failed",
      message: "Cannot reach the AI provider. Check the base URL in Settings > AI.",
      isRetryable: true,
      isConfigError: true,
    };
  }

  if (lower.includes("timeout") || lower.includes("etimedout")) {
    return {
      code: "timeout",
      message: "Request timed out. The AI provider may be slow or unreachable.",
      isRetryable: true,
      isConfigError: false,
    };
  }

  // Config errors
  if (lower.includes("not configured") || lower.includes("no provider") || lower.includes("not enabled")) {
    return {
      code: "not_configured",
      message: "AI assistant is not configured. Set up a provider in Settings > AI Configuration.",
      isRetryable: false,
      isConfigError: true,
    };
  }

  // Model errors
  if (lower.includes("model") && (lower.includes("not found") || lower.includes("does not exist") || lower.includes("invalid"))) {
    return {
      code: "model_error",
      message: "The configured model was not found. Check the model name in Settings > AI.",
      isRetryable: false,
      isConfigError: true,
    };
  }

  // Server errors
  if (/5[0-9][0-9]/.test(lower) || lower.includes("internal server") || lower.includes("server error")) {
    return {
      code: "server_error",
      message: "The AI provider returned a server error. This is usually temporary.",
      isRetryable: true,
      isConfigError: false,
    };
  }

  // Default/unknown
  return {
    code: "unknown",
    message: "An error occurred with the AI assistant. Please try again.",
    isRetryable: true,
    isConfigError: false,
  };
}
