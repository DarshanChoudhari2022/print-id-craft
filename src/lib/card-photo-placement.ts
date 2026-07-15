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
