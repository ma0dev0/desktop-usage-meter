import fs from 'node:fs';
import zlib from 'node:zlib';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const previews = [
  { path: '/tmp/notchmeter-preview.png', transparent: true, leftContent: true, rightContent: true, leftBars: true, rightBars: true },
  { path: '/tmp/notchmeter-critical.png', transparent: true, leftContent: true, rightContent: true, leftBars: true, rightBars: true },
  { path: '/tmp/notchmeter-single.png', transparent: true, leftContent: false, rightContent: true, leftBars: false, rightBars: true },
  { path: '/tmp/notchmeter-backdrop.png', transparent: false, leftBars: true, rightBars: true },
  { path: '/tmp/notchmeter-hover.png', transparent: false, leftBars: true, rightBars: true },
  { path: '/tmp/notchmeter-empty.png', transparent: false, leftBars: false, rightBars: false },
  { path: '/tmp/notchmeter-off.png', transparent: false, leftBars: false, rightBars: false },
  { path: '/tmp/notchmeter-login-required.png', transparent: false, leftBars: false, rightBars: false },
  { path: '/tmp/notchmeter-stale.png', transparent: false, leftBars: true, rightBars: true },
  { path: '/tmp/notchmeter-unavailable.png', transparent: true, leftContent: true, rightContent: true, leftBars: false, rightBars: false },
  { path: '/tmp/notchmeter-refreshing.png', transparent: true, leftContent: true, rightContent: true, leftBars: true, rightBars: true },
  { path: '/tmp/notchmeter-refresh-error.png', transparent: true, leftContent: true, rightContent: true, leftBars: true, rightBars: true },
  { path: '/tmp/notchmeter-missing.png', transparent: false, leftBars: false, rightBars: false },
  { path: '/tmp/notchmeter-unreadable.png', transparent: false, leftBars: false, rightBars: false }
];

function parsePng(path) {
  const buffer = fs.readFileSync(path);
  if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error(`${path}: not a PNG file`);
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idatChunks = [];

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;

    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === 'IDAT') {
      idatChunks.push(data);
    } else if (type === 'IEND') {
      break;
    }
  }

  if (bitDepth !== 8 || colorType !== 6) {
    throw new Error(`${path}: expected 8-bit RGBA PNG, got bitDepth=${bitDepth} colorType=${colorType}`);
  }

  return {
    width,
    height,
    pixels: inflateRgba({
      width,
      height,
      data: zlib.inflateSync(Buffer.concat(idatChunks))
    })
  };
}

function paethPredictor(left, up, upLeft) {
  const p = left + up - upLeft;
  const pa = Math.abs(p - left);
  const pb = Math.abs(p - up);
  const pc = Math.abs(p - upLeft);
  if (pa <= pb && pa <= pc) return left;
  if (pb <= pc) return up;
  return upLeft;
}

function inflateRgba({ width, height, data }) {
  const bytesPerPixel = 4;
  const stride = width * bytesPerPixel;
  const pixels = Buffer.alloc(height * stride);
  let source = 0;

  for (let y = 0; y < height; y++) {
    const filter = data[source++];
    const rowStart = y * stride;
    const prevRowStart = rowStart - stride;

    for (let x = 0; x < stride; x++) {
      const raw = data[source++];
      const left = x >= bytesPerPixel ? pixels[rowStart + x - bytesPerPixel] : 0;
      const up = y > 0 ? pixels[prevRowStart + x] : 0;
      const upLeft = y > 0 && x >= bytesPerPixel ? pixels[prevRowStart + x - bytesPerPixel] : 0;

      let value;
      if (filter === 0) value = raw;
      else if (filter === 1) value = raw + left;
      else if (filter === 2) value = raw + up;
      else if (filter === 3) value = raw + Math.floor((left + up) / 2);
      else if (filter === 4) value = raw + paethPredictor(left, up, upLeft);
      else throw new Error(`unsupported PNG filter ${filter}`);

      pixels[rowStart + x] = value & 0xff;
    }
  }

  return pixels;
}

function alphaAt(image, x, y) {
  return image.pixels[(y * image.width + x) * 4 + 3];
}

