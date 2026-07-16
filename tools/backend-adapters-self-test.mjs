import assert from "node:assert/strict";
import {
  KELP_BACKEND_ADAPTER_CONTRACT_VERSION,
  createLocalClassroomAdapters,
  createLocalWhiteboardAdapters,
  resolveKelpBackendAdapters
} from "../src/app/shared/backend-adapters.js";

class MemoryStorage {
  values = new Map();

  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }

  setItem(key, value) {
    this.values.set(key, String(value));
  }

  removeItem(key) {
    this.values.delete(key);
  }
}

const storage = new MemoryStorage();
const events = new EventTarget();
const roomId = "adapter-self-test";
const classroomKey = `kelp:classroom:v1:${roomId}`;
const createRoom = () => ({ roomId, chat: [], timer: {}, sessionEvents: [] });
const classroom = createLocalClassroomAdapters({
  roomId,
  storageKey: classroomKey,
  storage,
  eventTarget: events,
  createRoom
});

assert.equal(classroom.meta.contractVersion, KELP_BACKEND_ADAPTER_CONTRACT_VERSION);
assert.deepEqual(await classroom.roomSession.load(), createRoom());

const savedRoom = { ...createRoom(), title: "Adapter room" };
await classroom.roomSession.save(savedRoom);
assert.equal(JSON.parse(storage.getItem(classroomKey)).title, "Adapter room");

const message = { id: "message-1", text: "Hello" };
const chatSnapshot = { ...savedRoom, chat: [message] };
await classroom.chat.send(message, { snapshot: chatSnapshot });
assert.deepEqual(JSON.parse(storage.getItem(classroomKey)).chat, [message]);

let subscribedRoom = null;
const unsubscribe = classroom.roomSession.subscribe((room) => {
  subscribedRoom = room;
});
const storageEvent = new Event("storage");
Object.defineProperties(storageEvent, {
  key: { value: classroomKey },
  newValue: { value: JSON.stringify(chatSnapshot) }
});
events.dispatchEvent(storageEvent);
unsubscribe();
assert.equal(subscribedRoom.roomId, roomId);

let overriddenMessage = null;
const resolvedClassroom = await resolveKelpBackendAdapters({
  scope: "classroom",
  localAdapters: classroom,
  globalObject: {
    KelpBackendAdapters: {
      classroom: async () => ({
        meta: { provider: "self-test" },
        chat: {
          async send(nextMessage) {
            overriddenMessage = nextMessage;
          }
        }
      })
    }
  },
  context: { roomId }
});
await resolvedClassroom.chat.send(message, { snapshot: chatSnapshot });
assert.equal(overriddenMessage, message);
assert.equal(resolvedClassroom.meta.provider, "self-test");
assert.equal((await resolvedClassroom.roomSession.load()).roomId, roomId);

const whiteboardKey = `kelp:whiteboard:v1:${roomId}`;
const whiteboard = createLocalWhiteboardAdapters({
  roomId,
  storageKey: whiteboardKey,
  storage
});
const scene = {
  type: "excalidraw",
  roomId,
  elements: [],
  files: { "file-1": { id: "file-1" } }
};
assert.equal(await whiteboard.whiteboards.load(), null);
assert.equal(await whiteboard.files.save(scene.files), scene.files);
await whiteboard.whiteboards.save(scene);
assert.deepEqual(await whiteboard.whiteboards.load(), scene);
assert.equal((await whiteboard.collaboration.connect()).connected, false);
assert.equal(typeof whiteboard.collaboration.subscribe(() => {}), "function");
await whiteboard.whiteboards.clear();
assert.equal(await whiteboard.whiteboards.load(), null);

console.log("Backend adapter contract self-test passed.");
