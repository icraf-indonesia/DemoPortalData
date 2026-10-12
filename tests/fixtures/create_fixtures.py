#!/usr/bin/env python3
"""
tests/fixtures/create_fixtures.py - Create synthetic sources matching real inspected schemas:
- 0_Batas_Kab_AoI/Banyuasin_F.zip (UTM Zone 48S polygon)
- 0_Batas_Kab_AoI/Sumsel_F.zip (UTM Zone 48S polygon)
- 1_Data_Pengguna_1/Data_kebun_sawit_karet_F.zip (WGS84 points: Id_LULC, LULC)
- 1_Data_Pengguna_1/Kelas_lulc_pengguna.csv
- 2a_Data_Referensi_Modular/Data_ref_mod_F.zip (WGS84 points: Id_drm, Dt_ref_mod)
- 2b_Data_Referensi_Modular_Tier1or2or3/Data_ref_mod_2b.zip (WGS84 points: Id_drm, Dt_ref_mod, Id_LULCrcl, LULCrcl)
- 3_Data_Koleksi_Pengguna_Mitra/Data_hutan.zip (WGS84 points: Id_LULC, LULC)
- 3_Data_Koleksi_Pengguna_Mitra/Data_sawah.zip (WGS84 points: Id_LULC, LULC)
- 4_Data_Peningkatan_Kualitas_case4/Case4_data_kombinasi_F.zip (WGS84 points: Id_LULCrcl, LULCrcl)
- 4_Data_Peningkatan_Kualitas_case4/Case_class_LULC.csv
"""

import os
import shutil
import sys
import zipfile

LOCAL_PY = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".work", "python"))
if os.path.isdir(LOCAL_PY) and LOCAL_PY not in sys.path:
    sys.path.insert(0, LOCAL_PY)

import shapefile
import pyproj

UTM_PRJ = (
    'PROJCS["WGS_1984_UTM_Zone_48S",'
    'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],'
    'PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],'
    'PROJECTION["Transverse_Mercator"],PARAMETER["False_Easting",500000.0],'
    'PARAMETER["False_Northing",10000000.0],PARAMETER["Central_Meridian",105.0],'
    'PARAMETER["Scale_Factor",0.9996],PARAMETER["Latitude_Of_Origin",0.0],UNIT["Meter",1.0]]'
)

WGS84_PRJ = 'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]'


