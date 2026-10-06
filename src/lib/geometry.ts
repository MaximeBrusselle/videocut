export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
  /** Displayed pixels per source pixel. */
  scale: number;
}

/** Width of the 9:16 crop window in source pixels (always even). */
export function cropWidth(srcHeight: number): number {
  return Math.floor((srcHeight * 9) / 16 / 2) * 2;
}

/** Rounds x down to an even number and keeps the crop window inside the frame. */
export function clampCropX(x: number, srcWidth: number, srcHeight: number): number {
  const maxX = Math.max(0, Math.floor((srcWidth - cropWidth(srcHeight)) / 2) * 2);
  const even = Math.floor(x / 2) * 2;
  return Math.min(Math.max(even, 0), maxX);
}

export function centeredCropX(srcWidth: number, srcHeight: number): number {
  return clampCropX((srcWidth - cropWidth(srcHeight)) / 2, srcWidth, srcHeight);
}

/** Where a `srcW`x`srcH` frame sits inside a container with `object-fit: contain`. */
export function frameRect(containerW: number, containerH: number, srcW: number, srcH: number): Rect {
  const scale = Math.min(containerW / srcW, containerH / srcH);
  const width = srcW * scale;
  const height = srcH * scale;
  return { left: (containerW - width) / 2, top: (containerH - height) / 2, width, height, scale };
}
