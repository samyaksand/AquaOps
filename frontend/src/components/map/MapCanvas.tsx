import { clsx } from 'clsx'
import { useCallback, useMemo, useRef, useState } from 'react'

import { WORLD, type Point } from '@/lib/projection'
import { useAppStore } from '@/store/useAppStore'
import { MAX_ZOOM, MIN_ZOOM, useMapStore } from '@/store/useMapStore'

import { EDGE_COLORS, KIND_COLORS, KIND_RADIUS, STATE_RING, edgeWidth, glyphPath } from './glyphs'
import type { MapEntity, MapModel } from './model'

interface MapCanvasProps {
  model: MapModel
  onHoverChange: (entity: MapEntity | null, screen: Point | null) => void
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

export function MapCanvas({ model, onHoverChange }: MapCanvasProps) {
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

  const visible = useMemo(
    () => model.entities.filter((entity) => layers[entity.layer]),
    [model.entities, layers],
  )

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

  const handleWheel = (event: React.WheelEvent<SVGSVGElement>) => {
    const svg = svgRef.current
    if (!svg) return
    event.preventDefault()
    const factor = Math.exp(-event.deltaY * 0.0015)
    const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * factor))
    if (next === zoom) return

    // Keep the point under the cursor fixed while zooming.
    const cursor = toViewBox(svg, event.clientX, event.clientY)
    const scale = next / zoom
    setZoom(next, {
      x: cursor.x - (cursor.x - pan.x) * scale,
      y: cursor.y - (cursor.y - pan.y) * scale,
    })
  }

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
      onWheel={handleWheel}
      role="img"
      aria-label="Rivertown water network map"
    >
      <defs>
        <pattern
          id="map-grid"
          width="40"
          height="40"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M 40 0 L 0 0 0 40"
            fill="none"
            stroke="var(--color-hairline)"
            strokeWidth="1"
          />
        </pattern>
        <radialGradient id="map-vignette" cx="50%" cy="50%" r="70%">
          <stop offset="55%" stopColor="white" stopOpacity="1" />
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
        opacity="0.5"
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
              const active =
                hovered === edge.sourceCode ||
                hovered === edge.targetCode ||
                selected === edge.sourceCode ||
                selected === edge.targetCode

              return (
                <g key={edge.code}>
                  <line
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    stroke={EDGE_COLORS[edge.state]}
                    strokeWidth={edgeWidth(edge.capacity, maxCapacity)}
                    strokeLinecap="round"
                    strokeDasharray={
                      edge.state === 'unavailable' ? '7 6' : undefined
                    }
                    opacity={
                      edge.state === 'unavailable'
                        ? 0.55
                        : active
                          ? 1
                          : 0.5
                    }
                  />
                  {active ? (
                    <line
                      x1={a.x}
                      y1={a.y}
                      x2={b.x}
                      y2={b.y}
                      stroke="var(--color-aqua-300)"
                      strokeWidth={edgeWidth(edge.capacity, maxCapacity) + 3}
                      strokeLinecap="round"
                      opacity="0.14"
                    />
                  ) : null}
                </g>
              )
            })}
          </g>
        ) : null}

        {visible.map((entity) => {
          const position = positionOf(entity)
          const isHovered = hovered === entity.code
          const isSelected = selected === entity.code
          const radius = KIND_RADIUS[entity.kind]
          const offline = entity.state === 'unavailable'

          return (
            <g
              key={entity.code}
              transform={`translate(${position.x} ${position.y})`}
              className="cursor-pointer"
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
                  r={radius + 9}
                  fill="none"
                  stroke="var(--color-aqua-400)"
                  strokeWidth="1.5"
                  strokeDasharray="3 4"
                  opacity="0.9"
                />
              ) : null}
              {isHovered && !isSelected ? (
                <circle
                  r={radius + 7}
                  fill={KIND_COLORS[entity.kind]}
                  opacity="0.12"
                />
              ) : null}

              <path
                d={glyphPath(entity.kind, radius)}
                fill="var(--color-surface)"
                stroke={KIND_COLORS[entity.kind]}
                strokeWidth="2"
                opacity={offline ? 0.45 : 1}
              />
              <path
                d={glyphPath(entity.kind, radius * 0.52)}
                fill={KIND_COLORS[entity.kind]}
                opacity={offline ? 0.35 : 0.85}
              />

              {entity.state !== 'online' ? (
                <circle
                  cx={radius * 0.78}
                  cy={-radius * 0.78}
                  r="4"
                  fill={STATE_RING[entity.state]}
                  stroke="var(--color-surface)"
                  strokeWidth="1.5"
                />
              ) : null}

              {layers.labels ? (
                <text
                  y={radius + 15}
                  textAnchor="middle"
                  className="pointer-events-none"
                  fontSize="11"
                  fontWeight={isSelected || isHovered ? 600 : 500}
                  fill={
                    isSelected || isHovered
                      ? 'var(--color-ink)'
                      : 'var(--color-ink-subtle)'
                  }
                  paintOrder="stroke"
                  stroke="var(--color-abyss)"
                  strokeWidth="3.5"
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
