import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const OUTPUT = resolve(
  process.cwd(),
  "data/whiteboards/pilots/physics/chapter-02-motion-in-one-dimension/openstax-physics-ch02-lesson.excalidraw",
);
const SCENE_NAMESPACE = "openstax-physics-ch02";

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
  return ("ch02_" + key.replace(/[^a-zA-Z0-9_-]/g, "_") + "_" + hash32(scopedKey).toString(36)).slice(0, 64);
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
    position: "Position & displacement",
    "speed-velocity": "Speed & velocity",
    "position-time": "Position-time graphs",
    "velocity-time": "Velocity-time graphs",
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
  text(slug + ":eyebrow", String(index + 1).padStart(2, "0") + "  •  OPENSTAX PHYSICS · CHAPTER 2", ox + MARGIN, oy + 22, {
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
  line(slug + ":header-rule", ox + MARGIN, oy + 116, FRAME_W - MARGIN * 2, 0, {
    strokeColor: COLORS.borderSoft,
    groupIds: headerGroupIds,
  });

  const attribution = "Adapted from Physics, Ch. 2, P. P. Urone & R. Hinrichs, OpenStax, © 2020 TEA  |  CC BY 4.0";
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
    "Scalar or vector?",
    "Sort each motion description by the information it contains. Destinations stay behind the draggable cards.",
    COLORS.teal,
  );
  card("explore:bucket:scalar", x + 657, y + 145, 205, 310, "Magnitude only", "DISTANCE / SPEED\n\nHow much path?\nHow fast?", {
    fill: "#f8fcfc",
    strokeColor: COLORS.teal,
    tag: "SCALAR",
    tagFill: COLORS.ocean,
    tagWidth: 72,
    titleSize: 17,
    bodySize: 13,
  });
  card("explore:bucket:vector", x + 882, y + 145, 205, 310, "Magnitude + direction", "DISPLACEMENT / VELOCITY\n\nHow far from start?\nWhich way?", {
    fill: "#fcfbfe",
    strokeColor: "#8c6caf",
    tag: "VECTOR",
    tagFill: COLORS.orchid,
    tagWidth: 72,
    titleSize: 17,
    bodySize: 13,
  });
  const evidence = [
    ["path", "5 km traveled", "path length", COLORS.ocean],
    ["east", "5 km east of start", "change in position", COLORS.orchid],
    ["rate", "20 m/s", "rate without direction", COLORS.sunrise],
    ["west", "20 m/s west", "rate with direction", COLORS.slate],
    ["round", "400 m round trip", "total path", COLORS.coral],
    ["home", "0 m from start", "final change", COLORS.kelp],
  ];
  evidence.forEach(([slug, titleValue, bodyValue, fill], index) => {
    const column = index % 3;
    const row = Math.floor(index / 3);
    card("explore:evidence:" + slug, x + 36 + column * 200, y + 150 + row * 132, 180, 116, titleValue, bodyValue, {
      fill,
      titleSize: 15,
      bodySize: 12,
      bodyChars: 20,
    });
  });
  bigIdea("explore:definition", x + 36, y + 490, 1051, "FIRST QUESTION", "Relative to what origin and positive direction is the motion being described?", COLORS.kelp);
}

