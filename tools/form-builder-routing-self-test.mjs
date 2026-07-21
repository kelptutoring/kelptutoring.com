import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const toolsRoot = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(toolsRoot, "..");
const formBuilderRoot = path.join(projectRoot, "src", "app", "form-builder");
const adapterPath = path.join(formBuilderRoot, "form-adapters.js");
const domainPath = path.join(formBuilderRoot, "form-domain.js");
const builderPath = path.join(formBuilderRoot, "form-builder.js");
const builderHtmlPath = path.join(formBuilderRoot, "form-builder.html");
const builderCssPath = path.join(formBuilderRoot, "form-builder.css");
const takerPath = path.join(formBuilderRoot, "form-taker.js");
const takerHtmlPath = path.join(formBuilderRoot, "form-taker.html");
const takerCssPath = path.join(formBuilderRoot, "form-taker.css");
const locationDataPath = path.join(formBuilderRoot, "form-location-data.js");
const dashboardHtmlPath = path.join(projectRoot, "src", "app", "dashboard", "tutor-dashboard.html");
const fixturePath = path.join(formBuilderRoot, "test-fixtures", "routing-cases.json");
const comprehensiveTemplatePath = path.join(formBuilderRoot, "test-fixtures", "comprehensive-five-phase-template.json");

const [
  adapterSource,
  domainSource,
  builderSource,
  builderHtml,
  builderCss,
  takerSource,
  takerHtml,
  takerCss,
  locationDataSource,
  dashboardHtml,
  fixtureText,
  comprehensiveTemplateText
] = await Promise.all([
  fs.readFile(adapterPath, "utf8"),
  fs.readFile(domainPath, "utf8"),
  fs.readFile(builderPath, "utf8"),
  fs.readFile(builderHtmlPath, "utf8"),
  fs.readFile(builderCssPath, "utf8"),
  fs.readFile(takerPath, "utf8"),
  fs.readFile(takerHtmlPath, "utf8"),
  fs.readFile(takerCssPath, "utf8"),
  fs.readFile(locationDataPath, "utf8"),
  fs.readFile(dashboardHtmlPath, "utf8"),
  fs.readFile(fixturePath, "utf8"),
  fs.readFile(comprehensiveTemplatePath, "utf8")
]);
new vm.Script(adapterSource, { filename: "form-adapters.js" });
new vm.Script(domainSource, { filename: "form-domain.js" });
new vm.Script(builderSource, { filename: "form-builder.js" });
new vm.Script(takerSource, { filename: "form-taker.js" });
new vm.Script(locationDataSource, { filename: "form-location-data.js" });
assert.ok(
  builderHtml.indexOf('src="form-adapters.js"') < builderHtml.indexOf('src="form-domain.js"')
    && builderHtml.indexOf('src="form-domain.js"') < builderHtml.indexOf('src="form-builder.js"'),
  "Form adapters and domain scripts must load before form-builder.js."
);
assert.ok(
  builderHtml.indexOf('href="../../styles/style.css"') < builderHtml.indexOf('href="form-builder.css"'),
  "The shared Kelp stylesheet must load before form-builder.css."
);
assert.ok(
  takerHtml.indexOf('src="form-adapters.js"') < takerHtml.indexOf('src="form-domain.js"')
    && takerHtml.indexOf('src="form-domain.js"') < takerHtml.indexOf('src="form-location-data.js"')
    && takerHtml.indexOf('src="form-location-data.js"') < takerHtml.indexOf('src="form-taker.js"'),
  "The persistence adapter, form domain, and location adapter must load before the form taker."
);
assert.match(takerHtml, /KelpFormProviderReady/);
assert.match(builderHtml, /Verify later: record that the connected platform should confirm an e-mail/);
assert.match(builderHtml, /Requiring state \/ province also requires country; requiring city also requires state \/ province and country/);
assert.match(builderHtml, /Country may be collected alone/);
assert.match(builderHtml, /State \/ province also collects country/);
assert.match(builderHtml, /City also collects state \/ province and country/);
assert.match(locationDataSource, /@countrystatecity\/countries-browser@1\.0\.2\/\+esm/);
assert.match(locationDataSource, /Countries States Cities Database/);
assert.match(locationDataSource, /ODbL 1\.0/);
assert.match(builderSource, /FormDomain\.updateIdentityFieldConfig\(/);
assert.match(takerSource, /function hydrateLocationSelectors\(\)/);
assert.match(takerSource, /function enableManualLocationFallback\(message\)/);
assert.match(builderHtml, /class="tracks-body gradient-background form-builder-body"/);
assert.match(builderHtml, /Kelp-logo-gpt\.png/);
assert.match(builderHtml, /href="\.\.\/dashboard\/tutor-dashboard\.html"/);
assert.doesNotMatch(builderHtml, /id="previewNavLink"|href="#preview"[^>]*>Preview</);
assert.equal((builderHtml.match(/class="form-builder-context-help/g) || []).length, 4);
assert.doesNotMatch(builderHtml, /class="form-builder-context-help"[^>]*title=/);
assert.ok(
  (builderHtml.match(/&#10;-/g) || []).length >= 10,
  "Context helpers must keep their guidance in deliberate line-by-line entries."
);
assert.match(builderHtml, /id="formBuilderLayout"[^>]*preview-collapsed|preview-collapsed" id="formBuilderLayout"/);
assert.match(builderHtml, /id="togglePreviewColumnBtn"/);
assert.match(builderHtml, /id="formBuilderEditor"/);
assert.match(builderHtml, /id="buildFlowTools"[^>]*aria-labelledby="add-block-heading"/);
assert.match(builderHtml, /id="formPreviewSticky"/);
assert.match(builderHtml, /id="previewPageCount">Step 1 of 1</);
assert.match(
  builderHtml,
  /form-builder-preview-title-line[\s\S]*?id="previewPageCount"[\s\S]*?form-builder-preview-heading-actions[\s\S]*?id="togglePreviewColumnBtn"/,
  "The step counter should live with the heading copy so the preview action rail only has to animate the toggle."
);
assert.match(builderHtml, />Import JSON</);
assert.match(builderHtml, /id="saveLibraryBtn"/);
assert.ok(
  builderHtml.indexOf('id="addQuestionActionBtn"') < builderHtml.indexOf('id="openStudentViewBtn"')
    && builderHtml.indexOf('id="openStudentViewBtn"') < builderHtml.indexOf('id="saveDraftBtn"')
    && builderHtml.indexOf('id="saveDraftBtn"') < builderHtml.indexOf('id="loadDraftBtn"')
    && builderHtml.indexOf('id="loadDraftBtn"') < builderHtml.indexOf('id="openStructureBtn"'),
  "The first action row must follow the exam-builder workflow order."
);
assert.ok(
  builderHtml.indexOf('id="exportJsonBtn"') < builderHtml.indexOf('for="importJsonInput"')
    && builderHtml.indexOf('for="importJsonInput"') < builderHtml.indexOf('id="saveLibraryBtn"')
    && builderHtml.indexOf('id="saveLibraryBtn"') < builderHtml.indexOf('id="printFormBtn"'),
  "The second action row must follow the exam-builder export, import, library, and print order."
);
assert.ok(
  builderHtml.indexOf('id="printFormBtn"') < builderHtml.indexOf('id="openLibraryBtn"')
    && builderHtml.indexOf('id="openLibraryBtn"') < builderHtml.indexOf('id="resetFormBtn"'),
  "Form-only library and reset actions must remain in their own utility row."
);
assert.match(builderHtml, />Export JSON</);
assert.match(builderHtml, />Save to local library</);
assert.match(builderHtml, new RegExp('>Print / save as PDF<'));
assert.match(builderHtml, /id="formLibraryModal"/);
assert.match(builderHtml, /id="formStructureModal"[^>]*aria-hidden="true"/);
assert.match(builderHtml, /id="formStructureContent"/);
assert.match(builderHtml, /id="formPrintModal"[^>]*aria-hidden="true"/);
assert.match(builderHtml, /id="formPrintContent"/);
assert.match(builderHtml, /data-print-action="prepare">Continue to PDF</);
assert.match(builderHtml, /id="formPrintDocument"[^>]*aria-hidden="true"/);
assert.match(builderSource, />Open as copy</);
assert.match(builderCss, /\.form-builder-layout\.preview-collapsed/);
assert.match(
  builderCss,
  /\.form-builder-layout\.is-preview-following \.form-builder-preview-sticky\s*\{[\s\S]*?position:\s*fixed/,
  "The expanded form preview must support viewport-following mode."
);
assert.match(
  builderCss,
  /\.form-builder-layout\.preview-collapsed \.form-builder-preview-toggle\s*\{[\s\S]*?width:\s*42px[\s\S]*?height:\s*150px/,
  "The resting preview control must match the exam builder rail geometry."
);
assert.match(
  builderCss,
  /\.form-builder-layout\s*\{[\s\S]*?grid-template-columns 2\.35s cubic-bezier\(0\.4, 0, 0\.2, 1\)/,
  "The preview column must use the exam builder's measured grid transition."
);
assert.match(
  builderCss,
  /\.form-builder-preview-column\s*\{[\s\S]*?width:\s*100%[\s\S]*?max-width:\s*none[\s\S]*?overflow:\s*hidden/,
  "The grid track must own preview resizing while the moving content stays clipped."
);
assert.match(
  builderCss,
  /\.form-builder-layout\.preview-collapsed \.form-builder-preview-column\s*\{[\s\S]*?width:\s*100%[\s\S]*?max-width:\s*none/,
  "The collapsed preview column must follow the rail track instead of running a second width animation."
);
assert.doesNotMatch(
  builderCss,
  /\.form-builder-layout\.is-preview-animating \.form-builder-preview-heading-actions\s*\{[\s\S]*?position:\s*absolute/,
  "The preview toggle must remain in the header grid while the panel opens."
);
assert.match(
  builderCss,
  /\.form-builder-layout\.is-preview-closing \.form-builder-preview-heading-actions\s*\{[\s\S]*?position:\s*absolute[\s\S]*?place-items:\s*center/,
  "The preview toggle must stay centred and visible while the panel closes."
);
assert.match(
  builderCss,
  /\.form-builder-layout\.is-preview-closing \.form-builder-preview-toggle\s*\{[\s\S]*?opacity:\s*1 !important[\s\S]*?visibility:\s*visible !important/,
  "The closing preview toggle must remain visible throughout the dock animation."
);
assert.match(
  builderCss,
  /\.form-builder-layout\.is-preview-closing \.form-builder-preview-heading > div:first-child,[\s\S]*?transition-duration:\s*0\.48s/,
  "Closing preview content must fade before the rail becomes narrow enough to ghost it."
);
assert.match(
  builderCss,
  /\.form-builder-layout\.preview-collapsed \.form-builder-paper,[\s\S]*?height:\s*0;[\s\S]*?max-height:\s*0;[\s\S]*?flex:\s*0 0 auto/,
  "Collapsed preview content must leave the dock layout so the toggle stays centered during the transition."
);
assert.match(
  builderCss,
  /\.form-builder-layout\.preview-collapsed \.form-builder-preview-sticky\s*\{[\s\S]*?display:\s*grid[\s\S]*?align-items:\s*center[\s\S]*?justify-items:\s*center/,
  "The collapsed preview rail must center its control without asymmetric padding."
);
assert.match(
  builderCss,
  /\.form-builder-preview-toggle\s*\{[\s\S]*?width 2\.35s cubic-bezier\(0\.16, 1, 0\.3, 1\)[\s\S]*?transform 1\.25s cubic-bezier\(0\.16, 1, 0\.3, 1\)/,
  "The preview control must morph and rotate with the exam builder timing."
);
assert.match(builderSource, /function togglePreviewColumn\(\)/);
assert.match(builderSource, /function setupContextHelp\(\)/);
assert.match(builderSource, /popover\.textContent = button\.dataset\.helpText/);
assert.match(
  builderCss,
  /\.form-builder-context-help-popover\s*\{[^}]*position:\s*fixed[^}]*width:\s*min\(330px, calc\(100vw - 24px\)\)[^}]*max-height:\s*calc\(100vh - 24px\)[^}]*overflow:\s*auto[^}]*white-space:\s*pre-line/,
  "Context helpers must preserve authored line breaks and stay inside the viewport."
);
assert.match(
  builderCss,
  /\.form-builder-action-row\s*\{[^}]*repeat\(5, minmax\(0, 1fr\)\)/,
  "The five primary actions must remain on one balanced row while the live preview is expanded."
);
assert.match(
  builderCss,
  /\.form-builder-action-row-secondary\s*\{[^}]*repeat\(4, minmax\(0, 1fr\)\)/,
  "The four secondary actions must remain on one balanced row while the live preview is expanded."
);
assert.match(
  builderCss,
  /\.form-builder-action-row-utilities\s*\{[^}]*repeat\(2, minmax\(0, 1fr\)\)/,
  "The form-only library and reset actions must remain in a separate balanced row."
);
assert.match(builderCss, /\.form-builder-print-dialog\s*\{[^}]*width:\s*min\(100%, 860px\)/);
assert.match(builderCss, /\.form-builder-print-route-list\s*\{[^}]*max-height:\s*280px[^}]*overflow:\s*auto/);
assert.match(builderCss, /\.form-builder-pdf-answer-setting\s*\{/);
assert.match(builderCss, /\.form-builder-print-question-space-row\s*\{/);
assert.match(
  builderCss,
  /@media print\s*\{[\s\S]*?\.form-builder-body\.is-printing-form > :not\(\.form-builder-print-document\)\s*\{[^}]*display:\s*none !important/,
  "Printing a form must hide the builder shell."
);
assert.match(builderSource, /function openFormStructure\(\)/);
assert.match(builderSource, /function renderFormStructure\(\)/);
assert.match(builderSource, /function renderStructureTree\(/);
assert.match(builderSource, /function openFormPrint\(\)/);
assert.match(builderSource, /FormDomain\.enumeratePrintableRoutes\(state\)/);
assert.match(builderSource, /PRINT_ANSWER_SPACE_SIZES_MM = Object\.freeze\(\{ small: 35, medium: 60, large: 95 \}\)/);
assert.match(builderSource, /function renderQuestionPdfAnswerSpace\(/);
assert.match(builderSource, /data-pdf-answer-space-size/);
assert.match(builderSource, /data-pdf-answer-custom-mm/);
assert.match(builderSource, /function renderPrintQuestionSpaceSummary\(/);
assert.match(builderSource, /function questionPrintAnswerSpaceHeightMm\(/);
assert.match(builderSource, /Specific distance \(mm\)/);
assert.match(builderSource, /function captureFormPrintScrollPosition\(\)/);
assert.match(builderSource, /function restoreFormPrintScrollPosition\(position\)/);
assert.match(builderSource, /focus\(\{ preventScroll: true \}\)/);
assert.match(builderSource, /addEventListener\('pointerdown', handlePrintInteractionStart, true\)/);
assert.match(builderSource, /data-print-question-space-summary/);
assert.match(builderSource, /function updatePrintRouteDetails\(\)/);
assert.match(builderSource, /@page \{ size: A4 portrait; margin: 14mm 14mm 16mm; \}/);
assert.match(builderSource, /function buildPrintableFormMarkup\(/);
assert.match(builderSource, /function buildPrintableStandaloneDocument\(/);
assert.match(builderSource, /function printSelectedFormRoute\(/);
assert.match(builderSource, /window\.print\(\)/);
assert.match(builderSource, /firstWrittenHeight = totalWrittenHeight > 180 \? 180 : totalWrittenHeight/);
assert.match(builderSource, /Question \$\{questionNumber\} - continued/);
assert.doesNotMatch(builderSource, /PDF rendering will be connected in phase 3/);
assert.match(domainSource, /function enumeratePrintableRoutes\(state, options = \{\}\)/);
assert.match(builderSource, /Respondent hierarchy/);
assert.match(builderSource, /Routing relationships/);
assert.match(builderSource, /Total blocks/);
assert.match(builderSource, /'is-preview-animating', willCollapse \? 'is-preview-closing' : 'is-preview-opening'/);
assert.match(builderSource, /prefers-reduced-motion: reduce/);
assert.match(builderSource, /function updatePreviewFollowing\(\)/);
assert.match(builderSource, /function getPreviewBoundaryElement\(\)/);
assert.match(
  builderSource,
  /function observePreviewBoundary\(\)[\s\S]*?new window\.ResizeObserver\(schedulePreviewFollowingUpdate\)[\s\S]*?observer\.observe\(els\.editor\)/,
  "The Build the flow boundary must be recalculated while the editor changes height."
);
assert.match(builderSource, /buildFlowTools:\s*document\.getElementById\('buildFlowTools'\)/);
assert.match(
  builderSource,
  /return els\.buildFlowTools \|\| els\.blockList \|\| els\.editor \|\| els\.layout/,
  "The preview boundary must use the bottom of the complete Build the flow card."
);
assert.match(
  builderSource,
  /const previewBottom = Math\.min\(window\.innerHeight - followInset, boundaryRect\.bottom\)/,
  "The following preview must stop when it reaches the Build the flow boundary."
);
assert.match(builderSource, /--preview-boundary-height/);
assert.match(
  builderCss,
  /\.form-builder-layout:not\(\.preview-collapsed\) \.form-builder-preview-column\s*\{[\s\S]*?height:\s*var\(--preview-boundary-height, auto\)/,
  "The preview column must end at Build the flow so native sticky positioning cannot continue into the editor action controls."
);
assert.match(builderSource, />↕<\/button>/);
assert.match(builderSource, />Duplicate<\/button>/);
assert.match(builderSource, /block\.collapsed \? 'Maximize' : 'Minimize'/);
assert.doesNotMatch(builderSource, />⠿<\/button>|>⧉<\/button>/);
assert.match(builderSource, /FormDomain\.buildRespondentSteps\(state\)/);
assert.equal(
  (builderSource.match(/data-appearance-field=/g) || []).length,
  1,
  "Phase appearance must expose one editable colour."
);
assert.match(builderSource, /data-appearance-field="backgroundColor"/);
assert.doesNotMatch(builderSource, /data-appearance-field="(?:stripeColor|selectionColor)"/);
assert.match(builderSource, /aria-label="Collect \$\{escapeAttribute\(info\.label\)\}"/);
assert.match(builderSource, /aria-label="Require \$\{escapeAttribute\(info\.label\)\}"/);
assert.match(takerSource, /formDomain\.stepsForRouteSnapshot\(formState, snapshot, snapshotIndex\)/);
assert.match(builderSource, /window\.addEventListener\?\.\('scroll', schedulePreviewFollowingUpdate/);
assert.match(builderCss, /--kelp-primary:\s*var\(--color-primary/);
assert.match(
  builderCss,
  /\.form-builder-header-content\s*\{[^}]*font-size:\s*20px/,
  "The form-builder header must use the same 20px type scale as the exam builder."
);
assert.match(
  builderCss,
  /\.form-builder-nav a\s*\{[^}]*font-size:\s*20px/,
  "The Dashboard link must match the exam-builder navigation size."
);
assert.match(
  builderCss,
  /\.form-builder-preview-choice input\s*\{[^}]*min-height:\s*0[^}]*accent-color:\s*auto/,
  "Preview answer controls must stay compact and use the browser's lighter native-blue selection state."
);
assert.match(
  builderCss,
  /\.form-builder-preview-consent input\s*\{[^}]*min-height:\s*0[^}]*flex:\s*0 0 15px/,
  "The preview consent checkbox must stay aligned with the first line of its label."
);
assert.match(
  builderCss,
  /\.form-builder-preview-phase \.form-builder-preview-choice input:focus\s*\{[^}]*box-shadow:\s*none/,
  "Clicking a preview option must not reuse the text-field focus square."
);
assert.match(builderCss, /\.form-builder-preview-choice input:focus-visible\s*\{[^}]*outline:\s*none/);
assert.match(
  builderCss,
  /\.form-builder-body input:is\(\[type="checkbox"\], \[type="radio"\]\)\s*\{[^}]*appearance:\s*auto[^}]*min-height:\s*0[^}]*box-shadow:\s*none[^}]*accent-color:\s*auto/,
  "Builder selection controls must stay compact and use the browser's lighter native-blue selection state."
);
assert.match(builderCss, /\.form-builder-modal-content input:not\(\[type="checkbox"\]\):not\(\[type="radio"\]\)/);
assert.match(
  builderCss,
  /\.form-builder-check-control input:focus\s*\{[^}]*border-color:\s*transparent[^}]*box-shadow:\s*none/,
  "Respondent-detail checkbox clicks must not reuse the shared text-field focus square."
);
assert.match(builderCss, /\.form-builder-check-control input:focus-visible\s*\{[^}]*outline:\s*none/);
assert.match(builderSource, /card\.classList\.add\(placement === 'before' \? 'is-drop-before' : 'is-drop-after'\)/);
assert.match(builderSource, /function getDropPlacement\(card, clientY\)/);
assert.match(builderSource, /window\.confirm\('Remove this question\?'\)/);
assert.match(builderSource, /if \(!confirmBlockRemoval\(block\)\) return/);
assert.doesNotMatch(builderSource, /is-drop-target/);
assert.match(
  builderCss,
  /\.form-builder-block-card\.is-drop-before::before,[\s\S]*?\.form-builder-block-card\.is-drop-after::after\s*\{[\s\S]*?height:\s*4px[\s\S]*?background:\s*var\(--kelp-primary\)/,
  "Drag placement must use directional cue lines instead of highlighting the target card."
);
assert.doesNotMatch(builderCss, /\.form-builder-block-card\.is-drop-target/);
assert.match(
  builderCss,
  /@media \(max-width: 700px\)[\s\S]*?\.form-builder-block-header h3\s*\{[^}]*max-width:\s*100%[^}]*white-space:\s*normal[^}]*overflow-wrap:\s*anywhere/,
  "Compact question titles must wrap instead of clipping outside their cards."
);
assert.match(
  builderCss,
  /\.form-builder-block-actions\.has-duplicate\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3, 36px\) minmax\(82px, auto\) minmax\(94px, auto\) minmax\(74px, auto\)/,
  "Question block controls must use the exam-builder control grid."
);
assert.match(
  builderCss,
  /\.form-builder-block-order-btn\s*\{[\s\S]*?width:\s*36px[\s\S]*?height:\s*36px/,
  "Ordering controls must match the exam builder's 36px square geometry."
);
assert.ok(
  takerHtml.indexOf('src="form-domain.js"') < takerHtml.indexOf('src="form-taker.js"'),
  "The form domain must load before the dedicated form taker."
);
assert.ok(
  takerHtml.indexOf('href="../../styles/style.css"') < takerHtml.indexOf('href="form-taker.css"'),
  "The shared Kelp stylesheet must load before form-taker.css."
);
assert.match(takerHtml, /id="app"/);
assert.match(takerHtml, /Kelp-logo-gpt\.png/);
assert.match(takerHtml, /<body class="tracks-body gradient-background form-taker-body">/);
assert.match(takerHtml, /<header class="tracks-header form-taker-header">/);
assert.match(takerHtml, /class="container tracks-header-content"/);
assert.match(takerHtml, /class="tracks-logo"/);
assert.match(takerHtml, /<nav class="tracks-nav" aria-label="Form navigation">[\s\S]*?>Dashboard</);
assert.doesNotMatch(takerHtml, /form-taker-brand/);
assert.match(takerCss, /\.form-taker-card/);
assert.match(takerSource, /document\.body\.classList\.toggle\('is-phase-page'/);
assert.match(takerCss, /\.form-taker-body\.is-phase-page\s*\{[^}]*--phase-page-soft/);
assert.match(takerCss, /\.form-progress-meta\s*\{[^}]*justify-content:\s*space-between/);
assert.match(takerCss, /\.form-progress-track\s*\{[^}]*height:\s*12px/);
assert.match(takerCss, /\.form-taker-body\.is-phase-page \.form-progress-fill\s*\{[^}]*--phase-selection/);
assert.match(takerSource, /function projectedRouteSnapshots\(\)/);
assert.match(takerSource, /function projectedQuestionIds\(\)/);
assert.match(
  takerCss,
  /\.phase-theme \.question\s*\{[^}]*background:\s*#fff/,
  "Student question cards must remain white on coloured phase pages."
);
assert.match(
  takerCss,
  /\.phase-theme \.question:hover\s*\{[^}]*background:\s*#fff/,
  "Hovering a student question must not tint its white card with the phase colour."
);
assert.match(
  builderCss,
  /\.form-builder-preview-phase \.form-builder-preview-question\s*\{[^}]*background:\s*#fff/,
  "Live-preview question cards must remain white on coloured phase pages."
);
assert.match(
  builderCss,
  /\.form-builder-preview-phase \.form-builder-preview-question:hover\s*\{[^}]*background:\s*#fff/,
  "Live-preview hover must preserve the white question surface."
);
assert.match(builderCss, /\.form-builder-preview-page-card\s*\{[^}]*background:\s*rgba\(255, 255, 255, 0\.96\)/);
assert.match(builderCss, /\.form-builder-preview-sticky\.is-phase-page \.form-builder-paper\s*\{[^}]*--phase-page-soft/);
assert.match(
  takerCss,
  /\.form-taker-shell\s*\{[\s\S]*?max-width:\s*720px[\s\S]*?background:\s*transparent[\s\S]*?box-shadow:\s*none/,
  "The dedicated form must use the same full-width platform header and transparent content shell as the exam taker."
);
assert.match(
  takerCss,
  /\.form-taker-card input:is\(\[type="checkbox"\], \[type="radio"\]\)\s*\{[^}]*appearance:\s*auto[^}]*min-height:\s*0[^}]*accent-color:\s*auto/,
  "Student answer controls must stay compact and use the browser's lighter native-blue selection state."
);
assert.match(
  takerCss,
  /\.consent input\s*\{[^}]*margin:\s*2px 0 0/,
  "The student consent checkbox must stay aligned with the first line of its label."
);
assert.match(
  takerCss,
  /\.form-taker-card \.choice input:focus,[\s\S]*?\.form-taker-card \.consent input:focus\s*\{[^}]*box-shadow:\s*none/,
  "Student option and consent clicks must not reuse the text-field focus square."
);
assert.match(
  takerCss,
  /\.form-taker-card \.choice input:focus-visible,[\s\S]*?\.form-taker-card \.consent input:focus-visible\s*\{[^}]*outline:\s*none/,
  "Checked student controls must show only their native filled selection state."
);
assert.match(
  builderSource,
  /\.choice input,\.consent input\{appearance:auto;-webkit-appearance:auto;min-width:16px;min-height:0;[^}]*accent-color:auto\}/,
  "Standalone preview exports must preserve compact respondent controls."
);
assert.match(builderSource, /window\.open\(`\.\/form-taker\.html\?session=/);
assert.doesNotMatch(
  builderSource.match(/function openStudentView\(\)\s*\{[\s\S]*?\n  \}/)?.[0] || '',
  /document\.(?:open|write|close)/,
  "Student view must open the dedicated taker page instead of writing a generated document."
);
assert.match(builderSource, /kelp:form-taker:v1:active/);
assert.match(builderSource, /kelp:form-taker:ready/);
assert.match(builderSource, /kelp:form-taker:load/);
assert.match(takerSource, /event\.source !== openerWindow/);
assert.match(takerSource, /window\.opener = null/);
assert.match(
  dashboardHtml,
  /href="\.\.\/form-builder\/form-builder\.html"[^>]*>[\s\S]*?Form builder/,
  "The tutor workspace must expose the form builder entry point."
);
assert.match(builderHtml, /id="formSubmissionMode"/, "The builder must expose the submission policy.");
assert.match(
  builderSource,
  /state = FormDomain\.cloneFormDefinition\(imported\)/,
  "JSON imports must use copy-on-import semantics."
);
const fixtures = JSON.parse(fixtureText);
const comprehensiveTemplate = JSON.parse(comprehensiveTemplateText);

assert.equal(fixtures.schema, "kelp-form-routing-characterization-v1");
assert.ok(Array.isArray(fixtures.cases));
assert.ok(fixtures.cases.length >= 6, "Expected fixtures for every protected routing behavior.");

const domainRuntime = createDomainRuntime(domainSource);
verifyDomainFactories(domainRuntime);
verifyDomainNormalization(domainRuntime);
verifyDocumentIdentityAndCloning(domainRuntime, fixtures);
verifySubmissionContract(domainRuntime, fixtures);
verifyRespondentValidation(domainRuntime);
verifyComprehensiveTemplate(domainRuntime, comprehensiveTemplate);

const builderRuntime = createBuilderRuntime(adapterSource, domainSource, builderSource);
const defaultBlockControlMarkup = builderRuntime.blockControlMarkup();
const dragControlMarkup = defaultBlockControlMarkup.match(/<button[\s\S]*?form-builder-drag-handle[\s\S]*?<\/button>/g) || [];
assert.equal(dragControlMarkup.length, 5);
assert.equal((defaultBlockControlMarkup.match(/title="This page keeps its fixed position"/g) || []).length, 2);
assert.equal((defaultBlockControlMarkup.match(/data-action="duplicate"/g) || []).length, 2);
assert.equal((defaultBlockControlMarkup.match(/data-action="toggle"/g) || []).length, 5);
assert.equal((defaultBlockControlMarkup.match(/>Maximize<\/button>/g) || []).length, 5);
assert.equal((defaultBlockControlMarkup.match(/data-action="remove"/g) || []).length, 5);
assert.equal((defaultBlockControlMarkup.match(/data-block-kind="question"/g) || []).length, 2);
assert.equal((defaultBlockControlMarkup.match(/data-pdf-answer-space-size/g) || []).length, 1);
assert.match(defaultBlockControlMarkup, /data-pdf-answer-space-size>[\s\S]*?<option value="medium" selected>Medium block<\/option>/);
assert.match(defaultBlockControlMarkup, /data-pdf-answer-custom-mm/);
assert.match(builderSource, /if \(block\.collapsed\) expandBlockExclusively\(block\.id\)/);
assert.match(builderSource, /function expandBlockExclusively\(blockId\)/);
assert.match(builderSource, /state\.blocks\.forEach\(\(candidate\) => setBlockCollapsed\(candidate, candidate\.id !== blockId\)\)/);
assert.match(builderSource, /const isShortAnswer = question\.type === 'short-answer'/);
assert.match(builderSource, /isShortAnswer \? '' : `[\s\S]*?<option value="medium"/);
assert.equal(builderRuntime.confirmRemovalForTest("question", false), false);
assert.equal(builderRuntime.confirmRemovalForTest("question", true), true);
assert.equal(builderRuntime.confirmRemovalForTest("phase", false), true);
assert.equal(builderRuntime.dropPlacementForTest({ top: 100, height: 100 }, 149), "before");
assert.equal(builderRuntime.dropPlacementForTest({ top: 100, height: 100 }, 150), "after");
assert.equal(builderRuntime.dropInsertionForTest(1, 3, "before"), 2);
assert.equal(builderRuntime.dropInsertionForTest(1, 3, "after"), 3);
assert.equal(builderRuntime.dropInsertionForTest(3, 1, "before"), 1);
assert.deepEqual(
  toPlainValue(builderRuntime.exclusiveExpansionForTest(1)).map((block) => block.collapsed),
  [true, false, true, true, true]
);
assert.deepEqual(
  toPlainValue(builderRuntime.exclusiveExpansionForTest(3)).map((block) => block.collapsed),
  [true, true, true, false, true],
  "Opening a block must collapse the previously expanded block."
);
assert.doesNotMatch(defaultBlockControlMarkup, /⠿|⧉/);
builderRuntime.markPreviewFollowingForTest();
builderRuntime.setPreviewCollapsedForTest(true);
assert.deepEqual(toPlainValue(builderRuntime.previewState()), {
  collapsed: true,
  expanded: "false",
  toggleState: "collapsed",
  following: false
});
builderRuntime.setPreviewCollapsedForTest(false);
assert.deepEqual(toPlainValue(builderRuntime.previewState()), {
  collapsed: false,
  expanded: "true",
  toggleState: "open",
  following: false
});
const studentViewLaunch = toPlainValue(builderRuntime.openStudentViewForTest());
assert.match(studentViewLaunch.url, /^\.\/form-taker\.html\?session=student-view-/);
assert.equal(studentViewLaunch.handoff.schema, "kelp-form-taker-handoff-v1");
assert.equal(studentViewLaunch.handoff.sessionId, studentViewLaunch.sessionId);
assert.ok(Array.isArray(studentViewLaunch.handoff.form.blocks));
const shortAnswerControlState = JSON.parse(JSON.stringify(studentViewLaunch.handoff.form));
const shortAnswerControlQuestion = shortAnswerControlState.blocks.find((block) => block.type === "long-answer");
shortAnswerControlQuestion.type = "short-answer";
shortAnswerControlQuestion.pdfAnswerSpace = { size: "medium", customMm: 60 };
builderRuntime.loadState(shortAnswerControlState);
const shortAnswerControlMarkup = builderRuntime.blockControlMarkup();
assert.equal((shortAnswerControlMarkup.match(/data-pdf-answer-space-size/g) || []).length, 1);
assert.match(shortAnswerControlMarkup, /form-builder-pdf-answer-grid is-short-answer/);
assert.match(shortAnswerControlMarkup, /<option value="small" selected>Small block<\/option>/);
assert.doesNotMatch(shortAnswerControlMarkup, /<option value="medium"/);
assert.doesNotMatch(shortAnswerControlMarkup, /data-pdf-answer-custom-mm/);
builderRuntime.loadState(studentViewLaunch.handoff.form);
const handoffMessages = toPlainValue(builderRuntime.signalStudentViewReadyForTest(studentViewLaunch.sessionId));
assert.equal(handoffMessages.length, 1);
assert.equal(handoffMessages[0].message.type, "kelp:form-taker:load");
assert.equal(handoffMessages[0].message.sessionId, studentViewLaunch.sessionId);
const defaultStudentRuntime = createStudentRuntime(takerSource, domainSource, adapterSource, studentViewLaunch.handoff.form);
const defaultStepDescriptors = toPlainValue(defaultStudentRuntime.stepDescriptorsForRoute({}));
const defaultPreviewDescriptors = toPlainValue(builderRuntime.previewStepDescriptors());
assert.deepEqual(
  defaultPreviewDescriptors,
  defaultStepDescriptors,
  "Builder preview and form taker must use the same respondent-step contract."
);
assert.deepEqual(
  defaultStepDescriptors.map((step) => step.kind),
  ["privacy", "identity", "question", "phase-intro", "question", "goodbye"],
  "The respondent flow must separate identity, phase introduction, and individual question steps."
);
assert.equal(defaultStepDescriptors.filter((step) => step.kind === "question").length, 2);
assert.ok(defaultStepDescriptors.every((step) => step.kind !== "question" || step.questionId));
const defaultQuestions = studentViewLaunch.handoff.form.blocks.filter((block) => block.kind === "question");
const defaultPhase = studentViewLaunch.handoff.form.blocks.find((block) => block.kind === "phase");
assert.equal(
  defaultStepDescriptors.findIndex((step) => step.id === `phase-intro:phase-page-${defaultPhase.id}`) + 1,
  defaultStepDescriptors.findIndex((step) => step.id === `question:${defaultQuestions[1].id}`),
  "A phase introduction must immediately precede its first question."
);
const identityPreviewMarkup = builderRuntime.previewMarkupForStep("respondent-details");
assert.match(identityPreviewMarkup, /About you/);
assert.doesNotMatch(identityPreviewMarkup, /class="form-builder-preview-question"/);
const phaseIntroPreviewMarkup = builderRuntime.previewMarkupForStep(`phase-intro:phase-page-${defaultPhase.id}`);
assert.match(phaseIntroPreviewMarkup, /Next section/);
assert.match(
  phaseIntroPreviewMarkup,
  /form-builder-preview-phase-title-row[\s\S]*?form-builder-preview-page-title[\s\S]*?form-builder-preview-question-count[\s\S]*?form-builder-preview-page-copy/,
  "The live preview must place the phase question count beside its title."
);
assert.doesNotMatch(phaseIntroPreviewMarkup, /class="form-builder-preview-question"/);
assert.doesNotMatch(phaseIntroPreviewMarkup, /role="progressbar"/);
assert.match(
  defaultStudentRuntime.markupAtStep(`phase-intro:phase-page-${defaultPhase.id}`, {}),
  /phase-title-row[\s\S]*?page-title[\s\S]*?phase-question-count[\s\S]*?page-copy/,
  "The dedicated form must place the phase question count beside its title."
);
assert.equal(defaultStudentRuntime.progressMarkupAtStep("privacy", {}), "");
assert.equal(defaultStudentRuntime.progressMarkupAtStep(`phase-intro:phase-page-${defaultPhase.id}`, {}), "");
for (const [questionIndex, question] of defaultQuestions.entries()) {
  const questionMarkup = builderRuntime.previewMarkupForStep(`question:${question.id}`);
  assert.equal((questionMarkup.match(/class="form-builder-preview-question"/g) || []).length, 1);
  assert.match(questionMarkup, /role="progressbar"/);
  assert.match(questionMarkup, new RegExp(`Question ${questionIndex + 1} of 2`));
  assert.match(questionMarkup, /0 answered/);
}
assert.match(
  defaultStudentRuntime.progressMarkupAtStep(`question:${defaultQuestions[1].id}`, {}),
  /Question 2 of 2[\s\S]*?0 answered[\s\S]*?aria-valuemax="2" aria-valuenow="0"/
);
assert.match(
  defaultStudentRuntime.progressMarkupAtStep(`question:${defaultQuestions[1].id}`, {
    [defaultQuestions[1].id]: "A thoughtful response"
  }),
  /Question 2 of 2[\s\S]*?1 answered[\s\S]*?aria-valuemax="2" aria-valuenow="1"/
);
const defaultPrintableCatalog = toPlainValue(builderRuntime.printableRouteCatalog());
assert.equal(defaultPrintableCatalog.routes.length, 1);
const defaultPrintableDocument = builderRuntime.printableDocumentForTest(defaultPrintableCatalog.routes[0].id);
assert.match(defaultPrintableDocument, /@page \{ size: A4 portrait; margin: 14mm 14mm 16mm; \}/);
assert.match(defaultPrintableDocument, /Privacy Notice and Data Use Terms/);
assert.match(defaultPrintableDocument, /Respondent details/);
assert.match(defaultPrintableDocument, /Full name \*/);
assert.equal((defaultPrintableDocument.match(/class="form-builder-print-question"/g) || []).length, 2);
assert.match(defaultPrintableDocument, /Question 1/);
assert.match(defaultPrintableDocument, /Question 2/);
assert.match(defaultPrintableDocument, /--print-answer-height:60mm/);
assert.doesNotMatch(defaultPrintableDocument, /<script/);

const comprehensiveStudentRuntime = createStudentRuntime(takerSource, domainSource, adapterSource, comprehensiveTemplate);
const fullConditionalAnswers = {
  "question-profile-confidence": "option-confidence-support",
  "question-review-difficulty": "8"
};
const shortConditionalAnswers = {
  "question-profile-confidence": "option-confidence-high",
  "question-review-difficulty": "4"
};
assert.match(
  comprehensiveStudentRuntime.progressMarkupAtStep("question:question-support-style", fullConditionalAnswers),
  /Question 5 of 20/,
  "The first question on a jumped-to branch must follow the four questions already shown."
);
assert.match(
  comprehensiveStudentRuntime.progressMarkupAtStep("question:question-environment-quiet", fullConditionalAnswers),
  /Question 9 of 20/,
  "A resumed normal phase must continue the respondent-visible sequence instead of using its source position."
);
assert.match(
  comprehensiveStudentRuntime.progressMarkupAtStep("question:question-review-pace", fullConditionalAnswers),
  /Question 13 of 20/
);
assert.match(
  comprehensiveStudentRuntime.progressMarkupAtStep("question:question-review-pace", shortConditionalAnswers),
  /Question 9 of 12/,
  "Changing the route must recalculate both the visible ordinal and the projected route total."
);
const perQuestionPrintTemplate = JSON.parse(JSON.stringify(comprehensiveTemplate));
const perQuestionPrintBlocks = new Map(perQuestionPrintTemplate.blocks.map((block) => [block.id, block]));
perQuestionPrintBlocks.get("question-profile-topic").pdfAnswerSpace = { size: "small", customMm: 35 };
perQuestionPrintBlocks.get("question-environment-routine").pdfAnswerSpace = { size: "large", customMm: 95 };
builderRuntime.loadState(perQuestionPrintTemplate);
const comprehensivePrintCatalog = toPlainValue(builderRuntime.printableRouteCatalog());
const shortestPrintableRoute = comprehensivePrintCatalog.routes[0];
const longestPrintableRoute = comprehensivePrintCatalog.routes.at(-1);
const shortestPrintableDocument = builderRuntime.printableDocumentForTest(shortestPrintableRoute.id);
const longestPrintableDocument = builderRuntime.printableDocumentForTest(longestPrintableRoute.id);
const maximumAnswerSpaceTemplate = JSON.parse(JSON.stringify(perQuestionPrintTemplate));
maximumAnswerSpaceTemplate.blocks
  .filter((block) => block.kind === "question" && block.type === "long-answer")
  .forEach((question) => {
    question.pdfAnswerSpace = { size: "custom", customMm: 260 };
  });
builderRuntime.loadState(maximumAnswerSpaceTemplate);
const maximumAnswerSpaceCatalog = toPlainValue(builderRuntime.printableRouteCatalog());
const maximumAnswerSpaceDocument = builderRuntime.printableDocumentForTest(maximumAnswerSpaceCatalog.routes.at(-1).id);
assert.equal((shortestPrintableDocument.match(/class="form-builder-print-question"/g) || []).length, 12);
assert.doesNotMatch(shortestPrintableDocument, /3\. Guided support branch/);
assert.doesNotMatch(shortestPrintableDocument, /5\. Priority follow-up/);
assert.equal((longestPrintableDocument.match(/class="form-builder-print-question"/g) || []).length, 20);
assert.match(longestPrintableDocument, /3\. Guided support branch/);
assert.match(longestPrintableDocument, /5\. Priority follow-up/);
assert.match(longestPrintableDocument, /--print-answer-height:35mm/);
assert.match(longestPrintableDocument, /--print-answer-height:95mm/);
assert.equal((maximumAnswerSpaceDocument.match(/Question \d+ - continued/g) || []).length, 3);
assert.match(maximumAnswerSpaceDocument, /--print-answer-height:180mm/);
assert.match(maximumAnswerSpaceDocument, /--print-answer-height:80mm/);
assert.doesNotMatch(maximumAnswerSpaceDocument, /form-builder-print-paper-footer/);
assert.equal(
  toPlainValue(defaultStudentRuntime.validateStep("respondent-details", {})).valid,
  false,
  "Required respondent details must be validated on their own step."
);
assert.equal(
  toPlainValue(defaultStudentRuntime.validateStep("respondent-details", { "identity-fullName": "Ana Silva" })).valid,
  true
);
assert.equal(
  toPlainValue(defaultStudentRuntime.validateStep(`question:${defaultQuestions[0].id}`, { "identity-fullName": "Ana Silva" })).valid,
  false,
  "A required question must be validated before the next question is shown."
);
const validDefaultAnswers = {
  "identity-fullName": "Ana Silva",
  [defaultQuestions[0].id]: defaultQuestions[0].options[0].id
};
assert.equal(
  toPlainValue(defaultStudentRuntime.validateStep(`question:${defaultQuestions[0].id}`, validDefaultAnswers)).valid,
  true
);
defaultStudentRuntime.positionAtStep(`phase-intro:phase-page-${defaultPhase.id}`, validDefaultAnswers);
assert.equal(toPlainValue(defaultStudentRuntime.nextStep()).kind, "question");
assert.equal(toPlainValue(defaultStudentRuntime.previousStep()).kind, "phase-intro");
const locationForm = toPlainValue(studentViewLaunch.handoff.form);
locationForm.meta.respondentDetails.country = { enabled: true, required: true, verify: false };
locationForm.meta.respondentDetails.state = { enabled: true, required: true, verify: false };
locationForm.meta.respondentDetails.city = { enabled: true, required: true, verify: false };
builderRuntime.loadState(locationForm);
const locationPreviewMarkup = builderRuntime.previewMarkupForStep("respondent-details");
assert.match(locationPreviewMarkup, />Country\s*<span class="form-builder-required-star">\*<\/span>/);
assert.match(locationPreviewMarkup, /aria-label="Country" autocomplete="country-name"><option>Select a country<\/option>/);
assert.match(locationPreviewMarkup, />State \/ province\s*<span class="form-builder-required-star">\*<\/span>/);
assert.match(locationPreviewMarkup, /aria-label="State \/ province" autocomplete="address-level1"><option>Select a state \/ province<\/option>/);
assert.match(locationPreviewMarkup, />City\s*<span class="form-builder-required-star">\*<\/span>/);
assert.match(locationPreviewMarkup, /aria-label="City" autocomplete="address-level2"><option>Select a city<\/option>/);
const locationStandaloneDocument = builderRuntime.standaloneStudentDocumentForTest();
const locationStandaloneScript = locationStandaloneDocument.match(/<script>([\s\S]*?)<\/script>/);
assert.ok(locationStandaloneScript, "The standalone student document must contain its embedded runtime.");
new vm.Script(locationStandaloneScript[1], { filename: "standalone-form-taker.js" });
assert.match(locationStandaloneDocument, /function currentStep\(\)/);
assert.match(locationStandaloneDocument, /formDomain\.stepsForRouteSnapshot\(formState,snapshot,snapshotIndex\)/);
assert.match(locationStandaloneDocument, /if\(step\.kind==='identity'\)/);
assert.match(locationStandaloneDocument, /if\(step\.kind==='phase-intro'\)/);
assert.match(locationStandaloneDocument, /if\(step\.kind==='question'\)/);
assert.match(locationStandaloneDocument, /data-identity="'\+k\+'" autocomplete="'\+esc\(info\.autocomplete\|\|'off'\)\+'"/);
assert.doesNotMatch(locationStandaloneDocument, /historyIndex===1\?identity\(\)/);
const locationStudentRuntime = createStudentRuntime(takerSource, domainSource, adapterSource, locationForm);
const locationStudentMarkup = locationStudentRuntime.identityMarkup();
assert.match(locationStudentMarkup, /data-identity="country" data-location-level="country" autocomplete="country-name"/);
assert.match(locationStudentMarkup, /data-identity="state" data-location-level="state" autocomplete="address-level1"/);
assert.match(locationStudentMarkup, /data-identity="city" data-location-level="city" autocomplete="address-level2"/);
assert.match(locationStudentMarkup, /Countries States Cities Database/);
assert.match(locationStudentMarkup, /ODbL 1\.0/);
assert.deepEqual(
  toPlainValue(locationStudentRuntime.validateStep("respondent-details", { "identity-fullName": "Ana Silva" })),
  { valid: false, error: "Please complete all required respondent details before continuing." }
);
assert.equal(
  toPlainValue(locationStudentRuntime.validateStep("respondent-details", {
    "identity-fullName": "Ana Silva",
    "identity-country": "Brazil",
    "identity-state": "São Paulo",
    "identity-city": "Campinas"
  })).valid,
  true
);
builderRuntime.loadState(studentViewLaunch.handoff.form);
const librarySourceId = builderRuntime.currentFormId();
await builderRuntime.saveCurrentToLibrary();
const savedLibraryRecords = toPlainValue(await builderRuntime.libraryRecords());
assert.equal(savedLibraryRecords.length, 1);
assert.equal(savedLibraryRecords[0].definition.id, librarySourceId);
await builderRuntime.openLibraryCopy(librarySourceId);
assert.notEqual(builderRuntime.currentFormId(), librarySourceId);
const caseIds = new Set();
let scenarioCount = 0;
let submissionCount = 0;

for (const routingCase of fixtures.cases) {
  assert.equal(typeof routingCase.id, "string");
  assert.ok(!caseIds.has(routingCase.id), `Duplicate routing fixture id: ${routingCase.id}`);
  caseIds.add(routingCase.id);
  assert.ok(Array.isArray(routingCase.scenarios) && routingCase.scenarios.length > 0);

  builderRuntime.loadState(routingCase.form);
  const studentRuntime = createStudentRuntime(takerSource, domainSource, adapterSource, builderRuntime.createStudentViewPayload());

  for (const scenario of routingCase.scenarios) {
    const actualPageIds = toPlainValue(studentRuntime.simulateRoute(scenario.answers));
    assert.deepEqual(
      actualPageIds,
      scenario.expectedPageIds,
      `${routingCase.id}/${scenario.id} followed an unexpected respondent path.`
    );
    scenarioCount += 1;
  }

  if (routingCase.backtracking) {
    const actualDiscardedQuestionIds = toPlainValue(studentRuntime.discardFutureAnswersAfter(
      routingCase.backtracking.sourcePageId,
      routingCase.backtracking.answersBeforeChange
    ));
    assert.deepEqual(
      actualDiscardedQuestionIds,
      routingCase.backtracking.expectedDiscardedQuestionIds,
      `${routingCase.id} discarded the wrong answers after returning to an earlier route decision.`
    );
  }

  const submissionScenario = routingCase.scenarios[0];
  const generatedSubmission = toPlainValue(await studentRuntime.createSubmission(submissionScenario.answers));
  assert.deepEqual(
    generatedSubmission.metadata.route.pageIds,
    submissionScenario.expectedPageIds,
    `${routingCase.id} captured the wrong submission route.`
  );
  assert.equal(generatedSubmission.immutable, true);
  assert.equal(studentRuntime.submissionEventCount(), 1);
  assert.equal(studentRuntime.storedSubmissionCount(), 1);
  submissionCount += 1;
}

const persistenceAttemptIds = [];
let persistenceAttemptCount = 0;
const retryStudentRuntime = createStudentRuntime(
  takerSource,
  domainSource,
  adapterSource,
  comprehensiveTemplate,
  {
    submissionCreate: async (submission) => {
      persistenceAttemptIds.push(submission.id);
      persistenceAttemptCount += 1;
      if (persistenceAttemptCount === 1) throw new Error('Temporary persistence outage.');
      return toPlainValue(submission);
    },
    silencePersistenceErrors: true
  }
);
const failedSubmission = toPlainValue(await retryStudentRuntime.createSubmission(fullConditionalAnswers));
assert.equal(toPlainValue(retryStudentRuntime.submissionState()).status, 'error');
assert.equal(toPlainValue(retryStudentRuntime.submissionState()).submitted, false);
assert.equal(retryStudentRuntime.submissionEventCount(), 0);
const retriedSubmission = toPlainValue(await retryStudentRuntime.retrySubmission());
assert.equal(toPlainValue(retryStudentRuntime.submissionState()).status, 'saved');
assert.equal(toPlainValue(retryStudentRuntime.submissionState()).submitted, true);
assert.equal(retryStudentRuntime.submissionEventCount(), 1);
assert.equal(retriedSubmission.id, failedSubmission.id);
assert.deepEqual(persistenceAttemptIds, [failedSubmission.id, failedSubmission.id]);

const unavailableHostedRuntime = createStudentRuntime(
  takerSource,
  domainSource,
  adapterSource,
  comprehensiveTemplate,
  { protocol: 'http:', silencePersistenceErrors: true }
);
await unavailableHostedRuntime.createSubmission(fullConditionalAnswers);
assert.equal(toPlainValue(unavailableHostedRuntime.submissionState()).status, 'error');
assert.equal(toPlainValue(unavailableHostedRuntime.submissionState()).submitted, false);
assert.equal(unavailableHostedRuntime.submissionEventCount(), 0);
assert.equal(unavailableHostedRuntime.storedSubmissionCount(), 0);

const printFixtureArgument = process.argv.indexOf("--write-print-fixture");
if (printFixtureArgument >= 0) {
  const requestedOutput = process.argv[printFixtureArgument + 1];
  assert.ok(requestedOutput, "--write-print-fixture requires an output HTML path.");
  const longMillimetresArgument = process.argv.indexOf("--print-long-mm");
  const requestedLongMillimetres = longMillimetresArgument >= 0
    ? Number(process.argv[longMillimetresArgument + 1])
    : null;
  const printableFixtureState = JSON.parse(JSON.stringify(comprehensiveTemplate));
  printableFixtureState.blocks
    .filter((block) => block.kind === "question" && ["short-answer", "long-answer"].includes(block.type))
    .forEach((question) => {
      question.pdfAnswerSpace = question.type === "short-answer"
        ? { size: "small", customMm: 35 }
        : (Number.isFinite(requestedLongMillimetres)
          ? { size: "custom", customMm: requestedLongMillimetres }
          : { size: "large", customMm: 95 });
    });
  builderRuntime.loadState(printableFixtureState);
  const printableRoutes = toPlainValue(builderRuntime.printableRouteCatalog()).routes;
  const printableRoute = printableRoutes.at(-1);
  const printableHtml = builderRuntime.printableDocumentForTest(printableRoute.id);
  const outputPath = path.resolve(projectRoot, requestedOutput);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, printableHtml, "utf8");
  console.log(`Printable form fixture written to ${outputPath}`);
}

console.log(
  `Form builder characterization passed (${fixtures.cases.length} cases, ${scenarioCount} paths, ${submissionCount} submissions).`
);

function createDomainRuntime(source) {
  const sandbox = createBrowserSandbox();
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, {
    filename: "form-domain.js",
    timeout: 5000
  });
  assert.ok(sandbox.KelpFormDomain);
  assert.equal(typeof sandbox.KelpFormDomainFactory, "function");
  return sandbox.KelpFormDomain;
}

function verifyDomainFactories(domain) {
  const question = toPlainValue(domain.createQuestion());
  assert.match(question.id, /^question-/);
  assert.equal(question.options.length, 2);
  assert.notEqual(question.options[0].id, question.options[1].id);
  assert.deepEqual(question.pdfAnswerSpace, { size: "small", customMm: 35 });
  assert.deepEqual(
    toPlainValue(domain.createQuestion({ type: "long-answer" })).pdfAnswerSpace,
    { size: "medium", customMm: 60 }
  );
  assert.deepEqual(
    toPlainValue(domain.normalizePdfAnswerSpace({ size: "custom", customMm: 999 }, "long-answer")),
    { size: "custom", customMm: 260 }
  );
  assert.deepEqual(
    toPlainValue(domain.normalizePdfAnswerSpace({ size: "medium", customMm: 60 }, "short-answer")),
    { size: "small", customMm: 35 }
  );
  assert.deepEqual(
    toPlainValue(domain.normalizePdfAnswerSpace({ size: "none", customMm: 120 }, "short-answer")),
    { size: "none", customMm: 35 }
  );
  assert.equal(domain.IDENTITY_FIELDS.country.autocomplete, "country-name");
  assert.equal(domain.IDENTITY_FIELDS.state.autocomplete, "address-level1");
  assert.equal(domain.IDENTITY_FIELDS.state.label, "State / province");
  assert.equal(domain.IDENTITY_FIELDS.city.autocomplete, "address-level2");
  const identityDefaults = toPlainValue(domain.defaultIdentityState());
  assert.deepEqual(identityDefaults.country, { enabled: false, required: false, verify: false });
  assert.deepEqual(identityDefaults.state, { enabled: false, required: false, verify: false });
  assert.deepEqual(identityDefaults.city, { enabled: false, required: false, verify: false });

  const countryOnly = toPlainValue(domain.updateIdentityFieldConfig(identityDefaults, "country", "enabled", true));
  assert.equal(countryOnly.country.enabled, true);
  assert.equal(countryOnly.state.enabled, false);
  assert.equal(countryOnly.city.enabled, false);
  const withState = toPlainValue(domain.updateIdentityFieldConfig(countryOnly, "state", "enabled", true));
  assert.equal(withState.country.enabled, true);
  assert.equal(withState.state.enabled, true);
  assert.equal(withState.city.enabled, false);
  const requiredState = toPlainValue(domain.updateIdentityFieldConfig(identityDefaults, "state", "required", true));
  assert.equal(requiredState.country.required, true);
  assert.equal(requiredState.state.required, true);
  assert.equal(requiredState.city.required, false);
  const withCity = toPlainValue(domain.updateIdentityFieldConfig(identityDefaults, "city", "required", true));
  assert.equal(withCity.country.enabled, true);
  assert.equal(withCity.state.enabled, true);
  assert.equal(withCity.city.enabled, true);
  assert.equal(withCity.country.required, true);
  assert.equal(withCity.state.required, true);
  assert.equal(withCity.city.required, true);
  const optionalState = toPlainValue(domain.updateIdentityFieldConfig(withCity, "state", "required", false));
  assert.equal(optionalState.country.required, true);
  assert.equal(optionalState.state.required, false);
  assert.equal(optionalState.city.required, false);
  const optionalCountry = toPlainValue(domain.updateIdentityFieldConfig(withCity, "country", "required", false));
  assert.equal(optionalCountry.country.required, false);
  assert.equal(optionalCountry.state.required, false);
  assert.equal(optionalCountry.city.required, false);
  const withoutState = toPlainValue(domain.updateIdentityFieldConfig(withCity, "state", "enabled", false));
  assert.equal(withoutState.country.enabled, true);
  assert.equal(withoutState.state.enabled, false);
  assert.equal(withoutState.city.enabled, false);
  const withoutCountry = toPlainValue(domain.updateIdentityFieldConfig(withCity, "country", "enabled", false));
  assert.equal(withoutCountry.country.enabled, false);
  assert.equal(withoutCountry.state.enabled, false);
  assert.equal(withoutCountry.city.enabled, false);
}

function verifyDomainNormalization(domain) {
  const normalized = toPlainValue(domain.normalizeState({
    version: 2,
    meta: {
      title: 123,
      audience: null,
      description: "",
      collectName: true
    },
    blocks: [
      { id: "greeting-one", kind: "greeting" },
      { id: "greeting-two", kind: "greeting" },
      { id: "question-normalized", kind: "question", type: "unsupported", options: ["Only option"] },
      {
        id: "phase-normalized",
        kind: "phase",
        triggers: [{ id: "invalid-trigger", sourcePhaseId: "missing-phase", kind: "phase-complete" }]
      },
      { id: "goodbye-one", kind: "goodbye" },
      { id: "goodbye-two", kind: "goodbye" }
    ]
  }));

  assert.equal(normalized.meta.title, "123");
  assert.match(normalized.id, /^form-/);
  assert.equal(normalized.version, 3);
  assert.equal(normalized.settings.submissionPolicy.mode, "single");
  assert.equal(normalized.meta.audience, "");
  assert.equal(normalized.meta.respondentDetails.fullName.enabled, true);
  assert.equal(normalized.meta.respondentDetails.country.enabled, false);
  assert.equal(normalized.meta.respondentDetails.state.enabled, false);
  assert.equal(normalized.meta.respondentDetails.city.enabled, false);
  const normalizedCityHierarchy = toPlainValue(domain.normalizeState({
    meta: {
      respondentDetails: {
        country: { enabled: false },
        state: { enabled: false },
        city: { enabled: true, required: true }
      }
    },
    blocks: []
  }));
  assert.equal(normalizedCityHierarchy.meta.respondentDetails.country.enabled, true);
  assert.equal(normalizedCityHierarchy.meta.respondentDetails.state.enabled, true);
  assert.equal(normalizedCityHierarchy.meta.respondentDetails.city.enabled, true);
  assert.equal(normalizedCityHierarchy.meta.respondentDetails.country.required, true);
  assert.equal(normalizedCityHierarchy.meta.respondentDetails.state.required, true);
  assert.equal(normalizedCityHierarchy.meta.respondentDetails.city.required, true);
  assert.deepEqual(normalized.blocks.map((block) => block.id), [
    "greeting-one",
    "question-normalized",
    "phase-normalized",
    "goodbye-one"
  ]);
  assert.equal(normalized.blocks[1].type, "short-answer");
  assert.equal(normalized.blocks[1].options.length, 2);
  assert.deepEqual(normalized.blocks[1].pdfAnswerSpace, { size: "small", customMm: 35 });
  assert.deepEqual(normalized.blocks[2].triggers, []);
  const defaultPrintCatalog = toPlainValue(domain.enumeratePrintableRoutes(normalized));
  assert.equal(defaultPrintCatalog.routes.length, 1);
  assert.equal(defaultPrintCatalog.routes[0].label, "Default path");
  assert.deepEqual(defaultPrintCatalog.routes[0].pageIds, [
    "privacy",
    "initial-questions",
    "phase-page-phase-normalized",
    "goodbye"
  ]);

  const legacyAppearance = toPlainValue(domain.normalizeState({
    meta: {},
    blocks: [{
      id: "legacy-phase-appearance",
      kind: "phase",
      appearance: {
        backgroundColor: "#123abc",
        stripeColor: "#654321",
        selectionColor: "#abcdef"
      }
    }]
  }));
  assert.deepEqual(
    legacyAppearance.blocks[0].appearance,
    { backgroundColor: "#123ABC" },
    "Legacy phase colours must load while newly normalized data keeps one background colour."
  );
  assert.deepEqual(toPlainValue(domain.defaultPhaseAppearance()), { backgroundColor: "#00ACC1" });
  const derivedAppearanceVariables = domain.phaseAppearanceVariables(legacyAppearance.blocks[0].appearance);
  assert.match(derivedAppearanceVariables, /--phase-background:#123ABC/);
  assert.match(derivedAppearanceVariables, /--phase-selection:#123ABC/);
  assert.match(derivedAppearanceVariables, /--phase-stripe:#123ABC/);
  assert.match(derivedAppearanceVariables, /--phase-page-soft:rgba\(18, 58, 188, 0\.24\)/);
  assert.match(derivedAppearanceVariables, /--phase-selection-strong:#[0-9A-F]{6}/);
  assert.match(derivedAppearanceVariables, /--phase-control-text:#[0-9A-F]{6}/);

  const multipleSubmissionForm = toPlainValue(domain.normalizeState({
    id: "form-existing",
    version: 2,
    settings: { submissionPolicy: { mode: "multiple" } },
    meta: {},
    blocks: []
  }));
  assert.equal(multipleSubmissionForm.id, "form-existing");
  assert.equal(multipleSubmissionForm.version, 3);
  assert.equal(multipleSubmissionForm.settings.submissionPolicy.mode, "multiple");

  const invalidSubmissionMode = toPlainValue(domain.normalizeState({
    settings: { submissionPolicy: { mode: "unlimited" } },
    meta: {},
    blocks: []
  }));
  assert.equal(invalidSubmissionMode.settings.submissionPolicy.mode, "single");
}

function verifyDocumentIdentityAndCloning(domain, fixtureSet) {
  const starter = toPlainValue(domain.createDefaultState());
  assert.match(starter.id, /^form-/);
  assert.equal(starter.version, 3);
  assert.equal(starter.settings.submissionPolicy.mode, "single");

  const routingFixture = fixtureSet.cases.find((item) => item.id === "multiple-answer-exact-set");
  assert.ok(routingFixture, "Expected a routing fixture with question, option, phase, and trigger references.");

  const sourceDefinition = {
    ...toPlainValue(routingFixture.form),
    id: "form-original",
    settings: { submissionPolicy: { mode: "multiple" } },
    exportedAt: "2026-07-17T00:00:00.000Z"
  };
  const sourceBeforeClone = JSON.stringify(sourceDefinition);
  const cloned = toPlainValue(domain.cloneFormDefinition(sourceDefinition));
  const normalizedSource = toPlainValue(domain.normalizeState(JSON.parse(sourceBeforeClone)));

  assert.equal(JSON.stringify(sourceDefinition), sourceBeforeClone, "Cloning must not mutate the imported definition.");
  assert.match(cloned.id, /^form-/);
  assert.notEqual(cloned.id, normalizedSource.id);
  assert.equal(cloned.version, 3);
  assert.equal(cloned.settings.submissionPolicy.mode, "multiple");
  assert.equal("exportedAt" in cloned, false, "Transport metadata must not become editable form state.");
  assert.equal(cloned.blocks.length, normalizedSource.blocks.length);

  const blockIdMap = new Map();
  const optionIdMap = new Map();
  const clonedIds = new Set();
  normalizedSource.blocks.forEach((sourceBlock, index) => {
    const clonedBlock = cloned.blocks[index];
    assert.equal(clonedBlock.kind, sourceBlock.kind);
    assert.notEqual(clonedBlock.id, sourceBlock.id);
    assert.equal(clonedIds.has(clonedBlock.id), false, `Duplicate cloned block id: ${clonedBlock.id}`);
    clonedIds.add(clonedBlock.id);
    blockIdMap.set(sourceBlock.id, clonedBlock.id);

    if (sourceBlock.kind === "question") {
      assert.equal(clonedBlock.options.length, sourceBlock.options.length);
      assert.deepEqual(clonedBlock.pdfAnswerSpace, sourceBlock.pdfAnswerSpace);
      sourceBlock.options.forEach((sourceOption, optionIndex) => {
        const clonedOption = clonedBlock.options[optionIndex];
        assert.notEqual(clonedOption.id, sourceOption.id);
        assert.equal(clonedOption.label, sourceOption.label);
        optionIdMap.set(sourceOption.id, clonedOption.id);
      });
    }
  });

  normalizedSource.blocks.forEach((sourceBlock, index) => {
    if (sourceBlock.kind !== "phase") return;
    const clonedBlock = cloned.blocks[index];
    assert.equal(clonedBlock.triggers.length, sourceBlock.triggers.length);
    sourceBlock.triggers.forEach((sourceTrigger, triggerIndex) => {
      const clonedTrigger = clonedBlock.triggers[triggerIndex];
      assert.notEqual(clonedTrigger.id, sourceTrigger.id);
      assert.equal(clonedTrigger.sourcePhaseId, blockIdMap.get(sourceTrigger.sourcePhaseId));
      assert.equal(clonedTrigger.questionId, blockIdMap.get(sourceTrigger.questionId) || "");
      assert.equal(
        clonedTrigger.matcher.optionId,
        optionIdMap.get(sourceTrigger.matcher.optionId) || sourceTrigger.matcher.optionId
      );
      assert.deepEqual(
        clonedTrigger.matcher.optionIds,
        sourceTrigger.matcher.optionIds.map((optionId) => optionIdMap.get(optionId) || optionId).sort()
      );
      assert.equal(
        domain.isValidTriggerForTarget(cloned, clonedTrigger, clonedBlock),
        true,
        `Cloned trigger ${clonedTrigger.id} lost reference integrity.`
      );
    });
  });

  const sourceScenario = routingFixture.scenarios[0];
  const clonedAnswers = Object.fromEntries(Object.entries(sourceScenario.answers).map(([questionId, answer]) => [
    blockIdMap.get(questionId),
    Array.isArray(answer)
      ? answer.map((optionId) => optionIdMap.get(optionId) || optionId)
      : optionIdMap.get(answer) || answer
  ]));
  assert.deepEqual(
    routeLabels(domain, cloned, clonedAnswers),
    routeLabels(domain, normalizedSource, sourceScenario.answers),
    "The cloned definition must preserve the original respondent route."
  );
}

function routeLabels(domain, state, answers) {
  const labels = [];
  let snapshot = domain.createInitialSnapshot();
  for (let guard = 0; guard < 100; guard += 1) {
    if (snapshot.pageId === "privacy" || snapshot.pageId === "goodbye") labels.push(snapshot.pageId);
    else labels.push(domain.pageById(state, snapshot.pageId)?.block?.title || snapshot.pageId);
    const next = domain.nextSnapshot(state, answers, snapshot);
    if (!next) return labels;
    snapshot = next;
  }
  throw new Error("Cloned form routing exceeded the 100-page test limit.");
}

function verifyComprehensiveTemplate(domain, template) {
  const state = domain.normalizeState(toPlainValue(template));
  const importedCopy = domain.cloneFormDefinition(toPlainValue(template));
  const phases = state.blocks.filter((block) => block.kind === "phase");
  const questions = state.blocks.filter((block) => block.kind === "question");
  const triggers = phases.flatMap((phase) => phase.triggers.map((trigger) => ({ phase, trigger })));

  assert.equal(state.version, domain.FORM_DOCUMENT_VERSION);
  assert.equal(phases.length, 5, "The comprehensive template must contain five phases.");
  assert.equal(questions.length, 20, "The comprehensive template must contain twenty questions.");
  phases.forEach((phase) => {
    assert.equal(
      domain.getQuestionsForPhase(state, phase.id).length,
      4,
      `${phase.title} must contain exactly four questions.`
    );
  });
  assert.deepEqual(
    [...new Set(questions.map((question) => question.type))].sort(),
    ["long-answer", "multiple-answer", "multiple-choice", "number", "short-answer", "true-false"],
    "The comprehensive template must exercise every supported question type."
  );
  assert.equal(new Set(phases.map((phase) => phase.appearance.backgroundColor)).size, 5);
  assert.equal(triggers.filter(({ trigger }) => trigger.kind === "phase-complete").length, 1);
  assert.equal(triggers.filter(({ trigger }) => trigger.kind === "answer").length, 2);
  triggers.forEach(({ phase, trigger }) => {
    assert.equal(domain.isValidTriggerForTarget(state, trigger, phase), true, `${trigger.id} must retain valid references.`);
  });
  assert.equal(state.meta.respondentDetails.country.enabled, true);
  assert.equal(state.meta.respondentDetails.state.enabled, true);
  assert.equal(state.settings.submissionPolicy.mode, domain.SUBMISSION_MODES.MULTIPLE);
  assert.notEqual(importedCopy.id, state.id, "Import as copy must assign the testing template a new form ID.");
  assert.equal(importedCopy.blocks.filter((block) => block.kind === "phase").length, 5);
  assert.equal(importedCopy.blocks.filter((block) => block.kind === "question").length, 20);
  importedCopy.blocks.filter((block) => block.kind === "phase").forEach((phase) => {
    phase.triggers.forEach((trigger) => {
      assert.equal(domain.isValidTriggerForTarget(importedCopy, trigger, phase), true, "Imported trigger references must be remapped together.");
    });
  });

  assert.deepEqual(
    routeLabels(domain, state, {
      "question-profile-confidence": "option-confidence-support",
      "question-review-difficulty": "8"
    }),
    [
      "privacy",
      "1. Learner profile",
      "3. Guided support branch",
      "2. Study environment",
      "4. Progress review",
      "5. Priority follow-up",
      "goodbye"
    ],
    "Matching answers must exercise all five phases, the skipped-phase queue, and both trigger kinds."
  );
  assert.deepEqual(
    routeLabels(domain, state, {
      "question-profile-confidence": "option-confidence-high",
      "question-review-difficulty": "4"
    }),
    [
      "privacy",
      "1. Learner profile",
      "2. Study environment",
      "4. Progress review",
      "goodbye"
    ],
    "Non-matching answers must skip both answer-controlled branches while preserving the phase-completion route."
  );

  const printableCatalog = toPlainValue(domain.enumeratePrintableRoutes(state));
  assert.equal(printableCatalog.truncated, false);
  assert.equal(printableCatalog.routes.length, 4, "Every reachable comprehensive-template path must be printable.");
  assert.deepEqual(
    printableCatalog.routes.map((route) => route.questionIds.length).sort((left, right) => left - right),
    [12, 16, 16, 20]
  );
  assert.deepEqual(
    printableCatalog.routes.map((route) => route.pageTitles.join(" > ")).sort(),
    [
      "1. Learner profile > 2. Study environment > 4. Progress review",
      "1. Learner profile > 2. Study environment > 4. Progress review > 5. Priority follow-up",
      "1. Learner profile > 3. Guided support branch > 2. Study environment > 4. Progress review",
      "1. Learner profile > 3. Guided support branch > 2. Study environment > 4. Progress review > 5. Priority follow-up"
    ].sort(),
    "Printable paths must preserve conditional jumps and FIFO resumption order."
  );
}

function verifySubmissionContract(domain, fixtureSet) {
  const routingFixture = fixtureSet.cases.find((item) => item.id === "multiple-answer-exact-set");
  const noMatchScenario = routingFixture?.scenarios.find((item) => item.id === "exact-set-rejects-superset");
  assert.ok(routingFixture && noMatchScenario);

  const form = domain.normalizeState({
    ...toPlainValue(routingFixture.form),
    id: "form-submission-contract",
    settings: { submissionPolicy: { mode: "multiple" } }
  });
  form.meta.respondentDetails.fullName = { enabled: true, required: true, verify: false };
  form.meta.respondentDetails.email = { enabled: true, required: true, verify: false };
  form.meta.respondentDetails.country = { enabled: true, required: true, verify: false };
  form.meta.respondentDetails.state = { enabled: true, required: false, verify: false };
  const visibleQuestion = form.blocks.find((block) => block.id === "question-topics");
  const originalPrompt = visibleQuestion.prompt;
  const rawAnswers = {
    ...toPlainValue(noMatchScenario.answers),
    "identity-fullName": "Ana Silva",
    "identity-email": "ana@example.com",
    "identity-country": "Brazil",
    "identity-state": "São Paulo",
    "question-general": "Visible general answer",
    "question-exact-topics": "Stale answer from an unvisited branch",
    "question-topics-wrap": "Visible wrap-up answer"
  };

  const submission = domain.createSubmissionRecord(form, rawAnswers, {
    id: "submission-contract-test",
    submittedAt: "2026-07-17T12:00:00-03:00",
    pageIds: noMatchScenario.expectedPageIds
  });
  const plain = toPlainValue(submission);

  assert.equal(plain.id, "submission-contract-test");
  assert.equal(plain.version, 1);
  assert.equal(plain.immutable, true);
  assert.equal(plain.formId, "form-submission-contract");
  assert.equal(plain.submittedAt, "2026-07-17T15:00:00.000Z");
  assert.equal(plain.metadata.formSchemaVersion, 3);
  assert.equal(plain.metadata.submissionPolicy, "multiple");
  assert.deepEqual(plain.metadata.route.pageIds, noMatchScenario.expectedPageIds);
  assert.deepEqual(
    plain.snapshot.pages.map((page) => page.id),
    noMatchScenario.expectedPageIds.filter((pageId) => pageId !== "privacy" && pageId !== "goodbye")
  );
  assert.deepEqual(plain.data.respondent, {
    fullName: "Ana Silva",
    email: "ana@example.com",
    country: "Brazil",
    state: "São Paulo"
  });
  assert.deepEqual(
    plain.data.answers.find((answer) => answer.questionId === "question-topics")?.value,
    ["option-algebra", "option-geometry", "option-statistics"]
  );
  assert.equal(
    plain.data.answers.some((answer) => answer.questionId === "question-exact-topics"),
    false,
    "Answers from an unvisited conditional branch must not enter the immutable record."
  );
  assert.equal(
    plain.snapshot.pages.some((page) => page.id === "phase-page-phase-exact-topics"),
    false,
    "Unvisited pages must not enter the lean form snapshot."
  );
  assert.equal(Object.isFrozen(submission), true);
  assert.equal(Object.isFrozen(submission.snapshot.pages), true);
  assert.equal(Object.isFrozen(submission.data.answers), true);
  assert.throws(
    () => submission.data.answers.push({}),
    (error) => error?.name === "TypeError" && /not extensible|read only|frozen/i.test(error.message)
  );

  visibleQuestion.prompt = "Changed after submission";
  const capturedQuestion = plain.snapshot.pages
    .flatMap((page) => page.questions)
    .find((question) => question.id === "question-topics");
  assert.equal(capturedQuestion.prompt, originalPrompt);
}

function verifyRespondentValidation(domain) {
  const state = domain.normalizeState({
    version: 2,
    meta: {
      title: "Validation fixture",
      audience: "",
      description: "",
      respondentDetails: {
        fullName: { enabled: false, required: false, verify: false },
        email: { enabled: true, required: true, verify: false }
      }
    },
    blocks: [
      {
        id: "question-required",
        kind: "question",
        prompt: "Required prompt",
        type: "short-answer",
        required: true,
        options: []
      }
    ]
  });
  const [page] = domain.buildContentPages(state);

  assert.deepEqual(
    toPlainValue(domain.getMissingRequired(state, {}, page, true)),
    ["E-mail address", "Required prompt"]
  );
  assert.equal(
    domain.validateRespondentDetails(state, { "identity-email": "not-an-email" }, true),
    "Please enter a valid e-mail address."
  );
  assert.equal(
    domain.validateRespondentDetails(state, { "identity-email": "student@example.com" }, true),
    true
  );
}

function createBuilderRuntime(adapterSourceText, domainSourceText, source) {
  const closingMarker = "})();";
  const closingIndex = source.lastIndexOf(closingMarker);
  assert.ok(closingIndex > 0, "Could not locate the form builder closure.");

  const hook = `
  globalThis.__KelpFormBuilderCharacterization = Object.freeze({
    loadState(nextState) {
      state = JSON.parse(JSON.stringify(nextState));
      normalizeState();
      renderBlockList();
    },
    createStudentViewPayload,
    blockControlMarkup() {
      return els.blockList.innerHTML;
    },
    previewStepDescriptors() {
      return buildPreviewSteps().map((step) => ({
        id: step.id,
        kind: step.kind,
        pageId: step.page?.id || null,
        questionId: step.question?.id || null
      }));
    },
    previewMarkupForStep(stepId) {
      const steps = buildPreviewSteps();
      const index = steps.findIndex((step) => step.id === stepId);
      if (index < 0) throw new Error('Preview step was not found: ' + stepId);
      return renderPreviewStep(steps[index], index, steps.length);
    },
    printableRouteCatalog() {
      return FormDomain.enumeratePrintableRoutes(state);
    },
    printableDocumentForTest(routeId, settings = {}) {
      const routeCatalog = FormDomain.enumeratePrintableRoutes(state);
      const route = routeCatalog.routes.find((item) => item.id === routeId) || routeCatalog.routes[0];
      return buildPrintableStandaloneDocument(route, {
        ...printModalState,
        ...settings,
        routeCatalog,
        selectedRouteId: route?.id || ''
      });
    },
    standaloneStudentDocumentForTest() {
      return buildStudentViewDocument();
    },
    openStudentViewForTest() {
      openStudentView();
      const opened = globalThis.__lastOpenedPopup;
      const handoff = JSON.parse(localStorage.getItem(STUDENT_VIEW_STORAGE_KEY));
      return {
        url: opened?.url || '',
        sessionId: handoff.sessionId,
        handoff
      };
    },
    signalStudentViewReadyForTest(sessionId) {
      const opened = globalThis.__lastOpenedPopup;
      globalThis.__dispatchWindowEvent('message', {
        source: opened.popup,
        data: { type: STUDENT_VIEW_READY_MESSAGE, sessionId }
      });
      return opened.popup.messages;
    },
    confirmRemovalForTest(kind, response) {
      const originalConfirm = window.confirm;
      window.confirm = () => response;
      try {
        return confirmBlockRemoval({ kind });
      } finally {
        window.confirm = originalConfirm;
      }
    },
    dropPlacementForTest(rect, clientY) {
      return getDropPlacement({ getBoundingClientRect: () => rect }, clientY);
    },
    dropInsertionForTest(sourceIndex, targetIndex, placement) {
      return getDropInsertionIndex(sourceIndex, targetIndex, placement);
    },
    exclusiveExpansionForTest(index) {
      const block = state.blocks[index];
      if (!block) throw new Error('Block index was not found: ' + index);
      expandBlockExclusively(block.id);
      return state.blocks.map((item) => ({ id: item.id, collapsed: item.collapsed }));
    },
    setPreviewCollapsedForTest(collapsed) {
      setPreviewCollapsed(collapsed);
    },
    markPreviewFollowingForTest() {
      els.layout.classList.add('is-preview-following');
    },
    previewState() {
      return {
        collapsed: els.layout.classList.contains('preview-collapsed'),
        expanded: els.togglePreview.getAttribute('aria-expanded'),
        toggleState: els.togglePreview.dataset.previewToggleState,
        following: els.layout.classList.contains('is-preview-following')
      };
    },
    currentFormId() {
      return state.id;
    },
    async saveCurrentToLibrary() {
      await saveToLibrary();
    },
    async libraryRecords() {
      const adapters = await formAdaptersReady;
      return adapters.forms.list();
    },
    async openLibraryCopy(formId) {
      await openLibraryRecordAsCopy(formId);
    }
  });
`;
  const instrumentedSource = `${source.slice(0, closingIndex)}${hook}${source.slice(closingIndex)}`;
  const sandbox = createBrowserSandbox();
  vm.createContext(sandbox);
  vm.runInContext(adapterSourceText, sandbox, {
    filename: "form-adapters.js",
    timeout: 5000
  });
  vm.runInContext(domainSourceText, sandbox, {
    filename: "form-domain.js",
    timeout: 5000
  });
  vm.runInContext(instrumentedSource, sandbox, {
    filename: "form-builder.js",
    timeout: 5000
  });

  assert.ok(sandbox.__KelpFormBuilderCharacterization);
  return sandbox.__KelpFormBuilderCharacterization;
}

function createStudentRuntime(takerSourceText, domainSourceText, adapterSourceText, form, options = {}) {
  const bootstrapMarker = "  bootstrap();";
  const bootstrapIndex = takerSourceText.lastIndexOf(bootstrapMarker);
  assert.ok(bootstrapIndex > 0, "Could not locate the dedicated form taker initialization.");

  const hook = `
globalThis.__KelpFormTakerCharacterization = Object.freeze({
  initialize(nextForm) {
    const payload = {
      schema: HANDOFF_SCHEMA,
      sessionId: 'characterization',
      form: deep(nextForm)
    };
    loadForm(payload);
  },
  simulateRoute(nextAnswers) {
    replaceAnswers(nextAnswers);
    const snapshots = buildRouteSnapshots();
    return snapshots.map((snapshot) => snapshot.pageId);
  },
  stepDescriptorsForRoute(nextAnswers) {
    replaceAnswers(nextAnswers);
    return buildRouteSnapshots().flatMap((snapshot, snapshotIndex) => (
      stepsForSnapshot(snapshot, snapshotIndex).map(stepDescriptor)
    ));
  },
  validateStep(stepId, nextAnswers) {
    moveToStep(stepId, nextAnswers);
    const valid = validateCurrent();
    return { valid, error: document.getElementById('error').textContent };
  },
  identityMarkup() {
    return identity();
  },
  positionAtStep(stepId, nextAnswers) {
    moveToStep(stepId, nextAnswers);
    return stepDescriptor(currentStep());
  },
  progressMarkupAtStep(stepId, nextAnswers) {
    moveToStep(stepId, nextAnswers);
    return progress();
  },
  markupAtStep(stepId, nextAnswers) {
    moveToStep(stepId, nextAnswers);
    return document.getElementById('app').innerHTML;
  },
  nextStep() {
    goNext();
    return stepDescriptor(currentStep());
  },
  previousStep() {
    goPrevious();
    return stepDescriptor(currentStep());
  },
  discardFutureAnswersAfter(sourcePageId, nextAnswers) {
    replaceAnswers(nextAnswers);
    history = buildRouteSnapshots().map(deep);
    historyIndex = history.findIndex((snapshot) => snapshot.pageId === sourcePageId);
    if (historyIndex < 0) throw new Error('Backtracking source page was not visited.');
    const before = new Set(Object.keys(answers));
    discardFutureAnswers();
    return [...before].filter((questionId) => !(questionId in answers)).sort();
  },
  async createSubmission(nextAnswers) {
    replaceAnswers(nextAnswers);
    history = buildRouteSnapshots().map(deep);
    historyIndex = history.length - 1;
    await completeSubmission();
    return deep(submissionRecord);
  },
  async retrySubmission() {
    await completeSubmission();
    return deep(submissionRecord);
  },
  submissionState() {
    return { status: submissionStatus, error: submissionError, submitted };
  },
  storedSubmissionCount() {
    const raw = localStorage.getItem(formAdapterDomain.DEFAULT_SUBMISSION_STORAGE_KEY);
    return raw ? Object.keys(JSON.parse(raw)).length : 0;
  },
  submissionEventCount() {
    return globalThis.__dispatchedEvents.filter((event) => event.type === 'kelp:form-submitted').length;
  }
});
function replaceAnswers(nextAnswers) {
  Object.keys(answers).forEach((key) => delete answers[key]);
  Object.entries(deep(nextAnswers || {})).forEach(([key, value]) => {
    answers[key] = value;
  });
}
function stepDescriptor(step) {
  return {
    id: step.id,
    kind: step.kind,
    pageId: step.page?.id || null,
    questionId: step.question?.id || null
  };
}
function moveToStep(stepId, nextAnswers) {
  replaceAnswers(nextAnswers);
  history = buildRouteSnapshots().map(deep);
  for (let snapshotIndex = 0; snapshotIndex < history.length; snapshotIndex += 1) {
    const steps = stepsForSnapshot(history[snapshotIndex], snapshotIndex);
    const foundStepIndex = steps.findIndex((step) => step.id === stepId);
    if (foundStepIndex < 0) continue;
    historyIndex = snapshotIndex;
    stepIndex = foundStepIndex;
    routeDirty = false;
    render();
    return;
  }
  throw new Error('Respondent step was not found: ' + stepId);
}
function buildRouteSnapshots() {
  const snapshots = [initialSnapshot()];
  let current = snapshots[0];
  for (let guard = 0; guard < 100; guard += 1) {
    const next = nextSnapshot(current);
    if (!next) return snapshots;
    snapshots.push(next);
    current = next;
  }
  throw new Error('Routing exceeded the 100-page characterization limit.');
}
`;
  const instrumentedSource = `${takerSourceText.slice(0, bootstrapIndex)}${hook}${takerSourceText.slice(bootstrapIndex)}`;
  const sandbox = createBrowserSandbox();
  sandbox.location.search = "?session=characterization";
  sandbox.location.protocol = options.protocol || "file:";
  if (options.silencePersistenceErrors) {
    sandbox.console = { ...console, error() {} };
  }
  if (typeof options.submissionCreate === "function") {
    sandbox.KelpBackendAdapters = {
      forms: async () => ({
        meta: { provider: "characterization" },
        submissions: { create: options.submissionCreate }
      })
    };
  }
  vm.createContext(sandbox);
  vm.runInContext(adapterSourceText, sandbox, {
    filename: "form-adapters.js",
    timeout: 5000
  });
  vm.runInContext(domainSourceText, sandbox, {
    filename: "form-domain.js",
    timeout: 5000
  });
  vm.runInContext(instrumentedSource, sandbox, {
    filename: "form-taker.js",
    timeout: 5000
  });

  assert.ok(sandbox.__KelpFormTakerCharacterization);
  sandbox.__KelpFormTakerCharacterization.initialize(form);
  return sandbox.__KelpFormTakerCharacterization;
}

function createBrowserSandbox() {
  const elements = new Map();
  const dispatchedEvents = [];
  const windowListeners = new Map();
  let generatedId = 0;

  const createElement = () => {
    const classes = new Set();
    const attributes = new Map();
    return {
      value: "",
      innerHTML: "",
      textContent: "",
      disabled: false,
      checked: false,
      files: [],
      dataset: {},
      style: {},
      classList: {
        add(...names) { names.forEach((name) => classes.add(name)); },
        remove(...names) { names.forEach((name) => classes.delete(name)); },
        contains(name) { return classes.has(name); },
        toggle(name, force) {
          const enabled = force === undefined ? !classes.has(name) : Boolean(force);
          if (enabled) classes.add(name);
          else classes.delete(name);
          return enabled;
        }
      },
      addEventListener() {},
      removeEventListener() {},
      setAttribute(name, value) { attributes.set(name, String(value)); },
      getAttribute(name) { return attributes.has(name) ? attributes.get(name) : null; },
      removeAttribute(name) { attributes.delete(name); },
      appendChild() {},
      append() {},
      remove() {},
      click() {},
      closest() { return null; },
      contains() { return false; },
      querySelector() { return null; },
      querySelectorAll() { return []; },
      getBoundingClientRect() {
        return { top: 0, height: 0 };
      }
    };
  };

  const document = {
    body: createElement(),
    documentElement: createElement(),
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, createElement());
      return elements.get(id);
    },
    createElement,
    addEventListener() {},
    removeEventListener() {},
    querySelectorAll() { return []; }
  };

  const storage = new Map();
  const sandbox = {
    console,
    document,
    localStorage: {
      getItem(key) { return storage.has(key) ? storage.get(key) : null; },
      setItem(key, value) { storage.set(key, String(value)); },
      removeItem(key) { storage.delete(key); }
    },
    crypto: {
      randomUUID() {
        generatedId += 1;
        return `00000000-0000-4000-8000-${String(generatedId).padStart(12, "0")}`;
      }
    },
    CSS: {
      escape(value) { return String(value); }
    },
    Blob: globalThis.Blob,
    URL: globalThis.URL,
    URLSearchParams: globalThis.URLSearchParams,
    location: {
      href: "http://localhost/src/app/form-builder/form-taker.html",
      search: ""
    },
    opener: null,
    setTimeout() { return 1; },
    clearTimeout() {},
    CustomEvent: class CustomEvent {
      constructor(type, init = {}) {
        this.type = type;
        this.detail = init.detail;
      }
    },
    dispatchEvent(event) {
      dispatchedEvents.push(event);
      return true;
    },
    addEventListener(type, listener) {
      if (!windowListeners.has(type)) windowListeners.set(type, new Set());
      windowListeners.get(type).add(listener);
    },
    removeEventListener(type, listener) {
      windowListeners.get(type)?.delete(listener);
    },
    postMessage() {},
    requestAnimationFrame(callback) { callback(); },
    confirm() { return true; },
    open(url, target) {
      const popup = {
        messages: [],
        focus() {},
        postMessage(message, origin) {
          this.messages.push({ message, origin });
        }
      };
      sandbox.__lastOpenedPopup = { url, target, popup };
      return popup;
    },
    focus() {}
  };
  sandbox.__dispatchedEvents = dispatchedEvents;
  sandbox.__lastOpenedPopup = null;
  sandbox.__dispatchWindowEvent = (type, event) => {
    [...(windowListeners.get(type) || [])].forEach((listener) => listener(event));
  };
  sandbox.window = sandbox;
  return sandbox;
}

function toPlainValue(value) {
  return JSON.parse(JSON.stringify(value));
}
