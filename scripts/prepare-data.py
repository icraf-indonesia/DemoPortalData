#!/usr/bin/env python3
"""
scripts/prepare-data.py - Data ingestion and inventory tool for Portal Data Epistem.

Sprint 0 implementation:
- Inventories ZIP shapefiles and CSV files recursively with sorted traversal.
- Guards output-dir against equal, nested, or symlinked source directory paths.
- Reads ZIP archives under an output-owned temp dir with path traversal validation.
- Computes SHA256 hashes and inspects DBF schemas using pyproj.CRS.from_wkt (fails closed on missing/invalid CRS).
- Iterates physical DBF rows with deleted_as_None=True to ensure stable OIDs and record reconciliation.
- Handles POINT, POINTZ, POLYGON, and POLYGONZ; flattens canonical coordinates to 2D while preserving raw z attributes.
- Does not silently repair invalid geometry with buffer(0); fails closed by default.
- Provides explicit --repair-invalid-boundaries (default off) using shapely.make_valid (polygonal output only).
- Logs original reason, raw/hash reference, before/after type, area, change, and dropped non-polygon parts.
- Strict AOI enforcement: missing or unusable Banyuasin AOI boundary fails closed (does not default points to inside).
- Exact AOI polygon coverage checks: aoi.covers(pt) (boundary included, holes respected).
- Sprint 0 mapping: maps ONLY initial plantation source (1 Kebun sawit -> Project 2, 2 Kebun karet -> Project 1).
  All other sources retain source class identities and have null project mappings (no fallback Lainnya).
- Reference 2a Id_drm/Dt_ref_mod are point IDs, not classes; source and project classes are null.
- CSV parsing via csv.DictReader with utf-8-sig and delimiter detection.
- Produces deterministic manifest.json (run timestamps moved to separate run-receipt.json).
- Separates boundary repair audit into boundary-repair-report.json and manifest["boundary_repairs"].
"""

import argparse
import csv
import hashlib
import json
import os
import shutil
import sys
import tempfile
import zipfile
from collections import OrderedDict
from datetime import datetime, timezone

# Add workspace python path if dependencies were installed locally in .work/python
_LOCAL_PY = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".work", "python"))
if os.path.isdir(_LOCAL_PY) and _LOCAL_PY not in sys.path:
    sys.path.insert(0, _LOCAL_PY)

try:
    import shapefile
    import pyproj
    import shapely.geometry
    import shapely.ops
    import shapely.validation
    import numpy as np
except ImportError as err:
    sys.stderr.write(f"Missing required geospatial dependencies: {err}\n")
    sys.stderr.write("Ensure pyshp, pyproj, shapely, and numpy are installed.\n")
    sys.exit(1)


def compute_sha256(filepath):
    """Compute deterministic SHA256 hex digest of a file."""
    h = hashlib.sha256()
    with open(filepath, "rb") as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()


def parse_and_validate_crs(prj_text):
    """
    Parses CRS using pyproj.CRS.from_wkt.
    Fails closed if PRJ text is missing, empty, or unparseable.
    Returns (crs_object, epsg_code_or_string).
    """
    if not prj_text or not prj_text.strip():
        raise ValueError("Missing or empty PRJ projection file")
    try:
        crs = pyproj.CRS.from_wkt(prj_text.strip())
        epsg = crs.to_epsg()
        crs_str = f"EPSG:{epsg}" if epsg else crs.to_string()
        return crs, crs_str
    except Exception as e:
        raise ValueError(f"Failed to parse CRS from PRJ WKT: {e}")


def reproject_point_2d(x, y, transformer):
    """Reprojects 2D point coordinates using pyproj Transformer, checking finiteness."""
    if transformer is None:
        tx, ty = float(x), float(y)
    else:
        tx, ty = transformer.transform(x, y)
        tx, ty = float(tx), float(ty)
    if not (np.isfinite(tx) and np.isfinite(ty)):
        raise ValueError(f"Non-finite point coordinates after reprojection: ({tx}, {ty})")
    return tx, ty


def reproject_polygon_geometry(geom_dict, transformer):
    """
    Reprojects Polygon or MultiPolygon geometry dictionary to EPSG:4326.
    Ensures 2D coordinates [lon, lat], stripping any third coordinate dimension,
    and verifying coordinates are finite.
    """
    geom_type = geom_dict["type"]
    raw_coords = geom_dict["coordinates"]

    def transform_ring(ring):
        new_ring = []
        for pt in ring:
            if transformer is None:
                tx, ty = float(pt[0]), float(pt[1])
            else:
                tx, ty = transformer.transform(pt[0], pt[1])
                tx, ty = float(tx), float(ty)
            if not (np.isfinite(tx) and np.isfinite(ty)):
                raise ValueError(f"Non-finite polygon coordinates after reprojection: ({tx}, {ty})")
            new_ring.append([tx, ty])
        return new_ring

    if geom_type == "Polygon":
        new_coords = [transform_ring(ring) for ring in raw_coords]
    elif geom_type == "MultiPolygon":
        new_coords = [[transform_ring(ring) for ring in poly] for poly in raw_coords]
    else:
        raise ValueError(f"Unsupported polygon geometry type: {geom_type}")

    return {
        "type": geom_type,
        "coordinates": new_coords
    }