// 02 — Position, distance, and displacement
{
  const { x, y } = beginFrame(
    1,
    "position",
    "Describe motion from a reference frame",
    "Section 2.1: position, path length, and change in position are related but not interchangeable.",
    "#6f61a8",
  );
  const center = { id: idFor("position:center:shape"), x: x + 399, y: y + 315, w: 325, h: 115 };
  card("position:center", center.x, center.y, center.w, center.h, "MOTION DESCRIPTION", "Position x at time t, measured from an origin on a chosen axis.", {
    fill: COLORS.ocean,
    strokeColor: COLORS.teal,
    titleSize: 22,
    titleColor: COLORS.tealDark,
    bodySize: 14,
  });
  const nodes = [
    ["frame", x + 52, y + 145, 300, 132, "Reference frame", "Choose an origin, coordinate axis, and positive direction before describing motion.", COLORS.kelp],
    ["distance", x + 52, y + 520, 300, 132, "Distance", "Total path length. A scalar: magnitude only and never negative.", COLORS.sunrise],
    ["displacement", x + 771, y + 145, 300, 132, "Displacement Δx", "Final position minus initial position: Δx = xf − xi. Sign gives direction.", COLORS.orchid],
    ["round-trip", x + 771, y + 520, 300, 132, "Round trip", "Distance can be positive while displacement is zero when the endpoint is the start.", COLORS.coral],
  ];
  const boxes = {};
  nodes.forEach(([slug, bx, by, bw, bh, titleValue, bodyValue, fill]) => {
    card("position:" + slug, bx, by, bw, bh, titleValue, bodyValue, {
      fill,
      titleSize: 18,
      bodySize: 13,
      bodyChars: 34,
    });
    boxes[slug] = { id: idFor("position:" + slug + ":shape"), x: bx, y: by, w: bw, h: bh };
  });
  boundArrow("position:arrow:frame", center, boxes.frame, { fromSide: "left", toSide: "right", fromOffset: -26, gap: 18 });
  boundArrow("position:arrow:distance", center, boxes.distance, { fromSide: "left", toSide: "right", fromOffset: 26, gap: 18 });
  boundArrow("position:arrow:displacement", center, boxes.displacement, { fromSide: "right", toSide: "left", fromOffset: -26, gap: 18 });
  boundArrow("position:arrow:round-trip", center, boxes["round-trip"], { fromSide: "right", toSide: "left", fromOffset: 26, gap: 18 });
}

// 03 — Speed and velocity
{
  const { x, y } = beginFrame(
    2,
    "speed-velocity",
    "Speed and velocity answer different questions",
    "Section 2.2: distinguish path rate from displacement rate, and average values from instantaneous ones.",
    "#db7f5d",
  );
  card("speed-velocity:speed", x + 36, y + 145, 503, 178, "Average speed", "average speed = distance / elapsed time\n\nScalar. It reports how fast the path is covered.", {
    fill: COLORS.ocean,
    tag: "PATH RATE",
    tagFill: COLORS.white,
    tagWidth: 92,
    titleSize: 21,
    bodySize: 15,
  });
  card("speed-velocity:velocity", x + 568, y + 145, 519, 178, "Average velocity", "average velocity = displacement / elapsed time\n\nVector. Its sign or direction matters.", {
    fill: COLORS.orchid,
    tag: "CHANGE RATE",
    tagFill: COLORS.white,
    tagWidth: 106,
    titleSize: 21,
    bodySize: 15,
  });
  const comparisons = [
    ["instant", "Instantaneous", "Value at one moment. A speedometer shows instantaneous speed, not direction.", COLORS.kelp],
    ["sign", "Read the sign", "Positive and negative velocity indicate opposite directions on the chosen axis.", COLORS.sunrise],
    ["same", "When do they match?", "For constant motion in one direction, speed equals the magnitude of velocity.", COLORS.coral],
  ];
  comparisons.forEach(([slug, titleValue, bodyValue, fill], index) => {
    card("speed-velocity:" + slug, x + 36 + index * 352, y + 365, 327, 150, titleValue, bodyValue, {
      fill,
      titleSize: 18,
      bodySize: 13,
      bodyChars: 36,
    });
  });
  bigIdea("speed-velocity:round-trip", x + 36, y + 558, 1051, "ROUND-TRIP CHECK", "Nonzero distance gives positive average speed; zero displacement gives zero average velocity.", COLORS.slate);
}

