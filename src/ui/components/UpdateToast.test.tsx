// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { UpdateToast } from './UpdateToast';

describe('UpdateToast', () => {
  it('renders nothing when there is no news', () => {
    const { container } = render(<UpdateToast needRefresh={false} offlineReady={false} onReload={vi.fn()} onClose={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('offers a reload when a new version is waiting', async () => {
    const onReload = vi.fn();
    const onClose = vi.fn();
    render(<UpdateToast needRefresh offlineReady={false} onReload={onReload} onClose={onClose} />);
    expect(screen.getByRole('status')).toHaveTextContent('A new version of CartCraft is available.');
    await userEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(onReload).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole('button', { name: 'Later' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('says when the app is ready to work offline', async () => {
    const onClose = vi.fn();
    render(<UpdateToast needRefresh={false} offlineReady onReload={vi.fn()} onClose={onClose} />);
    expect(screen.getByRole('status')).toHaveTextContent('CartCraft now works offline.');
    expect(screen.queryByRole('button', { name: 'Reload' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
