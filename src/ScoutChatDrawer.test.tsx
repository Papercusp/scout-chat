// @vitest-environment jsdom
/**
 * Initial focus placement for the Scout pane (EI-20491738390267858).
 *
 * The pane runs `modal={false}` on purpose so sibling drawers stay clickable,
 * and that opt-out also disables the focus move a modal dialog performs for
 * free. Opening it therefore used to leave `document.activeElement` on the
 * background launcher: the pane was visible, but a keyboard or screen-reader
 * user was still outside it.
 *
 * These assert BEHAVIOUR (where focus actually lands), not the presence of a
 * particular implementation, so they still fail if the effect is removed.
 */
import type { ReactNode } from 'react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ScoutChatDrawer } from './ScoutChatDrawer';

beforeAll(() => {
  // vaul measures the pane; jsdom ships neither observer.
  if (!globalThis.ResizeObserver) {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  }
});

afterEach(cleanup);

const LAUNCHER_LABEL = 'Open Scout shopping assistant';

const renderDrawer = (body?: ReactNode) =>
  render(
    <ScoutChatDrawer
      launcherAriaLabel={LAUNCHER_LABEL}
      title="Scout shopping assistant"
      launcher={<span>Ask Scout</span>}
    >
      {() => body ?? <textarea aria-label="Ask a question" />}
    </ScoutChatDrawer>,
  );

describe('ScoutChatDrawer initial focus', () => {
  it('moves focus off the background launcher and into the pane on open', async () => {
    const user = userEvent.setup();
    renderDrawer();

    const launcher = screen.getByRole('button', { name: LAUNCHER_LABEL });
    await user.click(launcher);

    const field = await screen.findByLabelText('Ask a question');
    await waitFor(() => expect(document.activeElement).toBe(field));
    // The regression this guards: activeElement stranded on the trigger.
    expect(document.activeElement).not.toBe(launcher);
  });

  it('falls back to the pane itself when it holds no focusable control', async () => {
    const user = userEvent.setup();
    renderDrawer(<p>Scout is warming up…</p>);

    const launcher = screen.getByRole('button', { name: LAUNCHER_LABEL });
    await user.click(launcher);

    await screen.findByText('Scout is warming up…');
    // Focus must still land inside the dialog, never back on the trigger.
    await waitFor(() => {
      expect(document.activeElement).not.toBe(launcher);
      expect(document.activeElement).not.toBe(document.body);
    });
  });
});
