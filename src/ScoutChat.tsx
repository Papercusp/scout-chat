import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useVersionedResource } from '@papercusp/data-fetch';
import type {
  AssistantDisplayItem,
  ChatConversationCache,
  ChatDisplayItem,
  ChatTransport,
} from './types';
import { applyChatEvent, isDisplayChatEvent, patchLastAssistant } from './reducer';
import { AssistantBubble, ThinkingBubble, UserBubble } from './bubbles';
import type { CardAnswer, ChatCardStrings } from './ChatCard';
import { IconArrowUp, IconChevronLeft, IconRotateCcw, IconX } from './icons';

export interface ScoutChatStrings {
  /** Small uppercase kicker above the title (e.g. "Ask Scout"). */
  kicker: string;
  title: string;
  tagline: string;
  inputPlaceholder: string;
  thinking: string;
  /** Label of the reset button. */
  newConversation: string;
  newConversationAria: string;
  closeAria: string;
  /** Close aria label when a companion drawer (e.g. the cart) is open beside us. */
  closeWithCompanionAria: string;
  sendAria: string;
  /** Shown when a finished turn produced no content at all. */
  emptyFallback: string;
  /** Prefix for a failed turn; the error message is appended. */
  errorPrefix: string;
  workingStatus: string;
  /**
   * Shown verbatim when a turn fails (transport error, HTTP status, or the
   * transport's idle deadline) INSTEAD of `errorPrefix` + the raw error.
   * Optional: omitted → the historic `errorPrefix` behaviour. Set it on
   * user-facing surfaces so a failure reads as a next step rather than
   * "HTTP 400" (WI-39716).
   */
  turnFailedFallback?: string;
}

const DEFAULT_STRINGS: ScoutChatStrings = {
  kicker: 'Ask Scout',
  title: 'Assistant',
  tagline: 'Describe what you need and Scout will help.',
  inputPlaceholder: 'Describe what you need…',
  thinking: 'Scout is thinking',
  newConversation: 'New',
  newConversationAria: 'Start a new conversation',
  closeAria: 'Close Scout',
  closeWithCompanionAria: 'Close Scout and show the other drawer',
  sendAria: 'Send message',
  emptyFallback: "Sorry, I couldn't put together a response just now. Please try again.",
  errorPrefix: 'Sorry, something went wrong: ',
  workingStatus: 'Working…',
};

export interface ScoutChatProps {
  /** ALL endpoints + session identity live behind this seam. */
  transport: ChatTransport;
  /**
   * Conversation state that outlives the drawer unmount — create ONE with
   * `createChatConversationCache()` at module scope in the consuming app.
   * Omitted → a per-mount cache (state lost on drawer close).
   */
  cache?: ChatConversationCache;
  variant?: 'page' | 'drawer';
  onClose?: () => void;
  /** True when a companion drawer (e.g. the cart) is open beside this one. */
  companionOpen?: boolean;
  /** Compute the app's page-awareness payload, fresh per send. */
  getPageContext?: () => unknown;
  /** Tool name → transient status line, shown before the first token. */
  toolStatus?: Record<string, string>;
  /** sessionStorage key persisting the session id across reloads. Default "scout-session-id". */
  sessionStorageKey?: string;
  strings?: Partial<ScoutChatStrings>;
  cardStrings?: Partial<ChatCardStrings>;
  /** Assistant avatar / header icon content (e.g. the app's sparkle icon). */
  icon?: ReactNode;
  /** Chips row under the tagline (e.g. Online / Quote drafting / Catalog aware). */
  headerBadges?: ReactNode;
  /** Empty-conversation content (suggested starters, trust badges, …). */
  emptyState?: (send: (prompt: string) => void) => ReactNode;
  /** App-supplied product-card grid for `products` events. */
  renderProducts?: (products: unknown[]) => ReactNode;
  /**
   * Receives every non-display stream event (navigate / highlight /
   * cart_mutate / open_drawer / prefill_form, …) — the app performs the side
   * effect. See `prefillForm` for a safe generic form-fill helper.
   */
  onAppEvent?: (evt: Record<string, unknown>) => void;
}

/**
 * The chat surface extracted from Restart's RecommenderChat: streaming
 * transcript + composer over a ChatTransport, interactive chat-protocol cards,
 * durable-transcript restore (ETag/304) and a conversation cache surviving
 * drawer unmounts. Visual identity flows through --sc-* custom properties.
 */
