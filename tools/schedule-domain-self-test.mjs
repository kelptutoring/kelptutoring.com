import assert from "node:assert/strict";
import "../src/app/schedule-generator/schedule-domain.js";

const {
  buildSchedule,
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
