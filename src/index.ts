// @papercusp/scout-chat
//
// Themable, backend-agnostic Scout chat drawer, extracted from Restart's
// ScoutDrawer + RecommenderChat. The ChatTransport seam owns every endpoint +
// session identity; the --sc-* custom-property layer owns every visual
// decision; products / icons / header badges / empty states are app slots.

export { ScoutChat } from './ScoutChat';
export type { ScoutChatProps, ScoutChatStrings } from './ScoutChat';

export { ScoutChatDrawer } from './ScoutChatDrawer';
export type { ScoutChatDrawerProps } from './ScoutChatDrawer';

export { ChatCard } from './ChatCard';
export type { CardAnswer, ChatCardStrings } from './ChatCard';

export { UserBubble, AssistantBubble, ThinkingBubble } from './bubbles';

export {
  applyChatEvent,
  patchLastAssistant,
  isDisplayChatEvent,
  DISPLAY_CHAT_EVENT_TYPES,
} from './reducer';
export type { ApplyChatEventOptions, ChatEventOutcome } from './reducer';

export { createHttpChatTransport, buildTurnBody } from './transport';
export type { HttpChatTransportOptions } from './transport';

export { prefillForm } from './prefill-form';

export { createChatConversationCache } from './types';
export type {
  AssistantDisplayItem,
  BroadenOption,
  ChatConversationCache,
  ChatDisplayItem,
  ChatTranscriptPayload,
  ChatTransport,
  ChatTurnRequest,
} from './types';
