# OpenStax Physics · Chapter 1 pilot

Native Excalidraw/Kelp lesson bundle for a 60-minute high-school lesson on Chapter 1, **What Is Physics?**

## Bundle

The scene contains thirteen A4-ratio landscape frames:

1. guided draggable evidence sort
2. theory map: scope, scales, and applications
3. scientific methods and explanatory concepts
4. quantities, SI units, notation, and conversions
5. measurement quality and graph language
6. five draggable true/false statement cards with two sorting zones
7. six multiple-choice questions on foundations and scope
8. six multiple-choice questions on modern physics and applications
9. six multiple-choice questions on scientific methods and models
10. six multiple-choice questions on measurement, variables, and graphs
11. two adapted open-response problems
12. two adapted quantitative problems
13. exit ticket

The 33-question practice bank is deliberately larger than one live lesson. Use roughly 6–8 questions during the session and keep the remainder for tutor choice, homework, review, or a later variant.

## Selection notes

The theory frames prioritize the three chapter sections and the concepts needed to answer the selected practice: the reach of physics, classical versus modern regimes, scientific evidence and models, SI quantities and conversions, uncertainty, accuracy, precision, variables, and slope.

The multiple-choice bank contains 24 adapted, text-only questions from Chapter Review #1–#18 and Test Prep #39–#49. Image-dependent and unusually long items were omitted so every question remains legible, movable, and useful on a landscape frame. Each card retains its original source reference.

The rest of the practice bank includes:

- five original true/false statements for draggable sorting
- adapted Critical Thinking #21 and Extended Response #71, with answer choices omitted
- adapted Problems #36 and #37

Historical detail, extended tables, image-dependent questions, and peripheral examples were omitted to protect whitespace and conceptual progression.

## Design revision 3

- Every visible lesson object is unlocked and can be selected, edited, moved, or deleted.
- Compound objects are grouped: headers, footers, cards, drop zones, the SI table, and the measurement graph.
- Selecting a lesson frame and deleting it cascades to its children and managed background. Selecting every object in one or more frames does the same.
- Frame children precede their frame in scene order so new annotations are placed above existing content.
- True/false destinations precede the narrower, taller statement cards in scene order, keeping dragged cards above the columns.
- Concept-map arrows use reciprocal bindings, exterior edge ports, visible clearance, and remain selectable.
- Worksheet-style writing boxes and ruled lines stay out of the template because the Kelp canvas already supplies open working space and a grid.
- True/false answers remain in question metadata instead of appearing on the cards.

## Use

Import 'openstax-physics-ch01-lesson.excalidraw' from the Kelp whiteboard's open-file control. All lesson content is native Excalidraw data rather than flattened screenshots.

Regenerate and validate from the repository root:

~~~powershell
node tools/generate-openstax-physics-ch01-whiteboard.mjs
node tools/whiteboard-template-contract-self-test.mjs
~~~

Read 'data/whiteboards/TEMPLATE_DESIGN_SYSTEM.md' before deriving a new lesson bundle or continuing this work in a new Codex task.

Source: *Physics*, Chapter 1, Paul Peter Urone and Roger Hinrichs, OpenStax, © 2020 TEA. Licence: CC BY 4.0.
