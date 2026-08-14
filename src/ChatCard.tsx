import { useState } from 'react';
import type { OpenCardSnapshot } from '@papercusp/chat-protocol';

export type CardAnswer = (
  correlationId: string,
  action: 'submit' | 'decline',
  value?: Record<string, unknown>,
) => void;

export interface ChatCardStrings {
  confirm: string;
  send: string;
  skip: string;
  textPlaceholder: string;
}

const DEFAULT_STRINGS: ChatCardStrings = {
  confirm: 'Confirm',
  send: 'Send',
  skip: 'Skip',
  textPlaceholder: 'Type your answer…',
};

/** Renders an interactive ask_choice card (radio / checkbox / text) inline in the turn. */
export function ChatCard({
  card,
  onAnswer,
  strings: stringOverrides,
}: {
  card: OpenCardSnapshot;
  onAnswer: CardAnswer;
  strings?: Partial<ChatCardStrings>;
}) {
  const strings = { ...DEFAULT_STRINGS, ...stringOverrides };
  const opts = card.presentation?.options ?? [];
  const [checked, setChecked] = useState<string[]>([]);
  const [text, setText] = useState('');
  // The card is the ONE thing that must stay interactive while the turn is
  // paused (the stream is held open awaiting this answer, so the chat's
  // `loading` flag is true the whole time — we must NOT inherit it here, or the
  // card could never be clicked). Instead the card self-locks once answered, to
  // prevent a double-submit before the card_closed event removes it.
  const [submitted, setSubmitted] = useState(false);
  const answer: CardAnswer = (correlationId, action, value) => {
    if (submitted) return;
    setSubmitted(true);
    onAnswer(correlationId, action, value);
  };
  const pkind = card.presentation?.kind;
  const kind = pkind === 'radio' || pkind === 'checkbox' ? pkind : 'text';
  return (
    <div className="sc-card">
      <p className="sc-card-prompt">{card.prompt}</p>
      {kind === 'radio' && (
        <div className="sc-card-options">
          {opts.map((o) => (
            <button
              key={o.id}
              type="button"
              disabled={submitted}
              onClick={() => answer(card.correlationId, 'submit', { optionId: o.id })}
              className="sc-card-option"
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
      {kind === 'checkbox' && (
        <div className="sc-card-multi">
          <div className="sc-card-options">
            {opts.map((o) => {
              const on = checked.includes(o.id);
              return (
                <button
                  key={o.id}
                  type="button"
                  disabled={submitted}
                  data-on={on || undefined}
                  onClick={() => setChecked((c) => (on ? c.filter((x) => x !== o.id) : [...c, o.id]))}
                  className="sc-card-option"
                >
                  {o.label}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            disabled={submitted || checked.length === 0}
            onClick={() => answer(card.correlationId, 'submit', { optionIds: checked })}
            className="sc-card-confirm"
          >
            {strings.confirm}
          </button>
        </div>
      )}
      {kind === 'text' && (
        <form
          className="sc-card-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim()) answer(card.correlationId, 'submit', { text: text.trim() });
          }}
        >
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={card.presentation?.placeholder ?? strings.textPlaceholder}
            disabled={submitted}
            className="sc-card-input"
          />
          <button type="submit" disabled={submitted || !text.trim()} className="sc-card-confirm">
            {strings.send}
          </button>
        </form>
      )}
      {card.allowDecline && (
        <button
          type="button"
          disabled={submitted}
          onClick={() => answer(card.correlationId, 'decline')}
          className="sc-card-skip"
        >
          {strings.skip}
        </button>
      )}
    </div>
  );
}
