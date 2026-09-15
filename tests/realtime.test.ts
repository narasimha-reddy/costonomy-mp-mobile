import { socketUrl } from '@/contexts/RealtimeProvider';

const BASE = 'http://localhost:8080/costonomy-mp-api';

describe('socketUrl', () => {
  it('keeps the API context path', () => {
    // The server returns a path relative to its own context. `new URL(path, base)`
    // would treat the leading slash as origin-absolute and silently drop
    // /costonomy-mp-api — the socket then never connects, the app falls back to
    // polling forever, and nothing looks wrong.
    expect(socketUrl('/api/v1/realtime/socket', 'abc', BASE))
      .toBe('ws://localhost:8080/costonomy-mp-api/api/v1/realtime/socket?ticket=abc');
  });

  it('upgrades https to wss', () => {
    expect(socketUrl('/api/v1/realtime/socket', 'abc', 'https://api.example.com/mp'))
      .toBe('wss://api.example.com/mp/api/v1/realtime/socket?ticket=abc');
  });

  it('uses an absolute socket url as given', () => {
    // So the socket can move to its own host without a client change.
    expect(socketUrl('wss://live.example.com/socket', 'abc', BASE))
      .toBe('wss://live.example.com/socket?ticket=abc');
  });

  it('appends to an existing query string', () => {
    expect(socketUrl('wss://live.example.com/socket?v=2', 'abc', BASE))
      .toBe('wss://live.example.com/socket?v=2&ticket=abc');
  });

  it('escapes a ticket that is not URL-safe', () => {
    expect(socketUrl('/socket', 'a+b/c=', BASE)).toContain('ticket=a%2Bb%2Fc%3D');
  });

  it('tolerates a base with a trailing slash and a path without a leading one', () => {
    expect(socketUrl('api/v1/realtime/socket', 'abc', 'http://localhost:8080/mp/'))
      .toBe('ws://localhost:8080/mp/api/v1/realtime/socket?ticket=abc');
  });
});
