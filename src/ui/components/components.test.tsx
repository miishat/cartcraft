// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { IngredientLine } from '../../domain';
import { draftLinesFromText } from '../../app/recipes';
import { sequentialIds } from '../../test/db';
import { ReviewTable } from './ReviewTable';
import { ServingsStepper } from './ServingsStepper';

describe('ServingsStepper', () => {
  it('steps within bounds', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ServingsStepper value={1} onChange={onChange} label="Tacos" />);
    expect(screen.getByRole('button', { name: 'Fewer servings for Tacos' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'More servings for Tacos' }));
    expect(onChange).toHaveBeenCalledWith(2);
  });
});

function Harness({ initial }: { initial: IngredientLine[] }) {
  const [lines, setLines] = useState(initial);
  return <ReviewTable lines={lines} onChange={setLines} unitSystem="us" makeId={sequentialIds('new')} />;
}

describe('ReviewTable', () => {
  const initial = () => draftLinesFromText('2 cups flour\nsalt and pepper to taste', sequentialIds('line'));

  it('shows the parsed result and highlights lines that need review', () => {
    render(<Harness initial={initial()} />);
    const parsed = screen.getAllByTestId('parsed');
    expect(parsed[0]).toHaveTextContent('2 cups · flour');
    expect(parsed[1]).toHaveTextContent('no amount · salt and pepper (to taste)');
    expect(screen.getAllByLabelText('Check this line')).toHaveLength(1);
  });

  it('shows "no amount" for a zero amount instead of a stray separator', () => {
    render(<Harness initial={draftLinesFromText('0 cups sugar', sequentialIds('line'))} />);
    const text = screen.getByTestId('parsed').textContent ?? '';
    expect(text.trim().startsWith('·')).toBe(false);
    expect(text).toContain('no amount · sugar');
  });

  it('re-parses a line when it is edited', async () => {
    const user = userEvent.setup();
    render(<Harness initial={initial()} />);
    const input = screen.getByLabelText('Ingredient line 1');
    await user.clear(input);
    await user.type(input, '3 tbsp sugar');
    await user.tab();
    expect(screen.getAllByTestId('parsed')[0]).toHaveTextContent('3 tbsp · sugar');
  });

  it('removes and adds lines', async () => {
    const user = userEvent.setup();
    render(<Harness initial={initial()} />);
    await user.click(screen.getByLabelText('Remove line 2'));
    expect(screen.getAllByTestId('parsed')).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: /add line/i }));
    expect(screen.getAllByTestId('parsed')).toHaveLength(2);
  });
});
