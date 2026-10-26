// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { AssistantBubble } from './bubbles';

afterEach(cleanup);
describe('Scout renderer host boundary', () => {
  it('keeps legacy product data and prompt buttons hidden while the shared result host resolves', () => {
    const send = vi.fn();
    const renderProducts = vi.fn(() => <a href="/p/unverified">Unverified product</a>);
    render(<AssistantBubble content="" products={[{ id: 'unverified' }]}
      broadenOptions={[{ label: 'Unverified action', prompt: 'unverified prompt' }]}
      onCardAnswer={vi.fn()} onOptionClick={send} disabled={false} renderProducts={renderProducts}
      results={{ conversationId: 'own', turnId: 'turn', blocks: [{ id: 'result', kind: 'entity', title: 'Reference', sources: [{ ref: 'opaque' }] }] }}
      renderResults={() => <p role="status">Checking current access</p>} />);
    expect(screen.getByRole('status').textContent).toBe('Checking current access');
    expect(screen.queryByText('Unverified action')).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
    expect(renderProducts).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('keeps unrendered model HTML inert and preserves legacy product slots for explicit legacy consumers', () => {
    const { container } = render(<AssistantBubble content={'<img src=x onerror="alert(1)"><script>alert(1)</script>'}
      products={[{ id: 'one' }]} broadenOptions={[]} onCardAnswer={vi.fn()} onOptionClick={vi.fn()}
      disabled={false} renderProducts={() => <span>Legacy product</span>} />);
    expect(container.querySelector('img,script,[onerror]')).toBeNull();
    expect(screen.getByText('Legacy product')).toBeTruthy();
  });
});
