import { describe, it, expect } from "vitest"
import sharp from "sharp"
import { isBlackBoxCorruptedPhoto } from "@/lib/photo-corruption-detector"

describe("isBlackBoxCorruptedPhoto", () => {
  it("returns false for a normal image without black box", async () => {
    const sampleBuffer = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 3,
        background: { r: 240, g: 240, b: 240 },
      },
    })
      .jpeg()
      .toBuffer()

    const isCorrupted = await isBlackBoxCorruptedPhoto(sampleBuffer)
    expect(isCorrupted).toBe(false)
  })

  it("returns true for an image with a solid black block on lower half", async () => {
    // Generate a 100x100 canvas with top 40 white and bottom 60 black using raw RGBA pixels
    const width = 100
    const height = 100
    const rawPixels = Buffer.alloc(width * height * 3)

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 3
        if (y < 35) {
          rawPixels[idx] = 255     // R
          rawPixels[idx + 1] = 255 // G
          rawPixels[idx + 2] = 255 // B
        } else {
          rawPixels[idx] = 0       // R
          rawPixels[idx + 1] = 0   // G
          rawPixels[idx + 2] = 0   // B
        }
      }
    }

    const compositeBuffer = await sharp(rawPixels, {
      raw: { width, height, channels: 3 },
    })
      .jpeg()
      .toBuffer()

    const isCorrupted = await isBlackBoxCorruptedPhoto(compositeBuffer)
    expect(isCorrupted).toBe(true)
  })
})
