import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const OUTPUT = resolve(
  process.cwd(),
  "data/whiteboards/pilots/physics/chapter-01-what-is-physics/openstax-physics-ch01-lesson.excalidraw",
);
const SCENE_NAMESPACE = "openstax-physics-ch01";

const FRAME_W = 1123;
const FRAME_H = 794;
const GAP_X = 90;
const GAP_Y = 110;
const MARGIN = 36;
const HEADER_Y = 84;
const CONTENT_BOTTOM = 746;
const COLORS = {
  canvas: "#f7fbfa",
  white: "#ffffff",
  ink: "#212121",
  muted: "#5d6f6c",
  border: "#cfded9",
  borderSoft: "#e5ece8",
  teal: "#007f91",
  tealDark: "#135d66",
  ocean: "#dff4f5",
  kelp: "#dcefdc",
  coral: "#f8deda",
  orchid: "#eadff5",
  sunrise: "#f8e3bd",
  slate: "#dfe8ed",
  green: "#72b77e",
  yellow: "#d6a92f",
  red: "#d86565",
};

const elements = [];
const frameBackgrounds = [];
const frames = [];
const contentElements = [];
const frameRecords = [];
let activeFrame = null;

function hash32(value) {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function idFor(key) {
  const scopedKey = SCENE_NAMESPACE + ":" + key;
  return ("ch01_" + key.replace(/[^a-zA-Z0-9_-]/g, "_") + "_" + hash32(scopedKey).toString(36)).slice(0, 64);
}

function groupFor(key) {
  return "grp_" + idFor(key);
}

function base(type, key, x, y, width, height, options = {}) {
  const seed = hash32("seed:" + key) || 1;
  return {
    id: idFor(key),
    type,
    x,
    y,
    width,
    height,
    angle: 0,
    strokeColor: options.strokeColor ?? COLORS.ink,
    backgroundColor: options.backgroundColor ?? "transparent",
    fillStyle: "solid",
    strokeWidth: options.strokeWidth ?? 1,
    strokeStyle: options.strokeStyle ?? "solid",
    roughness: options.roughness ?? 0,
    opacity: options.opacity ?? 100,
    groupIds: options.groupIds ?? [],
    frameId: options.frameId ?? activeFrame?.id ?? null,
    index: null,
    roundness: options.roundness === false ? null : { type: 3 },
    seed,
    version: 1,
    versionNonce: (seed ^ 0x9e3779b9) >>> 0,
    isDeleted: false,
    boundElements: options.boundElements ?? [],
    updated: 1,
    link: null,
    locked: options.locked ?? false,
    customData: options.customData,
  };
}

function push(element, layer = "content") {
  if (layer === "background") frameBackgrounds.push(element);
  else if (layer === "frame") frames.push(element);
  else {
    // Every visible lesson object is template content. Tutors must be able to
    // select, move, edit, and delete it; only managed backgrounds stay locked.
    element.locked = false;
    contentElements.push(element);
  }
  return element;
}

function rect(key, x, y, width, height, options = {}) {
  return push(base("rectangle", key, x, y, width, height, options), options.layer);
}

function ellipse(key, x, y, width, height, options = {}) {
  return push(base("ellipse", key, x, y, width, height, options), options.layer);
}

function line(key, x, y, dx, dy, options = {}) {
  const element = base("line", key, x, y, Math.abs(dx), Math.abs(dy), {
    ...options,
    roundness: false,
  });
  element.points = [[0, 0], [dx, dy]];
  element.lastCommittedPoint = null;
  element.startBinding = null;
  element.endBinding = null;
  element.startArrowhead = null;
  element.endArrowhead = null;
  return push(element);
}

function arrow(key, x, y, dx, dy, options = {}) {
  const element = base("arrow", key, x, y, Math.abs(dx), Math.abs(dy), {
    ...options,
    roundness: false,
  });
  element.points = [[0, 0], [dx, dy]];
  element.lastCommittedPoint = null;
  element.startBinding = options.startBinding ?? null;
  element.endBinding = options.endBinding ?? null;
  element.startArrowhead = options.startArrowhead ?? null;
  element.endArrowhead = options.endArrowhead ?? "arrow";
  element.elbowed = false;
  return push(element);
}

function wrapText(value, maxChars) {
  if (!maxChars) return value;
  return value
    .split("\n")
    .map((paragraph) => {
      const words = paragraph.split(/\s+/).filter(Boolean);
      const lines = [];
      let current = "";
      for (const word of words) {
        const candidate = current ? current + " " + word : word;
        if (current && candidate.length > maxChars) {
          lines.push(current);
          current = word;
        } else {
          current = candidate;
        }
      }
      if (current) lines.push(current);
      return lines.join("\n");
    })
    .join("\n");
}

function text(key, value, x, y, options = {}) {
  const fontSize = options.fontSize ?? 18;
  const fontFamily = options.fontFamily ?? 2;
  const lineHeight = options.lineHeight ?? 1.25;
  const rendered = wrapText(value, options.maxChars);
  const lines = rendered.split("\n");
  const naturalWidth = Math.max(...lines.map((item) => item.length), 1) * fontSize * 0.64 + 4;
  const width = options.width ?? options.maxWidth ?? Math.max(20, naturalWidth);
  const height = options.height ?? lines.length * fontSize * lineHeight;
  const element = base("text", key, x, y, width, height, {
    strokeColor: options.color ?? COLORS.ink,
    backgroundColor: "transparent",
    strokeWidth: 1,
    roughness: 0,
    roundness: false,
    groupIds: options.groupIds,
    frameId: options.frameId,
    locked: options.locked,
    customData: options.customData,
  });
  Object.assign(element, {
    fontSize,
    fontFamily,
    text: rendered,
    textAlign: options.textAlign ?? "left",
    verticalAlign: options.verticalAlign ?? "top",
    containerId: null,
    originalText: rendered,
    autoResize: options.autoResize ?? !(options.width || options.maxWidth),
    lineHeight,
  });
  return push(element);
}

function frameOrigin(index) {
  return {
    x: (index % 5) * (FRAME_W + GAP_X),
    y: Math.floor(index / 5) * (FRAME_H + GAP_Y),
  };
}

function beginFrame(index, slug, title, subtitle, accent = COLORS.teal) {
  const origin = frameOrigin(index);
  const frameId = idFor("frame:" + slug);
  const backgroundId = idFor("frame-bg:" + slug);
  activeFrame = { id: frameId, slug, index, ...origin };

  const background = base("rectangle", "frame-bg-base:" + slug, origin.x, origin.y, FRAME_W, FRAME_H, {
    strokeColor: COLORS.borderSoft,
    backgroundColor: COLORS.white,
    strokeWidth: 1,
    roughness: 0,
    roundness: false,
    frameId: null,
    locked: true,
    customData: {
      kelpFrameBackgroundFor: { version: 1, frameId, color: COLORS.white },
    },
  });
  background.id = backgroundId;
  push(background, "background");

  const frame = base("frame", "frame-base:" + slug, origin.x, origin.y, FRAME_W, FRAME_H, {
    strokeColor: COLORS.borderSoft,
    backgroundColor: "transparent",
    strokeWidth: 1,
    roughness: 0,
    roundness: false,
    frameId: null,
    locked: false,
    customData: {
      kelpFrameTemplate: { version: 1, id: "custom", locked: false },
      kelpFrameBackground: { version: 1, elementId: backgroundId, color: COLORS.white },
      kelpGridLayer: { version: 1, placement: "behind" },
      kelpLessonFrame: { version: 1, order: index + 1, slug },
    },
  });
  frame.id = frameId;
  const shortFrameNames = {
    explore: "Explore",
    scope: "Scope",
    methods: "Methods",
    units: "Units",
    measurement: "Measurement",
    "true-false": "True / False",
    "multiple-choice-a": "Multiple choice A",
    "multiple-choice-b": "Multiple choice B",
    "multiple-choice-c": "Multiple choice C",
    "multiple-choice-d": "Multiple choice D",
    "open-response": "Open response",
    quantitative: "Quantitative",
    exit: "Exit ticket",
  };
  frame.name = String(index + 1).padStart(2, "0") + " · " + (shortFrameNames[slug] ?? title);
  push(frame, "frame");

  const ox = origin.x;
  const oy = origin.y;
  const headerGroupIds = [groupFor(slug + ":header")];
  const footerGroupIds = [groupFor(slug + ":footer")];
  rect(slug + ":accent", ox, oy, 11, FRAME_H, {
    strokeColor: accent,
    backgroundColor: accent,
    locked: true,
    roundness: false,
  });
  text(slug + ":eyebrow", String(index + 1).padStart(2, "0") + "  •  OPENSTAX PHYSICS · CHAPTER 1", ox + MARGIN, oy + 22, {
    fontSize: 12,
    color: COLORS.tealDark,
    groupIds: headerGroupIds,
  });
  text(slug + ":title", title, ox + MARGIN, oy + 41, {
    fontSize: 27,
    color: COLORS.ink,
    groupIds: headerGroupIds,
  });
  text(slug + ":subtitle", subtitle, ox + MARGIN, oy + 76, {
    fontSize: 14,
    color: COLORS.muted,
    groupIds: headerGroupIds,
    maxChars: 95,
  });
  line(slug + ":header-rule", ox + MARGIN, oy + 110, FRAME_W - MARGIN * 2, 0, {
    strokeColor: COLORS.borderSoft,
    groupIds: headerGroupIds,
  });

  const attribution = "Adapted from Physics, Ch. 1, P. P. Urone & R. Hinrichs, OpenStax, © 2020 TEA  |  CC BY 4.0";
  line(slug + ":footer-rule", ox + MARGIN, oy + 754, FRAME_W - MARGIN * 2, 0, {
    strokeColor: COLORS.borderSoft,
    groupIds: footerGroupIds,
  });
  text(slug + ":footer", attribution, ox + MARGIN, oy + 765, {
    fontSize: 10,
    color: COLORS.muted,
    groupIds: footerGroupIds,
  });

  frameRecords.push({ slug, frameId, backgroundId, ...origin });
  return { x: ox, y: oy };
}

function pill(key, label, x, y, fill, options = {}) {
  const groupIds = options.groupIds ?? [groupFor(key)];
  const width = options.width ?? Math.max(76, label.length * 7.2 + 24);
  rect(key + ":shape", x, y, width, 28, {
    strokeColor: options.strokeColor ?? fill,
    backgroundColor: fill,
    groupIds,
    locked: options.locked,
  });
  text(key + ":label", label, x + 12, y + 6, {
    fontSize: 11,
    color: options.color ?? COLORS.tealDark,
    width: width - 24,
    maxChars: label.length,
    groupIds,
    locked: options.locked,
  });
  return width;
}

function card(key, x, y, width, height, titleValue, bodyValue, options = {}) {
  const groupIds = options.groupIds ?? [groupFor(key)];
  rect(key + ":shape", x, y, width, height, {
    strokeColor: options.strokeColor ?? COLORS.border,
    backgroundColor: options.fill ?? COLORS.white,
    strokeWidth: options.strokeWidth ?? 1,
    groupIds,
    locked: options.locked ?? false,
  });
  if (options.tag) {
    pill(key + ":tag", options.tag, x + 18, y + 16, options.tagFill ?? COLORS.ocean, {
      groupIds,
      width: options.tagWidth,
      locked: options.locked,
    });
  }
  const titleY = y + (options.tag ? 54 : 18);
  const titleElement = text(key + ":title", titleValue, x + 18, titleY, {
    fontSize: options.titleSize ?? 18,
    color: options.titleColor ?? COLORS.ink,
    maxChars: options.titleChars ?? Math.floor((width - 36) / 10),
    maxWidth: width - 36,
    groupIds,
    locked: options.locked,
  });
  if (bodyValue) {
    text(key + ":body", bodyValue, x + 18, titleY + titleElement.height + (options.bodyGap ?? 9), {
      fontSize: options.bodySize ?? 14,
      color: options.bodyColor ?? COLORS.muted,
      maxChars: options.bodyChars ?? Math.floor((width - 36) / 7.4),
      maxWidth: width - 36,
      lineHeight: options.lineHeight ?? 1.3,
      groupIds,
      locked: options.locked,
    });
  }
  return groupIds[0];
}

function edgePort(box, side, offset = 0, gap = 18) {
  if (side === "left") return { x: box.x - gap, y: box.y + box.h / 2 + offset };
  if (side === "right") return { x: box.x + box.w + gap, y: box.y + box.h / 2 + offset };
  if (side === "top") return { x: box.x + box.w / 2 + offset, y: box.y - gap };
  return { x: box.x + box.w / 2 + offset, y: box.y + box.h + gap };
}

function registerBoundArrow(elementId, arrowId) {
  const element = contentElements.find((candidate) => candidate.id === elementId);
  if (!element) return;
  element.boundElements = [...(element.boundElements ?? []), { id: arrowId, type: "arrow" }];
}

function boundArrow(key, from, to, options = {}) {
  const gap = options.gap ?? 18;
  const fromSide = options.fromSide ?? "right";
  const toSide = options.toSide ?? "left";
  const start = edgePort(from, fromSide, options.fromOffset ?? 0, gap);
  const end = edgePort(to, toSide, options.toOffset ?? 0, gap);
  const connector = arrow(key, start.x, start.y, end.x - start.x, end.y - start.y, {
    strokeColor: options.color ?? COLORS.teal,
    strokeWidth: options.strokeWidth ?? 2,
    locked: options.locked ?? true,
    startBinding: { elementId: from.id, focus: 0, gap },
    endBinding: { elementId: to.id, focus: 0, gap },
  });
  registerBoundArrow(from.id, connector.id);
  registerBoundArrow(to.id, connector.id);
  return connector;
}

function difficultyMark(key, level, x, y, groupIds) {
  const map = {
    introductory: [COLORS.green, "INTRO"],
    intermediate: [COLORS.yellow, "INTERMEDIATE"],
    challenging: [COLORS.red, "CHALLENGE"],
  };
  const [color, label] = map[level];
  ellipse(key + ":dot", x, y + 7, 10, 10, {
    strokeColor: color,
    backgroundColor: color,
    groupIds,
  });
  text(key + ":label", label, x + 16, y + 3, {
    fontSize: 10,
    color,
    groupIds,
  });
}

function questionCard(key, x, y, width, height, number, prompt, options = {}) {
  const groupIds = [groupFor(key)];
  rect(key + ":shape", x, y, width, height, {
    strokeColor: options.strokeColor ?? COLORS.border,
    backgroundColor: options.fill ?? COLORS.white,
    groupIds,
    customData: {
      kelpQuestion: {
        version: 1,
        kind: options.kind,
        ordinal: number,
        sourceRef: options.sourceRef ?? null,
        difficulty: options.difficulty,
        answer: options.answer ?? null,
      },
    },
  });
  difficultyMark(key + ":difficulty", options.difficulty, x + 16, y + 13, groupIds);
  text(key + ":number", String(number).padStart(2, "0"), x + width - 43, y + 12, {
    fontSize: 12,
    color: COLORS.tealDark,
    groupIds,
  });
  if (options.sourceRef) {
    text(key + ":source", options.sourceRef, x + 16, y + 35, {
      fontSize: 10,
      color: COLORS.muted,
      groupIds,
      maxChars: 46,
    });
  }
  text(key + ":prompt", prompt, x + 16, y + (options.sourceRef ? 58 : 42), {
    fontSize: options.promptSize ?? 14,
    color: COLORS.ink,
    groupIds,
    maxChars: options.promptChars ?? Math.floor((width - 32) / 7.5),
    maxWidth: width - 32,
    lineHeight: 1.3,
  });
  if (options.choices?.length) {
    text(key + ":choices", options.choices.map((choice, index) => "ABCD"[index] + ". " + choice).join("\n"), x + 20, y + (options.choicesY ?? 117), {
      fontSize: options.choiceSize ?? 12,
      color: COLORS.muted,
      groupIds,
      maxChars: options.choiceChars ?? Math.floor((width - 40) / 6.6),
      maxWidth: width - 40,
      lineHeight: 1.3,
    });
  }
  if (options.answerLine) {
    line(key + ":answer", x + 16, y + height - 28, width - 32, 0, {
      strokeColor: COLORS.border,
      groupIds,
    });
  }
}

function sortingCard(key, x, y, width, height, number, prompt, difficulty, answer, fill) {
  const groupIds = [groupFor(key)];
  rect(key + ":shape", x, y, width, height, {
    strokeColor: COLORS.border,
    backgroundColor: fill,
    groupIds,
    customData: {
      kelpQuestion: {
        version: 1,
        kind: "true-false",
        ordinal: number,
        sourceRef: null,
        difficulty,
        answer,
        interaction: "drag-to-zone",
      },
    },
  });
  difficultyMark(key + ":difficulty", difficulty, x + 15, y + 11, groupIds);
  text(key + ":number", String(number).padStart(2, "0"), x + width - 39, y + 12, {
    fontSize: 11,
    color: COLORS.tealDark,
    width: 24,
    groupIds,
  });
  text(key + ":prompt", prompt, x + 15, y + 39, {
    fontSize: 13,
    color: COLORS.ink,
    groupIds,
    maxChars: Math.floor((width - 24) / 8.3),
    maxWidth: width - 24,
    lineHeight: 1.25,
    customData: {
      kelpCardText: { version: 1, role: "prompt" },
    },
  });
}

function dropZone(key, x, y, width, height, label, hint, fill, strokeColor) {
  const groupIds = [groupFor(key)];
  rect(key + ":shape", x, y, width, height, {
    strokeColor,
    backgroundColor: fill,
    strokeWidth: 2,
    strokeStyle: "dashed",
    groupIds,
    customData: {
      kelpDropZone: { version: 1, value: label.toLowerCase() },
    },
  });
  text(key + ":label", label, x + 22, y + 20, {
    fontSize: 26,
    color: strokeColor,
    width: width - 44,
    groupIds,
  });
  text(key + ":hint", hint, x + 22, y + 58, {
    fontSize: 12,
    color: COLORS.muted,
    width: width - 44,
    groupIds,
  });
  line(key + ":rule", x + 22, y + 91, width - 44, 0, {
    strokeColor,
    opacity: 35,
    groupIds,
  });
}

function bigIdea(key, x, y, width, label, body, fill = COLORS.ocean) {
  const groupIds = [groupFor(key)];
  rect(key + ":shape", x, y, width, 88, {
    strokeColor: fill,
    backgroundColor: fill,
    groupIds,
  });
  text(key + ":label", label, x + 18, y + 13, {
    fontSize: 11,
    color: COLORS.tealDark,
    groupIds,
  });
  text(key + ":body", body, x + 18, y + 35, {
    fontSize: 15,
    color: COLORS.ink,
    maxChars: Math.floor((width - 36) / 8),
    maxWidth: width - 36,
    groupIds,
  });
}

// 01 — Exploration
{
  const { x, y } = beginFrame(
    0,
    "explore",
    "What counts as physics?",
    "Move the evidence cards. Build a shared definition before revealing the chapter language.",
    COLORS.teal,
  );
  const evidence = [
    ["traffic", "Traffic flow", "motion · forces · systems", COLORS.ocean],
    ["phone", "A phone screen", "electricity · light · materials", COLORS.orchid],
    ["music", "A guitar string", "waves · vibration · energy", COLORS.sunrise],
    ["stars", "Orbiting planets", "gravity · motion · scale", COLORS.slate],
    ["medicine", "Medical imaging", "waves · atoms · technology", COLORS.coral],
    ["climate", "Earth’s climate", "energy transfer · fluids", COLORS.kelp],
  ];
  evidence.forEach(([slug, titleValue, bodyValue, fill], index) => {
    const column = index % 3;
    const row = Math.floor(index / 3);
    card(
      "explore:evidence:" + slug,
      x + 36 + column * 216,
      y + 136 + row * 133,
      196,
      112,
      titleValue,
      bodyValue,
      { fill, titleSize: 16, bodySize: 12, bodyChars: 22 },
    );
  });
  card("explore:bucket:physics", x + 706, y + 138, 175, 270, "Physics helps explain it", "Drop cards here.\n\nWhat changes?\nWhat interacts?\nWhat can we measure?", {
    fill: "#f8fcfc",
    strokeColor: COLORS.teal,
    tag: "YES / HOW?",
    tagFill: COLORS.ocean,
    tagWidth: 92,
    titleSize: 16,
    locked: true,
  });
  card("explore:bucket:notyet", x + 900, y + 138, 175, 270, "Not sure yet", "Park a card here.\n\nWhat evidence would help us decide?", {
    fill: "#fcfbfe",
    strokeColor: "#aa8fc5",
    tag: "QUESTION",
    tagFill: COLORS.orchid,
    tagWidth: 82,
    titleSize: 16,
    locked: true,
  });
  bigIdea("explore:definition", x + 36, y + 430, 1051, "OUR WORKING DEFINITION", "Physics studies matter, energy, space, time—and the interactions that connect them.", COLORS.kelp);
}

// 02 — Scope
{
  const { x, y } = beginFrame(
    1,
    "scope",
    "Physics: scope, scales, and applications",
    "A compact map of section 1.1. Each concept card is an independent movable group.",
    "#6f61a8",
  );
  const center = { id: idFor("scope:center:shape"), x: x + 399, y: y + 145, w: 325, h: 115 };
  card("scope:center", center.x, center.y, center.w, center.h, "PHYSICS", "Patterns in matter, energy, space, time, and their interactions.", {
    fill: COLORS.ocean,
    strokeColor: COLORS.teal,
    titleSize: 24,
    titleColor: COLORS.tealDark,
    bodySize: 14,
  });
  const nodes = [
    ["classical", x + 52, y + 330, 300, 132, "Classical physics", "Everyday sizes and speeds; weak gravity. Mechanics, thermodynamics, waves, optics, electricity.", COLORS.kelp],
    ["modern", x + 771, y + 330, 300, 132, "Modern physics", "Relativity and quantum theory become essential at extreme speeds, scales, or gravity.", COLORS.orchid],
    ["models", x + 52, y + 540, 300, 132, "Models and measurement", "Turn observations into quantities, relationships, predictions, and testable explanations.", COLORS.sunrise],
    ["applications", x + 771, y + 540, 300, 132, "Connected sciences", "Physics supports chemistry, biology, earth science, engineering, and medicine.", COLORS.coral],
  ];
  const boxes = {};
  nodes.forEach(([slug, bx, by, bw, bh, titleValue, bodyValue, fill]) => {
    card("scope:" + slug, bx, by, bw, bh, titleValue, bodyValue, {
      fill,
      titleSize: 18,
      bodySize: 13,
      bodyChars: 34,
    });
    boxes[slug] = { id: idFor("scope:" + slug + ":shape"), x: bx, y: by, w: bw, h: bh };
  });
  boundArrow("scope:arrow:classical", center, boxes.classical, {
    fromSide: "bottom",
    toSide: "top",
    fromOffset: -88,
    gap: 18,
  });
  boundArrow("scope:arrow:modern", center, boxes.modern, {
    fromSide: "bottom",
    toSide: "top",
    fromOffset: 88,
    gap: 18,
  });
  boundArrow("scope:arrow:models", boxes.classical, boxes.models, {
    fromSide: "bottom",
    toSide: "top",
    gap: 18,
  });
  boundArrow("scope:arrow:applications", boxes.modern, boxes.applications, {
    fromSide: "bottom",
    toSide: "top",
    gap: 18,
  });
  bigIdea("scope:scale-check", x + 399, y + 360, 325, "CHOOSE THE TOOLKIT", "Ask: What is the scale? How fast? How strong is gravity?", COLORS.slate);
}

// 03 — Scientific methods
{
  const { x, y } = beginFrame(
    2,
    "methods",
    "Scientific methods: evidence → explanation",
    "Section 1.2 as a flexible cycle, not a single rigid recipe.",
    "#db7f5d",
  );
  const flow = [
    ["observe", "Observe", "Notice a pattern or problem", COLORS.ocean],
    ["question", "Question", "Make the unknown precise", COLORS.sunrise],
    ["hypothesis", "Hypothesis", "Propose a testable explanation", COLORS.orchid],
    ["test", "Test", "Collect and analyze evidence", COLORS.kelp],
    ["revise", "Revise", "Keep, change, or reject the idea", COLORS.coral],
  ];
  const flowBoxes = [];
  flow.forEach(([slug, titleValue, bodyValue, fill], index) => {
    const bx = x + 36 + index * 219;
    const by = y + 148;
    card("methods:flow:" + slug, bx, by, 172, 120, titleValue, bodyValue, {
      fill,
      tag: String(index + 1),
      tagFill: COLORS.white,
      tagWidth: 35,
      titleSize: 17,
      bodySize: 12,
    });
    flowBoxes.push({ id: idFor("methods:flow:" + slug + ":shape"), x: bx, y: by, w: 172, h: 120 });
    if (index > 0) boundArrow("methods:flow-arrow:" + index, flowBoxes[index - 1], flowBoxes[index], {
      color: COLORS.tealDark,
      fromSide: "right",
      toSide: "left",
      gap: 14,
    });
  });
  const concepts = [
    ["model", "Model", "A simplified representation used to reason and predict.", COLORS.slate],
    ["theory", "Scientific theory", "A well-supported explanation with broad predictive power.", COLORS.ocean],
    ["law", "Scientific law", "A concise description of a reliably observed relationship.", COLORS.kelp],
  ];
  concepts.forEach(([slug, titleValue, bodyValue, fill], index) => {
    card("methods:concept:" + slug, x + 36 + index * 352, y + 315, 326, 132, titleValue, bodyValue, {
      fill,
      titleSize: 18,
      bodySize: 13,
    });
  });
  bigIdea("methods:not-linear", x + 36, y + 485, 1051, "IMPORTANT", "Evidence can send us backward. A method is a disciplined loop, not a staircase.", COLORS.coral);
}

// 04 — Quantities and units
{
  const { x, y } = beginFrame(
    3,
    "units",
    "The language of physics: quantities and SI units",
    "Section 1.3 toolkit: measure, write, estimate, and convert.",
    COLORS.teal,
  );
  const tableX = x + 36;
  const tableY = y + 142;
  const tableGroupIds = [groupFor("units:table")];
  rect("units:table", tableX, tableY, 470, 260, {
    strokeColor: COLORS.border,
    backgroundColor: "#fbfdfc",
    groupIds: tableGroupIds,
  });
  text("units:table:title", "SI BASE QUANTITIES USED MOST OFTEN", tableX + 18, tableY + 16, {
    fontSize: 12,
    color: COLORS.tealDark,
    groupIds: tableGroupIds,
  });
  [
    ["Quantity", "Unit", "Symbol"],
    ["length", "meter", "m"],
    ["mass", "kilogram", "kg"],
    ["time", "second", "s"],
    ["electric current", "ampere", "A"],
    ["temperature", "kelvin", "K"],
  ].forEach((row, rowIndex) => {
    const yy = tableY + 51 + rowIndex * 32;
    if (rowIndex === 0) {
      rect("units:table:head", tableX + 12, yy - 5, 446, 29, {
        strokeColor: COLORS.ocean,
        backgroundColor: COLORS.ocean,
        groupIds: tableGroupIds,
      });
    }
    text("units:cell:" + rowIndex + ":0", row[0], tableX + 22, yy, { fontSize: 12, groupIds: tableGroupIds });
    text("units:cell:" + rowIndex + ":1", row[1], tableX + 208, yy, { fontSize: 12, groupIds: tableGroupIds });
    text("units:cell:" + rowIndex + ":2", row[2], tableX + 385, yy, { fontSize: 12, groupIds: tableGroupIds });
  });
  card("units:notation", x + 538, y + 142, 249, 124, "Scientific notation", "6,500,000 m = 6.5 × 10⁶ m\n0.00042 s = 4.2 × 10⁻⁴ s", {
    fill: COLORS.orchid,
    titleSize: 18,
    bodySize: 14,
  });
  card("units:prefix", x + 814, y + 142, 273, 124, "Prefixes carry scale", "kilo = 10³\ncenti = 10⁻²\nmilli = 10⁻³\nmicro = 10⁻⁶", {
    fill: COLORS.sunrise,
    titleSize: 18,
    bodySize: 13,
  });
  card("units:conversion", x + 538, y + 292, 549, 110, "Unit conversion = multiply by 1", "80 km/h × (1000 m / 1 km) × (1 h / 3600 s) = 22.2 m/s", {
    fill: COLORS.kelp,
    titleSize: 18,
    bodySize: 15,
  });
  const conversionSteps = [
    ["given", "80 km/h", COLORS.ocean],
    ["cancel", "cancel km and h", COLORS.coral],
    ["result", "22.2 m/s", COLORS.kelp],
  ];
  conversionSteps.forEach(([slug, titleValue, fill], index) => {
    card("units:step:" + slug, x + 36 + index * 250, y + 463, 218, 86, titleValue, index === 1 ? "Use conversion factors" : "", {
      fill,
      titleSize: 16,
      bodySize: 12,
    });
    if (index > 0) {
      arrow("units:step-arrow:" + index, x + 256 + (index - 1) * 250, y + 505, 27, 0, {
        strokeColor: COLORS.teal,
        strokeWidth: 2,
        locked: true,
      });
    }
  });
  bigIdea("units:estimate", x + 788, y + 463, 299, "ESTIMATE FIRST", "Should the converted value be larger or smaller?", COLORS.slate);
}

// 05 — Measurement quality
{
  const { x, y } = beginFrame(
    4,
    "measurement",
    "Measurement quality and graph language",
    "Accuracy, precision, uncertainty, significant figures, variables, and slope.",
    "#6f61a8",
  );
  card("measurement:accuracy", x + 36, y + 140, 245, 160, "Accuracy", "How close a result is to the accepted or target value.", {
    fill: COLORS.kelp,
    tag: "TARGET",
    tagFill: COLORS.white,
    tagWidth: 68,
  });
  card("measurement:precision", x + 300, y + 140, 245, 160, "Precision", "How closely repeated measurements agree with one another.", {
    fill: COLORS.ocean,
    tag: "REPEAT",
    tagFill: COLORS.white,
    tagWidth: 70,
  });
  card("measurement:uncertainty", x + 564, y + 140, 245, 160, "Uncertainty", "A stated range that communicates the limit of a measurement.", {
    fill: COLORS.sunrise,
    tag: "± RANGE",
    tagFill: COLORS.white,
    tagWidth: 72,
  });
  card("measurement:sigfig", x + 828, y + 140, 259, 160, "Significant figures", "Digits justified by the measurement and its uncertainty.", {
    fill: COLORS.coral,
    tag: "REPORT",
    tagFill: COLORS.white,
    tagWidth: 68,
  });

  const gx = x + 54;
  const gy = y + 335;
  const graphGroupIds = [groupFor("measurement:graph")];
  line("measurement:axis-y", gx, gy + 205, 0, -190, { strokeColor: COLORS.ink, strokeWidth: 2, groupIds: graphGroupIds });
  line("measurement:axis-x", gx, gy + 205, 420, 0, { strokeColor: COLORS.ink, strokeWidth: 2, groupIds: graphGroupIds });
  text("measurement:y-label", "dependent variable (y)", gx - 8, gy - 5, { fontSize: 11, color: COLORS.muted, groupIds: graphGroupIds });
  text("measurement:x-label", "independent variable (x)", gx + 257, gy + 218, { fontSize: 11, color: COLORS.muted, groupIds: graphGroupIds });
  line("measurement:trend", gx + 38, gy + 174, 330, -128, { strokeColor: COLORS.teal, strokeWidth: 3, groupIds: graphGroupIds });
  [[54, 160], [103, 143], [161, 121], [218, 101], [272, 79], [330, 59]].forEach(([px, py], index) => {
    ellipse("measurement:point:" + index, gx + px - 5, gy + py - 5, 10, 10, {
      strokeColor: COLORS.tealDark,
      backgroundColor: COLORS.tealDark,
      groupIds: graphGroupIds,
    });
  });
  bigIdea("measurement:slope", x + 520, y + 318, 567, "SLOPE IS A RATE", "slope = Δy / Δx. Always read its units and interpret what changes per unit of x.", COLORS.ocean);
  card("measurement:example", x + 520, y + 429, 567, 124, "Example: 65 kg ± 3%", "Absolute uncertainty = 0.03 × 65 kg = 1.95 kg ≈ 2 kg\nReport: about 65 ± 2 kg", {
    fill: COLORS.orchid,
    titleSize: 18,
    bodySize: 14,
  });
  bigIdea("measurement:check", x + 520, y + 576, 567, "CHECK YOUR THINKING", "Can a set of measurements be precise but inaccurate?", COLORS.kelp);
}

// 06 — True/false
{
  const { x, y } = beginFrame(
    5,
    "true-false",
    "Practice A · Sort true from false",
    "Drag each statement card into a column. Explain one placement before moving the next card.",
    "#db7f5d",
  );
  const questions = [
    ["Physics only studies the motion of objects we can see.", "introductory", false, COLORS.ocean],
    ["Classical physics is usually suitable for ordinary sizes, speeds far below light, and weak gravity.", "introductory", true, COLORS.kelp],
    ["A scientific theory is merely an untested educated guess.", "intermediate", false, COLORS.orchid],
    ["A useful scientific hypothesis must be testable with evidence.", "introductory", true, COLORS.sunrise],
    ["Accuracy and precision describe exactly the same measurement quality.", "intermediate", false, COLORS.coral],
  ];
  // Structural destinations come first in scene order so dragged cards always
  // render above them.
  dropZone("tf:true-zone", x + 390, y + 145, 344, 546, "TRUE", "Drop statements supported by the chapter here.", "#f4fbf5", COLORS.green);
  dropZone("tf:false-zone", x + 743, y + 145, 344, 546, "FALSE", "Drop statements that need correcting here.", "#fff8f7", COLORS.red);
  text("tf:deck-label", "STATEMENT CARDS", x + 36, y + 126, {
    fontSize: 11,
    color: COLORS.tealDark,
    locked: true,
  });
  questions.forEach(([prompt, difficulty, answer, fill], index) => {
    sortingCard("tf:q" + (index + 1), x + 36, y + 151 + index * 118, 300, 114, index + 1, prompt, difficulty, answer, fill);
  });
}

// 07–10 — Multiple choice bank
const multipleChoiceBoards = [
  {
    slug: "multiple-choice-a",
    label: "B1",
    focus: "Foundations and scope",
    questions: [
      {
        ref: "Chapter Review #1",
        prompt: "How did natural philosophy relate to physics?",
        choices: ["It included all nature, including physics.", "It excluded physics.", "It was entirely separate from physics.", "It was identical to modern physics."],
        difficulty: "introductory",
      },
      {
        ref: "Chapter Review #2",
        prompt: "Which is NOT an assumption required for scientific understanding?",
        choices: ["Physical traits can be measured.", "Natural explanations can be absolutely certain.", "Processes shape how the universe changes.", "Nature works consistently across time and place."],
        difficulty: "intermediate",
      },
      {
        ref: "Chapter Review #3",
        prompt: "Which question about genetically modified rice cannot science alone decide?",
        choices: ["How its yield compares", "Whether it resists infestation", "How its nutrition compares", "Whether it should be sold commercially"],
        difficulty: "intermediate",
      },
      {
        ref: "Chapter Review #4",
        prompt: "Which conditions are best suited to classical physics?",
        choices: ["Slow, visible, strong gravity", "Fast, visible, strong gravity", "Slow, microscopic, weak gravity", "Slow, visible, weak gravity"],
        difficulty: "introductory",
      },
      {
        ref: "Chapter Review #5",
        prompt: "How does physics contribute to weather prediction?",
        choices: ["It lists fossil-fuel pollutants.", "It describes motion in weather systems.", "It tracks tectonic plates.", "It studies surface erosion only."],
        difficulty: "introductory",
      },
      {
        ref: "Chapter Review #7",
        prompt: "What makes a physical law universal?",
        choices: ["It explains everything.", "It fits every physical phenomenon.", "It applies everywhere in the universe.", "All other laws derive from it."],
        difficulty: "intermediate",
      },
    ],
  },
  {
    slug: "multiple-choice-b",
    label: "B2",
    focus: "Modern physics and applications",
    questions: [
      {
        ref: "Chapter Review #8",
        prompt: "Which field studies small objects, high speeds, and strong gravity?",
        choices: ["General relativity", "Classical physics", "Quantum relativity", "Special relativity"],
        difficulty: "intermediate",
      },
      {
        ref: "Chapter Review #9",
        prompt: "Why are relativity and quantum mechanics called modern physics?",
        choices: ["They are less important.", "They divide popular and elite science.", "They study only slow, weak systems.", "They are newer discoveries that changed physics."],
        difficulty: "intermediate",
      },
      {
        ref: "Test Prep #39",
        prompt: "Which pair forms the foundation of modern physics?",
        choices: ["Quantum mechanics and relativity", "Quantum and classical mechanics", "Newtonian and classical mechanics", "Newtonian mechanics and relativity"],
        difficulty: "introductory",
      },
      {
        ref: "Test Prep #40",
        prompt: "Which situation is best described by classical physics?",
        choices: ["Matter near a black hole", "The motion of an airplane", "Subatomic particle collisions", "Gravity changing the passage of time"],
        difficulty: "introductory",
      },
      {
        ref: "Test Prep #41",
        prompt: "Why is physics necessary for studying the other natural sciences?",
        choices: ["It studies energy transfer only.", "It explains gravity only.", "It studies visible motion only.", "It explains fundamental aspects of the universe."],
        difficulty: "introductory",
      },
      {
        ref: "Test Prep #42",
        prompt: "What links radiation therapy most directly to physics?",
        choices: ["Cell reproduction patterns", "Predicting every side effect", "Radiation devices use physics principles.", "Predicting each patient's lifespan"],
        difficulty: "intermediate",
      },
    ],
  },
  {
    slug: "multiple-choice-c",
    label: "B3",
    focus: "Scientific methods and models",
    questions: [
      {
        ref: "Chapter Review #10",
        prompt: "How does an observation differ from a hypothesis?",
        choices: ["An observation records; a hypothesis is testable.", "An observation is a confirmed hypothesis.", "They are independent of each other.", "A hypothesis is only a final conclusion."],
        difficulty: "introductory",
      },
      {
        ref: "Chapter Review #11",
        prompt: "Why might a scientist use a model of an atom?",
        choices: ["It is similar but easier to examine.", "It is more interesting than an atom.", "It is always more realistic.", "It always contains more detail."],
        difficulty: "introductory",
      },
      {
        ref: "Chapter Review #12",
        prompt: "How does the evidence for a theory compare with that for a new hypothesis?",
        choices: ["Both begin with no evidence.", "A theory has little; a hypothesis has much.", "A theory has substantial supporting evidence.", "Neither can be tested."],
        difficulty: "intermediate",
      },
      {
        ref: "Test Prep #43",
        prompt: "What is the free-electron model of metals?",
        choices: ["A physical replica of a metal", "A simpler imagined system for reasoning", "An ideal metal that others imitate", "A complete realistic representation"],
        difficulty: "intermediate",
      },
      {
        ref: "Test Prep #44",
        prompt: "What tool is most useful for modeling 1,000 gas molecules?",
        choices: ["Untestable hypotheses", "A computer handling a large dataset", "A list of unrelated experiments", "An assumption that cannot be checked"],
        difficulty: "intermediate",
      },
      {
        ref: "Test Prep #46",
        prompt: "Which is a testable hypothesis for why ants gathered in one place?",
        choices: ["A worker ant liked the location.", "The queen chose it for eggs.", "Food particles were present there.", "Ants simply tend to group."],
        difficulty: "challenging",
      },
    ],
  },
  {
    slug: "multiple-choice-d",
    label: "B4",
    focus: "Measurement, variables, and graphs",
    questions: [
      {
        ref: "Chapter Review #13",
        prompt: "Which does NOT contribute to measurement uncertainty?",
        choices: ["Limits of the measuring device", "The measurer's skill", "Regular features of the object", "Other factors affecting the reading"],
        difficulty: "intermediate",
      },
      {
        ref: "Chapter Review #14",
        prompt: "How do independent and dependent variables differ?",
        choices: ["Both are held constant.", "The dependent variable is controlled.", "The independent is changed; the dependent responds.", "They always change together."],
        difficulty: "introductory",
      },
      {
        ref: "Chapter Review #16",
        prompt: "On a velocity-versus-time graph, where are the variables placed?",
        choices: ["Velocity x; time y", "Both on the x-axis", "Time x; velocity y", "Both on the y-axis"],
        difficulty: "introductory",
      },
      {
        ref: "Chapter Review #18",
        prompt: "Which description best matches measurement uncertainty?",
        choices: ["The number of assumptions", "Only an uncalibrated-device error", "A stated range around a measured value", "Only environmental error"],
        difficulty: "intermediate",
      },
      {
        ref: "Test Prep #48",
        prompt: "A mass is 65 kg with 3% uncertainty. What is the absolute uncertainty?",
        choices: ["2 kg", "98 kg", "5 kg", "0 kg"],
        difficulty: "challenging",
      },
      {
        ref: "Test Prep #49",
        prompt: "What is a variable in an experiment?",
        choices: ["An exponential trend", "A value that can change between measurements", "Only the value on the y-axis", "A quantity kept constant in every case"],
        difficulty: "introductory",
      },
    ],
  },
];

multipleChoiceBoards.forEach((board, boardIndex) => {
  const { x, y } = beginFrame(
    6 + boardIndex,
    board.slug,
    "Practice " + board.label + " · Multiple choice",
    board.focus + ". Six adapted OpenStax questions; every movable card retains its original reference.",
    COLORS.teal,
  );
  board.questions.forEach((question, index) => {
    const column = index % 3;
    const row = Math.floor(index / 3);
    questionCard(
      "mc:" + board.label.toLowerCase() + ":q" + (index + 1),
      x + 36 + column * 352,
      y + 137 + row * 281,
      327,
      254,
      index + 1,
      question.prompt,
      {
        kind: "multiple-choice",
        sourceRef: question.ref,
        difficulty: question.difficulty,
        choices: question.choices,
        choicesY: 126,
        promptChars: 39,
        choiceChars: 40,
        fill: [COLORS.ocean, COLORS.kelp, COLORS.orchid][column],
      },
    );
  });
});

// 11 — Open response
{
  const { x, y } = beginFrame(
    10,
    "open-response",
    "Practice C · Explain and design",
    "Two adapted word problems for discussion and planning. Choices are intentionally omitted.",
    "#6f61a8",
  );
  questionCard("open:q1", x + 36, y + 140, 503, 232, 1, "Choose three features in this room. For each, explain one physics idea that helps describe how it works.", {
    kind: "word-problem",
    sourceRef: "Critical Thinking #21 · choices omitted",
    difficulty: "intermediate",
    fill: COLORS.ocean,
    promptSize: 16,
    promptChars: 55,
  });
  questionCard("open:q2", x + 568, y + 140, 519, 232, 2, "Design an experiment to investigate how one variable affects a moving object’s stopping distance. Identify what you change, measure, and control.", {
    kind: "word-problem",
    sourceRef: "Extended Response #71 · choices omitted",
    difficulty: "challenging",
    fill: COLORS.orchid,
    promptSize: 16,
    promptChars: 56,
  });
}

// 12 — Quantitative word problems
{
  const { x, y } = beginFrame(
    11,
    "quantitative",
    "Practice D · Quantitative word problems",
    "Two adapted OpenStax problems with generous calculation space.",
    COLORS.teal,
  );
  questionCard("quant:q1", x + 36, y + 140, 503, 175, 1, "Convert a speed of 80 km/h to meters per second. Show the conversion factors and unit cancellation.", {
    kind: "word-problem",
    sourceRef: "Problem #36",
    difficulty: "intermediate",
    fill: COLORS.kelp,
    promptSize: 16,
    promptChars: 57,
  });
  questionCard("quant:q2", x + 568, y + 140, 519, 175, 2, "A room measures (3.955 ± 0.005) m by (3.050 ± 0.005) m. Find its area and report a reasonable uncertainty.", {
    kind: "word-problem",
    sourceRef: "Problem #37",
    difficulty: "challenging",
    fill: COLORS.sunrise,
    promptSize: 16,
    promptChars: 58,
  });
}

// 13 — Exit ticket
{
  const { x, y } = beginFrame(
    12,
    "exit",
    "Exit ticket · connect the chapter",
    "A short closing check. These prompts are not counted in the 33-question practice bank.",
    "#db7f5d",
  );
  const prompts = [
    ["one", "1 · DEFINE", "Physics is the study of…", COLORS.ocean],
    ["two", "2 · DISTINGUISH", "Accuracy differs from precision because…", COLORS.kelp],
    ["three", "3 · APPLY", "One situation where unit conversion matters is…", COLORS.sunrise],
  ];
  prompts.forEach(([slug, tag, prompt, fill], index) => {
    card("exit:" + slug, x + 36 + index * 352, y + 145, 327, 135, prompt, "", {
      fill,
      tag,
      tagFill: COLORS.white,
      tagWidth: 101,
      titleSize: 18,
      titleChars: 32,
    });
  });
  bigIdea("exit:big-picture", x + 36, y + 318, 1051, "BIG PICTURE", "Observe carefully → measure consistently → model patterns → test explanations → revise with evidence.", COLORS.orchid);
}

elements.push(...frameBackgrounds);
frameRecords.forEach((record) => {
  const frameContent = contentElements.filter((element) => element.frameId === record.frameId);
  const frame = frames.find((element) => element.id === record.frameId);
  elements.push(...frameContent, frame);
});

const scene = {
  type: "excalidraw",
  version: 2,
  source: "kelp-whiteboard",
  roomId: "template-openstax-physics-ch01",
  savedAt: new Date().toISOString(),
  elements,
  appState: {
    viewBackgroundColor: COLORS.canvas,
    gridModeEnabled: false,
    gridSize: 20,
    theme: "light",
    name: "OpenStax Physics · Chapter 1 · What Is Physics?",
    exportBackground: true,
    exportWithDarkMode: false,
  },
  files: {},
  kelpGrid: {
    horizontal: false,
    vertical: false,
    spacing: 20,
    color: "#c8ddd8",
    opacity: 22,
    rotationAssist: true,
  },
  customData: {
    kelpLessonBundle: {
      version: 1,
      designRevision: 3,
      source: {
        title: "Physics",
        chapter: "1 · What Is Physics?",
        sections: ["1.1", "1.2", "1.3"],
        authors: ["Paul Peter Urone", "Roger Hinrichs"],
        publisher: "OpenStax",
        publicationYear: 2020,
        license: "CC BY 4.0",
      },
      audience: "high school",
      intendedMinutes: 60,
      frameCount: 13,
      practiceBank: {
        total: 33,
        trueFalse: 5,
        multipleChoice: 24,
        wordProblems: 4,
      },
      recommendation: "Use 6–8 items live; retain the remainder as a reusable practice bank.",
      interactionModes: {
        exploration: "drag-to-category",
        trueFalse: "drag-to-zone",
      },
    },
  },
};

function boundsOf(element) {
  if ((element.type === "line" || element.type === "arrow") && element.points) {
    const xs = element.points.map((point) => element.x + point[0]);
    const ys = element.points.map((point) => element.y + point[1]);
    return {
      left: Math.min(...xs),
      top: Math.min(...ys),
      right: Math.max(...xs),
      bottom: Math.max(...ys),
    };
  }
  return {
    left: element.x,
    top: element.y,
    right: element.x + element.width,
    bottom: element.y + element.height,
  };
}

function validate() {
  const errors = [];
  const ids = new Set();
  for (const element of scene.elements) {
    if (ids.has(element.id)) errors.push("Duplicate element id: " + element.id);
    ids.add(element.id);
  }
  if (frames.length !== 13) errors.push("Expected 13 frames; found " + frames.length);
  if (frameBackgrounds.length !== 13) errors.push("Expected 13 frame backgrounds; found " + frameBackgrounds.length);
  if (scene.elements.some((element) => element.type === "image")) errors.push("Scene must not contain raster images.");
  if (frames.some((frame) => frame.locked)) errors.push("Lesson frames must remain selectable and deletable.");
  if (frameBackgrounds.some((background) => !background.locked)) errors.push("Managed frame backgrounds must remain locked.");
  if (contentElements.some((element) => element.locked)) errors.push("Every visible lesson object must remain editable.");

  const frameMap = new Map(frames.map((frame) => [frame.id, frame]));
  const orderById = new Map(scene.elements.map((element, index) => [element.id, index]));
  for (const element of contentElements) {
    const frame = frameMap.get(element.frameId);
    if (!frame) {
      errors.push("Content element missing valid frame: " + element.id);
      continue;
    }
    const bounds = boundsOf(element);
    const tolerance = 2;
    if (
      bounds.left < frame.x - tolerance ||
      bounds.top < frame.y - tolerance ||
      bounds.right > frame.x + frame.width + tolerance ||
      bounds.bottom > frame.y + frame.height + tolerance
    ) {
      errors.push("Element escapes frame bounds: " + element.id);
    }
    if (orderById.get(element.id) > orderById.get(frame.id)) {
      errors.push("Frame child must precede its frame in scene order: " + element.id);
    }
  }

  const grouped = new Map();
  for (const element of contentElements) {
    for (const groupId of element.groupIds) {
      const members = grouped.get(groupId) ?? [];
      members.push(element);
      grouped.set(groupId, members);
    }
  }
  for (const [groupId, members] of grouped) {
    if (members.length < 2) errors.push("Movable group has fewer than two elements: " + groupId);
    if (new Set(members.map((member) => member.frameId)).size !== 1) {
      errors.push("Group crosses frames: " + groupId);
    }
    const containers = members
      .filter((member) => member.type === "rectangle")
      .sort((left, right) => right.width * right.height - left.width * left.height);
    const container = containers[0];
    if (container) {
      for (const label of members.filter((member) => member.type === "text")) {
        const tolerance = 1;
        if (
          label.x < container.x - tolerance ||
          label.y < container.y - tolerance ||
          label.x + label.width > container.x + container.width + tolerance ||
          label.y + label.height > container.y + container.height + tolerance
        ) {
          errors.push("Grouped text escapes its card: " + label.id);
        }
      }
    }
  }

  const questionShapes = scene.elements.filter((element) => element.customData?.kelpQuestion);
  const questions = questionShapes.map((element) => element.customData.kelpQuestion);
  const counts = questions.reduce((result, question) => {
    result[question.kind] = (result[question.kind] ?? 0) + 1;
    return result;
  }, {});
  if (questions.length !== 33) errors.push("Expected 33 practice questions; found " + questions.length);
  if (counts["true-false"] !== 5) errors.push("Expected 5 true/false questions.");
  if (counts["multiple-choice"] !== 24) errors.push("Expected 24 multiple-choice questions.");
  if (counts["word-problem"] !== 4) errors.push("Expected 4 word problems.");
  if (questions.filter((question) => question.kind !== "true-false").some((question) => !question.sourceRef)) {
    errors.push("Every adapted textbook question needs a source reference.");
  }
  for (const card of questionShapes) {
    const groupId = card.groupIds[0];
    const groupedText = scene.elements.filter(
      (element) => element.type === "text" && element.groupIds?.includes(groupId),
    );
    const lowestTextEdge = Math.max(...groupedText.map((element) => element.y + element.height));
    const bottomPadding = card.y + card.height - lowestTextEdge;
    if (bottomPadding < 10) errors.push("Question card needs at least 10 px of bottom padding: " + card.id);
  }
  const trueFalse = questions.filter((question) => question.kind === "true-false");
  if (trueFalse.some((question) => typeof question.answer !== "boolean" || question.interaction !== "drag-to-zone")) {
    errors.push("Every true/false question must be a drag-to-zone card with answer metadata.");
  }
  const trueFalseCards = scene.elements.filter(
    (element) => element.customData?.kelpQuestion?.kind === "true-false",
  );
  const trueFalseZones = scene.elements.filter((element) => element.customData?.kelpDropZone);
  if (trueFalseZones.length !== 2) errors.push("Expected two true/false drop zones.");
  const narrowestZone = Math.min(...trueFalseZones.map((zone) => zone.width));
  if (trueFalseCards.some((card) => card.width >= narrowestZone)) {
    errors.push("True/false cards must be narrower than their destinations.");
  }
  for (const card of trueFalseCards) {
    const groupId = card.groupIds[0];
    const prompt = scene.elements.find(
      (element) => element.groupIds?.includes(groupId) && element.customData?.kelpCardText?.role === "prompt",
    );
    const bottomPadding = prompt ? card.y + card.height - prompt.y - prompt.height : -1;
    if (bottomPadding < 10) errors.push("True/false card needs at least 10 px of bottom padding: " + card.id);
  }
  if (trueFalseZones.some((zone) => trueFalseCards.some((card) => orderById.get(zone.id) >= orderById.get(card.id)))) {
    errors.push("True/false destinations must render behind draggable cards.");
  }

  const arrows = scene.elements.filter((element) => element.type === "arrow" && (element.startBinding || element.endBinding));
  if (scene.elements.some((element) => element.type === "arrow" && element.locked)) {
    errors.push("Every arrow must remain selectable and deletable.");
  }
  for (const connector of arrows) {
    for (const binding of [connector.startBinding, connector.endBinding].filter(Boolean)) {
      const target = scene.elements.find((element) => element.id === binding.elementId);
      if (!target?.boundElements?.some((bound) => bound.id === connector.id && bound.type === "arrow")) {
        errors.push("Arrow binding is not reciprocal: " + connector.id);
      }
      if ((binding.gap ?? 0) < 14) errors.push("Arrow needs more endpoint breathing room: " + connector.id);
    }
  }

  const attributionCount = scene.elements.filter(
    (element) => element.type === "text" && element.text?.includes("CC BY 4.0"),
  ).length;
  if (attributionCount !== 13) errors.push("Expected one attribution footer per frame.");

  if (errors.length) {
    throw new Error("Whiteboard validation failed:\n- " + errors.join("\n- "));
  }

  return {
    frames: frames.length,
    elements: scene.elements.length,
    groups: grouped.size,
    questions: counts,
    attributions: attributionCount,
  };
}

const report = validate();
await mkdir(dirname(OUTPUT), { recursive: true });
await writeFile(OUTPUT, JSON.stringify(scene, null, 2) + "\n", "utf8");
console.log("Generated " + OUTPUT);
console.log(JSON.stringify(report, null, 2));
