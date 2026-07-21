import assert from "node:assert/strict";
import {
  removeDeletedElementBindings,
  resolveTemplateDeletionIds,
} from "../src/app/whiteboard/whiteboard-template-contract.js";

function element(id, type, extra = {}) {
  return {
    id,
    type,
    isDeleted: false,
    locked: false,
    frameId: null,
    boundElements: null,
    customData: {},
    ...extra,
  };
}

const scene = [
  element("background-a", "rectangle", {
    locked: true,
    customData: { kelpFrameBackgroundFor: { frameId: "frame-a" } },
  }),
  element("card-a", "rectangle", {
    frameId: "frame-a",
    boundElements: [{ id: "arrow-a", type: "arrow" }],
  }),
  element("title-a", "text", { frameId: "frame-a" }),
  element("arrow-a", "arrow", {
    frameId: "frame-a",
    startBinding: { elementId: "card-a" },
    endBinding: { elementId: "card-b" },
  }),
  element("frame-a", "frame", {
    customData: {
      kelpFrameBackground: { elementId: "background-a" },
      kelpLessonFrame: { slug: "a" },
    },
  }),
  element("background-b", "rectangle", {
    locked: true,
    customData: { kelpFrameBackgroundFor: { frameId: "frame-b" } },
  }),
  element("card-b", "rectangle", {
    frameId: "frame-b",
    boundElements: [{ id: "arrow-a", type: "arrow" }],
  }),
  element("title-b", "text", { frameId: "frame-b" }),
  element("frame-b", "frame", {
    customData: {
      kelpFrameBackground: { elementId: "background-b" },
      kelpLessonFrame: { slug: "b" },
    },
  }),
];

assert.deepEqual(
  [...resolveTemplateDeletionIds(scene, { "frame-a": true })].sort(),
  ["arrow-a", "background-a", "card-a", "frame-a", "title-a"].sort(),
  "Selecting a frame should cascade to its children and managed background",
);

assert.deepEqual(
  [...resolveTemplateDeletionIds(scene, { "card-a": true, "title-a": true, "arrow-a": true })].sort(),
  ["arrow-a", "background-a", "card-a", "frame-a", "title-a"].sort(),
  "Selecting all selectable frame children should remove the full board",
);

assert.deepEqual(
  [...resolveTemplateDeletionIds(scene, { "card-a": true })],
  ["card-a"],
  "Deleting one card must not delete its frame",
);

assert.deepEqual(
  [...resolveTemplateDeletionIds(scene, { "frame-a": true, "frame-b": true })].sort(),
  scene.map((candidate) => candidate.id).sort(),
  "Selecting several frames should cascade through every selected board",
);

const cleaned = removeDeletedElementBindings(scene.find((candidate) => candidate.id === "card-b"), new Set(["arrow-a"]));
assert.equal(cleaned.boundElements, null, "Deleting an arrow should clear reciprocal bindings");

const cleanedArrow = removeDeletedElementBindings(scene.find((candidate) => candidate.id === "arrow-a"), new Set(["card-a"]));
assert.equal(cleanedArrow.startBinding, null, "Deleting a bound card should clear the arrow endpoint");
assert.equal(cleanedArrow.endBinding.elementId, "card-b", "Unrelated arrow endpoints should remain attached");

console.log("Whiteboard template deletion contract self-test passed.");
