import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const toolsRoot = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(toolsRoot, "..");
const generatorRoot = path.join(projectRoot, "src", "app", "schedule-generator");
const generatorHtmlPath = path.join(generatorRoot, "schedule-generator.html");
const generatorJsPath = path.join(generatorRoot, "schedule-generator.js");
const generatedHtmlPath = path.join(generatorRoot, "generated-schedule.html");
const generatedJsPath = path.join(generatorRoot, "generated-schedule.js");
const stylesPath = path.join(projectRoot, "src", "styles", "style.css");

const [html, javascript, generatedHtml, generatedJavascript, styles] = await Promise.all([
  fs.readFile(generatorHtmlPath, "utf8"),
  fs.readFile(generatorJsPath, "utf8"),
  fs.readFile(generatedHtmlPath, "utf8"),
  fs.readFile(generatedJsPath, "utf8"),
  fs.readFile(stylesPath, "utf8")
]);

const htmlIds = new Set(Array.from(html.matchAll(/\bid="([^"]+)"/g), (match) => match[1]));
const referencedIds = new Set(Array.from(
  javascript.matchAll(/getElementById\("([^"]+)"\)/g),
  (match) => match[1]
));
const missingIds = Array.from(referencedIds).filter((id) => !htmlIds.has(id));
assert.deepEqual(missingIds, [], `Missing HTML ids: ${missingIds.join(", ")}`);

const generatedHtmlIds = new Set(Array.from(
  generatedHtml.matchAll(/\bid="([^"]+)"/g),
  (match) => match[1]
));
const generatedReferencedIds = new Set(Array.from(
  generatedJavascript.matchAll(/getElementById\("([^"]+)"\)/g),
  (match) => match[1]
));
const missingGeneratedIds = Array.from(generatedReferencedIds)
  .filter((id) => !generatedHtmlIds.has(id));
assert.deepEqual(
  missingGeneratedIds,
  [],
  `Missing generated-schedule HTML ids: ${missingGeneratedIds.join(", ")}`
);