def extract_polygonal_parts(geom):
    """
    Extracts only Polygon and MultiPolygon components from a geometry.
    Discards non-polygonal components (points, linestrings).
    Returns (polygonal_geometry_or_None, list_of_dropped_type_names).
    """
    if isinstance(geom, shapely.geometry.Polygon):
        return geom, []
    if isinstance(geom, shapely.geometry.MultiPolygon):
        return geom, []

    poly_parts = []
    dropped_parts = []

    if isinstance(geom, shapely.geometry.GeometryCollection):
        for part in geom.geoms:
            if isinstance(part, shapely.geometry.Polygon):
                if not part.is_empty:
                    poly_parts.append(part)
            elif isinstance(part, shapely.geometry.MultiPolygon):
                for p in part.geoms:
                    if not p.is_empty:
                        poly_parts.append(p)
            else:
                dropped_parts.append(part.geom_type)
    else:
        dropped_parts.append(geom.geom_type)

    if not poly_parts:
        return None, dropped_parts
    if len(poly_parts) == 1:
        return poly_parts[0], dropped_parts
    return shapely.geometry.MultiPolygon(poly_parts), dropped_parts


def resolve_source_and_project_classes(rel_path, raw_props):
    """
    Resolves source and project classes according to verified Sprint 0 rules:
    - Only initial plantation source (Data_kebun_sawit_karet_F) maps to project classes:
      Source Id_LULC 1 (Kebun sawit) -> Project 2 (Kelapa sawit)
      Source Id_LULC 2 (Kebun karet) -> Project 1 (Karet)
      Other values -> null
    - Reference 2a (Data_ref_mod_F): Id_drm and Dt_ref_mod are point IDs, not classes.
      Source and project classes are null.
    - Reference 2b (Data_ref_mod_2b): Source class Id_LULCrcl / LULCrcl. Project class is null in Sprint 0.
    - Data_hutan: Source class Id_LULC / LULC. Project class is null in Sprint 0.
    - Data_sawah: Source class Id_LULC / LULC. Project class is null in Sprint 0.
    - Case4_data_kombinasi_F: Source class Id_LULCrcl / LULCrcl. Project class is null in Sprint 0.
    """
    lower_path = rel_path.lower()

    source_schema_id = "schema_unknown"
    source_class_id = None
    source_class_label = None
    source_point_id = None
    identity_basis = "archive_record_index"
    project_class_id = None
    project_class_label = None

    if "kebun_sawit_karet" in lower_path:
        source_schema_id = "schema_pengguna_plantation_v1"
        cid = raw_props.get("Id_LULC") if raw_props.get("Id_LULC") is not None else raw_props.get("ID_LULC")
        clbl = raw_props.get("LULC")
        source_class_id = str(cid) if cid is not None else None
        source_class_label = str(clbl) if clbl is not None else None

        # Exact plantation mapping: only 1 -> 2, 2 -> 1. All other mappings null.
        if cid in (1, "1"):
            project_class_id = 2
            project_class_label = "Kelapa sawit"
        elif cid in (2, "2"):
            project_class_id = 1
            project_class_label = "Karet"

    elif "data_ref_mod_f" in lower_path or lower_path.endswith("data_ref_mod_f.zip"):
        source_schema_id = "schema_ref_mod_2a_unclassified"
        pt_id = raw_props.get("Dt_ref_mod") if raw_props.get("Dt_ref_mod") is not None else raw_props.get("Id_drm")
        if pt_id is not None:
            source_point_id = str(pt_id)
            identity_basis = "native_id"
        source_class_id = None
        source_class_label = None
        project_class_id = None
        project_class_label = None

    elif "data_ref_mod_2b" in lower_path:
        source_schema_id = "schema_ref_mod_2b"
        pt_id = raw_props.get("Dt_ref_mod") if raw_props.get("Dt_ref_mod") is not None else raw_props.get("Id_drm")
        if pt_id is not None:
            source_point_id = str(pt_id)
            identity_basis = "native_id"
        cid = raw_props.get("Id_LULCrcl") if raw_props.get("Id_LULCrcl") is not None else raw_props.get("ID_LULCRCL")
        clbl = raw_props.get("LULCrcl")
        source_class_id = str(cid) if cid is not None else None
        source_class_label = str(clbl) if clbl is not None else None
        project_class_id = None
        project_class_label = None

    elif "case4" in lower_path:
        source_schema_id = "schema_case4_kombinasi"
        cid = raw_props.get("Id_LULCrcl") if raw_props.get("Id_LULCrcl") is not None else raw_props.get("ID_LULCRCL")
        clbl = raw_props.get("LULCrcl")
        source_class_id = str(cid) if cid is not None else None
        source_class_label = str(clbl) if clbl is not None else None
        project_class_id = None
        project_class_label = None

    elif "hutan" in lower_path:
        source_schema_id = "schema_mitra_hutan"
        cid = raw_props.get("Id_LULC") if raw_props.get("Id_LULC") is not None else raw_props.get("ID_LULC")
        clbl = raw_props.get("LULC")
        source_class_id = str(cid) if cid is not None else None
        source_class_label = str(clbl) if clbl is not None else None
        project_class_id = None
        project_class_label = None

    elif "sawah" in lower_path:
        source_schema_id = "schema_mitra_sawah"
        cid = raw_props.get("Id_LULC") if raw_props.get("Id_LULC") is not None else raw_props.get("ID_LULC")
        clbl = raw_props.get("LULC")
        source_class_id = str(cid) if cid is not None else None
        source_class_label = str(clbl) if clbl is not None else None
        project_class_id = None
        project_class_label = None

    return {
        "source_schema_id": source_schema_id,
        "source_class_id": source_class_id,
        "source_class_label": source_class_label,
        "source_point_id": source_point_id,
        "identity_basis": identity_basis,
        "project_class_id": project_class_id,
        "project_class_label": project_class_label
    }


