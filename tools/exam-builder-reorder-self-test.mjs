import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const toolsRoot = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(toolsRoot, "..");
const examRoot = path.join(projectRoot, "src", "app", "exam-builder");
const [html, javascript, styles] = await Promise.all([
  fs.readFile(path.join(examRoot, "exam-builder.html"), "utf8"),
  fs.readFile(path.join(examRoot, "exam-builder.js"), "utf8"),
  fs.readFile(path.join(examRoot, "exam-builder.css"), "utf8")
]);

assert.match(html, /data-question-card/);
assert.match(html, /data-question-drag-handle/);
assert.match(javascript, /is-question-drop-before/);
assert.match(javascript, /is-question-drop-after/);
assert.match(javascript, /event\.clientY[\s\S]*?targetCard\.offsetHeight \/ 2/);
assert.match(javascript, /reorderQuestion\(sourceId, targetCard\.dataset\.questionId, placement\)/);
assert.match(javascript, /addEventListener\("dragleave"/);
assert.match(styles, /\.exam-builder-body \.exam-question-card\.is-question-drop-before::before\s*\{[\s\S]*?top:\s*0;/);
assert.match(styles, /\.exam-builder-body \.exam-question-card\.is-question-drop-after::after\s*\{[\s\S]*?bottom:\s*0;/);
assert.match(styles, /\.exam-builder-body \.exam-question-card\.is-question-dragging\s*\{[\s\S]*?opacity:\s*0\.45;/);

console.log("Exam builder reorder self-test passed.");
