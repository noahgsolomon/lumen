import {
  forceCenter,
  forceLink,
  forceManyBody,
  forceSimulation,
  SimulationLinkDatum,
  SimulationNodeDatum,
} from "d3-force"
import { select } from "d3-selection"
import { zoom, zoomIdentity } from "d3-zoom"
import React from "react"

type Position = { x: number; y: number }

type WithPosition<T> = Omit<T, keyof Position> & Position

type Direction = "n" | "s" | "e" | "w"

export type Node = SimulationNodeDatum & { id: string }

export type Link = SimulationLinkDatum<Node>

export type DrawNodeOptions = {
  node: WithPosition<Node>
  canvas: HTMLCanvasElement
  context: CanvasRenderingContext2D
  cssVar: (name: string) => string
}

export type DrawLinkOptions = {
  link: Omit<Link, "source" | "target"> & { source: WithPosition<Node>; target: WithPosition<Node> }
  canvas: HTMLCanvasElement
  context: CanvasRenderingContext2D
  cssVar: (name: string) => string
}

export type NetworkGraphProps = {
  width: number
  height: number
  nodes: Node[]
  links: Link[]
  drawNode: (options: DrawNodeOptions) => void
  drawLink: (options: DrawLinkOptions) => void
  targetRadius?: number
  selectedId?: string
  onSelect?: (nodeId: string) => void
}

