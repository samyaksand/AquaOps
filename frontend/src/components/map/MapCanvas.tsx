import { clsx } from 'clsx'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { WORLD, type Point } from '@/lib/projection'
import { useAppStore } from '@/store/useAppStore'
import { MAX_ZOOM, MIN_ZOOM, useMapStore } from '@/store/useMapStore'

import {
  EDGE_COLORS,
  ICON_SCALE,
  KIND_RADIUS,
  STATE_RING,
  edgeWidth,
  flowWidth,
} from './glyphs'
import { iconFor } from './icons'
import type { MapEntity, MapModel } from './model'

// Reservoirs, plants, and critical facilities are the infrastructure an
// operator orients by, so their labels stay on at every zoom. Demand zones
// and tankers label only on hover/select/zoom-in — at rest their names would
// otherwise compete for space and read as a flowchart rather than a map.
const ALWAYS_LABELED_KINDS = new Set<MapEntity['kind']>([
  'reservoir',
  'plant',
  'facility',
])
const LABEL_ZOOM_THRESHOLD = 1.4

interface MapCanvasProps {
  model: MapModel
  onHoverChange: (entity: MapEntity | null, screen: Point | null) => void
  /** Codes to keep in focus regardless of hover/selection — e.g. a scenario
   * builder's current change targets. Additive to the existing hover/select
   * focus mechanism, not a replacement: when both are present the union of
   * connected codes stays visible. */
  highlightCodes?: Set<string>
}

/** Converts a client point into the SVG's viewBox coordinate system. */
function toViewBox(svg: SVGSVGElement, clientX: number, clientY: number): Point {
  const ctm = svg.getScreenCTM()
  if (!ctm) return { x: 0, y: 0 }
  const point = svg.createSVGPoint()
  point.x = clientX
  point.y = clientY
  const mapped = point.matrixTransform(ctm.inverse())
  return { x: mapped.x, y: mapped.y }
}

