/**
 * Minimal pure-JS ISO/IEC 18004 QR Code matrix generator (Byte mode, ECC level M, Versions 1–6).
 * Generates a scannable square matrix of 0/1 modules with zero external dependencies.
 */

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);

(() => {
  let x = 1;
  for (let i = 0; i < 255; i += 1) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i += 1) {
    GF_EXP[i] = GF_EXP[i - 255];
  }
})();

function gfMul(a, b) {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function buildRsGenerator(ecCount) {
  let poly = [1];
  for (let i = 0; i < ecCount; i += 1) {
    const next = new Array(poly.length + 1).fill(0);
    const root = GF_EXP[i];
    for (let j = 0; j < poly.length; j += 1) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], root);
    }
    poly = next;
  }
  return poly;
}

function computeRsEcc(dataBytes, ecCount) {
  const gen = buildRsGenerator(ecCount);
  const buffer = new Array(dataBytes.length + ecCount).fill(0);
  for (let i = 0; i < dataBytes.length; i += 1) {
    buffer[i] = dataBytes[i];
  }

  for (let i = 0; i < dataBytes.length; i += 1) {
    const factor = buffer[i];
    if (factor === 0) continue;
    for (let j = 0; j < gen.length; j += 1) {
      buffer[i + j] ^= gfMul(gen[j], factor);
    }
  }

  return buffer.slice(dataBytes.length);
}

// Version 1–6 specs for Error Correction Level M (all single-group uniform blocks)
const VERSION_SPECS_M = [
  {
    version: 1,
    size: 21,
    totalData: 16,
    blocks: 1,
    dataPerBlock: 16,
    ecPerBlock: 10,
    alignment: [],
  },
  {
    version: 2,
    size: 25,
    totalData: 28,
    blocks: 1,
    dataPerBlock: 28,
    ecPerBlock: 16,
    alignment: [6, 18],
  },
  {
    version: 3,
    size: 29,
    totalData: 44,
    blocks: 1,
    dataPerBlock: 44,
    ecPerBlock: 26,
    alignment: [6, 22],
  },
  {
    version: 4,
    size: 33,
    totalData: 64,
    blocks: 2,
    dataPerBlock: 32,
    ecPerBlock: 18,
    alignment: [6, 26],
  },
  {
    version: 5,
    size: 37,
    totalData: 86,
    blocks: 2,
    dataPerBlock: 43,
    ecPerBlock: 24,
    alignment: [6, 30],
  },
  {
    version: 6,
    size: 41,
    totalData: 108,
    blocks: 4,
    dataPerBlock: 27,
    ecPerBlock: 16,
    alignment: [6, 34],
  },
];

function encodeByteCodewords(bytes, spec) {
  const bits = [];
  const pushBits = (val, length) => {
    for (let i = length - 1; i >= 0; i -= 1) {
      bits.push((val >> i) & 1);
    }
  };

  // Byte mode (0100) + 8-bit character count (Versions 1–9)
  pushBits(0b0100, 4);
  pushBits(bytes.length, 8);
  for (const byte of bytes) {
    pushBits(byte, 8);
  }

  const maxBits = spec.totalData * 8;
  const terminatorLen = Math.min(4, maxBits - bits.length);
  for (let i = 0; i < terminatorLen; i += 1) {
    bits.push(0);
  }
  while (bits.length % 8 !== 0) {
    bits.push(0);
  }

  const codewords = [];
  for (let i = 0; i < bits.length; i += 8) {
    let val = 0;
    for (let b = 0; b < 8; b += 1) {
      val = (val << 1) | bits[i + b];
    }
    codewords.push(val);
  }

  let padToggle = 0;
  while (codewords.length < spec.totalData) {
    codewords.push(padToggle === 0 ? 0xec : 0x11);
    padToggle ^= 1;
  }

  const dataBlocks = [];
  const ecBlocks = [];
  let offset = 0;
  for (let b = 0; b < spec.blocks; b += 1) {
    const blockData = codewords.slice(offset, offset + spec.dataPerBlock);
    dataBlocks.push(blockData);
    ecBlocks.push(computeRsEcc(blockData, spec.ecPerBlock));
    offset += spec.dataPerBlock;
  }

  const interleaved = [];
  for (let i = 0; i < spec.dataPerBlock; i += 1) {
    for (let b = 0; b < spec.blocks; b += 1) {
      interleaved.push(dataBlocks[b][i]);
    }
  }
  for (let i = 0; i < spec.ecPerBlock; i += 1) {
    for (let b = 0; b < spec.blocks; b += 1) {
      interleaved.push(ecBlocks[b][i]);
    }
  }

  const bitstream = [];
  for (const cw of interleaved) {
    for (let bit = 7; bit >= 0; bit -= 1) {
      bitstream.push((cw >> bit) & 1);
    }
  }
  return bitstream;
}

function createEmptyGrid(size, fill = 0) {
  return Array.from({ length: size }, () => new Uint8Array(size).fill(fill));
}