export function ScoutChat({
  transport,
  cache,
  variant = 'page',
  onClose,
  companionOpen = false,
  getPageContext,
  toolStatus,
  sessionStorageKey = 'scout-session-id',
  strings: stringOverrides,
  cardStrings,
  icon,
  headerBadges,
  emptyState,
  renderProducts,
  onAppEvent,
}: ScoutChatProps) {
  const strings = useMemo(() => ({ ...DEFAULT_STRINGS, ...stringOverrides }), [stringOverrides]);
  // Fall back to a per-mount cache so the component works standalone.
  const fallbackCacheRef = useRef<ChatConversationCache>({ display: [], sessionId: null });
  const convoCache = cache ?? fallbackCacheRef.current;

  // Initialise from the cache so the conversation survives the drawer
  // unmounting on close. Empty on a fresh page load → transcript restore.
  const [display, setDisplay] = useState<ChatDisplayItem[]>(() => convoCache.display);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const sessionIdRef = useRef<string | null>(convoCache.sessionId);
  const isDrawer = variant === 'drawer';

  // ── Restore the prior conversation on reload ───────────────────────────────
  // The sessionId is persisted to sessionStorage (on the stream's `session`
  // event); on mount we load that session's transcript via the shared
  // versioned read-cache (instant from IndexedDB, then a 304-cheap revalidate)
  // and seed the message list, resuming the same conversation. "New
  // conversation" clears it. Only the durable transcript is restored — the
  // live token stream stays volatile.
  const [restoredSessionId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      return window.sessionStorage.getItem(sessionStorageKey);
    } catch {
      return null;
    }
  });
  const transcriptFetcher = useMemo(
    () => transport.transcriptFetcher(restoredSessionId ?? ''),
    [transport, restoredSessionId],
  );
  const { data: transcript } = useVersionedResource(
    `scout-transcript:${restoredSessionId ?? 'none'}`,
    transcriptFetcher,
    { enabled: !!restoredSessionId },
  );
  // Mirror the live conversation into the cache so it survives the drawer
  // unmounting on close. On reopen, `display`/`sessionId` re-initialise from
  // the cache above — no server round-trip, no stale-snapshot flash.
  useEffect(() => {
    convoCache.display = display;
  }, [convoCache, display]);

  // Restore the durable transcript from the server. Two refs make this correct:
  //  • hasLocalStateRef — true when we already hold authoritative local state
  //    (restored from the cache on mount, or the user has sent a message).
  //    While false (a fresh page load, empty), we keep re-seeding from the
  //    FRESHEST transcript version received (a latch on the first, often
  //    IndexedDB-stale snapshot would ignore the revalidated data).
  //  • seededVersionRef — the transcript version last applied; a newer version
  //    (from the background revalidate) re-seeds, an identical one is a no-op.
  const hasLocalStateRef = useRef(convoCache.display.length > 0);
  const seededVersionRef = useRef<string | null>(null);
  useEffect(() => {
    if (!restoredSessionId || hasLocalStateRef.current) return;
    if (!transcript || !Array.isArray(transcript.messages)) return; // still loading
    if (seededVersionRef.current === transcript.version) return; // nothing newer
    seededVersionRef.current = transcript.version;
    if (transcript.messages.length === 0) return;
    sessionIdRef.current = restoredSessionId; // resume the same session
    convoCache.sessionId = restoredSessionId;
    setDisplay(
      transcript.messages.map((m): ChatDisplayItem =>
        m.role === 'user'
          ? { kind: 'user', content: m.content }
          : { kind: 'assistant', content: m.content, products: [], broadenOptions: [], streaming: false },
      ),
    );
  }, [transcript, restoredSessionId, convoCache]);

  // Scroll to bottom whenever display updates
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [display]);

  /** Patch the last assistant item in the display list. */
  const patchAssistant = useCallback(
    (patch: (item: AssistantDisplayItem) => AssistantDisplayItem) => {
      setDisplay((prev) => patchLastAssistant(prev, patch));
    },
    [],
  );

  // Answer an interactive card: optimistically clear it, then POST the answer.
  // The paused turn resumes when the server resolves the card.
  const answerCard = useCallback<CardAnswer>(
    (correlationId, action, value) => {
      patchAssistant((a) => ({ ...a, card: null }));
      void transport
        .answerCard(correlationId, action, value)
        .catch(() => { /* the turn will time out server-side if this never lands */ });
    },
    [transport, patchAssistant],
  );

  const send = useCallback(
    async (nextMessage?: string) => {
      const text = (nextMessage ?? draft).trim();
      if (!text || loading) return;

      // We now hold authoritative local state — stop the transcript restore
      // from ever overwriting the live conversation with the server's copy.
      hasLocalStateRef.current = true;
      setDraft('');
      setLoading(true);
      // Page awareness: compute the current page each turn so the assistant
      // knows what the user is viewing (fresh on every send → tracks navigation).
      const pageContext = getPageContext?.() ?? undefined;
      setDisplay((prev) => [
        ...prev,
        { kind: 'user', content: text },
        { kind: 'assistant', content: '', products: [], broadenOptions: [], streaming: true },
      ]);

      const reducerOpts = {
        toolStatus,
        workingStatus: strings.workingStatus,
        errorText: (m: string) => `${strings.errorPrefix}${m}`,
      };
      const handleEvent = (evt: Record<string, unknown>) => {
        if (evt.type === 'session') {
          if (typeof evt.sessionId === 'string') {
            sessionIdRef.current = evt.sessionId;
            convoCache.sessionId = evt.sessionId;
            // Persist so a reload restores this conversation's transcript.
            try {
              window.sessionStorage.setItem(sessionStorageKey, evt.sessionId);
            } catch { /* private mode */ }
          }
          return;
        }
        if (!isDisplayChatEvent(evt)) {
          onAppEvent?.(evt);
          return;
        }
        setDisplay((prev) => applyChatEvent(prev, evt, reducerOpts).display);
      };

      try {
        for await (const data of transport.streamTurn({
          message: text,
          sessionId: sessionIdRef.current,
          pageContext,
        })) {
          handleEvent(data);
        }

        patchAssistant((a) => ({
          ...a,
          streaming: false,
          status: undefined,
          content: a.content || strings.emptyFallback,
        }));
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        patchAssistant((a) => ({
          ...a,
          streaming: false,
          status: undefined,
          content: strings.turnFailedFallback ?? `${strings.errorPrefix}${message}`,
        }));
      } finally {
        setLoading(false);
        setTimeout(() => inputRef.current?.focus(), 50);
      }
    },
    [draft, loading, getPageContext, toolStatus, strings, transport, convoCache, sessionStorageKey, onAppEvent, patchAssistant],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  const resetConversation = () => {
    setDisplay([]);
    sessionIdRef.current = null;
    // Reset the persistent cache + restore guards so the cleared conversation
    // can't be repopulated from the cache or the server.
    convoCache.display = [];
    convoCache.sessionId = null;
    hasLocalStateRef.current = true; // intentionally empty — don't restore
    seededVersionRef.current = null;
    // Drop the restored-session link so a reload starts fresh too.
    try {
      window.sessionStorage.removeItem(sessionStorageKey);
    } catch { /* ignore */ }
    setDraft('');
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  return (
    <div className={['sc-surface', isDrawer ? 'sc-surface--drawer' : 'sc-surface--page'].join(' ')}>
      {/* Header */}
      <div className="sc-header">
        <div className="sc-header-main">
          <div className="sc-header-icon">{icon}</div>
          <div className="sc-header-copy">
            <p className="sc-kicker">{strings.kicker}</p>
            <h2 className="sc-title">{strings.title}</h2>
            <p className="sc-tagline">{strings.tagline}</p>
            {headerBadges ? <div className="sc-header-badges">{headerBadges}</div> : null}
          </div>
        </div>
        <div className="sc-header-actions">
          {display.length > 0 && !loading && (
            <button
              type="button"
              onClick={resetConversation}
              aria-label={strings.newConversationAria}
              className="sc-btn-new"
            >
              <IconRotateCcw className="sc-btn-new-icon" strokeWidth={2.2} />
              {strings.newConversation}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label={companionOpen ? strings.closeWithCompanionAria : strings.closeAria}
            className={['sc-btn-close', companionOpen ? 'sc-btn-close--companion' : ''].join(' ')}
          >
            {companionOpen ? (
              <IconChevronLeft className="sc-btn-close-icon" strokeWidth={2.2} />
            ) : (
              <IconX className="sc-btn-close-icon" strokeWidth={2.2} />
            )}
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="sc-body">
        <div aria-hidden className="sc-veil sc-veil--top" />
        <div aria-hidden className="sc-veil sc-veil--bottom" />
        <div className="sc-scroll">
          {display.length === 0 ? (
            emptyState ? (
              <div className="sc-empty">{emptyState((prompt) => void send(prompt))}</div>
            ) : null
          ) : (
            <div className="sc-messages">
              {display.map((item, i) => {
                if (item.kind === 'user') return <UserBubble key={i} content={item.content} />;
                // Streaming assistant with nothing to show yet → thinking
                // indicator (but if a card is open, render the card, not the spinner).
                if (
                  item.streaming &&
                  !item.content &&
                  !item.card &&
                  item.products.length === 0 &&
                  item.broadenOptions.length === 0
                ) {
                  return <ThinkingBubble key={i} label={item.status ?? strings.thinking} icon={icon} />;
                }
                return (
                  <AssistantBubble
                    key={i}
                    content={item.content}
                    products={item.products}
                    broadenOptions={item.broadenOptions}
                    card={item.card}
                    onCardAnswer={answerCard}
                    onOptionClick={(prompt) => void send(prompt)}
                    disabled={loading}
                    icon={icon}
                    renderProducts={renderProducts}
                    cardStrings={cardStrings}
                  />
                );
              })}
              <div ref={bottomRef} />
            </div>
          )}
        </div>
      </div>

      {/* Input */}
      <div className="sc-composer">
        <div className="sc-composer-box">
          <textarea
            ref={inputRef}
            rows={1}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={strings.inputPlaceholder}
            className="sc-textarea"
            disabled={loading}
          />
          <button
            type="button"
            onClick={() => void send()}
            disabled={loading || !draft.trim()}
            aria-label={strings.sendAria}
            className="sc-send"
          >
            <IconArrowUp className="sc-send-icon" strokeWidth={2.2} />
          </button>
        </div>
      </div>
    </div>
  );
}
