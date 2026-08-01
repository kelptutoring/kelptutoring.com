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

  function calculateFutureCadenceLane({
    sessions,
    startDate,
    cadence,
    today = null,
    lockedStartDate = null
  }) {
    const plannedSessions = Array.isArray(sessions) ? sessions : [];
    const normalizedStartDate = formatDateOnly(assertDateOnly(startDate, "startDate"));
    const effectiveToday = formatDateOnly(assertDateOnly(today || normalizedStartDate, "today"));
    const historicalStart = formatDateOnly(assertDateOnly(
      lockedStartDate || normalizedStartDate,
      "lockedStartDate"
    ));
    const futureBoundary = [normalizedStartDate, effectiveToday, historicalStart]
      .sort()
      .at(-1);
    const identities = plannedSessions.map((session, index) => {
      const stableItemKey = String(
        session?.id || session?.stableItemKey || session?.scheduledSessionId || ""
      ).trim();
      if (!stableItemKey) {
        throw new TypeError(`Schedule Session ${index + 1} requires a stable identity.`);
      }
      return stableItemKey;
    });
    if (new Set(identities).size !== identities.length) {
      throw new TypeError("Every Schedule Session requires a unique stable identity.");
    }

    const dates = calculateSessionDates({
      startDate: futureBoundary,
      cadence,
      sessionCount: identities.length
    });
    return identities.map((stableItemKey, index) => ({
      stableItemKey,
      startDate: dates[index].startDate,
      endDate: dates[index].endDate,
      ordinal: index
    }));
  }

  function calculateEffectiveSessionDates({
    sessions,
    startDate,
    cadence,
    activeItems = [],
    today = null,
    lockedStartDate = null,
    pacingMode = "adaptive"
  }) {
    const plannedSessions = Array.isArray(sessions) ? sessions : [];
    const existingItems = Array.isArray(activeItems) ? activeItems : [];
    const normalizedCadence = normalizeCadence(cadence);
    const normalizedStartDate = formatDateOnly(assertDateOnly(startDate, "startDate"));
    const effectiveToday = formatDateOnly(assertDateOnly(today || normalizedStartDate, "today"));
    const historicalStart = formatDateOnly(assertDateOnly(
      lockedStartDate || normalizedStartDate,
      "lockedStartDate"
    ));
    const futureBoundary = [normalizedStartDate, effectiveToday, historicalStart]
      .sort()
      .at(-1);
    const normalizedPacingMode = pacingMode === "static" ? "static" : "adaptive";
    const identities = plannedSessions.map((session, index) => {
      const stableItemKey = String(
        session?.id || session?.stableItemKey || session?.scheduledSessionId || ""
      ).trim();
      if (!stableItemKey) {
        throw new TypeError(`Schedule Session ${index + 1} requires a stable identity.`);
      }
      return stableItemKey;
    });
    if (new Set(identities).size !== identities.length) {
      throw new TypeError("Every Schedule Session requires a unique stable identity.");
    }

    const activeByKey = new Map(existingItems.map((item, index) => {
      const stableItemKey = String(item?.stableItemKey || item?.id || "").trim();
      if (!stableItemKey) {
        throw new TypeError(`Active Schedule item ${index + 1} requires a stable identity.`);
      }
      return [stableItemKey, item];
    }));
    const retainedByKey = new Map();
    const flexibleIdentities = [];

    identities.forEach((stableItemKey) => {
      const existing = activeByKey.get(stableItemKey);
      const existingDate = existing?.scheduledDate || existing?.startDate || "";
      const retained = Boolean(existing) && (
        normalizedPacingMode === "static"
        || existing.isStudied === true
      );
      if (retained) {
        const retainedStartDate = formatDateOnly(assertDateOnly(
          existingDate,
          `Active Schedule item ${stableItemKey} date`
        ));
        const retainedEndDate = formatDateOnly(assertDateOnly(
          existing.endDate || retainedStartDate,
          `Active Schedule item ${stableItemKey} end date`
        ));
        retainedByKey.set(stableItemKey, {
          startDate: retainedStartDate,
          endDate: retainedEndDate,
          retained: true,
          retainedReason: existing.isStudied === true
            ? "studied"
            : "static"
        });
      } else {
        flexibleIdentities.push(stableItemKey);
      }
    });

    const flexibleDates = calculateSessionDates({
      startDate: futureBoundary,
      cadence: normalizedCadence,
      sessionCount: flexibleIdentities.length
    });
    const flexibleByKey = new Map(
      flexibleIdentities.map((stableItemKey, index) => [
        stableItemKey,
        { ...flexibleDates[index], retained: false, retainedReason: null }
      ])
    );

    return identities.map((stableItemKey) =>
      retainedByKey.get(stableItemKey) || flexibleByKey.get(stableItemKey)
    );
  }

  function copySessionPlan(plan, index, scheduleId, dates) {
    const isCustom = plan.type === "custom" || !plan.sourceSessionId;
    const sessionNumber = index + 1;

    return {
      id: plan.scheduledSessionId || plan.stableItemKey || `${scheduleId}_session_${sessionNumber}`,
      sessionNumber,
      startDate: dates.startDate,
      endDate: dates.endDate,
      sourceSessionId: isCustom ? null : plan.sourceSessionId,
      educationLevelId: plan.educationLevelId || null,
      educationLevelTitle: plan.educationLevelTitle || "",
      educationLevelTaxonomySlug: plan.educationLevelTaxonomySlug || "",
      subjectId: plan.subjectId || null,
      subjectTitle: plan.subjectTitle || "",
      subjectTaxonomySlug: plan.subjectTaxonomySlug || "",
      academicPathway: plan.academicPathway ? { ...plan.academicPathway } : null,
      trackId: plan.trackId || null,
      trackTitle: plan.trackTitle || "",
      trackTaxonomySlug: plan.trackTaxonomySlug || "",
      moduleId: plan.moduleId || null,
      moduleTitle: plan.moduleTitle || "Custom sessions",
      title: String(plan.title || "Untitled session").trim(),
      planningHref: plan.planningHref || null,
      sourceContentVersionKey: isCustom ? null : (plan.sourceContentVersionKey || null),
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
    schemaVersion = 1,
    id,
    name,
    startDate,
    timeZone,
    cadence,
    pacingMode = "adaptive",
    sessionPlans,
    activeItems = [],
    today = null,
    lockedStartDate = null,
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
    const normalizedPacingMode = pacingMode === "static" ? "static" : "adaptive";
    const plansWithIdentity = plans.map((plan, index) => ({
      ...plan,
      id: plan.scheduledSessionId
        || plan.stableItemKey
        || `${scheduleId}_session_${index + 1}`
    }));
    const dates = calculateEffectiveSessionDates({
      sessions: plansWithIdentity,
      startDate,
      cadence: normalizedCadence,
      activeItems,
      today,
      lockedStartDate,
      pacingMode: normalizedPacingMode
    });
    const effectiveFutureLane = calculateFutureCadenceLane({
      sessions: plansWithIdentity,
      startDate,
      cadence: normalizedCadence,
      today,
      lockedStartDate
    });
    const sessions = plans.map((plan, index) => {
      return copySessionPlan(plan, index, scheduleId, dates[index]);
    });

    return {
      schemaVersion: Math.max(1, Number(schemaVersion) || 1),
      id: scheduleId,
      name: String(name || "Custom schedule").trim() || "Custom schedule",
      status: "draft",
      startDate,
      endDate: sessions.map((session) => session.endDate).sort().at(-1),
      timeZone: normalizedTimeZone,
      cadence: normalizedCadence,
      pacingMode: normalizedPacingMode,
      context: {
        ...context,
        effectiveFutureLaneAuthority: true,
        effectiveFutureLane
      },
      modules: modules.map(copyModule),
      sessions
    };
  }

  globalObject.KelpScheduleDomain = Object.freeze({
    WEEKDAY_NAMES,
    addDays,
    buildSchedule,
    calculateEffectiveSessionDates,
    calculateFutureCadenceLane,
    calculateSessionDates,
    getWeekday,
    isValidTimeZone,
    normalizeCadence
  });
}(globalThis));
