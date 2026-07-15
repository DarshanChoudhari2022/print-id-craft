import { describe, expect, it } from "vitest"
import { getCoverPhotoPlacement } from "@/lib/card-photo-placement"

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