function rgbaAt(image, x, y) {
  const offset = (y * image.width + x) * 4;
  return {
    red: image.pixels[offset],
    green: image.pixels[offset + 1],
    blue: image.pixels[offset + 2],
    alpha: image.pixels[offset + 3]
  };
}

function countOpaquePixels(image, region) {
  let count = 0;
  for (let y = region.y; y < region.y + region.height; y++) {
    for (let x = region.x; x < region.x + region.width; x++) {
      if (alphaAt(image, x, y) > 16) count++;
    }
  }
  return count;
}

function countVividPixels(image, region) {
  let count = 0;
  for (let y = region.y; y < region.y + region.height; y++) {
    for (let x = region.x; x < region.x + region.width; x++) {
      if (isVividPixel(rgbaAt(image, x, y))) count++;
    }
  }
  return count;
}

function countVividRunPixels(image, region) {
  let count = 0;
  for (let y = region.y; y < region.y + region.height; y++) {
    let runLength = 0;
    for (let x = region.x; x < region.x + region.width; x++) {
      if (isVividPixel(rgbaAt(image, x, y))) {
        runLength++;
      } else {
        if (runLength >= 10) count += runLength;
        runLength = 0;
      }
    }
    if (runLength >= 10) count += runLength;
  }
  return count;
}

function isVividPixel({ red, green, blue, alpha }) {
  if (alpha <= 40) return false;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const saturation = max === 0 ? 0 : (max - min) / max;
  return max > 95 && saturation > 0.28;
}

for (const preview of previews) {
  const image = parsePng(preview.path);
  if (image.width < 1000 || image.height < 70 || image.height > 120) {
    throw new Error(`${preview.path}: unexpected size ${image.width}x${image.height}`);
  }

  const visiblePixels = countOpaquePixels(image, {
    x: 0,
    y: 0,
    width: image.width,
    height: image.height
  });
  if (visiblePixels < 1000) {
    throw new Error(`${preview.path}: too little visible content (${visiblePixels} pixels)`);
  }

  if (preview.transparent) {
    const safeGapWidth = Math.round(image.width * 0.2);
    const safeGap = {
      x: Math.round((image.width - safeGapWidth) / 2),
      y: 0,
      width: safeGapWidth,
      height: image.height
    };
    const intrusivePixels = countOpaquePixels(image, safeGap);
    if (intrusivePixels > 0) {
      throw new Error(`${preview.path}: ${intrusivePixels} pixels intrude into center notch safe gap`);
    }

    const leftRegion = {
      x: 0,
      y: 0,
      width: safeGap.x,
      height: image.height
    };
    const rightRegion = {
      x: safeGap.x + safeGap.width,
      y: 0,
      width: image.width - safeGap.x - safeGap.width,
      height: image.height
    };
    assertRegionContent({
      path: preview.path,
      name: 'left',
      count: countOpaquePixels(image, leftRegion),
      expected: preview.leftContent
    });
    assertRegionContent({
      path: preview.path,
      name: 'right',
      count: countOpaquePixels(image, rightRegion),
      expected: preview.rightContent
    });
    assertNotchAdjacentContent({
      path: preview.path,
      image,
      safeGap,
      leftRegion,
      rightRegion,
      leftExpected: preview.leftContent,
      rightExpected: preview.rightContent
    });
  }

  assertLimitBars({ preview, image });

  console.log(`ok   - ${preview.path} ${image.width}x${image.height}`);
}

assertHoverDelta({
  baseline: parsePng('/tmp/notchmeter-backdrop.png'),
  hover: parsePng('/tmp/notchmeter-hover.png'),
  path: '/tmp/notchmeter-hover.png'
});

function assertRegionContent({ path, name, count, expected }) {
  if (expected == null) return;
  if (expected && count < 1000) {
    throw new Error(`${path}: expected ${name} content, found only ${count} pixels`);
  }
  if (!expected && count > 50) {
    throw new Error(`${path}: unexpected ${name} content (${count} pixels)`);
  }
}

