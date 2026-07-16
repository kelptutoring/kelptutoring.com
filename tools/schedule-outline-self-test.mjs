import assert from "node:assert/strict";
import "../src/app/schedule-generator/schedule-outline.js";

const outlineDomain = globalThis.KelpScheduleOutline;
const plans = [
  {
    sourceSessionId: "session_a1",
    trackId: "track_a",
    trackTitle: "Track A",
    moduleId: "module_a",
    moduleTitle: "Module 1: Foundations",
    title: "Session A1"
  },
  {
    sourceSessionId: "session_a2",
    trackId: "track_a",
    trackTitle: "Track A",
    moduleId: "module_a",
    moduleTitle: "Module 1: Foundations",
    title: "Session A2"
  },
  {
    sourceSessionId: "session_b1",
    trackId: "track_a",
    trackTitle: "Track A",
    moduleId: "module_b",
    moduleTitle: "Module 2: Applications",
    title: "Session B1"
  },
  {
    clientId: "custom_1",
    sourceSessionId: null,
    trackId: "track_a",
    trackTitle: "Track A",
    moduleId: null,
    moduleTitle: "Custom sessions",
    title: "Custom review"
  }
];

const outline = outlineDomain.createOutline(plans);
assert.deepEqual(outlineDomain.listModules(outline).map((module) => module.id), ["module_a", "module_b"]);
assert.equal(outlineDomain.listPlans(outline).at(-1).moduleId, "module_b");

outlineDomain.renameModule(outline, "module:module_a", "Core foundations");
assert.equal(outlineDomain.listPlans(outline)[0].moduleTitle, "Core foundations");

outlineDomain.moveSessionAfter(outline, "source:session_b1", "module:module_a");
assert.equal(outlineDomain.listPlans(outline)[0].sourceSessionId, "session_b1");
assert.equal(outlineDomain.listPlans(outline)[0].moduleId, "module_a");

outlineDomain.moveModuleBlockAfter(outline, "module:module_a", "module:module_b");
assert.deepEqual(outlineDomain.listModules(outline).map((module) => module.id), ["module_b", "module_a"]);
assert.equal(outlineDomain.listPlans(outline).at(-1).moduleId, "module_a");

const reconciled = outlineDomain.reconcileOutline(outline, plans.filter((plan) => plan.sourceSessionId !== "session_a2"));
assert.equal(outlineDomain.listPlans(reconciled).some((plan) => plan.sourceSessionId === "session_a2"), false);
assert.equal(reconciled[0].kind, "module");

const editableOutline = outlineDomain.createOutline(plans.slice(0, 3));
outlineDomain.addModule(editableOutline, {
  moduleId: "module_custom",
  trackId: "track_a",
  trackTitle: "Track A",
  title: "Extra practice"
});
assert.deepEqual(
  outlineDomain.listModules(editableOutline).map((module) => module.id),
  ["module_a", "module_b", "module_custom"]
);

outlineDomain.moveModuleByDirection(editableOutline, "module:module_custom", -1);
assert.deepEqual(
  outlineDomain.listModules(editableOutline).map((module) => module.id),
  ["module_a", "module_custom", "module_b"]
);

outlineDomain.removeModule(editableOutline, "module:module_a");
assert.deepEqual(
  outlineDomain.listModules(editableOutline).map((module) => module.id),
  ["module_custom", "module_b"]
);
assert.ok(
  outlineDomain.listPlans(editableOutline).filter((plan) => plan.sourceSessionId?.startsWith("session_a")).every((plan) => {
    return plan.moduleId === "module_custom";
  }),
  "Sessions from the first removed module must move into the module below it."
);

outlineDomain.removeModule(editableOutline, "module:module_b");
assert.equal(outlineDomain.listModules(editableOutline).length, 1);
assert.ok(
  outlineDomain.listPlans(editableOutline).every((plan) => plan.moduleId === "module_custom"),
  "Sessions from a later removed module must move into the module above it."
);
outlineDomain.removeModule(editableOutline, "module:module_custom");
assert.equal(outlineDomain.listModules(editableOutline).length, 1, "The final module cannot be removed.");

const relativeSessionOutline = outlineDomain.createOutline(plans.slice(0, 3));
outlineDomain.moveSessionBefore(relativeSessionOutline, "source:session_b1", "source:session_a2");
assert.deepEqual(
  outlineDomain.listPlans(relativeSessionOutline).map((plan) => plan.sourceSessionId),
  ["session_a1", "session_b1", "session_a2"]
);
assert.equal(outlineDomain.listPlans(relativeSessionOutline)[1].moduleId, "module_a");

const relativeModuleOutline = outlineDomain.createOutline(plans.slice(0, 3));
outlineDomain.moveModuleBlockBefore(relativeModuleOutline, "module:module_b", "module:module_a");
assert.deepEqual(
  outlineDomain.listModules(relativeModuleOutline).map((module) => module.id),
  ["module_b", "module_a"]
);
assert.equal(outlineDomain.listPlans(relativeModuleOutline)[0].sourceSessionId, "session_b1");

console.log("Schedule outline self-test passed.");
