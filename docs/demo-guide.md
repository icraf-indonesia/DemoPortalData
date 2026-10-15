# Local demonstration guide

This demonstration uses a local Leaflet browser application and prepared copies of source observations. It does not authenticate real reviewers, publish donations, synchronise between browsers, or run a Luma classification.

## Start the application

From the project directory, run:

```sh
python3 -m http.server 8765 --bind 127.0.0.1
```

Open `http://127.0.0.1:8765/`. The core application and vector data are local. The optional EOX 2025 imagery layer requires an internet connection and carries its own attribution and terms. It is not evidence for a 2026 observation date.

## Read the two modes

Source mode shows the available source metadata. Missing dates, contributors, methods, rights and quality evidence remain unknown. Scenario mode adds explicitly labelled assumptions for a local rehearsal. Scenario assumptions do not establish real consent, ownership or scientific verification.

Browser storage belongs to this browser profile and origin. It is not a shared database. A failed or blocked save must be treated as unsaved. Reset the demonstration only when its local drafts and private collections are no longer needed.

## Rehearse the four cases

1. In Case 1, inspect the plantation collection and the empty Lainnya class. Select a reference collection, inspect the mapping and provenance, then confirm a private combination. Source archives remain unchanged.
2. In Case 2, open Bagikan Data, select the owned plantation or mixed collection, and review the 240 owned observations separated from borrowed references. Choose an Epistem leaf for each project class. Enter the researcher, institution and technical email and accept responsibility before confirming publication. Data Terbuka shows the saved collection and offers its GeoJSON download. The private original remains intact. Sampling di Peta remains a separate optional interpretation workflow.
3. Switch to Pengguna B. In Data Mitra, select the actual Case 2 publication and inspect its institution, 2026 declaration and taxonomy mapping. Preview 240 Non-hutan candidates alongside 86 forest observations, then confirm the 326-point private collection. Reload and repeat reuse to confirm zero new points. The public publication remains unchanged.
4. In Case 4, use the labelled simulated reviewer identities. Enter an independent class, reason and evidence. Two agreeing reviews create a candidate. An authorised simulated actor must explicitly adopt it with a reason. Disagreement and stale reviews must remain visible and cannot be used to certify a changed interpretation.

## Inspect an export

Review eligible and excluded records. Exceptional quality inclusions require explicit opt-in and do not grant usage permission. Confirm any partial export before downloading. The ZIP contains a point Shapefile, CSV, GeoJSON and manifest. The manifest records the class schema, provenance, exclusions and assumptions.

Local structural compatibility checks can inspect these bytes and Luma's column-selection function. They do not prove a live Luma import. The receiving service remains untested until a separate authorised integration check is performed.

## Acceptance status

Use `verification-plan.md` and the supervisor evidence when deciding whether the current build is accepted. This guide describes the intended rehearsal. It is not a substitute for passing browser persistence, permission and export checks.


## Approved product revision, 12 October 2026

The user requested a tool-like interface rather than visible case steps and demonstration badges. Agy implements the application; Codex supervises and verifies. The revision replaces numbered navigation with task actions, adds Bagikan Data, uses a compact rectangular-swatch classification legend, removes the unmapped pseudo-class from the visible legend, and preserves the three Case 1 classes. Study context identifies Kabupaten Banyuasin and recording period 2026. These contextual labels do not fill missing source observation dates.

The earlier requirement to exclude observations with unknown rights or dates from every export conflicted with the requested usable private training workflow. The approved resolution separates export purposes: PRIVATE_TRAINING permits unknown metadata with acknowledgement and recorded warnings; SHARING retains strict permission checks. Neither changes source metadata nor promotes quality tiers. Explicit prohibited use, disputed interpretation, unsupported/unmapped class and outside-area records remain excluded. The 927-point private package retains null rights and observation dates. A private package does not grant permission to publish or redistribute its contents.

The requested OpenLandMap default is implemented using the actual OpenTopoMap provider observed in OpenLandMap's current application configuration on 12 October 2026. Alternatives are OpenStreetMap, EOX 2025 and neutral local background. Tile failures preserve the user's provider preference. Source folders remain read-only. Windows execution and live Luma import remain untested.

## Map workspace controls

Use Ciutkan at the top of either side panel to hide it. Reopen it with Skema Klasifikasi or Katalog Data. Both panels can be hidden simultaneously. Use Buka Tabel at the bottom to open the observation drawer. The map continues behind the overlays, and visibility changes retain your pan and zoom. The browser remembers visibility preferences.
