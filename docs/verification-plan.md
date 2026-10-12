# Verification plan

Status: the integrated local demonstration passes 15 importer tests,40 JavaScript/browser tests,31 independent domain checks and the extended browser adoption/export journey. Final results and operational limits are recorded in [the acceptance report](acceptance-report.md). Historical failures below are retained as intermediate evidence, not current failures.

## Evidence and completion rules

Record each check as not run, passed, failed, or blocked. Record the application revision, fixture version or source digest, environment, date, expected outcome, actual outcome, and evidence location. A simulated flow cannot satisfy a check requiring actual identity, source evidence, or Luma import.

Test browser-visible behaviour, downloaded bytes, persisted state after restart, and receiver results. Compilation or a screenshot alone does not prove these behaviours. Store future reports in this workspace after implementation approval. The original prototype and protected OneDrive source folders remain unchanged.

Use deterministic small fixtures for edge cases and source-derived data for ingestion reconciliation. Keep their results separate. No universal sample-count or map-accuracy threshold is proposed: assess any resulting map against its intended use in separate work.

## Sprint 0 foundation evidence

| ID | Action | Expected evidence | Actual result | Evidence reference |
| --- | --- | --- | --- | --- |
| F01 | Inventory source archives and read all records | Digests, encoding, fields, CRS, geometry types, deleted or invalid rows, and reconciliation to DBF header counts | Passed on 15 importer regressions and all real records; ten source digests unchanged | `tests/test_prepare_data.py`, `.work/real-data-verification.json`, `.work/source-hashes-current.json` |
| F02 | Transform boundaries and inspect alignment | Geographic WGS84 AOI aligns with points; known inside, outside, hole, and boundary fixtures classify correctly | Passed on synthetic boundary/hole fixtures and real AOI reconciliation; audited derived-only boundary repair | `tests/test_prepare_data.py`, `.work/import-integrity-verification.json` |
| F03 | Compare reference 2a, 2b, and Case 4 lineage | Shared or suspected observations recorded; equal coordinates or counts alone do not create definitive duplicate links | Passed on synthetic fixtures | `tests/test_prepare_data.py` (flagged in manifest `suspected_overlaps`, not merged) |
| F04 | Load unknown dates, method, rights, or evidence | Unknown remains visible; no fixed year, tier, field method, or fabricated measurement appears | Passed | `tests/js/test_domain.test.js`, browser verified in `tests/js/test_browser_interaction.test.js` |
| F05 | Load source class IDs into Case 1 mapping | Sawit source 1 becomes project 2; karet source 2 becomes project 1; original values remain available | Passed | `tests/js/test_domain.test.js`, `scripts/prepare-data.py` |
| F06 | Inspect the new interface and assets | Portal Data Epistem branding, no legacy product name or header logo, functioning collapsible panels and accessible controls | Passed | Playwright E2E in `tests/js/test_browser_interaction.test.js` |
| F07 | Save, refresh, and simulate storage failure | State recovers if saved; storage location is accurate; failed save never displays saved | Passed | `tests/js/test_state_and_storage.test.js`, browser reload verified |
| F08 | Validate taxonomy | Version and authority recorded; unique IDs, valid parents, no cycles, unresolved class mappings retained | Passed | `tests/js/test_domain.test.js` |

## Case 1: complement training data

