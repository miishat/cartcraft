import { describe, expect, it } from 'vitest';
import { TooLargeError, limitBytes } from './limitBytes';

const bodyOf = (text: string) => new Response(text).body!;

describe('limitBytes', () => {
  it('passes small bodies through unchanged', async () => {
    expect(await new Response(limitBytes(bodyOf('hello'), 10)).text()).toBe('hello');
  });

  it('errors once the limit is exceeded', async () => {
    await expect(new Response(limitBytes(bodyOf('x'.repeat(11)), 10)).text()).rejects.toBeInstanceOf(TooLargeError);
  });
});
