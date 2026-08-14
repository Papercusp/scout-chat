import { describe, expect, it } from 'vitest';
import { buildTurnBody, createHttpChatTransport } from './transport';

describe('buildTurnBody', () => {
  it('builds the first-attempt body, omitting absent session/pageContext', () => {
    expect(buildTurnBody({ message: 'hi', sessionId: null }, null)).toEqual({ message: 'hi' });
  });

  it('carries sessionId and pageContext when present', () => {
    expect(
      buildTurnBody({ message: 'hi', sessionId: 's-1', pageContext: { type: 'product' } }, null),
    ).toEqual({ message: 'hi', sessionId: 's-1', pageContext: { type: 'product' } });
  });

  it('builds the resume cursor body on reconnect', () => {
    expect(
      buildTurnBody({ message: 'hi', sessionId: 's-1' }, { turnId: 't-9', lastEventId: 17 }),
    ).toEqual({ turnId: 't-9', lastEventId: 17 });
  });
});

describe('createHttpChatTransport', () => {
  it('streams decoded SSE payloads until the terminal done event', async () => {
    const sse = [
      'id: 1\ndata: {"type":"session","sessionId":"s-7"}\n\n',
      'id: 2\ndata: {"type":"token","content":"Hi"}\n\n',
      'id: 3\ndata: {"type":"done"}\n\n',
    ].join('');
    const calls: Array<{ url: string; body: unknown }> = [];
    const fetchImpl: typeof fetch = async (url, init) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
      return new Response(sse, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream', 'X-Scout-Turn-Id': 't-1' },
      });
    };
    const transport = createHttpChatTransport({ chatUrl: '/api/scout', fetchImpl });
    const seen: unknown[] = [];
    for await (const data of transport.streamTurn({ message: 'hello', sessionId: null })) {
      seen.push(data);
    }
    expect(seen).toEqual([
      { type: 'session', sessionId: 's-7' },
      { type: 'token', content: 'Hi' },
      { type: 'done' },
    ]);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('/api/scout');
    expect(calls[0].body).toEqual({ message: 'hello' });
  });

  it('POSTs card answers to the card-response endpoint', async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    const fetchImpl: typeof fetch = async (url, init) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
      return new Response('{}', { status: 200 });
    };
    const transport = createHttpChatTransport({ fetchImpl });
    await transport.answerCard('corr-1', 'submit', { optionId: 'a' });
    expect(calls).toEqual([
      {
        url: '/api/scout-card-response',
        body: { correlationId: 'corr-1', action: 'submit', value: { optionId: 'a' } },
      },
    ]);
  });
});
