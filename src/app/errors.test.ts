import { describe, expect, it } from 'vitest';
import { UserFacingError, messageFor } from './errors';
import { RecipeValidationError } from './recipes';

describe('messageFor', () => {
  it('shows user-facing messages', () => {
    expect(messageFor(new UserFacingError('Title is required'), 'fallback')).toBe('Title is required');
    expect(messageFor(new RecipeValidationError('Base servings must be a positive number'), 'fallback'))
      .toBe('Base servings must be a positive number');
  });

  it('hides internal errors behind the fallback', () => {
    expect(messageFor(new Error('DatabaseClosedError: internal'), 'Could not save.')).toBe('Could not save.');
    expect(messageFor('boom', 'Could not save.')).toBe('Could not save.');
    expect(messageFor(new UserFacingError(''), 'Could not save.')).toBe('Could not save.');
  });
});
