type Region = {
  photo: string;
  bounds: { x: number; y: number; width: number; height: number };
};
export function numberedBoardRegions<T extends Region>(
  components: T[],
  photo: string,
) {
  return components
    .map((component, index) => ({ component, number: index + 1 }))
    .filter((entry) => entry.component.photo === photo);
}

// Place number badges in free corners so an enclosing shield cannot hide nearby labels.
export function layoutBoardBadges<T extends Region>(
  regions: { component: T; number: number }[],
  width: number,
  height: number,
) {
  const placed: { x: number; y: number; width: number; height: number }[] = [];
  const positions = new Map<
    number,
    { x: number; y: number; width: number; height: number }
  >();
  for (const { component, number } of [...regions].sort(
    (a, b) =>
      a.component.bounds.width * a.component.bounds.height -
      b.component.bounds.width * b.component.bounds.height,
  )) {
    const b = component.bounds,
      w = Math.max(18, String(number).length * 6 + 8),
      h = 18;
    const left = b.x * width,
      top = b.y * height,
      right = (b.x + b.width) * width - w,
      bottom = (b.y + b.height) * height - h;
    const candidates = [
      [left, top],
      [right, top],
      [left, bottom],
      [right, bottom],
    ].map(([x, y]) => ({
      x: Math.max(0, Math.min(width - w, x)),
      y: Math.max(0, Math.min(height - h, y)),
      width: w,
      height: h,
    }));
    const overlap = (a: (typeof placed)[number]) =>
      placed.reduce(
        (n, p) =>
          n +
          Math.max(
            0,
            Math.min(a.x + w + 2, p.x + p.width + 2) - Math.max(a.x, p.x),
          ) *
            Math.max(
              0,
              Math.min(a.y + h + 2, p.y + p.height + 2) - Math.max(a.y, p.y),
            ),
        0,
      );
    const badge = candidates.sort((a, b) => overlap(a) - overlap(b))[0];
    placed.push(badge);
    positions.set(number, badge);
  }
  return positions;
}

// Prefer the smallest footprint under the pointer, including inside a selected enclosure.
export function boardRegionAtPoint<T extends Region>(
  components: T[],
  photo: string,
  point: { x: number; y: number },
) {
  return components
    .filter(
      (c) =>
        c.photo === photo &&
        point.x >= c.bounds.x &&
        point.x <= c.bounds.x + c.bounds.width &&
        point.y >= c.bounds.y &&
        point.y <= c.bounds.y + c.bounds.height,
    )
    .sort(
      (a, b) =>
        a.bounds.width * a.bounds.height - b.bounds.width * b.bounds.height,
    )[0];
}
// Repeated inference must not silently add a second stock source for the same footprint.
export function mergeBoardRegions<T extends Region>(
  existing: T[],
  candidates: T[],
) {
  const added: T[] = [];
  for (const candidate of candidates) {
    const duplicate = [...existing, ...added].some((current) => {
      if (current.photo !== candidate.photo) return false;
      const a = current.bounds,
        b = candidate.bounds;
      const overlap =
        Math.max(
          0,
          Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x),
        ) *
        Math.max(
          0,
          Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y),
        );
      const union = a.width * a.height + b.width * b.height - overlap;
      return union > 0 && overlap / union > 0.55;
    });
    if (!duplicate) added.push(candidate);
  }
  return {
    components: [...existing, ...added],
    added,
    skipped: candidates.length - added.length,
  };
}
