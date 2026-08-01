import assert from "node:assert/strict";
import "../src/app/schedule-generator/schedule-domain.js";

const {
  buildSchedule,
  calculateEffectiveSessionDates,
  calculateFutureCadenceLane,
  calculateSessionDates,
  normalizeCadence
} = globalThis.KelpScheduleDomain;

const intervalDates = calculateSessionDates({
  startDate: "2026-08-03",
  cadence: { type: "day_interval", intervalDays: 3 },
  sessionCount: 3
});

assert.deepEqual(intervalDates, [
  { startDate: "2026-08-03", endDate: "2026-08-05" },
  { startDate: "2026-08-06", endDate: "2026-08-08" },
  { startDate: "2026-08-09", endDate: "2026-08-11" }
]);

const weekdayDates = calculateSessionDates({
  startDate: "2026-08-05",
  cadence: { type: "weekly_frequency", weekdays: [1, 2, 3, 4, 5] },
  sessionCount: 7
});

assert.deepEqual(weekdayDates.map((entry) => entry.startDate), [
  "2026-08-05",
  "2026-08-06",
  "2026-08-07",
  "2026-08-10",
  "2026-08-11",
  "2026-08-12",
  "2026-08-13"
]);

const mondayWednesdayFridayDates = calculateSessionDates({
  startDate: "2026-08-02",
  cadence: { type: "weekly_frequency", weekdays: [1, 3, 5] },
  sessionCount: 10
});

assert.deepEqual(
  mondayWednesdayFridayDates.map((entry) => entry.startDate),
  [
    "2026-08-03",
    "2026-08-05",
    "2026-08-07",
    "2026-08-10",
    "2026-08-12",
    "2026-08-14",
    "2026-08-17",
    "2026-08-19",
    "2026-08-21",
    "2026-08-24"
  ],
  "Monday/Wednesday/Friday cadence must repeat by seven-day weekday lanes."
);

const userExampleDates = calculateSessionDates({
  startDate: "2026-08-06",
  cadence: { type: "weekly_frequency", weekdays: [1, 3, 5] },
  sessionCount: 7
});

assert.deepEqual(
  userExampleDates.map((entry) => entry.startDate),
  [
    "2026-08-07",
    "2026-08-10",
    "2026-08-12",
    "2026-08-14",
    "2026-08-17",
    "2026-08-19",
    "2026-08-21"
  ],
  "A Course starting on Thursday must fill the next Friday/Monday/Wednesday lane without vacancies."
);

const identitySessions = ["A", "B", "C", "D", "E"].map((id) => ({
  id,
  title: `Session ${id}`
}));
const studiedADE = ["A", "D", "E"].map((stableItemKey) => ({
  stableItemKey,
  scheduledDate: "2026-07-30",
  endDate: "2026-07-30",
  isStudied: true
}));
const effectiveWithADEStudied = calculateEffectiveSessionDates({
  sessions: identitySessions,
  startDate: "2026-08-06",
  today: "2026-08-06",
  lockedStartDate: "2026-08-06",
  cadence: { type: "weekly_frequency", weekdays: [1, 3, 5] },
  activeItems: studiedADE
});

assert.deepEqual(
  effectiveWithADEStudied.map((entry) => entry.startDate),
  [
    "2026-07-30",
    "2026-08-07",
    "2026-08-10",
    "2026-07-30",
    "2026-07-30"
  ],
  "Studied A, D, and E retain their history while unfinished B and C alone consume future cadence slots."
);
assert.deepEqual(
  effectiveWithADEStudied.map((entry) => entry.retainedReason),
  ["studied", null, null, "studied", "studied"]
);

const effectiveAfterDIsUnmarked = calculateEffectiveSessionDates({
  sessions: identitySessions,
  startDate: "2026-08-06",
  today: "2026-08-06",
  lockedStartDate: "2026-08-06",
  cadence: { type: "weekly_frequency", weekdays: [1, 3, 5] },
  activeItems: studiedADE.map((item) => (
    item.stableItemKey === "D"
      ? { ...item, isStudied: false }
      : item
  ))
});

assert.deepEqual(
  effectiveAfterDIsUnmarked.map((entry) => entry.startDate),
  [
    "2026-07-30",
    "2026-08-07",
    "2026-08-10",
    "2026-08-12",
    "2026-07-30"
  ],
  "Unmarking D removes its Studied-date lock and restores it to the unfinished identity lane after B and C."
);

const tuesdayThursdayLane = calculateFutureCadenceLane({
  sessions: identitySessions,
  startDate: "2026-08-06",
  today: "2026-08-06",
  lockedStartDate: "2026-08-06",
  cadence: { type: "weekly_frequency", weekdays: [2, 4] }
});

assert.deepEqual(
  tuesdayThursdayLane.map((entry) => [
    entry.stableItemKey,
    entry.startDate,
    entry.ordinal
  ]),
  [
    ["A", "2026-08-06", 0],
    ["B", "2026-08-11", 1],
    ["C", "2026-08-13", 2],
    ["D", "2026-08-18", 3],
    ["E", "2026-08-20", 4]
  ],
  "The persisted future lane must contain only the newly selected Tuesday/Thursday cadence, independent of Studied history."
);

