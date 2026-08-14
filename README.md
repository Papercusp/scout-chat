# @papercusp/scout-chat

Themable, backend-agnostic Scout chat drawer, extracted from Restart's
`ScoutDrawer` + `RecommenderChat`.

- **Drawer chrome** — `ScoutChatDrawer`: a Vaul right-edge pane registered with
  `@papercusp/drawer-stack` (shared backdrop, multi-pane docking beside a cart,
  Escape, scroll-lock), with a launcher (FAB) slot rendered into the shared
  trigger stack and `scout:open` / `[data-scout-open]` open triggers.
- **Chat surface** — `ScoutChat`: streaming transcript + composer, transient
  tool status, interactive `@papercusp/chat-protocol` cards, "broaden" options,
  a conversation cache that survives drawer unmounts, and durable-transcript
  restore (ETag/304 via `@papercusp/data-fetch`, instant from IndexedDB).
- **Transport seam** — ALL endpoints + session identity live behind
  `ChatTransport`. `createHttpChatTransport` is the default: POST + SSE over
  `@papercusp/sse`'s `resilientPostStream` (reconnect-safe: resumes the SAME
  turn with `Last-Event-ID` after a drop, including across an
  interactive-card pause), a JSON POST for card answers, a conditional GET for
  the transcript.
- **Pure reducer** — `applyChatEvent` folds stream events into display state;
  non-display events (`navigate`, `highlight`, `cart_mutate`, `open_drawer`,
  `prefill_form`, …) pass through to the app's `onAppEvent`. `prefillForm` is
  exported as a safe, generic form-fill helper.
- **Theming** — zero hardcoded colors: every visual decision flows through
  `--sc-*` custom properties (falling back to the app's `--color-*` theme
  vars). Import `@papercusp/scout-chat/styles.css` and override the `--sc-*`
  layer per app.

App slots: assistant/header `icon`, `headerBadges`, `emptyState(send)`,
`renderProducts(products)` (the wire shape of a product is the app's contract),
plus all copy via `strings`.

```tsx
const cache = createChatConversationCache(); // module scope: survives drawer close
const transport = createHttpChatTransport({ chatUrl: '/api/scout' });

<ScoutChatDrawer launcherAriaLabel="Open Scout" title="Scout" launcher={<Fab />}>
  {({ close, otherOpen }) => (
    <ScoutChat
      transport={transport}
      cache={cache}
      variant="drawer"
      onClose={close}
      companionOpen={otherOpen}
      icon={<SparkleIcon />}
      renderProducts={(products) => products.map(renderCard)}
    />
  )}
</ScoutChatDrawer>
```

Tests: `npm run test -w @papercusp/scout-chat` from a consuming root.