def inspect_and_extract_shapefile(zip_path, temp_root, archive_hash,
                                  repair_invalid_boundaries=False,
                                  archive_rel_path=None):
    """
    Safely inspect and extract shapefile from ZIP archive into output-owned temp_root.
    Validates against path traversal.
    Iterates physical DBF rows with deleted_as_None=True to maintain stable physical OIDs.
    Fails closed on missing or unparseable CRS.
    Supports Point, PointZ, Polygon, PolygonZ. Preserves z attributes separately.
    When repair_invalid_boundaries=True, repairs invalid polygons using shapely.make_valid
    (polygonal parts only), without silent buffer(0), and logs repair metadata.
    Reconciles header = deleted + decoded and decoded = valid + unrepaired_invalid.
    """
    if archive_rel_path is None:
        archive_rel_path = os.path.basename(zip_path)

    extract_dir = tempfile.mkdtemp(prefix="shp_", dir=temp_root)
    try:
        with zipfile.ZipFile(zip_path, "r") as zf:
            for member in zf.namelist():
                target_path = os.path.abspath(os.path.join(extract_dir, member))
                if os.path.commonpath([extract_dir, target_path]) != extract_dir:
                    return None, {"error": f"Path traversal detected in archive: {member}"}

            members = zf.namelist()
            shp_name = None
            for name in members:
                if name.lower().endswith(".shp") and not name.startswith("__MACOSX"):
                    shp_name = name
                    break

            if not shp_name:
                return None, {"error": "No .shp found in archive", "members": members}

            zf.extractall(extract_dir)

        full_shp_path = os.path.join(extract_dir, shp_name)
        base_no_ext = os.path.splitext(full_shp_path)[0]

        prj_path = base_no_ext + ".prj"
        if not os.path.exists(prj_path):
            return None, {"error": f"Missing required PRJ projection file for {shp_name}"}

        with open(prj_path, "r", encoding="utf-8", errors="ignore") as pf:
            prj_text = pf.read().strip()

        try:
            crs_obj, crs_str = parse_and_validate_crs(prj_text)
        except Exception as crs_err:
            return None, {"error": f"Invalid or unparseable CRS in {prj_path}: {crs_err}"}

        cpg_encoding = "utf-8"
        cpg_path = base_no_ext + ".cpg"
        if os.path.exists(cpg_path):
            with open(cpg_path, "r", encoding="utf-8", errors="ignore") as cf:
                cpg_encoding = cf.read().strip().lower()

        reader = shapefile.Reader(full_shp_path, encoding=cpg_encoding, errors="replace")

        header_count = reader.dbf_reader.numRecords
        fields = [f[0] for f in reader.fields if f[0] != "DeletionFlag"]
        field_defs = []
        for f in reader.fields:
            if f[0] == "DeletionFlag":
                continue
            field_defs.append({
                "name": f[0],
                "type": f[1],
                "length": f[2],
                "decimal": f[3]
            })

        shape_type_name = reader.shapeTypeName
        boundary_repairs = []
        records_info = {
            "header_count": header_count,
            "fields": fields,
            "field_defs": field_defs,
            "prj_wkt": prj_text,
            "detected_crs": crs_str,
            "encoding": cpg_encoding,
            "shape_type": shape_type_name,
            "boundary_repairs": boundary_repairs
        }

        reconciliation = {
            "header_count": header_count,
            "deleted_count": 0,
            "decoded_count": 0,
            "invalid_geometry_count": 0,
            "repaired_geometry_count": 0,
            "valid_count": 0,
            "included_in_aoi": 0,
            "excluded_from_aoi": 0
        }

        features = []
        invalid_reasons = []

        is_point_shape = "point" in shape_type_name.lower()

        for physical_idx, rec in enumerate(reader.dbf_reader.iterRecords(fields=fields, deleted_as_None=True)):
            if rec is None:
                reconciliation["deleted_count"] += 1
                continue

            reconciliation["decoded_count"] += 1

            raw_props = OrderedDict()
            for f_idx, field_name in enumerate(fields):
                val = rec[f_idx]
                if isinstance(val, bytes):
                    try:
                        val = val.decode("utf-8", errors="replace")
                    except Exception:
                        val = str(val)
                raw_props[field_name] = val

            shp_geom = None
            try:
                shp_geom = reader.shape(physical_idx)
            except Exception as e:
                reconciliation["invalid_geometry_count"] += 1
                invalid_reasons.append({"oid": physical_idx, "reason": f"Shape read failure: {e}"})
                continue

            if shp_geom is None or shp_geom.shapeType == shapefile.NULL:
                reconciliation["invalid_geometry_count"] += 1
                invalid_reasons.append({"oid": physical_idx, "reason": "Null or missing shape"})
                continue

            if is_point_shape:
                if not shp_geom.points or len(shp_geom.points) == 0:
                    reconciliation["invalid_geometry_count"] += 1
                    invalid_reasons.append({"oid": physical_idx, "reason": "Empty point coordinates"})
                    continue
                pt = shp_geom.points[0]
                px, py = pt[0], pt[1]
                if not (np.isfinite(px) and np.isfinite(py)):
                    reconciliation["invalid_geometry_count"] += 1
                    invalid_reasons.append({"oid": physical_idx, "reason": "Non-finite point coordinates"})
                    continue

                if hasattr(shp_geom, "z") and shp_geom.z:
                    raw_props["z_coordinate"] = float(shp_geom.z[0])

                geom_dict = {
                    "type": "Point",
                    "coordinates": [float(px), float(py)]
                }
                reconciliation["valid_count"] += 1
            else:
                # Polygon or Polyline
                if hasattr(shp_geom, "z") and shp_geom.z:
                    raw_props["z_coordinate_count"] = len(shp_geom.z)
                    raw_props["z_min"] = float(min(shp_geom.z))
                    raw_props["z_max"] = float(max(shp_geom.z))
                    raw_props["z_geometry_metadata"] = {
                        "count": len(shp_geom.z),
                        "min": float(min(shp_geom.z)),
                        "max": float(max(shp_geom.z))
                    }

                try:
                    raw_geom = shp_geom.__geo_interface__
                    sh_poly = shapely.geometry.shape(raw_geom)
                    if sh_poly.is_empty:
                        reconciliation["invalid_geometry_count"] += 1
                        invalid_reasons.append({"oid": physical_idx, "reason": "Empty polygon geometry"})
                        continue

                    if not sh_poly.is_valid:
                        orig_reason = shapely.validation.explain_validity(sh_poly)
                        if not repair_invalid_boundaries:
                            reconciliation["invalid_geometry_count"] += 1
                            invalid_reasons.append({"oid": physical_idx, "reason": orig_reason})
                            continue

                        # Explicit repair via shapely.make_valid
                        repaired = shapely.make_valid(sh_poly)
                        poly_geom, dropped_parts = extract_polygonal_parts(repaired)

                        if poly_geom is None or poly_geom.is_empty or not poly_geom.is_valid:
                            reconciliation["invalid_geometry_count"] += 1
                            invalid_reasons.append({
                                "oid": physical_idx,
                                "reason": f"Repair failed: {orig_reason}"
                            })
                            continue

                        area_before = float(sh_poly.area)
                        area_after = float(poly_geom.area)
                        abs_change = float(abs(area_after - area_before))
                        rel_change = float(abs_change / area_before) if area_before != 0 else 0.0

                        repair_entry = {
                            "archive": archive_rel_path,
                            "record_index": physical_idx,
                            "sha256": archive_hash,
                            "original_validity_reason": orig_reason,
                            "geometry_type_before": sh_poly.geom_type,
                            "geometry_type_after": poly_geom.geom_type,
                            "area_before": area_before,
                            "area_after": area_after,
                            "absolute_area_change": abs_change,
                            "relative_area_change": rel_change,
                            "dropped_nonpolygon_parts": dropped_parts,
                            "repair_method": "shapely.make_valid",
                            "repaired_is_valid": bool(poly_geom.is_valid)
                        }
                        boundary_repairs.append(repair_entry)
                        reconciliation["invalid_geometry_count"] += 1
                        reconciliation["repaired_geometry_count"] += 1
                        reconciliation["valid_count"] += 1
                        geom_dict = poly_geom.__geo_interface__
                    else:
                        reconciliation["valid_count"] += 1
                        geom_dict = raw_geom
                except Exception as poly_err:
                    reconciliation["invalid_geometry_count"] += 1
                    invalid_reasons.append({"oid": physical_idx, "reason": f"Polygon validation error: {poly_err}"})
                    continue

            features.append({
                "record_index": physical_idx,
                "raw_properties": raw_props,
                "geometry": geom_dict
            })

        # Verification of reconciliation identities
        assert reconciliation["header_count"] == reconciliation["deleted_count"] + reconciliation["decoded_count"]
        unrepaired = reconciliation["invalid_geometry_count"] - reconciliation["repaired_geometry_count"]
        assert reconciliation["decoded_count"] == reconciliation["valid_count"] + unrepaired

        if invalid_reasons:
            records_info["invalid_reasons"] = invalid_reasons

        return (features, records_info, reconciliation, crs_obj), None
    finally:
        shutil.rmtree(extract_dir, ignore_errors=True)


