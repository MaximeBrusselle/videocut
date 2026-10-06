import { $ } from '../lib/dom';
import { clampCropX, cropWidth, frameRect } from '../lib/geometry';
import type { VideoInfo } from '../lib/types';

/** The draggable 9:16 window drawn over the preview. Works in source pixels. */
export class CropOverlay {
  private stage = $('stage');
  private box = $('crop');
  private video: VideoInfo | null = null;
  private cropX = 0;

  /** Called with the new crop x (source pixels, already clamped) while dragging. */
  onChange: (cropX: number) => void = () => {};

  constructor() {
    new ResizeObserver(() => this.layout()).observe(this.stage);
    let startPointerX = 0;
    let startCropX = 0;
    this.box.addEventListener('pointerdown', (event) => {
      this.box.setPointerCapture(event.pointerId);
      startPointerX = event.clientX;
      startCropX = this.cropX;
    });
    this.box.addEventListener('pointermove', (event) => {
      if (!this.video || !this.box.hasPointerCapture(event.pointerId)) return;
      const { scale } = this.rect(this.video);
      const next = startCropX + (event.clientX - startPointerX) / scale;
      this.onChange(clampCropX(next, this.video.width, this.video.height));
    });
  }

  update(video: VideoInfo | null, cropX: number): void {
    this.video = video;
    this.cropX = cropX;
    this.layout();
  }

  private rect(video: VideoInfo) {
    return frameRect(this.stage.clientWidth, this.stage.clientHeight, video.width, video.height);
  }

  private layout(): void {
    if (!this.video) {
      this.box.hidden = true;
      return;
    }
    const r = this.rect(this.video);
    this.box.hidden = false;
    this.box.style.left = `${r.left + this.cropX * r.scale}px`;
    this.box.style.top = `${r.top}px`;
    this.box.style.width = `${cropWidth(this.video.height) * r.scale}px`;
    this.box.style.height = `${r.height}px`;
  }
}
