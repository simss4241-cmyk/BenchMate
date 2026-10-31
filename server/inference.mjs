// Reasoning controls differ by model. Only send values advertised by Ollama.
export function inferenceFailure(error) {
  const message = String(
    error?.message || error || "Unknown inference failure.",
  );
  if (/CUDA error:\s*shared object initialization failed/i.test(message)) {
    return {
      code: "OLLAMA_CUDA_INITIALIZATION",
      error:
        "Ollama could not initialize the GPU for this model. Try once more; if it repeats, restart Ollama or choose another installed model. Your question is kept for retry.",
    };
  }
  if (
    /out of memory|unable to allocate|failed to allocate.*memory/i.test(message)
  ) {
    return {
      code: "OLLAMA_MEMORY",
      error:
        "Ollama could not allocate enough memory for this model. Close other model workloads or choose a smaller installed model. Your question is kept for retry.",
    };
  }
  if (
    /llama-server process has terminated|runner process has terminated/i.test(
      message,
    )
  ) {
    return {
      code: "OLLAMA_RUNNER_CRASH",
      error:
        "Ollama’s model process stopped unexpectedly. Restart Ollama or choose another installed model, then retry. Your question is kept for retry.",
    };
  }
  return { error: message };
}

export function thinkingFor(metadata, mode = "balanced") {
  const values = metadata?.thinking?.values;
  if (!Array.isArray(values)) return undefined;
  const preferences =
    mode === "quick" ? [false, "low", true] : ["low", true, false];
  return preferences.find((value) => values.includes(value));
}

export function completedAnswer(body, source = "Ollama") {
  const answer = body.message?.content?.trim();
  const limited = body.done_reason === "length";
  if (!answer) {
    if (limited)
      throw new Error(
        "The model exhausted its generation budget before producing an answer. Try Quick reply or narrow the question. Your request is kept for retry.",
      );
    if (body.message?.thinking)
      throw new Error(
        "The model finished reasoning without a visible answer. Try Quick reply or another model. Your request is kept for retry.",
      );
    throw new Error(
      `${source} finished without a visible answer. Your request is kept for retry.`,
    );
  }
  return limited
    ? `${answer}\n\n[Incomplete response: the generation limit was reached. Verify missing steps before using this as a build plan.]`
    : answer;
}

export async function readOllamaStream(response, progress = () => {}) {
  const reader = response.body.getReader(),
    decoder = new TextDecoder();
  let buffer = "",
    content = "",
    thinkingSeen = false,
    final = null,
    phase = "";
  function accept(line) {
    if (!line.trim()) return;
    const chunk = JSON.parse(line);
    if (chunk.error) throw new Error(`Ollama: ${String(chunk.error)}`);
    if (chunk.message?.thinking) {
      thinkingSeen = true;
      if (phase !== "thinking") {
        phase = "thinking";
        progress({ phase });
      }
    }
    if (chunk.message?.content) {
      content += chunk.message.content;
      phase = "answering";
      progress({ phase, text: chunk.message.content });
    }
    if (chunk.done) final = chunk;
  }
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        accept(buffer.slice(0, newline));
        buffer = buffer.slice(newline + 1);
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) accept(buffer);
    if (!final)
      throw new Error(
        "The connection ended before Ollama completed its response. Your request is kept for retry.",
      );
    return {
      ...final,
      message: { content, thinking: thinkingSeen ? "present" : undefined },
    };
  } finally {
    reader.releaseLock();
  }
}
