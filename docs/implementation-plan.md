# Implementation plan

Status: the approved local four-case demonstration is implemented and integrated. Codex supervised and verified agy-written application changes. The importer passes15 regressions; the application passes40 JavaScript/browser tests,31 independent domain checks and the extended adoption/export browser journey. See [acceptance report](acceptance-report.md). Live Luma import and real shared identities/storage remain unverified.

## Intended outcome

Demonstrate how a Banyuasin user complements training samples, contributes observations, reuses partner data, and participates in evidence-based review. The original brief calls for Case 1 to end with a successful Luma import. The approved local demonstration delivers a structurally checked combined training ZIP; live receiver acceptance remains unresolved. It does not establish map accuracy or suitability for a regulatory purpose.

The four cases introduce different capabilities, but may reuse the same selection, provenance, and export controls. Narrative progression does not require four separate implementations.

## Observed starting point

S4 is a browser demonstration with `index.html`, `styles.css`, `app.js`, embedded `data.js`, `demo.js`, local Leaflet assets, SQLite WASM assets, and existing logic, export, and browser tests. Workspace state and persona switching are implemented in `app.js`; persona switching is not authentication. Useful foundations include the map, classification tree, attribute table, candidate filtering, and class projection.

Do not copy its fixed digitisation attributes, direct Tier 2 assignment, or browser messaging bridge as validated behaviour. The earlier specification and technical proposal remain drafts. That initial planning pass did not run the application. Subsequent implementation and test evidence is recorded in the acceptance report.

S8 inspection found the following DBF header record counts. These are not verified counts of valid, distinct, in-AOI, export-eligible observations.

| Archive | Declared records | Fields of interest | Declared CRS |
| --- | ---: | --- | --- |
| `Banyuasin_F.zip` | 1 | `WADMKK`, `Ha` | WGS84 UTM Zone 48S |
| `Sumsel_F.zip` | 18 | `WADMKK`, `Ha` | WGS84 UTM Zone 48S |
| `Data_kebun_sawit_karet_F.zip` | 241 | `Id_LULC`, `LULC` | Geographic WGS84 |
| `Data_ref_mod_F.zip` | 747 | `Id_drm`, `Dt_ref_mod` | Geographic WGS84 |
| `Data_ref_mod_2b.zip` | 747 | Above plus `Id_LULCrcl`, `LULCrcl` | Geographic WGS84 |
| `Data_hutan.zip` | 87 | `Id_LULC`, `LULC` | Geographic WGS84 |
| `Data_sawah.zip` | 167 | `Id_LULC`, `LULC` | Geographic WGS84 |
| `Case4_data_kombinasi_F.zip` | 1,242 | `Id_LULCrcl`, `LULCrcl` | Geographic WGS84 |

Sample DBF schemas contain no observation dates, review tiers, contributor details, or licences. Other metadata and rights evidence still need assessment. Neither the `Tier1or2or3` folder name nor equal record counts establish quality or record equivalence.

## Conflict and decision register

Resolved means the latest brief supplies the planning rule. Proposed means a recommendation needing product agreement before dependent implementation. Blocked means evidence is missing, not that all planning must stop.

