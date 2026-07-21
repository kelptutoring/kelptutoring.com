# Kelp interior-page header style

This is the reusable reference for Kelp's compact interior-page header. Use it on focused pages such as Profile and Themes when a full workspace sidebar would be excessive.

## Anatomy

- **Brand:** the Kelp logo is the first item and links to the current role's Dashboard.
- **Actions:** two or three short route links sit on the right. Use an outline treatment for the return route and a soft accent treatment for the sibling feature.
- **Surface:** a centered frosted-white capsule appears before the page shell and scrolls naturally with the document.
- **Spacing:** normal document flow creates a clear gap between the header and page shell. Content never travels underneath the header.

```html
<header class="profile-topbar">
  <a class="profile-brand" href="../dashboard/student-dashboard.html" aria-label="Kelp Student Dashboard">
    <img src="../../../public/assets/logos/Kelp-logo-gpt.png" alt="" />
  </a>
  <nav class="profile-topbar-actions" aria-label="Profile navigation">
    <a href="../dashboard/student-dashboard.html" class="btn-outline">Dashboard</a>
    <a href="./student-preferences.html" class="btn-secondary">Themes</a>
  </nav>
</header>
```

## Layout contract

| Property | Desktop | Up to 620 px |
| --- | --- | --- |
| Width | `min(1240px, calc(100% - 32px))` | `calc(100% - 20px)` |
| Top margin | `16px` | `10px` |
| Minimum height | `72px` | content-driven, preserving 44 px targets |
| Padding | `10px 14px 10px 18px` | `10px` |
| Radius | `24px` | `24px` |
| Logo width | `118px` | `92px` |
| Page-shell top margin | `22px` | `16px` |
| Layer | `position: relative; z-index: 1` | same |

The surface uses translucent white, a subtle white border, an 18-pixel backdrop blur, and a restrained shadow. It must remain in normal document flow. Do not use `fixed` or `sticky` positioning for the header or for a page-ending action bar; neither should follow the viewport while content scrolls.

## Theme and first paint

Student-owned themed pages apply the allowlisted theme before loading shared CSS:

```html
<html lang="en" data-kelp-theme="ocean">
<head>
  <script src="/src/auth/theme-bootstrap.js"></script>
  <link rel="stylesheet" href="../../styles/style.css" />
</head>
```

The local cache contains only the theme identifier and exists solely to prevent a first-paint flash. The authenticated server preference remains authoritative and reconciles the cache after loading. Unsaved previews never update it.

Header actions use the shared button classes and `--kelp-theme-accent`, `--kelp-theme-accent-strong`, and `--kelp-theme-accent-soft`. Do not introduce page-specific hard-coded action colors.

## Responsive behavior

- Keep the capsule in normal document flow on desktop and mobile.
- At 620 pixels and below, hide the outline Dashboard action only when the logo still provides an unambiguous Dashboard route.
- Collapse page content independently of the header; do not make the header horizontally scrollable.
- Maintain at least 44-by-44-pixel interactive targets.
- Verify the document's `scrollWidth` does not exceed its `clientWidth` at 390 pixels.

## Accessibility

- Give the logo link an explicit destination name and keep the decorative image's `alt` empty.
- Use a `<nav>` label that describes the page context.
- Use links for navigation and buttons only for actions.
- Preserve visible `:focus-visible` styling using the current theme tokens.
- Respect reduced-motion preferences and do not animate the header into position.
- Keep a visible flow gap between the header and the first page heading.

## Adoption checklist

1. Add the header immediately inside `<body>`.
2. Point the logo to the current role's Dashboard and verify its accessible name.
3. Keep no more than three short actions; mark the current destination with `aria-current="page"` when it appears in the header.
4. Apply the first-paint bootstrap before shared CSS on Student-themed pages.
5. Add the documented normal-flow gap at desktop and mobile breakpoints.
6. Confirm the header scrolls out of view with the document and no content passes underneath it.
7. Confirm keyboard focus, 44-pixel targets, and no 390-pixel horizontal overflow.
8. Confirm the saved theme colors the action controls without changing feature-owned visual systems that explicitly opt out.

The current reference implementation lives in `src/app/profile/profile.css` and the Profile/Theme HTML files. When three or more page families adopt it, extract the structural rules into a shared `kelp-page-header` component rather than copying Profile-specific selectors.
