// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { prefillForm } from './prefill-form';

// jsdom has no layout, so offsetParent is null for everything — patch it to
// mimic "visible" for elements not display:none.
beforeEach(() => {
  document.body.innerHTML = '';
  Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
    configurable: true,
    get(this: HTMLElement) {
      return this.style.display === 'none' ? null : document.body;
    },
  });
});

function addInput(attrs: Record<string, string>): HTMLInputElement {
  const el = document.createElement('input');
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  document.body.appendChild(el);
  return el;
}

describe('prefillForm', () => {
  it('fills an input by exact name match and dispatches input+change', () => {
    const el = addInput({ name: 'email' });
    const events: string[] = [];
    el.addEventListener('input', () => events.push('input'));
    el.addEventListener('change', () => events.push('change'));
    prefillForm([{ field: 'email', value: 'a@b.co' }]);
    expect(el.value).toBe('a@b.co');
    expect(events).toEqual(['input', 'change']);
  });

  it('prefers the most specific attribute overlap over a greedy first hit', () => {
    const nameInput = addInput({ name: 'name' });
    const companyInput = addInput({ name: 'company' });
    prefillForm([{ field: 'company name', value: 'ACME' }]);
    expect(companyInput.value).toBe('ACME');
    expect(nameInput.value).toBe('');
  });

  it('never touches password/hidden/disabled/readonly inputs', () => {
    const pw = addInput({ name: 'password', type: 'password' });
    const hidden = addInput({ name: 'passcode', type: 'hidden' });
    const disabled = addInput({ name: 'passphrase' });
    disabled.disabled = true;
    prefillForm([{ field: 'pass', value: 'hunter2' }]);
    expect(pw.value).toBe('');
    expect(hidden.value).toBe('');
    expect(disabled.value).toBe('');
  });

  it('skips invisible inputs and sub-3-char substring overlaps', () => {
    const invisible = addInput({ name: 'email' });
    invisible.style.display = 'none';
    const stranger = addInput({ name: 'ab' });
    prefillForm([{ field: 'email', value: 'x@y.z' }, { field: 'abc', value: 'nope' }]);
    expect(invisible.value).toBe('');
    expect(stranger.value).toBe(''); // "ab" ⊂ "abc" is a 2-char overlap, below the ≥3 floor
  });

  it('matches via an associated <label for=…>', () => {
    const el = addInput({ id: 'f1' });
    const label = document.createElement('label');
    label.setAttribute('for', 'f1');
    label.textContent = 'Shipping address';
    document.body.appendChild(label);
    prefillForm([{ field: 'shipping address', value: '1 Main St' }]);
    expect(el.value).toBe('1 Main St');
  });

  it('uses each input at most once', () => {
    const only = addInput({ name: 'city' });
    prefillForm([
      { field: 'city', value: 'Springfield' },
      { field: 'city', value: 'Shelbyville' },
    ]);
    expect(only.value).toBe('Springfield');
  });

  it('ignores non-string field/value pairs', () => {
    const el = addInput({ name: 'email' });
    prefillForm([{ field: 'email', value: 42 as unknown as string }, { field: 7 as unknown as string, value: 'x' }]);
    expect(el.value).toBe('');
  });
});