| ID | Conflicting requirements or missing evidence | Planning treatment | Status |
| --- | --- | --- | --- |
| D01 | S1 suggests a Luma context bridge; S5 requires verified file exchange; S2 permits prepared context | Recommend a visibly labelled simulated inbound handover and real file export. Live integration requires a receiver contract and separate scope. | Proposed |
| D02 | S1 says `2026 ± 2`; S2 specifies 2024–2026; S3 rejects universal time tolerance | Use explicit 2024–2026 for discovery in this scenario. Keep temporal fitness separate. Recommend recorded acknowledgement and reason for older observations. | Discovery resolved; fitness policy open |
| D03 | S1 assumes `ID_Kelas` and `KelasTupla` suffice; S2 and S5 require receiver proof | Identify Luma version and a successfully imported example. Define adapter only after inspection and verify actual import. | Blocked on receiver evidence |
| D04 | Source CSV assigns sawit 1, karet 2, non kebun 3 with teal, brown, tan; S2 uses Karet 1, Kelapa sawit 2, Lainnya 3 with purple, pink, grey | Preserve source IDs and colours. Use a versioned project mapping and separate display colours. | Resolved |
| D05 | S1 uses internal review and gold-standard labels; S3 requires independent review and evidence | Recommend S3's derived rubric. Missing essential information is incomplete, not automatically Tier 4. Field origin alone does not grant Tier 1. | Proposed |
| D06 | S1 requests voting and promotion; S3 requires independent interpretations and adoption | Recommend version-specific independent reviews, unresolved-dispute tracking, and recorded adoption. No arbitrary promotion button. | Proposed |
| D07 | S1 requests offline resilience; S3's shared pilot requires real identities and confirmed central storage | Separate controlled local demonstration from shared workshop service. Recommend local labelled demo for this scope; a shared service requires additional design and approval. | Open scope decision |
| D08 | S1 and prototype use Leaflet; an older draft proposes a different full stack | Recommend retaining Leaflet and browser modules for the local demo. No framework or backend migration is approved. | Proposed, depends on D07 |
| D09 | S2 requests OpenLandMap and EOX Cloudless 2025; existing app uses Esri services | Verify exact layers, coverage, dates, attribution, access, and offline permissions before selecting providers. Do not silently substitute imagery or claim 2025 imagery proves 2026 conditions. | Blocked on service evidence |
| D10 | Brief assumes dated, open, reviewed reference points; inspected DBFs lack those facts | Seek source-backed metadata. Unknown records fail strict eligibility. Label any scenario fixtures explicitly; never overwrite source truth. | Evidence needed |
| D11 | S2 lists built-up and water collections and earlier counts 50 and 64; these are not verified separate collections in inspected inventory | Omit unverified cards or use explicitly labelled, approved scenario fixtures. Derive all displayed counts from selected records. | Proposed |
| D12 | S1 calls taxonomy authoritative and 22-class; prototype alone is not authority | Obtain a versioned class list and definitions. Resolve ambiguous or mixed plantation classes before mapping. | Evidence needed |
| D13 | Initial export follows visible map; S2 exports active dataset | Export all eligible members of the active dataset by default, independent of visibility and viewport. Show exclusions and require explicit partial selection. | Resolved |
| D14 | Contribution follows combined dataset; imported reference points are not newly owned observations | Contribute only owned observations, preserving imported-source lineage separately. No ownership or licence reassignment. | Resolved |
| D15 | Initial narrative implies cloud-free imagery and a completed usable map | S2 uses actual image dates and cloud screening. Map evaluation remains separate from portal completion. | Resolved |
| D16 | S2 expects all combined points to return to Luma; S3 excludes incomplete, disputed, or unauthorised records | Display eligibility before combination and again before export. No silently reduced download. Resolve exclusions or explicitly confirm a subset. | Proposed |

## Proposed architecture and file ownership

These paths describe the planned module responsibilities. Implemented files and acceptance evidence are recorded separately. Start with reusable interactions from S4, then isolate responsibilities needed for the cases. Avoid carrying historical screenshots, unrelated documents, embedded legacy data, or old Git metadata into the new project.

| Proposed path | Responsibility |
| --- | --- |
| `index.html`, `styles.css` | Neutral branding, map-centred layout, accessible controls, collapsible catalogue and table |
| `src/domain/records.js`, `taxonomy.js`, `eligibility.js` | Source records, project mappings, and explainable eligibility |
| `src/data/catalogue.js`, `source-adapters.js` | Validated source loading, inventory, spatial and temporal selection |
| `src/state/workspace.js`, `storage.js` | Active dataset, staged additions, persistence status, recovery |
| `src/ui/map.js`, `catalogue.js`, `classification.js`, `attribute-table.js` | Views over workspace state |
| `src/features/complement.js`, `contribute.js`, `partner-reuse.js`, `review.js` | Four use-case workflows |
| `src/export/luma-adapter.js`, `manifest.js` | Receiver-specific output and lineage manifest |
| `src/demo/scenarios.js` | Labelled fixtures, case entry points, deterministic reset |
| `scripts/prepare-data.py` | Repeatable read-only source ingestion and derived outputs |
| `data/derived/`, `data/demo/` | Separate source-derived records and labelled scenario metadata |
| `tests/domain/`, `tests/browser/`, `tests/exports/` | Behaviour checks and receiver reconciliation |

Data flow is source archive → validated source observations → project mapping and selection → confirmed dataset membership → eligibility recheck → export adapter and manifest. Reviews create versioned interpretations; they do not overwrite the original source label.

