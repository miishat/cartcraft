// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Menu, MenuCheckbox, MenuItem } from './Menu';

function Harness({ onRename = () => undefined }: { onRename?: () => void }) {
  const [on, setOn] = useState(false);
  return (
    <>
      <Menu label="List options">
        <MenuItem icon="✏️" onSelect={onRename}>Rename list</MenuItem>
        <MenuItem icon="📋" onSelect={() => undefined}>Copy list as text</MenuItem>
        <MenuCheckbox icon="☀️" checked={on} onChange={setOn}>Keep screen on</MenuCheckbox>
      </Menu>
      <p>Outside</p>
    </>
  );
}

describe('Menu', () => {
  it('opens on click and focuses the first item', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const button = screen.getByRole('button', { name: 'List options' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    await user.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('menu', { name: 'List options' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Rename list' })).toHaveFocus();
  });

  it('runs an item and closes', async () => {
    const user = userEvent.setup();
    const onRename = vi.fn();
    render(<Harness onRename={onRename} />);
    await user.click(screen.getByRole('button', { name: 'List options' }));
    await user.click(screen.getByRole('menuitem', { name: 'Rename list' }));
    expect(onRename).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('toggles a checkbox item and stays open', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'List options' }));
    const toggle = screen.getByRole('menuitemcheckbox', { name: 'Keep screen on' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    await user.click(toggle);
    expect(screen.getByRole('menuitemcheckbox', { name: 'Keep screen on' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('moves focus with the arrow keys and wraps', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'List options' }));
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Copy list as text' })).toHaveFocus();
    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Rename list' })).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(screen.getByRole('menuitemcheckbox', { name: 'Keep screen on' })).toHaveFocus();
  });

  it('closes on Escape and returns focus to the button', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const button = screen.getByRole('button', { name: 'List options' });
    await user.click(button);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(button).toHaveFocus();
  });

  it('closes on a click outside', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'List options' }));
    await user.click(screen.getByText('Outside'));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('closes when the button is clicked again', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const button = screen.getByRole('button', { name: 'List options' });
    await user.click(button);
    await user.click(button);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});