def parse_csv_file(csv_path):
    """Parses CSV classes file with utf-8-sig and standard csv module, preserving quoted fields."""
    rows = []
    headers = []
    with open(csv_path, "r", encoding="utf-8-sig", errors="replace") as f:
        sample = f.read(4096)
        f.seek(0)
        delimiter = ","
        try:
            sniffer = csv.Sniffer()
            dialect = sniffer.sniff(sample, delimiters=";,|\t")
            delimiter = dialect.delimiter
        except Exception:
            first_line = sample.splitlines()[0] if sample.splitlines() else ""
            if ";" in first_line and "," not in first_line:
                delimiter = ";"
            elif "\t" in first_line:
                delimiter = "\t"
            else:
                delimiter = ","
        reader = csv.DictReader(f, delimiter=delimiter)
        headers = list(reader.fieldnames or [])
        for r in reader:
            rows.append({k: (v.strip() if isinstance(v, str) else v) for k, v in r.items() if k is not None})
    return {"headers": headers, "rows": rows}


def build_aoi_polygon(aoi_features, transformer, repair_invalid_boundaries=False):
    """
    Builds unified Shapely AOI Polygon in EPSG:4326.
    Fails closed if geometry is invalid; never silently repairs with buffer(0).
    When repair_invalid_boundaries=True, repairs invalid reprojected geometry with shapely.make_valid.
    """
    polygons = []
    for feat in aoi_features:
        rep_geom = reproject_polygon_geometry(feat["geometry"], transformer)
        sh_poly = shapely.geometry.shape(rep_geom)
        if not sh_poly.is_valid:
            if repair_invalid_boundaries:
                repaired = shapely.make_valid(sh_poly)
                poly_geom, _ = extract_polygonal_parts(repaired)
                if poly_geom is not None and poly_geom.is_valid and not poly_geom.is_empty:
                    sh_poly = poly_geom
            if not sh_poly.is_valid:
                raise ValueError(f"AOI boundary geometry is invalid: {feat.get('raw_properties')}")
        if sh_poly.is_empty:
            continue
        polygons.append(sh_poly)

    if not polygons:
        return None
    if len(polygons) == 1:
        return polygons[0]
    return shapely.ops.unary_union(polygons)


