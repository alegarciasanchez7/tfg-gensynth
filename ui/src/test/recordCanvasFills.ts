import { vi } from 'vitest';

/**
 * jsdom canvases have no 2D context, so their drawing code does not run. This gives every canvas
 * a stub context that records the colour of each `fillRect` (the background is the first one).
 */
export function recordCanvasFills(): { fills: string[]; restore: () => void } {
  const fills: string[] = [];
  const state: Record<string | symbol, unknown> = { fillStyle: '', measureText: () => ({ width: 0 }) };
  const context = new Proxy(state, {
    get(target, key) {
      if (key in target) return target[key];
      if (key === 'fillRect') return () => fills.push(String(target.fillStyle));
      return () => undefined;
    },
    set(target, key, value) {
      target[key] = value;
      return true;
    },
  });
  const spy = vi
    .spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockImplementation((() => context) as unknown as typeof HTMLCanvasElement.prototype.getContext);
  return { fills, restore: () => spy.mockRestore() };
}
