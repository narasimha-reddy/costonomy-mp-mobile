/** @jest-environment jsdom */
import { loadWebMaps, resetWebMapsLoader, webMapsKey } from '@/lib/maps/googleWebLoader';

describe('googleWebLoader', () => {
  beforeEach(() => {
    resetWebMapsLoader();
    delete process.env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_KEY;
    delete process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
    (window as unknown as Record<string, unknown>).google = undefined;
    document.head.innerHTML = '';
  });

  it('prefers the web key and falls back to the API key only when it is empty', () => {
    expect(webMapsKey()).toBe('');
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY = 'b';
    expect(webMapsKey()).toBe('b');
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_KEY = '  ';
    expect(webMapsKey()).toBe('b');
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_KEY = 'a';
    expect(webMapsKey()).toBe('a');
  });

  it('injects the script once however many maps ask', () => {
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_KEY = 'a';
    const p1 = loadWebMaps();
    const p2 = loadWebMaps();
    expect(p2).toBe(p1);
    expect(document.head.querySelectorAll('script')).toHaveLength(1);
  });

  it('rejects without a key and injects nothing', async () => {
    await expect(loadWebMaps()).rejects.toThrow();
    expect(document.head.querySelectorAll('script')).toHaveLength(0);
  });
});
