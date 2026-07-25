import { describe, expect, it } from "vitest"
import {
  getCoverPhotoPlacement,
  recolorEdgeConnectedPhotoBackground,
} from "@/lib/card-photo-placement"

describe("getCoverPhotoPlacement", () => {
  it("fills a wider box with a tall photo and aligns overflow to the top", () => {
    expect(getCoverPhotoPlacement(300, 600, 10, 20, 200, 200)).toEqual({
      dx: 10,
      dy: 20,
      dw: 200,
      dh: 400,
    })
  })

  it("fills a tall box with a wide photo and centers horizontal overflow", () => {
    expect(getCoverPhotoPlacement(600, 300, 10, 20, 100, 200)).toEqual({
      dx: -140,
      dy: 20,
      dw: 400,
      dh: 200,
    })
  })

  it("matches the mapped rectangle when aspect ratios are equal", () => {
    expect(getCoverPhotoPlacement(400, 200, 10, 20, 200, 100)).toEqual({
      dx: 10,
      dy: 20,
      dw: 200,
      dh: 100,
    })
  })
})

describe("recolorEdgeConnectedPhotoBackground", () => {
  it("turns edge-connected plain photo background red while preserving portrait core", () => {
    const width = 10
    const height = 10
    const bytes = new Uint8ClampedArray(width * height * 4)
    for (let i = 0; i < bytes.length; i += 4) {
      bytes[i] = 255
      bytes[i + 1] = 255
      bytes[i + 2] = 255
      bytes[i + 3] = 255
    }
    for (let y = 5; y < 9; y++) {
      for (let x = 4; x < 6; x++) {
        const i = (y * width + x) * 4
        bytes[i] = 248
        bytes[i + 1] = 248
        bytes[i + 2] = 248
      }
    }
    const ctx = {
      getImageData: () => ({ data: bytes, width, height }),
      putImageData: (next: { data: Uint8ClampedArray }) => {
        bytes.set(next.data)
      },
    } as unknown as CanvasRenderingContext2D

    const changed = recolorEdgeConnectedPhotoBackground(ctx, width, height, "#FF0000")
    expect(changed).toBe(true)

    const pixel = (x: number, y: number) => {
      const i = (y * width + x) * 4
      return [bytes[i], bytes[i + 1], bytes[i + 2]]
    }

    expect(pixel(0, 0)).toEqual([255, 0, 0])
    expect(pixel(5, 6)).toEqual([248, 248, 248])
  })
})
