# Form Builder design reference

This document records the Form Builder as it renders today. It is a comparison baseline for aligning Kelp's builders; it is not a claim that every current value is the final shared design.

Values were checked against `form-builder.css`, the shared `../../styles/style.css`, and computed styles in the rendered builder at these viewports:

- Desktop: 1280 × 720.
- Compact: 680 × 900.
- Narrow: 480 × 900.

Unless stated otherwise, pixel conversions assume the current 16px root size.

## Global foundation

| Property | Current value |
| --- | --- |
| Font family | `Inter, sans-serif` |
| Root font size | 16px |
| Rendered base line height | 1.6 / 25.6px, inherited from the shared `.tracks-body` styles |
| Minimum page width | 320px |
| Builder body bottom margin | 80px |
| Main container width | 94% of the available width, maximum 1400px |
| Desktop header height | 72px |
| Header content gap | 24px |
| Desktop panel padding | 28px |
| Compact/narrow panel padding | 18px at `≤700px` |
| Panel radius | 14px |
| Panel shadow | `0 8px 24px rgba(33, 33, 33, 0.08)` |
| Panel bottom margin | 48px |
| Primary editor/card radius | 18px |
| Secondary surface radius | 10–12px |
| Control radius | 8–10px |
| Pill radius | 999px |

### Colour and motion tokens

| Token | Fallback value | Purpose |
| --- | --- | --- |
| `--kelp-primary` | `#00acc1` | Primary actions and highlights |
| `--kelp-primary-dark` | `#145c63` | Strong teal text |
| `--kelp-primary-soft` | `rgba(0, 172, 193, 0.1)` | Soft teal surfaces |
| `--kelp-secondary` | `#5fae63` | Library success and normal-flow accents |
| `--kelp-secondary-dark` | `#2d6b33` | Strong green text |
| `--kelp-secondary-soft` | `rgba(95, 174, 99, 0.12)` | Soft green surfaces |
| `--kelp-text` | `#212121` | Base text |
| `--kelp-text-workaround` | `#383838` | Current primary UI text |
| `--kelp-muted` | `rgba(33, 33, 33, 0.66)` | Descriptions and metadata |
| `--kelp-border` | `#e5ece8` | Default border |
| `--kelp-border-strong` | `#c9c9c9` | Inputs and stronger outlines |
| `--kelp-danger` | `#b53f3f` | Destructive actions/errors |
| `--kelp-warning` | `#8c6419` | Conditional-route warnings |
| `--kelp-motion` | `1.2s cubic-bezier(0.22, 1, 0.36, 1)` | Card entry/collapse baseline |

## Typography

The table records the winning rendered value, not merely the first declaration in the stylesheet.

| Element | CSS size | Rendered pixels | Weight | Notes |
| --- | ---: | ---: | ---: | --- |
| Header navigation link | 20px | 20px | 700 | 40px minimum height, 14px horizontal padding |
| Page kicker | `0.85rem` | 13.6px | 800 | 0.1em tracking, uppercase |
| Page title | `clamp(2rem, 4vw, 2.25rem)` | 36px desktop; 32px compact/narrow | 700 | 1.2 line height; 10px bottom margin |
| Intro copy | `0.91rem` | 14.56px | 400 | 1.6 rendered line height; 7px top margin |
| Section title (`h2`) | `1.3rem` | 20.8px | 700 | 1.2 line height |
| Block title (`h3`) | `1rem` | 16px | 700 | 1.25 line height |
| Block header description | `0.78rem` | 12.48px | 400 | 4px top margin |
| Field label | `0.84rem` | 13.44px | 700 | 7px label/control gap |
| Text input / textarea / select | inherited | 16px | 400 | 25.6px rendered line height |
| Field help | `0.76rem` | 12.16px | 400 | 1.5 line height |
| Identity item title | `0.88rem` | 14.08px | 700 | — |
| Identity item copy | `0.75rem` | 12px | 400 | 3px top margin |
| Checkbox control label | `0.76rem` | 12.16px | 700 | 7px control/text gap |
| Standard builder button | `0.84rem` | 13.44px | normally 700 | Later `.form-builder-btn` rule wins over the earlier `0.9rem` block-text declaration |
| Small button | `0.78rem` | 12.48px | 700 | 36px minimum height |
| Status/pill text | `0.74rem` | 11.84px | 700–800 | 28px minimum height |
| Live message | `0.8rem` | 12.8px | 600 | 20px minimum height |
| Context helper button | `0.75rem` | 12px | 800 | 24 × 24px |
| Context helper popover | `0.78rem` | 12.48px | 600 | 1.45 line height |
| Modal title | `1.25rem` | 20px | 700 | — |
| Modal description | `0.8rem` | 12.8px | 400 | maximum 520px |
| Modal step title | `1rem` | 16px | 700 | — |
| Modal step copy | `0.79rem` | 12.64px | 400 | 4px top margin |

