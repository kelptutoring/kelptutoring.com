(function initializeScheduleDomain(globalObject) {
  "use strict";

  const DAY_IN_MS = 24 * 60 * 60 * 1000;
  const WEEKDAY_NAMES = Object.freeze([
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday"
  ]);

  function assertDateOnly(value, fieldName = "date") {
    const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) {
      throw new TypeError(`${fieldName} must use YYYY-MM-DD.`);
    }

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));

    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day
    ) {
      throw new TypeError(`${fieldName} is not a valid calendar date.`);
    }

    return date;
  }

  function formatDateOnly(date) {
    return date.toISOString().slice(0, 10);
  }

  function addDays(dateValue, numberOfDays) {
    const date = assertDateOnly(dateValue);
    date.setUTCDate(date.getUTCDate() + Number(numberOfDays));
    return formatDateOnly(date);
  }

  function getWeekday(dateValue) {
    return assertDateOnly(dateValue).getUTCDay();
  }

  function isValidTimeZone(timeZone) {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
      return true;
    } catch (_error) {
      return false;
    }
  }

  function normalizeTimeZone(value) {
    const timeZone = String(value || "").trim();
    if (!timeZone || !isValidTimeZone(timeZone)) {
      throw new TypeError("A valid student timezone is required.");
    }
    return timeZone;
  }

  function normalizeCadence(cadence) {
    if (cadence?.type === "day_interval") {
      const intervalDays = Number(cadence.intervalDays);
      if (!Number.isInteger(intervalDays) || intervalDays < 1 || intervalDays > 365) {
        throw new TypeError("The session period must be between 1 and 365 days.");
      }

      return Object.freeze({
        type: "day_interval",
        intervalDays
      });
    }

    if (cadence?.type === "weekly_frequency") {
      const weekdays = Array.from(new Set(
        (cadence.weekdays || []).map((weekday) => Number(weekday))
      )).sort((left, right) => left - right);

      if (
        weekdays.length < 1 ||
        weekdays.length > 7 ||
        weekdays.some((weekday) => !Number.isInteger(weekday) || weekday < 0 || weekday > 6)
      ) {
        throw new TypeError("Choose between 1 and 7 different meeting weekdays.");
      }

      return Object.freeze({
        type: "weekly_frequency",
        meetingsPerWeek: weekdays.length,
        weekdays: Object.freeze(weekdays)
      });
    }

    throw new TypeError("Choose a supported schedule cadence.");
  }

  function calculateSessionDates({ startDate, cadence, sessionCount }) {
    assertDateOnly(startDate, "startDate");
    const normalizedCadence = normalizeCadence(cadence);
    const count = Number(sessionCount);

    if (!Number.isInteger(count) || count < 0) {
      throw new TypeError("sessionCount must be a non-negative integer.");
    }

    if (normalizedCadence.type === "day_interval") {
      return Array.from({ length: count }, (_unused, index) => {
        const sessionStartDate = addDays(startDate, index * normalizedCadence.intervalDays);
        return {
          startDate: sessionStartDate,
          endDate: addDays(sessionStartDate, normalizedCadence.intervalDays - 1)
        };
      });
    }

    const allowedWeekdays = new Set(normalizedCadence.weekdays);
    const dates = [];
    let candidate = startDate;

    while (dates.length < count) {
      if (allowedWeekdays.has(getWeekday(candidate))) {
        dates.push({ startDate: candidate, endDate: candidate });
      }
      candidate = addDays(candidate, 1);
    }

    return dates;
  }

  function copySessionPlan(plan, index, scheduleId, dates) {
    const isCustom = plan.type === "custom" || !plan.sourceSessionId;
    const sessionNumber = index + 1;

    return {
      id: plan.scheduledSessionId || `${scheduleId}_session_${sessionNumber}`,
      sessionNumber,
      startDate: dates.startDate,
      endDate: dates.endDate,
      sourceSessionId: isCustom ? null : plan.sourceSessionId,
      trackId: plan.trackId || null,
      trackTitle: plan.trackTitle || "",
      moduleId: plan.moduleId || null,
      moduleTitle: plan.moduleTitle || "Custom sessions",
      title: String(plan.title || "Untitled session").trim(),
      planningHref: plan.planningHref || null,
      type: plan.type || "lesson",
      difficulty: plan.difficulty || "",
      notes: String(plan.notes || "")
    };
  }

  function copyModule(module, index) {
    return {
      id: String(module.id || `module_${index + 1}`),
      sourceModuleId: module.sourceModuleId || null,
      trackId: module.trackId || null,
      trackTitle: module.trackTitle || "",
      title: String(module.title || `Module ${index + 1}`).trim(),
      order: index + 1
    };
  }

  function buildSchedule({
    id,
    name,
    startDate,
    timeZone,
    cadence,
    sessionPlans,
    modules = [],
    context = {}
  }) {
    const plans = Array.isArray(sessionPlans) ? sessionPlans : [];
    if (plans.length === 0) {
      throw new TypeError("At least one session is required.");
    }

    const scheduleId = String(id || "").trim();
    if (!scheduleId) {
      throw new TypeError("A schedule id is required.");
    }

    const normalizedCadence = normalizeCadence(cadence);
    const normalizedTimeZone = normalizeTimeZone(timeZone);
    const dates = calculateSessionDates({
      startDate,
      cadence: normalizedCadence,
      sessionCount: plans.length
    });
    const sessions = plans.map((plan, index) => {
      return copySessionPlan(plan, index, scheduleId, dates[index]);
    });

    return {
      schemaVersion: 1,
      id: scheduleId,
      name: String(name || "Custom schedule").trim() || "Custom schedule",
      status: "draft",
      startDate,
      endDate: sessions[sessions.length - 1].endDate,
      timeZone: normalizedTimeZone,
      cadence: normalizedCadence,
      context: { ...context },
      modules: modules.map(copyModule),
      sessions
    };
  }

  globalObject.KelpScheduleDomain = Object.freeze({
    WEEKDAY_NAMES,
    addDays,
    buildSchedule,
    calculateSessionDates,
    getWeekday,
    isValidTimeZone,
    normalizeCadence
  });
}(globalThis));