| ID | Action | Expected outcome |
| --- | --- | --- |
| C1-01 | Open prepared or real project context, then sign in if needed | Same AOI, target year, actual image interval, classes, initial points, and target class survive; simulation is labelled |
| C1-02 | Inspect initial workspace | Data dari Luma #1 active; three classes shown; Lainnya says 0 titik and Belum tersedia; keyboard-accessible Add action exists |
| C1-03 | Activate a dataset and double-click an attribute row | Table and counts follow active dataset; map centres on and highlights the selected point |
| C1-04 | Start catalogue addition | Banner names Lainnya and offers Cancel; initial dataset remains unchanged during selection |
| C1-05 | Search with inside, outside, boundary, 2023, 2024, 2026, 2027, and unknown-time fixtures | Exact AOI and explicit 2024–2026 observation filter apply; publication year does not substitute; unknown time is explained separately |
| C1-06 | Search with no eligible results | User data retained; no empty combination created; controls allow filter revision |
| C1-07 | Compare card totals with filtered records | Counts equal current candidates, not source totals; 50 and 64 never appear as factual hard-coded values |
| C1-08 | Inspect third-party cards | View, add, edit, and delete actions follow permissions; Berlabel does not imply reviewed quality |
| C1-09 | Select all non-target classes | Rubber, palm, unresolved mixed classes, and zero-count classes are not silently selected; matching uses schema identity |
| C1-10 | Preview, Back, change selection, and Cancel | Preview totals update correctly; cancelling at either stage leaves all datasets and membership unchanged |
| C1-11 | Confirm an addition | Data Campuran #1 created privately and activated; original user and reference datasets unchanged; total and added count shown separately |
| C1-12 | Retry the same operation, then select an already imported observation | No duplicate membership; source identity governs deduplication; two distinct observations at identical coordinates are retained |
| C1-13 | Inspect combined attributes and lineage | Original label, source identity, source version, project class, import time, mapping version, and terms remain traceable |
| C1-14 | Change source version, permissions, or eligibility between preview and confirmation | Stale preview is rejected or refreshed with an explanation; confirmation cannot commit stale counts silently |
| C1-15 | Select older observations | Behaviour follows agreed D02 policy; temporal acceptance is recorded separately from tier and original observation date |
| C1-16 | Hide layers, pan, zoom, and export active dataset | Export membership unchanged; selecting an explicit subset changes scope and preview visibly |
| C1-17 | Export data with missing permission, incomplete metadata, or disputed quality | Clear exclusions and reasons shown; no silent reduction; resolve issues or confirm explicit subset |
| C1-18 | Download and inspect files independently | Geometry, class types, encoding, source lineage, manifest digests, and per-class totals agree with confirmed export |
| C1-19 | Trigger failed generation or download initiation and retry | Actionable failure state; no success claim without generated output; retry leaves dataset unchanged |
| C1-20 | Import into the specified Luma version as replacement training data | Export summary, file contents, and Luma per-class totals match; original plantation points are not appended twice |
| C1-21 | Inspect map and date narrative | Target year differs visibly from observation years and basemap year; no full-year 2026 imagery claim unless actual interval supports it |

Case 1 completion requires C1-20 with receiver evidence. Until then, state “portal export checked; Luma import unverified”. A local CSV parser is not a substitute. Check actual receiver replacement semantics and retain the exact tested input file and receiver version.

## Case 2: contribution and on-screen observations

| ID | Action | Expected outcome |
| --- | --- | --- |
| C2-01 | Start contribution from combined dataset | Owned observations separated from imported reference observations; ownership and source licences unchanged |
| C2-02 | Map plantation observations through taxonomy | Exact verified hierarchy used; no unsupported finer class assigned; source label retained |
| C2-03 | Compare field and screen observations | Methods, time, evidence, and uncertainty shown separately; neither method alone grants Tier 1 |
| C2-04 | Digitise against a dated imagery layer | Coordinates, imagery identity and time, interpretation, and reason captured; missing evidence produces explicit incomplete status |
| C2-05 | Inspect automatically populated attributes | No fixed canopy, hydrology, height, or other values masquerade as measurements |
| C2-06 | Submit an on-screen interpretation | High review priority set independently of tier; queue points to submitted interpretation version |
| C2-07 | Retry contribution and reload after interruption | No duplicate observation or submission; state and persistence label reflect actual storage |
| C2-08 | Attempt sharing without authority or completed metadata | Clear unresolved requirements; no automatic public publication or transfer of rights |

## Case 3: cross-sector reuse

| ID | Action | Expected outcome |
| --- | --- | --- |
| C3-01 | Open forestry workspace and discover partner data | Only authorised collections appear; real records distinguished from demo fixtures |
| C3-02 | Select suitable agricultural classes as Non-forest | Definitions and explicit mapping govern selection; uncertain classes require review |
| C3-03 | Inspect a reused record | Original contributor, collection method, observation time, evidence status, and terms remain traceable |
| C3-04 | Combine differently licensed sources | Source-specific terms retained; no blanket replacement licence; unknown permission blocks reuse or export as applicable |
| C3-05 | Export and change permissions before re-export | Current eligibility rechecked; prior manifest retained as history; current denial not bypassed by a saved selection |

## Case 4: independent review and quality

Execute after approval of D05–D06. For a shared pilot, use distinct authenticated accounts; for a local demo, record simulation explicitly.