## Page shell and primary layout

| Component | Padding | Gap/margin | Dimensions/radius |
| --- | --- | --- | --- |
| Header content | Actual computed `0`; see cascade notes | 24px between brand/nav | 72px desktop height |
| Header nav link | `0 14px` | — | 40px minimum height; 12px radius |
| Intro | none | 24px bottom | 900px maximum width |
| Main panel | 28px desktop; 18px `≤700px` | 28px rendered top margin; 48px bottom | 14px radius; 1400px maximum |
| Builder layout | none | 20px column/row gap | Open desktop: editor + `clamp(400px, 38vw, 620px)` preview; collapsed desktop: editor + 76px |
| Editor column | none | 16px vertical gap | `min-width: 0` |
| Meta/respondent/add-block card | 18px | internal headings typically 16px below | 18px radius |
| Section heading | none | 14px internal gap; 16px bottom margin | flex row, becomes column at `≤700px` |

At the measured 1280px desktop viewport:

- Main/panel width: approximately 1189px.
- Expanded layout columns: approximately 625px editor + 486px preview + 20px gap.
- Collapsed layout columns: approximately 1035px editor + 76px preview + 20px gap.

## Form controls

| Control | Size | Padding | Gap/radius |
| --- | --- | --- | --- |
| Input/select | 42px minimum height | `0 11px`; select reserves 34px on the right | 9px radius |
| Textarea | 90px minimum height | `10px 11px` | 9px radius |
| Two-column field grid | Two equal columns | none | 13px gap |
| Input group | content height | none | 7px gap |
| Identity list | content height | none | 10px gap |
| Identity row | approximately 71px desktop | 12px | 12px column gap; 10px radius |
| Identity options | content height | none | 9px flex gap |
| Native checkbox/radio | 16 × 16px in editor controls | 0 | Browser-native fill; no decorative square wrapper |
| Required-answer panel | approximately 65–71px | 11px | 10px gap; 10px radius |
| PDF answer-space panel | content height | 14px | internal grid starts 12px below; 10px radius |

At `≤700px`, field grids and identity rows become one column. The 13px and 10–12px gaps remain unchanged.

## Block cards

| Element | Padding | Gap/margin | Dimensions/radius |
| --- | --- | --- | --- |
| Block list | none | 12px vertical gap | — |
| Block card | none | — | 18px radius; 1px border |
| Block header | `15px 16px` | 14px header/actions gap | 78px minimum height |
| Block title row | none | 8px | wraps as needed |
| Expanded block body | 16px | direct children use 14px top separation | collapse animates padding to zero |
| Options box | 14px | 12px before option list | 10px radius |
| Option list | none | 8px | — |
| Option row | none | 8px | columns: 24px marker, flexible input, 34px remove button |
| Phase route summary | 14px | route list uses 7px | 10px radius; 4px phase accent border |

### Block actions

| Control | Dimensions | Padding | Gap/radius |
| --- | --- | --- | --- |
| Drag/up/down | 36 × 36px | 0 | 10px radius |
| Duplicate/maximize/remove | 38px minimum height | winning standard button size; visible horizontal padding is 12–14px depending on selector | 10px radius |
| Action group | content width | 0 | 10px grid gap |

