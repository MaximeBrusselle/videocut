/** `<folder>\<name>.<ext>` -> `<folder>\<name>_tiktok.<extension>`. */
export function defaultOutputPath(clipPath: string, extension = 'mp4'): string {
  return clipPath.replace(/\.[^.\\/]+$/, '') + `_tiktok.${extension}`;
}

export function fileName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

export function samePath(a: string, b: string): boolean {
  const normalise = (p: string) => p.replace(/\//g, '\\').toLowerCase();
  return normalise(a) === normalise(b);
}
