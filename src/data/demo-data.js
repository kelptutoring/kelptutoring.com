import { supabase } from '../lib/supabase/supabaseClient.js';

const PROFILE_KEY = 'kelp_profiles';
const LINKS_KEY = 'kelp_important_links';
const TEMPLATE_KEY = 'kelp_assignment_templates';
const STUDENT_EVENT_KEY = 'kelp_student_events';
const TUTOR_EVENT_KEY = 'kelp_tutor_events';
const ROSTER_KEY = 'kelp_roster';
const TEMPLATE_TABLE = 'assignment_templates';

function monthDate(offsetDays = 0, hour = 0, minute = 0) {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offsetDays);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

const seedProfiles = {
  student: {
    firstName: 'Emma',
    subjects: ['SAT Verbal', 'Algebra', 'Physics'],
    bio: 'Focused on college admissions tests and STEM reinforcement.',
  },
  tutor: {
    firstName: 'Marina',
    academicExperience: 'MSc in Physics',
    workExperience: '6 years teaching STEM, SAT prep, and academic writing.',
    languages: ['English', 'Portuguese', 'Spanish'],
    hobbies: ['Running', 'Piano', 'Chess'],
    bio: 'Tutor focused on clarity, calm feedback, and strong mathematical foundations.',
    subjectCount: 4,
    classCount: 248,
  },
};

const seedLinks = [
  { label: 'Google Meet room', url: 'https://meet.google.com/' },
  { label: 'Desmos calculator', url: 'https://www.desmos.com/calculator' },
  { label: 'Classroom workspace', url: '#' },
  { label: 'Physics simulator', url: 'https://phet.colorado.edu/' },
];

const seedRoster = [
  {
    id: 'student-emma',
    name: 'Emma Carter',
    subjects: ['SAT Verbal', 'Algebra'],
    profileSummary: 'Strong verbal progress, ready for harder reading passages.',
    classes: [
      {
        id: 'class-emma-verbal',
        title: 'SAT Verbal',
        schedule: 'Mondays · 17:30',
        dueDate: monthDate(6, 23, 59),
        status: 'On track',
        assignments: [
          { title: 'Reading inference set', dueDate: monthDate(6, 23, 59), templateId: 'template-verbal-check' },
          { title: 'Timed verbal checkpoint', dueDate: monthDate(13, 18, 0), templateId: 'template-verbal-midterm' },
        ],
      },
      {
        id: 'class-emma-algebra',
        title: 'Algebra',
        schedule: 'Wednesdays · 17:30',
        dueDate: monthDate(11, 23, 59),
        status: 'Needs challenge',
        assignments: [
          { title: 'Linear equations drill', dueDate: monthDate(11, 23, 59), templateId: 'template-linear-equations' },
        ],
      },
    ],
  },
  {
    id: 'student-lucas',
    name: 'Lucas Miller',
    subjects: ['Algebra', 'Physics'],
    profileSummary: 'Needs confidence support and clearer step-by-step scaffolding.',
    classes: [
      {
        id: 'class-lucas-algebra',
        title: 'Algebra intervention',
        schedule: 'Tuesdays · 14:00',
        dueDate: monthDate(8, 23, 59),
        status: 'Watch pacing',
        assignments: [
          { title: 'Slope and intercept practice', dueDate: monthDate(8, 23, 59), templateId: 'template-linear-equations' },
        ],
      },
      {
        id: 'class-lucas-physics',
        title: 'Mechanics foundations',
        schedule: 'Fridays · 10:00',
        dueDate: monthDate(15, 23, 59),
        status: 'At risk',
        assignments: [
          { title: 'Kinematics graph quiz', dueDate: monthDate(15, 23, 59), templateId: 'template-kinematics' },
        ],
      },
    ],
  },
  {
    id: 'student-sofia',
    name: 'Sofia Ramirez',
    subjects: ['Writing', 'Biology'],
    profileSummary: 'Consistent attendance, but often sends drafts late.',
    classes: [
      {
        id: 'class-sofia-writing',
        title: 'Essay planning',
        schedule: 'Thursdays · 11:30',
        dueDate: monthDate(9, 23, 59),
        status: 'Watch timing',
        assignments: [
          { title: 'Thesis and outline submission', dueDate: monthDate(9, 23, 59), templateId: 'template-writing-outline' },
        ],
      },
    ],
  },
];

const seedStudentEvents = [
  { id: 's1', title: 'SAT Verbal class', type: 'class', date: monthDate(3, 17, 30), actionLabel: 'Join class', notes: 'Reading passage pacing + inference strategies.' },
  { id: 's2', title: 'Linear equations drill', type: 'assignment', date: monthDate(6, 23, 59), actionLabel: 'Open assignment', assignmentId: 'template-linear-equations', notes: 'Homework due before Thursday night.' },
  { id: 's3', title: 'Physics problem set', type: 'assignment', date: monthDate(10, 23, 59), actionLabel: 'Open assignment', assignmentId: 'template-kinematics', notes: 'Contains formulas and a graph interpretation question.' },
  { id: 's4', title: 'Algebra class', type: 'class', date: monthDate(11, 17, 30), actionLabel: 'Join class', notes: 'Topic: systems of equations.' },
  { id: 's5', title: 'Essay draft review', type: 'assignment', date: monthDate(15, 18, 0), actionLabel: 'Open assignment', assignmentId: 'template-writing-outline', notes: 'Upload outline before tutor comments.' },
  { id: 's6', title: 'Tutor check-in', type: 'class', date: monthDate(17, 16, 0), actionLabel: 'Join class', notes: 'Strategy and progress review.' },
];

