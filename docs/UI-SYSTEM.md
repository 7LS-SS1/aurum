# Shared UI foundation

## MUI panel update (2026-11-09)

The root now uses MUI 9.5.0 with Emotion's Next.js App Router cache provider. `src/components/ui/AurumTheme.tsx` is the component theme; `src/app/workspace.css` aligns legacy tokens with it. New panel controls should use MUI with `sx` and `slotProps` (MUI 9 no longer supports the old system props on Stack/Typography). The native foundation below remains for specialized existing forms and media controls.

`MemberWorkspace` is shared by account, login/register, service sales, booking and checkout pages through `MemberShell`. `/services/select` is the starting point for a general service purchase; website requests and advertising keep their existing separate flows. Dashboard numbers explicitly refer to advertising orders; website requests have their own entry point. Do not combine different status models into an invented total.

Registered active TargetSite homepage URLs feed the sales showcase using mShots. No credentials or query strings are sent. Preview errors show an honest placeholder, and the local isolated database may contain test destinations rather than production websites. Admin `/admin/upcoming` contains non-persistent example forms, protected by the existing service-management permission. Host cutover instructions are in `MANAGEMENT-HOST-PREPARATION.md`.

`src/app/ui-foundation.css` is imported once by the root layout after legacy globals, covering every Next.js route. Native text/number/date fields, selects, textareas, file-picker buttons, fieldsets, focus and disabled states share `--ui-*` tokens. Bare buttons and existing `.btn-gold` receive complete button geometry. Layout-specific controls such as players, icon buttons, chips and drag/drop overlays retain their own classes and sizing.

For new UI use `.ui-field` (label wrapper), `.ui-input`, `.ui-select`, `.ui-textarea`, `.ui-button`, `.ui-button--primary`, `.ui-button--danger`, `.ui-button--quiet`, `.ui-actions`, `.ui-help`, and `.ui-panel`. Prefer semantic labels and native controls. Use `disabled` while submitting, `aria-invalid` for errors, `role=alert` for failures and `role=status` for progress. A link that navigates stays an anchor; a form action stays a button. Never rely on color alone to convey a status.

Component modules own grids/spacing and exceptional interactions, and should consume shared tokens rather than copy control colors/radii. Do not apply button classes to video surfaces, menu containers or icon-only player controls. Verify desktop/mobile, long Thai labels, keyboard focus, disabled states and form submission when changing tokens.

This change affects presentation only. No schema, records, media or API contracts changed. Migration, backup/restore and worker draining are not applicable. Roll back the CSS import/module edits if a visual regression appears. Deployment remains manual; sample-page browser checks do not establish that every interaction in the project was tested.

Public service pages, booking, authentication and account panels reuse neutral background/text/border tokens from globals and shared control radii. ServiceNav marks the active route. ServiceFooter links to /services/help with factual ordering, account and attachment guidance. Do not add security certification badges or automatic-payment claims without verified support. The media catalog retains its existing neutral theme and specialized playback layout.

## Verification of the MUI panel update

- TypeScript (`tsc --noEmit --incremental`) passed.
- Targeted Vitest: 3 files, 10 tests passed (management routing/authentication and published Banner content).
- Local isolated database: member login succeeded; Dashboard purchase CTA reached `/services/select`; desktop and 390px mobile views and mobile drawer were inspected.
- Full test-suite attempts were interrupted after local resource-related timeouts; no full-suite pass or production build is claimed for this update. Production deployment, DNS/TLS and real payment flows were not exercised.
- Preview uses port 3318 and `.next-ui-preview` to avoid overwriting a running standalone preview.
