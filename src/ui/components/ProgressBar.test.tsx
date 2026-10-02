// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProgressBar } from './ProgressBar';

describe('ProgressBar', () => {
  it('shows how many items are in the cart', () => {
    render(<ProgressBar done={1} total={4} />);
    const bar = screen.getByRole('progressbar', { name: 'Shopping progress' });
    expect(bar).toHaveAttribute('aria-valuenow', '1');
    expect(bar).toHaveAttribute('aria-valuemax', '4');
    expect((bar.firstElementChild as HTMLElement).style.width).toBe('25%');
    expect(screen.getByText('1 of 4 in cart')).toBeInTheDocument();
  });

  it('is empty, not broken, for a list with no items', () => {
    render(<ProgressBar done={0} total={0} />);
    expect((screen.getByRole('progressbar').firstElementChild as HTMLElement).style.width).toBe('0%');
  });
});
