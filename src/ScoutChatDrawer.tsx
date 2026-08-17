'use client';

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Drawer as VaulDrawer } from 'vaul';
import { useDrawerStackItem } from '@papercusp/drawer-stack';

export interface ScoutChatDrawerProps {
  /** Drawer-stack registration id. Default "scout". */
  id?: string;
  /** Drawer-stack priority (higher docks closer to the edge). Default 10. */
  priority?: number;
  /** Pane width (any CSS length / var). Default `var(--sc-drawer-width, min(28rem, calc(100vw - 1rem)))`. */
  width?: string;
  /** Window event that opens the drawer (e.g. "scout:open"). `null` disables. Default "scout:open". */
  openEvent?: string | null;
  /** Click-target data attribute that opens the drawer. `null` disables. Default "data-scout-open". */
  openDataAttr?: string | null;
  /** Launcher (FAB) content, rendered into the shared right-edge trigger stack. */
  launcher: ReactNode;
  /** Launcher button class. Default "sc-fab". */
  launcherClassName?: string;
  launcherAriaLabel: string;
  /** Accessible title/description of the drawer pane. */
  title: string;
  description?: string;
  /** Pane content class. Default "sc-drawer-content". */
  contentClassName?: string;
  contentStyle?: CSSProperties;
  /** The chat surface; receives close() and whether a companion drawer is open. */
  children: (ctx: { open: boolean; close: () => void; otherOpen: boolean }) => ReactNode;
}

/**
 * The drawer chrome extracted from Restart's ScoutDrawer: a Vaul right-edge
 * pane registered with @papercusp/drawer-stack (placement, the shared
 * backdrop, multi-pane coexist — the chat docks LEFT of any open cart —
 * Escape, and body scroll-lock are all owned by the stack). Runs non-modal so
 * the other drawers' triggers stay clickable to open alongside.
 */
export function ScoutChatDrawer({
  id = 'scout',
  priority = 10,
  width = 'var(--sc-drawer-width, min(28rem, calc(100vw - 1rem)))',
  openEvent = 'scout:open',
  openDataAttr = 'data-scout-open',
  launcher,
  launcherClassName = 'sc-fab',
  launcherAriaLabel,
  title,
  description,
  contentClassName = 'sc-drawer-content',
  contentStyle,
  children,
}: ScoutChatDrawerProps) {
  const [open, setOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const { Trigger, paneStyle, otherOpen } = useDrawerStackItem({
    id,
    priority,
    open,
    onOpenChange: setOpen,
    width,
  });

  // External open triggers: the window event and any [data-*] click target.
  useEffect(() => {
    const handleOpen = () => setOpen(true);
    const handleDocumentClick = (event: MouseEvent) => {
      if (!openDataAttr) return;
      const target = (event.target as Element | null)?.closest<HTMLElement>(`[${openDataAttr}]`);
      if (!target) return;
      event.preventDefault();
      setOpen(true);
    };
    if (openEvent) window.addEventListener(openEvent, handleOpen);
    if (openDataAttr) document.addEventListener('click', handleDocumentClick);
    return () => {
      if (openEvent) window.removeEventListener(openEvent, handleOpen);
      if (openDataAttr) document.removeEventListener('click', handleDocumentClick);
    };
  }, [openEvent, openDataAttr]);

  // Initial focus placement. A MODAL dialog gets this for free — the focus
  // scope moves focus inside on open — but this pane runs `modal={false}` on
  // purpose (see the note above: the other drawers' triggers must stay
  // clickable so panes can coexist), and that opt-out takes the automatic
  // focus move with it. Without this, opening the pane leaves activeElement on
  // the background launcher: the pane is visible, but a keyboard or
  // screen-reader user is still outside it and has to Tab in to reach it.
  //
  // So place focus explicitly rather than by making the pane modal, and return
  // it to wherever it came from on close (Escape already restored correctly
  // only because focus had never actually left the launcher).
  useEffect(() => {
    if (!open) return undefined;
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    // Vaul mounts and animates the pane; wait a frame so the content exists.
    const frame = requestAnimationFrame(() => {
      const pane = contentRef.current;
      if (!pane) return;
      const focusable = pane.querySelector<HTMLElement>(
        'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
      );
      // Fall back to the pane itself (tabIndex={-1}) when it has no focusable
      // control, so the user still lands inside the dialog rather than outside.
      (focusable ?? pane).focus();
    });
    return () => {
      cancelAnimationFrame(frame);
      const restore = returnFocusRef.current;
      returnFocusRef.current = null;
      // Only pull focus back if it is still inside the pane we are closing —
      // otherwise the user has already moved on and we would be stealing it.
      if (restore?.isConnected && contentRef.current?.contains(document.activeElement)) {
        restore.focus();
      }
    };
  }, [open]);

  return (
    <VaulDrawer.Root direction="right" open={open} onOpenChange={setOpen} modal={false}>
      {/* Launcher — rendered into the shared right-edge trigger stack. */}
      <Trigger>
        <VaulDrawer.Trigger
          type="button"
          aria-label={launcherAriaLabel}
          className={[launcherClassName, open ? 'sc-fab--open' : ''].join(' ')}
        >
          {launcher}
        </VaulDrawer.Trigger>
      </Trigger>

      <VaulDrawer.Portal>
        <VaulDrawer.Content
          ref={contentRef}
          tabIndex={-1}
          aria-label={title}
          className={contentClassName}
          style={{ ...paneStyle, ...contentStyle }}
        >
          <VaulDrawer.Title className="sc-sr-only">{title}</VaulDrawer.Title>
          {description ? (
            <VaulDrawer.Description className="sc-sr-only">{description}</VaulDrawer.Description>
          ) : null}
          {children({ open, close: () => setOpen(false), otherOpen })}
        </VaulDrawer.Content>
      </VaulDrawer.Portal>
    </VaulDrawer.Root>
  );
}
