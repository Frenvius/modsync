import { test, expect, describe } from 'bun:test';

import { getExternalWebUrl } from '~/usecase/service/browser';

describe('getExternalWebUrl', () => {
  test('accepts only web links outside the app origin', () => {
    const origin = 'http://localhost:1420';

    expect(getExternalWebUrl('/project/example', origin)).toBeUndefined();
    expect(getExternalWebUrl('mailto:user@example.com', origin)).toBeUndefined();
    expect(getExternalWebUrl('https://modrinth.com/mod/example', origin)).toBe('https://modrinth.com/mod/example');
  });
});