assert.throws(
  () => calculateEffectiveSessionDates({
    sessions: [{ id: "duplicate" }, { id: "duplicate" }],
    startDate: "2026-08-06",
    cadence: { type: "weekly_frequency", weekdays: [1, 3, 5] }
  }),
  /unique stable identity/,
  "The calculator must reject duplicate identities instead of assigning one Session's date to another."
);

const multiTrackSchedule = buildSchedule({
  id: "multi_track_identity",
  name: "Multi-track identity order",
  startDate: "2026-08-06",
  timeZone: "America/Sao_Paulo",
  cadence: { type: "weekly_frequency", weekdays: [1, 3, 5] },
  activeItems: studiedADE,
  today: "2026-08-06",
  lockedStartDate: "2026-08-06",
  sessionPlans: [
    ["A", "Geometry"],
    ["B", "Physics"],
    ["C", "Trigonometry"],
    ["D", "Geometry"],
    ["E", "Physics"]
  ].map(([scheduledSessionId, trackTitle]) => ({
    scheduledSessionId,
    sourceSessionId: `source-${scheduledSessionId}`,
    trackId: trackTitle.toLowerCase(),
    trackTitle,
    moduleTitle: `${trackTitle} module`,
    title: `Session ${scheduledSessionId}`,
    type: "lesson"
  }))
});

assert.deepEqual(
  multiTrackSchedule.sessions.map((session) => [
    session.id,
    session.title,
    session.trackTitle
  ]),
  [
    ["A", "Session A", "Geometry"],
    ["B", "Session B", "Physics"],
    ["C", "Session C", "Trigonometry"],
    ["D", "Session D", "Geometry"],
    ["E", "Session E", "Physics"]
  ],
  "Cross-Track calculation must never replace one stable Session identity with another."
);
assert.equal(multiTrackSchedule.endDate, "2026-08-10");
assert.equal(multiTrackSchedule.context.effectiveFutureLaneAuthority, true);
assert.deepEqual(
  multiTrackSchedule.context.effectiveFutureLane.map((entry) => entry.startDate),
  ["2026-08-07", "2026-08-10", "2026-08-12", "2026-08-14", "2026-08-17"],
  "The Builder document must carry one complete gap-free cadence vector even when some Sessions retain Studied dates in the visible Schedule."
);

assert.deepEqual(
  normalizeCadence({ type: "weekly_frequency", weekdays: [4, 1, 4] }),
  { type: "weekly_frequency", meetingsPerWeek: 2, weekdays: [1, 4] }
);

assert.deepEqual(
  normalizeCadence({ type: "weekly_frequency", weekdays: [0, 1, 2, 3, 4, 5, 6] }),
  { type: "weekly_frequency", meetingsPerWeek: 7, weekdays: [0, 1, 2, 3, 4, 5, 6] }
);

assert.throws(
  () => normalizeCadence({ type: "weekly_frequency", weekdays: [0, 1, 2, 3, 4, 5, 6, 7] }),
  /between 1 and 7/
);

const schedule = buildSchedule({
  id: "schedule_test",
  name: "Algebra support",
  startDate: "2026-08-03",
  timeZone: "America/Sao_Paulo",
  cadence: { type: "weekly_frequency", weekdays: [1, 4] },
  context: {
    subjectTitle: "Math",
    trackIds: ["algebra_1", "algebra_2"],
    trackTitles: ["Algebra 1", "Algebra 2"]
  },
  modules: [
    {
      id: "builtin_module_1",
      sourceModuleId: "builtin_module_1",
      trackId: "algebra_1",
      trackTitle: "Algebra 1",
      title: "Foundations"
    }
  ],
  sessionPlans: [
    {
      sourceSessionId: "builtin_hsm1",
      trackId: "algebra_1",
      trackTitle: "Algebra 1",
      moduleId: "builtin_module_1",
      moduleTitle: "Module 1: Foundations",
      title: "Order of operations",
      planningHref: "../schedules/hsm1.html",
      type: "lesson",
      difficulty: "low"
    },
    {
      sourceSessionId: null,
      trackId: "algebra_2",
      trackTitle: "Algebra 2",
      moduleId: null,
      moduleTitle: "Custom sessions",
      title: "Practice exam",
      planningHref: null,
      type: "custom"
    }
  ]
});

assert.equal(schedule.startDate, "2026-08-03");
assert.equal(schedule.endDate, "2026-08-06");
assert.equal(schedule.sessions[0].sourceSessionId, "builtin_hsm1");
assert.equal(schedule.sessions[0].trackId, "algebra_1");
assert.equal(schedule.sessions[0].trackTitle, "Algebra 1");
assert.equal(schedule.sessions[0].planningHref, "../schedules/hsm1.html");
assert.equal(schedule.sessions[1].sourceSessionId, null);
assert.equal(schedule.sessions[1].sessionNumber, 2);
assert.equal(schedule.sessions[1].startDate, "2026-08-06");
assert.deepEqual(schedule.context.trackTitles, ["Algebra 1", "Algebra 2"]);
assert.deepEqual(schedule.modules[0], {
  id: "builtin_module_1",
  sourceModuleId: "builtin_module_1",
  trackId: "algebra_1",
  trackTitle: "Algebra 1",
  title: "Foundations",
  order: 1
});
assert.equal("workedOn" in schedule.sessions[0], false);

console.log("Schedule domain self-test passed.");
