import type { OpenCardSnapshot } from '@papercusp/chat-protocol';
import type { AssistantDisplayItem, BroadenOption, ChatDisplayItem } from './types';

// The pure heart of the chat surface: fold one decoded stream event into the
// display list. Extracted from Restart RecommenderChat's inline handleEvent so
// the patch-last-assistant semantics are unit-testable and shared.

/** Patch the LAST assistant item in the display list (no-op when none exists). */
export function patchLastAssistant(
  display: ChatDisplayItem[],
  patch: (item: AssistantDisplayItem) => AssistantDisplayItem,
): ChatDisplayItem[] {
  const next = [...display];
  for (let i = next.length - 1; i >= 0; i -= 1) {
    const item = next[i];
    if (item.kind === 'assistant') {
      next[i] = patch(item);
      return next;
    }
  }
  return display;
}

/**
 * Event types the reducer folds into display state. Everything else is an
 * APP event (navigate / highlight / cart_mutate / open_drawer / prefill_form,
 * …) — side effects the consuming app performs via its `onAppEvent` handler.
 * `session` is display-inert but handled by the component (session identity +
 * persistence), so it counts as handled here.
 */
export const DISPLAY_CHAT_EVENT_TYPES = new Set([
  'session',
  'tool_start',
  'token',
  'products',
  'broaden',
  'card',
  'card_closed',
  'error',
  'done',
]);

export function isDisplayChatEvent(evt: Record<string, unknown>): boolean {
  return DISPLAY_CHAT_EVENT_TYPES.has(String(evt.type));
}

export interface ApplyChatEventOptions {
  /** Tool name → transient status line (e.g. search_products → "Searching…"). */
  toolStatus?: Record<string, string>;
  /** Status shown for a tool with no mapping. Default "Working…". */
  workingStatus?: string;
  /** Render an error event's user-facing text. Default "Sorry, something went wrong: <message>". */
  errorText?: (message: string) => string;
}

export interface ChatEventOutcome {
  /** The next display list (the same reference when nothing changed). */
  display: ChatDisplayItem[];
  /** Present on a `session` event carrying a string sessionId. */
  sessionId?: string;
  /** True on the terminal `done` event. */
  terminal?: boolean;
  /** Present when the event is not a display event — hand it to the app layer. */
  unhandled?: Record<string, unknown>;
}

/** Fold one decoded stream event into the display list. Pure. */
export function applyChatEvent(
  display: ChatDisplayItem[],
  evt: Record<string, unknown>,
  opts: ApplyChatEventOptions = {},
): ChatEventOutcome {
  switch (evt.type) {
    case 'session':
      return typeof evt.sessionId === 'string'
        ? { display, sessionId: evt.sessionId }
        : { display };
    case 'tool_start': {
      const status = opts.toolStatus?.[String(evt.tool)] ?? opts.workingStatus ?? 'Working…';
      return { display: patchLastAssistant(display, (a) => ({ ...a, status })) };
    }
    case 'token':
      return {
        display: patchLastAssistant(display, (a) => ({
          ...a,
          content: a.content + String(evt.content ?? ''),
          status: undefined,
        })),
      };
    case 'products':
      return {
        display: patchLastAssistant(display, (a) => ({
          ...a,
          products: Array.isArray(evt.products) ? (evt.products as unknown[]) : [],
        })),
      };
    case 'broaden':
      return {
        display: patchLastAssistant(display, (a) => ({
          ...a,
          broadenOptions: Array.isArray(evt.options) ? (evt.options as BroadenOption[]) : [],
        })),
      };
    case 'card':
      return {
        display: patchLastAssistant(display, (a) => ({
          ...a,
          card: (evt.card as OpenCardSnapshot | undefined) ?? null,
          status: undefined,
        })),
      };
    case 'card_closed':
      return { display: patchLastAssistant(display, (a) => ({ ...a, card: null })) };
    case 'error': {
      const render = opts.errorText ?? ((m: string) => `Sorry, something went wrong: ${m}`);
      return {
        display: patchLastAssistant(display, (a) => ({
          ...a,
          content: a.content || render(String(evt.message ?? '')),
          status: undefined,
        })),
      };
    }
    case 'done':
      return { display, terminal: true };
    default:
      return { display, unhandled: evt };
  }
}
