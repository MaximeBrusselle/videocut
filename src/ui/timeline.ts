import { $ } from '../lib/dom';

/** Track with draggable in/out handles and a playhead. Works in seconds. */
export class Timeline {
  private track = $('track');
  private range = $('range');
  private handleIn = $('handle-in');
  private handleOut = $('handle-out');
  private playhead = $('playhead');
  private duration = 0;

  onSeek: (time: number) => void = () => {};
  onIn: (time: number) => void = () => {};
  onOut: (time: number) => void = () => {};

  constructor() {
    this.makeDraggable(this.handleIn, (t) => this.onIn(t));
    this.makeDraggable(this.handleOut, (t) => this.onOut(t));
    // Press anywhere on the track to jump there, then keep dragging to scrub.
    this.track.addEventListener('pointerdown', (event) => {
      if (event.target !== this.track && event.target !== this.range) return;
      this.track.setPointerCapture(event.pointerId);
      this.onSeek(this.timeAt(event.clientX));
    });
    this.track.addEventListener('pointermove', (event) => {
      if (this.track.hasPointerCapture(event.pointerId)) this.onSeek(this.timeAt(event.clientX));
    });
  }

  private timeAt(clientX: number): number {
    const box = this.track.getBoundingClientRect();
    const fraction = Math.min(Math.max((clientX - box.left) / box.width, 0), 1);
    return fraction * this.duration;
  }

  private makeDraggable(handle: HTMLElement, callback: (time: number) => void): void {
    handle.addEventListener('pointerdown', (event) => {
      handle.setPointerCapture(event.pointerId);
      event.stopPropagation();
    });
    handle.addEventListener('pointermove', (event) => {
      if (handle.hasPointerCapture(event.pointerId)) callback(this.timeAt(event.clientX));
    });
  }

  update(duration: number, inPoint: number, outPoint: number, playhead: number): void {
    this.duration = duration;
    const percent = (t: number) => (duration > 0 ? (t / duration) * 100 : 0);
    this.handleIn.style.left = `${percent(inPoint)}%`;
    this.handleOut.style.left = `${percent(outPoint)}%`;
    this.range.style.left = `${percent(inPoint)}%`;
    this.range.style.width = `${percent(outPoint) - percent(inPoint)}%`;
    this.playhead.style.left = `${percent(playhead)}%`;
  }
}
