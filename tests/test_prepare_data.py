#!/usr/bin/env python3
"""
tests/test_prepare_data.py - Unit and regression tests for scripts/prepare-data.py.

Verifies:
1. Exact plantation mapping (1->2, 2->1), null project class for unmapped sources (no fallback Lainnya).
2. Reference 2a point IDs preserved, source class and project class remain null.
3. Strict pyproj CRS validation: fails closed on missing/unsupported CRS, supports arbitrary WGS84 projected CRS.
4. DBF physical OID stability across deleted records and reconciliation identities.
5. Geometry validation fails closed; no silent buffer(0) repair.
6. Explicit --repair-invalid-boundaries with shapely.make_valid, logging repair metadata.
7. Support for PointZ and PolygonZ: canonical coordinates flattened to 2D with raw Z metadata preserved.
8. Output-dir guards against equal, nested, or symlinked source directory paths enforced before creation.
9. Missing or invalid required Banyuasin AOI fails closed (never defaults points to inside).
10. Quoted CSV parsing with UTF-8 BOM (utf-8-sig).
11. Deterministic manifest.json (run timestamps isolated in run-receipt.json).
12. Polygon layers excluded from point overlap detection.
"""

import csv
import json
import os
import shutil
import sys
import tempfile
import unittest
import zipfile
import importlib.util

LOCAL_PY = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".work", "python"))
if os.path.isdir(LOCAL_PY) and LOCAL_PY not in sys.path:
    sys.path.insert(0, LOCAL_PY)

import shapefile
import pyproj
import shapely.geometry

PREPARE_DATA_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "scripts", "prepare-data.py"))
spec = importlib.util.spec_from_file_location("prepare_data", PREPARE_DATA_PATH)
prepare_data = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prepare_data)

process_dataset_collection = prepare_data.process_dataset_collection
parse_and_validate_crs = prepare_data.parse_and_validate_crs
resolve_source_and_project_classes = prepare_data.resolve_source_and_project_classes
parse_csv_file = prepare_data.parse_csv_file


