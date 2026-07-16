# Schedule Markdown Guide

This guide documents the markdown syntax used by the scheduling system. The source files live in `src/app/schedules/`; the generated static pages and schedule-generator data are built from those files.

## Source And Output

Edit these files:

~~~text
src/app/schedules/**/*.md
~~~

Generated outputs:

~~~text
src/app/schedules/**/*.html
src/data/tracks-data.js
~~~

Do not manually maintain generated HTML pages or `src/data/tracks-data.js`. They are rebuilt by the tools and may be overwritten.

## Commands

From the project folder:

~~~bash
npm run generate:tracks
npm run generate:schedules
npm run watch:schedules
npm run extract:schedules
~~~

Use `npm run generate:schedules` after schedule markdown changes. It refreshes both the static HTML pages and `src/data/tracks-data.js`.

Use `npm run watch:schedules` while actively editing. It watches `src/app/schedules/**/*.md` and regenerates when files are saved.

Use `npm run generate:tracks` only when you want to refresh `src/data/tracks-data.js` without rebuilding the static HTML pages.

Use `npm run extract:schedules` only for one-time conversion work from existing HTML card pages back into markdown.

## Planning Tree

The schedule generator discovers content by walking links from the root page:

~~~text
schedules.md
  level page
    subject page
      track page, for subjects with tracks
        module page
          week instruction pages
      module page, for direct-module subjects
        week instruction pages
~~~

Examples:

- `schedules.md` links to `High School/HS-tracks.html`.
- `HS-tracks.md` links to subject pages such as Math and Physics.
- Math subject pages link to tracks such as Algebra 1, Algebra 2, Geometry, and Trigonometry.
- Physics links directly to module pages; this becomes `modulesOnly` in `tracks-data.js`.
- Module pages link to weekly instruction pages under `Instructions/`.

A file must be linked from its parent page to appear in the generated track data. Creating a markdown file alone is not enough.

## Front Matter

Every schedule markdown page starts with front matter:

~~~md
---
title: Browser tab title
kicker: Small label above the heading
heading: Main page heading
intro: Short page intro
back: ../parent-page.html
home: ../../dashboard/student-dashboard.html
homeLabel: Dashboard
listClass: lesson-list
---
~~~

Supported keys:

- `type`: Use `week` for week instruction pages. Omit it for card/list pages.
- `title`: Browser title and fallback heading.
- `kicker`: Small label above the heading.
- `heading`: Visible page heading.
- `intro`: Short paragraph below the heading.
- `back`: Relative link for the Back button.
- `backLabel`: Optional custom Back button text.
- `home`: Relative dashboard link. Use `home: false` only if a page should not show Home.
- `homeLabel`: Optional custom Home button text.
- `logoLink`: Optional logo link override.
- `listClass`: Optional extra class for card/list pages, such as `lesson-list` or `physics-modules-grid`.

Keep paths relative to the generated `.html` page location. Dashboard links are later adjusted by the browser-side role helper when the user came from the tutor or student dashboard.

## Card/List Pages

Card/list pages define levels, subjects, tracks, modules, and weeks. Their body should contain link-list lines only, plus optional markdown headings. Do not put normal paragraphs in a card/list body; the parser will reject unrecognized lines.

Unordered card syntax:

~~~md
- [High School](./High School/HS-tracks.html)
- [Algebra 1](./Algebra 1/Algebra_1_indexes.html): Optional description shown on the card.
~~~

Ordered lesson/module syntax:

~~~md
1. [Sign rules and PEMDAS](./Instructions/HSM1.html)
2. [Arithmetic operations involving fractions](./Instructions/HSM2.html)
~~~

Important link rule: links point to `.html`, not `.md`. The tools use those `.html` hrefs to find the matching `.md` source file.

## Track And Module Discovery Rules

The data generator builds `src/data/tracks-data.js` by following card/list links.

- A subject page whose cards all start with `Module N` becomes a direct-module subject under `modulesOnly`.
- A subject page whose cards link to track pages becomes a subject with named tracks.
- Module cards are sorted by module number when building data.
- Week titles are read from module-page link text. If a week link is numbered but does not start with `Week N:`, the generator formats it as `Week N: Link title`.
- Week difficulty is extracted from the linked week instruction page.

## Week Instruction Pages

Week pages use `type: week` and can contain sections, paragraphs, bullet lists, links, bold text, italic text, and images.

~~~md
---
type: week
title: HS, Algebra 1: Week 1
kicker: High school math
heading: Week 1: Sign Rules, Multiplication Properties, and PEMDAS
intro: Use this plan to prepare, practice, and mark what needs attention during tutoring.
back: ../HSM_module_1.html
---

## Week goals
- Apply sign rules for integer operations.
- Evaluate expressions using the correct order of operations.

## What we are studying
- Topic: Sign rules, multiplication properties, and order of operations.
- Difficulty level: low
- Main skill: Slowing down enough to choose the correct operation order before calculating.
~~~

Use `##` for main sections and `###` for smaller headings inside a section. Bullet lines must start with `- `. Blank lines close lists.

## Difficulty Level

Difficulty is a planned tutor estimate, not the student perception. Use one of these values in a week instruction page:

~~~md
- Difficulty level: low
- Difficulty level: medium
- Difficulty level: high
~~~

Meanings:

- `low`: definitions or direct method application.
- `medium`: combines two concepts or requires further interpretation.
- `high`: combines multiple concepts and requires multi-step reasoning.

The data generator also recognizes older wording such as foundational, challenging, or multi-step, but new pages should use `low`, `medium`, or `high` exactly. Mid-term exam and review weeks created inside the schedule generator intentionally have no planned difficulty.

## Images And Read-Aloud Captions

Use images only when they directly support the lesson. Store schedule images under `public/assets/schedules/...`.

Image syntax:

~~~md
![Figure 1 | Short visual title](../../../../../../../public/assets/schedules/example.png): Caption explaining what the student should notice. || Read aloud: Short spoken version of what the figure shows.
~~~

How it renders:

- Text before `|` becomes the figure label.
- Text after `|` becomes the figure title.
- Text after `):` becomes the caption.
- Text after `|| Read aloud:` becomes the spoken text for the Read out loud button.

Keep image paths relative to the generated page location.

## Safe Editing Checklist

Before generation:

- Confirm every new markdown file has front matter.
- Confirm every new child page is linked from its parent page.
- Confirm card/list bodies contain only link-list lines and optional headings.
- Confirm week pages use `type: week`.
- Confirm new week pages include `- Difficulty level: low`, `medium`, or `high` unless the week should intentionally have no planned difficulty.

After generation:

- Run `npm run generate:schedules`, or save while `npm run watch:schedules` is running.
- Open `src/app/schedule-generator/schedule-generator.html`.
- Confirm the expected level, subject, track, module, and week options appear.
- Do not hand-edit generated HTML to make permanent content changes.
- Add a dated note to `planning-scheduling.log` for meaningful changes.

## Reusable Template

Use `docs/week-page-template.md` as the house template for new weekly instruction pages.