// 04 — Position versus time
{
  const { x, y } = beginFrame(
    3,
    "position-time",
    "Read a position vs. time graph",
    "Section 2.3: position is vertical, time is horizontal, and slope translates the graph into velocity.",
    COLORS.teal,
  );
  const gx = x + 70;
  const gy = y + 170;
  const graphGroupIds = [groupFor("position-time:graph")];
  line("position-time:axis-y", gx, gy + 350, 0, -300, { strokeColor: COLORS.ink, strokeWidth: 2, groupIds: graphGroupIds });
  line("position-time:axis-x", gx, gy + 350, 450, 0, { strokeColor: COLORS.ink, strokeWidth: 2, groupIds: graphGroupIds });
  text("position-time:y-label", "position x", gx - 5, gy + 21, { fontSize: 12, color: COLORS.muted, groupIds: graphGroupIds });
  text("position-time:x-label", "time t", gx + 395, gy + 366, { fontSize: 12, color: COLORS.muted, groupIds: graphGroupIds });
  line("position-time:outbound", gx + 35, gy + 315, 185, -205, { strokeColor: COLORS.teal, strokeWidth: 4, groupIds: graphGroupIds });
  line("position-time:return", gx + 220, gy + 110, 180, 205, { strokeColor: "#8c6caf", strokeWidth: 4, groupIds: graphGroupIds });
  [[35, 315], [220, 110], [400, 315]].forEach(([px, py], index) => {
    ellipse("position-time:point:" + index, gx + px - 6, gy + py - 6, 12, 12, {
      strokeColor: COLORS.tealDark,
      backgroundColor: COLORS.white,
      strokeWidth: 3,
      groupIds: graphGroupIds,
    });
  });
  text("position-time:out-label", "away from origin", gx + 70, gy + 190, { fontSize: 11, color: COLORS.tealDark, groupIds: graphGroupIds });
  text("position-time:return-label", "back toward origin", gx + 270, gy + 190, { fontSize: 11, color: "#6f5191", groupIds: graphGroupIds });
  card("position-time:slope", x + 590, y + 145, 497, 118, "Slope = velocity", "slope = Δx / Δt. Positive and negative slopes mean opposite directions.", { fill: COLORS.ocean, titleSize: 19, bodySize: 13 });
  card("position-time:steep", x + 590, y + 288, 497, 118, "Steeper means faster", "Compare slope magnitude, not the visual height of the line.", { fill: COLORS.sunrise, titleSize: 19, bodySize: 13 });
  card("position-time:flat", x + 590, y + 431, 497, 118, "Horizontal means at rest", "Zero slope means position is not changing during that interval.", { fill: COLORS.kelp, titleSize: 19, bodySize: 13 });
  bigIdea("position-time:tangent", x + 590, y + 577, 497, "CURVED GRAPH", "A tangent slope estimates instantaneous velocity.", COLORS.coral);
}

