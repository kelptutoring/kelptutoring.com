(function () {
  "use strict";

  const DEFAULT_TOLERANCE = 1e-6;
  const DEFAULT_SAMPLE_MIN = -50;
  const DEFAULT_SAMPLE_MAX = 50;
  const MAX_EVALUATIONS = 1000;
  const ALLOWED_OPERATORS = new Set(["+", "-", "*", "/", "^", "%", "unaryMinus", "unaryPlus"]);
  const ALLOWED_FUNCTIONS = new Set(["sqrt", "abs", "log", "ln", "sin", "cos", "tan", "asin", "acos", "atan", "exp"]);
  const CONSTANTS = new Set(["pi", "e"]);

  function normalizeSettings(raw = {}) {
    return {
      exactMatch: normalizeBoolean(raw.numericExactMatch),
      requireUnit: normalizeBoolean(raw.numericRequireUnit),
      unit: String(raw.numericUnit || "").trim(),
      tolerance: normalizeTolerance(raw.numericTolerance),
      angleMode: raw.numericAngleMode === "degrees" ? "degrees" : "radians"
    };
  }

  function normalizeBoolean(value) {
    return value === true || value === 1 || value === "true" || value === "1";
  }

  function normalizeTolerance(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0 ? Math.max(1e-12, Math.min(1, numeric)) : DEFAULT_TOLERANCE;
  }

  function toLatex(rawExpression) {
    const math = window.math;
    const expression = normalizeExpression(rawExpression);
    if (!expression || !math?.parse) return "";

    try {
      const components = splitTuple(expression);
      const rendered = components.map((component) => math.parse(component.trim()).toTex({
        parenthesis: "keep",
        implicit: "hide"
      }));
      if (rendered.length > 1) return `\\left(${rendered.join(",\\;")}\\right)`;
      return rendered[0] || "";
    } catch (_) {
      return "";
    }
  }

  function grade(expectedRaw, responseRaw, rawSettings = {}) {
    const math = window.math;
    const settings = normalizeSettings(rawSettings);
    const expectedText = String(expectedRaw || "").trim();
    const responseText = String(responseRaw || "").trim();

    if (!expectedText) return notGradable("No numeric answer key was provided.");
    if (!responseText) return gradable(false, "No answer submitted.");
    if (!math?.parse || !math?.compile) return notGradable("The math engine is not available.");

    let expected;
    try {
      expected = parseAnswer(expectedText, settings, true);
    } catch (error) {
      return notGradable(error.message || "The answer key could not be parsed.");
    }

    let response;
    try {
      response = parseAnswer(responseText, settings, false, expected.unit);
    } catch (error) {
      return gradable(false, error.message || "The answer could not be parsed.");
    }

    if (settings.requireUnit) {
      const expectedUnit = settings.unit || expected.unit;
      if (!expectedUnit) return notGradable("Unit checking is on, but no expected unit was provided.");
      if (expected.variables.size || response.variables.size) {
        return notGradable("Unit checking is available only for answers without variables.");
      }
      if (response.unit !== expectedUnit) return gradable(false, `Expected unit: ${expectedUnit}.`);
    }

    if (expected.parts.length !== response.parts.length) {
      return gradable(false, "The answer has a different number of tuple components.");
    }

    if (settings.exactMatch) {
      const exact = expected.parts.every((part, index) => exactKey(part.node) === exactKey(response.parts[index].node));
      return gradable(exact, exact ? "Exact match." : "The expression form does not match the answer key.");
    }

    const variables = [...new Set([...expected.variables, ...response.variables])].sort();
    const samples = buildSamples(variables);
    let comparable = 0;

    for (const sample of samples) {
      const expectedValues = evaluateParts(expected.parts, sample, settings);
      const responseValues = evaluateParts(response.parts, sample, settings);
      const expectedDefined = expectedValues.every((value) => value.defined);
      const responseDefined = responseValues.every((value) => value.defined);

      if (!expectedDefined && !responseDefined) continue;
      if (expectedDefined !== responseDefined) {
        return gradable(false, "The expressions are not defined over the same sampled values.");
      }

      comparable += 1;
      for (let index = 0; index < expectedValues.length; index += 1) {
        if (!nearlyEqual(expectedValues[index].value, responseValues[index].value, settings.tolerance)) {
          return gradable(false, "The expressions are not equivalent over the sampled values.");
        }
      }
    }

    if (comparable === 0) return notGradable("The expressions could not be compared over the default sample range.");
    return gradable(true, variables.length ? `Equivalent over ${comparable} sampled value${comparable === 1 ? "" : "s"}.` : "Equivalent value.");
  }

  function parseAnswer(raw, settings, isExpected, expectedUnit = "") {
    const unitSplit = settings.requireUnit ? splitTrailingUnit(raw) : { expression: raw, unit: "" };
    const unit = isExpected ? settings.unit || unitSplit.unit : unitSplit.unit;
    const expression = normalizeExpression(unitSplit.expression);
    const components = splitTuple(expression);
    const variables = new Set();
    const parts = components.map((component) => parseComponent(component, variables));
    return { parts, unit, variables };
  }

  function parseComponent(component, variables) {
    const math = window.math;
    const source = stripOuterParens(component.trim());
    if (!source) throw new Error("Empty numeric expression.");
    const node = math.parse(source);
    validateNode(node, variables);
    return { source, node, compiled: math.compile(source) };
  }

  function normalizeExpression(value) {
    return String(value || "")
      .trim()
      .replace(/\u2212/g, "-")
      .replace(/\u00d7/g, "*")
      .replace(/\u00f7/g, "/")
      .replace(/\*\*/g, "^")
      .replace(/^y\s*=\s*/i, "")
      .replace(/^f\s*\(\s*[a-z]\s*\)\s*=\s*/i, "");
  }

  function splitTrailingUnit(raw) {
    const value = String(raw || "").trim();
    const match = value.match(/^(.*\S)\s+([A-Za-z][A-Za-z0-9/^*._-]*)$/);
    if (!match) return { expression: value, unit: "" };
    return { expression: match[1], unit: match[2] };
  }

  function splitTuple(expression) {
    const value = expression.trim();
    if (!isWrappedByOuterParens(value)) return [value];
    const inner = value.slice(1, -1);
    const parts = splitTopLevel(inner, ",");
    return parts.length > 1 ? parts : [value];
  }

  function splitTopLevel(value, separator) {
    const parts = [];
    let depth = 0;
    let start = 0;
    for (let index = 0; index < value.length; index += 1) {
      const char = value[index];
      if (char === "(" || char === "[" || char === "{") depth += 1;
      if (char === ")" || char === "]" || char === "}") depth -= 1;
      if (char === separator && depth === 0) {
        parts.push(value.slice(start, index).trim());
        start = index + 1;
      }
    }
    parts.push(value.slice(start).trim());
    return parts;
  }

  function stripOuterParens(value) {
    let output = value;
    while (isWrappedByOuterParens(output)) output = output.slice(1, -1).trim();
    return output;
  }

  function isWrappedByOuterParens(value) {
    if (!value.startsWith("(") || !value.endsWith(")")) return false;
    let depth = 0;
    for (let index = 0; index < value.length; index += 1) {
      const char = value[index];
      if (char === "(") depth += 1;
      if (char === ")") depth -= 1;
      if (depth === 0 && index < value.length - 1) return false;
      if (depth < 0) return false;
    }
    return depth === 0;
  }

  function validateNode(node, variables) {
    if (!node) throw new Error("Empty numeric expression.");

    if (node.type === "ParenthesisNode") {
      validateNode(node.content, variables);
      return;
    }

    if (node.type === "ConstantNode") return;

    if (node.type === "SymbolNode") {
      const name = String(node.name || "").toLowerCase();
      if (CONSTANTS.has(name)) return;
      if (/^[a-z]$/i.test(name)) {
        variables.add(name);
        return;
      }
      throw new Error(`Unsupported symbol: ${node.name}.`);
    }

    if (node.type === "OperatorNode") {
      if (!ALLOWED_OPERATORS.has(node.op)) throw new Error(`Unsupported operator: ${node.op}.`);
      (node.args || []).forEach((child) => validateNode(child, variables));
      return;
    }

    if (node.type === "FunctionNode") {
      const name = String(node.fn?.name || node.name || "").toLowerCase();
      if (!ALLOWED_FUNCTIONS.has(name)) throw new Error(`Unsupported function: ${name || "unknown"}.`);
      (node.args || []).forEach((child) => validateNode(child, variables));
      return;
    }

    throw new Error(`Unsupported expression part: ${node.type || "unknown"}.`);
  }

  function exactKey(node) {
    if (node.type === "ParenthesisNode") return exactKey(node.content);
    if (node.type === "ConstantNode") return `number:${String(node.value)}`;
    if (node.type === "SymbolNode") return `symbol:${String(node.name || "").toLowerCase()}`;
    if (node.type === "OperatorNode") return `operator:${node.op}(${(node.args || []).map(exactKey).join(",")})`;
    if (node.type === "FunctionNode") {
      const name = String(node.fn?.name || node.name || "").toLowerCase();
      return `function:${name}(${(node.args || []).map(exactKey).join(",")})`;
    }
    return String(node);
  }

  function evaluateParts(parts, sample, settings) {
    const scope = makeScope(sample, settings);
    return parts.map((part) => evaluatePart(part, scope));
  }

  function evaluatePart(part, scope) {
    try {
      const value = part.compiled.evaluate(scope);
      const numeric = typeof value === "number" ? value : Number(value);
      return { defined: Number.isFinite(numeric), value: numeric };
    } catch (_) {
      return { defined: false, value: NaN };
    }
  }

  function makeScope(sample, settings) {
    const scope = {
      ...sample,
      pi: Math.PI,
      e: Math.E,
      ln: Math.log
    };

    if (settings.angleMode === "degrees") {
      const toRad = (value) => Number(value) * Math.PI / 180;
      scope.sin = (value) => Math.sin(toRad(value));
      scope.cos = (value) => Math.cos(toRad(value));
      scope.tan = (value) => Math.tan(toRad(value));
      scope.asin = (value) => Math.asin(value) * 180 / Math.PI;
      scope.acos = (value) => Math.acos(value) * 180 / Math.PI;
      scope.atan = (value) => Math.atan(value) * 180 / Math.PI;
    }

    return scope;
  }

  function buildSamples(variables) {
    if (!variables.length) return [{}];
    const perVariable = variables.length === 1
      ? 101
      : Math.max(3, Math.floor(Math.pow(MAX_EVALUATIONS, 1 / variables.length)));
    const values = sampleValues(perVariable);
    const samples = [];

    function walk(index, sample) {
      if (samples.length >= MAX_EVALUATIONS) return;
      if (index >= variables.length) {
        samples.push({ ...sample });
        return;
      }
      const variable = variables[index];
      values.forEach((value) => {
        sample[variable] = value;
        walk(index + 1, sample);
      });
    }

    walk(0, {});
    return samples;
  }

  function sampleValues(count) {
    const values = new Set([-50, -25, -10, -5, -2, -1, -0.5, 0, 0.5, 1, 2, 5, 10, 25, 50]);
    if (count > 1) {
      for (let index = 0; index < count; index += 1) {
        values.add(Number((DEFAULT_SAMPLE_MIN + ((DEFAULT_SAMPLE_MAX - DEFAULT_SAMPLE_MIN) * index) / (count - 1)).toFixed(8)));
      }
    }
    return [...values].sort((a, b) => a - b).slice(0, count);
  }

  function nearlyEqual(a, b, tolerance) {
    return Math.abs(a - b) <= tolerance;
  }

  function gradable(isCorrect, message) {
    return { gradable: true, isCorrect: Boolean(isCorrect), message: message || "" };
  }

  function notGradable(message) {
    return { gradable: false, isCorrect: false, message: message || "" };
  }

  window.KelpNumericAnswer = {
    grade,
    normalizeSettings,
    toLatex
  };
})();