assert.match(html, /choose 1–7/);
assert.match(html, /Choose one or more tracks/);
assert.match(html, /continueToTrackSessionsBtn/);
assert.doesNotMatch(html, /id="moduleStep"/);
assert.match(javascript, /session-module-collapse/);
assert.match(javascript, /week-preview-module is-collapsed/);
assert.match(javascript, /row\.draggable = true/);
assert.match(javascript, /toggle\.draggable = true/);
assert.match(javascript, /selectedTrackIds/);
assert.match(javascript, /trackIds/);
assert.match(javascript, /trackTitles/);
assert.match(javascript, /schedule-preview-module-card/);
assert.match(javascript, /moveModuleBlockAfter/);
assert.match(javascript, /moveModuleByDirection/);
assert.match(javascript, /moveModuleBlockBefore/);
assert.match(javascript, /moveSessionBefore/);
assert.match(javascript, /is-drop-before/);
assert.match(javascript, /animatePreviewReorder/);
assert.ok(
  (javascript.match(/rebuildSchedulePreview\(\{ animateFrom: previousPositions \}\)/g) || []).length >= 4,
  "Arrow and drag-and-drop reordering must both animate module and session cards."
);
assert.match(javascript, /removeModule/);
assert.match(javascript, /undoOutlineChange/);
assert.match(javascript, /redoOutlineChange/);
assert.match(javascript, /confirmScheduleAction/);
assert.match(html, /id="scheduleActionDialog"/);
assert.doesNotMatch(javascript, /window\.confirm/);
assert.match(javascript, /moveSessionAfter/);
assert.match(javascript, /requestAnimationFrame/);
assert.match(javascript, /kelpScheduleBuilderDraft/);
assert.match(javascript, /restoreBuilderDraft/);
assert.match(javascript, /Classroom content .* active Version/);
assert.match(javascript, /Current eligible Sessions are preselected/);
assert.match(javascript, /Add content from another Track/);
assert.match(javascript, /createClassroomBuilderPreload/);
assert.match(javascript, /courseDraftMatchesActiveVersion/);
assert.match(javascript, /courseHierarchyActive/);
assert.match(html, /id="selectionFinishActions"/);
assert.match(html, /id="selectScheduleDatesBtn"/);
assert.match(html, />\s*Select dates and cadence\s*</);
assert.match(html, /id="courseChangeReason"/);
assert.match(html, /class="cadence-choice-grid"/);
assert.match(html, /Choose the IANA timezone used for this Schedule/);
assert.match(javascript, /function openScheduleSettings\(\)/);
assert.match(javascript, /Choose at least one governed Track Session for/);
assert.match(javascript, /studentExplanation:\s*elements\.courseChangeReason\.value\.trim\(\)/);
assert.match(javascript, /function activeCourseScheduleStartDate\(context\)/);
assert.match(javascript, /elements\.startDate\.value = activeCourseScheduleStartDate\(courseEditor\)/);
assert.match(javascript, /const versionStart = context\.schedule\?\.activeStartDate \|\| "";/);
assert.match(javascript, /const lockedStart = context\.course\?\.startDate \|\| "";/);
assert.match(javascript, /return versionStart \|\| activeStart \|\| lockedStart;/);
assert.match(html, /id="restoreCurrentPlanBtn"[^>]*>Restore current plan</);
assert.match(javascript, /function restoreCurrentCoursePlan\(\)/);
assert.match(javascript, /elements\.restoreCurrentPlanBtn\.addEventListener\("click", restoreCurrentCoursePlan\)/);
assert.match(javascript, /function resetReplacementScheduleSettings\(\)/);
assert.match(javascript, /courseScheduleTrackRemovalState/);
assert.match(javascript, /startsNewSchedule/);
assert.match(javascript, /const replacementMode = Boolean\(/);
assert.match(javascript, /courseEditor && courseRevisionMode\(\) === "replacement"/);
assert.match(javascript, /activeItems: courseEditor && !replacementMode/);
assert.match(javascript, /lockedStartDate: courseEditor && !replacementMode/);
assert.match(javascript, /revisionMode: replacementMode/);
assert.match(javascript, /state\.scheduledSessionIdsBySourceId = new Map\(\);/);
assert.match(javascript, /Start a new Schedule without/);
assert.match(javascript, /if \(!type\) throw new TypeError\("Choose a Schedule cadence\."\)/);
assert.match(javascript, /state\.activeTrackIndex = 0;\s*renderTrackSessionSelection\(\)/);
assert.match(javascript, /getOrderedSelectedTrackIds/);
assert.match(javascript, /courseChangeReason\.value\.trim\(\)/);
assert.match(javascript, /renderTrackSessionSelection\(\);\s*showStep\("session"\);/);
assert.match(javascript, /moduleItem\.collapsed \? "Maximize" : "Minimize"/);
assert.match(javascript, /if \(!state\.isInitializing\) focusCurrentStep\(stepName\)/);
assert.match(javascript, /studentTimeZone\.readOnly = true/);
assert.match(javascript, /courseEditor\?\.course\?\.studentTimeZone/);
assert.match(javascript, /courseEditor && state\.currentStep === "session" && state\.courseHierarchyActive/);
assert.match(javascript, /localStorage\.getItem\(progressStorageKey\) === null/);
assert.match(generatedJavascript, /nextModuleNumber = 1/);
assert.match(generatedHtml, /moduleColorTarget/);
assert.match(generatedHtml, /headerColorField/);
assert.match(generatedHtml, /stripeColorField/);
assert.match(generatedHtml, /addScheduleColorRuleBtn/);
assert.match(generatedHtml, /openColorTemplateBtn/);
assert.match(generatedHtml, /colorTemplateDialog/);
assert.match(generatedHtml, /difficulty-legend-item/);
assert.match(generatedHtml, />Back<\/a>/);
assert.doesNotMatch(generatedHtml, /Back to builder/);
assert.match(generatedJavascript, /style_rule_global/);
assert.match(generatedJavascript, /style_rule_title_stripe/);
assert.match(generatedJavascript, /TITLE_STRIPE_TARGET/);
assert.match(generatedJavascript, /titleStripeColor/);
assert.match(generatedJavascript, /sortScheduleStyleRules/);
assert.match(generatedJavascript, /already has a color rule/);
assert.match(generatedJavascript, /templateName/);
assert.match(generatedJavascript, /section\.dataset\.moduleId/);
assert.match(generatedJavascript, /--schedule-title-stripe-color/);
assert.doesNotMatch(html, /weekdaySelectionCount/);
assert.match(generatedJavascript, />Date<\/th>/);
assert.doesNotMatch(generatedJavascript, />End<\/th>/);
assert.match(styles, /\.schedule-color-template-dialog\s*\{[\s\S]*?inset:\s*0;[\s\S]*?margin:\s*auto;/);
assert.match(styles, /\.schedule-dialog-close\s*\{[\s\S]*?border-radius:\s*9px;/);
assert.match(styles, /\.schedule-preview-module-card\.is-drop-before::after/);
assert.match(styles, /\.schedule-preview-module-card\.is-drop-after::after/);
assert.match(styles, /\.cadence-choice-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2/);
assert.match(styles, /\.schedule-settings-grid \.input-group textarea\s*\{[\s\S]*?max-width:\s*100%/);
assert.match(styles, /border-bottom:\s*4px solid var\(--schedule-title-stripe-color\)/);
assert.match(styles, /@media print[\s\S]*?\.difficulty-legend ul\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\);/);

const colorTemplates = Array.from(
  generatedJavascript.matchAll(/\{ name: "([^"]+)", headerColor: "(#[0-9A-F]{6})", stripeColor: "(#[0-9A-F]{6})" \}/g),
  (match) => ({ name: match[1], headerColor: match[2], stripeColor: match[3] })
);
assert.deepEqual(
  colorTemplates.map((template) => template.name),
  ["Red", "Pink", "Violet", "Blue", "Cyan", "Green", "Lime", "Yellow", "Bright yellow", "Orange"]
);
function relativeLuminance(hexColor) {
  const channels = hexColor.slice(1).match(/.{2}/g).map((value) => parseInt(value, 16) / 255);
  const linearChannels = channels.map((value) => {
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return (0.2126 * linearChannels[0]) + (0.7152 * linearChannels[1]) + (0.0722 * linearChannels[2]);
}
function contrastRatio(firstColor, secondColor) {
  const first = relativeLuminance(firstColor);
  const second = relativeLuminance(secondColor);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}
colorTemplates.forEach((template) => {
  assert.ok(
    contrastRatio(template.headerColor, "#0B2810") >= 4.5,
    `${template.name} must keep the dark table text readable.`
  );
});

const tracksScriptIndex = html.indexOf("../../data/tracks-data.js");
const domainScriptIndex = html.indexOf("./schedule-domain.js");
const outlineScriptIndex = html.indexOf("./schedule-outline.js");
const generatorScriptIndex = html.indexOf("./schedule-generator.js");
assert.ok(tracksScriptIndex >= 0, "The generated track catalogue must be loaded.");
assert.ok(domainScriptIndex > tracksScriptIndex, "The schedule domain must load after the catalogue.");
assert.ok(outlineScriptIndex > domainScriptIndex, "The outline domain must load after the schedule domain.");
assert.ok(generatorScriptIndex > outlineScriptIndex, "The builder must load after the outline domain.");

await import("../src/data/tracks-data.js");
const catalog = globalThis.tracksCatalog;
assert.equal(catalog.schemaVersion, 2);
assert.ok(
  catalog.levels
    .flatMap((level) => level.subjects)
    .flatMap((subject) => subject.tracks)
    .every((track) => Object.hasOwn(track, "academicPathway")),
  "Every generated Track must expose explicit pathway metadata, including null for Regular presentation."
);

const sessions = catalog.levels
  .flatMap((level) => level.subjects)
  .flatMap((subject) => subject.tracks)
  .flatMap((track) => track.modules)
  .flatMap((module) => module.sessions);

assert.ok(sessions.length > 0, "The catalogue must contain sessions.");
assert.equal(new Set(sessions.map((session) => session.id)).size, sessions.length);

const physicsSubject = catalog.levels
  .flatMap((level) => level.subjects)
  .find((subject) => /^Physics$/i.test(subject.title));
assert.ok(physicsSubject, "The Physics catalogue must exist.");
assert.deepEqual(
  physicsSubject.tracks.map((track) => track.title),
  [
    "Mechanics",
    "Fluids and thermodynamics",
    "Waves and sound",
    "Optics",
    "Electricity and magnetism",
    "Modern, atomic, and nuclear physics"
  ]
);
assert.ok(
  physicsSubject.tracks.every((track) => track.description),
  "Every Physics track must have a card description."
);
assert.deepEqual(
  physicsSubject.tracks.map((track) => track.modules.length),
  [8, 3, 2, 4, 3, 3],
  "The original 23 Physics modules must remain nested beneath their broad tracks."
);
const physicsModules = physicsSubject.tracks.flatMap((track) => track.modules);
assert.deepEqual(
  physicsModules.map((module) => module.title.match(/^Module\s+(\d+)/i)?.[1]).filter(Boolean),
  Array.from({ length: 23 }, (_unused, index) => String(index + 1))
);
assert.equal(
  physicsModules.flatMap((module) => module.sessions).length,
  112,
  "All 112 Physics sessions must remain available after grouping."
);

const brokenLinks = [];
for (const session of sessions) {
  if (!session.planningHref) {
    brokenLinks.push(`${session.id}: missing planningHref`);
    continue;
  }

  const target = path.resolve(generatorRoot, session.planningHref);
  try {
    await fs.access(target);
  } catch (_error) {
    brokenLinks.push(`${session.id}: ${session.planningHref}`);
  }
}

assert.deepEqual(brokenLinks, [], `Broken planning links:\n${brokenLinks.join("\n")}`);
console.log(`Schedule builder integrity test passed (${sessions.length} linked sessions).`);
