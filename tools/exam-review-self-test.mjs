import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const toolsRoot = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(toolsRoot, "..");
const examRoot = path.join(projectRoot, "src", "app", "exam-builder");
const dashboardRoot = path.join(projectRoot, "src", "app", "dashboard");
const [html, javascript, styles, contractJavascript, adapterJavascript, dashboardHtml, dashboardJavascript] = await Promise.all([
  fs.readFile(path.join(examRoot, "exam-review.html"), "utf8"),
  fs.readFile(path.join(examRoot, "exam-review.js"), "utf8"),
  fs.readFile(path.join(examRoot, "exam-review.css"), "utf8"),
  fs.readFile(path.join(examRoot, "exam-contract.js"), "utf8"),
  fs.readFile(path.join(examRoot, "exam-adapters.js"), "utf8"),
  fs.readFile(path.join(dashboardRoot, "tutor-dashboard.html"), "utf8"),
  fs.readFile(path.join(dashboardRoot, "tutor-dashboard.js"), "utf8")
]);

assert.match(html, /Mentor and administrator tools/);
assert.match(html, /data-review-filter="pending_review"/);
assert.match(html, /data-review-filter="approved"/);
assert.match(html, /data-review-filter="changes_requested"/);
assert.match(html, /data-review-filter="rejected"/);
assert.match(html, /Public means catalog-eligible/);
assert.match(html, /<script src="\.\/exam-contract\.js[^>]*><\/script>[\s\S]*?<script src="\.\/exam-adapters\.js[^>]*><\/script>[\s\S]*?<script src="\.\/exam-review\.js/);
assert.doesNotMatch(html, /contenteditable|data-field="prompt"|data-question-card/);

assert.match(javascript, /requireCapability\(\["exam\.review"\]\)/);
assert.doesNotMatch(javascript, /rawRole|REVIEWER_ROLES/);
assert.match(javascript, /state\.adapters\.reviews\.list\(\{ reviewStatus: state\.filter \}\)/);
assert.match(javascript, /state\.adapters\.reviews\.history\(\{ examId: selectedId \}\)/);
assert.match(javascript, /state\.adapters\.reviews\.decide\(reviewedExamId, \{ decision: normalized, notes \}\)/);
assert.match(javascript, /normalized !== "approved" && !notes/);
assert.match(javascript, /provider !== "supabase"/);
assert.match(javascript, /readOnlyContent: true/);
assert.match(javascript, /function escapeHTML/);
assert.match(javascript, /Stable question ID/);
assert.match(javascript, /Answer key/);
assert.match(javascript, /Media/);
assert.match(styles, /@media \(max-width: 1020px\)/);
assert.match(styles, /\.exam-review-workspace\s*\{[\s\S]*?grid-template-columns:/);

assert.match(dashboardHtml, /id="exam-review-workspace-link" hidden/);
assert.match(dashboardJavascript, /current\.can\('exam\.review'\)/);

class FakeClassList {
  constructor() {
    this.values = new Set();
  }

  toggle(name, force) {
    const shouldAdd = force === undefined ? !this.values.has(name) : Boolean(force);
    if (shouldAdd) this.values.add(name);
    else this.values.delete(name);
    return shouldAdd;
  }
}

class FakeElement {
  constructor(id = "") {
    this.id = id;
    this.innerHTML = "";
    this.textContent = "";
    this.value = "";
    this.disabled = false;
    this.dataset = {};
    this.attributes = new Map();
    this.classList = new FakeClassList();
    this.listeners = new Map();
    this.focused = false;
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  dispatch(type, event) {
    for (const listener of this.listeners.get(type) || []) listener(event);
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  querySelectorAll() {
    return [];
  }

  focus() {
    this.focused = true;
  }
}

const elementIds = [
  "reviewProvider",
  "refreshReviewsBtn",
  "reviewMessage",
  "reviewQueueCount",
  "reviewQueue",
  "reviewDetail",
  "reviewDecisionNotes"
];
const elements = new Map(elementIds.map((id) => [id, new FakeElement(id)]));
const filters = ["pending_review", "approved", "changes_requested", "rejected"].map((status) => {
  const button = new FakeElement(`filter-${status}`);
  button.dataset.reviewFilter = status;
  return button;
});
const document = {
  getElementById(id) {
    if (!elements.has(id)) elements.set(id, new FakeElement(id));
    return elements.get(id);
  },
  querySelectorAll(selector) {
    return selector === "[data-review-filter]" ? filters : [];
  }
};

const storageValues = new Map();
const localStorage = {
  getItem(key) {
    return storageValues.has(key) ? storageValues.get(key) : null;
  },
  setItem(key, value) {
    storageValues.set(key, String(value));
  }
};

let generatedId = 0;
const context = {
  console,
  structuredClone,
  document,
  localStorage,
  location: {
    protocol: "file:",
    replace() {
      throw new Error("The local review sandbox should not redirect.");
    }
  },
  confirm() {
    return true;
  },
  crypto: {
    randomUUID() {
      generatedId += 1;
      return `00000000-0000-4000-8000-${String(generatedId).padStart(12, "0")}`;
    }
  }
};
context.window = context;
context.globalThis = context;
vm.createContext(context);
vm.runInContext(contractJavascript, context);
vm.runInContext(adapterJavascript, context);

const definition = {
  schema: context.KelpExamContract.DEFINITION_SCHEMA,
  id: "exam-review-test",
  title: "Review <script> test",
  madeBy: "tutor-review-owner",
  subject: "Algebra",
  instructions: "Show your work.",
  durationMinutes: 40,
  createdAt: "2026-07-18T10:00:00.000Z",
  updatedAt: "2026-07-18T10:00:00.000Z",
  questions: [{
    id: "question-review-test",
    name: "Linear equation",
    type: "multiple-choice",
    prompt: "Solve <unsafe> $x + 2 = 5$.",
    points: 2,
    difficulty: "easy",
    classificationStatus: "proposed",
    options: ["$x=1$", "$x=3$"],
    correctOptionIndex: 1,
    correctOptionIndexes: [1],
    optionImages: ["", ""],
    optionGraphs: [null, null],
    graph: null,
    imageData: ""
  }]
};
const seedAdapters = context.KelpExamAdapters.createLocalAdapters();
await seedAdapters.exams.save(context.KelpExamContract.buildPersistenceBundle(definition));
await seedAdapters.exams.submitForReview(definition.id);
context.KelpExamProviderReady = Promise.resolve(null);

vm.runInContext(javascript, context);
const settle = async () => {
  for (let index = 0; index < 4; index += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
};
await settle();

assert.equal(elements.get("reviewProvider").textContent, "Local review sandbox");
assert.match(elements.get("reviewQueue").innerHTML, /Review &lt;script&gt; test/);
assert.doesNotMatch(elements.get("reviewQueue").innerHTML, /<script>/);
assert.equal(elements.get("reviewQueueCount").textContent, "1");

elements.get("reviewQueue").dispatch("click", {
  target: {
    closest(selector) {
      return selector === "[data-review-exam-id]"
        ? { dataset: { reviewExamId: definition.id } }
        : null;
    }
  }
});
await settle();
assert.match(elements.get("reviewDetail").innerHTML, /Record a review decision/);
assert.match(elements.get("reviewDetail").innerHTML, /Stable question ID/);
assert.match(elements.get("reviewDetail").innerHTML, /Solve &lt;unsafe&gt;/);
assert.match(elements.get("reviewDetail").innerHTML, /B\. \$x=3\$/);

elements.get("reviewDetail").dispatch("click", {
  target: {
    closest(selector) {
      return selector === "[data-review-decision]"
        ? { dataset: { reviewDecision: "rejected" } }
        : null;
    }
  }
});
assert.match(elements.get("reviewMessage").textContent, /Add review notes/);
assert.equal((await seedAdapters.reviews.history({ examId: definition.id })).length, 0);

elements.get("reviewDecisionNotes").value = "The classification and answer key are correct.";
elements.get("reviewDetail").dispatch("click", {
  target: {
    closest(selector) {
      return selector === "[data-review-decision]"
        ? { dataset: { reviewDecision: "approved" } }
        : null;
    }
  }
});
await settle();
const approved = await seedAdapters.reviews.list({ reviewStatus: "approved" });
assert.equal(approved.length, 1);
assert.equal(approved[0].visibility, "public");
assert.equal(approved[0].definition.questions[0].classificationStatus, "reviewed");
assert.equal((await seedAdapters.reviews.history({ examId: definition.id })).length, 1);
assert.equal(elements.get("reviewQueueCount").textContent, "0");

console.log("Exam review page access, rendering, decision, and audit-history self-test passed.");
