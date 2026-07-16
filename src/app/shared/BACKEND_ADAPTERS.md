# Kelp backend adapters

The classroom and whiteboard use contract version `1`. Local storage remains the default provider, while `window.KelpBackendAdapters` can replace individual domains before either page module loads.

## Classroom domains

- `roomSession`: load, save, and subscribe to the canonical room snapshot.
- `participantPresence`: publish join, leave, and connection-quality state.
- `chat`: send one normalized message.
- `timers`: save the shared countdown state.
- `sessionEvents`: append one audit event.

## Whiteboard domains

- `collaboration`: connect, subscribe, publish a merged scene, and disconnect.
- `whiteboards`: load, save, and clear the room board.
- `files`: persist or transform Excalidraw files before the board is saved.

Collaboration subscribers should deliver an authoritative, already-merged scene and preserve the originating `clientId`. The page ignores its own echoed updates; conflict resolution belongs in the collaboration provider rather than in the whiteboard UI.

Each write receives a narrow payload followed by a context containing `roomId`, the current participant when relevant, a reason, and the optimistic local snapshot. Methods may be synchronous or return promises.

```js
window.KelpBackendAdapters = {
  classroom: async ({ roomId }) => ({
    chat: {
      async send(message) {
        await fetch(`/api/rooms/${roomId}/chat`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(message)
        });
      }
    }
  }),
  whiteboard: async ({ roomId }) => ({
    whiteboards: {
      async load() {
        const response = await fetch(`/api/rooms/${roomId}/whiteboard`);
        return response.ok ? response.json() : null;
      }
    }
  })
};
```

Partial overrides inherit every omitted method from the local provider. This makes it possible to wire and validate one backend capability at a time.
