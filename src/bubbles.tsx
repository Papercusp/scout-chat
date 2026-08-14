import type { ReactNode } from 'react';
import type { BroadenOption } from './types';
import type { OpenCardSnapshot } from '@papercusp/chat-protocol';
import { ChatCard, type CardAnswer, type ChatCardStrings } from './ChatCard';
import { IconChevronRight } from './icons';

export function UserBubble({ content }: { content: string }) {
  return (
    <div className="sc-user-row">
      <div className="sc-user-bubble">{content}</div>
    </div>
  );
}

export function AssistantBubble({
  content,
  products,
  broadenOptions,
  card,
  onCardAnswer,
  onOptionClick,
  disabled,
  icon,
  renderProducts,
  cardStrings,
}: {
  content: string;
  products: unknown[];
  broadenOptions: BroadenOption[];
  card?: OpenCardSnapshot | null;
  onCardAnswer: CardAnswer;
  onOptionClick: (prompt: string) => void;
  disabled: boolean;
  /** Assistant avatar content (e.g. the app's sparkle icon). */
  icon?: ReactNode;
  /** App-supplied product-card grid (the wire shape of a product is the app's contract). */
  renderProducts?: (products: unknown[]) => ReactNode;
  cardStrings?: Partial<ChatCardStrings>;
}) {
  return (
    <div className="sc-assistant">
      {content && (
        <div className="sc-assistant-row">
          <span className="sc-avatar">{icon}</span>
          <div className="sc-assistant-bubble">{content}</div>
        </div>
      )}
      {card && <ChatCard card={card} onAnswer={onCardAnswer} strings={cardStrings} />}
      {broadenOptions.length > 0 && (
        <div className="sc-broaden">
          {broadenOptions.map((option) => (
            <button
              key={option.prompt}
              type="button"
              onClick={() => onOptionClick(option.prompt)}
              disabled={disabled}
              className="sc-broaden-btn"
            >
              {option.label}
              <IconChevronRight className="sc-broaden-chevron" strokeWidth={2.5} />
            </button>
          ))}
        </div>
      )}
      {products.length > 0 && renderProducts ? (
        <div className="sc-products">{renderProducts(products)}</div>
      ) : null}
    </div>
  );
}

export function ThinkingBubble({ label, icon }: { label: string; icon?: ReactNode }) {
  return (
    <div className="sc-assistant-row">
      <span className="sc-avatar sc-avatar--pulse">{icon}</span>
      <div className="sc-thinking-bubble">
        <span className="sc-thinking-label">{label}</span>
        <span className="sc-dots">
          {[0, 1, 2].map((i) => (
            <span key={i} className="sc-dot" style={{ animationDelay: `${i * 0.15}s` }} />
          ))}
        </span>
      </div>
    </div>
  );
}
