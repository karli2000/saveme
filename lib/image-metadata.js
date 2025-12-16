/**
 * Image Metadata Handler
 * Adds URL and datetime metadata to supported image formats
 */

/**
 * Add metadata to an image blob if the format supports it
 * @param {Blob} blob - Original image blob
 * @param {string} url - Source URL to embed
 * @param {Date} datetime - Datetime to embed
 * @returns {Promise<Blob>} - Image blob with metadata (or original if unsupported)
 */
export async function addImageMetadata(blob, url, datetime) {
  const mimeType = blob.type;

  try {
    switch (mimeType) {
      case 'image/jpeg':
      case 'image/jpg':
        return await addJpegMetadata(blob, url, datetime);
      case 'image/png':
        return await addPngMetadata(blob, url, datetime);
      case 'image/webp':
        return await addWebpMetadata(blob, url, datetime);
      default:
        // Format doesn't support metadata or not implemented
        return blob;
    }
  } catch (error) {
    console.warn('Failed to add metadata:', error);
    // Return original blob if metadata addition fails
    return blob;
  }
}

/**
 * Add EXIF metadata to JPEG image
 */
async function addJpegMetadata(blob, url, datetime) {
  const arrayBuffer = await blob.arrayBuffer();
  const data = new Uint8Array(arrayBuffer);

  // Verify JPEG signature
  if (data[0] !== 0xFF || data[1] !== 0xD8) {
    return blob;
  }

  // Create EXIF segment with metadata
  const exifSegment = createJpegExifSegment(url, datetime);

  // Find position to insert EXIF (after SOI marker)
  let insertPos = 2;

  // Skip any existing APP0 (JFIF) segment
  if (data[2] === 0xFF && data[3] === 0xE0) {
    const app0Length = (data[4] << 8) | data[5];
    insertPos = 4 + app0Length;
  }

  // Remove existing APP1 (EXIF) segment if present
  let dataToUse = data;
  if (data[insertPos] === 0xFF && data[insertPos + 1] === 0xE1) {
    const app1Length = (data[insertPos + 2] << 8) | data[insertPos + 3];
    // Remove existing EXIF segment
    const before = data.slice(0, insertPos);
    const after = data.slice(insertPos + 2 + app1Length);
    dataToUse = new Uint8Array(before.length + after.length);
    dataToUse.set(before, 0);
    dataToUse.set(after, before.length);
  }

  // Build new image with EXIF segment
  const newData = new Uint8Array(dataToUse.length + exifSegment.length);
  newData.set(dataToUse.slice(0, insertPos), 0);
  newData.set(exifSegment, insertPos);
  newData.set(dataToUse.slice(insertPos), insertPos + exifSegment.length);

  return new Blob([newData], { type: 'image/jpeg' });
}

/**
 * Create JPEG APP1 EXIF segment with metadata
 */
function createJpegExifSegment(url, datetime) {
  const exifDatetime = formatExifDatetime(datetime);
  const description = `Source: ${url}`;

  // Build complete EXIF/TIFF structure
  const tiffData = buildTiffStructure(description, exifDatetime);

  // APP1 marker (0xFFE1) + length (2 bytes) + "Exif\0\0" (6 bytes) + TIFF data
  const segmentLength = 2 + 6 + tiffData.length; // length field + Exif header + data
  const segment = new Uint8Array(2 + segmentLength);

  segment[0] = 0xFF;
  segment[1] = 0xE1;
  segment[2] = (segmentLength >> 8) & 0xFF;
  segment[3] = segmentLength & 0xFF;
  segment[4] = 0x45; // E
  segment[5] = 0x78; // x
  segment[6] = 0x69; // i
  segment[7] = 0x66; // f
  segment[8] = 0x00;
  segment[9] = 0x00;
  segment.set(tiffData, 10);

  return segment;
}

/**
 * Build TIFF structure with IFD0 and EXIF sub-IFD
 */
