// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ListItem } from '../../domain';
import type { Aisle } from '../../data/types';
import { mockViewport } from '../../test/matchMedia';
import { ListItemRow } from './ListItemRow';

const item: ListItem = {
  id: 'i1', itemKey: 'eggs', name: 'eggs', amounts: [], aisleId: 'dairy', group: 'aisle',
  checked: false, origin: 'adhoc', fromRecipes: [], notes: '',
};
const aisles: Aisle[] = [
  { id: 'dairy', name: 'Dairy', order: 0 },
  { id: 'frozen', name: 'Frozen', order: 1 },
];

function setup() {
  const props = { onToggle: vi.fn(), onEdit: vi.fn(), onDelete: vi.fn(), onMove: vi.fn() };
  render(<ul><ListItemRow item={item} aisles={aisles} unitSystem="us" {...props} /></ul>);
  return { props, user: userEvent.setup() };
}

describe('ListItemRow options', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('opens as a bottom sheet on a phone and closes on save', async () => {
    mockViewport(true);
    const { props, user } = setup();
    await user.click(screen.getByRole('button', { name: 'Options for eggs' }));
    const sheet = screen.getByRole('dialog', { name: 'Eggs' });
    const input = within(sheet).getByLabelText('Edit eggs');
    expect(within(sheet).getByLabelText('Aisle for eggs')).toBeInTheDocument();
    expect(within(sheet).getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    await user.clear(input);
    await user.type(input, '12 eggs');
    await user.click(within(sheet).getByRole('button', { name: 'Save' }));
    expect(props.onEdit).toHaveBeenCalledWith('12 eggs');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes the phone sheet when Delete is pressed', async () => {
    mockViewport(true);
    const { props, user } = setup();
    await user.click(screen.getByRole('button', { name: 'Options for eggs' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(props.onDelete).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('stays inline on a wide screen', async () => {
    mockViewport(false);
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: 'Options for eggs' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByLabelText('Edit eggs')).toBeInTheDocument();
  });
});
