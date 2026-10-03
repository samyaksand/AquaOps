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

  const result: Record<string, Point> = {}
  for (const item of planar) {
    result[item.code] = {
      x: offsetX + (item.x - minX) * scale,
      // Invert y so north renders upward.
      y: offsetY + (maxY - item.y) * scale,
    }
  }
  return result
}