export function MapCanvas({
  model,
  onHoverChange,
  highlightCodes,
}: MapCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const offsets = useMapStore((state) => state.offsets)
  const zoom = useMapStore((state) => state.zoom)
  const pan = useMapStore((state) => state.pan)
  const layers = useMapStore((state) => state.layers)
  const hovered = useMapStore((state) => state.hoveredCode)
  const setHovered = useMapStore((state) => state.setHovered)
  const dragBy = useMapStore((state) => state.dragBy)
  const panBy = useMapStore((state) => state.panBy)
  const setZoom = useMapStore((state) => state.setZoom)

  const selected = useAppStore((state) => state.selectedNodeCode)
  const select = useAppStore((state) => state.selectNode)

  const [panning, setPanning] = useState(false)
  // Tracks an in-flight gesture so a drag does not also fire a click.
  const gesture = useRef<{ code: string | null; moved: boolean } | null>(null)

  // Read by the native (non-passive) wheel listener below, which can't close
  // over fresh zoom/pan without re-subscribing on every frame.
  const zoomRef = useRef(zoom)
  const panRef = useRef(pan)
  zoomRef.current = zoom
  panRef.current = pan

  /** Current position of an entity: projected base plus any drag offset. */
  const positionOf = useCallback(
    (entity: MapEntity): Point => {
      const offset = offsets[entity.code]
      return offset
        ? { x: entity.base.x + offset.x, y: entity.base.y + offset.y }
        : entity.base
    },
    [offsets],
  )

  const maxCapacity = useMemo(
    () => Math.max(...model.edges.map((edge) => edge.capacity), 1),
    [model.edges],
  )

  const maxFlow = useMemo(
    () => Math.max(...model.edges.map((edge) => edge.flowM3PerDay), 1),
    [model.edges],
  )

  const visible = useMemo(
    () => model.entities.filter((entity) => layers[entity.layer]),
    [model.entities, layers],
  )

  // The set of node codes directly connected to the hovered/selected node,
  // so the rest of the network can recede rather than compete for attention.
  // An external `highlightCodes` set (e.g. the Scenario Lab's current change
  // targets) is folded in additively: a hover/select focus still narrows to
  // its own connections, but with nothing hovered/selected the scenario's
  // own targets stay in focus instead of the whole network reading flat.
  const focusCode = selected ?? hovered
  const hasExternalHighlight = !!highlightCodes && highlightCodes.size > 0
  const connectedCodes = useMemo(() => {
    if (!focusCode) {
      return hasExternalHighlight ? highlightCodes! : null
    }
    const set = new Set<string>([focusCode])
    for (const edge of model.edges) {
      if (edge.sourceCode === focusCode) set.add(edge.targetCode)
      if (edge.targetCode === focusCode) set.add(edge.sourceCode)
    }
    for (const tether of model.tankerTethers) {
      if (tether.tankerCode === focusCode) set.add(tether.hubCode)
      if (tether.hubCode === focusCode) set.add(tether.tankerCode)
    }
    return set
  }, [focusCode, hasExternalHighlight, highlightCodes, model.edges, model.tankerTethers])

  const handleNodePointerDown = (
    event: React.PointerEvent<SVGGElement>,
    entity: MapEntity,
  ) => {
    event.stopPropagation()
    const svg = svgRef.current
    if (!svg) return
    event.currentTarget.setPointerCapture(event.pointerId)
    gesture.current = { code: entity.code, moved: false }
    let last = toViewBox(svg, event.clientX, event.clientY)

    const move = (moveEvent: PointerEvent) => {
      const next = toViewBox(svg, moveEvent.clientX, moveEvent.clientY)
      // The group is scaled by zoom, so convert viewBox delta to world units.
      const dx = (next.x - last.x) / zoom
      const dy = (next.y - last.y) / zoom
      last = next
      if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) {
        if (gesture.current) gesture.current.moved = true
        dragBy(entity.code, dx, dy)
      }
    }

    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      if (gesture.current && !gesture.current.moved) {
        select(selected === entity.code ? null : entity.code)
      }
      gesture.current = null
    }

    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const handleBackgroundPointerDown = (
    event: React.PointerEvent<SVGSVGElement>,
  ) => {
    const svg = svgRef.current
    if (!svg) return
    setPanning(true)
    let last = toViewBox(svg, event.clientX, event.clientY)
    let moved = false

    const move = (moveEvent: PointerEvent) => {
      const next = toViewBox(svg, moveEvent.clientX, moveEvent.clientY)
      const dx = next.x - last.x
      const dy = next.y - last.y
      last = next
      if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) moved = true
      panBy(dx, dy)
    }

    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      setPanning(false)
      // A click on empty canvas clears the selection.
      if (!moved) select(null)
    }

    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  // React's onWheel attaches a passive listener, so calling preventDefault()
  // inside it throws "Unable to preventDefault inside passive event listener
  // invocation" on every scroll — a real console error, not just noise.
  // Attaching the listener natively with { passive: false } is the only way
  // to actually suppress page-scroll while zooming the map.
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return

    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const factor = Math.exp(-event.deltaY * 0.0015)
      const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoomRef.current * factor))
      if (next === zoomRef.current) return

      const cursor = toViewBox(svg, event.clientX, event.clientY)
      const scale = next / zoomRef.current
      setZoom(next, {
        x: cursor.x - (cursor.x - panRef.current.x) * scale,
        y: cursor.y - (cursor.y - panRef.current.y) * scale,
      })
    }

    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => svg.removeEventListener('wheel', onWheel)
    // zoom/pan are read via refs inside the handler so this effect never
    // needs to re-subscribe on every zoom/pan change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setZoom])

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${WORLD.width} ${WORLD.height}`}
      preserveAspectRatio="xMidYMid meet"
      className={clsx(
        'size-full touch-none select-none',
        panning ? 'cursor-grabbing' : 'cursor-grab',
      )}
      onPointerDown={handleBackgroundPointerDown}
      role="img"
      aria-label="Rivertown water network map"
    >
      <defs>
        <pattern
          id="map-grid"
          width="48"
          height="48"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M 48 0 L 0 0 0 48"
            fill="none"
            stroke="var(--color-hairline)"
            strokeWidth="1"
          />
        </pattern>
        <radialGradient id="map-vignette" cx="50%" cy="50%" r="72%">
          <stop offset="50%" stopColor="white" stopOpacity="1" />
          <stop offset="100%" stopColor="white" stopOpacity="0" />
        </radialGradient>
        <mask id="map-grid-mask">
          <rect
            width={WORLD.width}
            height={WORLD.height}
            fill="url(#map-vignette)"
          />
        </mask>
      </defs>

      <rect
        width={WORLD.width}
        height={WORLD.height}
        fill="url(#map-grid)"
        mask="url(#map-grid-mask)"
        opacity="0.35"
      />

      <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
        {layers.pipelines ? (
          <g>
            {model.edges.map((edge) => {
              const source = model.byCode[edge.sourceCode]
              const target = model.byCode[edge.targetCode]
              if (!source || !target) return null
              if (!layers[source.layer] || !layers[target.layer]) return null

              const a = positionOf(source)
              const b = positionOf(target)
              const touchesFocus =
                connectedCodes !== null &&
                (focusCode
                  ? (connectedCodes.has(edge.sourceCode) ||
                      connectedCodes.has(edge.targetCode)) &&
                    (edge.sourceCode === focusCode || edge.targetCode === focusCode)
                  : connectedCodes.has(edge.sourceCode) ||
                    connectedCodes.has(edge.targetCode))
              const dimmedByFocus = connectedCodes !== null && !touchesFocus

              const hasFlow = model.hasAllocation && edge.flowM3PerDay > 0
              const path = curvedPath(a, b)

              return (
                <g key={edge.code}>
                  <path
                    d={path}
                    fill="none"
                    stroke={EDGE_COLORS[edge.state]}
                    strokeWidth={edgeWidth(edge.capacity, maxCapacity)}
                    strokeLinecap="round"
                    strokeDasharray={
                      edge.state === 'unavailable' ? '7 6' : undefined
                    }
                    className="transition-opacity duration-200"
                    opacity={
                      edge.state === 'unavailable'
                        ? 0.5
                        : dimmedByFocus
                          ? 0.1
                          : model.hasAllocation
                            ? hasFlow
                              ? 0.35
                              : 0.16
                            : touchesFocus
                              ? 1
                              : 0.55
                    }
                  />
                  {touchesFocus ? (
                    <path
                      d={path}
                      fill="none"
                      stroke="var(--color-aqua-300)"
                      strokeWidth={edgeWidth(edge.capacity, maxCapacity) + 3}
                      strokeLinecap="round"
                      opacity="0.16"
                    />
                  ) : null}
                  {hasFlow ? (
                    <path
                      d={path}
                      fill="none"
                      stroke="var(--color-aqua-400)"
                      strokeWidth={flowWidth(edge.flowM3PerDay, maxFlow)}
                      strokeLinecap="round"
                      strokeDasharray="6 7"
                      className="map-flow-line transition-opacity duration-200"
                      opacity={dimmedByFocus ? 0.12 : touchesFocus ? 1 : 0.85}
                    />
                  ) : null}
                </g>
              )
            })}
          </g>
        ) : null}

        {layers.tankers
          ? model.tankerTethers.map((tether) => {
              const tanker = model.byCode[tether.tankerCode]
              const hub = model.byCode[tether.hubCode]
              if (!tanker || !hub || !layers[hub.layer]) return null
              const a = positionOf(tanker)
              const b = positionOf(hub)
              return (
                <line
                  key={tether.tankerCode}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke="var(--color-status-warn)"
                  strokeWidth="1"
                  strokeDasharray="2 4"
                  strokeLinecap="round"
                  opacity={
                    connectedCodes && !connectedCodes.has(tether.tankerCode)
                      ? 0.08
                      : 0.3
                  }
                  className="transition-opacity duration-200"
                />
              )
            })
          : null}

        {visible.map((entity) => {
          const position = positionOf(entity)
          const isHovered = hovered === entity.code
          const isSelected = selected === entity.code
          const isFocused = connectedCodes?.has(entity.code) ?? true
          const radius = KIND_RADIUS[entity.kind]
          const offline = entity.state === 'unavailable'
          const Icon = iconFor(entity.kind, entity.category)

          const unmet = entity.allocation && !entity.allocation.fullySupplied
          const ringColor = unmet
            ? 'var(--color-status-critical)'
            : entity.state !== 'online'
              ? STATE_RING[entity.state]
              : 'var(--color-divider)'

          return (
            <g
              key={entity.code}
              transform={`translate(${position.x} ${position.y})`}
              className="cursor-pointer transition-opacity duration-200"
              opacity={connectedCodes && !isFocused ? 0.25 : 1}
              onPointerDown={(event) => handleNodePointerDown(event, entity)}
              onPointerEnter={(event) => {
                setHovered(entity.code)
                onHoverChange(entity, {
                  x: event.clientX,
                  y: event.clientY,
                })
              }}
              onPointerMove={(event) => {
                if (gesture.current) return
                onHoverChange(entity, {
                  x: event.clientX,
                  y: event.clientY,
                })
              }}
              onPointerLeave={() => {
                setHovered(null)
                onHoverChange(null, null)
              }}
            >
              {isSelected ? (
                <circle
                  r={radius + 10}
                  fill="none"
                  stroke="var(--color-aqua-300)"
                  strokeWidth="2"
                  opacity="0.9"
                />
              ) : null}
              {isHovered && !isSelected ? (
                <circle r={radius + 7} fill="var(--color-aqua-400)" opacity="0.1" />
              ) : null}

              <circle
                r={radius}
                fill="var(--color-surface)"
                stroke={ringColor}
                strokeWidth={unmet ? 2.5 : 1.75}
                opacity={offline ? 0.5 : 1}
              />

              <g
                transform={`translate(${-radius * ICON_SCALE * 0.5} ${-radius * ICON_SCALE * 0.5})`}
                opacity={offline ? 0.45 : 0.92}
              >
                <Icon
                  width={radius * ICON_SCALE}
                  height={radius * ICON_SCALE}
                  stroke="var(--color-ink)"
                  strokeWidth={1.75}
                  absoluteStrokeWidth
                />
              </g>

              {entity.state !== 'online' ? (
                <circle
                  cx={radius * 0.74}
                  cy={-radius * 0.74}
                  r="4.5"
                  fill={STATE_RING[entity.state]}
                  stroke="var(--color-surface)"
                  strokeWidth="2"
                />
              ) : null}

              {layers.labels &&
              (isSelected ||
                isHovered ||
                ALWAYS_LABELED_KINDS.has(entity.kind) ||
                zoom >= LABEL_ZOOM_THRESHOLD) ? (
                <text
                  y={radius + 18}
                  textAnchor="middle"
                  className="pointer-events-none"
                  fontSize="12"
                  fontWeight={isSelected || isHovered ? 600 : 500}
                  fill={
                    isSelected || isHovered
                      ? 'var(--color-ink)'
                      : 'var(--color-ink-muted)'
                  }
                  paintOrder="stroke"
                  stroke="var(--color-abyss)"
                  strokeWidth="5"
                  strokeLinejoin="round"
                >
                  {entity.name}
                </text>
              ) : null}
            </g>
          )
        })}
      </g>
    </svg>
  )
}

/** A gentle quadratic curve between two points, so pipelines crossing near
 * the center read as distinct arcs rather than a knot of overlapping
 * straight lines. The bow is perpendicular to the segment and scales with
 * its length, so short local links stay nearly straight. */
function curvedPath(a: Point, b: Point): string {
  const mx = (a.x + b.x) / 2
  const my = (a.y + b.y) / 2
  const dx = b.x - a.x
  const dy = b.y - a.y
  const length = Math.hypot(dx, dy) || 1
  const bow = Math.min(length * 0.08, 18)
  const nx = -dy / length
  const ny = dx / length
  const cx = mx + nx * bow
  const cy = my + ny * bow
  return `M ${a.x} ${a.y} Q ${cx} ${cy} ${b.x} ${b.y}`
}