// TODO: Disable animation for motion-sensitive users
// TODO: Drag nodes
export function NetworkGraph({
  width,
  height,
  nodes,
  links,
  drawNode,
  drawLink,
  targetRadius = 16,
  selectedId = "",
  onSelect,
}: NetworkGraphProps) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null)
  const simulationNodes = React.useRef<Node[]>([])
  const simulationLinks = React.useRef<Link[]>([])
  const pixelRatio = window.devicePixelRatio ?? 1
  const widthRef = React.useRef(width)
  const heightRef = React.useRef(height)
  const transformRef = React.useRef(zoomIdentity)
  const drawNodeRef = React.useRef(drawNode)
  const drawLinkRef = React.useRef(drawLink)
  const selectedIdRef = React.useRef(selectedId)
  const onSelectRef = React.useRef(onSelect)
  const [prevSelectedNode, setPrevSelectedNode] = React.useState<Node | undefined>()

  // Update callback refs
  React.useEffect(() => {
    drawNodeRef.current = drawNode
    drawLinkRef.current = drawLink
    selectedIdRef.current = selectedId
    onSelectRef.current = onSelect
  })

  if (selectedId && selectedId !== prevSelectedNode?.id) {
    const selectedNode = simulationNodes.current.find((node) => node.id === selectedId)
    setPrevSelectedNode(selectedNode)
  }

  const drawToCanvas = React.useCallback(() => {
    if (!canvasRef.current) return

    const context = canvasRef.current.getContext("2d")
    if (!context) return

    // Get document style declaration to access CSS variables
    const documentStyle = window.getComputedStyle(document.documentElement)

    /** Returns the computed value of a CSS custom property (variable) */
    function cssVar(name: string) {
      return documentStyle.getPropertyValue(name)
    }

    // Improve rendering on high-resolution displays
    // https://stackoverflow.com/questions/41763580/svg-rendered-into-canvas-blurred-on-retina-display
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)

    // Clear the canvas
    context.clearRect(0, 0, widthRef.current, heightRef.current)

    // Draw the links
    for (const link of simulationLinks.current) {
      if (
        typeof link.source !== "object" ||
        typeof link.target !== "object" ||
        typeof link.source.x === "undefined" ||
        typeof link.source.y === "undefined" ||
        typeof link.target.x === "undefined" ||
        typeof link.target.y === "undefined"
      ) {
        continue
      }

      const [sourceX, sourceY] = transformRef.current.apply([link.source.x, link.source.y])

      const [targetX, targetY] = transformRef.current.apply([link.target.x, link.target.y])

      drawLinkRef.current({
        link: {
          ...link,
          source: { ...link.source, x: sourceX, y: sourceY },
          target: { ...link.target, x: targetX, y: targetY },
        },
        canvas: canvasRef.current,
        context,
        cssVar,
      })
    }

    function drawNode(node: Node) {
      if (!canvasRef.current || !context || !node.x || !node.y) return

      const [x, y] = transformRef.current.apply([node.x, node.y])

      drawNodeRef.current({
        node: { ...node, x, y },
        canvas: canvasRef.current,
        context,
        cssVar,
      })
    }

    let selectedNode: Node | undefined

    // Draw the nodes
    for (const node of simulationNodes.current) {
      if (node.id === selectedIdRef.current) {
        selectedNode = node
        continue
      }

      drawNode(node)
    }

    // Draw the selected node last so it's on top
    if (selectedNode) {
      drawNode(selectedNode)
    }
  }, [pixelRatio])

  // Initialize the force simulation
  const simulation = React.useMemo(() => {
    return forceSimulation<Node>()
      .force("charge", forceManyBody().strength(-10))
      .force("center", forceCenter(window.innerWidth / 2, window.innerHeight / 2))
      .on("tick", drawToCanvas)
  }, [drawToCanvas])

  // Restart the force simulation when the nodes or links change
  React.useEffect(() => {
    simulationNodes.current = nodes.map((node) => {
      const cachedNode = simulationNodes.current.find((cachedNode) => cachedNode.id === node.id)

      // Preserve the position of the node if it exists
      return { ...node, x: cachedNode?.x, y: cachedNode?.y }
    })

    simulationLinks.current = links.map((link) => ({ ...link }))

    simulation
      .nodes(simulationNodes.current)
      .force(
        "link",
        forceLink<Node, Link>(simulationLinks.current).id((d) => d.id),
      )
      .alpha(1)
      .restart()
  }, [nodes, links, simulation])

  // Zoom and pan
  React.useEffect(() => {
    if (!canvasRef.current) return

    select<HTMLCanvasElement, Node>(canvasRef.current).call(
      zoom<HTMLCanvasElement, Node>()
        .scaleExtent([0.1, 10])
        .on("zoom", ({ transform }) => {
          transformRef.current = transform
          requestAnimationFrame(() => drawToCanvas())
        }),
    )
  }, [drawToCanvas])

  // Redraw the canvas when the container is resized
  React.useEffect(() => {
    widthRef.current = width
    heightRef.current = height
    requestAnimationFrame(() => drawToCanvas())
  }, [width, height, drawToCanvas])

  // Redraw the canvas when the user's color scheme preference changes
  React.useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)")

    function handleChange() {
      requestAnimationFrame(() => drawToCanvas())
    }

    mediaQuery.addEventListener("change", handleChange)
    return () => mediaQuery.removeEventListener("change", handleChange)
  }, [drawToCanvas])

  // Handle clicks
  React.useEffect(() => {
    const canvas = canvasRef.current

    function handleClick(event: MouseEvent) {
      const canvasRect = canvas?.getBoundingClientRect()

      if (!canvasRect) return

      // Get the coordinates of the click relative to the canvas
      const [x, y] = transformRef.current.invert([
        event.clientX - canvasRect.left,
        event.clientY - canvasRect.top,
      ])

      // Find the node that was clicked
      const node = simulationNodes.current.find((node) => {
        if (!node.x || !node.y) return false

        const dx = node.x - x
        const dy = node.y - y
        return Math.sqrt(dx * dx + dy * dy) < targetRadius / transformRef.current.k
      })

      onSelectRef.current?.(node?.id || "")
      requestAnimationFrame(() => drawToCanvas())
    }

    canvas?.addEventListener("click", handleClick)
    return () => canvas?.removeEventListener("click", handleClick)
  }, [targetRadius, drawToCanvas])

  return (
    <canvas
      ref={canvasRef}
      width={width * pixelRatio}
      height={height * pixelRatio}
      style={{ width, height }}
      className="focus:outline-none"
      tabIndex={0}
      // Redraw the canvas when the focus changes
      onFocus={() => requestAnimationFrame(() => drawToCanvas())}
      onBlur={() => requestAnimationFrame(() => drawToCanvas())}
      onKeyDown={(event) => {
        // Unselect with `escape`
        if (event.key === "Escape") {
          onSelectRef.current?.("")
          requestAnimationFrame(() => drawToCanvas())
          event.preventDefault()
        }

        // Select a node with `tab` if no node is selected
        if (event.key === "Tab" && !event.shiftKey && !selectedId) {
          onSelectRef.current?.(prevSelectedNode?.id || simulationNodes.current[0].id)
          requestAnimationFrame(() => drawToCanvas())
          event.preventDefault()
        }

        const keyToDirection: Record<string, Direction> = {
          ArrowUp: "n",
          ArrowDown: "s",
          ArrowRight: "e",
          ArrowLeft: "w",
        }

        // Move selection with arrow keys
        if (event.key in keyToDirection) {
          const direction = keyToDirection[event.key]
          const selectedNode = simulationNodes.current.find((node) => node.id === selectedId)
          const nextNode = getNextNode(simulationNodes.current, selectedNode, direction)

          if (nextNode) {
            onSelectRef.current?.(nextNode.id)
            requestAnimationFrame(() => drawToCanvas())
          }

          event.preventDefault()
        }
      }}
    />
  )
}

