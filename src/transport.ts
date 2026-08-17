import { resilientPostStream, type ResilientPostResume } from '@papercusp/sse';
import { httpVersionedFetcher } from '@papercusp/data-fetch';
import type { ChatTranscriptPayload, ChatTransport, ChatTurnRequest } from './types';

export interface HttpChatTransportOptions {
  /** POST endpoint streaming the turn as SSE. Default `/api/scout`. */
  chatUrl?: string;
  /** POST endpoint answering an interactive card. Default `/api/scout-card-response`. */
  cardResponseUrl?: string;
  /** Build the transcript GET URL for a session. Default `${chatUrl}?sessionId=…`. */
  transcriptUrl?: (sessionId: string) => string;
  /** Response header carrying the resumable turn id. Default `X-Scout-Turn-Id`. */
  turnIdHeader?: string;
  /** Event `type` values that end the stream. Default `['done', 'error']`. */
  terminalTypes?: string[];
  /** Injectable for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /**
   * Fail a turn when the server sends NO frame (heartbeats included) for this
   * long. Default 0 = off. Must exceed the server's heartbeat interval (10s for
   * @papercusp/sse). Without it a stalled turn leaves the composer disabled
   * until a page reload, because the stream never settles (WI-39716).
   */
  idleTimeoutMs?: number;
  /**
   * App-specific wire-body adapter. The default preserves `buildTurnBody`;
   * consumers may promote a bounded part of `pageContext` into an established
   * backend request shape without forking the reconnect-safe transport.
   */
  buildBody?: (
    turn: ChatTurnRequest,
    resume: ResilientPostResume | null,
  ) => Record<string, unknown>;
}

/**
 * The wire body for one attempt of a turn: the full payload on the first
 * attempt, the `{ turnId, lastEventId }` resume cursor on a reconnect (the
 * server replays what was missed). Exported for tests + custom transports.
 */
export function buildTurnBody(
  turn: ChatTurnRequest,
  resume: ResilientPostResume | null,
): Record<string, unknown> {
  return resume
    ? { turnId: resume.turnId, lastEventId: resume.lastEventId }
    : {
        message: turn.message,
        ...(turn.sessionId ? { sessionId: turn.sessionId } : {}),
        ...(turn.pageContext ? { pageContext: turn.pageContext } : {}),
      };
}

/**
 * The default ChatTransport: POST + SSE via @papercusp/sse's
 * resilientPostStream (reconnect-safe: resumes the SAME turn with
 * Last-Event-ID after a drop — notably across an interactive-card pause), a
 * JSON POST for card answers, and an ETag'd conditional GET for the durable
 * transcript. Mirrors Restart's `/api/scout` contract; every URL is
 * overridable so any app with the same event vocabulary can reuse it.
 */
export function createHttpChatTransport(opts: HttpChatTransportOptions = {}): ChatTransport {
  const chatUrl = opts.chatUrl ?? '/api/scout';
  const cardResponseUrl = opts.cardResponseUrl ?? '/api/scout-card-response';
  const turnIdHeader = opts.turnIdHeader ?? 'X-Scout-Turn-Id';
  const terminal = new Set(opts.terminalTypes ?? ['done', 'error']);
  const transcriptUrl =
    opts.transcriptUrl ?? ((sessionId: string) => `${chatUrl}?sessionId=${encodeURIComponent(sessionId)}`);

  return {
    async *streamTurn(turn, streamOpts) {
      for await (const ev of resilientPostStream<Record<string, unknown>>({
        url: chatUrl,
        turnIdHeader,
        buildBody: (resume) => (opts.buildBody ?? buildTurnBody)(turn, resume),
        isTerminal: (d) => terminal.has(String((d as { type?: unknown }).type)),
        ...(streamOpts?.signal ? { signal: streamOpts.signal } : {}),
        ...(opts.idleTimeoutMs ? { idleTimeoutMs: opts.idleTimeoutMs } : {}),
        ...(opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {}),
      })) {
        yield ev.data;
      }
    },

    async answerCard(correlationId, action, value) {
      await (opts.fetchImpl ?? fetch)(cardResponseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ correlationId, action, value }),
      });
    },

    transcriptFetcher(sessionId) {
      return httpVersionedFetcher<ChatTranscriptPayload>(transcriptUrl(sessionId));
    },
  };
}