function assertNotchAdjacentContent({
  path,
  image,
  safeGap,
  leftRegion,
  rightRegion,
  leftExpected,
  rightExpected
}) {
  const maxDistanceFromNotch = Math.round(image.width * 0.08);

  if (leftExpected) {
    const leftBounds = opaqueBounds(image, leftRegion);
    const leftDistance = safeGap.x - (leftBounds.x + leftBounds.width);
    if (leftDistance > maxDistanceFromNotch) {
      throw new Error(`${path}: left content is too far from notch (${leftDistance}px)`);
    }
  }

  if (rightExpected) {
    const rightBounds = opaqueBounds(image, rightRegion);
    const rightDistance = rightBounds.x - (safeGap.x + safeGap.width);
    if (rightDistance > maxDistanceFromNotch) {
      throw new Error(`${path}: right content is too far from notch (${rightDistance}px)`);
    }
  }
}

function opaqueBounds(image, region) {
  let minX = region.x + region.width;
  let minY = region.y + region.height;
  let maxX = region.x - 1;
  let maxY = region.y - 1;

  for (let y = region.y; y < region.y + region.height; y++) {
    for (let x = region.x; x < region.x + region.width; x++) {
      if (alphaAt(image, x, y) <= 16) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX < minX || maxY < minY) {
    throw new Error('expected opaque content bounds, found none');
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1
  };
}

function assertLimitBars({ preview, image }) {
  const meterBand = {
    y: Math.round(image.height * 0.34),
    height: Math.round(image.height * 0.32)
  };
  const leftRegion = {
    x: Math.round(image.width * 0.1),
    y: meterBand.y,
    width: Math.round(image.width * 0.3),
    height: meterBand.height
  };
  const centerRegion = {
    x: Math.round(image.width * 0.4),
    y: meterBand.y,
    width: Math.round(image.width * 0.2),
    height: meterBand.height
  };
  const rightRegion = {
    x: Math.round(image.width * 0.77),
    y: meterBand.y,
    width: Math.round(image.width * 0.23),
    height: meterBand.height
  };

  assertRegionBars({
    path: preview.path,
    name: 'left limit bars',
    count: countVividRunPixels(image, leftRegion),
    expected: preview.leftBars
  });
  assertRegionBars({
    path: preview.path,
    name: 'right limit bars',
    count: countVividRunPixels(image, rightRegion),
    expected: preview.rightBars
  });

  const centerBars = countVividRunPixels(image, centerRegion);
  if (centerBars > 20) {
    throw new Error(`${preview.path}: colored limit bars intrude into center notch area (${centerBars} vivid pixels)`);
  }
}

function assertRegionBars({ path, name, count, expected }) {
  if (expected == null) return;
  if (expected && count < 120) {
    throw new Error(`${path}: expected ${name}, found only ${count} vivid pixels`);
  }
  if (!expected && count > 80) {
    throw new Error(`${path}: unexpected ${name} (${count} vivid pixels)`);
  }
}

function assertHoverDelta({ baseline, hover, path }) {
  if (baseline.width !== hover.width || baseline.height !== hover.height) {
    throw new Error(`${path}: hover preview size differs from baseline`);
  }

  const leftRegion = {
    x: 0,
    y: 0,
    width: Math.round(hover.width * 0.4),
    height: hover.height
  };
  const rightRegion = {
    x: Math.round(hover.width * 0.6),
    y: 0,
    width: Math.round(hover.width * 0.4),
    height: hover.height
  };

  const leftDelta = countChangedPixels(baseline, hover, leftRegion);
  const rightDelta = countChangedPixels(baseline, hover, rightRegion);
  if (leftDelta < 800) {
    throw new Error(`${path}: expected left hover highlight, found only ${leftDelta} changed pixels`);
  }
  if (rightDelta > 160) {
    throw new Error(`${path}: hover changed too much of the right capsule (${rightDelta} pixels)`);
  }
}

function countChangedPixels(baseline, hover, region) {
  let count = 0;
  for (let y = region.y; y < region.y + region.height; y++) {
    for (let x = region.x; x < region.x + region.width; x++) {
      const before = rgbaAt(baseline, x, y);
      const after = rgbaAt(hover, x, y);
      const diff =
        Math.abs(before.red - after.red) +
        Math.abs(before.green - after.green) +
        Math.abs(before.blue - after.blue) +
        Math.abs(before.alpha - after.alpha);
      if (diff > 12) count++;
    }
  }
  return count;
}
