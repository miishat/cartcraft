// @vitest-environment jsdom
import { act, render, renderHook, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { UserFacingError } from '../app/errors';
import { ErrorNote } from './components/ErrorNote';
import { useAsyncAction } from './useAsyncAction';

describe('useAsyncAction', () => {
  it('returns the result and tracks pending', async () => {
    let resolve: (v: number) => void = () => undefined;
    const { result } = renderHook(() => useAsyncAction(() => new Promise<number>((r) => { resolve = r; }), 'failed'));
    let promise: Promise<number | undefined> = Promise.resolve(undefined);
    act(() => { promise = result.current.run(); });
    expect(result.current.pending).toBe(true);
    await act(async () => { resolve(42); expect(await promise).toBe(42); });
    expect(result.current.pending).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('captures errors as messages instead of throwing', async () => {
    const { result } = renderHook(() => useAsyncAction(async (kind: string) => {
      if (kind === 'user') throw new UserFacingError('Title is required');
      throw new Error('internal detail');
    }, 'Could not save.'));
    await act(async () => { expect(await result.current.run('user')).toBeUndefined(); });
    expect(result.current.error).toBe('Title is required');
    await act(async () => { await result.current.run('internal'); });
    expect(result.current.error).toBe('Could not save.');
    act(() => result.current.clearError());
    expect(result.current.error).toBeNull();
  });
});

describe('ErrorNote', () => {
  it('renders an alert only with a message', () => {
    const { rerender } = render(<ErrorNote message={null} />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    rerender(<ErrorNote message="Could not save." />);
    expect(screen.getByRole('alert')).toHaveTextContent('Could not save.');
  });
});
