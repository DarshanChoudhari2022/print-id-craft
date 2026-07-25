export type PhotoPlacement = {
  dx: number
  dy: number
  dw: number
  dh: number
}

export function getCoverPhotoPlacement(
  sourceWidth: number,
  sourceHeight: number,
  boxX: number,
  boxY: number,
  boxWidth: number,
  boxHeight: number,
): PhotoPlacement {
  const photoAspect = sourceWidth / sourceHeight
  const boxAspect = boxWidth / boxHeight

  if (photoAspect < boxAspect) {
    return {
      dx: boxX,
      dy: boxY,
      dw: boxWidth,
      dh: boxWidth / photoAspect,
    }
  }

  const dw = boxHeight * photoAspect
  return {
    dx: boxX + (boxWidth - dw) / 2,
    dy: boxY,
    dw,
    dh: boxHeight,
  }
}

type Rgb = { r: number; g: number; b: number }

function parseHexColor(input: string | undefined): Rgb | null {
  if (!input) return null
  const hex = input.trim().replace(/^#/, "")
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return null
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
  }
}

function colorDistance(a: Rgb, b: Rgb): number {
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2)
}

function isProtectedPortraitCorePixel(x: number, y: number, w: number, h: number): boolean {
  const xRatio = x / w
  const yRatio = y / h

  const faceAndNeckCore =
    xRatio > 0.22 &&
    xRatio < 0.78 &&
    yRatio > 0.10 &&
    yRatio < 0.58

  const shirtAndHandsCore =
    xRatio > 0.08 &&
    xRatio < 0.92 &&
    yRatio >= 0.42 &&
    yRatio < 0.99

  return faceAndNeckCore || shirtAndHandsCore
}

function detectDominantEdgeBackground(data: Uint8ClampedArray, w: number, h: number): Rgb | null {
  const samples: Rgb[] = []
  const topBand = Math.max(6, Math.floor(h * 0.08))
  const sideBand = Math.max(6, Math.floor(w * 0.08))
  const step = Math.max(1, Math.floor(Math.max(w, h) / 180))

  const collect = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = y0; y < y1; y += step) {
      for (let x = x0; x < x1; x += step) {
        const p = (y * w + x) * 4
        samples.push({ r: data[p], g: data[p + 1], b: data[p + 2] })
      }
    }
  }

  collect(0, 0, w, topBand)
  collect(0, topBand, sideBand, Math.floor(h * 0.72))
  collect(Math.max(0, w - sideBand), topBand, w, Math.floor(h * 0.72))

  if (samples.length === 0) return null

  const hist = new Map<number, number>()
  for (const p of samples) {
    const bin = ((p.r >> 4) << 8) | ((p.g >> 4) << 4) | (p.b >> 4)
    hist.set(bin, (hist.get(bin) || 0) + 1)
  }

  let topBin = 0
  let topCount = 0
  for (const [bin, count] of hist.entries()) {
    if (count > topCount) {
      topBin = bin
      topCount = count
    }
  }

  if (topCount / samples.length < 0.30) return null

  const min = {
    r: ((topBin >> 8) & 0xf) * 16,
    g: ((topBin >> 4) & 0xf) * 16,
    b: (topBin & 0xf) * 16,
  }
  let r = 0
  let g = 0
  let b = 0
  let n = 0
  for (const p of samples) {
    if (
      p.r >= min.r && p.r < min.r + 16 &&
      p.g >= min.g && p.g < min.g + 16 &&
      p.b >= min.b && p.b < min.b + 16
    ) {
      r += p.r
      g += p.g
      b += p.b
      n++
    }
  }

  return n > 0
    ? { r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n) }
    : { r: min.r + 8, g: min.g + 8, b: min.b + 8 }
}

export function recolorEdgeConnectedPhotoBackground(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  targetHex: string | undefined,
): boolean {
  const target = parseHexColor(targetHex)
  if (!target) return false

  const imageData = ctx.getImageData(0, 0, w, h)
  const data = imageData.data
  const edgeBg = detectDominantEdgeBackground(data, w, h)
  if (!edgeBg || colorDistance(edgeBg, target) < 35) return false

  const tolerance = 54
  const total = w * h
  const visited = new Uint8Array(total)
  const replace = new Uint8Array(total)
  const queue = new Int32Array(total)
  let head = 0
  let tail = 0

  const matchesEdgeBg = (idx: number) => {
    const p = idx * 4
    return colorDistance({ r: data[p], g: data[p + 1], b: data[p + 2] }, edgeBg) <= tolerance
  }

  const trySeed = (idx: number) => {
    if (idx < 0 || idx >= total || visited[idx] || !matchesEdgeBg(idx)) return
    const x = idx % w
    const y = (idx / w) | 0
    if (isProtectedPortraitCorePixel(x, y, w, h)) {
      visited[idx] = 1
      return
    }
    visited[idx] = 1
    replace[idx] = 1
    queue[tail++] = idx
  }

  for (let x = 0; x < w; x++) {
    trySeed(x)
    trySeed((h - 1) * w + x)
  }
  for (let y = 0; y < h; y++) {
    trySeed(y * w)
    trySeed(y * w + (w - 1))
  }

  while (head < tail) {
    const idx = queue[head++]
    const x = idx % w
    const y = (idx / w) | 0
    const neighbours = [
      x > 0 ? idx - 1 : -1,
      x < w - 1 ? idx + 1 : -1,
      y > 0 ? idx - w : -1,
      y < h - 1 ? idx + w : -1,
    ]

    for (const n of neighbours) {
      if (n < 0 || visited[n] || !matchesEdgeBg(n)) continue
      const nx = n % w
      const ny = (n / w) | 0
      visited[n] = 1
      if (isProtectedPortraitCorePixel(nx, ny, w, h)) continue
      replace[n] = 1
      queue[tail++] = n
    }
  }

  let replaced = 0
  for (let idx = 0; idx < total; idx++) {
    if (!replace[idx]) continue
    const p = idx * 4
    data[p] = target.r
    data[p + 1] = target.g
    data[p + 2] = target.b
    data[p + 3] = 255
    replaced++
  }

  if (replaced === 0) return false
  ctx.putImageData(imageData, 0, 0)
  return true
}