function placeFinderPattern(modules, isFunction, topRow, leftCol) {
  const size = modules.length;
  for (let r = -1; r <= 7; r += 1) {
    for (let c = -1; c <= 7; c += 1) {
      const rr = topRow + r;
      const cc = leftCol + c;
      if (rr < 0 || rr >= size || cc < 0 || cc >= size) continue;

      const isDark =
        r >= 0 &&
        r <= 6 &&
        c >= 0 &&
        c <= 6 &&
        (r === 0 ||
          r === 6 ||
          c === 0 ||
          c === 6 ||
          (r >= 2 && r <= 4 && c >= 2 && c <= 4));

      modules[rr][cc] = isDark ? 1 : 0;
      isFunction[rr][cc] = 1;
    }
  }
}

function placeAlignmentPattern(modules, isFunction, centerRow, centerCol) {
  for (let r = -2; r <= 2; r += 1) {
    for (let c = -2; c <= 2; c += 1) {
      const isDark =
        Math.abs(r) === 2 || Math.abs(c) === 2 || (r === 0 && c === 0);
      modules[centerRow + r][centerCol + c] = isDark ? 1 : 0;
      isFunction[centerRow + r][centerCol + c] = 1;
    }
  }
}

function buildBaseTemplate(spec) {
  const { version, size, alignment } = spec;
  const modules = createEmptyGrid(size, 0);
  const isFunction = createEmptyGrid(size, 0);

  placeFinderPattern(modules, isFunction, 0, 0);
  placeFinderPattern(modules, isFunction, 0, size - 7);
  placeFinderPattern(modules, isFunction, size - 7, 0);

  for (const r of alignment) {
    for (const c of alignment) {
      const overlapsTopLeft = r <= 8 && c <= 8;
      const overlapsTopRight = r <= 8 && c >= size - 8;
      const overlapsBottomLeft = r >= size - 8 && c <= 8;
      if (overlapsTopLeft || overlapsTopRight || overlapsBottomLeft) continue;
      placeAlignmentPattern(modules, isFunction, r, c);
    }
  }

  for (let i = 8; i < size - 8; i += 1) {
    const bit = i % 2 === 0 ? 1 : 0;
    modules[6][i] = bit;
    isFunction[6][i] = 1;
    modules[i][6] = bit;
    isFunction[i][6] = 1;
  }

  // Dark module required by ISO/IEC 18004
  modules[4 * version + 9][8] = 1;
  isFunction[4 * version + 9][8] = 1;

  // Reserve format information cells
  for (let i = 0; i <= 8; i += 1) {
    isFunction[8][i] = 1;
    isFunction[i][8] = 1;
  }
  for (let i = 0; i < 8; i += 1) {
    isFunction[8][size - 1 - i] = 1;
  }
  for (let i = 0; i < 7; i += 1) {
    isFunction[size - 1 - i][8] = 1;
  }

  return { modules, isFunction };
}

function placeDataBits(modules, isFunction, bitstream) {
  const size = modules.length;
  let bitIdx = 0;
  let upward = true;

  for (let rightCol = size - 1; rightCol >= 1; rightCol -= 2) {
    if (rightCol === 6) rightCol -= 1;

    for (let step = 0; step < size; step += 1) {
      const row = upward ? size - 1 - step : step;
      for (let offset = 0; offset < 2; offset += 1) {
        const col = rightCol - offset;
        if (isFunction[row][col]) continue;
        modules[row][col] = bitIdx < bitstream.length ? bitstream[bitIdx] : 0;
        bitIdx += 1;
      }
    }
    upward = !upward;
  }
}

function maskMatches(maskId, row, col) {
  switch (maskId) {
    case 0:
      return (row + col) % 2 === 0;
    case 1:
      return row % 2 === 0;
    case 2:
      return col % 3 === 0;
    case 3:
      return (row + col) % 3 === 0;
    case 4:
      return (Math.floor(row / 2) + Math.floor(col / 3)) % 2 === 0;
    case 5:
      return ((row * col) % 2) + ((row * col) % 3) === 0;
    case 6:
      return (((row * col) % 2) + ((row * col) % 3)) % 2 === 0;
    case 7:
      return (((row + col) % 2) + ((row * col) % 3)) % 2 === 0;
    default:
      return false;
  }
}

function computeFormatBitsForM(maskId) {
  // ECC Level M = 00
  const data = maskId & 0x7;
  let rem = data << 10;
  for (let i = 4; i >= 0; i -= 1) {
    if (rem & (1 << (i + 10))) {
      rem ^= 0x537 << i;
    }
  }
  return ((data << 10) | rem) ^ 0x5412;
}

