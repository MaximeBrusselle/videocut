import { $ } from '../lib/dom';

/** Track with draggable in/out handles and a playhead. Works in seconds. */
export class Timeline {
  private track = $('track');
  private range = $('range');
  private handleIn = $('handle-in');
  private handleOut = $('handle-out');
  private playhead = $('playhead');
  private duration = 0;
  /** Track box, measured once per drag so pointer moves never force a layout. */
  private box: DOMRect | null = null;

  onSeek: (time: number) => void = () => {};
  onSeekEnd: (time: number) => void = () => {};
  onIn: (time: number) => void = () => {};
  onOut: (time: number) => void = () => {};

  constructor() {
    this.makeDraggable(this.handleIn, (t) => this.onIn(t));
    this.makeDraggable(this.handleOut, (t) => this.onOut(t));
    // Press anywhere on the track to jump there, then keep dragging to scrub.
    this.track.addEventListener('pointerdown', (event) => {
      if (event.target !== this.track && event.target !== this.range) return;
      event.preventDefault();
      this.track.setPointerCapture(event.pointerId);
      this.box = this.track.getBoundingClientRect();
      this.onSeek(this.timeAt(event.clientX));
    });
    this.track.addEventListener('pointermove', (event) => {
      if (this.track.hasPointerCapture(event.pointerId)) this.onSeek(this.timeAt(event.clientX));
    });
    const release = (event: PointerEvent) => {
      if (this.track.hasPointerCapture(event.pointerId)) this.onSeekEnd(this.timeAt(event.clientX));
    };
    this.track.addEventListener('pointerup', release);
    this.track.addEventListener('pointercancel', release);
  }

  private timeAt(clientX: number): number {
    const box = this.box ?? this.track.getBoundingClientRect();
    const fraction = Math.min(Math.max((clientX - box.left) / box.width, 0), 1);
    return fraction * this.duration;
  }

  private makeDraggable(handle: HTMLElement, callback: (time: number) => void): void {
    handle.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      handle.setPointerCapture(event.pointerId);
      this.box = this.track.getBoundingClientRect();
      event.stopPropagation();
    });
    handle.addEventListener('pointermove', (event) => {
      if (handle.hasPointerCapture(event.pointerId)) callback(this.timeAt(event.clientX));
    });
  }

  private percent(t: number): number {
    return this.duration > 0 ? (t / this.duration) * 100 : 0;
  }

  update(duration: number, inPoint: number, outPoint: number): void {
    this.duration = duration;
    this.handleIn.style.left = `${this.percent(inPoint)}%`;
    this.handleOut.style.left = `${this.percent(outPoint)}%`;
    this.range.style.left = `${this.percent(inPoint)}%`;
    this.range.style.width = `${this.percent(outPoint) - this.percent(inPoint)}%`;
  }

  setPlayhead(time: number): void {
    this.playhead.style.left = `${this.percent(time)}%`;
  }
}
