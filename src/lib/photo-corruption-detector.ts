/**
 * Inspect an image buffer to detect if it contains a large black box / blackout block.
 *
 * This detects:
 * 1. AI safety censoring blocks (where Google Gemini or generative model overlays a black rectangle on human face/body).
 * 2. Truncated JPEG streams (where lower scan lines are padded with solid black bytes).
 *
 * @param imageBuffer - JPEG or PNG image buffer
 * @returns true if >40% of the lower 65% region consists of solid black pixels
 */
export async function isBlackBoxCorruptedPhoto(imageBuffer: Buffer): Promise<boolean> {
  if (!imageBuffer || imageBuffer.length < 100) return false

  try {
    const sharp = (await import("sharp")).default
    const image = sharp(imageBuffer)
    const metadata = await image.metadata()
    const width = metadata.width || 0
    const height = metadata.height || 0

    if (width === 0 || height === 0) return false

    // Sample raw RGB pixel data downscaled for fast analysis
    const sampleWidth = 120
    const sampleHeight = Math.round((height / width) * sampleWidth) || 160

    const { data } = await image
      .resize(sampleWidth, sampleHeight, { fit: "fill" })
      .toFormat("raw")
      .toBuffer({ resolveWithObject: true })

    const channels = 3
    const startRow = Math.floor(sampleHeight * 0.35) // Inspect lower 65% of image
    const totalSampledPixels = (sampleHeight - startRow) * sampleWidth

    let blackPixelCount = 0

    for (let y = startRow; y < sampleHeight; y++) {
      for (let x = 0; x < sampleWidth; x++) {
        const index = (y * sampleWidth + x) * channels
        const r = data[index]
        const g = data[index + 1]
        const b = data[index + 2]

        // Pure black or near-black pixel (censor box / zero padded stream)
        if (r <= 18 && g <= 18 && b <= 18) {
          blackPixelCount++
        }
      }
    }

    const blackRatio = blackPixelCount / totalSampledPixels
    return blackRatio >= 0.42
  } catch (err) {
    console.error("[isBlackBoxCorruptedPhoto] Error analyzing image buffer:", err)
    return false
  }
}
