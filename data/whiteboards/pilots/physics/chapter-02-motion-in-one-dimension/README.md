# OpenStax Physics · Chapter 2 pilot

Native Excalidraw/Kelp lesson bundle for a 60-minute high-school lesson on Chapter 2, **Motion in One Dimension**.

## Bundle

The scene contains thirteen A4-ratio landscape frames:

1. draggable scalar/vector exploration
2. reference frames, position, distance, and displacement
3. average and instantaneous speed and velocity
4. position vs. time graph language
5. velocity vs. time graph language
6. five draggable true/false statement cards with two sorting zones
7. six multiple-choice questions on reference frames and displacement
8. six multiple-choice questions on speed and velocity
9. six multiple-choice questions on position-time motion stories
10. six multiple-choice questions on velocity-time graphs and averages
11. two qualitative reference-frame problems
12. two quantitative motion problems
13. exit ticket

The 33-question bank is intentionally larger than one live lesson. Use roughly 6–8 items during the session and keep the remainder for tutor choice, homework, review, or another lesson variant.

## Selection notes

The theory sequence follows Sections 2.1–2.4: choose a reference frame, distinguish total path from change in position, distinguish speed from velocity, then translate motion between position-time and velocity-time graphs.

The 24 multiple-choice cards are adapted from Chapter Review, Critical Thinking, Check Your Understanding, Practice, Test Prep, and Short Answer items. Each card retains its original source reference.

The selection favors text-complete questions that remain meaningful when detached from the textbook page. Problems that depend on an unseen graph, map, or missing equation value were omitted from the movable multiple-choice bank. Representative numerical and qualitative problems were retained in the open-response and quantitative frames.

## Interaction and design

- Every visible lesson object is unlocked, editable, draggable, and deletable.
- Compound diagrams and cards are grouped.
- Scalar/vector and true/false destinations precede draggable cards in scene order.
- Draggable cards are narrower than their destinations.
- True/false cards preserve at least 10 px of bottom text padding.
- Bound arrows start and end outside card edges and remain selectable.
- Deleting one or several selected lesson frames cascades through their children and managed backgrounds.
- Source and licence footers remain editable.

## Use

Import `openstax-physics-ch02-lesson.excalidraw` from the Kelp whiteboard’s open-file control.

Regenerate and validate from the repository root:

~~~powershell
node tools/generate-openstax-physics-ch02-whiteboard.mjs
node tools/whiteboard-template-contract-self-test.mjs
npm.cmd run test:adapters
~~~

Source: *Physics*, Chapter 2, Paul Peter Urone and Roger Hinrichs, OpenStax, © 2020 TEA. Licence: CC BY 4.0.
