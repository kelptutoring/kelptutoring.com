# Whiteboard library

This directory is the repository source of truth for reusable Kelp whiteboards.

## Directory shape

~~~text
data/whiteboards/
├── manifest.json
├── pilots/
│   └── <subject>/<lesson>/
└── templates/
    └── <template-family>/
~~~

- 'pilots/' contains lesson-specific boards used to refine a common design.
- 'templates/' is reserved for generalized bundles after several pilots converge.
- 'manifest.json' is a small discovery index; the native '.excalidraw' file remains the editable scene.
- Generator scripts live in 'tools/' so a board can be rebuilt and validated.
- 'TEMPLATE_DESIGN_SYSTEM.md' is the durable interaction and layout contract for this family.

Keep the repository copy authoritative while the format is evolving. Supabase can later store published scene records, ownership, revisions, and collaboration state without replacing this version-controlled library.

## Scene expectations

- Kelp scene wrapper ('type: "excalidraw"', version '2', source 'kelp-whiteboard')
- native Excalidraw elements rather than screenshots
- independently grouped lesson concepts and questions
- Kelp frame-background metadata
- source and licence attribution
- a generated scene must pass its generator's structural checks
- every visible lesson object is unlocked; managed backgrounds are removed through frame-cascade deletion
