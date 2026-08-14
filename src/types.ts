import type { OpenCardSnapshot } from '@papercusp/chat-protocol';
import type { VersionedFetcher } from '@papercusp/data-fetch';

// ─── Display model ───────────────────────────────────────────────────────────

/** A "broaden your search" option offered by the assistant. */
export interface BroadenOption {
  label: string;
  prompt: string;
  resultCount?: number;
}

/**
 * One rendered item in the conversation. `products` is deliberately opaque
 * (`unknown[]`): the wire shape of a product is the consuming app's contract
 * with its own backend — the app renders them via the `renderProducts` slot.
 */
export type ChatDisplayItem =
  | { kind: 'user'; content: string }
  | {
      kind: 'assistant';
      content: string;
      products: unknown[];
      broadenOptions: BroadenOption[];
      /** True while tokens are still streaming in. */
      streaming?: boolean;
      /** Transient status shown before the first token (e.g. "Searching the catalog…"). */
      status?: string;
      /** An open interactive card (ask_choice) awaiting the customer's answer. */
      card?: OpenCardSnapshot | null;
    };

export type AssistantDisplayItem = Extract<ChatDisplayItem, { kind: 'assistant' }>;

// ─── Conversation cache ──────────────────────────────────────────────────────

/**
 * Conversation state that OUTLIVES the drawer mount. Vaul unmounts the
 * drawer's content on close, so without this the message list is lost on every
 * close and rebuilt from the server on reopen (a stale-snapshot flash). The
 * consuming app holds one instance at module scope — open→close→open then
 * keeps the exact live state; a full page reload starts a fresh instance, at
 * which point the versioned transcript restore rehydrates from the server.
 */
export interface ChatConversationCache {
  display: ChatDisplayItem[];
  sessionId: string | null;
}

export function createChatConversationCache(): ChatConversationCache {
  return { display: [], sessionId: null };
}

// ─── Transport seam ──────────────────────────────────────────────────────────

/** One user turn, as handed to the transport. */
export interface ChatTurnRequest {
  message: string;
  sessionId: string | null;
  /** App-defined page-awareness payload, computed fresh per send. */
  pageContext?: unknown;
}

/** The durable transcript, as restored via the versioned read-cache. */
export interface ChatTranscriptPayload {
  version: string | null;
  messages: Array<{ role: string; content: string }>;
}

/**
 * ALL endpoints + session identity live behind this seam — the lib never
 * hard-codes a URL. `createHttpChatTransport` is the default HTTP/SSE
 * implementation; apps may substitute any transport honouring the contract.
 */
export interface ChatTransport {
  /**
   * Stream one turn; yields decoded event payloads (`{ type: 'token', … }`).
   * Implementations must be reconnect-safe (resume the SAME turn after a drop,
   * e.g. Last-Event-ID over @papercusp/sse's resilientPostStream) and end the
   * iteration on a terminal event (`done`/`error`).
   */
  streamTurn(
    turn: ChatTurnRequest,
    opts?: { signal?: AbortSignal },
  ): AsyncIterable<Record<string, unknown>>;

  /** Answer (or decline) an open interactive card; the paused turn resumes server-side. */
  answerCard(
    correlationId: string,
    action: 'submit' | 'decline',
    value?: Record<string, unknown>,
  ): Promise<void>;

  /**
   * Conditional-GET fetcher for the durable transcript of `sessionId`
   * (ETag/If-None-Match → 304), consumed through @papercusp/data-fetch's
   * useVersionedResource for the instant-from-IndexedDB restore.
   */
  transcriptFetcher(sessionId: string): VersionedFetcher<ChatTranscriptPayload>;
}