/** Returns the next node in a given direction */
function getNextNode(nodes: Node[], selectedNode: Node | undefined, direction: Direction) {
  if (
    typeof selectedNode === "undefined" ||
    typeof selectedNode.x === "undefined" ||
    typeof selectedNode.y === "undefined"
  ) {
    return
  }

  let result: { node: Node; score: number } | undefined

  for (const node of nodes) {
    // Skip selected node
    if (node === selectedNode) continue

    // Skip nodes that don't have a position
    if (typeof node.x === "undefined" || typeof node.y === "undefined") continue

    // Skip nodes on the wrong side of the selected node
    switch (direction) {
      case "n":
        if (node.y > selectedNode.y) continue
        break
      case "s":
        if (node.y < selectedNode.y) continue
        break
      case "e":
        if (node.x < selectedNode.x) continue
        break
      case "w":
        if (node.x > selectedNode.x) continue
        break
    }

    // Get the distance between the selected node and the current node
    const distance = getDistance({ x: selectedNode.x, y: selectedNode.y }, { x: node.x, y: node.y })

    // Get the angle between the selected node and the current node
    const angle = getAngle(
      { x: selectedNode.x, y: selectedNode.y },
      { x: node.x, y: node.y },
      direction,
    )

    // Calculate a score for the current node
    const score = (1 / distance) * (Math.PI / 2 - angle)

    // Pick the node with the highest score
    if (!result || result.score < score) {
      result = { node, score }
    }
  }

  return result?.node
}

/** Returns the distance between two points. */
function getDistance(a: Position, b: Position) {
  return Math.sqrt(Math.pow(b.x - a.x, 2) + Math.pow(b.y - a.y, 2))
}

/** Returns the angle between two points in radians. */
function getAngle(a: Position, b: Position, direction: Direction) {
  let oppositeSide = 0
  let adjacentSide = 0

  switch (direction) {
    case "n":
    case "s":
      oppositeSide = Math.abs(b.x - a.x)
      adjacentSide = Math.abs(b.y - a.y)
      break

    case "e":
    case "w":
      oppositeSide = Math.abs(b.y - a.y)
      adjacentSide = Math.abs(b.x - a.x)
      break
  }

  const angle = Math.atan(oppositeSide / adjacentSide)

  return angle
}
