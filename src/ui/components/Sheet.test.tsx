// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Sheet } from './Sheet';

// jsdom has no PointerEvent, so clientY would be dropped; a MouseEvent subclass carries it.
class TestPointerEvent extends MouseEvent {}

describe('Sheet', () => {
  beforeAll(() => {
    vi.stubGlobal('PointerEvent', TestPointerEvent);
  });
  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it('is a labelled modal dialog', () => {
    render(<Sheet title="List options" onClose={() => undefined}><button type="button">Rename</button></Sheet>);
    expect(screen.getByRole('dialog', { name: 'List options' })).toHaveAttribute('aria-modal', 'true');
  });

  it('closes on Escape and on the backdrop, not on a click inside', () => {
    const onClose = vi.fn();
    render(<Sheet title="T" onClose={onClose}><button type="button">Inside</button></Sheet>);
    fireEvent.click(screen.getByRole('button', { name: 'Inside' }));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(screen.getByTestId('sheet-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('closes when the handle is dragged down far enough', () => {
    const onClose = vi.fn();
    render(<Sheet title="T" onClose={onClose}>x</Sheet>);
    const handle = screen.getByTestId('sheet-handle');
    fireEvent.pointerDown(handle, { clientY: 100 });
    fireEvent.pointerUp(handle, { clientY: 130 });
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.pointerDown(handle, { clientY: 100 });
    fireEvent.pointerUp(handle, { clientY: 220 });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('keeps focus and uses the latest onClose when the parent re-renders', () => {
    const first = vi.fn();
    const second = vi.fn();
    const ui = (onClose: () => void) => (
      <Sheet title="T" onClose={onClose}>
        <button type="button">First</button>
        <input aria-label="Name" />
      </Sheet>
    );
    const { rerender } = render(ui(first));
    const input = screen.getByLabelText('Name');
    input.focus();
    rerender(ui(second));
    expect(input).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
  });
});
