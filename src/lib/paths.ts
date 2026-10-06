/** `<folder>\<name>.<ext>` -> `<folder>\<name>_tiktok.mp4`. */
export function defaultOutputPath(clipPath: string): string {
  return clipPath.replace(/\.[^.\\/]+$/, '') + '_tiktok.mp4';
}

export function fileName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

export function samePath(a: string, b: string): boolean {
  const normalise = (p: string) => p.replace(/\//g, '\\').toLowerCase();
  return normalise(a) === normalise(b);
}
