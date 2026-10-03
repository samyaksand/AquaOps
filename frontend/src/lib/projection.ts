/**
 * Projects WGS84 coordinates into the map's fixed world box.
 *
 * Rivertown spans a fraction of a degree, so a plate-carrée projection with a
 * single cosine correction for longitude is accurate at this scale and keeps
 * the transform invertible — which matters because dragging has to convert
 * screen deltas back into world units.
 */

import type { Position } from '@/types/network'

export const WORLD = { width: 1000, height: 720 } as const
const PADDING = 72

export interface Point {
  x: number
  y: number
}

const DEG_TO_RAD = Math.PI / 180

export function projectAll(
  positions: Record<string, Position>,
): Record<string, Point> {
  const entries = Object.entries(positions)
  if (entries.length === 0) return {}

  const meanLat =
    entries.reduce((sum, [, p]) => sum + p.latitude, 0) / entries.length
  const lonScale = Math.cos(meanLat * DEG_TO_RAD)

  // Flatten to planar units first: x east, y north.
  const planar = entries.map(([code, p]) => ({
    code,
    x: p.longitude * lonScale,
    y: p.latitude,
  }))

  const xs = planar.map((item) => item.x)
  const ys = planar.map((item) => item.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)

  const spanX = maxX - minX || 1
  const spanY = maxY - minY || 1

  const usableW = WORLD.width - PADDING * 2
  const usableH = WORLD.height - PADDING * 2
  // One scale for both axes, so the network is never visually distorted.
  const scale = Math.min(usableW / spanX, usableH / spanY)

  const offsetX = (WORLD.width - spanX * scale) / 2
  const offsetY = (WORLD.height - spanY * scale) / 2

  const projected: Record<string, Point> = {}
  for (const item of planar) {
    projected[item.code] = {
      x: offsetX + (item.x - minX) * scale,
      // Invert y so north renders upward.
      y: offsetY + (maxY - item.y) * scale,
    }
  }
  return spreadFromCenter(projected)
}

/**
 * Rivertown's real-world nodes cluster tightly downtown while reservoirs sit
 * far out, so a plain linear projection crowds most entities into a small
 * patch of the world box. This pushes every point away from the projected
 * centroid by its distance raised to a sub-linear power: near points move
 * apart a lot, already-far points barely move. The result is deterministic
 * (a pure function of the input positions) and preserves relative bearing
 * and ordering, so pipelines stay attached to the same nodes they always
 * were — only the drawn spacing changes.
 */
function spreadFromCenter(points: Record<string, Point>): Record<string, Point> {
  const entries = Object.entries(points)
  if (entries.length === 0) return points

  const cx = entries.reduce((sum, [, p]) => sum + p.x, 0) / entries.length
  const cy = entries.reduce((sum, [, p]) => sum + p.y, 0) / entries.length

  const SPREAD_EXPONENT = 0.62
  const withDistance = entries.map(([code, p]) => {
    const dx = p.x - cx
    const dy = p.y - cy
    const distance = Math.hypot(dx, dy)
    return { code, p, dx, dy, distance }
  })

  const maxDistance = Math.max(...withDistance.map((item) => item.distance), 1)

  const spread: Record<string, Point> = {}
  for (const { code, p, dx, dy, distance } of withDistance) {
    if (distance === 0) {
      spread[code] = p
      continue
    }
    const normalized = distance / maxDistance
    const grown = Math.pow(normalized, SPREAD_EXPONENT) * maxDistance
    const factor = grown / distance
    spread[code] = { x: cx + dx * factor, y: cy + dy * factor }
  }

  return fitToBounds(spread)
}

/** Rescales a point set to fill the padded world box after spreading. */
function fitToBounds(points: Record<string, Point>): Record<string, Point> {
  const entries = Object.entries(points)
  const xs = entries.map(([, p]) => p.x)
  const ys = entries.map(([, p]) => p.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)

  const spanX = maxX - minX || 1
  const spanY = maxY - minY || 1
  const usableW = WORLD.width - PADDING * 2
  const usableH = WORLD.height - PADDING * 2
  const scale = Math.min(usableW / spanX, usableH / spanY)

  const offsetX = (WORLD.width - spanX * scale) / 2
  const offsetY = (WORLD.height - spanY * scale) / 2

  const result: Record<string, Point> = {}
  for (const [code, p] of entries) {
    result[code] = {
      x: offsetX + (p.x - minX) * scale,
      y: offsetY + (p.y - minY) * scale,
    }
  }
  return result
}
