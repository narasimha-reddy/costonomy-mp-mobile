import { createPressGuard } from '@/lib/orders/pressGuard';

describe('press guard on the sticky stage bar', () => {
  it('ignores a second press within the window', () => {
    let t = 1000;
    const guard = createPressGuard(800, () => t);
    const fn = jest.fn();
    guard.press(fn);
    t = 1100;
    guard.press(fn);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('lets a press after the window through', () => {
    let t = 1000;
    const guard = createPressGuard(800, () => t);
    const fn = jest.fn();
    guard.press(fn);
    t = 1800;
    guard.press(fn);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('restarts the window when the stage changes', () => {
    let t = 1000;
    const guard = createPressGuard(800, () => t);
    const fn = jest.fn();
    guard.press(fn);
    t = 1500;
    guard.stageChanged();
    t = 2200; // 1200 after the first press but only 700 after the stage change
    guard.press(fn);
    expect(fn).toHaveBeenCalledTimes(1);
    t = 2300;
    guard.press(fn);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('lets the very first press through', () => {
    const guard = createPressGuard(800, () => 5);
    const fn = jest.fn();
    guard.press(fn);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
