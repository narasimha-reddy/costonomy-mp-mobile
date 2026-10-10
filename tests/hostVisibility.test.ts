import { hostHasTiles, hostShown, watchHost } from '@/lib/maps/hostVisibility';

const box = (width: number, height: number, rects = 1) => ({
  getBoundingClientRect: () => ({ width, height }),
  getClientRects: () => ({ length: rects }),
});

describe('hostShown', () => {
  it('a DOM box with a size is shown', () => {
    expect(hostShown(box(390, 200))).toBe(true);
  });
  it('display:none (no client rects) or a zero size is hidden', () => {
    expect(hostShown(box(0, 0, 0))).toBe(false);
    expect(hostShown(box(390, 0))).toBe(false);
    expect(hostShown(box(0, 200))).toBe(false);
  });
  it('something that cannot be measured (tests, native) counts as shown', () => {
    expect(hostShown(null)).toBe(true);
    expect(hostShown({ props: {} })).toBe(true);
  });
});

describe('watchHost', () => {
  afterEach(() => { delete (globalThis as Record<string, unknown>).ResizeObserver; });
  it('observes a DOM box with ResizeObserver and disconnects', () => {
    const calls: string[] = [];
    let fire: () => void = () => undefined;
    (globalThis as Record<string, unknown>).ResizeObserver = class {
      constructor(cb: () => void) { fire = cb; }
      observe() { calls.push('observe'); }
      disconnect() { calls.push('disconnect'); }
    };
    const onChange = jest.fn();
    const stop = watchHost(box(1, 1), onChange);
    fire();
    expect(onChange).toHaveBeenCalledTimes(1);
    stop();
    expect(calls).toEqual(['observe', 'disconnect']);
  });
  it('without ResizeObserver or a DOM node it watches nothing', () => {
    expect(() => watchHost(box(1, 1), jest.fn())()).not.toThrow();
    expect(() => watchHost({ props: {} }, jest.fn())()).not.toThrow();
  });
});

describe('hostHasTiles', () => {
  const host = (imgs: { src: string }[], canvases: { width: number; height: number }[] = []) => ({
    querySelectorAll: (sel: string) => (sel.endsWith('img') ? imgs : canvases),
  });
  it('a Google raster tile or a drawn canvas counts as painted', () => {
    expect(hostHasTiles(host([{ src: 'https://maps.googleapis.com/maps/vt?pb=!1m5' }]))).toBe(true);
    expect(hostHasTiles(host([], [{ width: 256, height: 256 }]))).toBe(true);
  });
  it('our own marker images and empty canvases do not', () => {
    expect(hostHasTiles(host([{ src: 'data:image/svg+xml;charset=UTF-8,%3Csvg' }], [{ width: 0, height: 0 }]))).toBe(false);
    expect(hostHasTiles(null)).toBe(false);
    expect(hostHasTiles({})).toBe(false);
  });
});
