/**
 * src/export/shapefile.js
 * Pure JavaScript ESRI Point Shapefile writer (.shp, .shx, .dbf, .prj, .cpg).
 * Produces valid dBASE III and ESRI binary buffers fully compatible with pyshp and geopandas.
 * 
 * Invariants:
 * - Shape type 1 (Point).
 * - First DBF attribute is numeric class_id (type 'N', IDs 1, 2, 3).
 * - Companion attributes class_name and obs_id with ASCII field names.
 * - Standard EPSG:4326 WGS84 coordinate bounds and PRJ.
 */

const WGS84_PRJ = 'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]';
const CPG_CONTENT = 'UTF-8';

/**
 * Creates shapefile binary buffers for an array of point records.
 * @param {Array<{ coordinates: [number, number], class_id: number, class_name: string, obs_id: string }>} records
 * @returns {{ shp: Uint8Array, shx: Uint8Array, dbf: Uint8Array, prj: string, cpg: string }}
 */
export function generatePointShapefile(records) {
  const count = Array.isArray(records) ? records.length : 0;

  // Calculate bounding box
  let minX = 0, minY = 0, maxX = 0, maxY = 0;
  if (count > 0) {
    minX = Infinity;
    minY = Infinity;
    maxX = -Infinity;
    maxY = -Infinity;
    for (const rec of records) {
      const [lon, lat] = rec.coordinates;
      if (lon < minX) minX = lon;
      if (lat < minY) minY = lat;
      if (lon > maxX) maxX = lon;
      if (lat > maxY) maxY = lat;
    }
  }

  // 1. Build .shp Buffer
  // File length: 100 bytes header + 28 bytes per point record
  const shpByteLength = 100 + count * 28;
  const shpBuffer = new ArrayBuffer(shpByteLength);
  const shpView = new DataView(shpBuffer);

  writeShapefileHeader(shpView, shpByteLength, minX, minY, maxX, maxY);

  let shpOffset = 100;
  for (let i = 0; i < count; i++) {
    const rec = records[i];
    const recNum = i + 1;
    // Record Header (8 bytes)
    shpView.setInt32(shpOffset, recNum, false); // Big-Endian record number
    shpView.setInt32(shpOffset + 4, 10, false);  // Content length in 16-bit words (20 bytes / 2 = 10)
    shpOffset += 8;

    // Record Content (20 bytes)
    shpView.setInt32(shpOffset, 1, true); // Shape type 1 = Point (Little-Endian)
    shpView.setFloat64(shpOffset + 4, rec.coordinates[0], true); // X (lon)
    shpView.setFloat64(shpOffset + 12, rec.coordinates[1], true); // Y (lat)
    shpOffset += 20;
  }

  // 2. Build .shx Buffer
  // File length: 100 bytes header + 8 bytes per record index
  const shxByteLength = 100 + count * 8;
  const shxBuffer = new ArrayBuffer(shxByteLength);
  const shxView = new DataView(shxBuffer);

  writeShapefileHeader(shxView, shxByteLength, minX, minY, maxX, maxY);

  let shxOffset = 100;
  for (let i = 0; i < count; i++) {
    const recordOffsetWords = (100 + i * 28) / 2; // Offset in 16-bit words
    shxView.setInt32(shxOffset, recordOffsetWords, false); // Big-Endian
    shxView.setInt32(shxOffset + 4, 10, false);             // Content length in words (Big-Endian)
    shxOffset += 8;
  }

  // 3. Build .dbf Buffer (dBASE III)
  // Fields:
  // 1. class_id: 'N', length 10, dec 0 (FIRST attribute numeric)
  // 2. class_name: 'C', length 50
  // 3. obs_id: 'C', length 32
  const fields = [
    { name: 'class_id', type: 'N', length: 10, dec: 0 },
    { name: 'class_name', type: 'C', length: 50, dec: 0 },
    { name: 'obs_id', type: 'C', length: 32, dec: 0 }
  ];

  const headerLength = 32 + fields.length * 32 + 1; // 32 + 96 + 1 = 129
  const recordLength = 1 + fields.reduce((sum, f) => sum + f.length, 0); // 1 + 10 + 50 + 32 = 93
  const dbfByteLength = headerLength + count * recordLength + 1; // +1 for 0x1A EOF marker

  const dbfBuffer = new ArrayBuffer(dbfByteLength);
  const dbfView = new DataView(dbfBuffer);
  const dbfBytes = new Uint8Array(dbfBuffer);

  const now = new Date();
  dbfView.setUint8(0, 0x03); // dBASE III without memo
  dbfView.setUint8(1, (now.getUTCFullYear() - 1900) % 256); // YY
  dbfView.setUint8(2, now.getUTCMonth() + 1); // MM
  dbfView.setUint8(3, now.getUTCDate()); // DD
  dbfView.setUint32(4, count, true); // Number of records (Little-Endian)
  dbfView.setUint16(8, headerLength, true); // Length of header structure
  dbfView.setUint16(10, recordLength, true); // Length of record

  // Write field descriptors
  let fieldOffset = 32;
  for (const field of fields) {
    // Field name: 11 bytes ASCII, null padded
    for (let c = 0; c < 11; c++) {
      dbfBytes[fieldOffset + c] = c < field.name.length ? field.name.charCodeAt(c) : 0;
    }
    dbfView.setUint8(fieldOffset + 11, field.type.charCodeAt(0));
    dbfView.setUint32(fieldOffset + 12, 0, true); // Displacement
    dbfView.setUint8(fieldOffset + 16, field.length);
    dbfView.setUint8(fieldOffset + 17, field.dec);
    // Remaining bytes are reserved (0)
    fieldOffset += 32;
  }

  // Header terminator byte (0x0D)
  dbfBytes[32 + fields.length * 32] = 0x0D;

  // Write records
  let recOffset = headerLength;
  const encoder = new TextEncoder();

  for (let i = 0; i < count; i++) {
    const rec = records[i];
    // Record deletion flag (0x20 = not deleted)
    dbfBytes[recOffset] = 0x20;
    let colOffset = recOffset + 1;

    // 1. class_id (Numeric, right-aligned, length 10)
    const classIdStr = String(rec.class_id !== null && rec.class_id !== undefined ? rec.class_id : '').padStart(10, ' ');
    for (let c = 0; c < 10; c++) {
      dbfBytes[colOffset + c] = classIdStr.charCodeAt(c);
    }
    colOffset += 10;

    // 2. class_name (Character, left-aligned, length 50)
    const classNameStr = (rec.class_name || '').slice(0, 50).padEnd(50, ' ');
    const encodedName = encoder.encode(classNameStr);
    for (let c = 0; c < 50; c++) {
      dbfBytes[colOffset + c] = c < encodedName.length ? encodedName[c] : 0x20;
    }
    colOffset += 50;

    // 3. obs_id (Character, left-aligned, length 32)
    const obsIdStr = (rec.obs_id || '').slice(0, 32).padEnd(32, ' ');
    for (let c = 0; c < 32; c++) {
      dbfBytes[colOffset + c] = obsIdStr.charCodeAt(c);
    }

    recOffset += recordLength;
  }

  // EOF marker
  dbfBytes[recOffset] = 0x1A;

  return {
    shp: new Uint8Array(shpBuffer),
    shx: new Uint8Array(shxBuffer),
    dbf: dbfBytes,
    prj: WGS84_PRJ,
    cpg: CPG_CONTENT
  };
}

/**
 * Writes standard 100-byte shapefile header.
 */
function writeShapefileHeader(view, byteLength, minX, minY, maxX, maxY) {
  view.setInt32(0, 9994, false); // File Code (Big-Endian)
  // Bytes 4-23: Unused (all 0)
  view.setInt32(24, Math.floor(byteLength / 2), false); // File Length in 16-bit words (Big-Endian)
  view.setInt32(28, 1000, true); // Version (Little-Endian)
  view.setInt32(32, 1, true);    // Shape Type: 1 = Point (Little-Endian)
  view.setFloat64(36, minX, true); // Xmin
  view.setFloat64(44, minY, true); // Ymin
  view.setFloat64(52, maxX, true); // Xmax
  view.setFloat64(60, maxY, true); // Ymax
  view.setFloat64(68, 0.0, true);  // Zmin
  view.setFloat64(76, 0.0, true);  // Zmax
  view.setFloat64(84, 0.0, true);  // Mmin
  view.setFloat64(92, 0.0, true);  // Mmax
}
