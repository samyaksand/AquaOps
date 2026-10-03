/**
 * Projects WGS84 coordinates into the map's fixed world box.
 *
 * Rivertown spans a fraction of a degree, so a plate-carrée projection with a
 * single cosine correction for longitude is accurate at this scale and keeps
 * the transform invertible — which matters because dragging has to convert
 * screen deltas back into world units.
 */

import type { Position } from '@/types/network'

// Wider than tall to match a widescreen canvas — a 1200x840 (≈1.43:1) box
// let `preserveAspectRatio="xMidYMid meet"` letterbox heavily on a ~1.7:1+
// container, wasting horizontal space before layout even runs.
export const WORLD = { width: 1600, height: 900 } as const
const PADDING = 90

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
  const scaleX = usableW / spanX
  const scaleY = usableH / spanY

  const projected: Record<string, Point> = {}
  for (const item of planar) {
    projected[item.code] = {
      x: PADDING + (item.x - minX) * scaleX,
      // Invert y so north renders upward.
      y: PADDING + (maxY - item.y) * scaleY,
    }
  }
  return relax(spreadFromCenter(projected))
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

  // Lower exponent = more aggressive spread (near points move apart more
  // relative to already-far ones). 0.62 still left most of Rivertown's
  // downtown cluster bunched near the centroid in a larger world box; 0.48
  // spreads it enough to use the box without distorting the outer ring.
  const SPREAD_EXPONENT = 0.48
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

/**
 * Local de-overlap pass: the centroid-based spread above preserves each
 * point's bearing and *relative* clustering, so entities that are tightly
 * clustered in real coordinates (e.g. several demand points downtown) are
 * still crowded after it runs — they moved together, not apart. This pushes
 * any pair closer than `MIN_SEPARATION` directly apart along the line
 * between them, repeated over a few passes so local jostling settles. Pure
 * and deterministic: iteration order is fixed (sorted by code) and the pass
 * count is fixed, so the same input always settles to the same layout.
 */
function relax(points: Record<string, Point>): Record<string, Point> {
  const MIN_SEPARATION = 190
  const PASSES = 80
  const codes = Object.keys(points).sort()
  const current: Record<string, Point> = {}
  for (const code of codes) current[code] = { ...points[code] }

  for (let pass = 0; pass < PASSES; pass += 1) {
    let moved = false
    for (let i = 0; i < codes.length; i += 1) {
      for (let j = i + 1; j < codes.length; j += 1) {
        const a = current[codes[i]]
        const b = current[codes[j]]
        const dx = b.x - a.x
        const dy = b.y - a.y
        const distance = Math.hypot(dx, dy)
        if (distance >= MIN_SEPARATION) continue
        moved = true
        // Coincident points: nudge deterministically by index rather than
        // dividing by zero.
        const angle = distance > 0 ? Math.atan2(dy, dx) : (i - j) * 0.7
        const push = (MIN_SEPARATION - distance) / 2 + 0.5
        const ux = Math.cos(angle)
        const uy = Math.sin(angle)
        a.x -= ux * push
        a.y -= uy * push
        b.x += ux * push
        b.y += uy * push
      }
    }
    if (!moved) break
  }

  return fitToBounds(current)
}

/**
 * Rescales a point set to fill the padded world box after spreading.
 *
 * Rivertown's real coordinates are a tall, narrow cloud (lat span well
 * exceeds lon span), and that shape survives the isotropic spread/relax
 * passes above. A single uniform scale (the geographically "undistorted"
 * choice) would then stay bound by the box's shorter dimension and leave the
 * other half-empty — exactly the excess-margin problem this redesign exists
 * to fix. Readability over geographic fidelity is the explicit priority
 * here, so x and y are stretched independently to claim the full box.
 */
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
  const scaleX = usableW / spanX
  const scaleY = usableH / spanY

  const result: Record<string, Point> = {}
  for (const [code, p] of entries) {
    result[code] = {
      x: PADDING + (p.x - minX) * scaleX,
      y: PADDING + (p.y - minY) * scaleY,
    }
  }
  return result
}