const seedTutorEvents = [
  { id: 't1', title: 'Emma · SAT Verbal', type: 'class', date: monthDate(3, 17, 30), studentId: 'student-emma', notes: 'Use timed verbal checkpoint rubric.' },
  { id: 't2', title: 'Company meeting', type: 'meeting', date: monthDate(5, 10, 0), notes: 'Weekly operations sync with Kelp team.' },
  { id: 't3', title: 'Lucas · Algebra intervention', type: 'class', date: monthDate(8, 14, 0), studentId: 'student-lucas', notes: 'Review confidence notes and scaffold problems.' },
  { id: 't4', title: 'Sofia · Essay planning', type: 'class', date: monthDate(9, 11, 30), studentId: 'student-sofia', notes: 'Check outline submission.' },
  { id: 't5', title: 'Tutor calibration meeting', type: 'meeting', date: monthDate(12, 9, 0), notes: 'Assessment quality and grading alignment.' },
  { id: 't6', title: 'Emma · Algebra', type: 'class', date: monthDate(11, 17, 30), studentId: 'student-emma', notes: 'Introduce systems of equations.' },
];

const seedTemplates = [
  {
    id: 'template-linear-equations',
    title: 'Linear equations drill',
    subject: 'Algebra',
    timerMinutes: 20,
    questions: [
      {
        id: 'q1',
        type: 'numeric',
        prompt: 'Solve $2x + 5 = 17$. Enter the value of $x$.',
        answer: '6',
        graphExpression: '',
        imageData: '',
        options: [],
      },
      {
        id: 'q2',
        type: 'multiple-choice',
        prompt: 'Which graph matches the function $y = 2x - 1$?',
        options: ['Line with slope 2 and intercept -1', 'Parabola opening upward', 'Horizontal line at 2', 'Line with slope -1 and intercept 2'],
        answer: 'Line with slope 2 and intercept -1',
        graphExpression: '2*x-1',
        imageData: '',
      },
    ],
  },
  {
    id: 'template-kinematics',
    title: 'Kinematics graph quiz',
    subject: 'Physics',
    timerMinutes: 25,
    questions: [
      {
        id: 'q1',
        type: 'true-false',
        prompt: 'For constant acceleration, the position function may be written as $s(t)=s_0+v_0t+\frac{1}{2}at^2$.',
        options: ['True', 'False'],
        answer: 'True',
        graphExpression: '0.5*x^2',
        imageData: '',
      },
      {
        id: 'q2',
        type: 'checkbox',
        prompt: 'Select the statements that are true for the graph shown.',
        options: ['Velocity increases with time', 'The motion is at rest', 'Acceleration is positive'],
        answer: ['Velocity increases with time', 'Acceleration is positive'],
        graphExpression: 'x^2',
        imageData: '',
      },
    ],
  },
  {
    id: 'template-verbal-check',
    title: 'Reading inference set',
    subject: 'SAT Verbal',
    timerMinutes: 18,
    questions: [
      {
        id: 'q1',
        type: 'multiple-choice',
        prompt: "Choose the option that best supports the author's main inference in paragraph 2.",
        options: ['Option A', 'Option B', 'Option C', 'Option D'],
        answer: 'Option B',
        graphExpression: '',
        imageData: '',
      },
    ],
  },
  {
    id: 'template-verbal-midterm',
    title: 'Timed verbal checkpoint',
    subject: 'SAT Verbal',
    timerMinutes: 35,
    questions: [
      {
        id: 'q1',
        type: 'multiple-choice',
        prompt: 'This checkpoint is seeded as a placeholder for the timed verbal midterm.',
        options: ['A', 'B', 'C', 'D'],
        answer: 'A',
        graphExpression: '',
        imageData: '',
      },
    ],
  },
  {
    id: 'template-writing-outline',
    title: 'Thesis and outline submission',
    subject: 'Writing',
    timerMinutes: 0,
    questions: [
      {
        id: 'q1',
        type: 'file-upload',
        prompt: 'Upload your thesis statement and outline as PDF or image.',
        options: [],
        answer: '',
        graphExpression: '',
        imageData: '',
      },
    ],
  },
];

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function normalizeTemplate(template) {
  return {
    id: template.id,
    title: template.title || 'Untitled assignment',
    subject: template.subject || 'General',
    timerMinutes: Number(template.timerMinutes || 0),
    questions: Array.isArray(template.questions)
      ? template.questions.map((question, index) => ({
          id: question.id || `q-${index + 1}`,
          type: question.type || 'multiple-choice',
          prompt: question.prompt || '',
          options: Array.isArray(question.options) ? question.options : [],
          answer: question.answer ?? '',
          graphExpression: question.graphExpression || '',
          imageData: question.imageData || '',
        }))
      : [],
  };
}

