# Data contracts

Engineering contract version 0.1 with implementation clarifications, 11 October 2026. These are engineering contracts for review, not verified source metadata or a validated Luma import schema. Decision IDs refer to the [implementation plan](implementation-plan.md#conflict-and-decision-register).

## Common conventions

All fields listed below are required unless marked optional. A nullable field must be present with `null` when unknown. Empty strings, zero, guessed dates, and invented identities do not represent unknown values. IDs are non-empty opaque strings, versions are positive integers, timestamps are ISO 8601 UTC strings, and dates use `YYYY-MM-DD`. Arrays may be empty unless constrained below. Referenced entities must exist in the same package or a resolvable source registry.

Keep three distinct layers: original source values, current versioned interpretation, and project-specific class projection. Keep demonstration assumptions in a separate fixture overlay with an explicit assumption list. They must not become verified values through export or contribution.

## Source dataset and observations

| Entity | Fields and types | Invariants |
| --- | --- | --- |
| `SourceDataset` | `dataset_id: ID`; `dataset_version: integer`; `title: string`; `archive_sha256: string`; `source_crs: string`; `source_schema_id: ID`; `publication_year: integer or null`; `contributor_id: ID or null`; `rights_id: ID or null`; `metadata_evidence_refs: ID[]`; `lineage_dataset_ids: ID[]` | Digest identifies inspected bytes. Publication year never fills observation time. Dataset lineage identifies derived collections without treating them as independent evidence. |
| `SourceObservation` | `observation_id: ID`; `observation_version: integer`; `dataset_id: ID`; `dataset_version: integer`; `source_point_id: string or null`; `identity_basis: native_id or archive_record_index`; `source_record_index: integer`; `geometry: GeoJSON Point`; `source_class_id: string or null`; `source_class_label: string or null`; `source_schema_id: ID`; `observed_time: TimeValue or null`; `method: field_survey or image_interpretation or unknown`; `contributor_id: ID or null`; `rights_id: ID or null`; `evidence_refs: ID[]`; `raw_attributes: object`; `imported_at: timestamp` | Canonical geometry uses longitude, latitude in EPSG:4326. Preserve raw source attributes and CRS through the dataset reference. Source identity is not the LULC class code. |
| `TimeValue` | `precision: day or year or interval or unknown`; `start: date or null`; `end: date or null`; `year: integer or null`; `basis: source or declared or unknown`; `evidence_ref: ID or null` | Day requires equal start and end, year null. Year requires year only. Interval requires start ≤ end, year null. Unknown requires all value fields null. Declaration is distinguishable from source evidence. |
| `Contributor` | `contributor_id: ID`; `display_name: string`; `organisation: string or null`; `identity_status: source_recorded or verified_account or demo_role` | A demo role cannot count as verified identity in shared-service acceptance. |

Where no point ID exists, generate a stable import identity from dataset ID, immutable archive digest, and source record index. Record that basis explicitly. A changed archive needs identity reconciliation; row position does not guarantee the same observation across versions. Cross-dataset duplicates require explicit lineage links or review. Coordinates alone never establish duplication.

## Evidence, completeness, and rights

| Entity | Fields and types | Invariants |
| --- | --- | --- |
| `Evidence` | `evidence_id: ID`; `kind: field_record or imagery or source_metadata or declaration`; `source_ref: string`; `observed_time: TimeValue or null`; `recorded_at: timestamp`; `recorded_by: ID`; `supports: string[]`; `imagery_layer: string or null`; `spatial_support: string or null`; `access: owner or collaborators or public` | Imagery date is acquisition time, not tile access time. Record footprint or spatial support when known. Evidence for a broad class does not automatically support its child. |
| `Completeness` | `status: incomplete or complete`; `missing_fields: string[]`; `checked_at: timestamp`; `rules_version: string` | Complete requires no missing essential fields under the named rules. Missing metadata is independent of tier. Essential-field rubric must be approved. |
| `Rights` | `rights_id: ID or null`; `holder: string or null`; `licence_id: string or null`; `terms_ref: string or null`; `attribution: string or null`; `permission_evidence_ref: ID or null`; `view_permission: allowed or denied or unknown`; `reuse_permission: allowed or denied or unknown`; `export_permission: allowed or denied or unknown`; `share_permission: allowed or denied or unknown`; `scope: string or null`; `checked_at: timestamp or null` | View access does not grant reuse, export, or sharing. Unknown permission does not pass export eligibility. Preserve each source's terms in combined datasets. |

No licence default is inferred from a source folder or contributor organisation. These fields record permission evidence; they do not implement a general legal compatibility engine.

## Taxonomy, project, and class mapping

| Entity | Fields and types | Invariants |
| --- | --- | --- |
| `Taxonomy` | `schema_id: ID`; `version: integer`; `authority_ref: string or null`; `status: provisional or confirmed`; `nodes: TaxonomyNode[]` | No claim of an authoritative 22-class scheme until D12 is resolved. |
| `TaxonomyNode` | `class_id: string`; `parent_id: string or null`; `label: string`; `definition: string`; `is_leaf: boolean` | IDs unique within a schema version. Parent exists; no cycles. |
| `Project` | `project_id: ID`; `aoi_id: ID`; `aoi_geometry: GeoJSON Polygon or MultiPolygon`; `aoi_version: integer`; `target_year: integer`; `image_interval: TimeValue`; `classes: ProjectClass[]`; `discovery_start_year: integer`; `discovery_end_year: integer`; `context_mode: prepared_demo or verified_import`; `context_version: integer` | AOI is EPSG:4326. Image dates reflect the actual Luma project; unknown until supplied. For Case 1 discovery years are 2024 and 2026. |
| `ProjectClass` | `class_id: integer`; `label: string`; `colour: six-digit hex string`; `definition: string` | Case 1 has 1 Karet, 2 Kelapa sawit, 3 Lainnya. Exact purple, pink, and grey hex colours are a UI choice to finalise. |
| `ClassMapping` | `mapping_id: ID`; `version: integer`; `project_id: ID`; `source_schema_id: ID`; `source_schema_version: integer`; `source_class_id: string or null`; `target_class_id: integer or null`; `status: resolved or needs_review or excluded`; `reason: string`; `confirmed_by: ID or null`; `confirmed_at: timestamp or null` | Resolve by class identity and definition, never name similarity alone. An unresolved mapping is not exportable. Lainnya is a project aggregate, not a replacement source taxonomy node. |
| `TemporalFitness` | `project_id: ID`; `observation_id: ID`; `observation_version: integer`; `decision: pending or accepted or rejected`; `reason: string or null`; `decided_by: ID or null`; `decided_at: timestamp or null` | D02 proposes explicit acceptance for older observations. Discovery inclusion does not itself establish fitness for 2026. |

The Case 1 source CSV mapping is sawit source ID 1 → project ID 2, karet source ID 2 → project ID 1. Source ID 3 is labelled Non kebun; assess its definition before mapping it to project Lainnya. Do not apply this mapping to unrelated schemas with coincident IDs.

## Workspace datasets and staged additions

| Entity | Fields and types | Invariants |
| --- | --- | --- |
| `WorkspaceDataset` | `workspace_dataset_id: ID`; `version: integer`; `project_id: ID`; `name: string`; `owner_id: ID`; `visibility: private or collaborators or public`; `parent_dataset_refs: DatasetRef[]`; `members: ProjectPoint[]`; `created_at: timestamp` | Combination creates a new private dataset. Parents and source observations remain unchanged. `DatasetRef` contains dataset ID and version. |
| `ProjectPoint` | `project_point_id: ID`; `observation_id: ID`; `observation_version: integer`; `source_dataset_id: ID`; `source_dataset_version: integer`; `source_point_id: string or null`; `interpretation_version: integer or null`; `mapping_id: ID`; `mapping_version: integer`; `target_class_id: integer`; `imported_at: timestamp`; `added_by: ID` | One member per canonical source observation identity. An update replaces the pinned version explicitly; it is not a second observation. Original and projected classes remain traceable. |
| `AdditionDraft` | `operation_id: ID`; `project_id: ID`; `base_dataset_ref: DatasetRef`; `target_class_id: integer`; `selected_source_refs: ObservationRef[]`; `mapping_refs: VersionRef[]`; `filter_snapshot: object`; `included_count: non-negative integer`; `excluded: Exclusion[]`; `status: selecting or previewing or confirmed or cancelled` | Preview is non-mutating. Confirmation validates the base version, permissions, and eligibility again. Repeated operation ID returns the same result. Cancel creates no dataset. |
| `Exclusion` | `observation_ref: ObservationRef`; `reason: duplicate or outside_aoi or unknown_time or outside_period or unresolved_mapping or incomplete or disputed or permission_missing or quality_policy or temporal_fitness_pending` | Provide actionable reason counts. `ObservationRef` holds observation ID and version. `VersionRef` holds entity ID and version. |
| `PersistenceState` | `location: memory or browser or server`; `status: draft or saving or saved or failed`; `confirmed_at: timestamp or null`; `error_message: string or null` | Saved requires successful acknowledgement from the selected storage. Browser storage is never labelled as account storage. |

Use exact AOI polygon inclusion, including its boundary, as the proposed spatial rule. Document how interval dates intersect a discovery period; proposed rule is interval overlap with visible source precision, not an invented exact date. Revalidate counts when filters, permissions, source versions, or mappings change.

## Interpretation and review

These contracts implement the recommended D05–D06 resolution and remain subject to approval.

| Entity | Fields and types | Invariants |
| --- | --- | --- |
| `Interpretation` | `observation_id: ID`; `interpretation_version: integer`; `schema_id: ID`; `class_id: string`; `author_id: ID`; `evidence_refs: ID[]`; `reason: string`; `uncertainty: string or null`; `created_at: timestamp` | Append versions; preserve original source classification. |
| `Review` | `review_id: ID`; `observation_id: ID`; `interpretation_version: integer`; `reviewer_id: ID`; `proposed_class_id: string`; `evidence_refs: ID[]`; `reason: string`; `submitted_at: timestamp`; `independence_status: pending or confirmed or invalid` | Reviewer differs from contributor. Hide proposed label, tier, and earlier conclusions before submission. Count one current valid answer per reviewer and version. |
| `Adoption` | `adoption_id: ID`; `observation_id: ID`; `interpretation_version: integer`; `review_ids: ID[]`; `adopted_class_id: string`; `actor_id: ID`; `reason: string`; `adopted_at: timestamp` | Actor is authorised contributor or Admin. Adoption references qualifying reviews; it cannot override unresolved contradictions or grant tier directly. |
| `QualityAssessment` | `observation_id: ID`; `interpretation_version: integer`; `completeness: Completeness`; `tier: 1 or 2 or 3 or 4 or null`; `rubric_version: string`; `basis_review_ids: ID[]`; `basis_evidence_ids: ID[]`; `dispute: none or unresolved or resolved`; `review_priority: normal or high`; `assessed_at: timestamp` | Incomplete records have null tier in this proposed model. New screen interpretations have high priority, which does not itself determine quality. |
| `OwnerDeclaration` | `observation_id: ID`; `observation_version: integer`; `owner_id: ID`; `evidence_refs: ID[]`; `reason: string`; `declared_at: timestamp`; `scope: private` | Separately labels the S3 private owner-declared Tier 1 exception. Never replaces independent quality or authorises public reuse. |

Proposed rubric: Tier 4 means essential metadata complete with no independent support; Tier 3 requires one independent reviewer; Tier 2 requires two independent reviewers other than the contributor, agreement on the same version, and no unresolved contradiction; Tier 1 additionally requires documented field evidence supporting the specific class, location, and period. Detailed Tier 1 evidence criteria remain open. Changes trigger reassessment; prior reviews do not silently transfer to a changed version.

## Export and demonstration fixtures

| Entity | Fields and types | Invariants |
| --- | --- | --- |
| `ExportRequest` | `export_id: ID`; `dataset_ref: DatasetRef`; `scope: active_dataset or explicit_subset`; `subset_point_ids: ID[]`; `include_tier3: boolean`; `include_own_unreviewed: boolean`; `receiver_contract_id: ID or null`; `requested_at: timestamp` | Subset IDs empty for active-dataset scope. Both exceptional quality options default false and have separate confirmations. Layer visibility and viewport are absent from export criteria. |
| `ExportManifest` | `export_id: ID`; `dataset_ref: DatasetRef`; `project_snapshot: Project`; `point_refs: ObservationRef[]`; `mapping_refs: VersionRef[]`; `source_refs: DatasetRef[]`; `rights_refs: ID[]`; `counts_by_class: object`; `excluded: Exclusion[]`; `warnings: string[]`; `export_options: ExportRequest`; `files: ExportFile[]`; `generated_at: timestamp`; `receiver_verification: untested or passed or failed`; `fixture_assumptions: string[]` | Records actual included versions, attribution, temporal decisions, quality limitations, and source terms in accompanying package records. Receiver status needs evidence, not a locally valid file. |
| `ExportFile` | `name: string`; `format: csv or geojson or json`; `sha256: string`; `record_count: non-negative integer` | Downloaded contents reconcile with the manifest. |
| `DemoOverlay` | `fixture_id: ID`; `version: integer`; `source_refs: DatasetRef[]`; `assumptions: string[]`; `scenario_metadata: object`; `simulated_roles: ID[]`; `label: string` | Visibly identify simulation. Export retains assumption labels. A fixture cannot pass a source-evidence or real multi-user acceptance check. |

Historical S3 proposal, superseded for PRIVATE_TRAINING by the approved 12 October revision below: independently verified Tier 1 and undisputed Tier 2 are default candidates with clear permissions; Tier 3 is an explicit option; complete, undisputed owner Tier 4 is a separate opt-in for provisional own use. Third-party Tier 4, incomplete, disputed, or unauthorised observations are excluded. Show any change from dataset membership before download and require an explicit subset choice or correction.

CSV and GeoJSON plus a JSON manifest are proposed package outputs. `ID_Kelas` and `KelasTupla` are historical candidate receiver fields only. Do not freeze column names, class types, coordinate order, geometry representation, encoding, or replacement behaviour until D03 is verified against the actual Luma version. Detailed reviewer identities, review discussions, photographs, and attachment URLs do not belong in the training export.


## Source-backed implementation clarifications

The real archives contain no observation dates, contributor identities, rights or quality evidence. Those values are nullable. Reference 2a contains point identifiers without land-cover classes, so both source class fields are null. Initial plantation records have no native point identifier; their identity uses archive digest and physical DBF row index. These are source findings, not incomplete values to replace with defaults.

The canonical importer writes reproducible source records and a deterministic manifest. Run time is recorded separately in `run-receipt.json`; it must not change stable source identity. Geometry repairs require the explicit CLI option and an audit entry. Source archive bytes remain unchanged.

Demonstration overlays can supply scenario years, roles, permissions or quality for a controlled journey. Original source metadata remains available alongside the overlay, and exported assumptions must be labelled. A simulated permission cannot authorise production reuse. The provisional prototype hierarchy has 21 leaves; the requested authoritative 22-class taxonomy remains unresolved.


## Approved product revision, 12 October 2026

The user requested a tool-like interface rather than visible case steps and demonstration badges. Agy implements the application; Codex supervises and verifies. The revision replaces numbered navigation with task actions, adds Bagikan Data, uses a compact rectangular-swatch classification legend, removes the unmapped pseudo-class from the visible legend, and preserves the three Case 1 classes. Study context identifies Kabupaten Banyuasin and recording period 2026. These contextual labels do not fill missing source observation dates.

The earlier requirement to exclude observations with unknown rights or dates from every export conflicted with the requested usable private training workflow. The approved resolution separates export purposes: PRIVATE_TRAINING permits unknown metadata with acknowledgement and recorded warnings; SHARING retains strict permission checks. Neither changes source metadata nor promotes quality tiers. Explicit prohibited use, disputed interpretation, unsupported/unmapped class and outside-area records remain excluded. The 927-point private package retains null rights and observation dates. A private package does not grant permission to publish or redistribute its contents.

The requested OpenLandMap default is implemented using the actual OpenTopoMap provider observed in OpenLandMap's current application configuration on 12 October 2026. Alternatives are OpenStreetMap, EOX 2025 and neutral local background. Tile failures preserve the user's provider preference. Source folders remain read-only. Windows execution and live Luma import remain untested.