## Sprint 0: establish the Banyuasin foundation

Depends on implementation approval and D07–D08 scope selection. D09–D12 evidence collection can proceed alongside source inspection.

1. Build a reproducible inventory with archive digests, field definitions, encoding, CRS, geometry validation, and record reconciliation. Compare 2a, 2b, and Case 4 for shared observations before assigning independent identities.
2. Reproject AOI geometry to geographic WGS84, preserving source CRS and geometry references. Check alignment and point inclusion against the polygon, not only its bounding box.
3. Implement the contracts in `records`, `taxonomy`, and source adapters. Preserve null metadata and unresolved mappings.
4. Establish the three-panel workspace and collapsible attribute table. Remove legacy branding and header logo from the new app. Identify any necessary historical migration references separately.
5. Implement honest storage and simulation labels. Define replay fixtures separately from source-derived records.

Exit: one Banyuasin dataset loads with traceable source identity, validated geometry, class totals, and explicit missing metadata. Counts reconcile through included, excluded, and invalid categories. No fabricated dates or quality fields.

## Sprint 1: complete Case 1

Depends on Sprint 0, D01–D04, D10–D13, and D16. D03 gates the final end-to-end claim.

1. Load project context: AOI, target year, actual image interval, classes 1 Karet, 2 Kelapa sawit, 3 Lainnya, user observations, and target class. Restore the same context after demo sign-in.
2. Activate **Data dari Luma #1**. Show all three classes, including **0 titik · Belum tersedia** for Lainnya. Show missing metadata details and **Tersimpan di browser ini** only after successful local persistence.
3. Open **Tambah data → Dari katalog terbuka** with a cancellable banner. Stage changes without mutating datasets. Search within Banyuasin and observed years 2024–2026; exclude unknown dates from strict results and explain them separately.
4. Display candidate counts after filtering. Keep **Berlabel** separate from verified quality. Offer only actions permitted for that source.
5. Map selected source class identities into project class 3. Provide **Pilih semua kelas selain karet dan kelapa sawit**, excluding ambiguous classes pending review. Disable zero-count rows. Keep the selected class membership explicit.
6. Show **Tinjau penambahan**, source version, dates, per-class counts, duplicates, exclusions, and usage terms. Support Back, Cancel, and **Konfirmasi penambahan**. Revalidate before committing.
7. Create private **Data Campuran #1**, preserving the initial and reference datasets. Deduplicate by stable source identity, not coordinates. Show total and latest added count separately. Display project and source classes in the table.
8. Implement **Ekspor dataset aktif** with explicit scope, eligibility and count preview, download errors, and safe retries. Pan, zoom, and layer hiding do not affect membership.
9. Import the combined file into the target Luma version as a replacement for the original training dataset. Reconcile class totals across preview, file, and receiver.

Exit: all Case 1 checks pass, including actual Luma import. Until then report portal-only verification and receiver status separately. No digitisation is required in Case 1.

## Sprint 2: contribute and digitise in Case 2

Depends on source taxonomy, ownership rules, D05, and persistence scope.

1. Select owned observations for contribution without claiming imported reference records as new contributions.
2. Map source classes into the versioned hierarchy, including the proposed tree-based system → monoculture → rubber or oil-palm path only after taxonomy verification.
3. Record collection method, observation time, evidence, rights, and completeness. Completion of classification in Luma does not verify observations.
4. Add on-screen points with imagery source, acquisition date or interval, location, interpretation, uncertainty, and reason. Never supply fixed canopy, height, or other measurements as if observed.
5. Assign high review priority to new screen interpretations, separately from tier. Preserve drafts and retry safely under the chosen storage model.

Exit: field and screen observations retain distinct provenance; unresolved metadata remains visible; a contribution is recoverable; the Case 4 queue receives the submitted version.

## Sprint 3: partner reuse, review, and rehearsal

Divide this sprint into three sequential acceptance gates. Case 4 is domain work, not final cosmetic polish.

1. **Case 3:** discover authorised partner collections, subset suitable non-forest classes, preserve contributor and source terms, and record class mapping and temporal fitness. Reuse selection and export functions from Case 1.
2. **Case 4:** implement the agreed independent-review rubric, evidence inspection, version-bound answers, disagreement handling, adoption, and derived quality. Use separate identified reviewers for a shared service. A local role demonstration must be labelled simulated.
3. **Rehearsal:** add case entry points and repeatable reset, verify complete sequences and restart recovery, inspect Indonesian copy and keyboard access, and test network loss. Use local assets only where authorised. An unavailable basemap must not invalidate saved work or masquerade as loaded imagery.

