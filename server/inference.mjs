export function inferenceFailure(error) {
  return {
    error: String(error?.message || error || "Unknown inference failure."),
  };
}

export function completedAnswer(body, source = "Meta") {
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