Desktop action columns are three 36px controls followed by text-button columns. Question cards add the duplicate column. At `≤520px`, the group becomes three equal columns; each control expands to its grid-cell width and subsequent controls wrap to a second row.

Only one block body is expanded at a time. The open body uses 16px padding; collapsed bodies animate to zero vertical padding and zero grid height.

## Add-block card and bottom actions

| Element | Padding | Gap | Dimensions |
| --- | --- | --- | --- |
| Add-block card | 18px | 16px internal | 18px radius |
| Add-block grid | none | 10px | two columns desktop; one column `≤700px` |
| Add-block button | 12px | 11px icon/copy | 74px minimum height; 10px radius |
| Add icon | 0 | — | 32 × 32px circle |
| Bottom action area | 0 | `10px 12px` between row/utility column | desktop main column + 24px helper column |
| Primary action row | 0 | 8px | five equal columns desktop |
| Secondary action row | 0 | 8px | four equal columns desktop |
| Utility action row | 0 | 8px | two equal columns desktop |
| Bottom action button | `6px 12px` | — | 44px minimum height; 9px radius; 1.15 line height |

At `≤980px`, each action row uses `repeat(auto-fit, minmax(150px, 1fr))`. This produced three columns at 680px and two columns at 480px in the rendered audit.

## Live preview

### Dock and transition

| State | Current geometry |
| --- | --- |
| Expanded | 16px padding; 18px radius; sticky at 16px; maximum height `calc(100vh - 32px)` |
| Collapsed desktop | 76px column; 218px dock height; 12px padding |
| Collapsed toggle | 42 × 150px; 16px radius; label rotated 90° |
| Expanded toggle | 112 × 42px; 10px radius |
| Layout column transition | 2.35s cubic-bezier `(0.4, 0, 0.2, 1)` |
| Dock property transitions | 0.85–1.85s using the spring-like cubic-bezier `(0.16, 1, 0.3, 1)` |

The expanded preview is sticky/fixed while scrolling, and its bottom boundary is constrained to the bottom of the **Build the flow** block.

### Preview content

| Element | Font | Padding/gap | Radius/dimensions |
| --- | --- | --- | --- |
| Preview heading | 16px title; 12.16px copy | 14px column gap; 14px bottom margin | — |
| Preview paper | base 16px | 14px | 10px radius; scrollable |
| Inner preview page | base 16px | 18px | 12px radius |
| Form title | 18.56px / `1.16rem` | 14px form-header bottom margin | — |
| Audience | 11.2px / `0.7rem` | 4px top | — |
| Description | 12.16px / `0.76rem` | 9px top | — |
| Progress wrapper | 11.68px meta | 7px gap; 18px bottom margin | 10px track height; pill radius |
| Phase/page title | 16.8px / `1.05rem` | `4px 0 5px` margin | — |
| Phase question-count pill | 11.04px / `0.69rem` | `6px 9px` | pill radius |
| Question list | — | 15px | — |
| Question card | 13.12px label | 12px padding; 8px gap | 10px radius; white background |
| Preview text input | 11.84px | `0 9px` | 36px minimum height; 8px radius |
| Preview textarea | 11.84px | 9px | 92px minimum height; 8px radius |
| Preview choices | 12px | 8px | native 15 × 15px control |
| Terms panel | 11.68px | 12px | 10px radius |
| Preview primary CTA | 16px | 0 | 40px minimum height; 9px radius |
| Previous/next controls | standard builder button | 8px gap; 14px top margin | primary button minimum width 76px |

Phase colours affect the page gradient, progress fill, primary button, focus ring, and route accents. Question cards themselves remain white.

## Helpers and modals

### Context helpers

- Button: 24 × 24px, circular, 12px bold text.
- Popover: maximum 330px wide and `viewport - 24px` tall/wide.
- Popover padding: `10px 12px`.
- Popover text: 12.48px, weight 600, line height 1.45.
- Popover radius: 9px; shadow `0 10px 28px rgba(23, 53, 56, 0.24)`.
- Placement is computed in JavaScript so the helper stays inside the viewport.

### Base modal