function writeFormatInfo(modules, maskId) {
  const size = modules.length;
  const format = computeFormatBitsForM(maskId);

  const bitAt = (idx) => (format >> idx) & 1;

  // Copy 1: around top-left finder (bits 14..0)
  for (let i = 0; i <= 5; i += 1) {
    modules[8][i] = bitAt(14 - i);
  }
  modules[8][7] = bitAt(8);
  modules[8][8] = bitAt(7);
  modules[7][8] = bitAt(6);
  for (let i = 0; i <= 5; i += 1) {
    modules[5 - i][8] = bitAt(5 - i);
  }

  // Copy 2: bottom-left (bits 14..8) & top-right (bits 7..0)
  for (let i = 0; i < 7; i += 1) {
    modules[size - 1 - i][8] = bitAt(14 - i);
  }
  for (let i = 0; i < 8; i += 1) {
    modules[8][size - 8 + i] = bitAt(7 - i);
  }
}

function evaluatePenalty(modules) {
  const size = modules.length;
  let penalty = 0;

  // Rule 1: 5+ consecutive modules of same color in rows and columns
  for (let r = 0; r < size; r += 1) {
    let runColor = modules[r][0];
    let runLen = 1;
    for (let c = 1; c < size; c += 1) {
      if (modules[r][c] === runColor) {
        runLen += 1;
      } else {
        if (runLen >= 5) penalty += 3 + (runLen - 5);
        runColor = modules[r][c];
        runLen = 1;
      }
    }
    if (runLen >= 5) penalty += 3 + (runLen - 5);
  }

  for (let c = 0; c < size; c += 1) {
    let runColor = modules[0][c];
    let runLen = 1;
    for (let r = 1; r < size; r += 1) {
      if (modules[r][c] === runColor) {
        runLen += 1;
      } else {
        if (runLen >= 5) penalty += 3 + (runLen - 5);
        runColor = modules[r][c];
        runLen = 1;
      }
    }
    if (runLen >= 5) penalty += 3 + (runLen - 5);
  }

  // Rule 2: 2x2 blocks of same color
  for (let r = 0; r < size - 1; r += 1) {
    for (let c = 0; c < size - 1; c += 1) {
      const color = modules[r][c];
      if (
        modules[r][c + 1] === color &&
        modules[r + 1][c] === color &&
        modules[r + 1][c + 1] === color
      ) {
        penalty += 3;
      }
    }
  }

  // Rule 3: 1:1:3:1:1 pattern with 4-module light zone
  const matchFinderLike = (line, start) => {
    const p1 =
      line[start] === 1 &&
      line[start + 1] === 0 &&
      line[start + 2] === 1 &&
      line[start + 3] === 1 &&
      line[start + 4] === 1 &&
      line[start + 5] === 0 &&
      line[start + 6] === 1;
    if (!p1) return false;
    const leftLight =
      start >= 4 &&
      line[start - 1] === 0 &&
      line[start - 2] === 0 &&
      line[start - 3] === 0 &&
      line[start - 4] === 0;
    const rightLight =
      start + 10 < line.length &&
      line[start + 7] === 0 &&
      line[start + 8] === 0 &&
      line[start + 9] === 0 &&
      line[start + 10] === 0;
    return leftLight || rightLight;
  };

  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c <= size - 7; c += 1) {
      if (matchFinderLike(modules[r], c)) penalty += 40;
    }
  }

  const colLine = new Uint8Array(size);
  for (let c = 0; c < size; c += 1) {
    for (let r = 0; r < size; r += 1) colLine[r] = modules[r][c];
    for (let r = 0; r <= size - 7; r += 1) {
      if (matchFinderLike(colLine, r)) penalty += 40;
    }
  }

  // Rule 4: dark module ratio deviation from 50%
  let darkCount = 0;
  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) {
      if (modules[r][c]) darkCount += 1;
    }
  }
  const percent = (darkCount * 100) / (size * size);
  const prevMultiple = Math.floor(Math.abs(percent - 50) / 5);
  penalty += prevMultiple * 10;

  return penalty;
}

export function generateQrMatrix(text) {
  const bytes = Array.from(new TextEncoder().encode(String(text ?? "")));
  const spec = VERSION_SPECS_M.find((item) => item.totalData >= bytes.length + 2);
  if (!spec) {
    throw new Error("Texto longo demais para geração de QR Code.");
  }

  const bitstream = encodeByteCodewords(bytes, spec);
  const { modules: baseModules, isFunction } = buildBaseTemplate(spec);
  placeDataBits(baseModules, isFunction, bitstream);

  let bestMask = 0;
  let bestPenalty = Number.POSITIVE_INFINITY;
  let bestModules = null;

  for (let maskId = 0; maskId < 8; maskId += 1) {
    const candidate = baseModules.map((row) => new Uint8Array(row));
    for (let r = 0; r < spec.size; r += 1) {
      for (let c = 0; c < spec.size; c += 1) {
        if (!isFunction[r][c] && maskMatches(maskId, r, c)) {
          candidate[r][c] ^= 1;
        }
      }
    }
    writeFormatInfo(candidate, maskId);
    const penalty = evaluatePenalty(candidate);
    if (penalty < bestPenalty) {
      bestPenalty = penalty;
      bestMask = maskId;
      bestModules = candidate;
    }
  }

  return {
    version: spec.version,
    size: spec.size,
    mask: bestMask,
    modules: bestModules.map((row) => Array.from(row)),
  };
}
