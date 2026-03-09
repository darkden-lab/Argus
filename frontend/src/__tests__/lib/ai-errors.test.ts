import { classifyAiError } from "@/lib/ai-errors";

describe("classifyAiError", () => {
  // Auth errors
  it("classifies 401 error as auth_failed", () => {
    const result = classifyAiError("HTTP 401 Unauthorized");
    expect(result.code).toBe("auth_failed");
    expect(result.isConfigError).toBe(true);
    expect(result.isRetryable).toBe(false);
  });

  it("classifies subscription key error as auth_failed", () => {
    const result = classifyAiError("Ocp-Apim-Subscription-Key is invalid");
    expect(result.code).toBe("auth_failed");
  });

  // Rate limiting
  it("classifies 429 error as rate_limited", () => {
    const result = classifyAiError("429 Too Many Requests");
    expect(result.code).toBe("rate_limited");
    expect(result.isRetryable).toBe(true);
  });

  it("classifies rate limit text as rate_limited", () => {
    const result = classifyAiError("rate limit exceeded");
    expect(result.code).toBe("rate_limited");
  });

  it("classifies quota error as rate_limited", () => {
    const result = classifyAiError("quota exceeded for this month");
    expect(result.code).toBe("rate_limited");
  });

  // Forbidden
  it("classifies 403 error as forbidden", () => {
    const result = classifyAiError("403 Forbidden");
    expect(result.code).toBe("forbidden");
    expect(result.isRetryable).toBe(false);
    expect(result.isConfigError).toBe(true);
  });

  // Connection errors
  it("classifies ECONNREFUSED as connection_failed", () => {
    const result = classifyAiError("connect ECONNREFUSED 127.0.0.1:8080");
    expect(result.code).toBe("connection_failed");
    expect(result.isRetryable).toBe(true);
    expect(result.isConfigError).toBe(true);
  });

  it("classifies ENOTFOUND as connection_failed", () => {
    const result = classifyAiError("getaddrinfo ENOTFOUND api.example.com");
    expect(result.code).toBe("connection_failed");
  });

  it("classifies connect ETIMEDOUT as connection_failed", () => {
    const result = classifyAiError("connect ETIMEDOUT 10.0.0.1:443");
    expect(result.code).toBe("connection_failed");
  });

  // Timeout
  it("classifies timeout error", () => {
    const result = classifyAiError("Request timeout after 30s");
    expect(result.code).toBe("timeout");
    expect(result.isRetryable).toBe(true);
    expect(result.isConfigError).toBe(false);
  });

  it("classifies ETIMEDOUT (without connect prefix) as timeout", () => {
    const result = classifyAiError("read ETIMEDOUT");
    expect(result.code).toBe("timeout");
  });

  // Config errors
  it("classifies not configured error", () => {
    const result = classifyAiError("AI provider is not configured");
    expect(result.code).toBe("not_configured");
    expect(result.isConfigError).toBe(true);
    expect(result.isRetryable).toBe(false);
  });

  it("classifies no provider error as not_configured", () => {
    const result = classifyAiError("no provider available");
    expect(result.code).toBe("not_configured");
  });

  it("classifies not enabled error as not_configured", () => {
    const result = classifyAiError("AI is not enabled");
    expect(result.code).toBe("not_configured");
  });

  // Model errors
  it("classifies model not found error", () => {
    const result = classifyAiError("model gpt-5 not found");
    expect(result.code).toBe("model_error");
    expect(result.isRetryable).toBe(false);
    expect(result.isConfigError).toBe(true);
  });

  it("classifies model does not exist error", () => {
    const result = classifyAiError("model xyz does not exist");
    expect(result.code).toBe("model_error");
  });

  it("classifies invalid model error", () => {
    const result = classifyAiError("model name is invalid");
    expect(result.code).toBe("model_error");
  });

  // Server errors
  it("classifies 500 error as server_error", () => {
    const result = classifyAiError("Internal Server Error 500");
    expect(result.code).toBe("server_error");
    expect(result.isRetryable).toBe(true);
    expect(result.isConfigError).toBe(false);
  });

  it("classifies 502 error as server_error", () => {
    const result = classifyAiError("Bad Gateway 502");
    expect(result.code).toBe("server_error");
  });

  it("classifies 503 error as server_error", () => {
    const result = classifyAiError("Service Unavailable 503");
    expect(result.code).toBe("server_error");
  });

  it("classifies internal server text as server_error", () => {
    const result = classifyAiError("internal server error occurred");
    expect(result.code).toBe("server_error");
  });

  // Object input
  it("handles object input with error field", () => {
    const result = classifyAiError({ error: "401 Unauthorized" });
    expect(result.code).toBe("auth_failed");
  });

  it("handles object input with content field", () => {
    const result = classifyAiError({ content: "rate limit exceeded" });
    expect(result.code).toBe("rate_limited");
  });

  it("handles object input with message field", () => {
    const result = classifyAiError({ message: "Request timeout" });
    expect(result.code).toBe("timeout");
  });

  it("falls back through object fields: error > content > message", () => {
    const result = classifyAiError({ error: "401 auth error", content: "timeout", message: "model not found" });
    expect(result.code).toBe("auth_failed");
  });

  it("handles object with no matching fields as unknown", () => {
    const result = classifyAiError({});
    expect(result.code).toBe("unknown");
  });

  // Unknown
  it("returns unknown for unrecognized errors", () => {
    const result = classifyAiError("something weird happened");
    expect(result.code).toBe("unknown");
    expect(result.isRetryable).toBe(true);
    expect(result.isConfigError).toBe(false);
  });

  // Case insensitive
  it("is case insensitive", () => {
    const result = classifyAiError("NOT CONFIGURED");
    expect(result.code).toBe("not_configured");
  });

  it("is case insensitive for auth errors", () => {
    const result = classifyAiError("UNAUTHORIZED 401");
    expect(result.code).toBe("auth_failed");
  });

  // All results have required fields
  it("always returns all required fields", () => {
    const cases = [
      "401", "429", "403", "ECONNREFUSED", "timeout",
      "not configured", "model not found", "500", "random error",
    ];
    for (const input of cases) {
      const result = classifyAiError(input);
      expect(result).toHaveProperty("code");
      expect(result).toHaveProperty("message");
      expect(typeof result.isRetryable).toBe("boolean");
      expect(typeof result.isConfigError).toBe("boolean");
      expect(result.message.length).toBeGreaterThan(0);
    }
  });
});
