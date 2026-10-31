export const META_MODELS = [
  "muse-spark-1.3",
  "muse-wonder-1.0",
  "muse-spark-1.2",
  "muse-spark-1.1",
];
export const metaKey = () =>
  (process.env.MODEL_API_KEY || "").trim() ||
  (process.env.META_API_KEY || "").trim();

function metaError(status) {
  const messages = {
    401: "Meta rejected the API key. Check MODEL_API_KEY in .env and restart BenchMate.",
    403: "This Meta account or key cannot access the selected model. Check its permissions.",
    402: "Meta rejected the request for billing or credit reasons. Check the Model API dashboard.",
    429: "Meta is rate-limiting requests or the account has reached a quota. Check usage and try again later.",
  };
  const e = new Error(
    messages[status] ||
      (status >= 500
        ? "Meta is temporarily unavailable. No local fallback or automatic retry was made."
        : `Meta rejected the request (HTTP ${status}). Check model access and request settings.`),
  );
  e.code = `META_HTTP_${status}`;
  return e;
}

export function createMeta({
  key = metaKey,
  fetchImpl = fetch,
  baseUrl = "https://api.meta.ai/v1",
} = {}) {
  async function request(endpoint, options = {}) {
    const secret = key();
    if (!secret)
      throw new Error(
        "Meta API key is missing. Set MODEL_API_KEY in .env, restart BenchMate, then refresh models.",
      );
    let response;
    try {
      response = await fetchImpl(`${baseUrl}${endpoint}`, {
        ...options,
        redirect: "error",
        headers: {
          Authorization: `Bearer ${secret}`,
          "Content-Type": "application/json",
          ...options.headers,
        },
        signal: options.signal || AbortSignal.timeout(10000),
      });
    } catch (e) {
      if (options.signal?.aborted) throw e;
      throw new Error(
        "Cannot reach Meta Model API. Check the connection and try again.",
      );
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw metaError(response.status);
    }
    return response;
  }
  return {
    configured: () => Boolean(key()),
    async models() {
      const response = await request("/models");
      let body;
      try {
        body = await response.json();
      } catch {
        throw new Error(
          "Meta returned an invalid model list. Try refreshing later.",
        );
      }
      if (!Array.isArray(body.data))
        throw new Error(
          "Meta returned an unexpected model list. Try refreshing later.",
        );
      return META_MODELS.filter((id) => body.data.some((m) => m.id === id));
    },
    async generate({
      model,
      messages,
      schema,
      responseMode,
      signal,
      onProgress,
      imageMime = "image/jpeg",
      maxTokens = 4096,
    }) {
      if (!META_MODELS.includes(model))
        throw new Error("Choose a supported Standard-mode Meta model.");
      const input = messages.map(({ images, ...m }) =>
        images?.length
          ? {
              ...m,
              content: [
                { type: "text", text: m.content },
                ...images.map((bytes) => ({
                  type: "image_url",
                  image_url: { url: `data:${imageMime};base64,${bytes}` },
                })),
              ],
            }
          : m,
      );
      const response = await request("/chat/completions", {
        method: "POST",
        signal,
        body: JSON.stringify({
          model,
          messages: input,
          stream: true,
          max_tokens: Math.max(1, Math.min(4096, maxTokens)),
          reasoning_effort: responseMode === "quick" ? "minimal" : "low",
          ...(schema
            ? {
                response_format: {
                  type: "json_schema",
                  json_schema: {
                    name: "benchmate_identity",
                    strict: true,
                    schema,
                  },
                },
              }
            : {}),
        }),
      });
      onProgress?.({ phase: "thinking" });
      return readMetaStream(response, onProgress);
    },
  };
}

export async function readMetaStream(response, progress = () => {}) {
  const reader = response.body.getReader(),
    decoder = new TextDecoder();
  let buffer = "",
    content = "",
    finish = null,
    usage = null,
    sentinel = false;
  function accept(line) {
    if (!line.startsWith("data:")) return;
    const data = line.slice(5).trim();
    if (!data) return;
    if (data === "[DONE]") {
      sentinel = true;
      return;
    }
    let chunk;
    try {
      chunk = JSON.parse(data);
    } catch {
      throw new Error(
        "Meta returned an invalid response stream. Your request is kept for retry.",
      );
    }
    if (chunk.error)
      throw new Error(
        "Meta stopped the response with an upstream error. Check account usage and try again.",
      );
    if (chunk.usage)
      usage = {
        inputTokens: chunk.usage.prompt_tokens || 0,
        outputTokens: chunk.usage.completion_tokens || 0,
        totalTokens: chunk.usage.total_tokens || 0,
      };
    const choice = chunk.choices?.[0];
    if (choice?.delta?.refusal)
      throw new Error("Meta declined this request. Try revising the question.");
    if (typeof choice?.delta?.content === "string") {
      content += choice.delta.content;
      progress({ phase: "answering", text: choice.delta.content });
    }
    if (choice?.finish_reason) finish = choice.finish_reason;
  }
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let n;
      while ((n = buffer.indexOf("\n")) >= 0) {
        accept(buffer.slice(0, n).replace(/\r$/, ""));
        buffer = buffer.slice(n + 1);
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) accept(buffer.replace(/\r$/, ""));
    if (!sentinel || !finish)
      throw new Error(
        "Meta disconnected before the reply completed. Your request is kept for retry.",
      );
    if (!["stop", "length"].includes(finish))
      throw new Error(
        "Meta did not complete a usable text answer. Try revising the request.",
      );
    return { message: { content }, done: true, done_reason: finish, usage };
  } finally {
    reader.releaseLock();
  }
}
