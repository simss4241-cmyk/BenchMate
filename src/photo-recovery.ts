// Share renewal across thumbnails: a grid must not race dozens of new cookies.
export function createPhotoRecovery(request: typeof fetch = fetch) {
  let pending: Promise<boolean> | undefined;
  return function recover(): Promise<boolean> {
    if (!pending) {
      pending = request("/api/session", {
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
      })
        .then(
          async (response) =>
            response.ok && (await response.json()).authenticated === true,
        )
        .catch(() => false)
        .finally(() => {
          pending = undefined;
        });
    }
    return pending;
  };
}

export const recoverPhotoSession = createPhotoRecovery();

export function photoRetryUrl(src: string, attempt: number) {
  return `${src}${src.includes("?") ? "&" : "?"}photoRetry=${attempt}`;
}
