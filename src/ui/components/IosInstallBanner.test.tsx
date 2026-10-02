// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { DISMISSED_KEY, IosInstallBanner } from './IosInstallBanner';

afterEach(() => localStorage.clear());

describe('IosInstallBanner', () => {
  it('explains separate storage and how to install in iOS Safari', () => {
    render(<IosInstallBanner standalone={false} />);
    expect(screen.getByRole('note')).toHaveTextContent(
      'On iPhone and iPad, Safari and the Home Screen app keep separate data. Install CartCraft first: tap Share, then Add to Home Screen, and add your recipes in the installed app.',
    );
  });

  it('stays hidden in the installed app and in browsers without navigator.standalone', () => {
    const { container, rerender } = render(<IosInstallBanner standalone />);
    expect(container).toBeEmptyDOMElement();
    rerender(<IosInstallBanner standalone={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('remembers when it was dismissed', async () => {
    const { container, unmount } = render(<IosInstallBanner standalone={false} />);
    await userEvent.click(screen.getByRole('button', { name: 'Got it' }));
    expect(container).toBeEmptyDOMElement();
    expect(localStorage.getItem(DISMISSED_KEY)).toBe('1');
    unmount();
    const again = render(<IosInstallBanner standalone={false} />);
    expect(again.container).toBeEmptyDOMElement();
  });
});