def process_dataset_collection(source_dir, output_dir, repair_invalid_boundaries=False):
    """
    Main ingestion execution:
    1. Guards against equal, nested, or symlinked source directories.
    2. Inventories all zip shapefiles and csv files deterministically.
    3. Fails closed if required Banyuasin AOI is missing or invalid (unless explicitly repaired).
    4. Reprojects boundaries and points with pyproj.
    5. Evaluates exact AOI polygon coverage for points.
    6. Flags suspected spatial coincidences across point layers only.
    7. Writes deterministic manifest.json, separate run-receipt.json, and boundary-repair-report.json.
    """
    real_source = os.path.realpath(source_dir)
    real_output = os.path.realpath(output_dir)

    if not os.path.isdir(real_source):
        raise ValueError(f"Source directory does not exist: {source_dir}")

    if real_source == real_output:
        raise ValueError("Output directory cannot be identical to source directory.")

    common = None
    try:
        common = os.path.commonpath([real_source, real_output])
    except ValueError:
        common = None

    if common is not None and common in (real_source, real_output):
        raise ValueError("Output directory cannot be nested within or contain source directory.")

    # Guard against symlinks pointing into or at source
    if os.path.islink(output_dir):
        link_target = os.path.realpath(output_dir)
        if link_target == real_source:
            raise ValueError("Output directory symlink points directly to source directory.")
        try:
            link_common = os.path.commonpath([real_source, link_target])
            if link_common in (real_source, link_target):
                raise ValueError("Output directory symlink points into source directory.")
        except ValueError:
            pass

    # Ensure output creation happens strictly after path containment enforcement
    os.makedirs(output_dir, exist_ok=True)
    temp_root = os.path.join(output_dir, ".tmp_importer")
    os.makedirs(temp_root, exist_ok=True)

    manifest = {
        "manifest_version": "0.1.0",
        "inventory": [],
        "datasets": OrderedDict(),
        "suspected_overlaps": [],
        "boundary_repairs": [],
        "reconciliation_summary": OrderedDict()
    }

    try:
        # Step 1: Deterministic scan and inventory
        scanned_files = []
        for root, dirs, files in os.walk(source_dir):
            dirs.sort()  # deterministic traversal
            for f in sorted(files):
                if f.startswith(".") or f.startswith("__MACOSX"):
                    continue
                if f.lower().endswith(".zip") or f.lower().endswith(".csv"):
                    rel_path = os.path.relpath(os.path.join(root, f), source_dir)
                    full_path = os.path.join(root, f)
                    scanned_files.append((rel_path, full_path))

        scanned_files.sort(key=lambda x: x[0])

        file_records = OrderedDict()
        for rel_path, full_path in scanned_files:
            sha = compute_sha256(full_path)
            size_bytes = os.path.getsize(full_path)
            is_zip = rel_path.lower().endswith(".zip")
            manifest["inventory"].append({
                "relative_path": rel_path,
                "sha256": sha,
                "size_bytes": size_bytes,
                "file_type": "zip_shapefile" if is_zip else "csv"
            })
            file_records[rel_path] = {
                "full_path": full_path,
                "sha256": sha,
                "is_zip": is_zip
            }

        # Step 2: Extract required AOI boundary (Banyuasin)
        aoi_rel_path = None
        for rel in file_records:
            if "banyuasin" in rel.lower() and file_records[rel]["is_zip"]:
                aoi_rel_path = rel
                break

        if aoi_rel_path is None:
            raise ValueError("Required Banyuasin AOI boundary archive is missing from source directory.")

        rec = file_records[aoi_rel_path]
        res, err = inspect_and_extract_shapefile(
            rec["full_path"], temp_root, rec["sha256"],
            repair_invalid_boundaries=repair_invalid_boundaries,
            archive_rel_path=aoi_rel_path
        )
        if not res:
            raise ValueError(f"Failed to inspect/extract required Banyuasin AOI: {err}")

        features, info, recon, crs_obj = res
        if not features or recon["valid_count"] == 0:
            raise ValueError(
                f"Required Banyuasin AOI contains no valid polygon features "
                f"({recon['invalid_geometry_count']} invalid). "
                f"Use --repair-invalid-boundaries to enable repair if possible."
            )

        for rep in info.get("boundary_repairs", []):
            manifest["boundary_repairs"].append(rep)

        transformer = None
        if crs_obj and crs_obj.to_epsg() != 4326:
            transformer = pyproj.Transformer.from_crs(crs_obj, "EPSG:4326", always_xy=True)

        reprojected_features = []
        for feat in features:
            rep_geom = reproject_polygon_geometry(feat["geometry"], transformer)
            reprojected_features.append({
                "type": "Feature",
                "geometry": rep_geom,
                "properties": {
                    "WADMKK": feat["raw_properties"].get("WADMKK", "Banyuasin"),
                    "Ha": feat["raw_properties"].get("Ha"),
                    "source_crs": info["detected_crs"],
                    "source_archive": aoi_rel_path
                }
            })

        banyuasin_boundary_geojson = {
            "type": "FeatureCollection",
            "crs": {"type": "name", "properties": {"name": "urn:ogc:def:crs:OGC:1.3:CRS84"}},
            "features": reprojected_features
        }
        aoi_shapely = build_aoi_polygon(features, transformer, repair_invalid_boundaries=repair_invalid_boundaries)
        if aoi_shapely is None or aoi_shapely.is_empty or not aoi_shapely.is_valid:
            raise ValueError(f"Failed to construct valid Shapely AOI polygon for Banyuasin from '{aoi_rel_path}'.")

        manifest["datasets"]["banyuasin_boundary"] = {
            "archive": aoi_rel_path,
            "sha256": rec["sha256"],
            "dataset_kind": "polygon_aoi",
            "reconciliation": recon,
            "info": info,
            "boundary_repairs": info.get("boundary_repairs", [])
        }

        # Step 3: Process other archives and CSVs
        dataset_points_map = OrderedDict()
        for rel_path, rec in file_records.items():
            if rel_path == aoi_rel_path:
                continue

            base_name = os.path.basename(rel_path).lower().replace(".zip", "").replace(".csv", "")
            slug = "".join(c if c.isalnum() else "_" for c in base_name).strip("_")

            if not rec["is_zip"]:
                csv_data = parse_csv_file(rec["full_path"])
                manifest["datasets"][slug] = {
                    "archive": rel_path,
                    "dataset_kind": "csv_taxonomy",
                    "sha256": rec["sha256"],
                    "headers": csv_data["headers"],
                    "row_count": len(csv_data["rows"]),
                    "rows": csv_data["rows"]
                }
                continue

            res, err = inspect_and_extract_shapefile(
                rec["full_path"], temp_root, rec["sha256"],
                repair_invalid_boundaries=repair_invalid_boundaries,
                archive_rel_path=rel_path
            )
            if not res:
                manifest["datasets"][slug] = {"error": err, "sha256": rec["sha256"], "archive": rel_path}
                continue

            features, info, recon, crs_obj = res
            shape_type = info["shape_type"]
            is_point = "point" in shape_type.lower()

            for rep in info.get("boundary_repairs", []):
                manifest["boundary_repairs"].append(rep)

            transformer = None
            if crs_obj and crs_obj.to_epsg() != 4326:
                transformer = pyproj.Transformer.from_crs(crs_obj, "EPSG:4326", always_xy=True)

            if not is_point:
                # Polygon collection (e.g., Sumsel_F) - strictly kept separate from points
                reprojected_features = []
                for feat in features:
                    rep_geom = reproject_polygon_geometry(feat["geometry"], transformer)
                    reprojected_features.append({
                        "type": "Feature",
                        "geometry": rep_geom,
                        "properties": {
                            **feat["raw_properties"],
                            "source_crs": info["detected_crs"],
                            "source_archive": rel_path
                        }
                    })

                fc = {
                    "type": "FeatureCollection",
                    "crs": {"type": "name", "properties": {"name": "urn:ogc:def:crs:OGC:1.3:CRS84"}},
                    "features": reprojected_features
                }
                geojson_out_path = os.path.join(output_dir, f"{slug}.geojson")
                with open(geojson_out_path, "w", encoding="utf-8") as gf:
                    json.dump(fc, gf, indent=2, ensure_ascii=False)

                manifest["datasets"][slug] = {
                    "archive": rel_path,
                    "sha256": rec["sha256"],
                    "dataset_kind": "polygon_boundary",
                    "shape_type": shape_type,
                    "info": info,
                    "reconciliation": recon,
                    "boundary_repairs": info.get("boundary_repairs", []),
                    "feature_count": len(reprojected_features)
                }
                continue

            # Point observation collection
            geojson_features = []
            for feat in features:
                coords = feat["geometry"]["coordinates"]
                rx, ry = reproject_point_2d(coords[0], coords[1], transformer)

                # Strict AOI polygon coverage check
                pt = shapely.geometry.Point(rx, ry)
                is_inside_aoi = bool(aoi_shapely.covers(pt))
                if is_inside_aoi:
                    recon["included_in_aoi"] += 1
                else:
                    recon["excluded_from_aoi"] += 1

                # Stable observation ID: archive_sha256[:12] + physical_record_index
                obs_id = f"{rec['sha256'][:12]}_{feat['record_index']:06d}"

                # Class resolution
                cls_info = resolve_source_and_project_classes(rel_path, feat["raw_properties"])

                geojson_features.append({
                    "type": "Feature",
                    "id": obs_id,
                    "geometry": {
                        "type": "Point",
                        "coordinates": [round(rx, 7), round(ry, 7)]
                    },
                    "properties": {
                        "observation_id": obs_id,
                        "dataset_archive": rel_path,
                        "dataset_sha256": rec["sha256"],
                        "source_record_index": feat["record_index"],
                        "source_crs": info["detected_crs"],
                        "is_within_aoi": is_inside_aoi,

                        # Distinct source class & point provenance
                        "source_schema_id": cls_info["source_schema_id"],
                        "source_point_id": cls_info["source_point_id"],
                        "identity_basis": cls_info["identity_basis"],
                        "source_class_id": cls_info["source_class_id"],
                        "source_class_label": cls_info["source_class_label"],

                        # Project class mapping (null if unmapped in Sprint 0)
                        "project_class_id": cls_info["project_class_id"],
                        "project_class_label": cls_info["project_class_label"],

                        # Raw attributes preserved
                        "raw_attributes": feat["raw_properties"],

                        # Explicit null metadata invariants
                        "observed_time": None,
                        "method": "unknown",
                        "contributor_id": None,
                        "rights_id": None,
                        "quality_tier": None,
                        "evidence_refs": []
                    }
                })

            fc = {
                "type": "FeatureCollection",
                "crs": {"type": "name", "properties": {"name": "urn:ogc:def:crs:OGC:1.3:CRS84"}},
                "features": geojson_features
            }

            dataset_points_map[slug] = geojson_features
            manifest["datasets"][slug] = {
                "archive": rel_path,
                "sha256": rec["sha256"],
                "dataset_kind": "point_observations",
                "shape_type": shape_type,
                "info": info,
                "reconciliation": recon,
                "feature_count": len(geojson_features)
            }

            geojson_out_path = os.path.join(output_dir, f"{slug}.geojson")
            with open(geojson_out_path, "w", encoding="utf-8") as gf:
                json.dump(fc, gf, indent=2, ensure_ascii=False)

        # Save boundary GeoJSON
        if banyuasin_boundary_geojson:
            boundary_path = os.path.join(output_dir, "banyuasin_boundary.geojson")
            with open(boundary_path, "w", encoding="utf-8") as bf:
                json.dump(banyuasin_boundary_geojson, bf, indent=2, ensure_ascii=False)

        # Step 4: Suspected spatial coincidences across POINT datasets only
        coord_index = OrderedDict()
        for slug, feats in dataset_points_map.items():
            for feat in feats:
                if feat.get("geometry", {}).get("type") != "Point":
                    continue
                c = feat["geometry"]["coordinates"]
                coords_key = (round(c[0], 5), round(c[1], 5))
                coord_index.setdefault(coords_key, []).append({
                    "dataset": slug,
                    "observation_id": feat["id"],
                    "source_class_label": feat["properties"]["source_class_label"],
                    "project_class_id": feat["properties"]["project_class_id"]
                })

        for coords_key, matches in sorted(coord_index.items(), key=lambda x: (x[0][0], x[0][1])):
            datasets_present = sorted({m["dataset"] for m in matches})
            if len(datasets_present) > 1:
                manifest["suspected_overlaps"].append({
                    "coordinates": list(coords_key),
                    "occurrences": matches,
                    "dataset_count": len(datasets_present)
                })

        # Save stable deterministic Manifest
        manifest_path = os.path.join(output_dir, "manifest.json")
        with open(manifest_path, "w", encoding="utf-8") as mf:
            json.dump(manifest, mf, indent=2, ensure_ascii=False)

        # Save boundary repair audit report
        repair_report_path = os.path.join(output_dir, "boundary-repair-report.json")
        with open(repair_report_path, "w", encoding="utf-8") as rf:
            json.dump(manifest["boundary_repairs"], rf, indent=2, ensure_ascii=False)

        # Save run receipt separately
        receipt = {
            "importer_version": "0.1.0",
            "run_at": datetime.now(timezone.utc).isoformat(),
            "source_directory": real_source,
            "output_directory": real_output,
            "total_datasets_processed": len(manifest["datasets"]),
            "suspected_overlaps_found": len(manifest["suspected_overlaps"]),
            "boundary_repairs_count": len(manifest["boundary_repairs"])
        }
        receipt_path = os.path.join(output_dir, "run-receipt.json")
        with open(receipt_path, "w", encoding="utf-8") as rf:
            json.dump(receipt, rf, indent=2, ensure_ascii=False)

        return manifest
    finally:
        shutil.rmtree(temp_root, ignore_errors=True)


