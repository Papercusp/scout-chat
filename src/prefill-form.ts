/**
 * Generic, safe form-fill for a chat `prefill_form` app event. Resolves each
 * {field,value} to a VISIBLE, editable input on the current page by matching
 * the field key against the input's name/id/aria-label/associated-label/
 * placeholder, then sets the value via React's native value setter (so
 * controlled inputs update) and dispatches input+change events. It NEVER
 * submits, and skips password/hidden/disabled/readonly inputs and anything it
 * can't confidently match — so a tool-injected field can at worst fill a
 * visible text box the user can see and clear.
 *
 * Ported unchanged from Restart RecommenderChat; exported so a consuming app's
 * `onAppEvent` handler can wire it to its own `prefill_form` event.
 */
export function prefillForm(fields: Array<{ field?: unknown; value?: unknown }>): void {
  if (typeof document === 'undefined' || !fields.length) return;
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  // CSS.escape is missing in some environments (jsdom test runs, old browsers);
  // fall back to escaping the attribute-selector-breaking chars.
  const cssEscape = (s: string): string =>
    typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
      ? CSS.escape(s)
      : s.replace(/["\\\]]/g, '\\$&');
  const labelText = (el: Element): string => {
    let t = '';
    const id = el.getAttribute('id');
    if (id) {
      const lbl = document.querySelector(`label[for="${cssEscape(id)}"]`);
      if (lbl?.textContent) t += ' ' + lbl.textContent;
    }
    const wrap = el.closest('label');
    if (wrap?.textContent) t += ' ' + wrap.textContent;
    return t;
  };
  const SKIP_TYPES = new Set(['password', 'hidden', 'file', 'checkbox', 'radio', 'submit', 'button', 'image', 'reset', 'range', 'color']);
  const editable = Array.from(
    document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('input, textarea, select'),
  ).filter((el) => {
    if (el instanceof HTMLInputElement && SKIP_TYPES.has(el.type)) return false;
    if ((el as HTMLInputElement).disabled || (el as HTMLInputElement).readOnly) return false;
    return el.offsetParent !== null; // visible (not display:none / detached)
  });
  const attrsOf = (el: Element): string[] =>
    [el.getAttribute('name'), el.getAttribute('id'), el.getAttribute('aria-label'), el.getAttribute('placeholder'), labelText(el)]
      .filter((v): v is string => !!v)
      .map(norm)
      .filter((a) => a.length >= 2);
  // Specificity score of an input for a field key. Exact attribute match wins
  // outright; otherwise we score by the LENGTH of the overlapping substring so
  // the most specific attribute wins — e.g. "company name" scores higher on
  // name="company" (7) than on name="name" (4), instead of greedily taking the
  // first loose substring hit.
  const scoreFor = (el: Element, key: string): number => {
    let best = 0;
    for (const a of attrsOf(el)) {
      if (a === key) return 1000;
      if (key.includes(a)) best = Math.max(best, a.length); // attr is part of the field key ("company" ⊂ "companyname")
      else if (a.includes(key)) best = Math.max(best, key.length); // field key is part of the attr ("email" ⊂ "customeremail")
    }
    return best;
  };

  const used = new Set<Element>();
  for (const f of fields) {
    if (typeof f.field !== 'string' || typeof f.value !== 'string') continue;
    const key = norm(f.field);
    if (!key) continue;
    // Pick the free input with the highest specificity score (≥3 chars of
    // overlap, to avoid spurious 2-char hits). Ties resolve to DOM order.
    let match: Element | null = null;
    let matchScore = 0;
    for (const el of editable) {
      if (used.has(el)) continue;
      const s = scoreFor(el, key);
      if (s > matchScore) { matchScore = s; match = el; }
    }
    if (!match || matchScore < 3) continue;
    used.add(match);
    const proto =
      match instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype
      : match instanceof HTMLSelectElement ? HTMLSelectElement.prototype
      : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (setter) setter.call(match, f.value);
    else (match as HTMLInputElement).value = f.value;
    match.dispatchEvent(new Event('input', { bubbles: true }));
    match.dispatchEvent(new Event('change', { bubbles: true }));
  }
}