function buildTiffStructure(description, datetime) {
  const chunks = [];
  let currentOffset = 8; // Start after TIFF header

  // Strings to embed (must be null-terminated, exactly 20 chars for datetime)
  const descStr = description + '\0';
  const dateStr = datetime + '\0'; // Should be exactly 20 bytes: "YYYY:MM:DD HH:MM:SS\0"

  // === IFD0 (Main Image IFD) ===
  // Tags: ImageDescription (0x010E), DateTime (0x0132), ExifIFDPointer (0x8769)
  const ifd0TagCount = 3;
  const ifd0Size = 2 + (ifd0TagCount * 12) + 4; // count + entries + next IFD pointer

  // === EXIF Sub-IFD ===
  // Tags: DateTimeOriginal (0x9003), DateTimeDigitized (0x9004), UserComment (0x9286)
  const exifTagCount = 3;
  const exifIfdSize = 2 + (exifTagCount * 12) + 4;

  // Calculate offsets
  const ifd0Offset = 8;
  const exifIfdOffset = ifd0Offset + ifd0Size;
  const dataAreaOffset = exifIfdOffset + exifIfdSize;

  // Data area contents and their offsets
  let dataOffset = dataAreaOffset;
  const descOffset = dataOffset;
  dataOffset += descStr.length;
  const dateOffset = dataOffset;
  dataOffset += dateStr.length;
  const dateOrigOffset = dataOffset;
  dataOffset += dateStr.length;
  const dateDigOffset = dataOffset;
  dataOffset += dateStr.length;

  // UserComment: "ASCII\0\0\0" prefix (8 bytes) + comment
  const userCommentPrefix = new Uint8Array([0x41, 0x53, 0x43, 0x49, 0x49, 0x00, 0x00, 0x00]);
  const userCommentText = new TextEncoder().encode(description);
  const userCommentOffset = dataOffset;
  const userCommentLength = userCommentPrefix.length + userCommentText.length;

  // === Build TIFF Header ===
  const tiffHeader = new Uint8Array(8);
  tiffHeader[0] = 0x4D; // M
  tiffHeader[1] = 0x4D; // M (big-endian / Motorola)
  tiffHeader[2] = 0x00;
  tiffHeader[3] = 0x2A; // TIFF magic
  tiffHeader[4] = (ifd0Offset >> 24) & 0xFF;
  tiffHeader[5] = (ifd0Offset >> 16) & 0xFF;
  tiffHeader[6] = (ifd0Offset >> 8) & 0xFF;
  tiffHeader[7] = ifd0Offset & 0xFF;

  // === Build IFD0 ===
  const ifd0 = new Uint8Array(ifd0Size);
  let pos = 0;

  // Tag count (big-endian)
  ifd0[pos++] = (ifd0TagCount >> 8) & 0xFF;
  ifd0[pos++] = ifd0TagCount & 0xFF;

  // Tag 0x010E: ImageDescription
  pos = writeIfdEntryBE(ifd0, pos, 0x010E, 2, descStr.length, descOffset);

  // Tag 0x0132: DateTime (modification date)
  pos = writeIfdEntryBE(ifd0, pos, 0x0132, 2, dateStr.length, dateOffset);

  // Tag 0x8769: ExifIFDPointer
  pos = writeIfdEntryBE(ifd0, pos, 0x8769, 4, 1, exifIfdOffset);

  // Next IFD pointer (0 = none)
  ifd0[pos++] = 0;
  ifd0[pos++] = 0;
  ifd0[pos++] = 0;
  ifd0[pos++] = 0;

  // === Build EXIF Sub-IFD ===
  const exifIfd = new Uint8Array(exifIfdSize);
  pos = 0;

  // Tag count
  exifIfd[pos++] = (exifTagCount >> 8) & 0xFF;
  exifIfd[pos++] = exifTagCount & 0xFF;

  // Tag 0x9003: DateTimeOriginal
  pos = writeIfdEntryBE(exifIfd, pos, 0x9003, 2, dateStr.length, dateOrigOffset);

  // Tag 0x9004: DateTimeDigitized
  pos = writeIfdEntryBE(exifIfd, pos, 0x9004, 2, dateStr.length, dateDigOffset);

  // Tag 0x9286: UserComment
  pos = writeIfdEntryBE(exifIfd, pos, 0x9286, 7, userCommentLength, userCommentOffset);

  // Next IFD pointer (0 = none)
  exifIfd[pos++] = 0;
  exifIfd[pos++] = 0;
  exifIfd[pos++] = 0;
  exifIfd[pos++] = 0;

  // === Build Data Area ===
  const descBytes = new TextEncoder().encode(descStr);
  const dateBytes = new TextEncoder().encode(dateStr);

  // Calculate total size
  const totalSize = tiffHeader.length + ifd0.length + exifIfd.length +
                    descBytes.length + dateBytes.length * 3 + userCommentLength;

  const result = new Uint8Array(totalSize);
  let offset = 0;

  result.set(tiffHeader, offset); offset += tiffHeader.length;
  result.set(ifd0, offset); offset += ifd0.length;
  result.set(exifIfd, offset); offset += exifIfd.length;
  result.set(descBytes, offset); offset += descBytes.length;
  result.set(dateBytes, offset); offset += dateBytes.length; // DateTime
  result.set(dateBytes, offset); offset += dateBytes.length; // DateTimeOriginal
  result.set(dateBytes, offset); offset += dateBytes.length; // DateTimeDigitized
  result.set(userCommentPrefix, offset); offset += userCommentPrefix.length;
  result.set(userCommentText, offset);

  return result;
}