def create_synthetic_sources(target_dir):
    os.makedirs(target_dir, exist_ok=True)
    temp_dir = os.path.join(target_dir, "_tmp_shp")
    os.makedirs(temp_dir, exist_ok=True)

    t = pyproj.Transformer.from_crs("EPSG:32748", "EPSG:4326", always_xy=True)

    # 1. Banyuasin AOI Boundary Polygon (0_Batas_Kab_AoI/Banyuasin_F.zip)
    aoi_dir = os.path.join(target_dir, "0_Batas_Kab_AoI")
    os.makedirs(aoi_dir, exist_ok=True)
    aoi_shp = os.path.join(temp_dir, "Banyuasin_F")
    w = shapefile.Writer(aoi_shp, shapeType=shapefile.POLYGON)
    w.field("WADMKK", "C", size=50)
    w.field("Ha", "F", size=10, decimal=2)
    outer = [
        [430000, 9670000],
        [430000, 9780000],
        [520000, 9780000],
        [520000, 9670000],
        [430000, 9670000]
    ]
    w.poly([outer])
    w.record("Banyuasin", 1183299.00)
    w.close()
    with open(aoi_shp + ".prj", "w") as pf:
        pf.write(UTM_PRJ)
    with zipfile.ZipFile(os.path.join(aoi_dir, "Banyuasin_F.zip"), "w") as zf:
        for ext in [".shp", ".shx", ".dbf", ".prj"]:
            zf.write(aoi_shp + ext, arcname=f"Banyuasin_F{ext}")

    # 2. Sumsel Polygon Boundary (0_Batas_Kab_AoI/Sumsel_F.zip)
    sumsel_shp = os.path.join(temp_dir, "Sumsel_F")
    w = shapefile.Writer(sumsel_shp, shapeType=shapefile.POLYGON)
    w.field("WADMKK", "C", size=50)
    w.field("Ha", "F", size=10, decimal=2)
    s_outer = [
        [400000, 9650000],
        [400000, 9820000],
        [550000, 9820000],
        [550000, 9650000],
        [400000, 9650000]
    ]
    w.poly([s_outer])
    w.record("Sumatera Selatan", 8701741.00)
    w.close()
    with open(sumsel_shp + ".prj", "w") as pf:
        pf.write(UTM_PRJ)
    with zipfile.ZipFile(os.path.join(aoi_dir, "Sumsel_F.zip"), "w") as zf:
        for ext in [".shp", ".shx", ".dbf", ".prj"]:
            zf.write(sumsel_shp + ext, arcname=f"Sumsel_F{ext}")

    # 3. Plantation Points (1_Data_Pengguna_1/Data_kebun_sawit_karet_F.zip)
    p_dir = os.path.join(target_dir, "1_Data_Pengguna_1")
    os.makedirs(p_dir, exist_ok=True)
    pts_shp = os.path.join(temp_dir, "Data_kebun_sawit_karet_F")
    w = shapefile.Writer(pts_shp, shapeType=shapefile.POINT)
    w.field("Id_LULC", "N")
    w.field("LULC", "C", size=50)
    for i in range(25):
        lon, lat = t.transform(440000 + i * 3000, 9690000 + (i % 5) * 15000)
        w.point(lon, lat)
        w.record(1, "Kebun sawit")
    for i in range(25):
        lon, lat = t.transform(450000 + i * 2500, 9710000 + (i % 5) * 12000)
        w.point(lon, lat)
        w.record(2, "Kebun karet")
    w.close()
    with open(pts_shp + ".prj", "w") as pf:
        pf.write(WGS84_PRJ)
    with zipfile.ZipFile(os.path.join(p_dir, "Data_kebun_sawit_karet_F.zip"), "w") as zf:
        for ext in [".shp", ".shx", ".dbf", ".prj"]:
            zf.write(pts_shp + ext, arcname=f"Data_kebun_sawit_karet_F{ext}")

    with open(os.path.join(p_dir, "Kelas_lulc_pengguna.csv"), "w", encoding="utf-8-sig") as cf:
        cf.write('"Id_LULC","LULC","Warna"\n')
        cf.write('1,"Kebun sawit","Teal"\n')
        cf.write('2,"Kebun karet","Brown"\n')
        cf.write('3,"Non kebun","Tan"\n')

    # 4. Reference 2a (2a_Data_Referensi_Modular/Data_ref_mod_F.zip)
    # Point IDs only (Id_drm, Dt_ref_mod), NO class labels
    r2a_dir = os.path.join(target_dir, "2a_Data_Referensi_Modular")
    os.makedirs(r2a_dir, exist_ok=True)
    r2a_shp = os.path.join(temp_dir, "Data_ref_mod_F")
    w = shapefile.Writer(r2a_shp, shapeType=shapefile.POINT)
    w.field("Id_drm", "N")
    w.field("Dt_ref_mod", "C", size=50)
    for i in range(20):
        lon, lat = t.transform(445000 + i * 3000, 9700000 + (i % 4) * 12000)
        w.point(lon, lat)
        w.record(i + 1, f"Titik_{i + 1}")
    w.close()
    with open(r2a_shp + ".prj", "w") as pf:
        pf.write(WGS84_PRJ)
    with zipfile.ZipFile(os.path.join(r2a_dir, "Data_ref_mod_F.zip"), "w") as zf:
        for ext in [".shp", ".shx", ".dbf", ".prj"]:
            zf.write(r2a_shp + ext, arcname=f"Data_ref_mod_F{ext}")

    # 5. Reference 2b (2b_Data_Referensi_Modular_Tier1or2or3/Data_ref_mod_2b.zip)
    r2b_dir = os.path.join(target_dir, "2b_Data_Referensi_Modular_Tier1or2or3")
    os.makedirs(r2b_dir, exist_ok=True)
    r2b_shp = os.path.join(temp_dir, "Data_ref_mod_2b")
    w = shapefile.Writer(r2b_shp, shapeType=shapefile.POINT)
    w.field("Id_drm", "N")
    w.field("Dt_ref_mod", "C", size=50)
    w.field("Id_LULCrcl", "N")
    w.field("LULCrcl", "C", size=50)
    for i in range(20):
        lon, lat = t.transform(445000 + i * 3000, 9700000 + (i % 4) * 12000)
        w.point(lon, lat)
        cid = (i % 5) + 1
        labels = {1: "Hutan", 2: "Kebun sawit", 3: "Kebun karet", 4: "Sawah", 5: "Lainnya"}
        w.record(i + 1, f"Titik_{i + 1}", cid, labels[cid])
    w.close()
    with open(r2b_shp + ".prj", "w") as pf:
        pf.write(WGS84_PRJ)
    with zipfile.ZipFile(os.path.join(r2b_dir, "Data_ref_mod_2b.zip"), "w") as zf:
        for ext in [".shp", ".shx", ".dbf", ".prj"]:
            zf.write(r2b_shp + ext, arcname=f"Data_ref_mod_2b{ext}")

    # 6. Forest Points (3_Data_Koleksi_Pengguna_Mitra/Data_hutan.zip)
    m_dir = os.path.join(target_dir, "3_Data_Koleksi_Pengguna_Mitra")
    os.makedirs(m_dir, exist_ok=True)
    hutan_shp = os.path.join(temp_dir, "Data_hutan")
    w = shapefile.Writer(hutan_shp, shapeType=shapefile.POINT)
    w.field("Id_LULC", "N")
    w.field("LULC", "C", size=50)
    for i in range(15):
        lon, lat = t.transform(460000 + i * 3000, 9730000 + (i % 3) * 10000)
        w.point(lon, lat)
        w.record(4, "Hutan")
    w.close()
    with open(hutan_shp + ".prj", "w") as pf:
        pf.write(WGS84_PRJ)
    with zipfile.ZipFile(os.path.join(m_dir, "Data_hutan.zip"), "w") as zf:
        for ext in [".shp", ".shx", ".dbf", ".prj"]:
            zf.write(hutan_shp + ext, arcname=f"Data_hutan{ext}")

    # 7. Sawah Points (3_Data_Koleksi_Pengguna_Mitra/Data_sawah.zip)
    sawah_shp = os.path.join(temp_dir, "Data_sawah")
    w = shapefile.Writer(sawah_shp, shapeType=shapefile.POINT)
    w.field("Id_LULC", "N")
    w.field("LULC", "C", size=50)
    for i in range(15):
        lon, lat = t.transform(470000 + i * 2800, 9700000 + (i % 4) * 8000)
        w.point(lon, lat)
        w.record(5, "Sawah")
    w.close()
    with open(sawah_shp + ".prj", "w") as pf:
        pf.write(WGS84_PRJ)
    with zipfile.ZipFile(os.path.join(m_dir, "Data_sawah.zip"), "w") as zf:
        for ext in [".shp", ".shx", ".dbf", ".prj"]:
            zf.write(sawah_shp + ext, arcname=f"Data_sawah{ext}")

    # 8. Case 4 Combination (4_Data_Peningkatan_Kualitas_case4/Case4_data_kombinasi_F.zip)
    c4_dir = os.path.join(target_dir, "4_Data_Peningkatan_Kualitas_case4")
    os.makedirs(c4_dir, exist_ok=True)
    c4_shp = os.path.join(temp_dir, "Case4_data_kombinasi_F")
    w = shapefile.Writer(c4_shp, shapeType=shapefile.POINT)
    w.field("Id_LULCrcl", "N")
    w.field("LULCrcl", "C", size=50)
    lon0, lat0 = t.transform(440000, 9690000)
    w.point(lon0, lat0)
    w.record(3, "Kebun karet")  # Coincident with first point of kebun sawit
    for i in range(1, 20):
        lon, lat = t.transform(442000 + i * 3500, 9720000 + (i % 3) * 11000)
        w.point(lon, lat)
        cid = (i % 5) + 1
        labels = {1: "Hutan", 2: "Kebun sawit", 3: "Kebun karet", 4: "Sawah", 5: "Lainnya"}
        w.record(cid, labels[cid])
    w.close()
    with open(c4_shp + ".prj", "w") as pf:
        pf.write(WGS84_PRJ)
    with zipfile.ZipFile(os.path.join(c4_dir, "Case4_data_kombinasi_F.zip"), "w") as zf:
        for ext in [".shp", ".shx", ".dbf", ".prj"]:
            zf.write(c4_shp + ext, arcname=f"Case4_data_kombinasi_F{ext}")

    with open(os.path.join(c4_dir, "Case_class_LULC.csv"), "w", encoding="utf-8-sig") as cf:
        cf.write('"Id_LULCrcl","LULCrcl"\n')
        cf.write('1,"Hutan"\n')
        cf.write('2,"Kebun sawit"\n')
        cf.write('3,"Kebun karet"\n')
        cf.write('4,"Sawah"\n')
        cf.write('5,"Lainnya"\n')

    shutil.rmtree(temp_dir, ignore_errors=True)
    print(f"Synthetic fixtures successfully created in {target_dir}")


if __name__ == "__main__":
    out_dir = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), "..", ".work", "synthetic_sources")
    create_synthetic_sources(out_dir)