Exit: each case passes its acceptance gate. If evidence or scope blocks real shared review, report that limitation rather than marking simulated consensus as verified multi-user operation.

## Throughput checkpoint and decisions to obtain

The smallest useful implementation batch is one source-backed observation through loading, projection, preview, and export. The likely constraints are metadata evidence, the Luma receiver contract, and the local-demo versus shared-service decision. Reusing map interactions reduces UI work but does not resolve those constraints.

At each sprint exit, record passed checks, failed checks, missing external evidence, and the next demonstrable flow. Do not estimate completion from file counts. No schedule commitment is made before resolving D03 and D07.

The first product decisions are D01 integration mode, D02 treatment of older observations, D03 target Luma version and sample, and D07 delivery scope. D05–D06 require explicit confirmation of the review rubric before Case 4 implementation.


## Approved local scope and additional findings

The user approved the Sprint 0 proposal, then authorised implementation of the plan overnight with the Luma reference style. For this local demonstration, D01 and D07 use visibly simulated context and roles; D08 retains Leaflet and browser modules. D05–D06 use the proposed independent, version-specific review model as a simulation. They do not establish authenticated independent reviewers or central storage. D10 permits a separate, labelled scenario overlay; the source fields remain unknown. D11 omits unverified built-up/water collections. D16 requires explicit export exclusions.

| ID | Finding or conflict | Local treatment | Remaining evidence |
| --- | --- | --- | --- |
| D17 | Earlier brief says 22 taxonomy leaves; the previous prototype contains 21 | Reuse only as a provisional demonstration hierarchy; do not invent a missing class | Authoritative versioned taxonomy and definitions |
| D18 | Banyuasin and two Sumsel boundary records contain invalid rings | Explicit `--repair-invalid-boundaries` applies `shapely.make_valid` to derived geometry and records the defect, digest and area change | Suitability for uses beyond this demonstration |
| D19 | Luma source accepts ZIP shapefiles and selects a matching class column; actual receiver is unavailable | Candidate package uses numeric `class_id` first, plus CSV, GeoJSON and manifest; validate locally | Successful import in the selected live Luma version |
| D20 | Requested 2025 imagery does not establish 2026 observation dates | Optional EOX 2025 mosaic, dated attribution, no invented scene date; plain map fallback | Exact imagery evidence for each interpretation |

Real ingestion produced 3,231 point records across six source collections: 3,225 inside Banyuasin and six outside. These are not necessarily independent observations; suspected coordinate overlaps remain flagged without automatic merging. Archive totals remain separate from active in-AOI membership. All ten source-file digests match the pre-run baseline. Repeat derived files are identical apart from the run receipt. See `.work/real-data-verification.json`, `.work/import-integrity-verification.json` and `data/derived/boundary-repair-report.json`. These checks establish ingestion consistency for this local demonstration, not map accuracy.


## Approved product revision, 12 October 2026

The user requested a tool-like interface rather than visible case steps and demonstration badges. Agy implements the application; Codex supervises and verifies. The revision replaces numbered navigation with task actions, adds Bagikan Data, uses a compact rectangular-swatch classification legend, removes the unmapped pseudo-class from the visible legend, and preserves the three Case 1 classes. Study context identifies Kabupaten Banyuasin and recording period 2026. These contextual labels do not fill missing source observation dates.

The earlier requirement to exclude observations with unknown rights or dates from every export conflicted with the requested usable private training workflow. The approved resolution separates export purposes: PRIVATE_TRAINING permits unknown metadata with acknowledgement and recorded warnings; SHARING retains strict permission checks. Neither changes source metadata nor promotes quality tiers. Explicit prohibited use, disputed interpretation, unsupported/unmapped class and outside-area records remain excluded. The 927-point private package retains null rights and observation dates. A private package does not grant permission to publish or redistribute its contents.

The requested OpenLandMap default is implemented using the actual OpenTopoMap provider observed in OpenLandMap's current application configuration on 12 October 2026. Alternatives are OpenStreetMap, EOX 2025 and neutral local background. Tile failures preserve the user's provider preference. Source folders remain read-only. Windows execution and live Luma import remain untested.