/**
 * Write a single IFD entry (big-endian)
 */
function writeIfdEntryBE(ifd, offset, tag, type, count, value) {
  // Tag (2 bytes, big-endian)
  ifd[offset++] = (tag >> 8) & 0xFF;
  ifd[offset++] = tag & 0xFF;

  // Type (2 bytes, big-endian)
  ifd[offset++] = (type >> 8) & 0xFF;
  ifd[offset++] = type & 0xFF;

  // Count (4 bytes, big-endian)
  ifd[offset++] = (count >> 24) & 0xFF;
  ifd[offset++] = (count >> 16) & 0xFF;
  ifd[offset++] = (count >> 8) & 0xFF;
  ifd[offset++] = count & 0xFF;

  // Value/Offset (4 bytes, big-endian)
  ifd[offset++] = (value >> 24) & 0xFF;
  ifd[offset++] = (value >> 16) & 0xFF;
  ifd[offset++] = (value >> 8) & 0xFF;
  ifd[offset++] = value & 0xFF;

  return offset;
}

/**
 * Add metadata to PNG image using tEXt chunks
 */
async function addPngMetadata(blob, url, datetime) {
  const arrayBuffer = await blob.arrayBuffer();
  const data = new Uint8Array(arrayBuffer);

  // Verify PNG signature
  const pngSignature = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
  for (let i = 0; i < 8; i++) {
    if (data[i] !== pngSignature[i]) {
      return blob;
    }
  }

  // Create tEXt chunks for metadata
  const sourceChunk = createPngTextChunk('Source', url);
  const dateChunk = createPngTextChunk('Creation Time', datetime.toISOString());
  const commentChunk = createPngTextChunk('Comment', `Saved from: ${url} on ${datetime.toISOString()}`);

  // Find position after IHDR chunk to insert our chunks
  let pos = 8; // Skip PNG signature
  const ihdrLength = (data[pos] << 24) | (data[pos + 1] << 16) | (data[pos + 2] << 8) | data[pos + 3];
  pos += 4 + 4 + ihdrLength + 4; // length + type + data + CRC

  // Build new PNG with metadata chunks
  const metadataSize = sourceChunk.length + dateChunk.length + commentChunk.length;
  const newData = new Uint8Array(data.length + metadataSize);

  newData.set(data.slice(0, pos), 0);
  let insertPos = pos;
  newData.set(sourceChunk, insertPos); insertPos += sourceChunk.length;
  newData.set(dateChunk, insertPos); insertPos += dateChunk.length;
  newData.set(commentChunk, insertPos); insertPos += commentChunk.length;
  newData.set(data.slice(pos), insertPos);

  return new Blob([newData], { type: 'image/png' });
}

/**
 * Create a PNG tEXt chunk
 */
function createPngTextChunk(keyword, text) {
  const keywordBytes = new TextEncoder().encode(keyword);
  const textBytes = new TextEncoder().encode(text);

  // tEXt chunk: keyword + null separator + text
  const chunkData = new Uint8Array(keywordBytes.length + 1 + textBytes.length);
  chunkData.set(keywordBytes, 0);
  chunkData[keywordBytes.length] = 0; // Null separator
  chunkData.set(textBytes, keywordBytes.length + 1);

  // Build complete chunk: length(4) + type(4) + data + CRC(4)
  const chunkType = new TextEncoder().encode('tEXt');
  const chunk = new Uint8Array(4 + 4 + chunkData.length + 4);

  // Length (big-endian)
  const length = chunkData.length;
  chunk[0] = (length >> 24) & 0xFF;
  chunk[1] = (length >> 16) & 0xFF;
  chunk[2] = (length >> 8) & 0xFF;
  chunk[3] = length & 0xFF;

  // Type
  chunk.set(chunkType, 4);

  // Data
  chunk.set(chunkData, 8);

  // CRC (of type + data)
  const crcData = new Uint8Array(4 + chunkData.length);
  crcData.set(chunkType, 0);
  crcData.set(chunkData, 4);
  const crc = calculateCrc32(crcData);
  chunk[chunk.length - 4] = (crc >> 24) & 0xFF;
  chunk[chunk.length - 3] = (crc >> 16) & 0xFF;
  chunk[chunk.length - 2] = (crc >> 8) & 0xFF;
  chunk[chunk.length - 1] = crc & 0xFF;

  return chunk;
}

