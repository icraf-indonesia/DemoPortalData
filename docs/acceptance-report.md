# Local demonstration acceptance report

Verified 12 October 2026. The integrated local four-case browser demonstration passes its implemented acceptance checks. This is acceptance of a simulated local workflow, not certification of source quality or a shared production service.

## Delivered

Locally vendored Leaflet/JSZip interface with Luma colours, Indonesian controls, four case workflows, private partner collections, persisted sampling drafts, independent simulated review and explicit adoption, and policy-filtered ZIP export. Agy CLI wrote application changes; Codex reviewed, integrated and independently checked them. Source archives, reference repositories and the old prototype were not edited.

## Evidence

| Check | Result | Evidence |
| --- | --- | --- |
| Importer regressions | 15 passed | ../.work/importer-final-check.log |
| Integrated JavaScript and browser suite | 40 passed | ../.work/integrated-js-tests.log |
| Independent domain checks | 31 passed | ../.work/adversarial-final.json |
| Extended browser journey | Passed submission, two entered reviews, explicit admin adoption, refresh, active membership and downloaded UUID/class | ../.work/integrated-browser-verification.log |
| Real source reconciliation | 3,231 records across six point collections; counts reconciled by AOI | ../.work/real-data-verification.json |
| Case 1 ZIP | 927 points:122 karet,118 kelapa sawit,687 lainnya | ../.work/independent-case1.zip |
| Case 4 ZIP | Adopted screen UUID, class3, Tier2, reason and two supporting review IDs retained | ../.work/independent-case4.zip |
| Package structure | SHP/SHX/DBF/PRJ/CPG, CSV, GeoJSON and manifest reconcile; numeric class_id first; actual Luma column selector matches | ../.work/case1-package-final.json; ../.work/case4-package-final.json |
| Protected source digests | All ten unchanged after integration | ../.work/source-hashes-before.json |
| Visual inspection | Luma palette, four-case header and 1440px captures inspected | ../.work/final-case1-1440.png; ../.work/final-case4-1440.png |

The standard suites initially missed the adopted screen point's absence from active export membership. Codex rejected completion, reproduced the fault and added the extended browser check. Agy corrected the collection model; that check now passes. Historical failure reports remain in .work for audit.

## Limits

Review identities, ownership and consent are explicitly simulated. Browser storage is local to one browser profile and origin; there is no shared server or authentication. Unknown source metadata remains unknown; scenario overlays are assumptions. Taxonomy authority and field-quality evidence remain unresolved. Record counts do not imply independent sampling locations or map accuracy.

Live Luma receiver import remains untested. The package evidence proves local structure and the receiver source column-selection function only. Optional EOX2025 imagery needs network access and its terms/attribution; it does not establish a2026 observation date. Core vector workflows run locally. Zoom and panel controls remain available for different screen sizes; visual checks do not constitute a full accessibility audit.

## Reproduce

Run the README test commands. For the supervisor browser journey, run `node .work/independent-integration.test.mjs .`. Run `node .work/adversarial-acceptance.mjs .` for independent domain checks, then `python3 .work/verify-luma-package.py .work/independent-case1.zip` and the corresponding Case4 ZIP. The browser journey regenerates these packages using explicit scenario opt-ins.


## Approved product revision, 12 October 2026

The user requested a tool-like interface rather than visible case steps and demonstration badges. Agy implements the application; Codex supervises and verifies. The revision replaces numbered navigation with task actions, adds Bagikan Data, uses a compact rectangular-swatch classification legend, removes the unmapped pseudo-class from the visible legend, and preserves the three Case 1 classes. Study context identifies Kabupaten Banyuasin and recording period 2026. These contextual labels do not fill missing source observation dates.

The earlier requirement to exclude observations with unknown rights or dates from every export conflicted with the requested usable private training workflow. The approved resolution separates export purposes: PRIVATE_TRAINING permits unknown metadata with acknowledgement and recorded warnings; SHARING retains strict permission checks. Neither changes source metadata nor promotes quality tiers. Explicit prohibited use, disputed interpretation, unsupported/unmapped class and outside-area records remain excluded. The 927-point private package retains null rights and observation dates. A private package does not grant permission to publish or redistribute its contents.

The requested OpenLandMap default is implemented using the actual OpenTopoMap provider observed in OpenLandMap's current application configuration on 12 October 2026. Alternatives are OpenStreetMap, EOX 2025 and neutral local background. Tile failures preserve the user's provider preference. Source folders remain read-only. Windows execution and live Luma import remain untested.

### Product revision evidence

Independent checks cover the 927-point private source-mode export, unchanged null source metadata, strict sharing, explicit exclusion reasons, the review/adoption/export journey, basemap preference persistence under blocked network requests, readable context, horizontal legend rows and AOI fit after table layout changes. The updated JavaScript/browser suite passes 42 tests; the independent domain suite passes 31 checks. The unchanged importer previously passed 15 tests. Exported ZIP contents are independently reconciled across Shapefile, CSV, GeoJSON and manifest, including numeric class_id as the first DBF field.

Manager evidence is retained in `.work/product-final-tests.log`, `.work/product-ui-browser.log`, `.work/product-adoption-journey.log`, `.work/private-export-policy-result.json` and `.work/product-domain-acceptance.json`.

The final badge-only agy call timed out while waiting for background test reporting. Its written change was inspected and independently checked before integration; this timeout is not counted as a successful agy verification run. Integrated evidence is recorded in `.work/product-integrated-tests.log` and `.work/product-integrated-browser.log`.

## Full-canvas layout acceptance, 12 October 2026

Agy implemented floating side panels and a bottom overlay drawer. Codex independently verified full workspace map width with panels open and closed, independent collapse/reopen, visibility persistence, hidden-panel inertness, keyboard focus transfer, table contents and layer access at 1440 × 900 and 1366 × 768. Zoom remains unchanged and centre remains within one render pixel during visibility-only toggles. The updated suite passes 43 tests; the independent adoption journey and 927-point private export policy also pass. Data and vendor contents are unchanged.

Evidence: `.work/canvas-suite-final.log`, `.work/canvas-browser.log`, `.work/canvas-integrated-browser.log`, `.work/canvas-adoption.log`, `.work/canvas-policy.json` and `.work/screenshots-canvas`. The initial agy CLI reporting call timed out after writing the files. One read-only recovery, attempt 2 in conversation `3e76298a-2b7e-4919-9ee2-11f652d9b718`, completed successfully and passed the result validator. No permission denial occurred.

Verification covered desktop laptop sizes. Windows execution and live Luma import remain untested.

## Repository packaging, 12 October 2026

The repository package includes the prepared real demo data, a developer quickstart, current UI screenshot, pinned Playwright dependency and portable browser test setup. Temporary work, caches, generated export ZIPs and machine-specific run receipts are excluded. A separate staged-file checkout passes all 43 JavaScript/browser tests using npm-installed Playwright and its Chromium, all 15 Python importer tests, and the independent full-canvas browser check. Node.js 22 syntax detection emits a module-type warning for the existing mixed ESM tests and CommonJS helper; the tests pass. Native Windows execution and live Luma import remain untested.