// 05 — Velocity versus time
{
  const { x, y } = beginFrame(
    4,
    "velocity-time",
    "Read a velocity vs. time graph",
    "Section 2.4: slope gives acceleration, area gives displacement, and the sign gives direction.",
    "#6f61a8",
  );
  const gx = x + 70;
  const gy = y + 170;
  const graphGroupIds = [groupFor("velocity-time:graph")];
  line("velocity-time:axis-y", gx, gy + 350, 0, -300, { strokeColor: COLORS.ink, strokeWidth: 2, groupIds: graphGroupIds });
  line("velocity-time:axis-x", gx, gy + 350, 450, 0, { strokeColor: COLORS.ink, strokeWidth: 2, groupIds: graphGroupIds });
  text("velocity-time:y-label", "velocity v", gx - 5, gy + 20, { fontSize: 12, color: COLORS.muted, groupIds: graphGroupIds });
  text("velocity-time:x-label", "time t", gx + 395, gy + 366, { fontSize: 12, color: COLORS.muted, groupIds: graphGroupIds });
  line("velocity-time:accelerate", gx + 35, gy + 315, 100, -205, { strokeColor: COLORS.teal, strokeWidth: 4, groupIds: graphGroupIds });
  line("velocity-time:constant", gx + 135, gy + 110, 170, 0, { strokeColor: COLORS.teal, strokeWidth: 4, groupIds: graphGroupIds });
  line("velocity-time:slow", gx + 305, gy + 110, 95, 205, { strokeColor: "#8c6caf", strokeWidth: 4, groupIds: graphGroupIds });
  [[35, 315], [135, 110], [305, 110], [400, 315]].forEach(([px, py], index) => {
    ellipse("velocity-time:point:" + index, gx + px - 6, gy + py - 6, 12, 12, {
      strokeColor: COLORS.tealDark,
      backgroundColor: COLORS.white,
      strokeWidth: 3,
      groupIds: graphGroupIds,
    });
  });
  text("velocity-time:plus", "v > 0", gx + 365, gy + 235, { fontSize: 12, color: COLORS.tealDark, groupIds: graphGroupIds });
  card("velocity-time:slope", x + 590, y + 145, 497, 118, "Slope = acceleration", "A rising line has positive acceleration; a falling line has negative acceleration.", { fill: COLORS.orchid, titleSize: 19, bodySize: 13 });
  card("velocity-time:area", x + 590, y + 288, 497, 118, "Area = displacement", "Add signed areas between the velocity curve and the time axis.", { fill: COLORS.ocean, titleSize: 19, bodySize: 13 });
  card("velocity-time:sign", x + 590, y + 431, 497, 118, "Sign = direction", "Velocity above and below zero represents motion in opposite directions.", { fill: COLORS.sunrise, titleSize: 19, bodySize: 13 });
  bigIdea("velocity-time:average", x + 590, y + 577, 497, "AVERAGE VELOCITY", "total displacement / total elapsed time", COLORS.kelp);
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
    ["An object can travel a nonzero distance and finish with zero displacement.", "introductory", true, COLORS.ocean],
    ["A reference frame is optional when describing an object’s motion.", "introductory", false, COLORS.kelp],
    ["Speed includes both magnitude and direction.", "introductory", false, COLORS.orchid],
    ["The slope of a position vs. time graph gives velocity.", "intermediate", true, COLORS.sunrise],
    ["The signed area under a velocity vs. time graph gives displacement.", "intermediate", true, COLORS.coral],
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
    focus: "Reference frames, distance, and displacement",
    questions: [
      {
        ref: "Test Prep #25",
        prompt: "Why should a reference frame be specified when describing motion?",
        choices: ["Motion depends on the chosen frame.", "Motion appears the same in every frame.", "A frame changes the object’s motion.", "Some frames simply reveal motion better."],
        difficulty: "introductory",
      },
      {
        ref: "Test Prep #26",
        prompt: "Which statement correctly describes displacement?",
        choices: ["It always equals distance traveled.", "It is straight-line change plus direction.", "It is only the direction of travel.", "It is only the straight-line separation."],
        difficulty: "intermediate",
      },
      {
        ref: "Test Prep #27",
        prompt: "A biker rides 50 miles west, then 80 miles east. What is the net displacement?",
        choices: ["130 miles", "30 miles east", "30 miles west", "Not enough information"],
        difficulty: "intermediate",
      },
      {
        ref: "Test Prep #28",
        prompt: "Is there one uniquely correct reference frame for a moving train?",
        choices: ["Yes, because motion is relative.", "Yes, Earth is always the correct frame.", "No, motion is relative to the chosen frame.", "No, motion is independent of frames."],
        difficulty: "introductory",
      },
      {
        ref: "Test Prep #29",
        prompt: "After one complete circular orbit, what are a shuttle’s distance and displacement?",
        choices: ["Both are zero.", "Distance is one circumference; displacement is zero.", "Distance is zero; displacement is one circumference.", "Both equal one circumference."],
        difficulty: "introductory",
      },
      {
        ref: "Short Answer #39",
        prompt: "A bowling ball rolls down a lane and is returned to its start. What are its net displacement and distance?",
        choices: ["Two lane lengths; zero", "Zero; two lane lengths", "Both zero", "Both two lane lengths"],
        difficulty: "intermediate",
      },
    ],
  },
  {
    slug: "multiple-choice-b",
    label: "B2",
    focus: "Speed, velocity, and instantaneous motion",
    questions: [
      {
        ref: "Chapter Review #3",
        prompt: "What does a car’s odometer record?",
        choices: ["Displacement", "Distance", "Both distance and displacement", "Their sum"],
        difficulty: "intermediate",
      },
      {
        ref: "Chapter Review #4",
        prompt: "In the definition of velocity, which physical quantity changes over time?",
        choices: ["Speed", "Distance", "Displacement magnitude only", "Position vector"],
        difficulty: "intermediate",
      },
      {
        ref: "Chapter Review #5",
        prompt: "How are instantaneous speed and instantaneous velocity related?",
        choices: ["They are always identical vectors.", "They can never be equal.", "Speed equals the magnitude of velocity.", "Velocity magnitude is always greater."],
        difficulty: "introductory",
      },
      {
        ref: "Critical Thinking #11",
        prompt: "Can a speedometer reading alone determine a car’s instantaneous velocity?",
        choices: ["No; it gives speed but not direction.", "No; it gives only average speed.", "Yes, sometimes it gives the full velocity.", "Yes, it always gives the full velocity."],
        difficulty: "introductory",
      },
      {
        ref: "Test Prep #30",
        prompt: "Which cyclist has the greatest average speed?",
        choices: ["95 m in 27 s", "87 m in 22 s", "106 m in 26 s", "108 m in 24 s"],
        difficulty: "introductory",
      },
      {
        ref: "Test Prep #33",
        prompt: "A car moves at constant speed in one direction. Which statement is true?",
        choices: ["Average velocity is zero.", "Average velocity magnitude equals average speed.", "Average velocity magnitude is greater.", "Average velocity magnitude is smaller."],
        difficulty: "intermediate",
      },
    ],
  },
  {
    slug: "multiple-choice-c",
    label: "B3",
    focus: "Position-time graphs and motion stories",
    questions: [
      {
        ref: "Check Your Understanding #18",
        prompt: "What can be determined from a straight-line position vs. time graph?",
        choices: ["Reference frame", "Average acceleration", "Velocity", "Direction of applied force"],
        difficulty: "introductory",
      },
      {
        ref: "Test Prep #34",
        prompt: "What does the slope of a straight position vs. time graph represent?",
        choices: ["Velocity", "Displacement", "Distance", "Acceleration"],
        difficulty: "introductory",
      },
      {
        ref: "Test Prep #45",
        prompt: "A puck moves 20 m away and then returns to its start. What shape is its position-time graph?",
        choices: ["An upward-opening V", "A downward-opening V", "An upward-opening U", "A downward-opening U"],
        difficulty: "intermediate",
      },
      {
        ref: "Chapter Review #20",
        prompt: "Which position-time shape matches a train that speeds up, cruises, then slows to rest?",
        choices: ["Concave up; straight positive slope; concave down", "Concave down; straight positive slope; concave up", "Concave up; horizontal; concave down", "Concave down; horizontal; concave up"],
        difficulty: "intermediate",
      },
      {
        ref: "Test Prep #31",
        prompt: "A car averages 23 m/s for 82 s. Which displacement is impossible?",
        choices: ["1,700 m east", "2,000 m west", "1,600 m north", "1,500 m south"],
        difficulty: "intermediate",
      },
      {
        ref: "Short Answer #44",
        prompt: "Why can a swimmer’s average velocity be zero after three complete pool laps?",
        choices: ["Total distance is zero.", "Total displacement is zero.", "The number of laps is odd.", "Successive lap speeds cancel."],
        difficulty: "challenging",
      },
    ],
  },
  {
    slug: "multiple-choice-d",
    label: "B4",
    focus: "Velocity-time graphs, acceleration, and averages",
    questions: [
      {
        ref: "Chapter Review #21",
        prompt: "What is the minimum number of position-time data points needed to estimate average acceleration?",
        choices: ["1", "2", "3", "4"],
        difficulty: "intermediate",
      },
      {
        ref: "Practice #22",
        prompt: "What does a horizontal velocity vs. time line describe?",
        choices: ["Constant velocity and zero acceleration", "Constant velocity with acceleration", "Variable velocity and zero acceleration", "Variable velocity with acceleration"],
        difficulty: "introductory",
      },
      {
        ref: "Check Your Understanding #23",
        prompt: "What information can be obtained directly from a velocity vs. time graph?",
        choices: ["Acceleration", "The reference frame", "The shortest path", "The object’s shape"],
        difficulty: "introductory",
      },
      {
        ref: "Check Your Understanding #24",
        prompt: "How do position-time and velocity-time graphs convert into each other?",
        choices: ["Use both slopes.", "Use position slope and velocity area.", "Use position area and velocity slope.", "Use both areas."],
        difficulty: "intermediate",
      },
      {
        ref: "Test Prep #36",
        prompt: "What does the signed area under a velocity vs. time graph provide?",
        choices: ["Rate of acceleration", "Area enclosed by the trip", "Displacement over the interval", "Final velocity"],
        difficulty: "challenging",
      },
      {
        ref: "Short Answer #43",
        prompt: "How can an object’s average speed be doubled?",
        choices: ["Halve distance or double time.", "Double distance or halve time.", "Quarter distance or quadruple time.", "Quadruple distance or quarter time only."],
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
  questionCard("open:q1", x + 36, y + 140, 503, 232, 1, "Two boats pass with equal and opposite velocities. Explain how each captain describes the other boat’s motion, naming the reference frame used.", {
    kind: "word-problem",
    sourceRef: "Critical Thinking #9 · choices omitted",
    difficulty: "intermediate",
    fill: COLORS.ocean,
    promptSize: 16,
    promptChars: 55,
  });
  questionCard("open:q2", x + 568, y + 140, 519, 232, 2, "A passenger on a moving train throws a ball vertically upward. Compare the path seen by another passenger with the path seen by an observer on the platform.", {
    kind: "word-problem",
    sourceRef: "Critical Thinking #10 · choices omitted",
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
  questionCard("quant:q1", x + 36, y + 140, 503, 175, 1, "A ball drops from 1.0 m, then rebounds to 0.8 m, 0.5 m, and 0.2 m before returning to the floor. Find total distance and displacement. Take up as positive.", {
    kind: "word-problem",
    sourceRef: "Problem #17",
    difficulty: "intermediate",
    fill: COLORS.kelp,
    promptSize: 16,
    promptChars: 57,
  });
  questionCard("quant:q2", x + 568, y + 140, 519, 175, 2, "A car moves at an average speed of 86.4 km/h. How far does it travel during a 3.3 s glance out the window? Show the unit conversion.", {
    kind: "word-problem",
    sourceRef: "Problem #18",
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
    ["one", "1 · DEFINE", "A reference frame tells us…", COLORS.ocean],
    ["two", "2 · DISTINGUISH", "Distance differs from displacement because…", COLORS.kelp],
    ["three", "3 · CONNECT", "Slope on x–t and area on v–t mean…", COLORS.sunrise],
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
  bigIdea("exit:big-picture", x + 36, y + 318, 1051, "BIG PICTURE", "Choose a frame → track position → compare path and change → read slope and area → describe the motion.", COLORS.orchid);
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
  roomId: "template-openstax-physics-ch02",
  savedAt: new Date().toISOString(),
  elements,
  appState: {
    viewBackgroundColor: COLORS.canvas,
    gridModeEnabled: false,
    gridSize: 20,
    theme: "light",
    name: "OpenStax Physics · Chapter 2 · Motion in One Dimension",
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
        chapter: "2 · Motion in One Dimension",
        sections: ["2.1", "2.2", "2.3", "2.4"],
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