def main():
    parser = argparse.ArgumentParser(description="Portal Data Epistem Data Ingestion & Reconciliation CLI")
    parser.add_argument("--source-dir", required=True, help="Input directory containing source archives and CSVs")
    parser.add_argument("--output-dir", required=True, help="Output directory for canonical GeoJSON and manifest")
    parser.add_argument("--repair-invalid-boundaries", action="store_true", default=False,
                        help="Explicitly repair invalid polygon boundaries using shapely.make_valid (default: False)")
    args = parser.parse_args()

    if not os.path.isdir(args.source_dir):
        sys.stderr.write(f"Error: Source directory does not exist: {args.source_dir}\n")
        sys.exit(1)

    print(f"Starting ingestion from: {args.source_dir}")
    print(f"Output destination: {args.output_dir}")
    print(f"Repair invalid boundaries: {args.repair_invalid_boundaries}")

    try:
        manifest = process_dataset_collection(
            args.source_dir,
            args.output_dir,
            repair_invalid_boundaries=args.repair_invalid_boundaries
        )
    except Exception as e:
        sys.stderr.write(f"Ingestion failed: {e}\n")
        sys.exit(1)

    print(f"Ingestion completed. Deterministic manifest written to {os.path.join(args.output_dir, 'manifest.json')}")
    print(f"Total datasets indexed: {len(manifest['datasets'])}")
    print(f"Suspected spatial overlaps detected: {len(manifest['suspected_overlaps'])}")
    print(f"Boundary repairs performed: {len(manifest['boundary_repairs'])}")
    for r in manifest["boundary_repairs"]:
        print(f"  Repaired {r['archive']} rec #{r['record_index']}: {r['original_validity_reason']} -> {r['geometry_type_after']}, area {r['area_before']:.4f} -> {r['area_after']:.4f} (rel diff {r['relative_area_change']:.4e})")


if __name__ == "__main__":
    main()
