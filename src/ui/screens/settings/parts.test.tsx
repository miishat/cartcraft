// @vitest-environment jsdom
import { render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useStorageUsage } from '../../hooks';
import { ChoiceList } from './ChoiceList';
import { SettingsPage } from './SettingsPage';
import { SettingsRow } from './SettingsRow';

afterEach(() => {
  Reflect.deleteProperty(navigator, 'storage');
});

describe('SettingsPage', () => {
  it('has a back link, a title and a hint', () => {
    render(<MemoryRouter><SettingsPage title="Units" hint="Pick one.">body</SettingsPage></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'Back to Settings' })).toHaveAttribute('href', '/settings');
    expect(screen.getByRole('heading', { level: 1, name: 'Units' })).toBeInTheDocument();
    expect(screen.getByText('Pick one.')).toBeInTheDocument();
    expect(screen.getByText('body')).toBeInTheDocument();
  });
});

describe('SettingsRow', () => {
  it('links to its page and shows the summary and value', () => {
    render(
      <MemoryRouter>
        <ul><SettingsRow to="/settings/units" emoji="⚖️" tint="blue" title="Units" summary="How amounts show" value="US" /></ul>
      </MemoryRouter>,
    );
    const link = screen.getByRole('link', { name: /^Units/ });
    expect(link).toHaveAttribute('href', '/settings/units');
    expect(link).toHaveTextContent('How amounts show');
    expect(link).toHaveTextContent('US');
  });
});

describe('ChoiceList', () => {
  it('ticks the chosen row and reports a new choice', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ChoiceList
        name="units"
        legend="Unit system"
        choices={[{ value: 'us', label: 'US', hint: 'cups, oz, lb' }, { value: 'metric', label: 'Metric', hint: 'ml, g, kg' }]}
        value="us"
        onChange={onChange}
      />,
    );
    expect(screen.getByRole('group', { name: 'Unit system' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /^US/ })).toBeChecked();
    await user.click(screen.getByRole('radio', { name: /^Metric/ }));
    expect(onChange).toHaveBeenCalledWith('metric');
  });
});

describe('useStorageUsage', () => {
  it('formats what the browser reports in megabytes', async () => {
    Object.defineProperty(navigator, 'storage', { value: { estimate: async () => ({ usage: 2.1 * 1024 * 1024 }) }, configurable: true });
    const { result } = renderHook(() => useStorageUsage());
    await waitFor(() => expect(result.current).toBe('2.1 MB'));
  });

  it('stays null when the browser cannot tell', () => {
    const { result } = renderHook(() => useStorageUsage());
    expect(result.current).toBeNull();
  });
});
