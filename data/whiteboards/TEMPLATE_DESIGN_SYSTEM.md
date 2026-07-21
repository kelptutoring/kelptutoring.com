# Kelp whiteboard template design system

This file is the durable contract for reusable lesson whiteboards. Read it with the lesson generator and the pilot README before changing a scene or starting a related Codex task.

## Purpose

A generated bundle is a tutor-editable source template, not a finished worksheet. Tutors choose frames and questions, rearrange them, rewrite text, annotate the canvas, and delete anything they do not need.

The repository scene is the source of truth while the template family is evolving. Supabase may later hold published room state, ownership, revision history, and collaboration data; it should not replace these version-controlled generators and canonical scenes.

## Interaction contract

1. Every visible lesson-content element has `locked: false`.
2. Cards, headers, footers, tables, graphs, and drop zones use native Excalidraw elements. Do not flatten them into screenshots.
3. A compound object shares one group ID so a single click moves the whole object. Its text remains editable after entering the group.
4. A lesson frame is unlocked. Deleting a selected frame must also delete every child and its managed background.
5. Selecting every selectable child in one or more lesson frames and pressing Delete must produce the same full-frame cascade. This handles marquee selection without leaving empty frame shells.
6. Deleting a single card or arrow must delete only that item and clean reciprocal bindings.
7. Managed frame backgrounds are the only locked elements. They are an implementation layer and are removed by the deletion cascade, never left as user-facing remnants.
8. Header and footer attribution text is grouped for convenient movement but remains editable. Source credit stays in generated defaults.
9. Every lesson generator namespaces element and group IDs with its bundle ID so separately generated templates can coexist safely in one room.

The app-level implementation lives in:

- `src/app/whiteboard/whiteboard-template-contract.js`
- `src/app/whiteboard/whiteboard.js`
- `tools/whiteboard-template-contract-self-test.mjs`

## Scene order and layering

Use this order:

1. managed frame backgrounds
2. content for each frame
3. the corresponding Excalidraw frame

Within an interactive frame, create structural destinations before draggable cards. A true/false column therefore appears earlier than its statement cards; dragged cards stay visibly above the column.

New handwriting and annotations should be created above imported content. Avoid worksheet-style writing boxes unless a lesson specifically requires a bounded response object.

## Arrows and diagrams

- Arrows remain unlocked and selectable.
- When an arrow connects cards, use reciprocal Excalidraw bindings.
- Begin and end outside the target shapes: use an edge center or a slightly offset corner.
- Preserve at least 14 px of endpoint clearance.
- Prefer short, direct connectors. Avoid crossings and arrows through card interiors.
- Group diagrams such as axes, trend lines, points, and labels when the diagram should move as one object.

## Cards and drop zones

- Keep a card narrower than the destination it enters.
- Increase card height before reducing type size.
- Preserve at least 10 px of bottom padding beneath the lowest text line.
- Use fixed safe text widths and validate that text stays inside the largest containing rectangle of its group.
- A difficulty color is supporting information, not the sole label.
- Keep no more than six multiple-choice questions on one landscape frame.
- Preserve the source problem identifier on every adapted textbook card.
- Store hidden interaction answers in metadata rather than exposing them on the draggable face.

## Visual language

- A4-ratio landscape frames: 1123 × 794 scene units.
- Minimal, spacious, colorful classroom-whiteboard style.
- Bright pale fills, dark readable text, thin borders, consistent rounded corners.
- Small source line at the top; discreet licence footer.
- No decorative hero header and no simulated paper lines when the canvas grid already supplies structure.
- Use breathing room as a hard constraint; omit or split content before crowding a frame.

## Content and attribution

- Prioritize conceptual progression over exhaustive coverage.
- Adapt prose into editable text while preserving meaning.
- Avoid third-party images unless licensing and editability are both clear.
- Keep one source/licence footer per frame and one original problem reference per adapted question.
- Record selections and omissions in the lesson README.

## Required validation

From the repository root, run:

~~~powershell
node tools/generate-openstax-physics-ch01-whiteboard.mjs
node tools/generate-openstax-physics-ch02-whiteboard.mjs
node tools/whiteboard-template-contract-self-test.mjs
npm.cmd run test:adapters
~~~

The lesson generator must reject duplicate IDs, out-of-frame content, locked visible content, ungrouped single-member groups, text escaping grouped containers, missing question references, bad reciprocal arrow bindings, insufficient arrow clearance, wrong frame/question totals, raster images, and missing attribution footers.

Then import the generated scene into a fresh whiteboard room and verify:

- delete one card
- delete one arrow
- delete one frame with Delete
- delete several frames with Delete
- delete a selected frame from the context menu
- edit and move a header, footer, table, graph, and drop zone
- drag every true/false card over both columns
- draw above a frame and above a drop zone

## Starting a new Codex task

Use this handoff prompt:

> Continue the Kelp reusable-whiteboard work. First read `data/whiteboards/TEMPLATE_DESIGN_SYSTEM.md`, the relevant pilot README, and its generator. Preserve the interaction contract: all visible content editable, grouped compound objects, cascade frame deletion, cards above destinations, selectable bound arrows, source references, and generator validation. Then apply the new lesson specifications.

A new task can access the same workspace files but does not automatically retain all conversational rationale. The contract and generator are therefore the continuity mechanism.