| Element | Desktop | `≤700px` |
| --- | --- | --- |
| Viewport inset/padding | 20px | 12px |
| Base dialog width | maximum 680px | up to available width |
| Library width | maximum 780px | up to available width |
| Print width | maximum 860px | up to available width |
| Structure width | maximum 960px | up to available width |
| Dialog radius | 16px | 16px |
| Dialog max height | `min(760px, 100vh - 40px)` | `100vh - 24px` |
| Header padding | `20px 20px 16px` | 16px |
| Content padding | 20px | 16px |
| Content sibling gap | 16px | 16px |
| Footer padding | `14px 20px 20px` | `12px 16px 16px` |
| Footer button gap | 8px | 8px |

Common nested modal surfaces use 12–15px padding, 9–12px radius, and 8–16px gaps. The structure modal switches from two columns to one at `≤980px`.

## Responsive behavior

### `≤980px`

- Builder layout becomes one column.
- Preview stops being a side sticky column and becomes a normal stacked block.
- Expanded preview maximum height is 620px.
- Bottom action area becomes one column.
- Action rows auto-fit controls with a 150px minimum width.
- Structure modal content becomes one column.
- Collapsed preview becomes a 66px horizontal dock with 8px padding.

### `≤700px`

- Panel padding changes from 28px to 18px.
- Page title resolves to 32px.
- Header, section headings, block headers, preview headings, and modal headers stack vertically.
- Form field grids, add-block grid, number-condition grid, identity rows, library records, and print answer-space rows become one column.
- Modal shell uses 12px viewport padding; modal header/content use 16px.
- Preview paper maximum height is 520px.
- The card/editor gaps generally remain unchanged.

### `≤520px`

- Block action controls use a three-column equal-width grid.
- Drag/order/text buttons expand to their grid-cell width.
- Bottom action auto-fit produced two columns at the measured 480px viewport.

## Cascade findings to preserve during builder alignment

These are measured facts about the current page and likely sources of cross-builder mismatch:

1. `.tracks-body` wins over the plain `body` rule for line height. The rendered base line height is 1.6/25.6px, not the Form Builder file's declared 1.5/24px.
2. `.tracks-body .container { padding: 0; }` is more specific than `.form-builder-main` and `.form-builder-header-content`. Consequently, the Form Builder's declared main padding (`32px 0 56px`, compact `22px 0 36px`) and compact header padding (`13px 0`) do not win. The rendered header/main container padding is zero.
3. The rendered panel still receives a 28px top margin from the shared tracks panel styles. This is the visual separation currently replacing the losing main top padding.
4. The compact `.form-builder-container` width rule does not target the actual main/header elements, which use `container` plus Form Builder-specific classes. Their rendered width remains 94%, rather than `100% - 28px`.
5. `.form-builder-btn` appears later than `.form-builder-block-text-btn`; its `0.84rem` font size wins. Block text buttons render at 13.44px rather than the earlier declared 14.4px.

These should be resolved through shared, explicit builder-shell tokens before copying styles into the Exam Builder. Copying only the declarations would not reproduce the actual Form Builder rendering.

## Recommended shared builder tokens

When the Exam Builder alignment phase begins, extract a shared layer rather than duplicating selectors. A reasonable starting contract from the current rendered Form Builder is:

```css
:root {
  --builder-root-font-size: 16px;
  --builder-line-height: 1.6;
  --builder-container-max: 1400px;
  --builder-container-width: 94%;
  --builder-panel-padding: 28px;
  --builder-panel-padding-compact: 18px;
  --builder-card-padding: 18px;
  --builder-card-radius: 18px;
  --builder-section-gap: 16px;
  --builder-block-gap: 12px;
  --builder-field-gap: 13px;
  --builder-control-height: 42px;
  --builder-action-height: 44px;
  --builder-control-radius: 9px;
  --builder-page-title: clamp(2rem, 4vw, 2.25rem);
  --builder-section-title: 1.3rem;
  --builder-field-label: 0.84rem;
  --builder-button-font: 0.84rem;
}
```

Before adopting these globally, compare them with the Exam Builder and decide which values represent the desired Kelp standard. This document supplies the Form Builder side of that comparison.
