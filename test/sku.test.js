import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import * as sku from '../src/sku.js';

describe('probeUsers', () => {
  afterEach(() => {
    Bun.spawn.mockRestore?.();
  });

  test('tries candidates in order with a no-op command', async () => {
    const attempts = [];
    spyOn(Bun, 'spawn').mockImplementation((args) => {
      const user = args.findLast(argument => argument.includes('@')).split('@')[0];
      if (args.includes('true'))
        attempts.push(user);
      const found = user === 'ubuntu';

      return {
        exited: Promise.resolve(found ? 0 : 255),
        killed: true,
        stdout: new Blob([]).stream(),
      };
    });

    expect(await sku.probeUsers('192.0.2.1', ['u', 'ubuntu'])).toBe('ubuntu');
    expect(attempts).toEqual(['u', 'ubuntu']);
  }, 10000);
});

test('SKU projection includes the SSH user', () => {
  const device = sku.defineSKU({
    ip: '192.0.2.1',
    mac: '00:11:22:33:44:55',
    user: 'ubuntu',
    buildStamp: '20260820',
  });

  expect(device.projection.user).toBe('ubuntu');
});