| ID | Action | Expected outcome |
| --- | --- | --- |
| C4-01 | Open queue after Case 2 submission | Correct observation version and high priority shown; incomplete submissions not promoted into consensus |
| C4-02 | Inspect as a fresh reviewer | Location, dated imagery, and evidence shown; initial proposed label, tier, and earlier reviewer conclusions hidden |
| C4-03 | Submit as contributor, repeat reviewer, or same account twice | These actions do not satisfy independent-review counts |
| C4-04 | Obtain one valid review, then two agreeing independent reviews | Tier follows approved rubric; candidate adoption records actor, reasons, reviews, and version |
| C4-05 | Submit a contradictory review | Unresolved disagreement retained; no direct promotion or one-click dispute clearing |
| C4-06 | Change interpretation or supporting evidence after review | Version advances and quality reassesses; stale agreement not silently applied |
| C4-07 | Agree only at a parent class | Child-class quality is not inferred from parent agreement |
| C4-08 | Attempt Tier 1 without supporting field evidence | Tier 1 independent verification withheld; owner declaration remains separately labelled and private |
| C4-09 | Retry review or adoption after lost acknowledgement | One effective event; recoverable state; no extra independent votes |
| C4-10 | Export disputed or newly changed records | Eligibility reevaluated against current policy; consensus never grants usage permission automatically |

## Rehearsal and delivery

| ID | Action | Expected outcome |
| --- | --- | --- |
| R01 | Run Cases 1–4 in sequence and independently from reset | Predictable state, no previous-run contamination, and preserved lineage where cases connect |
| R02 | Disable network before startup and during work | Local scope behaves as documented; missing imagery labelled; drafts retained where supported; no false server-save claim |
| R03 | Inspect basemap service and imagery attribution | Actual provider, layer, period, and terms verified; offline asset use authorised before packaging |
| R04 | Navigate with keyboard and inspect colour-independent labels | All primary actions reachable; zero, error, selected, and quality states not conveyed only through colour |
| R05 | Rehearse at intended laptop and projector sizes | Map, counts, confirmation panels, catalogue, and table remain readable without clipped actions |
| R06 | Review Indonesian product copy | Natural technical prose, consistent terms, accurate metadata and integration claims |
| R07 | Inspect proposed release contents | No credentials, unauthorised government data, private reviewer details, or protected-folder modifications |

Before declaring completion, report which scope was delivered, decisions still open, checks passed or blocked, and actual Luma receiver evidence. No map-quality, regulatory-suitability, or multi-user-consensus claim follows solely from a successful portal demonstration.


## Independent acceptance evidence

These files are manager-owned checks and results, separate from agy's completion reports:

- `.work/verify-real-data.py` and `real-data-verification.json`: 3,231 observations, exact independent AOI counts, null source metadata, stable unique IDs and class mappings.
- `.work/import-integrity-verification.json`: ten unchanged source digests and ten deterministic derived files, excluding the run receipt.
- `.work/adversarial-acceptance.mjs`: public workflow checks for source preservation, ownership, sampling unknowns, reviewer identity/evidence, adoption, class projection and export rejection.
- `.work/verify-luma-package.py`: shapefile/CSV/GeoJSON reconciliation and the actual local Luma backend class-column selector. This cannot establish live server import.
- `.work/full-demo-review.md`: observed acceptance failures from the first full pass; each applicable finding needs a fix or an explicit unresolved result.

A passing nominal test suite is insufficient when an independent journey or downloaded artifact contradicts the approved behaviour. Keep final tests, screenshots, counts and remaining external limitations together in the verification report.


## Approved product revision, 12 October 2026

The user requested a tool-like interface rather than visible case steps and demonstration badges. Agy implements the application; Codex supervises and verifies. The revision replaces numbered navigation with task actions, adds Bagikan Data, uses a compact rectangular-swatch classification legend, removes the unmapped pseudo-class from the visible legend, and preserves the three Case 1 classes. Study context identifies Kabupaten Banyuasin and recording period 2026. These contextual labels do not fill missing source observation dates.

The earlier requirement to exclude observations with unknown rights or dates from every export conflicted with the requested usable private training workflow. The approved resolution separates export purposes: PRIVATE_TRAINING permits unknown metadata with acknowledgement and recorded warnings; SHARING retains strict permission checks. Neither changes source metadata nor promotes quality tiers. Explicit prohibited use, disputed interpretation, unsupported/unmapped class and outside-area records remain excluded. The 927-point private package retains null rights and observation dates. A private package does not grant permission to publish or redistribute its contents.

The requested OpenLandMap default is implemented using the actual OpenTopoMap provider observed in OpenLandMap's current application configuration on 12 October 2026. Alternatives are OpenStreetMap, EOX 2025 and neutral local background. Tile failures preserve the user's provider preference. Source folders remain read-only. Windows execution and live Luma import remain untested.
