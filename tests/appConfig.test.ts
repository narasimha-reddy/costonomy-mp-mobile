// eslint-disable-next-line @typescript-eslint/no-require-imports
const appConfig = require('../app.config.js') as (ctx: { config: Record<string, any> }) => Record<string, any>;

// The config reads the variable by its literal name; the test sets it through the same name.
const env = process.env as Record<string, string | undefined>;
const KEY = 'EXPO_PUBLIC_GOOGLE_MAPS_API_KEY';
const base = () => ({ name: 'Mandi', android: { package: 'com.costonomy.mp', permissions: ['x'] } });
const saved = env[KEY];

afterEach(() => {
  if (saved === undefined) delete env[KEY];
  else env[KEY] = saved;
});

describe('app.config.js', () => {
  it('leaves the config untouched when no key is set', () => {
    delete env[KEY];
    expect(appConfig({ config: base() })).toEqual(base());
  });

  it('leaves the config untouched when the key is blank', () => {
    env[KEY] = '   ';
    expect(appConfig({ config: base() })).toEqual(base());
  });

  it('puts the key in the Android Google Maps config and keeps the rest', () => {
    env[KEY] = 'TEST_DUMMY_KEY';
    const out = appConfig({ config: base() });
    expect(out.android.config.googleMaps.apiKey).toBe('TEST_DUMMY_KEY');
    expect(out.android.package).toBe('com.costonomy.mp');
    expect(out.android.permissions).toEqual(['x']);
  });
});