function toSupabaseRecord(template, ownerId = null) {
  const normalized = normalizeTemplate(template);
  return {
    id: normalized.id,
    title: normalized.title,
    subject: normalized.subject,
    timer_minutes: normalized.timerMinutes,
    questions: normalized.questions,
    owner_id: ownerId || null,
    updated_at: new Date().toISOString(),
  };
}

function fromSupabaseRecord(record) {
  return normalizeTemplate({
    id: record.id,
    title: record.title,
    subject: record.subject,
    timerMinutes: record.timer_minutes,
    questions: record.questions,
  });
}

function mergeTemplates(primary, secondary) {
  const map = new Map();
  [...secondary, ...primary].forEach((template) => {
    const normalized = normalizeTemplate(template);
    map.set(normalized.id, normalized);
  });
  return Array.from(map.values());
}

export function seedLocalData() {
  if (!localStorage.getItem(PROFILE_KEY)) writeJson(PROFILE_KEY, seedProfiles);
  if (!localStorage.getItem(LINKS_KEY)) writeJson(LINKS_KEY, seedLinks);
  if (!localStorage.getItem(TEMPLATE_KEY)) writeJson(TEMPLATE_KEY, seedTemplates);
  if (!localStorage.getItem(STUDENT_EVENT_KEY)) writeJson(STUDENT_EVENT_KEY, seedStudentEvents);
  if (!localStorage.getItem(TUTOR_EVENT_KEY)) writeJson(TUTOR_EVENT_KEY, seedTutorEvents);
  if (!localStorage.getItem(ROSTER_KEY)) writeJson(ROSTER_KEY, seedRoster);
}

export function getProfiles() { return readJson(PROFILE_KEY, seedProfiles); }
export function saveProfiles(value) { writeJson(PROFILE_KEY, value); }
export function getImportantLinks() { return readJson(LINKS_KEY, seedLinks); }
export function saveImportantLinks(value) { writeJson(LINKS_KEY, value); }
export function getTemplates() { return readJson(TEMPLATE_KEY, seedTemplates).map(normalizeTemplate); }
export function saveTemplates(value) { writeJson(TEMPLATE_KEY, value.map(normalizeTemplate)); }
export function getStudentEvents() { return readJson(STUDENT_EVENT_KEY, seedStudentEvents); }
export function saveStudentEvents(value) { writeJson(STUDENT_EVENT_KEY, value); }
export function getTutorEvents() { return readJson(TUTOR_EVENT_KEY, seedTutorEvents); }
export function saveTutorEvents(value) { writeJson(TUTOR_EVENT_KEY, value); }
export function getRoster() { return readJson(ROSTER_KEY, seedRoster); }
export function saveRoster(value) { writeJson(ROSTER_KEY, value); }

export async function hydrateTemplatesFromSupabase() {
  const localTemplates = getTemplates();
  try {
    const { data, error } = await supabase
      .from(TEMPLATE_TABLE)
      .select('id, title, subject, timer_minutes, questions, updated_at')
      .order('updated_at', { ascending: false });

    if (error) throw error;

    const remoteTemplates = Array.isArray(data) ? data.map(fromSupabaseRecord) : [];
    const merged = mergeTemplates(remoteTemplates, localTemplates);
    saveTemplates(merged);
    return { ok: true, source: 'supabase', templates: merged, message: remoteTemplates.length ? 'Loaded templates from Supabase.' : 'Supabase is connected, but there are no saved templates yet.' };
  } catch (error) {
    return {
      ok: false,
      source: 'localStorage',
      templates: localTemplates,
      message: 'Supabase assignment table is not ready yet. Using browser storage for this build.',
      error: error?.message || String(error),
    };
  }
}

export async function upsertTemplate(template, ownerId = null) {
  const normalized = normalizeTemplate(template);
  const localTemplates = mergeTemplates([normalized], getTemplates());
  saveTemplates(localTemplates);

  try {
    const { error } = await supabase.from(TEMPLATE_TABLE).upsert(toSupabaseRecord(normalized, ownerId));
    if (error) throw error;
    return { ok: true, source: 'supabase', template: normalized, message: 'Template saved to Supabase and synced locally.' };
  } catch (error) {
    return {
      ok: false,
      source: 'localStorage',
      template: normalized,
      message: 'Template saved in the browser, but Supabase persistence is not ready yet.',
      error: error?.message || String(error),
    };
  }
}

export function formatDate(value, opts = {}) {
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: opts.withTime === false ? undefined : '2-digit',
    minute: opts.withTime === false ? undefined : '2-digit',
  });
}

export function getTemplateById(id) {
  return getTemplates().find((template) => template.id === id) || null;
}

export function nextTemplateId() {
  return 'template-' + Math.random().toString(36).slice(2, 10);
}