class TestPrepareData(unittest.TestCase):
    def setUp(self):
        # Isolate synthetic test artifacts under workspace .test_tmp in cwd
        self.tmp_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".test_tmp"))
        os.makedirs(self.tmp_root, exist_ok=True)
        self.base_test_dir = tempfile.mkdtemp(prefix="test_portal_", dir=self.tmp_root)
        self.source_dir = os.path.join(self.base_test_dir, "sources")
        self.output_dir = os.path.join(self.base_test_dir, "output")
        os.makedirs(self.source_dir)
        os.makedirs(self.output_dir)

    def tearDown(self):
        shutil.rmtree(self.base_test_dir, ignore_errors=True)

    def _create_simple_prj(self, path, is_utm=False):
        if is_utm:
            wkt = (
                'PROJCS["WGS_1984_UTM_Zone_48S",'
                'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],'
                'PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],'
                'PROJECTION["Transverse_Mercator"],PARAMETER["False_Easting",500000.0],'
                'PARAMETER["False_Northing",10000000.0],PARAMETER["Central_Meridian",105.0],'
                'PARAMETER["Scale_Factor",0.9996],PARAMETER["Latitude_Of_Origin",0.0],UNIT["Meter",1.0]]'
            )
        else:
            wkt = 'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]'
        with open(path, "w", encoding="utf-8") as f:
            f.write(wkt)

    def _create_valid_banyuasin_aoi(self, target_zip=None):
        if target_zip is None:
            target_zip = os.path.join(self.source_dir, "Banyuasin_F.zip")
        shp_base = os.path.join(self.base_test_dir, "temp_banyuasin_valid")
        w = shapefile.Writer(shp_base, shapeType=shapefile.POLYGON)
        w.field("WADMKK", "C", size=50)
        w.field("Ha", "N", decimal=2)
        # CW orientation for shapefile exterior ring: lon 104.0 to 105.0, lat -3.0 to -2.0
        ring = [[104.0, -3.0], [104.0, -2.0], [105.0, -2.0], [105.0, -3.0], [104.0, -3.0]]
        w.poly([ring])
        w.record("Banyuasin", 123456.78)
        w.close()
        self._create_simple_prj(shp_base + ".prj", is_utm=False)

        with zipfile.ZipFile(target_zip, "w") as zf:
            for ext in [".shp", ".shx", ".dbf", ".prj"]:
                zf.write(shp_base + ext, arcname=f"Banyuasin_F{ext}")
        return target_zip

    def _create_invalid_banyuasin_aoi(self, target_zip=None):
        if target_zip is None:
            target_zip = os.path.join(self.source_dir, "Banyuasin_F.zip")
        shp_base = os.path.join(self.base_test_dir, "temp_banyuasin_invalid")
        w = shapefile.Writer(shp_base, shapeType=shapefile.POLYGON)
        w.field("WADMKK", "C", size=50)
        w.field("Ha", "N", decimal=2)
        # Self-intersecting bowtie polygon
        bowtie = [[104.0, -3.0], [104.0, -2.0], [105.0, -3.0], [105.0, -2.0], [104.0, -3.0]]
        w.poly([bowtie])
        w.record("Banyuasin", 123456.78)
        w.close()
        self._create_simple_prj(shp_base + ".prj", is_utm=False)

        with zipfile.ZipFile(target_zip, "w") as zf:
            for ext in [".shp", ".shx", ".dbf", ".prj"]:
                zf.write(shp_base + ext, arcname=f"Banyuasin_F{ext}")
        return target_zip

    def test_class_mapping_and_null_preservation(self):
        # 1. Initial plantation: Id_LULC 1 -> Project 2, Id_LULC 2 -> Project 1
        p1 = resolve_source_and_project_classes("1_Data_Pengguna_1/Data_kebun_sawit_karet_F.zip", {"Id_LULC": 1, "LULC": "Kebun sawit"})
        self.assertEqual(p1["project_class_id"], 2)
        self.assertEqual(p1["project_class_label"], "Kelapa sawit")
        self.assertEqual(p1["source_class_id"], "1")
        self.assertEqual(p1["source_class_label"], "Kebun sawit")

        p2 = resolve_source_and_project_classes("1_Data_Pengguna_1/Data_kebun_sawit_karet_F.zip", {"Id_LULC": 2, "LULC": "Kebun karet"})
        self.assertEqual(p2["project_class_id"], 1)
        self.assertEqual(p2["project_class_label"], "Karet")

        # Non kebun or unknown in plantation -> null project mapping (no fallback Lainnya)
        p3 = resolve_source_and_project_classes("1_Data_Pengguna_1/Data_kebun_sawit_karet_F.zip", {"Id_LULC": 9, "LULC": "Lain"})
        self.assertIsNone(p3["project_class_id"])
        self.assertIsNone(p3["project_class_label"])

        # 2. Reference 2a: Id_drm, Dt_ref_mod are point IDs, NOT classes! Source class & project class must be null
        r2a = resolve_source_and_project_classes("2a_Data_Referensi_Modular/Data_ref_mod_F.zip", {"Id_drm": 1, "Dt_ref_mod": "Titik_1"})
        self.assertIsNone(r2a["source_class_id"])
        self.assertIsNone(r2a["source_class_label"])
        self.assertIsNone(r2a["project_class_id"])
        self.assertEqual(r2a["source_point_id"], "Titik_1")
        self.assertEqual(r2a["identity_basis"], "native_id")

        # 3. Reference 2b & Case 4: retain source classes, project class remains null in Sprint 0
        r2b = resolve_source_and_project_classes("2b_Data_Referensi_Modular_Tier1or2or3/Data_ref_mod_2b.zip", {"Id_LULCrcl": 1, "LULCrcl": "Hutan", "Dt_ref_mod": "Titik_1"})
        self.assertEqual(r2b["source_class_id"], "1")
        self.assertEqual(r2b["source_class_label"], "Hutan")
        self.assertIsNone(r2b["project_class_id"])

        c4 = resolve_source_and_project_classes("4_Data_Peningkatan_Kualitas_case4/Case4_data_kombinasi_F.zip", {"Id_LULCrcl": 2, "LULCrcl": "Kebun sawit"})
        self.assertEqual(c4["source_class_id"], "2")
        self.assertEqual(c4["source_class_label"], "Kebun sawit")
        self.assertIsNone(c4["project_class_id"])

        # 4. Hutan and Sawah: retain source classes, project class remains null in Sprint 0
        h = resolve_source_and_project_classes("Data_hutan.zip", {"Id_LULC": 4, "LULC": "Hutan"})
        self.assertEqual(h["source_class_id"], "4")
        self.assertEqual(h["source_class_label"], "Hutan")
        self.assertIsNone(h["project_class_id"])

        s = resolve_source_and_project_classes("Data_sawah.zip", {"Id_LULC": 5, "LULC": "Sawah"})
        self.assertEqual(s["source_class_id"], "5")
        self.assertEqual(s["source_class_label"], "Sawah")
        self.assertIsNone(s["project_class_id"])

    def test_unclassified_2a_and_source_counts(self):
        self._create_valid_banyuasin_aoi()
        shp_base = os.path.join(self.base_test_dir, "temp_ref2a")
        w = shapefile.Writer(shp_base, shapeType=shapefile.POINT)
        w.field("Id_drm", "N")
        w.field("Dt_ref_mod", "C", size=50)
        w.point(104.5, -2.5)
        w.record(1, "Titik_1")
        w.point(104.6, -2.6)
        w.record(2, "Titik_2")
        w.close()
        self._create_simple_prj(shp_base + ".prj", is_utm=False)

        zip_path = os.path.join(self.source_dir, "Data_ref_mod_F.zip")
        with zipfile.ZipFile(zip_path, "w") as zf:
            for ext in [".shp", ".shx", ".dbf", ".prj"]:
                zf.write(shp_base + ext, arcname=f"Data_ref_mod_F{ext}")

        manifest = process_dataset_collection(self.source_dir, self.output_dir)
        geojson_path = os.path.join(self.output_dir, "data_ref_mod_f.geojson")
        with open(geojson_path, "r", encoding="utf-8") as f:
            fc = json.load(f)

        self.assertEqual(len(fc["features"]), 2)
        f0 = fc["features"][0]
        self.assertIsNone(f0["properties"]["source_class_id"])
        self.assertIsNone(f0["properties"]["source_class_label"])
        self.assertIsNone(f0["properties"]["project_class_id"])
        self.assertIsNone(f0["properties"]["project_class_label"])
        self.assertEqual(f0["properties"]["source_point_id"], "Titik_1")
        self.assertEqual(f0["properties"]["identity_basis"], "native_id")

        recon = manifest["datasets"]["data_ref_mod_f"]["reconciliation"]
        self.assertEqual(recon["header_count"], 2)
        self.assertEqual(recon["valid_count"], 2)
        self.assertEqual(recon["included_in_aoi"], 2)

    def test_crs_fails_closed(self):
        # Valid WGS84
        crs_obj, crs_str = parse_and_validate_crs('GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]')
        self.assertEqual(crs_str, "EPSG:4326")

        # Empty or missing CRS fails closed
        with self.assertRaises(ValueError):
            parse_and_validate_crs("")

        # Corrupted / invalid CRS fails closed
        with self.assertRaises(ValueError):
            parse_and_validate_crs("NOT_A_VALID_WKT_STRING")

    def test_arbitrary_wgs84_projected_crs(self):
        # Test shapefile in projected UTM Zone 48S CRS based on WGS84
        self._create_valid_banyuasin_aoi()
        shp_base = os.path.join(self.base_test_dir, "temp_utm")
        w = shapefile.Writer(shp_base, shapeType=shapefile.POINT)
        w.field("Id_LULC", "N")
        w.field("LULC", "C", size=50)
        # UTM zone 48S coordinates: easting ~444400, northing ~9723600 (maps to ~104.5, -2.5)
        w.point(444400.0, 9723600.0)
        w.record(1, "Kebun sawit")
        w.close()
        self._create_simple_prj(shp_base + ".prj", is_utm=True)

        zip_path = os.path.join(self.source_dir, "Data_kebun_sawit_karet_F.zip")
        with zipfile.ZipFile(zip_path, "w") as zf:
            for ext in [".shp", ".shx", ".dbf", ".prj"]:
                zf.write(shp_base + ext, arcname=f"Data_kebun_sawit_karet_F{ext}")

        manifest = process_dataset_collection(self.source_dir, self.output_dir)
        geojson_path = os.path.join(self.output_dir, "data_kebun_sawit_karet_f.geojson")
        with open(geojson_path, "r", encoding="utf-8") as f:
            fc = json.load(f)

        coords = fc["features"][0]["geometry"]["coordinates"]
        # Transformed coordinates must be reprojected to EPSG:4326 degrees, finite, and in Banyuasin area
        self.assertAlmostEqual(coords[0], 104.5, delta=0.5)
        self.assertAlmostEqual(coords[1], -2.5, delta=0.5)

    def test_guard_against_nested_and_symlink_output_dir(self):
        # 1. Output equals source
        with self.assertRaises(ValueError):
            process_dataset_collection(self.source_dir, self.source_dir)

        # 2. Output nested inside source
        nested_out = os.path.join(self.source_dir, "derived_sub")
        with self.assertRaises(ValueError):
            process_dataset_collection(self.source_dir, nested_out)

        # 3. Source nested inside output
        parent_out = os.path.dirname(self.source_dir)
        with self.assertRaises(ValueError):
            process_dataset_collection(self.source_dir, parent_out)

        # 4. Output is a symlink pointing to source
        symlink_out_equal = os.path.join(self.base_test_dir, "symlink_to_source")
        os.symlink(self.source_dir, symlink_out_equal)
        with self.assertRaises(ValueError):
            process_dataset_collection(self.source_dir, symlink_out_equal)

        # 5. Output is a symlink pointing inside source
        inner_dir = os.path.join(self.source_dir, "internal_dir")
        os.makedirs(inner_dir, exist_ok=True)
        symlink_out_nested = os.path.join(self.base_test_dir, "symlink_into_source")
        os.symlink(inner_dir, symlink_out_nested)
        with self.assertRaises(ValueError):
            process_dataset_collection(self.source_dir, symlink_out_nested)

        # 6. Guard triggers before creating non-existent output
        guarded_nonexistent = os.path.join(self.source_dir, "must_not_be_created")
        try:
            process_dataset_collection(self.source_dir, guarded_nonexistent)
        except ValueError:
            pass
        self.assertFalse(os.path.exists(guarded_nonexistent))

    def test_missing_aoi_fails_closed(self):
        # Source directory has point layer and Sumsel boundary, but NO Banyuasin AOI
        shp_base = os.path.join(self.base_test_dir, "temp_sumsel")
        w = shapefile.Writer(shp_base, shapeType=shapefile.POLYGON)
        w.field("WADMKK", "C", size=50)
        w.poly([[[104.0, -3.0], [104.0, -2.0], [105.0, -2.0], [105.0, -3.0], [104.0, -3.0]]])
        w.record("SumselPoly")
        w.close()
        self._create_simple_prj(shp_base + ".prj", is_utm=False)

        zip_path = os.path.join(self.source_dir, "Sumsel_F.zip")
        with zipfile.ZipFile(zip_path, "w") as zf:
            for ext in [".shp", ".shx", ".dbf", ".prj"]:
                zf.write(shp_base + ext, arcname=f"Sumsel_F{ext}")

        # Must fail closed with ValueError
        with self.assertRaises(ValueError) as ctx:
            process_dataset_collection(self.source_dir, self.output_dir)
        self.assertIn("Banyuasin", str(ctx.exception))

    def test_invalid_aoi_without_repair_fails_closed(self):
        # Create invalid Banyuasin AOI
        self._create_invalid_banyuasin_aoi()

        # Without repair, must fail closed with ValueError (never default points to inside)
        with self.assertRaises(ValueError) as ctx:
            process_dataset_collection(self.source_dir, self.output_dir, repair_invalid_boundaries=False)
        self.assertIn("valid polygon features", str(ctx.exception))

    def test_invalid_aoi_with_explicit_repair(self):
        # Create invalid Banyuasin AOI
        self._create_invalid_banyuasin_aoi()

        # Create point dataset with 1 point inside repaired AOI and 1 point outside
        shp_base = os.path.join(self.base_test_dir, "temp_pts")
        w = shapefile.Writer(shp_base, shapeType=shapefile.POINT)
        w.field("Id_LULC", "N")
        w.field("LULC", "C", size=50)
        # Inside repaired bowtie triangle: (104.2, -2.5)
        w.point(104.2, -2.5)
        w.record(1, "Kebun sawit")
        # Far outside: (108.0, 0.0)
        w.point(108.0, 0.0)
        w.record(2, "Kebun karet")
        w.close()
        self._create_simple_prj(shp_base + ".prj", is_utm=False)

        zip_path = os.path.join(self.source_dir, "Data_kebun_sawit_karet_F.zip")
        with zipfile.ZipFile(zip_path, "w") as zf:
            for ext in [".shp", ".shx", ".dbf", ".prj"]:
                zf.write(shp_base + ext, arcname=f"Data_kebun_sawit_karet_F{ext}")

        # Ingest with repair_invalid_boundaries=True
        manifest = process_dataset_collection(self.source_dir, self.output_dir, repair_invalid_boundaries=True)

        # Verify repair record
        self.assertGreater(len(manifest["boundary_repairs"]), 0)
        repair_rec = manifest["boundary_repairs"][0]
        self.assertIn("banyuasin", repair_rec["archive"].lower())
        self.assertEqual(repair_rec["repair_method"], "shapely.make_valid")
        self.assertTrue(repair_rec["repaired_is_valid"])
        self.assertIsNotNone(repair_rec["original_validity_reason"])
        self.assertGreater(repair_rec["area_after"], 0)

        # Verify Banyuasin reconciliation
        b_recon = manifest["datasets"]["banyuasin_boundary"]["reconciliation"]
        self.assertEqual(b_recon["invalid_geometry_count"], 1)
        self.assertEqual(b_recon["repaired_geometry_count"], 1)
        self.assertEqual(b_recon["valid_count"], 1)

        # Verify point coverage evaluation: exactly 1 inside, 1 outside
        pt_recon = manifest["datasets"]["data_kebun_sawit_karet_f"]["reconciliation"]
        self.assertEqual(pt_recon["included_in_aoi"], 1)
        self.assertEqual(pt_recon["excluded_from_aoi"], 1)

        # Verify boundary-repair-report.json was written
        report_file = os.path.join(self.output_dir, "boundary-repair-report.json")
        self.assertTrue(os.path.exists(report_file))

    def test_sumsel_invalid_polygon_without_and_with_repair(self):
        self._create_valid_banyuasin_aoi()
        shp_base = os.path.join(self.base_test_dir, "temp_sumsel_bowtie")
        w = shapefile.Writer(shp_base, shapeType=shapefile.POLYGON)
        w.field("WADMKK", "C", size=50)
        bowtie = [[0, 0], [0, 10], [10, 0], [10, 10], [0, 0]]
        w.poly([bowtie])
        w.record("InvalidBoundary")
        w.close()
        self._create_simple_prj(shp_base + ".prj", is_utm=False)

        zip_path = os.path.join(self.source_dir, "Sumsel_F.zip")
        with zipfile.ZipFile(zip_path, "w") as zf:
            for ext in [".shp", ".shx", ".dbf", ".prj"]:
                zf.write(shp_base + ext, arcname=f"Sumsel_F{ext}")

        # 1. Without repair: rejected, no silent buffer(0)
        manifest_no_rep = process_dataset_collection(self.source_dir, self.output_dir, repair_invalid_boundaries=False)
        recon_no = manifest_no_rep["datasets"]["sumsel_f"]["reconciliation"]
        self.assertEqual(recon_no["invalid_geometry_count"], 1)
        self.assertEqual(recon_no["repaired_geometry_count"], 0)
        self.assertEqual(recon_no["valid_count"], 0)

        # 2. With repair: repaired via shapely.make_valid
        out2 = os.path.join(self.base_test_dir, "output_repaired")
        manifest_rep = process_dataset_collection(self.source_dir, out2, repair_invalid_boundaries=True)
        recon_rep = manifest_rep["datasets"]["sumsel_f"]["reconciliation"]
        self.assertEqual(recon_rep["invalid_geometry_count"], 1)
        self.assertEqual(recon_rep["repaired_geometry_count"], 1)
        self.assertEqual(recon_rep["valid_count"], 1)
        self.assertGreater(len(manifest_rep["boundary_repairs"]), 0)

    def test_deleted_dbf_rows_stability_and_reconciliation(self):
        self._create_valid_banyuasin_aoi()
        shp_base = os.path.join(self.base_test_dir, "temp_deleted_rows")
        w = shapefile.Writer(shp_base, shapeType=shapefile.POINT)
        w.field("Id_LULC", "N")
        w.field("LULC", "C", size=50)
        w.point(104.5, -2.5)
        w.record(1, "Kebun sawit")
        w.point(104.6, -2.6)
        w.record(2, "Kebun karet")
        w.point(104.7, -2.7)
        w.record(1, "Kebun sawit")
        w.close()
        self._create_simple_prj(shp_base + ".prj", is_utm=False)

        # Mark physical record index 1 as deleted in DBF
        with open(shp_base + ".dbf", "r+b") as f:
            header = f.read(32)
            header_len = int.from_bytes(header[8:10], "little")
            record_len = int.from_bytes(header[10:12], "little")
            f.seek(header_len + 1 * record_len)
            f.write(b"*")  # Mark deleted

        zip_path = os.path.join(self.source_dir, "Data_kebun_sawit_karet_F.zip")
        with zipfile.ZipFile(zip_path, "w") as zf:
            for ext in [".shp", ".shx", ".dbf", ".prj"]:
                zf.write(shp_base + ext, arcname=f"Data_kebun_sawit_karet_F{ext}")

        manifest = process_dataset_collection(self.source_dir, self.output_dir)
        recon = manifest["datasets"]["data_kebun_sawit_karet_f"]["reconciliation"]
        self.assertEqual(recon["header_count"], 3)
        self.assertEqual(recon["deleted_count"], 1)
        self.assertEqual(recon["decoded_count"], 2)
        self.assertEqual(recon["valid_count"], 2)

        geojson_path = os.path.join(self.output_dir, "data_kebun_sawit_karet_f.geojson")
        with open(geojson_path, "r", encoding="utf-8") as f:
            fc = json.load(f)

        features = fc["features"]
        self.assertEqual(len(features), 2)
        # Feature 0 corresponds to physical index 0
        self.assertEqual(features[0]["properties"]["source_record_index"], 0)
        self.assertTrue(features[0]["id"].endswith("_000000"))
        # Feature 1 corresponds to physical index 2 (stable index despite deleted record 1)
        self.assertEqual(features[1]["properties"]["source_record_index"], 2)
        self.assertTrue(features[1]["id"].endswith("_000002"))

    def test_pointz_geometry_and_flattening(self):
        self._create_valid_banyuasin_aoi()
        shp_base = os.path.join(self.base_test_dir, "temp_pointz")
        w = shapefile.Writer(shp_base, shapeType=shapefile.POINTZ)
        w.field("Id_LULC", "N")
        w.field("LULC", "C", size=50)
        w.pointz(104.5, -2.8, z=15.5)
        w.record(1, "Kebun sawit")
        w.close()
        self._create_simple_prj(shp_base + ".prj", is_utm=False)

        zip_path = os.path.join(self.source_dir, "Data_kebun_sawit_karet_F.zip")
        with zipfile.ZipFile(zip_path, "w") as zf:
            for ext in [".shp", ".shx", ".dbf", ".prj"]:
                zf.write(shp_base + ext, arcname=f"Data_kebun_sawit_karet_F{ext}")

        manifest = process_dataset_collection(self.source_dir, self.output_dir)
        geojson_path = os.path.join(self.output_dir, "data_kebun_sawit_karet_f.geojson")
        with open(geojson_path, "r", encoding="utf-8") as f:
            fc = json.load(f)

        feat = fc["features"][0]
        # Canonical coordinates must be 2D [lon, lat]
        self.assertEqual(len(feat["geometry"]["coordinates"]), 2)
        self.assertEqual(feat["geometry"]["coordinates"], [104.5, -2.8])
        # Raw z coordinate preserved in raw_attributes
        self.assertEqual(feat["properties"]["raw_attributes"]["z_coordinate"], 15.5)

    def test_polygonz_geometry_and_metadata(self):
        self._create_valid_banyuasin_aoi()
        shp_base = os.path.join(self.base_test_dir, "temp_polygonz")
        w = shapefile.Writer(shp_base, shapeType=shapefile.POLYGONZ)
        w.field("WADMKK", "C", size=50)
        poly = [[104.1, -2.1, 10.0], [104.9, -2.1, 20.0], [104.9, -2.9, 30.0], [104.1, -2.9, 10.0], [104.1, -2.1, 10.0]]
        w.polyz([poly])
        w.record("SumselZ")
        w.close()
        self._create_simple_prj(shp_base + ".prj", is_utm=False)

        zip_path = os.path.join(self.source_dir, "Sumsel_F.zip")
        with zipfile.ZipFile(zip_path, "w") as zf:
            for ext in [".shp", ".shx", ".dbf", ".prj"]:
                zf.write(shp_base + ext, arcname=f"Sumsel_F{ext}")

        manifest = process_dataset_collection(self.source_dir, self.output_dir)
        geojson_path = os.path.join(self.output_dir, "sumsel_f.geojson")
        with open(geojson_path, "r", encoding="utf-8") as f:
            fc = json.load(f)

        feat = fc["features"][0]
        # Canonical coordinates must be 2D
        ring = feat["geometry"]["coordinates"][0]
        for pt in ring:
            self.assertEqual(len(pt), 2)
        # Raw z metadata preserved
        self.assertIn("z_geometry_metadata", feat["properties"])
        self.assertEqual(feat["properties"]["z_min"], 10.0)
        self.assertEqual(feat["properties"]["z_max"], 30.0)

    def test_quoted_csv_and_utf8sig(self):
        csv_path = os.path.join(self.base_test_dir, "test_classes.csv")
        # Write CSV with UTF-8 BOM, quoted fields with commas and semicolons
        content = (
            '\ufeff"id","name","description"\n'
            '1,"Kebun sawit","Perkebunan sawit, monokultur; skala luas"\n'
            '2,"Karet","Kebun karet rakyat; campuran, tumpang sari"\n'
        )
        with open(csv_path, "w", encoding="utf-8") as f:
            f.write(content)

        parsed = parse_csv_file(csv_path)
        self.assertEqual(parsed["headers"], ["id", "name", "description"])
        self.assertEqual(len(parsed["rows"]), 2)
        self.assertEqual(parsed["rows"][0]["description"], "Perkebunan sawit, monokultur; skala luas")
        self.assertEqual(parsed["rows"][1]["description"], "Kebun karet rakyat; campuran, tumpang sari")

    def test_polygon_layers_excluded_from_overlap_index(self):
        self._create_valid_banyuasin_aoi()

        # Polygon layer (Sumsel)
        shp_poly = os.path.join(self.base_test_dir, "temp_poly_overlap")
        w_p = shapefile.Writer(shp_poly, shapeType=shapefile.POLYGON)
        w_p.field("WADMKK", "C", size=50)
        w_p.poly([[[104.0, -3.0], [104.0, -2.0], [105.0, -2.0], [105.0, -3.0], [104.0, -3.0]]])
        w_p.record("Sumsel")
        w_p.close()
        self._create_simple_prj(shp_poly + ".prj", is_utm=False)
        with zipfile.ZipFile(os.path.join(self.source_dir, "Sumsel_F.zip"), "w") as zf:
            for ext in [".shp", ".shx", ".dbf", ".prj"]:
                zf.write(shp_poly + ext, arcname=f"Sumsel_F{ext}")

        # Point dataset 1
        shp_pt1 = os.path.join(self.base_test_dir, "temp_pt1")
        w1 = shapefile.Writer(shp_pt1, shapeType=shapefile.POINT)
        w1.field("Id_LULC", "N")
        w1.field("LULC", "C", size=50)
        w1.point(104.5, -2.5)
        w1.record(1, "Kebun sawit")
        w1.close()
        self._create_simple_prj(shp_pt1 + ".prj", is_utm=False)
        with zipfile.ZipFile(os.path.join(self.source_dir, "Data_kebun_sawit_karet_F.zip"), "w") as zf:
            for ext in [".shp", ".shx", ".dbf", ".prj"]:
                zf.write(shp_pt1 + ext, arcname=f"Data_kebun_sawit_karet_F{ext}")

        # Point dataset 2 (same coordinates to create overlap)
        shp_pt2 = os.path.join(self.base_test_dir, "temp_pt2")
        w2 = shapefile.Writer(shp_pt2, shapeType=shapefile.POINT)
        w2.field("Id_drm", "N")
        w2.field("Dt_ref_mod", "C", size=50)
        w2.point(104.5, -2.5)
        w2.record(1, "Titik_1")
        w2.close()
        self._create_simple_prj(shp_pt2 + ".prj", is_utm=False)
        with zipfile.ZipFile(os.path.join(self.source_dir, "Data_ref_mod_F.zip"), "w") as zf:
            for ext in [".shp", ".shx", ".dbf", ".prj"]:
                zf.write(shp_pt2 + ext, arcname=f"Data_ref_mod_F{ext}")

        manifest = process_dataset_collection(self.source_dir, self.output_dir)
        overlaps = manifest["suspected_overlaps"]
        self.assertEqual(len(overlaps), 1)

        # Polygon layers (Sumsel_F, Banyuasin) must NEVER be in suspected_overlaps
        occurred_datasets = [occ["dataset"] for occ in overlaps[0]["occurrences"]]
        self.assertNotIn("sumsel_f", occurred_datasets)
        self.assertNotIn("banyuasin_boundary", occurred_datasets)
        self.assertIn("data_kebun_sawit_karet_f", occurred_datasets)
        self.assertIn("data_ref_mod_f", occurred_datasets)

    def test_deterministic_manifest_and_receipt(self):
        self._create_valid_banyuasin_aoi()
        shp_base = os.path.join(self.base_test_dir, "temp_det")
        w = shapefile.Writer(shp_base, shapeType=shapefile.POINT)
        w.field("Id_LULC", "N")
        w.field("LULC", "C", size=50)
        w.point(104.5, -2.5)
        w.record(1, "Kebun sawit")
        w.close()
        self._create_simple_prj(shp_base + ".prj", is_utm=False)

        zip_path = os.path.join(self.source_dir, "Data_kebun_sawit_karet_F.zip")
        with zipfile.ZipFile(zip_path, "w") as zf:
            for ext in [".shp", ".shx", ".dbf", ".prj"]:
                zf.write(shp_base + ext, arcname=f"Data_kebun_sawit_karet_F{ext}")

        manifest1 = process_dataset_collection(self.source_dir, self.output_dir)

        output_dir2 = os.path.join(self.base_test_dir, "output2")
        manifest2 = process_dataset_collection(self.source_dir, output_dir2)

        # manifest.json must be identical across runs
        self.assertEqual(manifest1, manifest2)
        # run-receipt.json exists and holds runtime info
        self.assertTrue(os.path.exists(os.path.join(self.output_dir, "run-receipt.json")))


if __name__ == "__main__":
    unittest.main()
