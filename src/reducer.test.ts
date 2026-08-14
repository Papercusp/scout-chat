import { describe, expect, it } from 'vitest';
import { applyChatEvent, isDisplayChatEvent, patchLastAssistant } from './reducer';
import type { ChatDisplayItem } from './types';

const user = (content: string): ChatDisplayItem => ({ kind: 'user', content });
const assistant = (over: Partial<Extract<ChatDisplayItem, { kind: 'assistant' }>> = {}): ChatDisplayItem => ({
  kind: 'assistant',
  content: '',
  products: [],
  broadenOptions: [],
  streaming: true,
  ...over,
});

describe('patchLastAssistant', () => {
  it('patches only the LAST assistant item', () => {
    const display = [assistant({ content: 'first' }), user('q'), assistant({ content: 'second' })];
    const next = patchLastAssistant(display, (a) => ({ ...a, content: a.content + '!' }));
    expect((next[0] as { content: string }).content).toBe('first');
    expect((next[2] as { content: string }).content).toBe('second!');
  });

  it('returns the same reference when no assistant exists', () => {
    const display = [user('hello')];
    expect(patchLastAssistant(display, (a) => ({ ...a, content: 'x' }))).toBe(display);
  });
});

describe('applyChatEvent', () => {
  it('appends token content and clears the status', () => {
    let display = [user('q'), assistant({ status: 'Searching…' })];
    display = applyChatEvent(display, { type: 'token', content: 'Hel' }).display;
    display = applyChatEvent(display, { type: 'token', content: 'lo' }).display;
    const a = display[1] as Extract<ChatDisplayItem, { kind: 'assistant' }>;
    expect(a.content).toBe('Hello');
    expect(a.status).toBeUndefined();
  });

  it('maps tool_start through the toolStatus table with a working-status fallback', () => {
    const display = [assistant()];
    const mapped = applyChatEvent(display, { type: 'tool_start', tool: 'search_products' }, {
      toolStatus: { search_products: 'Searching the catalog…' },
    }).display;
    expect((mapped[0] as { status?: string }).status).toBe('Searching the catalog…');
    const fallback = applyChatEvent(display, { type: 'tool_start', tool: 'unknown_tool' }, {
      workingStatus: 'Busy…',
    }).display;
    expect((fallback[0] as { status?: string }).status).toBe('Busy…');
  });

  it('replaces products and broaden options from their events', () => {
    let display = [assistant()];
    display = applyChatEvent(display, { type: 'products', products: [{ id: 'p1' }] }).display;
    display = applyChatEvent(display, {
      type: 'broaden',
      options: [{ label: 'Wider', prompt: 'wider', resultCount: 9 }],
    }).display;
    const a = display[0] as Extract<ChatDisplayItem, { kind: 'assistant' }>;
    expect(a.products).toEqual([{ id: 'p1' }]);
    expect(a.broadenOptions).toEqual([{ label: 'Wider', prompt: 'wider', resultCount: 9 }]);
    // A malformed payload degrades to empty, never throws.
    const bad = applyChatEvent(display, { type: 'products', products: 'nope' }).display;
    expect((bad[0] as { products: unknown[] }).products).toEqual([]);
  });

  it('opens and closes an interactive card', () => {
    const card = { correlationId: 'c1', prompt: 'Pick one' };
    let display = [assistant({ status: 'Working…' })];
    display = applyChatEvent(display, { type: 'card', card }).display;
    let a = display[0] as Extract<ChatDisplayItem, { kind: 'assistant' }>;
    expect(a.card).toEqual(card);
    expect(a.status).toBeUndefined();
    display = applyChatEvent(display, { type: 'card_closed' }).display;
    a = display[0] as Extract<ChatDisplayItem, { kind: 'assistant' }>;
    expect(a.card).toBeNull();
  });

  it('renders an error into empty content but never overwrites streamed content', () => {
    const empty = applyChatEvent([assistant()], { type: 'error', message: 'boom' }).display;
    expect((empty[0] as { content: string }).content).toBe('Sorry, something went wrong: boom');
    const streamed = applyChatEvent([assistant({ content: 'partial answer' })], {
      type: 'error',
      message: 'boom',
    }).display;
    expect((streamed[0] as { content: string }).content).toBe('partial answer');
  });

  it('supports a custom errorText renderer', () => {
    const out = applyChatEvent([assistant()], { type: 'error', message: 'x' }, {
      errorText: (m) => `Oops: ${m}`,
    }).display;
    expect((out[0] as { content: string }).content).toBe('Oops: x');
  });

  it('extracts the sessionId without touching the display', () => {
    const display = [assistant()];
    const out = applyChatEvent(display, { type: 'session', sessionId: 's-42' });
    expect(out.sessionId).toBe('s-42');
    expect(out.display).toBe(display);
    // Non-string sessionId is ignored.
    expect(applyChatEvent(display, { type: 'session', sessionId: 7 }).sessionId).toBeUndefined();
  });

  it('marks done as terminal and passes unknown events through as unhandled', () => {
    const display = [assistant()];
    expect(applyChatEvent(display, { type: 'done' }).terminal).toBe(true);
    const evt = { type: 'navigate', href: '/p/x' };
    const out = applyChatEvent(display, evt);
    expect(out.unhandled).toBe(evt);
    expect(out.display).toBe(display);
  });
});

describe('isDisplayChatEvent', () => {
  it('classifies display vs app events', () => {
    expect(isDisplayChatEvent({ type: 'token' })).toBe(true);
    expect(isDisplayChatEvent({ type: 'session' })).toBe(true);
    for (const t of ['navigate', 'highlight', 'cart_mutate', 'open_drawer', 'prefill_form']) {
      expect(isDisplayChatEvent({ type: t })).toBe(false);
    }
  });
});
