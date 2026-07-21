/* Kelp reusable diagram editor - standalone canvas component */
(function () {
  const DEFAULT_STROKE = "#145c63";
  const DEFAULT_FILL = "#e8f7f9";
  const POINT_PREFIX = "P";
  const LABEL_FONT_SIZE = 14.4;
  const ANGLE_VARIABLE_LABELS = ["x", "y", "w", "z", "k", "l", "m", "n", "o", "p", "q", "r", "s", "t"];
  const POINT_VARIABLE_LABELS = ["x", "y", "w", "z", "k", "l", "m", "n", "o", "p", "q", "r", "s", "t"];
  const FUNCTION_COLORS = ["#145c63", "#c23b53", "#3f6fb5", "#7a4da0", "#2f7d4a", "#b66a18", "#383838", "#008c9e"];
  const FRAME_BORDER_STYLES = ["none", "solid", "dashed", "dotted"];
  const POINT_COORDINATE_LABEL_MODES = [
    "name",
    "variableY",
    "xVariable",
    "coordinates",
    "nameVariableY",
    "nameXVariable",
    "nameCoordinates"
  ];
  const SUPERSCRIPT_MAP = {
    "0": "\u2070", "1": "\u00b9", "2": "\u00b2", "3": "\u00b3", "4": "\u2074",
    "5": "\u2075", "6": "\u2076", "7": "\u2077", "8": "\u2078", "9": "\u2079",
    "+": "\u207a", "-": "\u207b", "=": "\u207c", "(": "\u207d", ")": "\u207e",
    "n": "\u207f", "i": "\u2071", "x": "\u02e3", "y": "\u02b8"
  };
  const SUBSCRIPT_MAP = {
    "0": "\u2080", "1": "\u2081", "2": "\u2082", "3": "\u2083", "4": "\u2084",
    "5": "\u2085", "6": "\u2086", "7": "\u2087", "8": "\u2088", "9": "\u2089",
    "+": "\u208a", "-": "\u208b", "=": "\u208c", "(": "\u208d", ")": "\u208e"
  };
  const TOOLS = [
    ["select", "Select"],
    ["point", "Point"],
    ["segment", "Segment"],
    ["referenceLine", "Reference line"],
    ["distance", "Distance"],
    ["angle", "Angle"],
    ["function", "Function"],
    ["regularPolygon", "Regular polygon"],
    ["irregularPolygon", "Irregular polygon"],
    ["rectangle", "Rectangle"],
    ["trapezoid", "Trapezoid"],
    ["parallelogram", "Parallelogram"],
    ["circle", "Circle"],
    ["label", "Label"],
    ["symbol", "Symbol"]
  ];

  const TOOL_SHORTCUT_HELP = [
    "Shortcuts work only while this diagram editor is focused:",
    "- Shift+Q: Point",
    "- Shift+W: Segment",
    "- Shift+E: Regular polygon",
    "- Shift+D: Irregular polygon",
    "- Shift+F: Function",
    "- Shift+A: Angle",
    "- Shift+Z: Trapezoid",
    "- Shift+X: Parallelogram",
    "- Shift+S: Select",
    "- Shift+R: Reset view",
    "- Shift+V: Move view",
    "- Shift+T: Stick",
    "- Shift+C: Clear",
    "- Shift+Space: Attach body diagram"
  ].join("\n");

  const CIRCUIT_SYMBOLS = [
    ["resistor", "Resistor"],
    ["variableResistor", "Variable resistor"],
    ["battery", "Battery"],
    ["ammeter", "Ammeter"],
    ["voltmeter", "Voltmeter"],
    ["inductor", "Inductor"],
    ["earth", "Earth electrode"],
    ["capacitor", "Capacitor"]
  ];

  const CIRCUIT_SYMBOL_LABELS = Object.fromEntries(CIRCUIT_SYMBOLS);

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function round(value) {
    return Number.parseFloat(Number(value || 0).toFixed(2));
  }

  function isHexColor(value) {
    return /^#[0-9a-f]{6}$/i.test(String(value || ""));
  }

  function cleanLabel(value, fallback = "") {
    return String(value || fallback).trim().replace(/[^A-Za-z0-9_]/g, "").slice(0, 12);
  }

  function cleanVariableLabel(value) {
    return String(value || "").trim().replace(/[^A-Za-z0-9_]/g, "").slice(0, 8);
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function toNumber(value, fallback) {
    const normalized = typeof value === "string" ? value.trim().replace(",", ".") : value;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function toOpacity(value, fallback = 0.36) {
    return clamp(toNumber(value, fallback), 0, 1);
  }

  function applyDash(ctx, dash) {
    if (dash === "dashed") ctx.setLineDash([8, 6]);
    else if (dash === "dotted") ctx.setLineDash([2, 6]);
    else ctx.setLineDash([]);
  }

  function isLineStyle(value, options = {}) {
    return ["solid", "dashed", "dotted", ...(options.arrow ? ["arrow"] : [])].includes(value);
  }

  function distance(a, b) {
    return Math.hypot(Number(a.x) - Number(b.x), Number(a.y) - Number(b.y));
  }

  function precisionDecimals(value, fallback = 2) {
    return clamp(Math.floor(toNumber(value, fallback)), 0, 3);
  }

  function formatMeasurement(value, precision = 2) {
    const decimals = precisionDecimals(precision);
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return "";
    return Number.parseFloat(numeric.toFixed(decimals)).toString();
  }

  function formatCoordinate(value, precision = 2) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return "";
    return numeric.toFixed(precisionDecimals(precision));
  }

  function pointDisplayLabel(point, index = 0) {
    const name = cleanLabel(point?.label, defaultPointLabel(index));
    const mode = POINT_COORDINATE_LABEL_MODES.includes(point?.coordinateLabelMode) ? point.coordinateLabelMode : "name";
    if (mode === "name") return name;
    const x = formatCoordinate(point?.x, point?.coordinatePrecision);
    const y = formatCoordinate(point?.y, point?.coordinatePrecision);
    const variable = cleanVariableLabel(point?.coordinateVariable) || POINT_VARIABLE_LABELS[index % POINT_VARIABLE_LABELS.length];
    const coordinate = ["variableY", "nameVariableY"].includes(mode)
      ? `(${variable}, ${y})`
      : ["xVariable", "nameXVariable"].includes(mode)
        ? `(${x}, ${variable})`
        : `(${x}, ${y})`;
    return mode.startsWith("name") ? `${name} ${coordinate}` : coordinate;
  }

  function segmentLength(a, b, precision = 2) {
    return formatMeasurement(distance(a, b), precision);
  }

  function convertMathRun(run, map) {
    return String(run).split("").map((char) => map[char] || char).join("");
  }

  function toCanvasMathText(text) {
    return String(text || "")
      .trim()
      .replace(/^\$+|\$+$/g, "")
      .replace(/^\\\(|\\\)$/g, "")
      .replace(/\\left|\\right/g, "")
      .replace(/\\?frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g, "($1)/($2)")
      .replace(/\\?sqrt\s*\{([^{}]+)\}/g, "\u221a($1)")
      .replace(/\\?sqrt\s*([A-Za-z0-9]+)/g, "\u221a$1")
      .replace(/\\cdot/g, "\u00b7")
      .replace(/\\times/g, "\u00d7")
      .replace(/\\div/g, "\u00f7")
      .replace(/\\pm/g, "\u00b1")
      .replace(/\\leq/g, "\u2264")
      .replace(/\\geq/g, "\u2265")
      .replace(/\\neq/g, "\u2260")
      .replace(/\\pi/g, "\u03c0")
      .replace(/\\theta/g, "\u03b8")
      .replace(/\\alpha/g, "\u03b1")
      .replace(/\\beta/g, "\u03b2")
      .replace(/\\gamma/g, "\u03b3")
      .replace(/\\delta/g, "\u03b4")
      .replace(/\^\{([^{}]+)\}/g, (_, run) => convertMathRun(run, SUPERSCRIPT_MAP))
      .replace(/_\{([^{}]+)\}/g, (_, run) => convertMathRun(run, SUBSCRIPT_MAP))
      .replace(/\^([A-Za-z0-9+\-=()])/g, (_, run) => convertMathRun(run, SUPERSCRIPT_MAP))
      .replace(/_([A-Za-z0-9+\-=()])/g, (_, run) => convertMathRun(run, SUBSCRIPT_MAP))
      .replace(/\\([A-Za-z]+)/g, "$1");
  }

  function angleDegrees(a, b, c, measure = "minor") {
    const ux = Number(a.x) - Number(b.x);
    const uy = Number(a.y) - Number(b.y);
    const vx = Number(c.x) - Number(b.x);
    const vy = Number(c.y) - Number(b.y);
    const mag = Math.hypot(ux, uy) * Math.hypot(vx, vy);
    if (!mag) return 0;
    const cosine = clamp((ux * vx + uy * vy) / mag, -1, 1);
    const degrees = (Math.acos(cosine) * 180) / Math.PI;
    if (measure === "reflex") return degrees === 0 ? 0 : 360 - degrees;
    return degrees;
  }

  function defaultPointLabel(index) {
    return `${POINT_PREFIX}${index + 1}`;
  }

  function pointsToText(points) {
    return (Array.isArray(points) ? points : [])
      .map((point, index) => `${cleanLabel(point.label, defaultPointLabel(index))}(${round(point.x)}, ${round(point.y)})`)
      .join(", ");
  }

  function normalizePointAttachment(attachment) {
    if (!attachment || typeof attachment !== "object") return null;
    const type = String(attachment.type || "");
    const targetId = cleanObjectId(attachment.targetId);
    if (!targetId || !["shape-vertex", "shape-edge", "shape-center", "circle", "function"].includes(type)) return null;

    if (type === "shape-vertex") {
      return {
        type,
        targetId,
        vertexIndex: Math.max(0, Math.floor(toNumber(attachment.vertexIndex, 0)))
      };
    }
    if (type === "shape-edge") {
      return {
        type,
        targetId,
        edgeIndex: Math.max(0, Math.floor(toNumber(attachment.edgeIndex, 0))),
        ratio: clamp(toNumber(attachment.ratio, 0.5), 0, 1)
      };
    }
    if (type === "circle") {
      return {
        type,
        targetId,
        angle: toNumber(attachment.angle, 0)
      };
    }
    if (type === "function") {
      return {
        type,
        targetId,
        x: toNumber(attachment.x, 0)
      };
    }
    return { type, targetId };
  }

  function normalizePoint(point, index = 0) {
    return {
      label: cleanLabel(point?.label, defaultPointLabel(index)),
      x: round(toNumber(point?.x, 0)),
      y: round(toNumber(point?.y, 0)),
      labelDx: toNumber(point?.labelDx, 8),
      labelDy: toNumber(point?.labelDy, -7),
      labelBasisWidth: Math.max(0, toNumber(point?.labelBasisWidth, 0)),
      labelBasisHeight: Math.max(0, toNumber(point?.labelBasisHeight, 0)),
      labelHidden: Boolean(point?.labelHidden),
      color: isHexColor(point?.color) ? point.color : DEFAULT_STROKE,
      size: clamp(toNumber(point?.size, 5), 2, 18),
      visible: point?.visible !== false,
      coordinateLabelMode: POINT_COORDINATE_LABEL_MODES.includes(point?.coordinateLabelMode) ? point.coordinateLabelMode : "name",
      coordinatePrecision: precisionDecimals(point?.coordinatePrecision, 2),
      coordinateVariable: cleanVariableLabel(point?.coordinateVariable),
      attachment: normalizePointAttachment(point?.attachment)
    };
  }

  function normalizeSegment(segment) {
    if (!segment || typeof segment !== "object") return null;
    const from = cleanLabel(segment.from);
    const to = cleanLabel(segment.to);
    if (!from || !to || from === to) return null;
    return {
      from,
      to,
      labelMode: ["name", "length", "variable", "hidden"].includes(segment.labelMode) ? segment.labelMode : "name",
      visible: segment.visible !== false,
      color: isHexColor(segment.color) ? segment.color : DEFAULT_STROKE,
      lineWidth: clamp(toNumber(segment.lineWidth, 2), 1, 12),
      lineDash: isLineStyle(segment.lineDash, { arrow: true }) ? segment.lineDash : "solid",
      showEndpointPoints: Boolean(segment.showEndpointPoints),
      variableLabel: cleanVariableLabel(segment.variableLabel),
      precision: precisionDecimals(segment.precision, segment.labelMode === "length" ? 2 : 2),
      labelDx: toNumber(segment.labelDx, 0),
      labelDy: toNumber(segment.labelDy, -10),
      labelBasisWidth: Math.max(0, toNumber(segment.labelBasisWidth, 0)),
      labelBasisHeight: Math.max(0, toNumber(segment.labelBasisHeight, 0))
    };
  }

  function normalizeAngle(angle) {
    if (!angle || typeof angle !== "object") return null;
    const from = cleanLabel(angle.from);
    const vertex = cleanLabel(angle.vertex);
    const to = cleanLabel(angle.to);
    if (!from || !vertex || !to || from === vertex || vertex === to) return null;
    return {
      from,
      vertex,
      to,
      labelMode: ["name", "value", "variable", "blank", "none"].includes(angle.labelMode) ? angle.labelMode : "value",
      angleMeasure: angle.angleMeasure === "reflex" ? "reflex" : "minor",
      variableLabel: cleanVariableLabel(angle.variableLabel),
      visible: angle.visible !== false,
      color: isHexColor(angle.color) ? angle.color : DEFAULT_STROKE,
      lineWidth: clamp(toNumber(angle.lineWidth, 2), 1, 8),
      radius: clamp(toNumber(angle.radius, 22), 8, 90),
      precision: precisionDecimals(angle.precision, 0),
      labelDx: toNumber(angle.labelDx, 0),
      labelDy: toNumber(angle.labelDy, 0),
      labelBasisWidth: Math.max(0, toNumber(angle.labelBasisWidth, 0)),
      labelBasisHeight: Math.max(0, toNumber(angle.labelBasisHeight, 0))
    };
  }

  function normalizeShapePoint(point, index = 0) {
    return {
      label: point?.label ? cleanLabel(point.label) : "",
      x: round(toNumber(point?.x, 0)),
      y: round(toNumber(point?.y, 0)),
      labelDx: toNumber(point?.labelDx, 8),
      labelDy: toNumber(point?.labelDy, -7),
      labelBasisWidth: Math.max(0, toNumber(point?.labelBasisWidth, 0)),
      labelBasisHeight: Math.max(0, toNumber(point?.labelBasisHeight, 0)),
      labelHidden: Boolean(point?.labelHidden),
      color: isHexColor(point?.color) ? point.color : DEFAULT_STROKE,
      size: clamp(toNumber(point?.size, 4), 2, 18)
    };
  }

  function projectedCircleRadiusPoint(shape = {}) {
    const center = normalizeShapePoint(shape.center || {});
    const radius = Math.max(0.1, toNumber(shape.radius, 2));
    const raw = normalizeShapePoint(shape.radiusPoint || { x: center.x + radius, y: center.y });
    const dx = raw.x - center.x;
    const dy = raw.y - center.y;
    const length = Math.hypot(dx, dy);
    const ux = length > 0 ? dx / length : 1;
    const uy = length > 0 ? dy / length : 0;
    return normalizeShapePoint({
      ...raw,
      x: center.x + ux * radius,
      y: center.y + uy * radius
    });
  }

  function normalizeCircuitTerminals(symbolKind, points, height, terminals, index = 0) {
    const source = Array.isArray(terminals) ? terminals : [];
    if (source.length) {
      return source.map((point, terminalIndex) => normalizeShapePoint({
        ...point,
        label: cleanLabel(point?.label, points[terminalIndex]?.label || `T${index + 1}${terminalIndex + 1}`),
        labelHidden: true
      }));
    }
    if (symbolKind !== "earth") {
      return points.map((point) => normalizeShapePoint({ ...point, labelHidden: true }));
    }
    const start = points[0] || { x: -1, y: 0 };
    const end = points[1] || { x: 1, y: 0 };
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy) || 1;
    const center = { x: start.x + dx / 2, y: start.y + dy / 2 };
    const normal = { x: -dy / length, y: dx / length };
    return [normalizeShapePoint({
      label: cleanLabel(start.label, `T${index + 1}1`),
      x: center.x + normal.x * Math.max(0.4, height) * 0.31,
      y: center.y + normal.y * Math.max(0.4, height) * 0.31,
      labelHidden: true,
      size: start.size || 4
    })];
  }

  function normalizeShape(shape, index = 0) {
    if (!shape || typeof shape !== "object") return null;
    const type = ["regularPolygon", "irregularPolygon", "circle", "trapezoid", "parallelogram", "latexText", "circuitSymbol"].includes(shape.type)
      ? shape.type
      : "irregularPolygon";
    const base = {
      id: cleanObjectId(shape.id || `${type}-${index + 1}`),
      type,
      label: String(shape.label || defaultShapeLabel(type)).trim(),
      visible: shape.visible !== false,
      stroke: isHexColor(shape.stroke) ? shape.stroke : DEFAULT_STROKE,
      fill: isHexColor(shape.fill) ? shape.fill : DEFAULT_FILL,
      fillOpacity: toOpacity(shape.fillOpacity),
      lineWidth: clamp(toNumber(shape.lineWidth, 2), 1, 12),
      lineDash: isLineStyle(shape.lineDash) ? shape.lineDash : "solid",
      constraint: ["rectangle"].includes(shape.constraint) ? shape.constraint : ""
    };
    if (type === "regularPolygon") {
      const sides = clamp(Math.floor(toNumber(shape.sides, 5)), 3, 24);
      return {
        ...base,
        sides,
        radius: Math.max(0.1, toNumber(shape.radius, 3)),
        rotation: toNumber(shape.rotation, 90),
        centerX: round(toNumber(shape.centerX, 0)),
        centerY: round(toNumber(shape.centerY, 0)),
        showCenter: Boolean(shape.showCenter),
        showApothem: Boolean(shape.showApothem),
        vertexLabels: Array.isArray(shape.vertexLabels) ? shape.vertexLabels.map((item) => cleanLabel(item)).slice(0, sides) : [],
        vertexLabelOffsets: Array.isArray(shape.vertexLabelOffsets) ? shape.vertexLabelOffsets.slice(0, sides) : [],
        vertexLabelHidden: Array.isArray(shape.vertexLabelHidden) ? shape.vertexLabelHidden.map(Boolean).slice(0, sides) : [],
        segmentLabelModes: normalizeSegmentLabelModes(shape.segmentLabelModes),
        segmentLabelOffsets: normalizeSegmentLabelOffsets(shape.segmentLabelOffsets)
      };
    }
    if (type === "circle") {
      const id = cleanObjectId(shape.id || `${type}-${index + 1}`);
      const center = normalizeShapePoint(shape.center);
      const radius = Math.max(0.1, toNumber(shape.radius, 2));
      let radiusPoint = normalizeShapePoint(shape.radiusPoint || { x: toNumber(shape.center?.x, 0) + radius, y: toNumber(shape.center?.y, 0) });
      if (shape.showCenter && !center.label) center.label = cleanLabel(`C${id}`);
      if (shape.showRadiusPoint && !radiusPoint.label) radiusPoint.label = cleanLabel(`R${id}`);
      radiusPoint = projectedCircleRadiusPoint({ center, radiusPoint, radius });
      return {
        ...base,
        center,
        radius,
        radiusPoint,
        showCenter: Boolean(shape.showCenter),
        showRadiusPoint: Boolean(shape.showRadiusPoint)
      };
    }
    if (type === "latexText") {
      return {
        ...base,
        text: String(shape.text || shape.label || ""),
        x: round(toNumber(shape.x, 0)),
        y: round(toNumber(shape.y, 0)),
        fontSize: clamp(toNumber(shape.fontSize, 18), 8, 96),
        fill: isHexColor(shape.fill) ? shape.fill : DEFAULT_STROKE
      };
    }
    if (type === "circuitSymbol") {
      const width = clamp(toNumber(shape.width, 3.6), 1, 20);
      const height = clamp(toNumber(shape.height, 1.6), 0.4, 10);
      const centerX = round(toNumber(shape.centerX, 0));
      const centerY = round(toNumber(shape.centerY, 0));
      const points = Array.isArray(shape.points) && shape.points.length >= 2
        ? shape.points.slice(0, 2).map((point, pointIndex) => normalizeShapePoint({
            ...point,
            label: cleanLabel(point.label, `T${index + 1}${pointIndex + 1}`),
            labelHidden: point.labelHidden !== false
          }))
        : [
            normalizeShapePoint({ label: `T${index + 1}1`, x: centerX - width / 2, y: centerY, labelHidden: true, size: 4 }),
            normalizeShapePoint({ label: `T${index + 1}2`, x: centerX + width / 2, y: centerY, labelHidden: true, size: 4 })
          ];
      return {
        ...base,
        label: String(shape.label || CIRCUIT_SYMBOL_LABELS[shape.symbolKind] || "Circuit symbol").trim(),
        symbolKind: CIRCUIT_SYMBOL_LABELS[shape.symbolKind] ? shape.symbolKind : "resistor",
        showTerminals: Boolean(shape.showTerminals),
        width,
        height,
        points,
        terminals: normalizeCircuitTerminals(shape.symbolKind, points, height, shape.terminals, index)
      };
    }
    return {
      ...base,
      points: Array.isArray(shape.points) ? shape.points.map(normalizeShapePoint) : [],
      segmentLabelModes: normalizeSegmentLabelModes(shape.segmentLabelModes),
      segmentLabelOffsets: normalizeSegmentLabelOffsets(shape.segmentLabelOffsets),
      targetSides: type === "irregularPolygon" ? Math.max(3, Math.floor(toNumber(shape.targetSides, shape.points?.length || 3))) : undefined
    };
  }

  function normalizeSegmentLabelModes(value) {
    const source = value && typeof value === "object" ? value : {};
    return Object.fromEntries(Object.entries(source)
      .filter(([, mode]) => ["name", "length", "variable", "hidden"].includes(mode))
      .map(([key, mode]) => [cleanObjectId(key), mode]));
  }

  function normalizeSegmentLabelOffsets(value) {
    const source = value && typeof value === "object" ? value : {};
    return Object.fromEntries(Object.entries(source).map(([key, offset]) => [cleanObjectId(key), {
      dx: toNumber(offset?.dx, 0),
      dy: toNumber(offset?.dy, -10),
      labelBasisWidth: Math.max(0, toNumber(offset?.labelBasisWidth, 0)),
      labelBasisHeight: Math.max(0, toNumber(offset?.labelBasisHeight, 0))
    }]));
  }

  function assignAngleVariableLabels(angles) {
    const used = new Set();
    return angles.map((angle) => {
      if (angle.labelMode !== "variable") return angle;
      let label = cleanVariableLabel(angle.variableLabel);
      if (!label || used.has(label.toLowerCase())) {
        label = ANGLE_VARIABLE_LABELS.find((item) => !used.has(item.toLowerCase())) || ANGLE_VARIABLE_LABELS[used.size % ANGLE_VARIABLE_LABELS.length];
      }
      used.add(label.toLowerCase());
      return { ...angle, variableLabel: label };
    });
  }

  function assignPointVariableLabels(points) {
    const used = new Set();
    return points.map((point, index) => {
      if (!["variableY", "xVariable", "nameVariableY", "nameXVariable"].includes(point.coordinateLabelMode)) return point;
      let label = cleanVariableLabel(point.coordinateVariable);
      if (!label || used.has(label.toLowerCase())) {
        label = POINT_VARIABLE_LABELS.find((item) => !used.has(item.toLowerCase()))
          || POINT_VARIABLE_LABELS[index % POINT_VARIABLE_LABELS.length];
      }
      used.add(label.toLowerCase());
      return { ...point, coordinateVariable: label };
    });
  }

  function normalizeFunctionCurve(curve = {}, index = 0) {
    return {
      id: cleanObjectId(curve.id || `function-${index + 1}`),
      expression: String(curve.expression || "").trim(),
      visible: curve.visible !== false,
      stroke: isHexColor(curve.stroke) ? curve.stroke : FUNCTION_COLORS[index % FUNCTION_COLORS.length],
      lineWidth: clamp(toNumber(curve.lineWidth, 2.5), 1, 12),
      lineDash: ["solid", "dashed", "dotted"].includes(curve.lineDash) ? curve.lineDash : "solid",
      label: String(curve.label || curve.functionLabel || "").trim(),
      xMin: curve.xMin === "" || curve.xMin === undefined ? "" : toNumber(curve.xMin, ""),
      xMax: curve.xMax === "" || curve.xMax === undefined ? "" : toNumber(curve.xMax, "")
    };
  }

  function normalizeGraph(graph = {}) {
    const points = assignPointVariableLabels(Array.isArray(graph.points) ? graph.points.map(normalizePoint) : []);
    const segments = Array.isArray(graph.segments) ? graph.segments.map(normalizeSegment).filter(Boolean) : [];
    const angles = assignAngleVariableLabels(Array.isArray(graph.angles) ? graph.angles.map(normalizeAngle).filter(Boolean) : []);
    const shapes = Array.isArray(graph.shapes) ? graph.shapes.map(normalizeShape).filter(Boolean) : [];
    const functionSource = Array.isArray(graph.functions)
      ? graph.functions
      : String(graph.expression || "").trim()
        ? [{
            id: "function-1",
            expression: graph.expression,
            visible: graph.functionVisible !== false,
            stroke: graph.functionStroke,
            lineWidth: graph.functionLineWidth,
            lineDash: graph.functionDash,
            label: graph.functionLabel,
            xMin: graph.functionXMin,
            xMax: graph.functionXMax
          }]
        : [];
    const functions = functionSource.map(normalizeFunctionCurve).filter((curve) => curve.expression);
    const primaryFunction = functions[0] || null;
    segments.filter((segment) => segment.showEndpointPoints).forEach((segment) => {
      [segment.from, segment.to].forEach((label) => {
        const point = points.find((item) => cleanLabel(item.label) === cleanLabel(label));
        if (point) point.color = segment.color;
      });
    });
    return {
      graphType: functions.length ? "function" : (["points", "polygon", "diagram"].includes(graph.graphType) ? graph.graphType : "diagram"),
      displayMode: graph.displayMode === "geometry" ? "geometry" : "coordinate",
      gridLayer: graph.gridLayer === "front" ? "front" : "behind",
      frameBorderStyle: FRAME_BORDER_STYLES.includes(graph.frameBorderStyle) ? graph.frameBorderStyle : "solid",
      title: String(graph.title || ""),
      functions,
      expression: primaryFunction?.expression || "",
      functionVisible: primaryFunction?.visible !== false,
      functionStroke: primaryFunction?.stroke || DEFAULT_STROKE,
      functionLineWidth: primaryFunction?.lineWidth || 2.5,
      functionDash: primaryFunction?.lineDash || "solid",
      functionLabel: primaryFunction?.label || "",
      functionXMin: primaryFunction?.xMin ?? "",
      functionXMax: primaryFunction?.xMax ?? "",
      pointsText: pointsToText(points),
      points,
      segments,
      angles,
      regularPolygon: null,
      shapes,
      autoFit: graph.autoFit === true,
      snapToGrid: Boolean(graph.snapToGrid),
      viewControls: Boolean(graph.viewControls),
      xMin: toNumber(graph.xMin, -10),
      xMax: toNumber(graph.xMax, 10),
      yMin: graph.yMin === "" ? "" : toNumber(graph.yMin, -10),
      yMax: graph.yMax === "" ? "" : toNumber(graph.yMax, 10)
    };
  }

  function cleanObjectId(value) {
    return String(value || "").trim().replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40) || `shape-${Date.now()}`;
  }

  function defaultShapeLabel(type) {
    const labels = {
      regularPolygon: "Regular polygon",
      irregularPolygon: "Irregular polygon",
      circle: "Circle",
      trapezoid: "Trapezoid",
      parallelogram: "Parallelogram",
      latexText: "Label",
      circuitSymbol: "Circuit symbol"
    };
    return labels[type] || "Shape";
  }

  function compileExpression(expression) {
    const source = String(expression || "").replace(/^y\s*=/i, "").trim();
    const allowedNames = new Set([
      "x", "e", "E", "pi", "PI",
      "abs", "acos", "asin", "atan", "ceil", "cos", "exp", "floor", "log",
      "max", "min", "pow", "round", "sin", "sqrt", "tan"
    ]);
    if (window.math?.parse) {
      const node = window.math.parse(source);
      node.traverse((child) => {
        if (child.isAssignmentNode || child.isFunctionAssignmentNode || child.isAccessorNode) {
          throw new Error("Unsupported function expression");
        }
        if (child.isSymbolNode && !allowedNames.has(child.name)) {
          throw new Error(`Unsupported function name: ${child.name}`);
        }
      });
      const compiled = node.compile();
      return (x) => Number(compiled.evaluate({ x, e: Math.E, E: Math.E, pi: Math.PI, PI: Math.PI }));
    }

    const identifiers = source.match(/[A-Za-z_][A-Za-z0-9_]*/g) || [];
    if (identifiers.some((name) => !allowedNames.has(name)) || /[^0-9A-Za-z_+\-*/().,^\s]/.test(source)) {
      throw new Error("Unsupported function expression");
    }
    const clean = source.replace(/\^/g, "**");
    return new Function(
      "x",
      `"use strict"; const {abs,acos,asin,atan,ceil,cos,exp,floor,log,max,min,pow,round,sin,sqrt,tan,PI,E} = Math; return (${clean});`
    );
  }

  function getRegularPolygonPoints(shape) {
    const sides = clamp(Math.floor(toNumber(shape.sides, 5)), 3, 24);
    const radius = Math.max(0.1, toNumber(shape.radius, 3));
    const rotation = (toNumber(shape.rotation, 90) * Math.PI) / 180;
    return Array.from({ length: sides }, (_, index) => {
      const angle = rotation + (index * 2 * Math.PI) / sides;
      const offset = shape.vertexLabelOffsets?.[index] || {};
      return {
        label: cleanLabel(shape.vertexLabels?.[index], defaultPointLabel(index)),
        x: round(toNumber(shape.centerX, 0) + radius * Math.cos(angle)),
        y: round(toNumber(shape.centerY, 0) + radius * Math.sin(angle)),
        labelDx: toNumber(offset.dx, 8),
        labelDy: toNumber(offset.dy, -7),
        labelBasisWidth: Math.max(0, toNumber(offset.labelBasisWidth, 0)),
        labelBasisHeight: Math.max(0, toNumber(offset.labelBasisHeight, 0)),
        labelHidden: Boolean(shape.vertexLabelHidden?.[index]),
        color: shape.stroke || DEFAULT_STROKE,
        size: 4
      };
    });
  }

  function shapePoints(shape) {
    if (!shape) return [];
    if (shape.type === "regularPolygon") return getRegularPolygonPoints(shape);
    if (["irregularPolygon", "trapezoid", "parallelogram"].includes(shape.type)) return shape.points || [];
    if (shape.type === "circuitSymbol") return shape.points || [];
    if (shape.type === "circle") {
      const id = cleanObjectId(shape.id || "circle");
      const radiusPoint = projectedCircleRadiusPoint(shape);
      return [
        {
          ...shape.center,
          label: shape.showCenter ? cleanLabel(shape.center?.label, `C${id}`) : "",
          labelHidden: true
        },
        {
          ...radiusPoint,
          label: shape.showRadiusPoint ? cleanLabel(shape.radiusPoint?.label, `R${id}`) : "",
          labelHidden: true
        }
      ];
    }
    if (shape.type === "latexText") return [{ x: shape.x, y: shape.y }];
    return [];
  }

  function connectionPointsForShape(shape) {
    if (!shape) return [];
    if (shape.type === "circuitSymbol") {
      return Array.isArray(shape.terminals) && shape.terminals.length ? shape.terminals : (shape.points || []);
    }
    return shapePoints(shape);
  }

  function pointInPolygon(point, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const a = polygon[i];
      const b = polygon[j];
      const intersects = ((a.y > point.y) !== (b.y > point.y)) &&
        point.x < ((b.x - a.x) * (point.y - a.y)) / ((b.y - a.y) || 1) + a.x;
      if (intersects) inside = !inside;
    }
    return inside;
  }

  function isRectangleShape(shape) {
    return shape?.constraint === "rectangle" || String(shape?.label || "").trim().toLowerCase() === "rectangle";
  }

  function averagePoint(points) {
    const valid = (Array.isArray(points) ? points : []).filter((point) => Number.isFinite(Number(point.x)) && Number.isFinite(Number(point.y)));
    if (!valid.length) return { x: 0, y: 0 };
    return {
      x: valid.reduce((sum, point) => sum + Number(point.x), 0) / valid.length,
      y: valid.reduce((sum, point) => sum + Number(point.y), 0) / valid.length
    };
  }

  function unitVector(from, to, fallback = { x: 1, y: 0 }) {
    const dx = Number(to.x) - Number(from.x);
    const dy = Number(to.y) - Number(from.y);
    const length = Math.hypot(dx, dy);
    return length ? { x: dx / length, y: dy / length } : fallback;
  }

  function dot(a, b) {
    return a.x * b.x + a.y * b.y;
  }

  function rotatePointAround(point, center, angle) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    return {
      x: round(center.x + dx * cos - dy * sin),
      y: round(center.y + dx * sin + dy * cos)
    };
  }

  function copyPointMeta(source, geometry) {
    return normalizeShapePoint({
      ...source,
      x: geometry.x,
      y: geometry.y
    });
  }

  function baseLineSettings(overrides = {}) {
    return {
      stroke: DEFAULT_STROKE,
      lineWidth: 2,
      lineDash: "solid",
      ...overrides
    };
  }

  function baseFillSettings(overrides = {}) {
    return {
      ...baseLineSettings(),
      fill: DEFAULT_FILL,
      fillOpacity: 0.36,
      ...overrides
    };
  }

  function defaultToolSettings() {
    return {
      point: {
        stroke: DEFAULT_STROKE,
        label: "",
        coordinateX: "",
        coordinateY: "",
        coordinateLabelMode: "name",
        coordinatePrecision: 2,
        coordinateVariable: ""
      },
      segment: baseLineSettings({ showEndpointPoints: false }),
      referenceLine: baseLineSettings({ lineDash: "dashed" }),
      distance: { ...baseLineSettings(), precision: 2 },
      angle: { stroke: DEFAULT_STROKE, lineWidth: 2, radius: 22, labelMode: "value", angleMeasure: "minor", precision: 0 },
      irregularPolygon: { ...baseFillSettings(), sides: 5 },
      regularPolygon: { ...baseFillSettings(), sides: 5, radius: 3, rotation: 90, showCenter: false, showApothem: false },
      function: { expression: "", stroke: DEFAULT_STROKE, lineWidth: 2.5, lineDash: "solid", functionLabel: "", functionXMin: "", functionXMax: "" },
      label: { text: "Label", fill: DEFAULT_STROKE, fontSize: 22 },
      symbol: { symbolKind: "resistor", stroke: DEFAULT_STROKE, lineWidth: 2, width: 3.8, height: 1.6, showTerminals: false },
      rectangle: baseFillSettings({ radius: 3 }),
      trapezoid: baseFillSettings({ radius: 3 }),
      parallelogram: baseFillSettings({ radius: 3 }),
      circle: { ...baseFillSettings(), showCenter: false, showRadiusPoint: false }
    };
  }

  function lineStyleOptions(options = {}) {
    const base = [
      { value: "solid", label: "Solid" },
      { value: "dashed", label: "Dashed" },
      { value: "dotted", label: "Dotted" }
    ];
    if (options.arrow) base.push({ value: "arrow", label: "Arrow" });
    return base;
  }

  function modalFieldsForTool(tool) {
    const lineFields = [
      { name: "stroke", label: "Line color", type: "color" },
      { name: "lineWidth", label: "Line width", type: "number", min: 1, max: 12, step: 0.5 },
      { name: "lineDash", label: "Line style", type: "select", options: lineStyleOptions() }
    ];
    const fillFields = [
      { name: "fill", label: "Fill color", type: "color" },
      { name: "fillOpacity", label: "Fill opacity", type: "number", min: 0, max: 1, step: 0.01 }
    ];
    const precisionField = { name: "precision", label: "Accuracy", type: "select", options: [
      { value: "0", label: "Whole number" },
      { value: "1", label: "Tenths" },
      { value: "2", label: "Hundredths" },
      { value: "3", label: "Thousandths" }
    ] };
    const shapeStyleFields = [...lineFields, ...fillFields];

    if (tool === "point") {
      return [
        { name: "stroke", label: "Color", type: "color" },
        { name: "label", label: "Point name (optional)", type: "text", optional: true, placeholder: "Auto: P1, P2..." },
        { name: "coordinateX", label: "X coordinate (optional)", type: "number", step: 0.01, optional: true, placeholder: "Click canvas instead" },
        { name: "coordinateY", label: "Y coordinate (optional)", type: "number", step: 0.01, optional: true, placeholder: "Click canvas instead" },
        { name: "coordinateLabelMode", label: "Point label", type: "select", options: [
          { value: "name", label: "Standard point label" },
          { value: "variableY", label: "(variable, y-value)" },
          { value: "xVariable", label: "(x-value, variable)" },
          { value: "coordinates", label: "(x-value, y-value)" },
          { value: "nameVariableY", label: "Point label (variable, y-value)" },
          { value: "nameXVariable", label: "Point label (x-value, variable)" },
          { value: "nameCoordinates", label: "Point label (x-value, y-value)" }
        ], wide: true },
        { name: "coordinateVariable", label: "Unknown coordinate label (optional)", type: "text", optional: true, placeholder: "Auto: x, y..." },
        { name: "coordinatePrecision", label: "Coordinate accuracy", type: "select", options: [
          { value: "0", label: "Whole number" },
          { value: "1", label: "Tenths" },
          { value: "2", label: "Hundredths" },
          { value: "3", label: "Thousandths" }
        ] }
      ];
    }
    if (tool === "segment") {
      return [
        { name: "stroke", label: "Line color", type: "color" },
        { name: "lineWidth", label: "Line width", type: "number", min: 1, max: 12, step: 0.5 },
        { name: "lineDash", label: "Line style", type: "select", options: lineStyleOptions({ arrow: true }) },
        { name: "showEndpointPoints", label: "Show endpoint points", type: "checkbox" }
      ];
    }
    if (tool === "referenceLine") return lineFields;
    if (tool === "distance") return [...lineFields, precisionField];
    if (tool === "angle") {
      return [
        { name: "stroke", label: "Arc color", type: "color" },
        { name: "lineWidth", label: "Arc width", type: "number", min: 1, max: 8, step: 0.5 },
        { name: "radius", label: "Arc radius", type: "number", min: 8, max: 90, step: 1 },
        { name: "angleMeasure", label: "Measured angle", type: "select", options: [
          { value: "minor", label: "Smaller angle" },
          { value: "reflex", label: "Larger angle" }
        ] },
        precisionField,
        { name: "labelMode", label: "Label", type: "select", options: [
          { value: "value", label: "Angle value" },
          { value: "name", label: "Angle name" },
          { value: "variable", label: "Variable x" },
          { value: "blank", label: "Blank" }
        ] }
      ];
    }
    if (tool === "irregularPolygon") {
      return [
        { name: "sides", label: "Number of sides", type: "number", min: 3, max: 24, step: 1 },
        ...shapeStyleFields
      ];
    }
    if (tool === "regularPolygon") {
      return [
        { name: "sides", label: "Number of sides", type: "number", min: 3, max: 24, step: 1 },
        { name: "radius", label: "Radius / size", type: "number", min: 0.1, max: 50, step: 0.1 },
        { name: "rotation", label: "Rotation", type: "number", min: -360, max: 360, step: 1 },
        ...shapeStyleFields,
        { name: "showCenter", label: "Show center", type: "checkbox" },
        { name: "showApothem", label: "Show apothem", type: "checkbox" }
      ];
    }
    if (tool === "function") {
      return [
        { name: "expression", label: "Function expression", type: "text", placeholder: "Example: x^2 - 4", wide: true },
        { name: "stroke", label: "Line color", type: "color" },
        { name: "lineWidth", label: "Line width", type: "number", min: 1, max: 12, step: 0.5 },
        { name: "lineDash", label: "Line style", type: "select", options: lineStyleOptions() },
        { name: "functionLabel", label: "Optional label", type: "text", placeholder: "Example: f(x)", wide: true },
        { name: "functionXMin", label: "Domain x min", type: "number", step: 0.5, optional: true, placeholder: "Full x-axis" },
        { name: "functionXMax", label: "Domain x max", type: "number", step: 0.5, optional: true, placeholder: "Full x-axis" }
      ];
    }
    if (tool === "label") {
      return [
        { name: "text", label: "Label text / LaTeX", type: "text", placeholder: "Example: sqrt{x}, frac{a}{b}, x^{2}", wide: true },
        { name: "fill", label: "Text color", type: "color" },
        { name: "fontSize", label: "Font size", type: "number", min: 8, max: 96, step: 1 }
      ];
    }
    if (tool === "symbol") {
      return [
        { name: "symbolKind", label: "Symbol", type: "select", options: CIRCUIT_SYMBOLS.map(([value, label]) => ({ value, label })), wide: true },
        { name: "stroke", label: "Line color", type: "color" },
        { name: "lineWidth", label: "Line width", type: "number", min: 1, max: 12, step: 0.5 },
        { name: "width", label: "Width", type: "number", min: 1, max: 20, step: 0.1 },
        { name: "height", label: "Height", type: "number", min: 0.4, max: 10, step: 0.1 },
        { name: "showTerminals", label: "Show terminal points", type: "checkbox" }
      ];
    }
    if (tool === "circle") {
      return [
        ...shapeStyleFields,
        { name: "showCenter", label: "Show center", type: "checkbox" },
        { name: "showRadiusPoint", label: "Show second point", type: "checkbox" }
      ];
    }
    if (["rectangle", "trapezoid", "parallelogram"].includes(tool)) return shapeStyleFields;
    return [];
  }

  class KelpDiagramEditor {
    constructor(host, options = {}) {
      this.host = host;
      this.options = options;
      const previousEditor = this.host.__kelpDiagramEditor;
      if (previousEditor && previousEditor !== this) previousEditor.destroy?.();
      this.host.__kelpDiagramEditor = this;
      this.boundListeners = [];
      const requestedTools = Array.isArray(options.tools) ? new Set(options.tools) : null;
      this.availableTools = TOOLS.filter(([id]) => id === "select" || !requestedTools || requestedTools.has(id));
      this.availableToolIds = new Set(this.availableTools.map(([id]) => id));
      this.graph = normalizeGraph(options.graph || {});
      this.tool = "select";
      this.pending = null;
      this.selected = null;
      this.selectedMany = [];
      this.drag = null;
      this.history = [];
      this.redoStack = [];
      this.toolSettings = defaultToolSettings();
      this.syncToolSettingsFromGraph();
      this.previewPoint = null;
      this.meta = null;
      this.destroyed = false;
      this.drawDeferred = false;
      this.handleDocumentPointerDown = null;
      this.handleWindowScroll = null;
      this.renderShell();
      this.bind();
      this.syncControls();
      this.draw();
      this.renderObjects();
    }

    renderShell() {
      const usesSideToolLayout = Boolean(this.options.sideToolLayout);
      const showsGridLayerControl = Boolean(this.options.showGridLayerControl);
      this.host.classList.add("kelp-diagram-editor");
      this.host.classList.toggle("kde-side-tool-layout", usesSideToolLayout);
      if (!this.host.hasAttribute("tabindex")) this.host.tabIndex = -1;
      this.host.innerHTML = `
        <div class="kde-toolbar" aria-label="Diagram tools">
          ${this.availableTools.filter(([id]) => id !== "select").map(([id, label]) => `<button type="button" class="kde-tool" data-kelp-tool="${id}" aria-pressed="${id === this.tool}">${label}</button>`).join("")}
          <button
            type="button"
            class="kde-help"
            aria-label="Help for diagram tool shortcuts"
            data-help-position="below"
            data-help-text="${escapeHTML(TOOL_SHORTCUT_HELP).replace(/\n/g, "&#10;")}"
            title="Help for diagram tool shortcuts."
          >?</button>
        </div>

        <div class="kde-layout">
          <aside class="kde-panel kde-settings" aria-label="Diagram settings">
            ${usesSideToolLayout ? "" : `<div class="kde-field">
              <label>Diagram label</label>
              <input type="text" data-kelp-field="title" placeholder="Example: Triangle ABC" />
            </div>`}

            <div class="kde-grid-3">
              <label class="kde-check" title="Snap the cursor to intersections, points, lines, shapes, functions, and then the grid."><input type="checkbox" data-kelp-field="snapToGrid" /> Stick</label>
              <label class="kde-check" title="Fit the view around the objects currently drawn."><input type="checkbox" data-kelp-field="autoFit" /> Auto-fit</label>
              <label class="kde-check" title="Use the Select tool with Ctrl or Command plus the mouse wheel to zoom and right-drag to pan."><input type="checkbox" data-kelp-field="viewControls" /> Move view</label>
            </div>

            <div class="kde-field">
              <label>Display</label>
              <select data-kelp-field="displayMode">
                <option value="coordinate">Algebraic</option>
                <option value="geometry">Geometry only</option>
              </select>
            </div>

            ${showsGridLayerControl ? `<div class="kde-field kde-grid-layer-field">
              <label>Grid position</label>
              <div class="kde-grid-layer-toggle" role="group" aria-label="Grid position relative to the diagram">
                <button type="button" data-kelp-grid-layer="behind" aria-pressed="true">Behind drawing</button>
                <button type="button" data-kelp-grid-layer="front" aria-pressed="false">In front</button>
              </div>
            </div>` : ""}

            <div class="kde-field">
              <label>Frame border</label>
              <select data-kelp-field="frameBorderStyle">
                <option value="none">None</option>
                <option value="solid">Solid</option>
                <option value="dashed">Dashed</option>
                <option value="dotted">Dotted</option>
              </select>
            </div>

            <div class="kde-grid-4">
              <div class="kde-field"><label>x min</label><input type="number" step="1" data-kelp-field="xMin" /></div>
              <div class="kde-field"><label>x max</label><input type="number" step="1" data-kelp-field="xMax" /></div>
              <div class="kde-field"><label>y min</label><input type="number" step="1" data-kelp-field="yMin" /></div>
              <div class="kde-field"><label>y max</label><input type="number" step="1" data-kelp-field="yMax" /></div>
            </div>

            ${usesSideToolLayout ? "" : `<div class="kde-object-panel" aria-label="Diagram objects">
              <div class="kde-object-title">Objects</div>
              <div class="kde-object-list" data-kelp-objects></div>
            </div>`}
          </aside>

          <div class="kde-stage-wrap">
            <div class="kde-stage-actions" aria-label="Diagram actions">
              <button type="button" class="kde-tool kde-select-tool" data-kelp-tool="select" aria-pressed="true" title="Select, move, resize, or rotate diagram objects.">Select</button>
              <button type="button" class="kde-action" data-kelp-action="undo" title="Undo the latest diagram change (Ctrl+Z).">Undo</button>
              <button type="button" class="kde-action" data-kelp-action="redo" title="Restore the most recently undone change (Ctrl+Y).">Redo</button>
              <button type="button" class="kde-action" data-kelp-action="delete" title="Delete every currently selected object.">Delete</button>
              <button type="button" class="kde-action" data-kelp-action="clear" title="Remove every object from this diagram.">Clear</button>
              <button type="button" class="kde-action" data-kelp-action="resetView" title="Return both axes to the range from -10 to 10.">Reset view</button>
              <button type="button" class="kde-action primary" data-kelp-action="attach" title="${escapeHTML(this.options.attachTitle || "Attach this diagram to the question body.")}">${escapeHTML(this.options.attachLabel || "Attach diagram")}</button>
              <button
                type="button"
                class="kde-help"
                aria-label="Help for diagram actions"
                data-help-position="above"
                data-help-text="Diagram actions:&#10;- Undo / Redo: move through recent changes.&#10;- Delete: remove the current selection.&#10;- Clear: remove the whole drawing.&#10;- Reset view: restore both axes to -10 through 10.&#10;- Attach diagram: attach this diagram to the question body. Use each graph answer option's own button for option diagrams."
                title="Help for Undo, Redo, Delete, Clear, Reset view, and Attach diagram."
              >?</button>
            </div>
            <canvas class="kde-canvas" data-kelp-canvas tabindex="0" aria-label="Kelp diagram editor canvas"></canvas>
            <p class="kde-status" data-kelp-status></p>
            <div class="kde-modal-root" data-kelp-modal-root></div>
          </div>
        </div>

      `;
      this.canvas = this.host.querySelector("[data-kelp-canvas]");
      this.status = this.host.querySelector("[data-kelp-status]");
      this.objectList = this.host.querySelector("[data-kelp-objects]");
      this.modalRoot = this.host.querySelector("[data-kelp-modal-root]");
      if (this.options.sideToolLayout) {
        const layout = this.host.querySelector(".kde-layout");
        const stage = this.host.querySelector(".kde-stage-wrap");
        const toolbar = this.host.querySelector(".kde-toolbar");
        const actions = this.host.querySelector(".kde-stage-actions");
        if (layout && stage && toolbar && actions) {
          const rail = document.createElement("aside");
          rail.className = "kde-side-tool-rail";
          rail.setAttribute("aria-label", "Diagram tools and actions");
          layout.insertBefore(rail, stage);
          rail.append(toolbar, actions);
        }
      }
      this.host.querySelectorAll(".kde-help[title]").forEach((button) => {
        if (!button.dataset.helpText) button.dataset.helpText = button.title;
        button.removeAttribute("title");
      });
    }

    listen(target, type, handler, options) {
      target.addEventListener(type, handler, options);
      this.boundListeners.push({ target, type, handler, options });
    }

    bind() {
      this.listen(this.host, "click", (event) => {
        const helpButton = event.target.closest(".kde-help");
        if (helpButton) {
          event.preventDefault();
          this.showHelpPopover(helpButton);
          return;
        }

        const functionEdit = event.target.closest("[data-kelp-function-edit]");
        if (functionEdit) {
          const functionIndex = Number(functionEdit.dataset.kelpFunctionEdit);
          if (Number.isInteger(functionIndex)) this.editFunction(functionIndex);
          return;
        }

        const gridLayerButton = event.target.closest("[data-kelp-grid-layer]");
        if (gridLayerButton) {
          const gridLayer = gridLayerButton.dataset.kelpGridLayer === "front" ? "front" : "behind";
          if (gridLayer !== this.graph.gridLayer) {
            this.pushHistory();
            this.graph.gridLayer = gridLayer;
            this.syncControls();
            this.emitChange("Grid position updated.");
          }
          return;
        }

        const toolButton = event.target.closest("[data-kelp-tool]");
        if (toolButton) {
          this.setTool(toolButton.dataset.kelpTool);
          return;
        }

        const action = event.target.closest("[data-kelp-action]");
        if (action) {
          this.handleAction(action.dataset.kelpAction);
          return;
        }

        const object = event.target.closest("[data-kelp-object-id]");
        if (object) {
          const hit = this.parseObjectId(object.dataset.kelpObjectId);
          if (event.ctrlKey || event.metaKey) this.toggleSelection(hit);
          else {
            this.selected = hit;
            this.selectedMany = hit ? [hit] : [];
          }
          this.setTool("select");
          this.draw();
          this.renderObjects();
        }
      });

      this.listen(this.host, "pointerover", (event) => {
        const helpButton = event.target.closest(".kde-help");
        if (helpButton) this.showHelpPopover(helpButton);
      });
      this.listen(this.host, "pointerout", (event) => {
        const helpButton = event.target.closest(".kde-help");
        if (helpButton && !helpButton.contains(event.relatedTarget)) this.hideHelpPopover();
      });
      this.listen(this.host, "focusin", (event) => {
        const helpButton = event.target.closest(".kde-help");
        if (helpButton) this.showHelpPopover(helpButton);
      });
      this.listen(this.host, "focusout", (event) => {
        const helpButton = event.target.closest(".kde-help");
        if (helpButton && !helpButton.contains(event.relatedTarget)) this.hideHelpPopover();
      });

      this.listen(this.host, "input", (event) => {
        if (!event.target.matches("[data-kelp-field]")) return;
        this.updateGraphFromControls();
      });

      this.listen(this.canvas, "pointerdown", (event) => {
        if (event.button === 0) event.preventDefault();
        this.canvas.focus?.({ preventScroll: true });
        this.handlePointerDown(event);
      });
      this.listen(this.canvas, "pointermove", (event) => this.handlePointerMove(event));
      this.listen(this.canvas, "pointerup", (event) => this.finishDrag(event));
      this.listen(this.canvas, "pointercancel", (event) => this.finishDrag(event));
      this.listen(this.canvas, "wheel", (event) => this.handleWheel(event), { passive: false });
      this.listen(this.canvas, "contextmenu", (event) => {
        if (this.graph.viewControls && this.tool === "select") event.preventDefault();
      });
      this.listen(this.canvas, "pointerleave", () => {
        this.previewPoint = null;
        if (!this.drag) this.draw();
      });

      this.listen(this.host, "keydown", (event) => {
        const editing = event.target?.closest?.("input, textarea, select") || event.target?.isContentEditable;
        if (editing) return;
        const shortcutKey = String(event.key || "").toLowerCase();
        if ((event.ctrlKey || event.metaKey) && shortcutKey === "z") {
          this.handleAction("undo");
          event.preventDefault();
          return;
        }
        if ((event.ctrlKey || event.metaKey) && shortcutKey === "y") {
          this.handleAction("redo");
          event.preventDefault();
          return;
        }
        if (this.handleShortcut(event)) return;
        if (event.key === "Delete" || event.key === "Backspace") {
          this.deleteSelected();
          event.preventDefault();
        }
        if (event.key === "Escape") {
          this.hideHelpPopover();
          this.clearSelection();
          event.preventDefault();
        }
      });

      this.handleDocumentPointerDown = (event) => {
        if (!event.target.closest?.(".kde-help")) this.hideHelpPopover();
      };
      this.handleWindowScroll = () => this.hideHelpPopover();
      document.addEventListener("pointerdown", this.handleDocumentPointerDown);
      window.addEventListener("scroll", this.handleWindowScroll, true);

      if (window.ResizeObserver) {
        this.resizeObserver = new ResizeObserver(() => this.draw());
        this.resizeObserver.observe(this.host);
      }
    }

    handleShortcut(event) {
      if (!event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return false;
      if (this.modalRoot?.querySelector("[data-kelp-modal]")) return false;
      if (event.code === "Space" || event.key === " " || event.key === "Spacebar") {
        this.handleAction("attach");
        event.preventDefault();
        return true;
      }
      const shortcutKey = String(event.key || "").toLowerCase();
      const toolShortcuts = {
        q: "point",
        w: "segment",
        e: "regularPolygon",
        d: "irregularPolygon",
        f: "function",
        a: "angle",
        z: "trapezoid",
        x: "parallelogram",
        s: "select"
      };
      if (toolShortcuts[shortcutKey]) {
        this.setTool(toolShortcuts[shortcutKey]);
        event.preventDefault();
        return true;
      }
      if (shortcutKey === "r") {
        this.handleAction("resetView");
        event.preventDefault();
        return true;
      }
      if (shortcutKey === "v") {
        this.graph.viewControls = !this.graph.viewControls;
        this.syncControls();
        this.emitChange(this.graph.viewControls ? "Move view turned on." : "Move view turned off.");
        event.preventDefault();
        return true;
      }
      if (shortcutKey === "t") {
        this.graph.snapToGrid = !this.graph.snapToGrid;
        this.syncControls();
        this.emitChange(this.graph.snapToGrid ? "Stick turned on." : "Stick turned off.");
        event.preventDefault();
        return true;
      }
      if (shortcutKey === "c") {
        this.handleAction("clear");
        event.preventDefault();
        return true;
      }
      return false;
    }

    toggleHelpPopover(button) {
      if (this.activeHelpButton === button && this.helpPopover?.classList.contains("is-visible")) {
        this.hideHelpPopover();
        return;
      }
      this.showHelpPopover(button);
    }

    showHelpPopover(button) {
      const text = String(button?.dataset?.helpText || button?.title || "").trim();
      if (!button || !text) return;
      if (!this.helpPopover) {
        this.helpPopover = document.createElement("div");
        this.helpPopover.className = "kde-help-popover";
        this.helpPopover.setAttribute("role", "tooltip");
        document.body.appendChild(this.helpPopover);
      }

      this.activeHelpButton = button;
      this.helpPopover.textContent = text;
      this.helpPopover.classList.remove("is-visible");
      this.helpPopover.style.left = "0px";
      this.helpPopover.style.top = "0px";
      this.helpPopover.style.visibility = "hidden";

      const buttonRect = button.getBoundingClientRect();
      const popoverRect = this.helpPopover.getBoundingClientRect();
      const margin = 12;
      const gap = 9;
      const wantsAbove = button.dataset.helpPosition === "above";
      const fitsAbove = buttonRect.top >= popoverRect.height + gap + margin;
      const placeAbove = wantsAbove ? fitsAbove : !((window.innerHeight - buttonRect.bottom) >= popoverRect.height + gap + margin) && fitsAbove;
      const left = clamp(buttonRect.right - popoverRect.width, margin, Math.max(margin, window.innerWidth - popoverRect.width - margin));
      const top = placeAbove
        ? buttonRect.top - popoverRect.height - gap
        : Math.min(window.innerHeight - popoverRect.height - margin, buttonRect.bottom + gap);

      this.helpPopover.style.left = `${Math.round(left)}px`;
      this.helpPopover.style.top = `${Math.round(Math.max(margin, top))}px`;
      this.helpPopover.style.visibility = "visible";
      requestAnimationFrame(() => {
        if (this.activeHelpButton === button) this.helpPopover.classList.add("is-visible");
      });
      button.setAttribute("aria-expanded", "true");
    }

    hideHelpPopover() {
      if (this.activeHelpButton) this.activeHelpButton.setAttribute("aria-expanded", "false");
      this.activeHelpButton = null;
      this.helpPopover?.classList.remove("is-visible");
    }

    setTool(tool) {
      this.tool = this.availableToolIds.has(tool) ? tool : "select";
      if (!["segment", "referenceLine", "distance", "angle", "circle", "irregularPolygon"].includes(this.tool)) {
        this.pending = null;
      }
      this.host.querySelectorAll("[data-kelp-tool]").forEach((button) => {
        const active = button.dataset.kelpTool === this.tool;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-pressed", String(active));
      });
      this.setStatus(this.getToolHint());
      this.draw();
      const skipToolSettings = Array.isArray(this.options.skipToolSettings)
        && this.options.skipToolSettings.includes(this.tool);
      if (this.tool !== "select" && !skipToolSettings) this.openToolSettingsModal(this.tool);
    }

    openToolSettingsModal(tool, options = {}) {
      const fields = modalFieldsForTool(tool);
      if (!fields.length || !this.modalRoot) return;
      const settings = options.settings || this.settingsFor(tool);
      const isFunctionEdit = tool === "function" && Number.isInteger(options.functionIndex);
      const title = isFunctionEdit ? "Edit function" : (TOOLS.find(([id]) => id === tool)?.[1] || "Tool");
      const modalTitle = isFunctionEdit ? title : `${title} settings`;
      const fieldHtml = fields.map((field) => this.modalFieldHTML(field, settings[field.name])).join("");
      this.modalRoot.innerHTML = `
        <div class="kde-modal-backdrop" data-kelp-modal-backdrop>
          <form class="kde-modal" data-kelp-modal>
            <header class="kde-modal-header">
              <div>
                <h3>${escapeHTML(modalTitle)}</h3>
              </div>
              <button type="button" class="kde-modal-close" data-kelp-modal-close aria-label="Close">X</button>
            </header>
            <div class="kde-modal-grid">${fieldHtml}</div>
            <footer class="kde-modal-actions">
              <button type="button" class="kde-action" data-kelp-modal-cancel>Cancel</button>
              <button type="submit" class="kde-action primary">${isFunctionEdit ? "Save function" : "Use tool"}</button>
            </footer>
          </form>
        </div>
      `;

      const form = this.modalRoot.querySelector("[data-kelp-modal]");
      const close = () => {
        this.modalRoot.innerHTML = "";
        this.host.focus?.({ preventScroll: true });
      };
      this.modalRoot.querySelector("[data-kelp-modal-close]")?.addEventListener("click", close);
      this.modalRoot.querySelector("[data-kelp-modal-cancel]")?.addEventListener("click", close);
      this.modalRoot.querySelector("[data-kelp-modal-backdrop]")?.addEventListener("click", (event) => {
        if (event.target.matches("[data-kelp-modal-backdrop]")) close();
      });
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const nextSettings = this.readModalSettings(form, fields, tool);
        if (tool === "function" && !String(nextSettings.expression || "").trim()) {
          const expressionInput = form.elements.expression;
          expressionInput?.setCustomValidity("Enter a function expression.");
          expressionInput?.reportValidity();
          expressionInput?.addEventListener("input", () => expressionInput.setCustomValidity(""), { once: true });
          return;
        }
        if (tool === "point") {
          const hasX = nextSettings.coordinateX !== "";
          const hasY = nextSettings.coordinateY !== "";
          if (hasX !== hasY) {
            const missingInput = form.elements[hasX ? "coordinateY" : "coordinateX"];
            missingInput?.setCustomValidity("Enter both coordinates, or leave both blank to place the point on the canvas.");
            missingInput?.reportValidity();
            missingInput?.addEventListener("input", () => missingInput.setCustomValidity(""), { once: true });
            return;
          }
        }
        this.toolSettings[tool] = nextSettings;
        close();
        if (tool === "point" && nextSettings.coordinateX !== "" && nextSettings.coordinateY !== "") {
          this.pushHistory();
          const point = this.addConfiguredPoint({
            x: nextSettings.coordinateX,
            y: nextSettings.coordinateY
          });
          this.toolSettings.point.coordinateX = "";
          this.toolSettings.point.coordinateY = "";
          this.emitChange(`${point.label} added at (${formatCoordinate(point.x, point.coordinatePrecision)}, ${formatCoordinate(point.y, point.coordinatePrecision)}).`);
        } else if (tool === "function") {
          this.applyFunctionSettings(options.functionIndex);
        } else {
          this.setStatus(this.getToolHint());
          this.draw();
        }
      });
    }

    modalFieldHTML(field, value) {
      const fieldClass = field.wide ? "kde-field wide" : "kde-field";
      if (field.type === "select") {
        const options = (field.options || []).map((option) => {
          const selected = String(option.value) === String(value) ? " selected" : "";
          return `<option value="${escapeHTML(option.value)}"${selected}>${escapeHTML(option.label)}</option>`;
        }).join("");
        return `<div class="${fieldClass}"><label>${escapeHTML(field.label)}</label><select name="${escapeHTML(field.name)}">${options}</select></div>`;
      }
      if (field.type === "checkbox") {
        return `<label class="kde-check"><input type="checkbox" name="${escapeHTML(field.name)}"${value ? " checked" : ""} /> ${escapeHTML(field.label)}</label>`;
      }
      const min = field.min !== undefined ? ` min="${escapeHTML(field.min)}"` : "";
      const max = field.max !== undefined ? ` max="${escapeHTML(field.max)}"` : "";
      const step = field.step !== undefined ? ` step="${escapeHTML(field.step)}"` : "";
      const placeholder = field.placeholder ? ` placeholder="${escapeHTML(field.placeholder)}"` : "";
      const cleanValue = value === undefined || value === null ? "" : value;
      return `<div class="${fieldClass}"><label>${escapeHTML(field.label)}</label><input type="${escapeHTML(field.type)}" name="${escapeHTML(field.name)}" value="${escapeHTML(cleanValue)}"${min}${max}${step}${placeholder} /></div>`;
    }

    readModalSettings(form, fields, tool) {
      const current = { ...this.settingsFor(tool) };
      fields.forEach((field) => {
        const input = form.elements[field.name];
        if (!input) return;
        if (field.type === "checkbox") {
          current[field.name] = Boolean(input.checked);
          return;
        }
        if (field.type === "number") {
          if (field.optional && String(input.value || "").trim() === "") {
            current[field.name] = "";
            return;
          }
          current[field.name] = toNumber(input.value, current[field.name] ?? 0);
          return;
        }
        current[field.name] = String(input.value || "").trim();
      });

      if (current.stroke && !isHexColor(current.stroke)) current.stroke = DEFAULT_STROKE;
      if (current.fill && !isHexColor(current.fill)) current.fill = DEFAULT_FILL;
      current.lineWidth = current.lineWidth !== undefined ? clamp(toNumber(current.lineWidth, 2), 1, 12) : current.lineWidth;
      current.lineDash = isLineStyle(current.lineDash, { arrow: true }) ? current.lineDash : "solid";
      current.fillOpacity = current.fillOpacity !== undefined ? toOpacity(current.fillOpacity) : current.fillOpacity;
      current.sides = current.sides !== undefined ? clamp(Math.floor(toNumber(current.sides, 5)), 3, 24) : current.sides;
      current.radius = current.radius !== undefined ? Math.max(0.1, toNumber(current.radius, 3)) : current.radius;
      current.width = current.width !== undefined ? clamp(toNumber(current.width, 3.8), 1, 20) : current.width;
      current.height = current.height !== undefined ? clamp(toNumber(current.height, 1.6), 0.4, 10) : current.height;
      current.rotation = current.rotation !== undefined ? toNumber(current.rotation, 90) : current.rotation;
      current.fontSize = current.fontSize !== undefined ? clamp(toNumber(current.fontSize, 18), 8, 96) : current.fontSize;
      current.labelMode = ["name", "value", "variable", "blank"].includes(current.labelMode) ? current.labelMode : "value";
      current.angleMeasure = current.angleMeasure === "reflex" ? "reflex" : "minor";
      current.precision = current.precision !== undefined ? precisionDecimals(current.precision) : current.precision;
      current.coordinatePrecision = current.coordinatePrecision !== undefined ? precisionDecimals(current.coordinatePrecision) : current.coordinatePrecision;
      current.coordinateLabelMode = POINT_COORDINATE_LABEL_MODES.includes(current.coordinateLabelMode) ? current.coordinateLabelMode : "name";
      current.label = current.label !== undefined ? cleanLabel(current.label) : current.label;
      current.coordinateVariable = current.coordinateVariable !== undefined ? cleanVariableLabel(current.coordinateVariable) : current.coordinateVariable;
      current.symbolKind = CIRCUIT_SYMBOL_LABELS[current.symbolKind] ? current.symbolKind : "resistor";
      return current;
    }

    functionSettingsFromCurve(curve) {
      return {
        expression: curve?.expression || "",
        stroke: curve?.stroke || DEFAULT_STROKE,
        lineWidth: curve?.lineWidth || 2.5,
        lineDash: curve?.lineDash || "solid",
        functionLabel: curve?.label || "",
        functionXMin: curve?.xMin ?? "",
        functionXMax: curve?.xMax ?? ""
      };
    }

    nextFunctionSettings() {
      return {
        ...this.settingsFor("function"),
        expression: "",
        stroke: FUNCTION_COLORS[this.graph.functions.length % FUNCTION_COLORS.length],
        functionLabel: "",
        functionXMin: "",
        functionXMax: ""
      };
    }

    editFunction(index) {
      const curve = this.graph.functions[index];
      if (!curve) return;
      this.openToolSettingsModal("function", {
        functionIndex: index,
        settings: this.functionSettingsFromCurve(curve)
      });
    }

    applyFunctionSettings(functionIndex = null) {
      const settings = this.settingsFor("function");
      const expression = String(settings.expression || "").trim();
      if (!expression) return;
      const editing = Number.isInteger(functionIndex) && this.graph.functions[functionIndex];
      const curve = normalizeFunctionCurve({
        id: editing?.id || `function-${Date.now()}-${this.graph.functions.length + 1}`,
        expression,
        visible: editing?.visible !== false,
        stroke: settings.stroke,
        lineWidth: settings.lineWidth,
        lineDash: settings.lineDash,
        label: settings.functionLabel,
        xMin: settings.functionXMin,
        xMax: settings.functionXMax
      }, Number.isInteger(functionIndex) ? functionIndex : this.graph.functions.length);
      this.pushHistory();
      if (editing) this.graph.functions[functionIndex] = curve;
      else {
        if (!this.graph.functions.length) this.graph.displayMode = "coordinate";
        this.graph.functions.push(curve);
      }
      this.graph = normalizeGraph(this.graph);
      this.syncControls();
      const selectedIndex = editing ? functionIndex : this.graph.functions.length - 1;
      this.selected = { kind: "function", index: selectedIndex };
      this.selectedMany = [this.selected];
      this.toolSettings.function = this.nextFunctionSettings();
      this.emitChange(editing ? "Function updated." : "Function added.");
    }

    getToolHint() {
      if (this.tool === "select") return "Select or drag objects, points, and labels.";
      if (this.tool === "segment") return this.pending ? "Click the endpoint for the segment." : "Click the start point for the segment.";
      if (this.tool === "referenceLine") return this.pending ? "Click the second point for the reference line." : "Click the first point for the reference line.";
      if (this.tool === "distance") return this.pending ? "Click the endpoint to show a distance." : "Click the first point for a distance measurement.";
      if (this.tool === "angle") return this.pending ? `Angle points: ${this.pending.labels.length}/3.` : "Click three existing points: from, vertex, to.";
      if (this.tool === "circle") return this.pending ? "Click a point on the circumference." : "Click the circle center.";
      if (this.tool === "irregularPolygon") return this.pending ? `Polygon vertices: ${this.pending.points.length}/${this.getSides()}.` : "Click each vertex of the irregular polygon.";
      if (this.tool === "function") return "Configure a new function in the modal. Use Edit beside a function in Objects to change it.";
      if (this.tool === "label") return "Configure the label, then click the diagram to place it.";
      if (this.tool === "symbol") return "Choose a circuit symbol, then click the diagram to place it.";
      return "Click the canvas to insert the selected object.";
    }

    handleAction(action) {
      if (action === "undo") this.undo();
      if (action === "redo") this.redo();
      if (action === "delete") this.deleteSelected();
      if (action === "clear" && confirm("Clear this diagram?")) {
        this.pushHistory();
        this.graph = normalizeGraph({});
        this.pending = null;
        this.selected = null;
        this.selectedMany = [];
        this.syncControls();
        this.emitChange("Diagram cleared.");
      }
      if (action === "resetView") {
        this.pushHistory();
        this.graph.xMin = -10;
        this.graph.xMax = 10;
        this.graph.yMin = -10;
        this.graph.yMax = 10;
        this.graph.autoFit = false;
        this.syncControls();
        this.emitChange("View reset.");
      }
      if (action === "attach") {
        this.host.dispatchEvent(new CustomEvent("kelp-diagram-attach", {
          bubbles: true,
          detail: { graph: this.getGraph(), editor: this }
        }));
      }
    }

    updateGraphFromControls() {
      const field = (name) => this.host.querySelector(`[data-kelp-field="${name}"]`);
      const titleField = field("title");
      if (titleField) this.graph.title = titleField.value;
      this.graph.displayMode = field("displayMode").value === "geometry" ? "geometry" : "coordinate";
      this.graph.frameBorderStyle = FRAME_BORDER_STYLES.includes(field("frameBorderStyle").value)
        ? field("frameBorderStyle").value
        : "solid";
      this.graph.snapToGrid = field("snapToGrid").checked;
      this.graph.autoFit = field("autoFit").checked;
      this.graph.viewControls = field("viewControls").checked;
      this.graph.xMin = toNumber(field("xMin").value, -10);
      this.graph.xMax = toNumber(field("xMax").value, 10);
      this.graph.yMin = toNumber(field("yMin").value, -10);
      this.graph.yMax = toNumber(field("yMax").value, 10);
      this.graph.graphType = this.graph.expression ? "function" : "diagram";
      this.emitChange();
    }

    syncControls() {
      const set = (name, value) => {
        const field = this.host.querySelector(`[data-kelp-field="${name}"]`);
        if (!field) return;
        if (field.type === "checkbox") field.checked = Boolean(value);
        else field.value = value ?? "";
      };
      set("title", this.graph.title);
      set("displayMode", this.graph.displayMode);
      this.host.querySelectorAll("[data-kelp-grid-layer]").forEach((button) => {
        const isActive = button.dataset.kelpGridLayer === this.graph.gridLayer;
        button.classList.toggle("is-active", isActive);
        button.setAttribute("aria-pressed", String(isActive));
      });
      set("frameBorderStyle", this.graph.frameBorderStyle);
      set("snapToGrid", this.graph.snapToGrid);
      set("autoFit", this.graph.autoFit === true);
      set("viewControls", this.graph.viewControls);
      set("xMin", this.graph.xMin);
      set("xMax", this.graph.xMax);
      set("yMin", this.graph.yMin === "" ? -10 : this.graph.yMin);
      set("yMax", this.graph.yMax === "" ? 10 : this.graph.yMax);
    }

    syncToolSettingsFromGraph() {
      this.toolSettings.function = {
        ...this.toolSettings.function,
        expression: "",
        stroke: FUNCTION_COLORS[this.graph.functions.length % FUNCTION_COLORS.length],
        lineWidth: 2.5,
        lineDash: "solid",
        functionLabel: "",
        functionXMin: "",
        functionXMax: ""
      };
    }

    setGraph(graph) {
      this.graph = normalizeGraph(graph || {});
      this.pending = null;
      this.selected = null;
      this.selectedMany = [];
      this.syncToolSettingsFromGraph();
      this.syncControls();
      this.draw();
      this.renderObjects();
    }

    getGraph() {
      const graph = normalizeGraph(this.graph);
      graph.pointsText = pointsToText(graph.points);
      return graph;
    }

    destroy() {
      if (this.destroyed) return;
      this.destroyed = true;
      this.resizeObserver?.disconnect();
      if (this.handleDocumentPointerDown) {
        document.removeEventListener("pointerdown", this.handleDocumentPointerDown);
      }
      if (this.handleWindowScroll) {
        window.removeEventListener("scroll", this.handleWindowScroll, true);
      }
      this.boundListeners.forEach(({ target, type, handler, options }) => {
        target.removeEventListener(type, handler, options);
      });
      this.boundListeners = [];
      this.handleDocumentPointerDown = null;
      this.handleWindowScroll = null;
      if (this.host.__kelpDiagramEditor === this) this.host.__kelpDiagramEditor = null;
      this.host.innerHTML = "";
    }

    pushHistory() {
      this.history.push(clone(this.graph));
      if (this.history.length > 80) this.history.shift();
      this.redoStack = [];
    }

    undo() {
      if (!this.history.length) return;
      this.redoStack.push(clone(this.graph));
      this.graph = normalizeGraph(this.history.pop());
      this.pending = null;
      this.selected = null;
      this.selectedMany = [];
      this.syncControls();
      this.emitChange("Undid the last change.");
    }

    redo() {
      if (!this.redoStack.length) return;
      this.history.push(clone(this.graph));
      this.graph = normalizeGraph(this.redoStack.pop());
      this.pending = null;
      this.selected = null;
      this.selectedMany = [];
      this.syncControls();
      this.emitChange("Redid the change.");
    }

    emitChange(message = "", options = {}) {
      if (options.normalize !== false) this.graph = normalizeGraph(this.graph);
      this.draw();
      this.renderObjects();
      if (message) this.setStatus(message);
      this.host.dispatchEvent(new CustomEvent("kelp-diagram-change", {
        bubbles: true,
        detail: { graph: this.getGraph() }
      }));
    }

    setStatus(message) {
      if (this.status) this.status.textContent = message || "";
    }

    settingsFor(tool = this.tool) {
      return this.toolSettings[tool] || {};
    }

    getStroke(tool = this.tool) {
      return isHexColor(this.settingsFor(tool).stroke) ? this.settingsFor(tool).stroke : DEFAULT_STROKE;
    }

    getFill(tool = this.tool) {
      return isHexColor(this.settingsFor(tool).fill) ? this.settingsFor(tool).fill : DEFAULT_FILL;
    }

    getFillOpacity(tool = this.tool) {
      return toOpacity(this.settingsFor(tool).fillOpacity);
    }

    getLineWidth(tool = this.tool) {
      return clamp(toNumber(this.settingsFor(tool).lineWidth, 2), 1, 12);
    }

    getLineDash(tool = this.tool) {
      const value = this.settingsFor(tool).lineDash;
      return isLineStyle(value, { arrow: true }) ? value : "solid";
    }

    getSides(tool = this.tool) {
      return clamp(Math.floor(toNumber(this.settingsFor(tool).sides, 5)), 3, 24);
    }

    getRadius(tool = this.tool) {
      return Math.max(0.1, toNumber(this.settingsFor(tool).radius, 3));
    }

    getLabelText(fallback = "Label") {
      return String(this.settingsFor("label").text || fallback).trim();
    }

    handlePointerDown(event) {
      if (!this.meta) this.draw();
      if (event.button === 2 && this.tool === "select" && this.graph.viewControls) {
        this.host.focus?.({ preventScroll: true });
        event.preventDefault();
        this.selected = null;
        this.selectedMany = [];
        this.renderObjects();
        this.drag = {
          hit: { kind: "viewPan" },
          start: this.canvasToGraph(event, true),
          startPointer: this.pointer(event),
          graph: clone(this.graph),
          pointerId: event.pointerId
        };
        this.canvas.setPointerCapture?.(event.pointerId);
        return;
      }
      if (event.button && event.button !== 0) return;
      const point = this.canvasToGraph(event, this.tool === "select");
      if (!point) return;
      this.host.focus?.({ preventScroll: true });

      if (this.tool === "select") {
        const rawHit = this.findHit(event, point);
        const hit = this.selectionHitForObject(rawHit);
        const keepsRawDrag = ["groupResize", "groupRotate", "segmentRotate", "segmentEdgeRotate", "shapeResize", "shapeRotate"].includes(rawHit?.kind);
        const dragHit = keepsRawDrag ? rawHit : hit;
        const selectedItems = this.selectionItems();
        const preservesGroup = selectedItems.length > 1 && (
          rawHit?.kind === "groupResize"
          || rawHit?.kind === "groupRotate"
          || selectedItems.some((item) => this.hitKey(item) === this.hitKey(hit))
        );
        if (event.ctrlKey || event.metaKey) {
          this.toggleSelection(hit);
        } else if (!preservesGroup) {
          this.selected = hit;
          this.selectedMany = hit ? [hit] : [];
        }
        this.renderObjects();
        this.draw();
        if (dragHit) {
          event.preventDefault();
          this.pushHistory();
          this.drag = { hit: dragHit, start: point, graph: clone(this.graph), pointerId: event.pointerId };
          this.canvas.setPointerCapture?.(event.pointerId);
        }
        return;
      }

      this.pushHistory();
      this.handleToolClick(point);
    }

    handlePointerMove(event) {
      const point = this.canvasToGraph(event, Boolean(this.drag));
      if (!point) {
        if (!this.drag) {
          this.previewPoint = null;
          this.draw();
        }
        return;
      }

      if (this.drag) {
        event.preventDefault();
        const dx = point.x - this.drag.start.x;
        const dy = point.y - this.drag.start.y;
        this.previewPoint = point;
        this.graph = normalizeGraph(this.drag.graph);
        this.applyDrag(this.drag.hit, dx, dy, point, this.pointer(event));
        this.draw();
        this.renderObjects();
        return;
      }

      this.previewPoint = this.graph.snapToGrid ? this.snapPoint(point) : point;
      this.draw();
    }

    finishDrag(event) {
      if (!this.drag) return;
      this.canvas.releasePointerCapture?.(event.pointerId);
      this.drag = null;
      this.previewPoint = null;
      this.emitChange();
    }

    handleWheel(event) {
      if (this.tool !== "select" || !this.graph.viewControls || !this.meta || (!event.ctrlKey && !event.metaKey)) return;
      event.preventDefault();
      const pointer = this.pointer(event);
      const anchor = this.graphFromCanvasPoint(pointer, true);
      const factor = event.deltaY < 0 ? 0.88 : 1.14;
      this.zoomView(anchor, factor);
    }

    handleToolClick(rawPoint) {
      const snap = this.graph.snapToGrid ? this.snapCandidate(rawPoint) : null;
      const point = snap?.point || rawPoint;
      if (this.tool === "point") {
        this.addConfiguredPoint({
          ...point,
          attachment: this.attachmentFromSnap(snap)
        });
        this.emitChange("Point added.");
        return;
      }
      if (["segment", "referenceLine", "distance"].includes(this.tool)) {
        this.addTwoPointObject(point, this.tool);
        return;
      }
      if (this.tool === "angle") {
        this.addAnglePoint(point);
        return;
      }
      if (this.tool === "function") {
        this.openToolSettingsModal("function");
        return;
      }
      if (this.tool === "regularPolygon") {
        this.addRegularPolygon(point);
        return;
      }
      if (this.tool === "irregularPolygon") {
        this.addIrregularPolygonPoint(point);
        return;
      }
      if (this.tool === "rectangle") {
        this.addPointShape("irregularPolygon", "Rectangle", this.rectanglePoints(point), "rectangle");
        return;
      }
      if (this.tool === "trapezoid") {
        this.addPointShape("trapezoid", "Trapezoid", this.trapezoidPoints(point));
        return;
      }
      if (this.tool === "parallelogram") {
        this.addPointShape("parallelogram", "Parallelogram", this.parallelogramPoints(point));
        return;
      }
      if (this.tool === "circle") {
        this.addCirclePoint(point);
        return;
      }
      if (this.tool === "label") {
        this.addTextLabel(point);
        return;
      }
      if (this.tool === "symbol") {
        this.addCircuitSymbol(point);
      }
    }

    addPoint(point, label = null, overrides = {}) {
      const next = normalizePoint({
        label: label || this.nextPointLabel(),
        x: point.x,
        y: point.y,
        color: this.getStroke("point"),
        ...overrides
      }, this.graph.points.length);
      this.graph.points.push(next);
      return next;
    }

    addConfiguredPoint(point) {
      const settings = this.settingsFor("point");
      const mode = POINT_COORDINATE_LABEL_MODES.includes(settings.coordinateLabelMode) ? settings.coordinateLabelMode : "name";
      const usesVariable = mode.includes("Variable") || mode.startsWith("variable");
      const next = this.addPoint(point, this.uniquePointLabel(settings.label), {
        coordinateLabelMode: mode,
        coordinatePrecision: precisionDecimals(settings.coordinatePrecision, 2),
        labelHidden: Boolean(this.options.hidePointLabels),
        attachment: point?.attachment || null,
        coordinateVariable: usesVariable
          ? cleanVariableLabel(settings.coordinateVariable) || this.nextPointVariableLabel()
          : ""
      });
      settings.label = "";
      settings.coordinateVariable = "";
      return next;
    }

    nextPointVariableLabel() {
      const used = new Set(this.graph.points
        .map((point) => cleanVariableLabel(point.coordinateVariable).toLowerCase())
        .filter(Boolean));
      return POINT_VARIABLE_LABELS.find((label) => !used.has(label.toLowerCase()))
        || POINT_VARIABLE_LABELS[this.graph.points.length % POINT_VARIABLE_LABELS.length];
    }

    getPointForConstruction(point, options = {}) {
      const hit = this.findPointHit(point, 12, { includeHidden: true });
      if (hit?.point) return { point: hit.point, created: false };
      return { point: this.addPoint(point, null, options.pointOverrides || {}), created: true };
    }

    addTwoPointObject(point, tool) {
      const showEndpointPoints = tool === "segment" ? Boolean(this.settingsFor("segment").showEndpointPoints) : true;
      const selected = this.getPointForConstruction(point, {
        pointOverrides: {
          visible: showEndpointPoints,
          labelHidden: !showEndpointPoints
        }
      });
      const selectedPoint = selected.point;
      if (!this.pending || this.pending.tool !== tool) {
        this.pending = { tool, from: selectedPoint.label };
        this.emitChange(`${selectedPoint.label} selected. Click the endpoint.`);
        return;
      }

      const from = this.pending.from;
      const to = selectedPoint.label;
      if (from && to && from !== to) {
        this.graph.segments.push(normalizeSegment({
          from,
          to,
          labelMode: tool === "distance" ? "length" : tool === "referenceLine" ? "hidden" : "name",
          precision: tool === "distance" ? this.settingsFor("distance").precision : undefined,
          color: this.getStroke(tool),
          lineWidth: this.getLineWidth(tool),
          lineDash: this.getLineDash(tool),
          showEndpointPoints
        }));
      }
      this.pending = null;
      this.emitChange(tool === "distance" ? "Distance added." : tool === "referenceLine" ? "Reference line added." : "Segment added.");
    }

    addAnglePoint(point) {
      const hit = this.findPointHit(point, 12);
      const selectedPoint = hit?.point;
      if (!selectedPoint?.label) {
        this.emitChange("Angle: click existing points only.");
        return;
      }
      if (!this.pending || this.pending.tool !== "angle") this.pending = { tool: "angle", labels: [] };
      if (this.pending.labels[this.pending.labels.length - 1] !== selectedPoint.label) {
        this.pending.labels.push(selectedPoint.label);
      }
      if (this.pending.labels.length < 3) {
        this.emitChange(`Angle points: ${this.pending.labels.length}/3.`);
        return;
      }
      const [from, vertex, to] = this.pending.labels;
      if (from !== vertex && vertex !== to && from !== to) {
        this.graph.angles.push(normalizeAngle({
          from,
          vertex,
          to,
          labelMode: this.settingsFor("angle").labelMode || "value",
          angleMeasure: this.settingsFor("angle").angleMeasure || "minor",
          variableLabel: this.nextAngleVariableLabel(),
          color: this.getStroke("angle"),
          lineWidth: this.getLineWidth("angle"),
          radius: this.settingsFor("angle").radius || 22,
          precision: this.settingsFor("angle").precision
        }));
      }
      this.pending = null;
      this.emitChange("Angle measurement added.");
    }

    nextAngleVariableLabel() {
      const used = new Set(this.graph.angles
        .filter((angle) => angle.labelMode === "variable" && angle.variableLabel)
        .map((angle) => String(angle.variableLabel).toLowerCase()));
      return ANGLE_VARIABLE_LABELS.find((label) => !used.has(label.toLowerCase())) || ANGLE_VARIABLE_LABELS[this.graph.angles.length % ANGLE_VARIABLE_LABELS.length];
    }

    addRegularPolygon(center) {
      const sides = this.getSides();
      const labels = this.nextPointLabels(sides);
      this.graph.shapes.push(normalizeShape({
        id: this.nextShapeId("regularPolygon"),
        type: "regularPolygon",
        label: `${sides}-sided regular polygon`,
        sides,
        radius: this.getRadius("regularPolygon"),
        centerX: center.x,
        centerY: center.y,
        rotation: toNumber(this.settingsFor("regularPolygon").rotation, 90),
        showCenter: Boolean(this.settingsFor("regularPolygon").showCenter),
        showApothem: Boolean(this.settingsFor("regularPolygon").showApothem),
        vertexLabels: labels,
        vertexLabelHidden: (this.options.hideShapeLabels || this.options.hidePointLabels) ? labels.map(() => true) : [],
        stroke: this.getStroke("regularPolygon"),
        fill: this.getFill("regularPolygon"),
        fillOpacity: this.getFillOpacity("regularPolygon"),
        lineWidth: this.getLineWidth("regularPolygon"),
        lineDash: this.getLineDash("regularPolygon")
      }, this.graph.shapes.length));
      this.emitChange("Regular polygon added.");
    }

    addIrregularPolygonPoint(point) {
      const sides = this.getSides();
      if (!this.pending || this.pending.tool !== "irregularPolygon") {
        this.pending = { tool: "irregularPolygon", points: [], sides };
      }
      this.pending.points.push({ x: point.x, y: point.y });
      if (this.pending.points.length < this.pending.sides) {
        this.emitChange(`Polygon vertices: ${this.pending.points.length}/${this.pending.sides}.`);
        return;
      }
      this.addPointShape("irregularPolygon", "Irregular polygon", this.pending.points);
      this.pending = null;
    }

    addPointShape(type, label, rawPoints, constraint = "") {
      const tool = constraint === "rectangle" ? "rectangle" : type;
      const labels = this.nextPointLabels(rawPoints.length);
      const points = rawPoints.map((point) => normalizeShapePoint({
        ...point,
        label: labels.shift(),
        labelHidden: Boolean(this.options.hideShapeLabels || this.options.hidePointLabels)
      }));
      this.graph.shapes.push(normalizeShape({
        id: this.nextShapeId(type),
        type,
        label,
        points,
        constraint,
        targetSides: type === "irregularPolygon" ? points.length : undefined,
        stroke: this.getStroke(tool),
        fill: this.getFill(tool),
        fillOpacity: this.getFillOpacity(tool),
        lineWidth: this.getLineWidth(tool),
        lineDash: this.getLineDash(tool)
      }, this.graph.shapes.length));
      this.emitChange(`${label} added.`);
    }

    addCirclePoint(point) {
      if (!this.pending || this.pending.tool !== "circle") {
        this.pending = { tool: "circle", center: point };
        this.emitChange("Circle center selected. Click the circumference.");
        return;
      }
      const radius = Math.max(0.1, distance(this.pending.center, point));
      this.graph.shapes.push(normalizeShape({
        id: this.nextShapeId("circle"),
        type: "circle",
        label: "",
        center: this.pending.center,
        radiusPoint: point,
        radius,
        showCenter: Boolean(this.settingsFor("circle").showCenter),
        showRadiusPoint: Boolean(this.settingsFor("circle").showRadiusPoint),
        stroke: this.getStroke("circle"),
        fill: this.getFill("circle"),
        fillOpacity: this.getFillOpacity("circle"),
        lineWidth: this.getLineWidth("circle"),
        lineDash: this.getLineDash("circle")
      }, this.graph.shapes.length));
      this.pending = null;
      this.emitChange("Circle added.");
    }

    addTextLabel(point) {
      const text = this.getLabelText("Label");
      this.graph.shapes.push(normalizeShape({
        id: this.nextShapeId("latexText"),
        type: "latexText",
        label: text,
        text,
        x: point.x,
        y: point.y,
        fill: isHexColor(this.settingsFor("label").fill) ? this.settingsFor("label").fill : DEFAULT_STROKE,
        fontSize: clamp(toNumber(this.settingsFor("label").fontSize, 18), 8, 96)
      }, this.graph.shapes.length));
      this.emitChange("Label added.");
    }

    addCircuitSymbol(center) {
      const settings = this.settingsFor("symbol");
      const width = clamp(toNumber(settings.width, 3.8), 1, 20);
      const height = clamp(toNumber(settings.height, 1.6), 0.4, 10);
      const labels = this.nextPointLabels(2);
      this.graph.shapes.push(normalizeShape({
        id: this.nextShapeId("circuitSymbol"),
        type: "circuitSymbol",
        label: CIRCUIT_SYMBOL_LABELS[settings.symbolKind] || "Circuit symbol",
        symbolKind: settings.symbolKind || "resistor",
        width,
        height,
        points: [
          { label: labels[0], x: center.x - width / 2, y: center.y, labelHidden: true, size: 4 },
          { label: labels[1], x: center.x + width / 2, y: center.y, labelHidden: true, size: 4 }
        ],
        stroke: this.getStroke("symbol"),
        lineWidth: this.getLineWidth("symbol"),
        showTerminals: Boolean(settings.showTerminals)
      }, this.graph.shapes.length));
      this.emitChange("Circuit symbol added.");
    }

    rectanglePoints(center) {
      const r = this.getRadius();
      return [
        { x: center.x - r, y: center.y + r * 0.65 },
        { x: center.x + r, y: center.y + r * 0.65 },
        { x: center.x + r, y: center.y - r * 0.65 },
        { x: center.x - r, y: center.y - r * 0.65 }
      ];
    }

    trapezoidPoints(center) {
      const r = this.getRadius();
      return [
        { x: center.x - r * 0.65, y: center.y + r * 0.7 },
        { x: center.x + r * 0.65, y: center.y + r * 0.7 },
        { x: center.x + r, y: center.y - r * 0.7 },
        { x: center.x - r, y: center.y - r * 0.7 }
      ];
    }

    parallelogramPoints(center) {
      const r = this.getRadius();
      return [
        { x: center.x - r * 0.85, y: center.y + r * 0.7 },
        { x: center.x + r, y: center.y + r * 0.7 },
        { x: center.x + r * 0.85, y: center.y - r * 0.7 },
        { x: center.x - r, y: center.y - r * 0.7 }
      ];
    }

    nextPointLabel() {
      const used = new Set();
      this.graph.points.forEach((point) => used.add(cleanLabel(point.label).toLowerCase()));
      this.graph.shapes.forEach((shape) => shapePoints(shape).forEach((point) => used.add(cleanLabel(point.label).toLowerCase())));
      let index = 1;
      let label = `${POINT_PREFIX}${index}`;
      while (used.has(label.toLowerCase())) {
        index += 1;
        label = `${POINT_PREFIX}${index}`;
      }
      return label;
    }

    uniquePointLabel(requestedLabel) {
      const requested = cleanLabel(requestedLabel);
      if (!requested) return this.nextPointLabel();

      const used = new Set();
      this.graph.points.forEach((point) => used.add(cleanLabel(point.label).toLowerCase()));
      this.graph.shapes.forEach((shape) => shapePoints(shape).forEach((point) => used.add(cleanLabel(point.label).toLowerCase())));
      if (!used.has(requested.toLowerCase())) return requested;

      const base = requested.slice(0, 9) || POINT_PREFIX;
      let suffix = 2;
      let candidate = cleanLabel(`${base}${suffix}`);
      while (used.has(candidate.toLowerCase())) {
        suffix += 1;
        candidate = cleanLabel(`${base}${suffix}`);
      }
      return candidate;
    }

    nextPointLabels(count) {
      const labels = [];
      const used = new Set();
      this.graph.points.forEach((point) => used.add(cleanLabel(point.label).toLowerCase()));
      this.graph.shapes.forEach((shape) => shapePoints(shape).forEach((point) => used.add(cleanLabel(point.label).toLowerCase())));
      let index = 1;
      while (labels.length < count) {
        const label = `${POINT_PREFIX}${index}`;
        if (!used.has(label.toLowerCase())) {
          labels.push(label);
          used.add(label.toLowerCase());
        }
        index += 1;
      }
      return labels;
    }

    nextShapeId(type) {
      const used = new Set(this.graph.shapes.map((shape) => shape.id));
      let index = this.graph.shapes.length + 1;
      let id = `${type}-${index}`;
      while (used.has(id)) {
        index += 1;
        id = `${type}-${index}`;
      }
      return id;
    }

    parseObjectId(id) {
      const [kind, a, b] = String(id || "").split(":");
      if (kind === "point") return { kind, index: Number(a) };
      if (kind === "segment") return { kind, index: Number(a) };
      if (kind === "angle") return { kind, index: Number(a) };
      if (kind === "shape") return { kind, index: Number(a) };
      if (kind === "function") return { kind, index: Number(a) };
      if (kind === "shapePoint") return { kind, shapeIndex: Number(a), pointIndex: Number(b) };
      return null;
    }

    deleteSelected() {
      const hits = this.selectionItems();
      if (!hits.length) return;
      this.pushHistory();
      hits
        .slice()
        .sort((a, b) => this.deleteSortKey(b) - this.deleteSortKey(a))
        .forEach((hit) => this.deleteHit(hit));
      this.clearSelection(false);
      this.emitChange(hits.length > 1 ? "Selections deleted." : "Selection deleted.");
    }

    deleteSortKey(hit) {
      return Number(hit?.index ?? hit?.shapeIndex ?? 0);
    }

    deleteHit(hit) {
      if (!hit) return;
      if (hit.kind === "point" && this.graph.points[hit.index]) {
        const label = this.graph.points[hit.index].label;
        this.graph.points.splice(hit.index, 1);
        this.graph.segments = this.graph.segments.filter((segment) => segment.from !== label && segment.to !== label);
        this.graph.angles = this.graph.angles.filter((angle) => ![angle.from, angle.vertex, angle.to].includes(label));
      }
      if (hit.kind === "pointLabel" && this.graph.points[hit.index]) this.graph.points[hit.index].labelHidden = true;
      if (hit.kind === "segment") this.graph.segments.splice(hit.index, 1);
      if (hit.kind === "segmentRotate") this.graph.segments.splice(hit.index, 1);
      if (hit.kind === "segmentEdgeRotate") this.graph.segments.splice(hit.index, 1);
      if (hit.kind === "segmentLabel" && this.graph.segments[hit.index]) this.graph.segments[hit.index].labelMode = "hidden";
      if (hit.kind === "angle") this.graph.angles.splice(hit.index, 1);
      if (hit.kind === "angleLabel" && this.graph.angles[hit.index]) this.graph.angles[hit.index].labelMode = "none";
      if (hit.kind === "shape" || hit.kind === "shapeResize" || hit.kind === "shapeRotate") this.graph.shapes.splice(hit.index, 1);
      if (hit.kind === "shapePointLabel") this.hideShapePointLabel(hit);
      if (hit.kind === "shapeSegmentLabel") this.setShapeSegmentLabelMode(this.graph.shapes[hit.shapeIndex], hit.key, "hidden");
      if (hit.kind === "function") this.graph.functions.splice(hit.index, 1);
    }

    hideShapePointLabel(hit) {
      const shape = this.graph.shapes[hit.shapeIndex];
      if (!shape) return;
      if (shape.type === "regularPolygon") {
        if (!Array.isArray(shape.vertexLabelHidden)) shape.vertexLabelHidden = [];
        shape.vertexLabelHidden[hit.pointIndex] = true;
        return;
      }
      if (shape.points?.[hit.pointIndex]) shape.points[hit.pointIndex].labelHidden = true;
    }

    clearSelection(redraw = true) {
      this.selected = null;
      this.selectedMany = [];
      if (redraw) {
        this.draw();
        this.renderObjects();
      }
    }

    selectionItems() {
      return this.selectedMany.length ? this.selectedMany.filter(Boolean) : (this.selected ? [this.selected] : []);
    }

    toggleSelection(hit) {
      if (!hit) return;
      const key = this.hitKey(hit);
      const existing = this.selectionItems();
      const next = existing.filter((item) => this.hitKey(item) !== key);
      if (next.length === existing.length) next.push(hit);
      this.selectedMany = next;
      this.selected = next[next.length - 1] || null;
    }

    selectionHitForObject(hit) {
      if (!hit) return null;
      if (["segmentRotate", "segmentEdgeRotate"].includes(hit.kind)) {
        return { kind: "segment", index: hit.index };
      }
      if (["shapeResize", "shapeRotate"].includes(hit.kind)) {
        return { kind: "shape", index: hit.index };
      }
      const shapeIndex = Number(hit.shapeIndex);
      if (Number.isInteger(shapeIndex) && this.graph.shapes[shapeIndex]?.type === "circuitSymbol") {
        return { kind: "shape", index: shapeIndex };
      }
      return hit;
    }

    hitKey(hit) {
      if (!hit) return "";
      if (hit.kind === "function") return `function:${hit.index}`;
      return `${hit.kind}:${hit.index ?? ""}:${hit.shapeIndex ?? ""}:${hit.pointIndex ?? ""}:${hit.key ?? ""}`;
    }

    findHit(event, graphPoint) {
      const transformHit = this.findTransformHandleHit(event);
      if (transformHit) return transformHit;
      const labelHit = this.findLabelHit(event);
      if (labelHit) return labelHit;
      const pointHit = this.findPointHit(graphPoint, 11);
      if (pointHit) return pointHit;
      const segmentHit = this.findSegmentHit(event);
      if (segmentHit) return segmentHit;
      const shapeHit = this.findShapeHit(graphPoint);
      if (shapeHit) return shapeHit;
      const angleHit = this.findAngleHit(event);
      if (angleHit) return angleHit;
      const functionHit = this.findFunctionHit(event);
      if (functionHit) return functionHit;
      return null;
    }

    findTransformHandleHit(event) {
      const groupHandles = this.groupTransformHandles();
      if (groupHandles) {
        const pointer = this.pointer(event);
        const pointerStart = this.graphFromCanvasPoint(pointer, true);
        if (Math.hypot(pointer.x - groupHandles.rotate.x, pointer.y - groupHandles.rotate.y) <= 16) {
          return {
            kind: "groupRotate",
            pointerStart,
            handleStart: groupHandles.rotateGraph,
            centerGraph: groupHandles.centerGraph
          };
        }
        if (Math.hypot(pointer.x - groupHandles.resize.x, pointer.y - groupHandles.resize.y) <= 16) {
          return {
            kind: "groupResize",
            pointerStart,
            handleStart: groupHandles.resizeGraph,
            centerGraph: groupHandles.centerGraph
          };
        }
        return null;
      }
      const segmentIndex = this.selectedSegmentIndex();
      if (segmentIndex >= 0) {
        const handles = this.segmentTransformHandles(this.graph.segments[segmentIndex]);
        if (!handles) return null;
        const pointer = this.pointer(event);
        const pointerStart = this.graphFromCanvasPoint(pointer, true);
        const segment = this.graph.segments[segmentIndex];
        if (!segment.showEndpointPoints && Math.hypot(pointer.x - handles.start.x, pointer.y - handles.start.y) <= 13) {
          return {
            kind: "segmentEdgeRotate",
            index: segmentIndex,
            endpoint: "from",
            pointerStart,
            handleStart: handles.startGraph
          };
        }
        if (!segment.showEndpointPoints && Math.hypot(pointer.x - handles.end.x, pointer.y - handles.end.y) <= 13) {
          return {
            kind: "segmentEdgeRotate",
            index: segmentIndex,
            endpoint: "to",
            pointerStart,
            handleStart: handles.endGraph
          };
        }
        if (Math.hypot(pointer.x - handles.rotate.x, pointer.y - handles.rotate.y) <= 16) {
          return {
            kind: "segmentRotate",
            index: segmentIndex,
            pointerStart,
            handleStart: handles.rotateGraph,
            centerGraph: handles.centerGraph
          };
        }
      }
      const shapeIndex = this.selectedShapeIndex();
      if (shapeIndex < 0 || !this.meta) return null;
      const handles = this.shapeTransformHandles(this.graph.shapes[shapeIndex]);
      if (!handles) return null;
      const pointer = this.pointer(event);
      const pointerStart = this.graphFromCanvasPoint(pointer, true);
      const near = (handle) => Math.hypot(pointer.x - handle.x, pointer.y - handle.y) <= 16;
      if (near(handles.resize)) return { kind: "shapeResize", index: shapeIndex, pointerStart, handleStart: handles.resizeGraph };
      if (near(handles.rotate)) return { kind: "shapeRotate", index: shapeIndex, pointerStart, handleStart: handles.rotateGraph };
      return null;
    }

    findPointHit(graphPoint, radiusPx, options = {}) {
      const scale = this.unitsPerPixel();
      const radius = radiusPx * scale;
      for (let index = 0; index < this.graph.points.length; index += 1) {
        const point = this.graph.points[index];
        if ((point.visible !== false || options.includeHidden) && distance(point, graphPoint) <= radius) return { kind: "point", index, point };
      }
      for (let shapeIndex = 0; shapeIndex < this.graph.shapes.length; shapeIndex += 1) {
        const shape = this.graph.shapes[shapeIndex];
        if (shape.visible === false) continue;
        const points = connectionPointsForShape(shape);
        for (let pointIndex = 0; pointIndex < points.length; pointIndex += 1) {
          const point = points[pointIndex];
          if (point?.label && distance(point, graphPoint) <= radius) {
            return { kind: "shapePoint", shapeIndex, pointIndex, point };
          }
        }
      }
      return null;
    }

    findLabelHit(event) {
      if (!this.meta) return null;
      const pointer = this.pointer(event);
      const hit = (x, y, text) => Math.abs(pointer.x - x) <= Math.max(16, String(text || "").length * 4.8) && Math.abs(pointer.y - y) <= 14;
      for (let index = 0; index < this.graph.points.length; index += 1) {
        const point = this.graph.points[index];
        if (point.labelHidden) continue;
        const p = this.toPx(point.x, point.y);
        const offset = this.labelOffset(point, 8, -7);
        if (hit(p.x + offset.dx, p.y + offset.dy, pointDisplayLabel(point, index))) return { kind: "pointLabel", index };
      }
      for (let index = 0; index < this.graph.segments.length; index += 1) {
        const anchor = this.segmentLabelAnchor(this.graph.segments[index]);
        if (anchor?.label && hit(anchor.x, anchor.y, anchor.label)) return { kind: "segmentLabel", index };
      }
      for (let index = 0; index < this.graph.angles.length; index += 1) {
        const anchor = this.angleLabelAnchor(this.graph.angles[index]);
        if (anchor?.label && hit(anchor.x, anchor.y, anchor.label)) return { kind: "angleLabel", index };
      }
      for (let shapeIndex = 0; shapeIndex < this.graph.shapes.length; shapeIndex += 1) {
        const shape = this.graph.shapes[shapeIndex];
        const points = shapePoints(shape);
        for (let pointIndex = 0; pointIndex < points.length; pointIndex += 1) {
          const point = points[pointIndex];
          if (!point?.label || point.labelHidden) continue;
          const p = this.toPx(point.x, point.y);
          const offset = this.labelOffset(point, 8, -7);
          if (hit(p.x + offset.dx, p.y + offset.dy, point.label)) {
            return { kind: "shapePointLabel", shapeIndex, pointIndex };
          }
        }
        for (const anchor of this.shapeSegmentLabelAnchors(shape)) {
          if (anchor.label && hit(anchor.x, anchor.y, anchor.label)) {
            return { kind: "shapeSegmentLabel", shapeIndex, edgeIndex: anchor.edgeIndex, key: anchor.key };
          }
        }
        if (shape.type === "latexText") {
          const p = this.toPx(shape.x, shape.y);
          if (hit(p.x, p.y, shape.text || shape.label)) return { kind: "shape", index: shapeIndex };
        }
      }
      return null;
    }

    findSegmentHit(event) {
      if (!this.meta) return null;
      const pointer = this.pointer(event);
      let best = null;
      this.graph.segments.forEach((segment, index) => {
        const a = this.pointByLabel(segment.from);
        const b = this.pointByLabel(segment.to);
        if (!a || !b) return;
        const ap = this.toPx(a.x, a.y);
        const bp = this.toPx(b.x, b.y);
        const d = this.distancePointToSegment(pointer, ap, bp);
        if (d <= 10 && (!best || d < best.d)) best = { kind: "segment", index, d };
      });
      return best;
    }

    findAngleHit(event) {
      if (!this.meta) return null;
      const pointer = this.pointer(event);
      for (let index = 0; index < this.graph.angles.length; index += 1) {
        const angle = this.graph.angles[index];
        const vertex = this.pointByLabel(angle.vertex);
        if (!vertex) continue;
        const p = this.toPx(vertex.x, vertex.y);
        if (Math.hypot(pointer.x - p.x, pointer.y - p.y) <= 28) return { kind: "angle", index };
      }
      return null;
    }

    findShapeHit(graphPoint) {
      for (let index = this.graph.shapes.length - 1; index >= 0; index -= 1) {
        const shape = this.graph.shapes[index];
        if (shape.visible === false) continue;
        if (shape.type === "circle") {
          if (Math.abs(distance(shape.center, graphPoint) - shape.radius) <= this.unitsPerPixel() * 12 || distance(shape.center, graphPoint) <= shape.radius) {
            return { kind: "shape", index };
          }
        } else if (shape.type === "latexText") {
          if (distance({ x: shape.x, y: shape.y }, graphPoint) <= this.unitsPerPixel() * 22) return { kind: "shape", index };
        } else if (shape.type === "circuitSymbol") {
          const points = shapePoints(shape);
          if (points.length >= 2 && this.distancePointToGraphSegment(graphPoint, points[0], points[1]) <= this.unitsPerPixel() * 24) return { kind: "shape", index };
        } else {
          const points = shapePoints(shape);
          if (points.length >= 3 && pointInPolygon(graphPoint, points)) return { kind: "shape", index };
        }
      }
      return null;
    }

    distancePointToGraphSegment(point, start, end) {
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const lengthSquared = dx * dx + dy * dy;
      if (!lengthSquared) return distance(point, start);
      const t = clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared, 0, 1);
      return distance(point, { x: start.x + dx * t, y: start.y + dy * t });
    }

    applyDrag(hit, dx, dy, currentPoint, currentPointer = null) {
      if (!hit) return;
      if (hit.kind === "groupRotate") {
        this.rotateSelectedGroup(currentPoint, hit);
        return;
      }
      if (hit.kind === "groupResize") {
        this.resizeSelectedGroup(currentPoint, hit);
        return;
      }
      if (!this.applyingMultiDrag && this.selectionItems().length > 1 && this.selectionItems().some((item) => this.hitKey(item) === this.hitKey(hit))) {
        this.applyingMultiDrag = true;
        this.selectionItems()
          .filter((item) => ["point", "segment", "angle", "shape", "pointLabel", "segmentLabel", "angleLabel", "shapePointLabel", "shapeSegmentLabel"].includes(item.kind))
          .forEach((item) => this.applyDrag(item, dx, dy, currentPoint, currentPointer));
        this.applyingMultiDrag = false;
        return;
      }
      if (hit.kind === "viewPan") {
        this.panView(currentPointer);
        return;
      }
      if (hit.kind === "point" && this.graph.points[hit.index]) {
        const base = this.drag.graph.points[hit.index];
        const requested = { x: base.x + dx, y: base.y + dy };
        const snap = this.graph.snapToGrid
          ? this.snapCandidate(requested, { excludeLabel: base.label })
          : null;
        const target = snap?.point || requested;
        this.graph.points[hit.index].x = round(target.x);
        this.graph.points[hit.index].y = round(target.y);
        this.graph.points[hit.index].attachment = this.attachmentFromSnap(snap);
      }
      if (hit.kind === "pointLabel" && this.graph.points[hit.index]) {
        const scale = 1 / this.unitsPerPixel();
        const target = this.graph.points[hit.index];
        const base = this.drag.graph.points[hit.index];
        const offset = this.labelOffset(base, 8, -7);
        target.labelDx = round(offset.dx + dx * scale);
        target.labelDy = round(offset.dy - dy * scale);
        Object.assign(target, this.labelBasis());
      }
      if (hit.kind === "angleLabel" && this.graph.angles[hit.index]) {
        const scale = 1 / this.unitsPerPixel();
        const base = this.drag.graph.angles[hit.index] || {};
        const target = this.graph.angles[hit.index];
        const offset = this.labelOffset(base, 0, 0);
        target.labelDx = round(offset.dx + dx * scale);
        target.labelDy = round(offset.dy - dy * scale);
        Object.assign(target, this.labelBasis());
      }
      if (hit.kind === "segmentLabel" && this.graph.segments[hit.index]) {
        const scale = 1 / this.unitsPerPixel();
        const base = this.drag.graph.segments[hit.index] || {};
        const target = this.graph.segments[hit.index];
        const offset = this.labelOffset(base, 0, -10);
        target.labelDx = round(offset.dx + dx * scale);
        target.labelDy = round(offset.dy - dy * scale);
        Object.assign(target, this.labelBasis());
      }
      if (hit.kind === "shapeSegmentLabel") this.moveShapeSegmentLabel(hit, dx, dy);
      if (hit.kind === "segment") this.moveStandaloneLabels([this.graph.segments[hit.index]?.from, this.graph.segments[hit.index]?.to], dx, dy);
      if (hit.kind === "angle") {
        const angle = this.graph.angles[hit.index];
        this.moveStandaloneLabels([angle?.from, angle?.vertex, angle?.to], dx, dy);
      }
      if (hit.kind === "shapePoint") this.moveShapePoint(hit, dx, dy, currentPoint);
      if (hit.kind === "shapePointLabel") this.moveShapePointLabel(hit, dx, dy);
      if (hit.kind === "shape") this.moveWholeShape(hit.index, dx, dy);
      if (hit.kind === "segmentRotate") this.rotateSegment(hit.index, currentPoint, hit);
      if (hit.kind === "segmentEdgeRotate") this.rotateSegmentFromEdge(hit.index, currentPoint, hit);
      if (hit.kind === "shapeResize") this.resizeShape(hit.index, currentPoint, hit);
      if (hit.kind === "shapeRotate") this.rotateShape(hit.index, currentPoint, hit);
    }

    zoomView(anchor, factor) {
      if (!anchor || !this.meta) return;
      const xMin = Number(this.graph.xMin);
      const xMax = Number(this.graph.xMax);
      const yMin = this.graph.yMin === "" ? this.meta.yMin : Number(this.graph.yMin);
      const yMax = this.graph.yMax === "" ? this.meta.yMax : Number(this.graph.yMax);
      if (![xMin, xMax, yMin, yMax].every(Number.isFinite) || xMin >= xMax || yMin >= yMax) return;
      this.graph.autoFit = false;
      this.graph.xMin = round(anchor.x - (anchor.x - xMin) * factor);
      this.graph.xMax = round(anchor.x + (xMax - anchor.x) * factor);
      this.graph.yMin = round(anchor.y - (anchor.y - yMin) * factor);
      this.graph.yMax = round(anchor.y + (yMax - anchor.y) * factor);
      this.syncControls();
      this.emitChange("View updated.");
    }

    panView(pointer) {
      if (!pointer || !this.drag?.startPointer || !this.meta) return;
      const base = this.drag.graph;
      const xMin = Number(base.xMin);
      const xMax = Number(base.xMax);
      const yMin = base.yMin === "" ? this.meta.yMin : Number(base.yMin);
      const yMax = base.yMax === "" ? this.meta.yMax : Number(base.yMax);
      if (![xMin, xMax, yMin, yMax].every(Number.isFinite) || xMin >= xMax || yMin >= yMax) return;
      const dxPx = pointer.x - this.drag.startPointer.x;
      const dyPx = pointer.y - this.drag.startPointer.y;
      const xShift = (-dxPx / this.meta.plot.width) * (xMax - xMin);
      const yShift = (dyPx / this.meta.plot.height) * (yMax - yMin);
      this.graph.autoFit = false;
      this.graph.xMin = round(xMin + xShift);
      this.graph.xMax = round(xMax + xShift);
      this.graph.yMin = round(yMin + yShift);
      this.graph.yMax = round(yMax + yShift);
      this.syncControls();
    }

    moveShapePoint(hit, dx, dy, currentPoint) {
      const shape = this.graph.shapes[hit.shapeIndex];
      if (!shape) return;
      const baseShape = this.drag?.graph?.shapes?.[hit.shapeIndex] || shape;
      const basePoint = shapePoints(baseShape)?.[hit.pointIndex];
      const targetPoint = this.graph.snapToGrid && basePoint
        ? this.snapPoint({ x: basePoint.x + dx, y: basePoint.y + dy }, { excludeLabel: basePoint.label })
        : currentPoint;
      if (shape.type === "regularPolygon") {
        this.reshapeRegularPolygonVertex(hit.shapeIndex, hit.pointIndex, targetPoint);
        return;
      }
      if (isRectangleShape(shape)) {
        this.reshapeRectangle(hit.shapeIndex, hit.pointIndex, targetPoint);
        return;
      }
      if (shape.type === "parallelogram") {
        this.reshapeParallelogram(hit.shapeIndex, hit.pointIndex, targetPoint);
        return;
      }
      if (shape.type === "trapezoid") {
        this.reshapeTrapezoid(hit.shapeIndex, hit.pointIndex, targetPoint);
        return;
      }
      if (shape.type === "irregularPolygon" && shape.points?.[hit.pointIndex]) {
        shape.points[hit.pointIndex].x = round(targetPoint.x);
        shape.points[hit.pointIndex].y = round(targetPoint.y);
      }
      if (shape.type === "circuitSymbol" && shape.points?.[hit.pointIndex]) {
        shape.points[hit.pointIndex].x = round(targetPoint.x);
        shape.points[hit.pointIndex].y = round(targetPoint.y);
      }
      if (shape.type === "circle") {
        if (hit.pointIndex === 0) {
          const baseCenter = baseShape.center || shape.center;
          const centerTarget = this.graph.snapToGrid
            ? this.snapPoint({ x: baseCenter.x + dx, y: baseCenter.y + dy }, { excludeLabel: baseCenter.label })
            : { x: baseCenter.x + dx, y: baseCenter.y + dy };
          const moveDx = centerTarget.x - baseCenter.x;
          const moveDy = centerTarget.y - baseCenter.y;
          shape.center.x = round(centerTarget.x);
          shape.center.y = round(centerTarget.y);
          if (shape.radiusPoint) {
            const baseRadiusPoint = baseShape.radiusPoint || shape.radiusPoint;
            shape.radiusPoint.x = round(baseRadiusPoint.x + moveDx);
            shape.radiusPoint.y = round(baseRadiusPoint.y + moveDy);
          }
        } else {
          shape.radius = Math.max(0.1, round(distance(shape.center, targetPoint)));
          shape.radiusPoint = normalizeShapePoint({ ...shape.radiusPoint, x: targetPoint.x, y: targetPoint.y });
        }
      }
    }

    moveShapePointLabel(hit, dx, dy) {
      const shape = this.graph.shapes[hit.shapeIndex];
      if (!shape) return;
      const scale = 1 / this.unitsPerPixel();
      if (shape.type === "regularPolygon") {
        if (!Array.isArray(shape.vertexLabelOffsets)) shape.vertexLabelOffsets = [];
        const base = this.drag.graph.shapes[hit.shapeIndex].vertexLabelOffsets?.[hit.pointIndex] || { dx: 8, dy: -7 };
        const offset = this.labelOffset(base, 8, -7);
        shape.vertexLabelOffsets[hit.pointIndex] = {
          dx: round(offset.dx + dx * scale),
          dy: round(offset.dy - dy * scale),
          ...this.labelBasis()
        };
        return;
      }
      if (shape.points?.[hit.pointIndex]) {
        const base = this.drag.graph.shapes[hit.shapeIndex].points[hit.pointIndex];
        const target = shape.points[hit.pointIndex];
        const offset = this.labelOffset(base, 8, -7);
        target.labelDx = round(offset.dx + dx * scale);
        target.labelDy = round(offset.dy - dy * scale);
        Object.assign(target, this.labelBasis());
      }
    }

    moveShapeSegmentLabel(hit, dx, dy) {
      const shape = this.graph.shapes[hit.shapeIndex];
      const baseShape = this.drag.graph.shapes[hit.shapeIndex] || {};
      if (!shape || !hit.key) return;
      const scale = 1 / this.unitsPerPixel();
      if (!shape.segmentLabelOffsets || typeof shape.segmentLabelOffsets !== "object") shape.segmentLabelOffsets = {};
      const base = baseShape.segmentLabelOffsets?.[hit.key] || { dx: 0, dy: -10 };
      const offset = this.labelOffset(base, 0, -10);
      shape.segmentLabelOffsets[hit.key] = {
        dx: round(offset.dx + dx * scale),
        dy: round(offset.dy - dy * scale),
        ...this.labelBasis()
      };
    }

    shapeEdgeKey(shape, edgeIndex, start, end) {
      return cleanObjectId(`${cleanLabel(start?.label, `P${edgeIndex}`)}${cleanLabel(end?.label, `P${edgeIndex + 1}`)}`);
    }

    shapeSegmentLabelMode(shape, key) {
      return shape?.segmentLabelModes?.[key] || "name";
    }

    setShapeSegmentLabelMode(shape, key, mode) {
      if (!shape || !key) return;
      if (!shape.segmentLabelModes || typeof shape.segmentLabelModes !== "object") shape.segmentLabelModes = {};
      shape.segmentLabelModes[key] = ["name", "length", "variable", "hidden"].includes(mode) ? mode : "hidden";
    }

    shapeSegmentOffset(shape, key) {
      return this.labelOffset(shape?.segmentLabelOffsets?.[key], 0, -10);
    }

    moveWholeShape(index, dx, dy) {
      const shape = this.graph.shapes[index];
      const base = this.drag?.graph?.shapes?.[index] || shape;
      if (!shape) return;
      if (shape.type === "regularPolygon") {
        shape.centerX = round(toNumber(base.centerX, shape.centerX) + dx);
        shape.centerY = round(toNumber(base.centerY, shape.centerY) + dy);
      }
      if (shape.type === "circle") {
        const baseCenter = base.center || shape.center;
        shape.center.x = round(baseCenter.x + dx);
        shape.center.y = round(baseCenter.y + dy);
        if (shape.radiusPoint) {
          const baseRadiusPoint = base.radiusPoint || shape.radiusPoint;
          shape.radiusPoint.x = round(baseRadiusPoint.x + dx);
          shape.radiusPoint.y = round(baseRadiusPoint.y + dy);
        }
      }
      if (shape.type === "latexText") {
        shape.x = round(toNumber(base.x, shape.x) + dx);
        shape.y = round(toNumber(base.y, shape.y) + dy);
      }
      if (["irregularPolygon", "trapezoid", "parallelogram", "circuitSymbol"].includes(shape.type)) {
        shape.points = (base.points || shape.points || []).map((point) => copyPointMeta(point, {
          x: point.x + dx,
          y: point.y + dy
        }));
        if (shape.type === "circuitSymbol") {
          shape.terminals = (base.terminals || shape.terminals || []).map((point) => copyPointMeta(point, {
            x: point.x + dx,
            y: point.y + dy
          }));
        }
      }
    }

    moveStandaloneLabels(labels, dx, dy) {
      const wanted = new Set((labels || []).map((label) => cleanLabel(label).toLowerCase()).filter(Boolean));
      this.graph.points.forEach((point, index) => {
        if (!wanted.has(cleanLabel(point.label).toLowerCase())) return;
        const base = this.drag?.graph?.points?.[index] || point;
        point.x = round(base.x + dx);
        point.y = round(base.y + dy);
      });
    }

    selectedShapeIndex() {
      if (!this.selected) return -1;
      if (this.selected.kind === "shape") return this.selected.index;
      if (this.selected.kind === "shapePoint" || this.selected.kind === "shapePointLabel") return this.selected.shapeIndex;
      if (this.selected.kind === "shapeResize" || this.selected.kind === "shapeRotate") return this.selected.index;
      return -1;
    }

    selectedSegmentIndex() {
      if (!this.selected) return -1;
      if (["segment", "segmentRotate", "segmentEdgeRotate"].includes(this.selected.kind)) return this.selected.index;
      return -1;
    }

    shapeCenter(shape) {
      if (!shape) return { x: 0, y: 0 };
      if (shape.type === "regularPolygon") return { x: shape.centerX, y: shape.centerY };
      if (shape.type === "circle") return { x: shape.center.x, y: shape.center.y };
      if (shape.type === "latexText") return { x: shape.x, y: shape.y };
      return averagePoint(shape.points || []);
    }

    shapeTransformHandles(shape) {
      const bounds = this.shapeBounds(shape);
      if (!bounds) return null;
      const centerGraph = this.shapeCenter(shape);
      const a = this.toPx(bounds.xMin, bounds.yMin);
      const b = this.toPx(bounds.xMax, bounds.yMax);
      const left = Math.min(a.x, b.x);
      const right = Math.max(a.x, b.x);
      const top = Math.min(a.y, b.y);
      const bottom = Math.max(a.y, b.y);
      const center = this.toPx(centerGraph.x, centerGraph.y);
      const handleMargin = 14;
      const rotate = {
        x: clamp(right + 24, handleMargin, this.meta.width - handleMargin),
        y: clamp(top - 24, handleMargin, this.meta.height - handleMargin)
      };
      const resize = {
        x: clamp(right + 24, handleMargin, this.meta.width - handleMargin),
        y: clamp(bottom + 24, handleMargin, this.meta.height - handleMargin)
      };
      return {
        left,
        right,
        top,
        bottom,
        center,
        centerGraph,
        rotate,
        resize,
        rotateGraph: this.graphFromCanvasPoint(rotate, true),
        resizeGraph: this.graphFromCanvasPoint(resize, true)
      };
    }

    segmentTransformHandles(segment) {
      const start = this.pointByLabel(segment?.from);
      const end = this.pointByLabel(segment?.to);
      if (!start || !end || !this.meta) return null;
      const a = this.toPx(start.x, start.y);
      const b = this.toPx(end.x, end.y);
      const padding = 10;
      const left = Math.min(a.x, b.x) - padding;
      const right = Math.max(a.x, b.x) + padding;
      const top = Math.min(a.y, b.y) - padding;
      const bottom = Math.max(a.y, b.y) + padding;
      const centerGraph = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
      const center = this.toPx(centerGraph.x, centerGraph.y);
      const margin = 14;
      const rotate = {
        x: clamp(right + 24, margin, this.meta.width - margin),
        y: clamp(top - 24, margin, this.meta.height - margin)
      };
      return {
        left,
        right,
        top,
        bottom,
        center,
        centerGraph,
        start: a,
        end: b,
        startGraph: { x: start.x, y: start.y },
        endGraph: { x: end.x, y: end.y },
        rotate,
        rotateGraph: this.graphFromCanvasPoint(rotate, true)
      };
    }

    rotateSegment(index, currentPoint, hit) {
      const baseGraph = this.drag?.graph;
      const segment = baseGraph?.segments?.[index];
      if (!segment || !currentPoint) return;
      const start = this.pointByLabelInGraph(baseGraph, segment.from);
      const end = this.pointByLabelInGraph(baseGraph, segment.to);
      if (!start || !end) return;
      const center = hit.centerGraph || { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
      const target = this.dragHandlePoint(hit, currentPoint);
      const startAngle = Math.atan2((hit.handleStart?.y ?? target.y) - center.y, (hit.handleStart?.x ?? target.x) - center.x);
      const targetAngle = Math.atan2(target.y - center.y, target.x - center.x);
      const delta = targetAngle - startAngle;
      [segment.from, segment.to].forEach((label) => {
        const pointIndex = baseGraph.points.findIndex((point) => cleanLabel(point.label).toLowerCase() === cleanLabel(label).toLowerCase());
        if (pointIndex < 0 || !this.graph.points[pointIndex]) return;
        const rotated = rotatePointAround(baseGraph.points[pointIndex], center, delta);
        this.graph.points[pointIndex].x = rotated.x;
        this.graph.points[pointIndex].y = rotated.y;
      });
    }

    rotateSegmentFromEdge(index, currentPoint, hit) {
      const baseGraph = this.drag?.graph;
      const segment = baseGraph?.segments?.[index];
      if (!segment || !currentPoint) return;
      const movingLabel = hit.endpoint === "to" ? segment.to : segment.from;
      const pivotLabel = hit.endpoint === "to" ? segment.from : segment.to;
      const movingIndex = baseGraph.points.findIndex((point) => cleanLabel(point.label).toLowerCase() === cleanLabel(movingLabel).toLowerCase());
      const pivot = this.pointByLabelInGraph(baseGraph, pivotLabel);
      const moving = movingIndex >= 0 ? baseGraph.points[movingIndex] : null;
      if (!moving || !pivot || !this.graph.points[movingIndex]) return;
      const target = this.dragHandlePoint(hit, currentPoint);
      const length = Math.max(0.1, distance(pivot, moving));
      const fallbackAngle = Math.atan2(moving.y - pivot.y, moving.x - pivot.x);
      const angle = distance(pivot, target) > 0.0001
        ? Math.atan2(target.y - pivot.y, target.x - pivot.x)
        : fallbackAngle;
      this.graph.points[movingIndex].x = round(pivot.x + Math.cos(angle) * length);
      this.graph.points[movingIndex].y = round(pivot.y + Math.sin(angle) * length);
    }

    pointByLabelInGraph(graph, label) {
      const clean = cleanLabel(label).toLowerCase();
      const manual = (graph?.points || []).find((point) => cleanLabel(point.label).toLowerCase() === clean);
      if (manual) return manual;
      for (const shape of graph?.shapes || []) {
        const found = connectionPointsForShape(shape).find((point) => cleanLabel(point.label).toLowerCase() === clean)
          || shapePoints(shape).find((point) => cleanLabel(point.label).toLowerCase() === clean);
        if (found) return found;
      }
      return null;
    }

    groupSelectionBounds(graph = this.graph) {
      if (this.selectionItems().length < 2) return null;
      const points = [];
      const add = (point) => {
        if (point && Number.isFinite(Number(point.x)) && Number.isFinite(Number(point.y))) points.push(point);
      };
      const addShapeBounds = (shape) => {
        const bounds = this.shapeBounds(shape);
        if (!bounds) return;
        add({ x: bounds.xMin, y: bounds.yMin });
        add({ x: bounds.xMax, y: bounds.yMax });
      };
      this.selectionItems().forEach((hit) => {
        if (hit.kind === "point") add(graph.points?.[hit.index]);
        if (["shape", "shapeResize", "shapeRotate"].includes(hit.kind)) addShapeBounds(graph.shapes?.[hit.index]);
        if (hit.kind === "shapePoint") add(shapePoints(graph.shapes?.[hit.shapeIndex])?.[hit.pointIndex]);
        if (["segment", "segmentRotate", "segmentEdgeRotate"].includes(hit.kind)) {
          const segment = graph.segments?.[hit.index];
          add(this.pointByLabelInGraph(graph, segment?.from));
          add(this.pointByLabelInGraph(graph, segment?.to));
        }
        if (hit.kind === "angle") {
          const angle = graph.angles?.[hit.index];
          add(this.pointByLabelInGraph(graph, angle?.from));
          add(this.pointByLabelInGraph(graph, angle?.vertex));
          add(this.pointByLabelInGraph(graph, angle?.to));
        }
      });
      if (!points.length) return null;
      const xs = points.map((point) => Number(point.x));
      const ys = points.map((point) => Number(point.y));
      return { xMin: Math.min(...xs), xMax: Math.max(...xs), yMin: Math.min(...ys), yMax: Math.max(...ys) };
    }

    groupTransformHandles(graph = this.graph) {
      const bounds = this.groupSelectionBounds(graph);
      if (!bounds || !this.meta) return null;
      const a = this.toPx(bounds.xMin, bounds.yMin);
      const b = this.toPx(bounds.xMax, bounds.yMax);
      const left = Math.min(a.x, b.x);
      const right = Math.max(a.x, b.x);
      const top = Math.min(a.y, b.y);
      const bottom = Math.max(a.y, b.y);
      const centerGraph = { x: (bounds.xMin + bounds.xMax) / 2, y: (bounds.yMin + bounds.yMax) / 2 };
      const center = this.toPx(centerGraph.x, centerGraph.y);
      const margin = 14;
      const resize = {
        x: clamp(right + 24, margin, this.meta.width - margin),
        y: clamp(bottom + 24, margin, this.meta.height - margin)
      };
      const rotate = {
        x: clamp(right + 24, margin, this.meta.width - margin),
        y: clamp(top - 24, margin, this.meta.height - margin)
      };
      return {
        left,
        right,
        top,
        bottom,
        center,
        centerGraph,
        rotate,
        resize,
        rotateGraph: this.graphFromCanvasPoint(rotate, true),
        resizeGraph: this.graphFromCanvasPoint(resize, true)
      };
    }

    rotateSelectedGroup(currentPoint, hit) {
      const baseGraph = this.drag?.graph;
      if (!baseGraph || !currentPoint) return;
      const center = hit.centerGraph || this.groupTransformHandles(baseGraph)?.centerGraph;
      if (!center) return;
      const target = this.dragHandlePoint(hit, currentPoint);
      const startPoint = hit.handleStart || target;
      const startAngle = Math.atan2(startPoint.y - center.y, startPoint.x - center.x);
      const currentAngle = Math.atan2(target.y - center.y, target.x - center.x);
      const delta = currentAngle - startAngle;
      const rotatedPoints = new Set();
      const rotatedShapes = new Set();

      const rotateManualPoint = (labelOrIndex) => {
        const index = typeof labelOrIndex === "number"
          ? labelOrIndex
          : baseGraph.points.findIndex((point) => cleanLabel(point.label).toLowerCase() === cleanLabel(labelOrIndex).toLowerCase());
        if (index < 0 || rotatedPoints.has(index) || !baseGraph.points[index] || !this.graph.points[index]) return;
        rotatedPoints.add(index);
        const rotated = rotatePointAround(baseGraph.points[index], center, delta);
        this.graph.points[index].x = rotated.x;
        this.graph.points[index].y = rotated.y;
      };

      const rotateGroupShape = (index) => {
        if (index < 0 || rotatedShapes.has(index)) return;
        const base = baseGraph.shapes?.[index];
        const shape = this.graph.shapes?.[index];
        if (!base || !shape) return;
        rotatedShapes.add(index);
        if (shape.type === "regularPolygon") {
          const rotatedCenter = rotatePointAround({ x: base.centerX, y: base.centerY }, center, delta);
          shape.centerX = rotatedCenter.x;
          shape.centerY = rotatedCenter.y;
          shape.rotation = round((base.rotation || 0) + (delta * 180) / Math.PI);
          return;
        }
        if (shape.type === "circle") {
          shape.center = copyPointMeta(base.center, rotatePointAround(base.center, center, delta));
          shape.radiusPoint = copyPointMeta(base.radiusPoint, rotatePointAround(base.radiusPoint, center, delta));
          return;
        }
        if (shape.type === "latexText") {
          const rotated = rotatePointAround({ x: base.x, y: base.y }, center, delta);
          shape.x = rotated.x;
          shape.y = rotated.y;
          return;
        }
        shape.points = (base.points || []).map((point) => copyPointMeta(point, rotatePointAround(point, center, delta)));
        if (shape.type === "circuitSymbol") {
          shape.terminals = (base.terminals || []).map((point) => copyPointMeta(point, rotatePointAround(point, center, delta)));
        }
      };

      this.selectionItems().forEach((selection) => {
        if (selection.kind === "point") rotateManualPoint(selection.index);
        if (["shape", "shapeResize", "shapeRotate"].includes(selection.kind)) rotateGroupShape(selection.index);
        if (["segment", "segmentRotate", "segmentEdgeRotate"].includes(selection.kind)) {
          const segment = baseGraph.segments?.[selection.index];
          rotateManualPoint(segment?.from);
          rotateManualPoint(segment?.to);
        }
        if (selection.kind === "angle") {
          const angle = baseGraph.angles?.[selection.index];
          rotateManualPoint(angle?.from);
          rotateManualPoint(angle?.vertex);
          rotateManualPoint(angle?.to);
        }
      });
    }

    resizeSelectedGroup(currentPoint, hit) {
      const baseGraph = this.drag?.graph;
      if (!baseGraph || !currentPoint) return;
      const center = hit.centerGraph || this.groupTransformHandles(baseGraph)?.centerGraph;
      const target = this.dragHandlePoint(hit, currentPoint);
      const start = Math.max(0.1, distance(center, hit.handleStart || target));
      const now = Math.max(0.1, distance(center, target));
      const scale = clamp(now / start, 0.08, 20);
      const scaledPoints = new Set();
      const scaledShapes = new Set();
      const scaleManualPoint = (labelOrIndex) => {
        const index = typeof labelOrIndex === "number"
          ? labelOrIndex
          : baseGraph.points.findIndex((point) => cleanLabel(point.label).toLowerCase() === cleanLabel(labelOrIndex).toLowerCase());
        if (index < 0 || scaledPoints.has(index) || !baseGraph.points[index] || !this.graph.points[index]) return;
        scaledPoints.add(index);
        const base = baseGraph.points[index];
        this.graph.points[index].x = round(center.x + (base.x - center.x) * scale);
        this.graph.points[index].y = round(center.y + (base.y - center.y) * scale);
      };
      const scaleShape = (index) => {
        if (index < 0 || scaledShapes.has(index)) return;
        const base = baseGraph.shapes?.[index];
        const shape = this.graph.shapes?.[index];
        if (!base || !shape) return;
        scaledShapes.add(index);
        if (shape.type === "regularPolygon") {
          shape.centerX = round(center.x + (base.centerX - center.x) * scale);
          shape.centerY = round(center.y + (base.centerY - center.y) * scale);
          shape.radius = Math.max(0.1, round(base.radius * scale));
          return;
        }
        if (shape.type === "circle") {
          shape.center.x = round(center.x + (base.center.x - center.x) * scale);
          shape.center.y = round(center.y + (base.center.y - center.y) * scale);
          shape.radius = Math.max(0.1, round(base.radius * scale));
          shape.radiusPoint = copyPointMeta(base.radiusPoint, {
            x: center.x + (base.radiusPoint.x - center.x) * scale,
            y: center.y + (base.radiusPoint.y - center.y) * scale
          });
          return;
        }
        if (shape.type === "latexText") {
          shape.x = round(center.x + (base.x - center.x) * scale);
          shape.y = round(center.y + (base.y - center.y) * scale);
          shape.fontSize = clamp(round(base.fontSize * scale), 8, 96);
          return;
        }
        shape.points = (base.points || []).map((point) => copyPointMeta(point, {
          x: center.x + (point.x - center.x) * scale,
          y: center.y + (point.y - center.y) * scale
        }));
        if (shape.type === "circuitSymbol") {
          shape.terminals = (base.terminals || []).map((point) => copyPointMeta(point, {
            x: center.x + (point.x - center.x) * scale,
            y: center.y + (point.y - center.y) * scale
          }));
          shape.width = Math.max(1, round(base.width * scale));
          shape.height = Math.max(0.4, round(base.height * scale));
        }
      };
      this.selectionItems().forEach((selection) => {
        if (selection.kind === "point") scaleManualPoint(selection.index);
        if (["shape", "shapeResize", "shapeRotate"].includes(selection.kind)) scaleShape(selection.index);
        if (["segment", "segmentRotate", "segmentEdgeRotate"].includes(selection.kind)) {
          const segment = baseGraph.segments?.[selection.index];
          scaleManualPoint(segment?.from);
          scaleManualPoint(segment?.to);
        }
        if (selection.kind === "angle") {
          const angle = baseGraph.angles?.[selection.index];
          scaleManualPoint(angle?.from);
          scaleManualPoint(angle?.vertex);
          scaleManualPoint(angle?.to);
        }
      });
    }

    dragHandlePoint(hit, currentPoint) {
      if (!hit?.handleStart || !hit?.pointerStart || !currentPoint) return currentPoint;
      return {
        x: round(hit.handleStart.x + currentPoint.x - hit.pointerStart.x),
        y: round(hit.handleStart.y + currentPoint.y - hit.pointerStart.y)
      };
    }

    resizeShape(index, currentPoint, hit = null) {
      const shape = this.graph.shapes[index];
      const base = this.drag?.graph?.shapes?.[index] || shape;
      if (!shape || !base || !currentPoint) return;
      const center = this.shapeCenter(base);
      const target = this.dragHandlePoint(hit, currentPoint);
      const startPoint = hit?.handleStart || target;
      if (shape.type === "circle") {
        const start = Math.max(0.1, distance(center, startPoint));
        const now = Math.max(0.1, distance(center, target));
        shape.radius = Math.max(0.1, round((base.radius || shape.radius || 1) * (now / start)));
        const direction = unitVector(center, target);
        shape.radiusPoint = normalizeShapePoint({
          ...shape.radiusPoint,
          x: center.x + direction.x * shape.radius,
          y: center.y + direction.y * shape.radius
        });
        return;
      }
      if (shape.type === "regularPolygon") {
        const start = Math.max(0.1, distance(center, startPoint));
        const now = Math.max(0.1, distance(center, target));
        shape.radius = Math.max(0.1, round((base.radius || shape.radius || 1) * (now / start)));
        return;
      }
      if (shape.type === "latexText") {
        const start = Math.max(0.1, distance(center, startPoint));
        const now = Math.max(0.1, distance(center, target));
        shape.fontSize = clamp(round((base.fontSize || 18) * (now / start)), 8, 96);
        return;
      }
      const points = base.points || [];
      if (!points.length) return;
      const start = Math.max(0.1, distance(center, startPoint));
      const now = Math.max(0.1, distance(center, target));
      const scale = now / start;
      shape.points = points.map((point) => copyPointMeta(point, {
        x: center.x + (point.x - center.x) * scale,
        y: center.y + (point.y - center.y) * scale
      }));
      if (shape.type === "circuitSymbol") {
        shape.terminals = (base.terminals || []).map((point) => copyPointMeta(point, {
          x: center.x + (point.x - center.x) * scale,
          y: center.y + (point.y - center.y) * scale
        }));
        shape.width = Math.max(1, round(toNumber(base.width, distance(points[0], points[1])) * scale));
        shape.height = Math.max(0.4, round(toNumber(base.height, 1.6) * scale));
      }
    }

    rotateShape(index, currentPoint, hit = null) {
      const shape = this.graph.shapes[index];
      const base = this.drag?.graph?.shapes?.[index] || shape;
      if (!shape || !base || !currentPoint) return;
      const center = this.shapeCenter(base);
      const target = this.dragHandlePoint(hit, currentPoint);
      const startPoint = hit?.handleStart || this.drag.start;
      const startAngle = Math.atan2(startPoint.y - center.y, startPoint.x - center.x);
      const currentAngle = Math.atan2(target.y - center.y, target.x - center.x);
      const delta = currentAngle - startAngle;
      if (shape.type === "regularPolygon") {
        shape.rotation = round((base.rotation || 0) + (delta * 180) / Math.PI);
        return;
      }
      if (shape.type === "circle") return;
      if (shape.type === "latexText") return;
      shape.points = (base.points || []).map((point) => copyPointMeta(point, rotatePointAround(point, center, delta)));
      if (shape.type === "circuitSymbol") {
        shape.terminals = (base.terminals || []).map((point) => copyPointMeta(point, rotatePointAround(point, center, delta)));
      }
    }

    reshapeRegularPolygonVertex(shapeIndex, pointIndex, target) {
      const shape = this.graph.shapes[shapeIndex];
      if (!shape || !target) return;
      const center = { x: shape.centerX, y: shape.centerY };
      const sides = Math.max(3, Math.floor(shape.sides || 3));
      shape.radius = Math.max(0.1, round(distance(center, target)));
      shape.rotation = round(((Math.atan2(target.y - center.y, target.x - center.x) - (pointIndex * 2 * Math.PI) / sides) * 180) / Math.PI);
    }

    reshapeRectangle(shapeIndex, pointIndex, target) {
      const shape = this.graph.shapes[shapeIndex];
      const base = this.drag?.graph?.shapes?.[shapeIndex] || shape;
      const points = base?.points || [];
      if (!shape || points.length < 4 || !target) return;
      const center = averagePoint(points);
      const u = unitVector(points[0], points[1]);
      const v = unitVector(points[0], points[3], { x: -u.y, y: u.x });
      const vector = { x: target.x - center.x, y: target.y - center.y };
      const halfWidth = Math.max(0.1, Math.abs(dot(vector, u)));
      const halfHeight = Math.max(0.1, Math.abs(dot(vector, v)));
      const signs = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
      shape.points = signs.map(([sx, sy], index) => copyPointMeta(points[index] || {}, {
        x: center.x + sx * halfWidth * u.x + sy * halfHeight * v.x,
        y: center.y + sx * halfWidth * u.y + sy * halfHeight * v.y
      }));
      shape.constraint = "rectangle";
    }

    reshapeParallelogram(shapeIndex, pointIndex, target) {
      const shape = this.graph.shapes[shapeIndex];
      const base = this.drag?.graph?.shapes?.[shapeIndex] || shape;
      const points = base?.points || [];
      if (!shape || points.length < 4 || !target) return;
      const next = points.map((point) => ({ ...point }));
      const opposite = (pointIndex + 2) % 4;
      const adjacentA = (pointIndex + 1) % 4;
      const adjacentB = (pointIndex + 3) % 4;
      const center = {
        x: (target.x + points[opposite].x) / 2,
        y: (target.y + points[opposite].y) / 2
      };
      const otherDiagonal = {
        x: (points[adjacentA].x - points[adjacentB].x) / 2,
        y: (points[adjacentA].y - points[adjacentB].y) / 2
      };
      next[pointIndex] = copyPointMeta(points[pointIndex], target);
      next[opposite] = copyPointMeta(points[opposite], points[opposite]);
      next[adjacentA] = copyPointMeta(points[adjacentA], { x: center.x + otherDiagonal.x, y: center.y + otherDiagonal.y });
      next[adjacentB] = copyPointMeta(points[adjacentB], { x: center.x - otherDiagonal.x, y: center.y - otherDiagonal.y });
      shape.points = next;
    }

    reshapeTrapezoid(shapeIndex, pointIndex, target) {
      const shape = this.graph.shapes[shapeIndex];
      const base = this.drag?.graph?.shapes?.[shapeIndex] || shape;
      const points = base?.points || [];
      if (!shape || points.length < 4 || !target) return;
      const u = unitVector(points[0], points[1]);
      const n = { x: -u.y, y: u.x };
      const origin = points[0];
      const toCoord = (point) => ({
        u: dot({ x: point.x - origin.x, y: point.y - origin.y }, u),
        n: dot({ x: point.x - origin.x, y: point.y - origin.y }, n)
      });
      const fromCoord = (coord) => ({
        x: origin.x + coord.u * u.x + coord.n * n.x,
        y: origin.y + coord.u * u.y + coord.n * n.y
      });
      const next = points.map((point) => ({ ...point }));
      next[pointIndex] = copyPointMeta(points[pointIndex], target);
      const dragged = toCoord(target);
      const partner = pointIndex <= 1 ? (pointIndex === 0 ? 1 : 0) : (pointIndex === 2 ? 3 : 2);
      const partnerCoord = toCoord(points[partner]);
      partnerCoord.n = dragged.n;
      next[partner] = copyPointMeta(points[partner], fromCoord(partnerCoord));
      shape.points = next;
    }

    pointByLabel(label) {
      const clean = cleanLabel(label).toLowerCase();
      const manual = this.graph.points.find((point) => cleanLabel(point.label).toLowerCase() === clean);
      if (manual) return manual;
      for (const shape of this.graph.shapes) {
        const found = connectionPointsForShape(shape).find((point) => cleanLabel(point.label).toLowerCase() === clean)
          || shapePoints(shape).find((point) => cleanLabel(point.label).toLowerCase() === clean);
        if (found) return found;
      }
      return null;
    }

    attachmentFromSnap(snap) {
      return normalizePointAttachment(snap?.attachment);
    }

    shapeCenterPoint(shape) {
      if (!shape) return null;
      if (shape.type === "regularPolygon") {
        return { x: Number(shape.centerX), y: Number(shape.centerY) };
      }
      if (shape.type === "circle") {
        return shape.center ? { x: Number(shape.center.x), y: Number(shape.center.y) } : null;
      }
      const points = shapePoints(shape);
      return points.length ? averagePoint(points) : null;
    }

    attachmentTargetExists(attachment) {
      if (!attachment) return false;
      if (attachment.type === "function") {
        return this.graph.functions.some((curve) => cleanObjectId(curve.id) === attachment.targetId);
      }
      return this.graph.shapes.some((shape) => cleanObjectId(shape.id) === attachment.targetId);
    }

    resolveAttachedPoints() {
      this.graph.points.forEach((point) => {
        const attachment = normalizePointAttachment(point.attachment);
        if (!attachment) {
          point.attachment = null;
          return;
        }
        point.attachment = attachment;
        const target = this.resolvePointAttachment(attachment);
        if (target) {
          point.x = round(target.x);
          point.y = round(target.y);
        } else if (!this.attachmentTargetExists(attachment)) {
          point.attachment = null;
        }
      });
    }

    resolvePointAttachment(attachment) {
      if (attachment.type === "function") {
        const curve = this.graph.functions.find((item) => cleanObjectId(item.id) === attachment.targetId);
        if (!curve?.expression) return null;
        try {
          const value = Number(compileExpression(curve.expression)(attachment.x));
          return Number.isFinite(value) ? { x: attachment.x, y: value } : null;
        } catch (_) {
          return null;
        }
      }

      const shape = this.graph.shapes.find((item) => cleanObjectId(item.id) === attachment.targetId);
      if (!shape) return null;
      if (attachment.type === "shape-center") return this.shapeCenterPoint(shape);
      if (attachment.type === "circle") {
        if (shape.type !== "circle" || !shape.center) return null;
        return {
          x: Number(shape.center.x) + Number(shape.radius) * Math.cos(attachment.angle),
          y: Number(shape.center.y) + Number(shape.radius) * Math.sin(attachment.angle)
        };
      }

      const points = shapePoints(shape);
      if (attachment.type === "shape-vertex") {
        return points[attachment.vertexIndex] || null;
      }
      if (attachment.type === "shape-edge" && points.length >= 2) {
        const edgeCount = points.length >= 3 ? points.length : points.length - 1;
        const index = Math.min(attachment.edgeIndex, Math.max(0, edgeCount - 1));
        const start = points[index];
        const end = points[(index + 1) % points.length];
        if (!start || !end) return null;
        return {
          x: start.x + (end.x - start.x) * attachment.ratio,
          y: start.y + (end.y - start.y) * attachment.ratio
        };
      }
      return null;
    }

    snapPoint(point, options = {}) {
      const snap = this.snapCandidate(point, options);
      return snap?.point || { x: Math.round(point.x), y: Math.round(point.y) };
    }

    snapCandidate(point, options = {}) {
      if (!point || !this.meta) return null;
      const pointPx = this.toPx(point.x, point.y);
      const near = (candidate) => {
        const p = this.toPx(candidate.x, candidate.y);
        return Math.hypot(p.x - pointPx.x, p.y - pointPx.y);
      };

      const groups = [
        { candidates: this.snapIntersections(), thresholdPx: 34 },
        { candidates: this.snapExistingPoints(options), thresholdPx: 20 },
        { candidates: this.snapLineProjections(point), thresholdPx: 18 },
        { candidates: this.snapCurveProjections(point), thresholdPx: 18 }
      ];
      for (const group of groups) {
        let best = null;
        group.candidates.forEach((candidate) => {
          const d = near(candidate.point);
          if (d <= group.thresholdPx && (!best || d < best.d)) best = { ...candidate, d };
        });
        if (best) return best;
      }

      return { type: "grid", point: { x: Math.round(point.x), y: Math.round(point.y) } };
    }

    snapExistingPoints(options = {}) {
      const candidates = [];
      const excludeLabel = cleanLabel(options.excludeLabel).toLowerCase();
      const shouldSkip = (point) => excludeLabel && cleanLabel(point?.label).toLowerCase() === excludeLabel;
      this.graph.points.forEach((point) => {
        if (point?.label && !shouldSkip(point)) candidates.push({ type: "point", point });
      });
      this.graph.shapes.forEach((shape) => {
        if (shape.visible === false) return;
        const targetId = cleanObjectId(shape.id);
        connectionPointsForShape(shape).forEach((point, vertexIndex) => {
          if (!point || shouldSkip(point)) return;
          let attachment = { type: "shape-vertex", targetId, vertexIndex };
          if (shape.type === "circle" && vertexIndex === 0) {
            attachment = { type: "shape-center", targetId };
          } else if (shape.type === "circle") {
            attachment = {
              type: "circle",
              targetId,
              angle: Math.atan2(point.y - shape.center.y, point.x - shape.center.x)
            };
          }
          candidates.push({ type: "point", point, attachment });
        });
        if (shape.type !== "circle") {
          const center = this.shapeCenterPoint(shape);
          if (center) {
            candidates.push({
              type: "center",
              point: center,
              attachment: { type: "shape-center", targetId }
            });
          }
        }
      });
      return candidates;
    }

    snapCircles() {
      return this.graph.shapes
        .filter((shape) => shape.visible !== false && shape.type === "circle" && shape.center && Number.isFinite(Number(shape.radius)))
        .map((shape) => ({ center: shape.center, radius: Number(shape.radius), shape }))
        .filter((circle) => circle.radius > 0);
    }

    functionSampleGroups(samples = 720) {
      if (!this.meta) return [];
      const yRange = Math.max(1, this.meta.yMax - this.meta.yMin);
      return this.graph.functions.map((curve, functionIndex) => {
        if (curve.visible === false || !curve.expression) return { functionIndex, curve, points: [] };
        let fn = null;
        try {
          fn = compileExpression(curve.expression);
        } catch (_) {
          return { functionIndex, curve, points: [] };
        }
        const hasDomainMin = String(curve.xMin ?? "").trim() !== "" && Number.isFinite(Number(curve.xMin));
        const hasDomainMax = String(curve.xMax ?? "").trim() !== "" && Number.isFinite(Number(curve.xMax));
        const domainMin = hasDomainMin ? Number(curve.xMin) : this.meta.xMin;
        const domainMax = hasDomainMax ? Number(curve.xMax) : this.meta.xMax;
        const start = Math.max(this.meta.xMin, Math.min(domainMin, domainMax));
        const end = Math.min(this.meta.xMax, Math.max(domainMin, domainMax));
        if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) return { functionIndex, curve, points: [] };
        const points = [];
        for (let index = 0; index <= samples; index += 1) {
          const x = start + ((end - start) * index) / samples;
          let y = NaN;
          try {
            y = Number(fn(x));
          } catch (_) {
            y = NaN;
          }
          if (!Number.isFinite(y) || y < this.meta.yMin - yRange || y > this.meta.yMax + yRange) continue;
          points.push({ x: round(x), y: round(y) });
        }
        return { functionIndex, curve, points };
      });
    }

    functionSamplePoints(samples = 720) {
      return this.functionSampleGroups(samples).flatMap((group) => group.points);
    }

    snapLineSegments() {
      const segments = [];
      const add = (a, b, type = "line", attachment = null) => {
        if (a && b && distance(a, b) > 0) segments.push({ a, b, type, attachment });
      };
      this.graph.segments.forEach((segment) => {
        const a = this.pointByLabel(segment.from);
        const b = this.pointByLabel(segment.to);
        add(a, b, "segment");
      });
      this.graph.shapes.forEach((shape) => {
        const points = shapePoints(shape);
        if (shape.visible === false || points.length < 2 || shape.type === "circle" || shape.type === "latexText") return;
        const edgeCount = points.length >= 3 ? points.length : points.length - 1;
        for (let index = 0; index < edgeCount; index += 1) {
          add(points[index], points[(index + 1) % points.length], "shape", {
            targetId: cleanObjectId(shape.id),
            edgeIndex: index
          });
        }
      });
      if (this.graph.displayMode !== "geometry") {
        if (this.meta.yMin <= 0 && this.meta.yMax >= 0) add({ x: this.meta.xMin, y: 0 }, { x: this.meta.xMax, y: 0 }, "axis");
        if (this.meta.xMin <= 0 && this.meta.xMax >= 0) add({ x: 0, y: this.meta.yMin }, { x: 0, y: this.meta.yMax }, "axis");
      }
      return segments;
    }

    snapIntersections() {
      const segments = this.snapLineSegments();
      const points = [];
      for (let i = 0; i < segments.length; i += 1) {
        for (let j = i + 1; j < segments.length; j += 1) {
          const point = this.segmentIntersection(segments[i].a, segments[i].b, segments[j].a, segments[j].b);
          if (point) points.push({ type: "intersection", point });
        }
      }
      const circles = this.snapCircles();
      segments.forEach((segment) => {
        circles.forEach((circle) => {
          this.lineCircleIntersections(segment.a, segment.b, circle).forEach((point) => points.push({ type: "intersection", point }));
        });
      });
      for (let i = 0; i < circles.length; i += 1) {
        for (let j = i + 1; j < circles.length; j += 1) {
          this.circleCircleIntersections(circles[i], circles[j]).forEach((point) => points.push({ type: "intersection", point }));
        }
      }
      this.functionSampleGroups(720).forEach(({ points: functionPoints }) => {
        if (functionPoints.length > 1) {
          for (let index = 0; index < functionPoints.length - 1; index += 1) {
            const a = functionPoints[index];
            const b = functionPoints[index + 1];
            if (!a || !b || distance(a, b) === 0) continue;
            segments.forEach((segment) => {
              const point = this.segmentIntersection(segment.a, segment.b, a, b);
              if (point) points.push({ type: "intersection", point });
            });
            circles.forEach((circle) => {
              this.lineCircleIntersections(a, b, circle).forEach((point) => points.push({ type: "intersection", point }));
            });
          }
        }
      });
      return points;
    }

    segmentIntersection(a, b, c, d) {
      const r = { x: b.x - a.x, y: b.y - a.y };
      const s = { x: d.x - c.x, y: d.y - c.y };
      const denominator = r.x * s.y - r.y * s.x;
      if (Math.abs(denominator) < 1e-9) return null;
      const u = ((c.x - a.x) * r.y - (c.y - a.y) * r.x) / denominator;
      const t = ((c.x - a.x) * s.y - (c.y - a.y) * s.x) / denominator;
      if (t < -1e-6 || t > 1 + 1e-6 || u < -1e-6 || u > 1 + 1e-6) return null;
      return { x: round(a.x + t * r.x), y: round(a.y + t * r.y) };
    }

    lineCircleIntersections(a, b, circle) {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const fx = a.x - circle.center.x;
      const fy = a.y - circle.center.y;
      const qa = dx * dx + dy * dy;
      if (!qa) return [];
      const qb = 2 * (fx * dx + fy * dy);
      const qc = fx * fx + fy * fy - circle.radius * circle.radius;
      const discriminant = qb * qb - 4 * qa * qc;
      if (discriminant < -1e-9) return [];
      const sqrtDiscriminant = Math.sqrt(Math.max(0, discriminant));
      const roots = [(-qb - sqrtDiscriminant) / (2 * qa), (-qb + sqrtDiscriminant) / (2 * qa)];
      return roots
        .filter((t, index, all) => t >= -1e-6 && t <= 1 + 1e-6 && all.findIndex((other) => Math.abs(other - t) < 1e-6) === index)
        .map((t) => ({ x: round(a.x + dx * t), y: round(a.y + dy * t) }));
    }

    circleCircleIntersections(first, second) {
      const x0 = first.center.x;
      const y0 = first.center.y;
      const x1 = second.center.x;
      const y1 = second.center.y;
      const dx = x1 - x0;
      const dy = y1 - y0;
      const d = Math.hypot(dx, dy);
      if (d < 1e-9 || d > first.radius + second.radius + 1e-9 || d < Math.abs(first.radius - second.radius) - 1e-9) return [];
      const a = (first.radius * first.radius - second.radius * second.radius + d * d) / (2 * d);
      const hSq = first.radius * first.radius - a * a;
      if (hSq < -1e-9) return [];
      const h = Math.sqrt(Math.max(0, hSq));
      const xm = x0 + (a * dx) / d;
      const ym = y0 + (a * dy) / d;
      const rx = (-dy * h) / d;
      const ry = (dx * h) / d;
      const points = [{ x: round(xm + rx), y: round(ym + ry) }];
      if (h > 1e-9) points.push({ x: round(xm - rx), y: round(ym - ry) });
      return points;
    }

    snapLineProjections(point) {
      return this.snapLineSegments().map((segment) => {
        const projection = this.projectPointToSegmentData(point, segment.a, segment.b);
        return {
          type: segment.type,
          point: projection.point,
          attachment: segment.attachment
            ? {
                type: "shape-edge",
                targetId: segment.attachment.targetId,
                edgeIndex: segment.attachment.edgeIndex,
                ratio: projection.ratio
              }
            : null
        };
      });
    }

    snapCurveProjections(point) {
      const candidates = [];
      this.snapCircles().forEach((circle) => {
        const vector = { x: point.x - circle.center.x, y: point.y - circle.center.y };
        const length = Math.hypot(vector.x, vector.y) || 1;
        const angle = Math.atan2(vector.y, vector.x);
        candidates.push({
          type: "circle",
          point: {
            x: round(circle.center.x + (vector.x / length) * circle.radius),
            y: round(circle.center.y + (vector.y / length) * circle.radius)
          },
          attachment: {
            type: "circle",
            targetId: cleanObjectId(circle.shape.id),
            angle
          }
        });
      });
      const pointPx = this.toPx(point.x, point.y);
      let bestFunction = null;
      this.functionSampleGroups(720).forEach(({ curve, points }) => {
        points.forEach((candidate) => {
          const px = this.toPx(candidate.x, candidate.y);
          const d = Math.hypot(px.x - pointPx.x, px.y - pointPx.y);
          if (!bestFunction || d < bestFunction.d) bestFunction = { curve, point: candidate, d };
        });
      });
      if (bestFunction) {
        candidates.push({
          type: "function",
          point: bestFunction.point,
          attachment: {
            type: "function",
            targetId: cleanObjectId(bestFunction.curve.id),
            x: bestFunction.point.x
          }
        });
      }
      return candidates;
    }

    projectPointToSegment(point, a, b) {
      return this.projectPointToSegmentData(point, a, b).point;
    }

    projectPointToSegmentData(point, a, b) {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const lengthSq = dx * dx + dy * dy;
      if (!lengthSq) return { point: { ...a }, ratio: 0 };
      const ratio = clamp(((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSq, 0, 1);
      return {
        point: { x: round(a.x + ratio * dx), y: round(a.y + ratio * dy) },
        ratio
      };
    }

    unitsPerPixel() {
      if (!this.meta) return 0.05;
      return Math.max((this.meta.xMax - this.meta.xMin) / this.meta.plot.width, (this.meta.yMax - this.meta.yMin) / this.meta.plot.height);
    }

    labelOffset(source, fallbackDx = 0, fallbackDy = 0) {
      const plotWidth = this.meta?.plot?.width || 0;
      const plotHeight = this.meta?.plot?.height || 0;
      const basisWidth = Math.max(0, toNumber(source?.labelBasisWidth, 0));
      const basisHeight = Math.max(0, toNumber(source?.labelBasisHeight, 0));
      return {
        dx: toNumber(source?.labelDx ?? source?.dx, fallbackDx) * (basisWidth && plotWidth ? plotWidth / basisWidth : 1),
        dy: toNumber(source?.labelDy ?? source?.dy, fallbackDy) * (basisHeight && plotHeight ? plotHeight / basisHeight : 1)
      };
    }

    labelBasis() {
      return {
        labelBasisWidth: Math.max(0, toNumber(this.meta?.plot?.width, 0)),
        labelBasisHeight: Math.max(0, toNumber(this.meta?.plot?.height, 0))
      };
    }

    pointer(event) {
      const rect = this.canvas.getBoundingClientRect();
      const width = this.meta?.width || (this.canvas.width / (window.devicePixelRatio || 1)) || rect.width || 1;
      const height = this.meta?.height || (this.canvas.height / (window.devicePixelRatio || 1)) || rect.height || 1;
      return {
        x: ((event.clientX - rect.left) / (rect.width || width)) * width,
        y: ((event.clientY - rect.top) / (rect.height || height)) * height
      };
    }

    graphFromCanvasPoint(pointer, allowOutside = false) {
      if (!this.meta) this.draw();
      const plot = this.meta.plot;
      if (!allowOutside && (pointer.x < plot.left || pointer.x > plot.left + plot.width || pointer.y < plot.top || pointer.y > plot.top + plot.height)) return null;
      return {
        x: round(this.meta.xMin + ((pointer.x - plot.left) / plot.width) * (this.meta.xMax - this.meta.xMin)),
        y: round(this.meta.yMax - ((pointer.y - plot.top) / plot.height) * (this.meta.yMax - this.meta.yMin))
      };
    }

    canvasToGraph(event, allowOutside = false) {
      return this.graphFromCanvasPoint(this.pointer(event), allowOutside);
    }

    toPx(x, y) {
      const plot = this.meta.plot;
      return {
        x: plot.left + ((x - this.meta.xMin) / (this.meta.xMax - this.meta.xMin)) * plot.width,
        y: plot.top + ((this.meta.yMax - y) / (this.meta.yMax - this.meta.yMin)) * plot.height
      };
    }

    distancePointToSegment(point, a, b) {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const lengthSq = dx * dx + dy * dy;
      if (!lengthSq) return Math.hypot(point.x - a.x, point.y - a.y);
      const t = clamp(((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSq, 0, 1);
      return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy));
    }

    findFunctionHit(event) {
      if (!this.meta || !this.graph.functions.length) return null;
      const pointer = this.pointer(event);
      let best = null;
      this.functionSampleGroups(240).forEach(({ functionIndex, points }) => {
        points.forEach((point) => {
          const p = this.toPx(point.x, point.y);
          const distancePx = Math.hypot(pointer.x - p.x, pointer.y - p.y);
          if (!best || distancePx < best.distancePx) best = { kind: "function", index: functionIndex, distancePx };
        });
      });
      return best && best.distancePx <= 10 ? { kind: "function", index: best.index } : null;
    }

    calculateBounds() {
      let points = [...this.graph.points];
      this.graph.shapes.forEach((shape) => points.push(...shapePoints(shape)));
      if (!points.length || this.graph.autoFit === false || this.graph.functions.length) {
        const xMin = toNumber(this.graph.xMin, -10);
        const xMax = toNumber(this.graph.xMax, 10);
        const yMin = this.graph.yMin === "" ? -10 : toNumber(this.graph.yMin, -10);
        const yMax = this.graph.yMax === "" ? 10 : toNumber(this.graph.yMax, 10);
        return {
          xMin: xMin < xMax ? xMin : -10,
          xMax: xMin < xMax ? xMax : 10,
          yMin: yMin < yMax ? yMin : -10,
          yMax: yMin < yMax ? yMax : 10
        };
      }
      const xs = points.map((point) => Number(point.x)).filter(Number.isFinite);
      const ys = points.map((point) => Number(point.y)).filter(Number.isFinite);
      if (!xs.length || !ys.length) return { xMin: -10, xMax: 10, yMin: -10, yMax: 10 };
      const xMid = (Math.min(...xs) + Math.max(...xs)) / 2;
      const yMid = (Math.min(...ys) + Math.max(...ys)) / 2;
      const range = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 4) * 1.3;
      if (![xMid, yMid, range].every(Number.isFinite) || range <= 0) return { xMin: -10, xMax: 10, yMin: -10, yMax: 10 };
      return { xMin: xMid - range / 2, xMax: xMid + range / 2, yMin: yMid - range / 2, yMax: yMid + range / 2 };
    }

    draw() {
      if (this.destroyed) return;
      const questionCard = this.host.closest?.(".exam-question-card");
      const graphSection = this.host.closest?.('[data-fold-section="graph"]');
      if (!this.host.isConnected
        || questionCard?.classList.contains("is-collapsed")
        || graphSection?.classList.contains("is-collapsed")) {
        this.drawDeferred = true;
        return;
      }
      this.drawDeferred = false;
      this.resolveAttachedPoints();
      const rect = this.canvas.getBoundingClientRect();
      const stage = this.canvas.parentElement;
      const stageStyle = stage ? window.getComputedStyle(stage) : null;
      const stagePadding = stageStyle
        ? (Number.parseFloat(stageStyle.paddingLeft) || 0) + (Number.parseFloat(stageStyle.paddingRight) || 0)
        : 0;
      const stageWidth = stage?.clientWidth ? stage.clientWidth - stagePadding : 0;
      const availableWidth = Math.floor(stageWidth || rect.width || this.host.getBoundingClientRect().width || 520);
      const maxCanvasSize = clamp(toNumber(this.options.maxCanvasSize, 720), 320, 1200);
      const viewportContainer = this.options.fitCanvasToViewport
        ? this.host.closest(".geometry-editor-scroll")
        : null;
      const viewportRect = viewportContainer?.getBoundingClientRect?.();
      const statusHeight = this.status?.getBoundingClientRect?.().height || 22;
      const viewportBottomReserve = this.options.sideToolLayout ? 48 : 24;
      const availableHeight = viewportRect
        ? Math.floor(viewportRect.bottom - rect.top - statusHeight - viewportBottomReserve)
        : Number.POSITIVE_INFINITY;
      const minimumCanvasSize = this.options.fitCanvasToViewport ? 180 : 240;
      const cssSize = Math.max(minimumCanvasSize, Math.min(maxCanvasSize, availableWidth, availableHeight));
      const scale = window.devicePixelRatio || 1;
      this.canvas.width = cssSize * scale;
      this.canvas.height = cssSize * scale;
      this.canvas.style.width = `${cssSize}px`;
      this.canvas.style.height = `${cssSize}px`;
      const ctx = this.canvas.getContext("2d");
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.clearRect(0, 0, cssSize, cssSize);

      const bounds = this.calculateBounds();
      this.meta = {
        width: cssSize,
        height: cssSize,
        plot: { left: 36, top: 42, width: cssSize - 76, height: cssSize - 74 },
        ...bounds
      };

      this.drawBackground(ctx);
      this.drawFunction(ctx);
      this.drawShapes(ctx);
      this.drawSegments(ctx);
      this.drawAngles(ctx);
      this.drawPoints(ctx);
      this.drawPending(ctx);
      this.drawSelection(ctx);
    }

    drawBackground(ctx) {
      const { plot, xMin, xMax, yMin, yMax } = this.meta;
      ctx.save();
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, this.meta.width, this.meta.height);
      if (this.graph.frameBorderStyle !== "none") {
        ctx.strokeStyle = "#dfe8e4";
        ctx.lineWidth = 1;
        applyDash(ctx, this.graph.frameBorderStyle);
        ctx.strokeRect(plot.left, plot.top, plot.width, plot.height);
        ctx.setLineDash([]);
      }

      if (this.graph.displayMode !== "geometry") {
        ctx.strokeStyle = "#edf2ef";
        ctx.fillStyle = "rgba(33, 33, 33, 0.64)";
        ctx.font = "11px Arial, sans-serif";
        ctx.textAlign = "center";
        for (let i = 0; i <= 8; i += 1) {
          const x = xMin + ((xMax - xMin) * i) / 8;
          const p = this.toPx(x, yMin);
          ctx.beginPath();
          ctx.moveTo(p.x, plot.top);
          ctx.lineTo(p.x, plot.top + plot.height);
          ctx.stroke();
          ctx.fillText(formatTick(x), p.x, this.meta.height - 16);
        }
        ctx.textAlign = "right";
        for (let i = 0; i <= 8; i += 1) {
          const y = yMin + ((yMax - yMin) * i) / 8;
          const p = this.toPx(xMin, y);
          ctx.beginPath();
          ctx.moveTo(plot.left, p.y);
          ctx.lineTo(plot.left + plot.width, p.y);
          ctx.stroke();
          ctx.fillText(formatTick(y), plot.left - 8, p.y + 4);
        }
        this.drawAxes(ctx);
      }
      ctx.restore();
    }

    drawAxes(ctx) {
      const { xMin, xMax, yMin, yMax, plot } = this.meta;
      const gridTickCount = 8;
      ctx.save();
      ctx.strokeStyle = "#61736b";
      ctx.fillStyle = "#61736b";
      ctx.lineWidth = 2;
      ctx.font = `700 ${LABEL_FONT_SIZE}px Arial, sans-serif`;
      ctx.textBaseline = "middle";
      if (yMin <= 0 && yMax >= 0) {
        const p = this.toPx(xMin, 0);
        ctx.beginPath();
        ctx.moveTo(plot.left, p.y);
        ctx.lineTo(plot.left + plot.width, p.y);
        ctx.stroke();
        const tipX = plot.left + plot.width;
        this.drawArrowHead(ctx, tipX, p.y, 0);
        ctx.textAlign = "left";
        ctx.textBaseline = "bottom";
        ctx.fillText("x", clamp(tipX + 7, plot.left + 8, this.meta.width - 10), clamp(p.y - 8, 14, this.meta.height - 8));
        ctx.textBaseline = "middle";
        for (let i = 0; i <= gridTickCount; i += 1) {
          const x = xMin + ((xMax - xMin) * i) / gridTickCount;
          const tick = this.toPx(x, 0);
          ctx.beginPath();
          ctx.moveTo(tick.x, p.y - 4);
          ctx.lineTo(tick.x, p.y + 4);
          ctx.stroke();
        }
      }
      if (xMin <= 0 && xMax >= 0) {
        const p = this.toPx(0, yMin);
        ctx.beginPath();
        ctx.moveTo(p.x, plot.top + plot.height);
        ctx.lineTo(p.x, plot.top);
        ctx.stroke();
        this.drawArrowHead(ctx, p.x, plot.top, -Math.PI / 2);
        ctx.textAlign = "left";
        ctx.textBaseline = "bottom";
        ctx.fillText("y", clamp(p.x + 8, plot.left + 8, this.meta.width - 10), Math.max(14, plot.top - 7));
        ctx.textBaseline = "middle";
        for (let i = 0; i <= gridTickCount; i += 1) {
          const y = yMin + ((yMax - yMin) * i) / gridTickCount;
          const tick = this.toPx(0, y);
          ctx.beginPath();
          ctx.moveTo(p.x - 4, tick.y);
          ctx.lineTo(p.x + 4, tick.y);
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    drawArrowHead(ctx, x, y, angle) {
      const size = 8;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-size, -size * 0.55);
      ctx.lineTo(-size, size * 0.55);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    drawFunction(ctx) {
      if (!this.graph.functions.length) return;
      const selectedFunctions = new Set(this.selectionItems()
        .filter((item) => item.kind === "function")
        .map((item) => item.index));
      this.graph.functions.forEach((curve, functionIndex) => {
        if (!curve.expression || curve.visible === false) return;
        let fn;
        try {
          fn = compileExpression(curve.expression);
        } catch (error) {
          this.setStatus(`Function ${functionIndex + 1} error: ${error.message}`);
          return;
        }
        ctx.save();
        ctx.beginPath();
        ctx.rect(this.meta.plot.left, this.meta.plot.top, this.meta.plot.width, this.meta.plot.height);
        ctx.clip();
        ctx.strokeStyle = curve.stroke || DEFAULT_STROKE;
        ctx.lineWidth = (curve.lineWidth || 2.5) + (selectedFunctions.has(functionIndex) ? 1.5 : 0);
        if (selectedFunctions.has(functionIndex)) {
          ctx.shadowColor = "rgba(0, 172, 193, 0.42)";
          ctx.shadowBlur = 7;
        }
        applyDash(ctx, curve.lineDash);
        ctx.beginPath();
        let started = false;
        const hasDomainMin = String(curve.xMin ?? "").trim() !== "" && Number.isFinite(Number(curve.xMin));
        const hasDomainMax = String(curve.xMax ?? "").trim() !== "" && Number.isFinite(Number(curve.xMax));
        const domainMin = hasDomainMin ? Number(curve.xMin) : this.meta.xMin;
        const domainMax = hasDomainMax ? Number(curve.xMax) : this.meta.xMax;
        const xStart = Math.max(this.meta.xMin, Math.min(domainMin, domainMax));
        const xEnd = Math.min(this.meta.xMax, Math.max(domainMin, domainMax));
        if (!Number.isFinite(xStart) || !Number.isFinite(xEnd) || xStart > xEnd) {
          ctx.restore();
          return;
        }
        for (let i = 0; i <= 480; i += 1) {
          const x = xStart + ((xEnd - xStart) * i) / 480;
          let y = NaN;
          try {
            y = Number(fn(x));
          } catch (_) {
            y = NaN;
          }
          if (!Number.isFinite(y) || y < this.meta.yMin - 40 || y > this.meta.yMax + 40) {
            started = false;
            continue;
          }
          const p = this.toPx(x, y);
          if (!started) {
            ctx.moveTo(p.x, p.y);
            started = true;
          } else {
            ctx.lineTo(p.x, p.y);
          }
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.setLineDash([]);
        if (curve.label) {
          const labelX = xEnd;
          const labelY = Number(fn(labelX));
          if (Number.isFinite(labelY) && labelY >= this.meta.yMin && labelY <= this.meta.yMax) {
            const p = this.toPx(labelX, labelY);
            this.drawHaloText(ctx, curve.label, p.x - 8, p.y - 10, curve.stroke, LABEL_FONT_SIZE, "right");
          }
        }
        ctx.restore();
      });
    }

    drawVectorArrowhead(ctx, from, to, color = DEFAULT_STROKE, width = 2) {
      const angle = Math.atan2(to.y - from.y, to.x - from.x);
      const size = clamp(7 + Number(width || 2) * 2.2, 10, 20);
      ctx.save();
      ctx.fillStyle = color || DEFAULT_STROKE;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(to.x, to.y);
      ctx.lineTo(to.x - size * Math.cos(angle - Math.PI / 7), to.y - size * Math.sin(angle - Math.PI / 7));
      ctx.lineTo(to.x - size * Math.cos(angle + Math.PI / 7), to.y - size * Math.sin(angle + Math.PI / 7));
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    circuitBasis(shape) {
      const points = shapePoints(shape);
      const start = points[0] || { x: -1, y: 0 };
      const end = points[1] || { x: 1, y: 0 };
      const a = this.toPx(start.x, start.y);
      const b = this.toPx(end.x, end.y);
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const length = Math.max(1, Math.hypot(dx, dy));
      const ux = dx / length || 1;
      const uy = dy / length || 0;
      const vx = -uy;
      const vy = ux;
      const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const heightProbe = this.toPx(start.x, start.y + Math.max(0.4, toNumber(shape.height, 1.6)));
      const boxHalf = length / 2;
      const boxHeight = clamp(Math.abs(heightProbe.y - a.y), 18, 72);
      const p = (along, off = 0) => ({ x: center.x + ux * along + vx * off, y: center.y + uy * along + vy * off });
      return { a, b, center, boxHalf, boxHeight, p };
    }

    drawPathFromBasis(ctx, basis, points) {
      if (!points.length) return;
      const first = basis.p(points[0][0], points[0][1]);
      ctx.beginPath();
      ctx.moveTo(first.x, first.y);
      points.slice(1).forEach(([along, off]) => {
        const point = basis.p(along, off);
        ctx.lineTo(point.x, point.y);
      });
      ctx.stroke();
    }

    drawCircuitSymbol(ctx, shape) {
      const basis = this.circuitBasis(shape);
      const color = shape.stroke || DEFAULT_STROKE;
      const lineWidth = shape.lineWidth || 2;
      const halfHeight = basis.boxHeight / 2;
      const bodyLeft = -basis.boxHalf;
      const bodyRight = basis.boxHalf;
      const bodyInner = Math.max(4, basis.boxHalf);

      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.setLineDash([]);

      const kind = shape.symbolKind || "resistor";
      if (kind === "resistor" || kind === "variableResistor") {
        const steps = 7;
        const amp = halfHeight * 0.42;
        const points = Array.from({ length: steps + 1 }, (_, index) => {
          const along = -bodyInner + (bodyInner * 2 * index) / steps;
          const off = index === 0 || index === steps ? 0 : (index % 2 ? -amp : amp);
          return [along, off];
        });
        this.drawPathFromBasis(ctx, basis, points);
        if (kind === "variableResistor") {
          const start = basis.p(-bodyInner * 0.55, halfHeight * 0.62);
          const end = basis.p(bodyInner * 0.55, -halfHeight * 0.62);
          ctx.beginPath();
          ctx.moveTo(start.x, start.y);
          ctx.lineTo(end.x, end.y);
          ctx.stroke();
          this.drawVectorArrowhead(ctx, start, end, color, lineWidth);
        }
      } else if (kind === "battery") {
        [-1, -0.35, 0.35, 1].forEach((factor, index) => {
          const tall = index % 2 === 0;
          const along = basis.boxHalf * factor;
          const h = tall ? halfHeight * 0.62 : halfHeight * 0.34;
          this.drawPathFromBasis(ctx, basis, [[along, -h], [along, h]]);
        });
      } else if (kind === "ammeter" || kind === "voltmeter") {
        const radius = Math.max(8, basis.boxHalf);
        ctx.beginPath();
        ctx.arc(basis.center.x, basis.center.y, radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.font = `800 ${Math.max(13, radius * 0.92)}px Arial, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = color;
        ctx.fillText(kind === "ammeter" ? "A" : "V", basis.center.x, basis.center.y + 1);
      } else if (kind === "inductor") {
        const coilCount = 4;
        const radius = Math.min(halfHeight * 0.55, basis.boxHalf / (coilCount + 1));
        for (let index = 0; index < coilCount; index += 1) {
          const along = -radius * (coilCount - 1) + index * radius * 2;
          const c = basis.p(along, 0);
          ctx.beginPath();
          ctx.arc(c.x, c.y, radius, Math.PI, 0, false);
          ctx.stroke();
        }
      } else if (kind === "earth") {
        this.drawPathFromBasis(ctx, basis, [[0, -halfHeight * 0.62], [0, halfHeight * 0.08]]);
        this.drawPathFromBasis(ctx, basis, [[-bodyInner * 0.34, halfHeight * 0.08], [bodyInner * 0.34, halfHeight * 0.08]]);
        this.drawPathFromBasis(ctx, basis, [[-bodyInner * 0.22, halfHeight * 0.28], [bodyInner * 0.22, halfHeight * 0.28]]);
        this.drawPathFromBasis(ctx, basis, [[-bodyInner * 0.11, halfHeight * 0.46], [bodyInner * 0.11, halfHeight * 0.46]]);
      } else if (kind === "capacitor") {
        this.drawPathFromBasis(ctx, basis, [[-bodyInner, -halfHeight * 0.62], [-bodyInner, halfHeight * 0.62]]);
        this.drawPathFromBasis(ctx, basis, [[bodyInner, -halfHeight * 0.62], [bodyInner, halfHeight * 0.62]]);
      }

      ctx.restore();
      if (shape.showTerminals) connectionPointsForShape(shape).forEach((point) => this.drawPoint(ctx, point, color));
    }

    drawShapes(ctx) {
      this.graph.shapes.forEach((shape) => {
        if (shape.visible === false) return;
        if (shape.type === "circuitSymbol") {
          this.drawCircuitSymbol(ctx, shape);
          return;
        }
        if (shape.type === "circle") {
          const c = this.toPx(shape.center.x, shape.center.y);
          const edge = this.toPx(shape.center.x + shape.radius, shape.center.y);
          ctx.save();
          ctx.strokeStyle = shape.stroke;
          ctx.fillStyle = rgba(shape.fill, toOpacity(shape.fillOpacity, 0.24));
          ctx.lineWidth = shape.lineWidth;
          applyDash(ctx, shape.lineDash);
          ctx.beginPath();
          ctx.arc(c.x, c.y, Math.abs(edge.x - c.x), 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.restore();
          if (shape.showCenter) this.drawPoint(ctx, { ...shape.center, label: "", size: 4 }, shape.stroke);
          if (shape.showRadiusPoint) this.drawPoint(ctx, { ...projectedCircleRadiusPoint(shape), label: "", size: 4 }, shape.stroke);
          return;
        }
        if (shape.type === "latexText") {
          const p = this.toPx(shape.x, shape.y);
          this.drawHaloText(ctx, toCanvasMathText(shape.text || shape.label), p.x, p.y, shape.fill || DEFAULT_STROKE, shape.fontSize || 18, "center");
          return;
        }
        const points = shapePoints(shape);
        if (points.length < 2) return;
        ctx.save();
        ctx.strokeStyle = shape.stroke;
        ctx.fillStyle = rgba(shape.fill, toOpacity(shape.fillOpacity, 0.36));
        ctx.lineWidth = shape.lineWidth;
        applyDash(ctx, shape.lineDash);
        const first = this.toPx(points[0].x, points[0].y);
        ctx.beginPath();
        ctx.moveTo(first.x, first.y);
        points.slice(1).forEach((point) => {
          const p = this.toPx(point.x, point.y);
          ctx.lineTo(p.x, p.y);
        });
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
        points.forEach((point) => this.drawPoint(ctx, point, shape.stroke));
        this.drawShapeEdgeLabels(ctx, shape, points);
        if (shape.type === "regularPolygon") this.drawRegularPolygonExtras(ctx, shape, points);
      });
    }

    drawShapeEdgeLabels(ctx, shape, points) {
      if (this.options.hideShapeLabels || this.options.hidePointLabels || !Array.isArray(points) || points.length < 2 || shape.type === "latexText") return;
      const closed = points.length >= 3;
      const edgeCount = closed ? points.length : points.length - 1;
      for (let edgeIndex = 0; edgeIndex < edgeCount; edgeIndex += 1) {
        const start = points[edgeIndex];
        const end = points[(edgeIndex + 1) % points.length];
        const key = this.shapeEdgeKey(shape, edgeIndex, start, end);
        const mode = this.shapeSegmentLabelMode(shape, key);
        const label = this.segmentLabel(start, end, { from: start.label, to: end.label, labelMode: mode, variableLabel: shape.segmentVariableLabels?.[key] });
        if (!label) continue;
        const a = this.toPx(start.x, start.y);
        const b = this.toPx(end.x, end.y);
        const offset = this.shapeSegmentOffset(shape, key);
        this.drawSegmentLabel(ctx, label, (a.x + b.x) / 2 + offset.dx, (a.y + b.y) / 2 + offset.dy, shape.stroke || DEFAULT_STROKE, mode);
      }
    }

    drawRegularPolygonExtras(ctx, shape, points) {
      const center = this.toPx(shape.centerX, shape.centerY);
      ctx.save();
      ctx.strokeStyle = shape.stroke || DEFAULT_STROKE;
      ctx.fillStyle = shape.stroke || DEFAULT_STROKE;
      ctx.lineWidth = 1.4;
      if (shape.showCenter) {
        ctx.beginPath();
        ctx.arc(center.x, center.y, 4, 0, Math.PI * 2);
        ctx.fill();
        this.drawHaloText(ctx, "O", center.x + 8, center.y - 8, shape.stroke || DEFAULT_STROKE, LABEL_FONT_SIZE);
      }
      if (shape.showApothem && points.length >= 2) {
        const a = this.toPx(points[0].x, points[0].y);
        const b = this.toPx(points[1].x, points[1].y);
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.moveTo(center.x, center.y);
        ctx.lineTo((a.x + b.x) / 2, (a.y + b.y) / 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    drawSegments(ctx) {
      this.graph.segments.forEach((segment) => {
        if (segment.visible === false) return;
        const a = this.pointByLabel(segment.from);
        const b = this.pointByLabel(segment.to);
        if (!a || !b) return;
        const ap = this.toPx(a.x, a.y);
        const bp = this.toPx(b.x, b.y);
        ctx.save();
        ctx.strokeStyle = segment.color;
        ctx.fillStyle = segment.color;
        ctx.lineWidth = segment.lineWidth;
        applyDash(ctx, segment.lineDash);
        ctx.beginPath();
        ctx.moveTo(ap.x, ap.y);
        ctx.lineTo(bp.x, bp.y);
        ctx.stroke();
        if (segment.lineDash === "arrow") this.drawVectorArrowhead(ctx, ap, bp, segment.color, segment.lineWidth);
        ctx.setLineDash([]);
        const anchor = this.segmentLabelAnchor(segment);
        if (anchor?.label) this.drawSegmentLabel(ctx, anchor.label, anchor.x, anchor.y, segment.color, segment.labelMode);
        ctx.restore();
      });
    }

    segmentLabel(a, b, segment) {
      if (segment.labelMode === "hidden") return "";
      if (segment.labelMode === "length") return String(segmentLength(a, b, segment.precision));
      if (segment.labelMode === "variable") return cleanVariableLabel(segment.variableLabel) || "x";
      return `${cleanLabel(segment.from)}${cleanLabel(segment.to)}`;
    }

    drawSegmentLabel(ctx, label, x, y, color, mode) {
      this.drawHaloText(ctx, label, x, y, color, LABEL_FONT_SIZE, "center");
      if (mode !== "name") return;
      ctx.save();
      ctx.strokeStyle = color || DEFAULT_STROKE;
      ctx.lineWidth = 1.2;
      ctx.setLineDash([]);
      ctx.font = `700 ${LABEL_FONT_SIZE}px Inter, Arial, sans-serif`;
      const width = Math.max(16, ctx.measureText(String(label)).width);
      ctx.beginPath();
      ctx.moveTo(x - width / 2, y - 9);
      ctx.lineTo(x + width / 2, y - 9);
      ctx.stroke();
      ctx.restore();
    }

    segmentLabelAnchor(segment) {
      const a = this.pointByLabel(segment.from);
      const b = this.pointByLabel(segment.to);
      if (!a || !b) return null;
      const label = this.segmentLabel(a, b, segment);
      if (!label) return null;
      const ap = this.toPx(a.x, a.y);
      const bp = this.toPx(b.x, b.y);
      const offset = this.labelOffset(segment, 0, -10);
      return {
        label,
        x: (ap.x + bp.x) / 2 + offset.dx,
        y: (ap.y + bp.y) / 2 + offset.dy
      };
    }

    shapeSegmentLabelAnchors(shape) {
      const points = shapePoints(shape);
      if (!Array.isArray(points) || points.length < 2 || shape.type === "latexText") return [];
      const closed = points.length >= 3;
      const edgeCount = closed ? points.length : points.length - 1;
      const anchors = [];
      for (let edgeIndex = 0; edgeIndex < edgeCount; edgeIndex += 1) {
        const start = points[edgeIndex];
        const end = points[(edgeIndex + 1) % points.length];
        const key = this.shapeEdgeKey(shape, edgeIndex, start, end);
        const mode = this.shapeSegmentLabelMode(shape, key);
        const label = this.segmentLabel(start, end, { from: start.label, to: end.label, labelMode: mode });
        if (!label) continue;
        const a = this.toPx(start.x, start.y);
        const b = this.toPx(end.x, end.y);
        const offset = this.shapeSegmentOffset(shape, key);
        anchors.push({
          edgeIndex,
          key,
          label,
          x: (a.x + b.x) / 2 + offset.dx,
          y: (a.y + b.y) / 2 + offset.dy
        });
      }
      return anchors;
    }

    angleArcData(a, b, c, radius = 22, measure = "minor") {
      const ap = this.toPx(a.x, a.y);
      const bp = this.toPx(b.x, b.y);
      const cp = this.toPx(c.x, c.y);
      const start = Math.atan2(ap.y - bp.y, ap.x - bp.x);
      const rawEnd = Math.atan2(cp.y - bp.y, cp.x - bp.x);
      let delta = rawEnd - start;
      while (delta <= -Math.PI) delta += Math.PI * 2;
      while (delta > Math.PI) delta -= Math.PI * 2;
      if (measure === "reflex" && delta !== 0) delta += delta > 0 ? -Math.PI * 2 : Math.PI * 2;
      const end = start + delta;
      return {
        vertex: bp,
        start,
        end,
        middle: start + delta / 2,
        counterclockwise: delta < 0,
        radius
      };
    }

    angleLabel(angle, a, b, c) {
      if (angle.labelMode === "value") return `${formatMeasurement(angleDegrees(a, b, c, angle.angleMeasure), angle.precision)}\u00b0`;
      if (angle.labelMode === "variable") return cleanVariableLabel(angle.variableLabel) || "x";
      if (angle.labelMode === "blank" || angle.labelMode === "none") return "";
      return `${angle.from}${angle.vertex}${angle.to}`;
    }

    angleLabelAnchor(angle) {
      if (!angle || angle.visible === false || angle.labelMode === "none") return null;
      const a = this.pointByLabel(angle.from);
      const b = this.pointByLabel(angle.vertex);
      const c = this.pointByLabel(angle.to);
      if (!a || !b || !c) return null;
      const arc = this.angleArcData(a, b, c, angle.radius || 22, angle.angleMeasure);
      const label = this.angleLabel(angle, a, b, c);
      const offset = this.labelOffset(angle, 0, 0);
      return {
        label,
        x: arc.vertex.x + Math.cos(arc.middle) * ((angle.radius || 22) + 18) + offset.dx,
        y: arc.vertex.y + Math.sin(arc.middle) * ((angle.radius || 22) + 18) + offset.dy
      };
    }

    drawAngles(ctx) {
      this.graph.angles.forEach((angle) => {
        if (angle.visible === false || angle.labelMode === "none") return;
        const a = this.pointByLabel(angle.from);
        const b = this.pointByLabel(angle.vertex);
        const c = this.pointByLabel(angle.to);
        if (!a || !b || !c) return;
        const arc = this.angleArcData(a, b, c, angle.radius || 22, angle.angleMeasure);
        const anchor = this.angleLabelAnchor(angle);
        ctx.save();
        ctx.strokeStyle = angle.color;
        ctx.fillStyle = angle.color;
        ctx.lineWidth = angle.lineWidth || 2;
        if (Math.abs(angleDegrees(a, b, c, "minor") - 90) <= 0.5 && angle.angleMeasure !== "reflex") {
          this.drawRightAngleMarker(ctx, a, b, c, angle.radius || 22);
        } else {
          ctx.beginPath();
          ctx.arc(arc.vertex.x, arc.vertex.y, angle.radius, arc.start, arc.end, arc.counterclockwise);
          ctx.stroke();
        }
        if (anchor?.label) this.drawHaloText(ctx, anchor.label, anchor.x, anchor.y, angle.color, LABEL_FONT_SIZE, "center");
        ctx.restore();
      });
    }

    drawRightAngleMarker(ctx, a, b, c, radius = 22) {
      const ap = this.toPx(a.x, a.y);
      const bp = this.toPx(b.x, b.y);
      const cp = this.toPx(c.x, c.y);
      const unit = (p) => {
        const dx = p.x - bp.x;
        const dy = p.y - bp.y;
        const length = Math.hypot(dx, dy) || 1;
        return { x: dx / length, y: dy / length };
      };
      const u = unit(ap);
      const v = unit(cp);
      const size = clamp(radius * 0.62, 12, 24);
      const p1 = { x: bp.x + u.x * size, y: bp.y + u.y * size };
      const p2 = { x: p1.x + v.x * size, y: p1.y + v.y * size };
      const p3 = { x: bp.x + v.x * size, y: bp.y + v.y * size };
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.lineTo(p3.x, p3.y);
      ctx.stroke();
      ctx.save();
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc((bp.x + p2.x) / 2, (bp.y + p2.y) / 2, 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    drawPoints(ctx) {
      const arrowTips = new Set(this.graph.segments
        .filter((segment) => segment.visible !== false && segment.lineDash === "arrow")
        .map((segment) => cleanLabel(segment.to)));
      this.graph.points.forEach((point, index) => {
        if (arrowTips.has(cleanLabel(point.label))) return;
        if (point.visible !== false) this.drawPoint(ctx, point, point.color);
      });
    }

    drawPoint(ctx, point, color) {
      const p = this.toPx(point.x, point.y);
      ctx.save();
      ctx.fillStyle = color || point.color || DEFAULT_STROKE;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, point.size || 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      const index = this.graph.points.indexOf(point);
      const label = index >= 0 ? pointDisplayLabel(point, index) : String(point.label || "");
      const offset = this.labelOffset(point, 8, -7);
      if (label && !point.labelHidden) this.drawHaloText(ctx, label, p.x + offset.dx, p.y + offset.dy, color || DEFAULT_STROKE, LABEL_FONT_SIZE);
      ctx.restore();
    }

    drawPending(ctx) {
      if (!this.previewPoint) return;
      const p = this.toPx(this.previewPoint.x, this.previewPoint.y);
      ctx.save();
      ctx.fillStyle = "rgba(20, 92, 99, 0.18)";
      ctx.strokeStyle = "rgba(20, 92, 99, 0.72)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      if (this.graph.snapToGrid) {
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(p.x - 10, p.y);
        ctx.lineTo(p.x + 10, p.y);
        ctx.moveTo(p.x, p.y - 10);
        ctx.lineTo(p.x, p.y + 10);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.setLineDash([5, 4]);
      }
      if (this.pending?.tool === "irregularPolygon" && Array.isArray(this.pending.points)) {
        const points = this.pending.points;
        points.forEach((point) => {
          const sp = this.toPx(point.x, point.y);
          ctx.beginPath();
          ctx.arc(sp.x, sp.y, 5, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        });
        if (points.length) {
          const first = this.toPx(points[0].x, points[0].y);
          ctx.beginPath();
          ctx.moveTo(first.x, first.y);
          points.slice(1).forEach((point) => {
            const sp = this.toPx(point.x, point.y);
            ctx.lineTo(sp.x, sp.y);
          });
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
        }
      }
      if (this.pending?.tool === "angle" && Array.isArray(this.pending.labels)) {
        const selected = this.pending.labels.map((label) => this.pointByLabel(label)).filter(Boolean);
        selected.forEach((point) => {
          const sp = this.toPx(point.x, point.y);
          ctx.beginPath();
          ctx.arc(sp.x, sp.y, 7, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        });
        if (selected.length === 1) {
          const from = this.toPx(selected[0].x, selected[0].y);
          ctx.beginPath();
          ctx.moveTo(from.x, from.y);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
        }
        if (selected.length >= 2) {
          const nearest = this.findPointHit(this.previewPoint, 12)?.point;
          const candidate = nearest?.label && !this.pending.labels.includes(nearest.label) ? nearest : this.previewPoint;
          const vertex = selected[1];
          const from = selected[0];
          const fp = this.toPx(from.x, from.y);
          const vp = this.toPx(vertex.x, vertex.y);
          const cp = this.toPx(candidate.x, candidate.y);
          ctx.beginPath();
          ctx.moveTo(vp.x, vp.y);
          ctx.lineTo(fp.x, fp.y);
          ctx.moveTo(vp.x, vp.y);
          ctx.lineTo(cp.x, cp.y);
          ctx.stroke();
          const previewAngle = {
            labelMode: "value",
            angleMeasure: this.settingsFor("angle").angleMeasure || "minor",
            radius: this.settingsFor("angle").radius || 22,
            labelDx: 0,
            labelDy: 0
          };
          const arc = this.angleArcData(from, vertex, candidate, previewAngle.radius, previewAngle.angleMeasure);
          ctx.beginPath();
          ctx.arc(arc.vertex.x, arc.vertex.y, previewAngle.radius, arc.start, arc.end, arc.counterclockwise);
          ctx.stroke();
          const label = `${formatMeasurement(angleDegrees(from, vertex, candidate, previewAngle.angleMeasure), this.settingsFor("angle").precision)}\u00b0`;
          this.drawHaloText(ctx, label, arc.vertex.x + Math.cos(arc.middle) * (previewAngle.radius + 18), arc.vertex.y + Math.sin(arc.middle) * (previewAngle.radius + 18), DEFAULT_STROKE, LABEL_FONT_SIZE, "center");
        }
      }
      if (this.pending?.from) {
        const start = this.pointByLabel(this.pending.from);
        if (start) {
          const sp = this.toPx(start.x, start.y);
          ctx.beginPath();
          ctx.moveTo(sp.x, sp.y);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
        }
      }
      if (this.pending?.tool === "circle" && this.pending.center) {
        const c = this.toPx(this.pending.center.x, this.pending.center.y);
        ctx.beginPath();
        ctx.arc(c.x, c.y, Math.hypot(p.x - c.x, p.y - c.y), 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    drawSelection(ctx) {
      if (!this.selected || !this.meta) return;
      ctx.save();
      ctx.strokeStyle = "#00acc1";
      ctx.fillStyle = "rgba(0, 172, 193, 0.12)";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      const selections = this.selectionItems();
      selections.forEach((hit) => this.drawSelectionHit(ctx, hit));
      const groupHandles = this.groupTransformHandles();
      const shapeIndex = this.selectedShapeIndex();
      const segmentIndex = this.selectedSegmentIndex();
      if (groupHandles) {
        this.drawGroupTransformFrame(ctx, groupHandles);
      } else if (segmentIndex >= 0 && this.graph.segments[segmentIndex]) {
        this.drawSegmentTransformFrame(ctx, this.graph.segments[segmentIndex]);
      } else if (shapeIndex >= 0 && this.graph.shapes[shapeIndex]) {
        this.drawShapeTransformFrame(ctx, this.graph.shapes[shapeIndex]);
      }
      ctx.restore();
    }

    drawSelectionHit(ctx, hit) {
      if (!hit) return;
      if (hit.kind === "point" && this.graph.points[hit.index]) {
        const p = this.toPx(this.graph.points[hit.index].x, this.graph.points[hit.index].y);
        ctx.beginPath();
        ctx.arc(p.x, p.y, 13, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (hit.kind === "segment" && this.graph.segments[hit.index]) {
        const a = this.pointByLabel(this.graph.segments[hit.index].from);
        const b = this.pointByLabel(this.graph.segments[hit.index].to);
        if (a && b) {
          const ap = this.toPx(a.x, a.y);
          const bp = this.toPx(b.x, b.y);
          ctx.beginPath();
          ctx.moveTo(ap.x, ap.y);
          ctx.lineTo(bp.x, bp.y);
          ctx.stroke();
        }
      }
      if (hit.kind === "shape" && this.graph.shapes[hit.index]) {
        const bounds = this.shapeBounds(this.graph.shapes[hit.index]);
        if (bounds) {
          const a = this.toPx(bounds.xMin, bounds.yMin);
          const b = this.toPx(bounds.xMax, bounds.yMax);
          ctx.strokeRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
        }
      }
      if (hit.kind.endsWith?.("Label")) {
        const anchor = this.labelAnchorForHit(hit);
        if (anchor) {
          ctx.beginPath();
          ctx.roundRect?.(anchor.x - Math.max(18, String(anchor.label || "").length * 4.8), anchor.y - 12, Math.max(36, String(anchor.label || "").length * 9.6), 24, 5);
          if (!ctx.roundRect) ctx.rect(anchor.x - Math.max(18, String(anchor.label || "").length * 4.8), anchor.y - 12, Math.max(36, String(anchor.label || "").length * 9.6), 24);
          ctx.stroke();
        }
      }
    }

    labelAnchorForHit(hit) {
      if (hit.kind === "pointLabel" && this.graph.points[hit.index]) {
        const point = this.graph.points[hit.index];
        const p = this.toPx(point.x, point.y);
        const offset = this.labelOffset(point, 8, -7);
        return { label: pointDisplayLabel(point, hit.index), x: p.x + offset.dx, y: p.y + offset.dy };
      }
      if (hit.kind === "segmentLabel") return this.segmentLabelAnchor(this.graph.segments[hit.index]);
      if (hit.kind === "angleLabel") return this.angleLabelAnchor(this.graph.angles[hit.index]);
      if (hit.kind === "shapePointLabel") {
        const point = shapePoints(this.graph.shapes[hit.shapeIndex])?.[hit.pointIndex];
        if (!point) return null;
        const p = this.toPx(point.x, point.y);
        const offset = this.labelOffset(point, 8, -7);
        return { label: point.label, x: p.x + offset.dx, y: p.y + offset.dy };
      }
      if (hit.kind === "shapeSegmentLabel") {
        return this.shapeSegmentLabelAnchors(this.graph.shapes[hit.shapeIndex]).find((anchor) => anchor.key === hit.key) || null;
      }
      return null;
    }

    drawSegmentTransformFrame(ctx, segment) {
      const handles = this.segmentTransformHandles(segment);
      if (!handles) return;
      ctx.save();
      ctx.strokeStyle = "rgba(0, 172, 193, 0.9)";
      ctx.fillStyle = "rgba(0, 172, 193, 0.16)";
      ctx.lineWidth = 1.8;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(handles.left, handles.top, handles.right - handles.left, handles.bottom - handles.top);
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(handles.center.x, handles.center.y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(handles.right, handles.top);
      ctx.lineTo(handles.rotate.x, handles.rotate.y);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(handles.rotate.x, handles.rotate.y, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      if (!segment.showEndpointPoints) {
        const dx = handles.end.x - handles.start.x;
        const dy = handles.end.y - handles.start.y;
        const length = Math.hypot(dx, dy) || 1;
        const px = (-dy / length) * 7;
        const py = (dx / length) * 7;
        ctx.beginPath();
        ctx.moveTo(handles.start.x - px, handles.start.y - py);
        ctx.lineTo(handles.start.x + px, handles.start.y + py);
        ctx.moveTo(handles.end.x - px, handles.end.y - py);
        ctx.lineTo(handles.end.x + px, handles.end.y + py);
        ctx.stroke();
      }
      this.drawRotateHandleIcon(ctx, handles.rotate.x, handles.rotate.y);
      ctx.restore();
    }

    drawGroupTransformFrame(ctx, handles) {
      ctx.save();
      ctx.strokeStyle = "rgba(0, 172, 193, 0.95)";
      ctx.fillStyle = "rgba(0, 172, 193, 0.16)";
      ctx.lineWidth = 2.2;
      ctx.setLineDash([7, 5]);
      ctx.strokeRect(handles.left, handles.top, handles.right - handles.left, handles.bottom - handles.top);
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(handles.center.x, handles.center.y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(handles.right, handles.top);
      ctx.lineTo(handles.rotate.x, handles.rotate.y);
      ctx.moveTo(handles.right, handles.bottom);
      ctx.lineTo(handles.resize.x, handles.resize.y);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(handles.rotate.x, handles.rotate.y, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.rect(handles.resize.x - 10, handles.resize.y - 10, 20, 20);
      ctx.fill();
      ctx.stroke();
      this.drawRotateHandleIcon(ctx, handles.rotate.x, handles.rotate.y);
      this.drawResizeHandleIcon(ctx, handles.resize.x, handles.resize.y);
      ctx.restore();
    }

    drawShapeTransformFrame(ctx, shape) {
      const handles = this.shapeTransformHandles(shape);
      if (!handles) return;
      ctx.save();
      ctx.strokeStyle = "rgba(0, 172, 193, 0.9)";
      ctx.fillStyle = "rgba(0, 172, 193, 0.16)";
      ctx.lineWidth = 1.8;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(handles.left, handles.top, handles.right - handles.left, handles.bottom - handles.top);
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(handles.center.x, handles.center.y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(handles.right, handles.top);
      ctx.lineTo(handles.rotate.x, handles.rotate.y);
      ctx.moveTo(handles.right, handles.bottom);
      ctx.lineTo(handles.resize.x, handles.resize.y);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(handles.rotate.x, handles.rotate.y, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.rect(handles.resize.x - 9, handles.resize.y - 9, 18, 18);
      ctx.fill();
      ctx.stroke();

      this.drawRotateHandleIcon(ctx, handles.rotate.x, handles.rotate.y);
      this.drawResizeHandleIcon(ctx, handles.resize.x, handles.resize.y);
      ctx.restore();
    }

    drawRotateHandleIcon(ctx, x, y) {
      ctx.save();
      ctx.strokeStyle = "#145c63";
      ctx.fillStyle = "#145c63";
      ctx.lineWidth = 1.7;
      ctx.beginPath();
      ctx.arc(x, y, 5.2, Math.PI * 0.15, Math.PI * 1.55);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x - 0.5, y - 6.9);
      ctx.lineTo(x + 4.4, y - 7.1);
      ctx.lineTo(x + 2.2, y - 2.9);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    drawResizeHandleIcon(ctx, x, y) {
      ctx.save();
      ctx.strokeStyle = "#145c63";
      ctx.fillStyle = "#145c63";
      ctx.lineWidth = 1.7;
      ctx.beginPath();
      ctx.moveTo(x - 5.8, y + 5.8);
      ctx.lineTo(x + 5.8, y - 5.8);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + 5.8, y - 5.8);
      ctx.lineTo(x + 0.8, y - 5.8);
      ctx.lineTo(x + 5.8, y - 0.8);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x - 5.8, y + 5.8);
      ctx.lineTo(x - 0.8, y + 5.8);
      ctx.lineTo(x - 5.8, y + 0.8);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    shapeBounds(shape) {
      if (shape?.type === "circle") {
        return {
          xMin: shape.center.x - shape.radius,
          xMax: shape.center.x + shape.radius,
          yMin: shape.center.y - shape.radius,
          yMax: shape.center.y + shape.radius
        };
      }
      if (shape?.type === "latexText") {
        return {
          xMin: shape.x - 0.5,
          xMax: shape.x + 0.5,
          yMin: shape.y - 0.5,
          yMax: shape.y + 0.5
        };
      }
      if (shape?.type === "circuitSymbol") {
        const points = shapePoints(shape);
        if (!points.length) return null;
        const xs = points.map((point) => point.x);
        const ys = points.map((point) => point.y);
        const margin = Math.max(
          0.25,
          toNumber(shape.height, 1.6) / 2,
          ["ammeter", "voltmeter"].includes(shape.symbolKind) ? toNumber(shape.width, 3.8) / 2 : 0
        );
        return { xMin: Math.min(...xs) - margin, xMax: Math.max(...xs) + margin, yMin: Math.min(...ys) - margin, yMax: Math.max(...ys) + margin };
      }
      const points = shapePoints(shape);
      if (!points.length) return null;
      const xs = points.map((point) => point.x);
      const ys = points.map((point) => point.y);
      return { xMin: Math.min(...xs), xMax: Math.max(...xs), yMin: Math.min(...ys), yMax: Math.max(...ys) };
    }

    drawHaloText(ctx, text, x, y, color = DEFAULT_STROKE, size = LABEL_FONT_SIZE, align = "left") {
      if (!text) return;
      ctx.save();
      ctx.font = `700 ${size}px Arial, sans-serif`;
      ctx.textAlign = align;
      ctx.textBaseline = "middle";
      ctx.lineWidth = 4;
      ctx.strokeStyle = "rgba(255,255,255,0.92)";
      ctx.strokeText(String(text), x, y);
      ctx.fillStyle = color;
      ctx.fillText(String(text), x, y);
      ctx.restore();
    }

    renderObjects() {
      if (!this.objectList) return;
      const rows = [];
      this.graph.points.forEach((point, index) => rows.push({ id: `point:${index}`, label: `Point ${point.label}` }));
      this.graph.segments.forEach((segment, index) => rows.push({ id: `segment:${index}`, label: segment.labelMode === "length" ? `Distance ${segment.from}${segment.to}` : `Segment ${segment.from}${segment.to}` }));
      this.graph.angles.forEach((angle, index) => rows.push({ id: `angle:${index}`, label: `Angle ${angle.from}${angle.vertex}${angle.to}` }));
      this.graph.functions.forEach((curve, index) => rows.push({
        id: `function:${index}`,
        label: `${curve.label ? `${curve.label}: ` : ""}y = ${curve.expression}`
      }));
      this.graph.shapes.forEach((shape, index) => rows.push({ id: `shape:${index}`, label: shape.label || defaultShapeLabel(shape.type) }));
      if (!rows.length) {
        this.objectList.innerHTML = '<p class="kde-empty">No objects yet.</p>';
        return;
      }
      this.objectList.innerHTML = rows.map((row) => {
        const active = this.objectMatches(row.id, this.selected);
        const selectButton = `<button type="button" class="kde-object${active ? " is-active" : ""}" data-kelp-object-id="${row.id}">${escapeHTML(row.label)}</button>`;
        if (!row.id.startsWith("function:")) return selectButton;
        const functionIndex = Number(row.id.split(":")[1]);
        return `<div class="kde-object-row">${selectButton}<button type="button" class="kde-object-edit" data-kelp-function-edit="${functionIndex}" aria-label="Edit function ${functionIndex + 1}" title="Edit this function">Edit</button></div>`;
      }).join("");
    }

    objectMatches(id, selected) {
      const selections = this.selectionItems();
      if (selections.length > 1) return selections.some((item) => this.objectMatchesSingle(id, item));
      return this.objectMatchesSingle(id, selected);
    }

    objectMatchesSingle(id, selected) {
      if (!selected) return false;
      if (selected.kind === "function") return id === `function:${selected.index}`;
      if (selected.kind === "shapePoint" || selected.kind === "shapePointLabel") return id === `shape:${selected.shapeIndex}`;
      if (selected.kind === "shapeSegmentLabel") return id === `shape:${selected.shapeIndex}`;
      if (selected.kind === "shapeResize" || selected.kind === "shapeRotate") return id === `shape:${selected.index}`;
      if (selected.kind === "angleLabel") return id === `angle:${selected.index}`;
      if (selected.kind === "segmentLabel") return id === `segment:${selected.index}`;
      if (selected.kind === "segmentRotate") return id === `segment:${selected.index}`;
      if (selected.kind === "segmentEdgeRotate") return id === `segment:${selected.index}`;
      if (selected.kind === "pointLabel") return id === `point:${selected.index}`;
      return id === `${selected.kind}:${selected.index}`;
    }
  }

  function formatTick(value) {
    const rounded = round(value);
    return Number.isInteger(rounded) ? String(rounded) : String(rounded);
  }

  function rgba(hex, alpha) {
    const color = isHexColor(hex) ? hex : DEFAULT_FILL;
    const value = Number.parseInt(color.slice(1), 16);
    const r = (value >> 16) & 255;
    const g = (value >> 8) & 255;
    const b = value & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function escapeHTML(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function renderToCanvas(canvas, graph, options = {}) {
    if (!canvas) return false;
    const rect = canvas.getBoundingClientRect();
    const parentRect = canvas.parentElement?.getBoundingClientRect?.();
    const cssSize = Math.max(220, Math.min(720, Math.floor(rect.width || parentRect?.width || 360)));
    const host = document.createElement("div");
    host.style.position = "fixed";
    host.style.left = "-10000px";
    host.style.top = "0";
    host.style.width = `${cssSize}px`;
    host.style.height = `${cssSize}px`;
    host.style.overflow = "hidden";
    host.style.pointerEvents = "none";
    host.style.opacity = "0";
    document.body.appendChild(host);

    let editor = null;
    try {
      editor = new KelpDiagramEditor(host, {
        ...options,
        graph: normalizeGraph(graph || {})
      });
      editor.draw();
      const source = host.querySelector("[data-kelp-canvas]");
      if (!source) return false;
      const scale = window.devicePixelRatio || 1;
      canvas.width = cssSize * scale;
      canvas.height = cssSize * scale;
      canvas.style.width = `${cssSize}px`;
      canvas.style.height = `${cssSize}px`;
      const ctx = canvas.getContext("2d");
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
      return true;
    } finally {
      editor?.destroy();
      host.remove();
    }
  }

  window.KelpDiagramEditor = KelpDiagramEditor;
  window.KelpDiagramEditor.normalizeGraph = normalizeGraph;
  window.KelpDiagramEditor.renderToCanvas = renderToCanvas;
})();
