import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
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

const formAdapterSource = await readFile(
  new URL("../src/app/form-builder/form-adapters.js", import.meta.url),
  "utf8"
);
const formAdapterSandbox = { console, localStorage: storage };
vm.createContext(formAdapterSandbox);
vm.runInContext(formAdapterSource, formAdapterSandbox, {
  filename: "form-adapters.js",
  timeout: 5000
});
const formAdapterDomain = formAdapterSandbox.KelpFormAdapters;
assert.ok(formAdapterDomain);

let formClock = 0;
const formAdapters = formAdapterDomain.createLocalAdapters({
  storage,
  now() {
    formClock += 1;
    return new Date(Date.UTC(2026, 6, 17, 12, 0, formClock)).toISOString();
  }
});
assert.equal(formAdapters.meta.provider, "local");
assert.equal(formAdapters.meta.contractVersion, 1);

const formDefinition = {
  id: "form-adapter-test",
  version: 3,
  meta: { title: "Adapter form", audience: "", description: "", respondentDetails: {} },
  settings: { submissionPolicy: { mode: "single" } },
  blocks: []
};
const savedFormRecord = await formAdapters.forms.save(formDefinition);
assert.equal(savedFormRecord.status, "active");
assert.notEqual(savedFormRecord.definition, formDefinition);
formDefinition.meta.title = "Changed outside storage";
assert.equal((await formAdapters.forms.load(formDefinition.id)).definition.meta.title, "Adapter form");
assert.equal((await formAdapters.forms.list({ status: "active" })).length, 1);
await assert.rejects(
  formAdapters.forms.remove(formDefinition.id),
  /Archive the form before deleting it/
);

const archivedFormRecord = await formAdapters.forms.archive(formDefinition.id);
assert.equal(archivedFormRecord.status, "archived");
assert.ok(archivedFormRecord.archivedAt);
await assert.rejects(
  formAdapters.forms.save(formDefinition),
  /Archived forms cannot be overwritten/
);

const immutableSubmission = {
  id: "submission-adapter-test",
  version: 1,
  immutable: true,
  formId: formDefinition.id,
  submittedAt: "2026-07-17T15:00:00.000Z",
  snapshot: {},
  data: { respondent: {}, answers: [] },
  metadata: {}
};
await formAdapters.submissions.create(immutableSubmission);
assert.equal((await formAdapters.submissions.list({ formId: formDefinition.id })).length, 1);
assert.deepEqual(
  JSON.parse(JSON.stringify(await formAdapters.submissions.create(immutableSubmission))),
  immutableSubmission
);
await assert.rejects(
  formAdapters.submissions.create({ ...immutableSubmission, submittedAt: "2026-07-18T15:00:00.000Z" }),
  /different submission already uses this ID/
);

assert.deepEqual(
  JSON.parse(JSON.stringify(await formAdapters.forms.remove(formDefinition.id))),
  { id: formDefinition.id, deleted: true }
);
assert.equal(await formAdapters.forms.load(formDefinition.id), null);
assert.equal(
  (await formAdapters.submissions.list({ formId: formDefinition.id })).length,
  1,
  "Deleting a form must not cascade into immutable submissions."
);

let overriddenForm = null;
const resolvedForms = await formAdapterDomain.resolveAdapters({
  localAdapters: formAdapters,
  globalObject: {
    KelpBackendAdapters: {
      forms: async () => ({
        meta: { provider: "self-test" },
        forms: {
          async save(definition) {
            overriddenForm = definition;
            return { id: definition.id, status: "active", definition };
          }
        }
      })
    }
  }
});
await resolvedForms.forms.save(formDefinition);
assert.equal(overriddenForm.id, formDefinition.id);
assert.equal(resolvedForms.meta.provider, "self-test");
assert.equal(typeof resolvedForms.forms.archive, "function");
assert.equal(typeof resolvedForms.submissions.create, "function");

console.log("Backend adapter contract self-test passed.");