/**
 * Add XMP metadata to WebP image
 */
async function addWebpMetadata(blob, url, datetime) {
  const arrayBuffer = await blob.arrayBuffer();
  const data = new Uint8Array(arrayBuffer);

  // Verify WebP signature (RIFF....WEBP)
  if (data[0] !== 0x52 || data[1] !== 0x49 || data[2] !== 0x46 || data[3] !== 0x46 ||
      data[8] !== 0x57 || data[9] !== 0x45 || data[10] !== 0x42 || data[11] !== 0x50) {
    return blob;
  }

  // Create XMP metadata chunk
  const xmpData = createXmpMetadata(url, datetime);
  const xmpChunk = createWebpXmpChunk(xmpData);

  // Insert XMP chunk after WEBP header (position 12)
  const insertPos = 12;

  // Build new WebP with XMP chunk
  const newData = new Uint8Array(data.length + xmpChunk.length);
  newData.set(data.slice(0, insertPos), 0);
  newData.set(xmpChunk, insertPos);
  newData.set(data.slice(insertPos), insertPos + xmpChunk.length);

  // Update RIFF file size (bytes 4-7, little-endian)
  const newFileSize = newData.length - 8;
  newData[4] = newFileSize & 0xFF;
  newData[5] = (newFileSize >> 8) & 0xFF;
  newData[6] = (newFileSize >> 16) & 0xFF;
  newData[7] = (newFileSize >> 24) & 0xFF;

  return new Blob([newData], { type: 'image/webp' });
}

/**
 * Create XMP metadata string
 */
function createXmpMetadata(url, datetime) {
  const isoDate = datetime.toISOString();
  return `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about=""
      xmlns:dc="http://purl.org/dc/elements/1.1/"
      xmlns:xmp="http://ns.adobe.com/xap/1.0/">
      <dc:source>${escapeXml(url)}</dc:source>
      <dc:description>Saved from: ${escapeXml(url)}</dc:description>
      <xmp:CreateDate>${isoDate}</xmp:CreateDate>
      <xmp:ModifyDate>${isoDate}</xmp:ModifyDate>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
}

/**
 * Create WebP XMP chunk
 */
function createWebpXmpChunk(xmpString) {
  const xmpBytes = new TextEncoder().encode(xmpString);

  // Pad to even length if necessary
  const paddedLength = xmpBytes.length + (xmpBytes.length % 2);
  const paddedXmp = new Uint8Array(paddedLength);
  paddedXmp.set(xmpBytes, 0);

  // XMP chunk: "XMP " + data
  const chunkId = new TextEncoder().encode('XMP ');
  const chunk = new Uint8Array(4 + 4 + paddedLength);

  // Chunk ID
  chunk.set(chunkId, 0);

  // Chunk size (little-endian)
  chunk[4] = paddedLength & 0xFF;
  chunk[5] = (paddedLength >> 8) & 0xFF;
  chunk[6] = (paddedLength >> 16) & 0xFF;
  chunk[7] = (paddedLength >> 24) & 0xFF;

  // Data
  chunk.set(paddedXmp, 8);

  return chunk;
}

/**
 * Format datetime for EXIF (YYYY:MM:DD HH:MM:SS)
 */
function formatExifDatetime(datetime) {
  const pad = (n) => n.toString().padStart(2, '0');
  return `${datetime.getFullYear()}:${pad(datetime.getMonth() + 1)}:${pad(datetime.getDate())} ` +
         `${pad(datetime.getHours())}:${pad(datetime.getMinutes())}:${pad(datetime.getSeconds())}`;
}

/**
 * Escape XML special characters
 */
function escapeXml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Calculate CRC-32 for PNG chunks
 */
function calculateCrc32(data) {
  // CRC-32 lookup table
  const crcTable = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    crcTable[i] = c;
  }

  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) {
    crc = crcTable[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
