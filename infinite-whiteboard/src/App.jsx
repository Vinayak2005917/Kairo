import React, { useRef, useState, useEffect } from "react";
import { Stage, Layer, Arrow, Rect, Circle } from "react-konva";
import Konva from "konva";
import { Node } from "./models/Node.js";
import NodeComponent from "./components/NodeComponent.jsx";
import { MediaOverlayProvider } from "./components/MediaOverlayContext.jsx";
import MediaOverlayLayer from "./components/MediaOverlayLayer.jsx";
import userLogo from "./enso-user-logo.png";
import "./App.css";

export default function App() {
  const stageRef = useRef();
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [nodes, setNodes] = useState([]);

  // 🧠 Create new node
  const handleAddNode = () => {
    const stage = stageRef.current;
    const newId = Date.now().toString();

    const s = stage?.scaleX() || scale || 1;
    const stageX = (window.innerWidth / 2 - position.x) / s;
    const stageY = (window.innerHeight / 2 - position.y) / s;

    const newNode = new Node({
      id: newId,
      label: "New Node",
      x: stageX - 75,
      y: stageY - 40,
      color: "#a5d6a7",
      contentType: "text",
      content: "",
      connections: [],
    });

    setNodes((prev) => [...prev, newNode]);
    // Update cache
    nodeCenterCache.current[newId] = {
      x: stageX - 75 + (newNode.width || 150) / 2,
      y: stageY - 40 + (newNode.expanded ? newNode.height : 40) / 2,
    };
  };

  // Load nodes from backend on mount (no local fallback)
  const loadNodes = async () => {
    try {
      const res = await fetch("http://localhost:8000/load");
      const data = await res.json();
      if (data && Array.isArray(data.nodes)) {
        setNodes(data.nodes);
        // Update cache
        data.nodes.forEach(node => {
          nodeCenterCache.current[node.id] = {
            x: node.x + (node.width || 150) / 2,
            y: node.y + (node.expanded ? node.height : 40) / 2,
          };
        });
        return;
      }
      setNodes([]);
    } catch (err) {
      console.warn("Could not load nodes from backend:", err);
      setNodes([]);
    }
  };

  useEffect(() => {
    loadNodes();
  }, []);

  // Ensure the page/document doesn't show scrollbars that shift the layout.
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = body.style.overflow;
    const prevBodyMargin = body.style.margin;

    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    body.style.margin = "0";

    return () => {
      html.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
      body.style.margin = prevBodyMargin;
    };
  }, []);

  // Save nodes to backend
  const saveNodes = async () => {
    try {
      await fetch("http://localhost:8000/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodes }),
      });
      console.log("Nodes saved");
    } catch (err) {
      console.error("Failed to save nodes:", err);
    }
  };

  // 🧭 Zoom
  const handleWheel = (e) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    const oldScale = stage.scaleX();
    const pointer = stage.getPointerPosition();
    const scaleBy = 1.08; // small incremental scaling

    // exponential scaling by wheel delta
    const newScale = oldScale * Math.pow(scaleBy, -e.evt.deltaY / 100);

    const mousePointTo = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale,
    };

    const newPos = {
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    };

    stage.scale({ x: newScale, y: newScale });
    stage.position(newPos);
    stage.batchDraw();
  };


  // 🧩 Node move finalize (only when drag ends)
  const handleNodeDragEnd = (id, newX, newY) => {
    setNodes((prev) =>
      prev.map((n) => (n.id === id ? { ...n, x: newX, y: newY } : n))
    );
  };

    // 🧠 Live update (while dragging) - optimize by updating arrows directly with throttling
    const frameId = useRef(null);
    const handleNodeMove = (id, newX, newY) => {
      // NOTE: avoid calling setNodes here — updating React state on every drag event
      // causes a full re-render of all nodes and layers and leads to janky dragging.
      // Instead we only update the cached center (used for arrows) and update
      // arrow refs directly in the rAF callback. The authoritative node x/y is
      // persisted on drag end (handleNodeDragEnd).

      // Update cache for this moving node so arrows use fresh positions
      const node = findNode(id);
      if (node) {
        nodeCenterCache.current[id] = {
          x: newX + (node.width || 150) / 2,
          y: newY + (node.expanded ? node.height : 40) / 2,
        };
      }

    // Throttle updates to 60fps
    if (frameId.current) return;
    frameId.current = requestAnimationFrame(() => {
      // Directly update arrows connected to this node
      const movingNode = { ...findNode(id), x: newX, y: newY };
      if (!movingNode) return;

      nodes.forEach((node) => {
        node.connections.forEach((targetId) => {
          if (node.id === id || targetId === id) {
            const srcNode = node.id === id ? movingNode : findNode(node.id);
            const tgtNode = targetId === id ? movingNode : findNode(targetId);
            if (!srcNode || !tgtNode) return;

            const srcCenter = nodeCenterCache.current[srcNode.id] || { x: srcNode.x + (srcNode.width || 150) / 2, y: srcNode.y + (srcNode.expanded ? srcNode.height : 40) / 2 };
            const tgtCenter = nodeCenterCache.current[tgtNode.id] || { x: tgtNode.x + (tgtNode.width || 150) / 2, y: tgtNode.y + (tgtNode.expanded ? tgtNode.height : 40) / 2 };

            const points = computeEdgePointsFromCenters(srcCenter, srcNode, tgtCenter, tgtNode);
            const arrowKey = `${node.id}->${targetId}`;
            const arrowRef = arrowRefs.current[arrowKey];
            if (arrowRef) {
              arrowRef.points(points);
            }
          }
        });
      });

      // Update temporary arrow if connecting
      if (connectingFromId && tempPointer) {
        const srcNode = findNode(connectingFromId);
        if (srcNode) {
          const srcCenter = nodeCenterCache.current[connectingFromId] || { x: srcNode.x + (srcNode.width || 150) / 2, y: srcNode.y + (srcNode.expanded ? srcNode.height : 40) / 2 };
          const points = computeEdgeToPointerFromCenter(srcCenter, srcNode, tempPointer);
          const tempArrowRef = arrowRefs.current['temp-arrow'];
          if (tempArrowRef) {
            tempArrowRef.points(points);
          }
        }
      }

      arrowLayerRef.current?.batchDraw();
      frameId.current = null;
    });
  };

  // toggle expanded / collapsed state
  const handleToggleExpand = (id, expanded) => {
    // Fixed defaults (no auto-resize). Choose sizes large enough for media previews + text.
    const COLLAPSED_WIDTH = 200; // collapsed node width
    const EXPANDED_DEFAULT = { width: 420, height: 320 };
    setNodes((prev) =>
      prev.map((n) => {
        if (n.id !== id) return n;
        if (!expanded) {
          return { ...n, expanded: false, width: COLLAPSED_WIDTH, height: n.height };
        }
        // expanding: ensure node is at least the expanded default size
        const newWidth = n.width && n.width > EXPANDED_DEFAULT.width ? n.width : EXPANDED_DEFAULT.width;
        const newHeight = n.height && n.height > EXPANDED_DEFAULT.height ? n.height : EXPANDED_DEFAULT.height;
        return { ...n, expanded: true, width: newWidth, height: newHeight };
      })
    );
  };

  // ensure arrows update when a node collapses/expands
  // we update the cached center for the toggled node and recompute any connected arrows
  useEffect(() => {
    // nothing to do until nodes or arrow refs exist
    if (!nodes || nodes.length === 0) return;

    // find any nodes whose expanded state recently changed by comparing cache sizes
    // Instead, respond to nodes changes by refreshing arrow endpoints for all connections
    // to avoid missing any updates (cheap enough for typical boards)
    try {
      // rebuild center cache for all nodes (authoritative)
      nodes.forEach((n) => {
        nodeCenterCache.current[n.id] = {
          x: n.x + (n.width || 150) / 2,
          y: n.y + (n.expanded ? n.height || 100 : 40) / 2,
        };
      });

      // recompute all arrows
      nodes.forEach((node) => {
        (node.connections || []).forEach((targetId) => {
          const srcNode = findNode(node.id) || node;
          const tgtNode = findNode(targetId) || {};
          const srcCenter = nodeCenterCache.current[srcNode.id] || { x: srcNode.x + (srcNode.width || 150) / 2, y: srcNode.y + (srcNode.expanded ? srcNode.height : 40) / 2 };
          const tgtCenter = nodeCenterCache.current[tgtNode.id] || { x: tgtNode.x + (tgtNode.width || 150) / 2, y: tgtNode.y + (tgtNode.expanded ? tgtNode.height : 40) / 2 };
          const points = computeEdgePointsFromCenters(srcCenter, srcNode, tgtCenter, tgtNode);
          const arrowKey = `${node.id}->${targetId}`;
          const arrowRef = arrowRefs.current[arrowKey];
          if (arrowRef) arrowRef.points(points);
        });
      });

      arrowLayerRef.current?.batchDraw();
    } catch (e) {
      // harmless if stage/refs not ready yet
    }
  }, [nodes]);

  // (node editing removed) -- inline editing and resize callbacks are disabled

  const findNode = (id) => nodes.find((n) => n.id === id);

  // Resolve overlap by nudging the updated node until it no longer intersects others.
  const rectsIntersect = (a, b) => {
    return !(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y);
  };

  const handleUpdateNode = (updated) => {
    setNodes((prev) => {
      const existing = prev.find((p) => p.id === updated.id) || {};
      const baseX = updated.x !== undefined ? updated.x : existing.x || 0;
      const baseY = updated.y !== undefined ? updated.y : existing.y || 0;
      const width = updated.width !== undefined ? updated.width : existing.width || 150;
      const height = (updated.expanded !== undefined ? (updated.expanded ? (updated.height !== undefined ? updated.height : existing.height || 100) : 40) : (existing.expanded ? existing.height || 100 : 40));

      let newX = baseX;
      let newY = baseY;

      const others = prev.filter((p) => p.id !== updated.id);
      let attempts = 0;
      const MAX_ATTEMPTS = 200;
      while (attempts < MAX_ATTEMPTS) {
        const r1 = { x: newX, y: newY, width, height };
        const collision = others.find((o) => {
          const oRect = { x: o.x, y: o.y, width: o.width || 150, height: o.expanded ? o.height || 100 : 40 };
          return rectsIntersect(r1, oRect);
        });
        if (!collision) break;
        // simple nudge strategy: move right by 24px; if too far, wrap down
        newX += Math.max(24, Math.round((collision.width || 150) / 2));
        if (newX > window.innerWidth * 2) {
          newX = 40;
          newY += Math.max(40, Math.round((collision.height || 100) / 2));
        }
        attempts++;
      }

      // Merge updates and set resolved position
      return prev.map((p) => (p.id === updated.id ? { ...p, ...updated, x: newX, y: newY } : p));
    });
    // update center cache for this node (best-effort)
    const up = updated;
    nodeCenterCache.current[up.id] = {
      x: (up.x !== undefined ? up.x : (findNode(up.id)?.x || 0)) + ((up.width !== undefined ? up.width : findNode(up.id)?.width || 150) / 2),
      y: (up.y !== undefined ? up.y : (findNode(up.id)?.y || 0)) + ((up.expanded ? (up.height !== undefined ? up.height : findNode(up.id)?.height || 100) : 40) / 2),
    };
  };

  // resize handling removed — nodes are not resizable via UI

  // keep refs to Konva node Groups so arrows can read positions directly
  const nodeRefs = useRef({});
  const registerNode = (id, ref) => {
    if (ref) nodeRefs.current[id] = ref;
  };

  // refs for arrows and layers to optimize updates
  const arrowRefs = useRef({});
  const arrowLayerRef = useRef();
  const nodeLayerRef = useRef();

  // cache for node centers to avoid recalculating
  const nodeCenterCache = useRef({});

  // interactive connection creation state
  const [connectingFromId, setConnectingFromId] = useState(null);
  const [tempPointer, setTempPointer] = useState(null); // {x,y} in stage coords
  const [highlightedNodeId, setHighlightedNodeId] = useState(null);

  // helper: compute edge points using cached centers
  const computeEdgePointsFromCenters = (srcCenter, srcNode, tgtCenter, tgtNode) => {
    const dx = tgtCenter.x - srcCenter.x;
    const dy = tgtCenter.y - srcCenter.y;

    const halfW1 = (srcNode.width || 150) / 2;
    const halfH1 = (srcNode.expanded ? srcNode.height : 40) / 2;
    const halfW2 = (tgtNode.width || 150) / 2;
    const halfH2 = (tgtNode.expanded ? tgtNode.height : 40) / 2;

    const absDx = Math.abs(dx) || 0.0001;
    const absDy = Math.abs(dy) || 0.0001;
    const t1 = Math.max(absDx / halfW1, absDy / halfH1, 1);
    const sx = srcCenter.x + dx / t1;
    const sy = srcCenter.y + dy / t1;

    const t2 = Math.max(absDx / halfW2, absDy / halfH2, 1);
    const ex = tgtCenter.x - dx / t2;
    const ey = tgtCenter.y - dy / t2;

    return [sx, sy, ex, ey];
  };

  const computeEdgeToPointerFromCenter = (srcCenter, srcNode, pointer) => {
    const endX = pointer.x;
    const endY = pointer.y;
    const dx = endX - srcCenter.x;
    const dy = endY - srcCenter.y;

    const halfW1 = (srcNode.width || 150) / 2;
    const halfH1 = (srcNode.expanded ? srcNode.height : 40) / 2;
    const absDx = Math.abs(dx) || 0.0001;
    const absDy = Math.abs(dy) || 0.0001;
    const t1 = Math.max(absDx / halfW1, absDy / halfH1, 1);
    const sx = srcCenter.x + dx / t1;
    const sy = srcCenter.y + dy / t1;

    return [sx, sy, endX, endY];
  };

  // Start connecting from a node (called by NodeComponent)
  const handleStartConnect = (id) => {
    setConnectingFromId(id);
    const srcNode = findNode(id);
    if (srcNode) {
      nodeCenterCache.current[id] = nodeCenterCache.current[id] || { x: srcNode.x + (srcNode.width || 150) / 2, y: srcNode.y + (srcNode.expanded ? srcNode.height : 40) / 2 };
      const c = nodeCenterCache.current[id];
      setTempPointer({ x: c.x, y: c.y });
    }
  };

  // Complete connecting to a target node
  const handleCompleteConnect = (targetId) => {
    if (!connectingFromId) return;
    if (connectingFromId === targetId) {
      // cancel if same node
      setConnectingFromId(null);
      setTempPointer(null);
      setHighlightedNodeId(null);
      return;
    }

    // add directed connection from connectingFromId -> targetId (avoid duplicates)
    setNodes((prev) =>
      prev.map((n) =>
        n.id === connectingFromId
          ? { ...n, connections: Array.from(new Set([...(n.connections || []), targetId])) }
          : n
      )
    );

    // clear temp state
    setConnectingFromId(null);
    setTempPointer(null);
    setHighlightedNodeId(null);
  };

  // Removed Konva.Animation as we update arrows directly in onDragMove

  // Background dots configuration
  const dotStep = 80; // spacing between dots in stage coordinates
  const dotRadius = 3;
  const dotColor = "#1976d2"; // blue
  const dotOpacity = 0.4;
  // create a grid large enough to cover typical pan/zoom ranges
  const maxDim = Math.max(window.innerWidth, window.innerHeight) * 3; // multiplier to cover panning
  const half = Math.ceil(maxDim / 2);
  const dots = [];
  for (let x = -half; x <= half; x += dotStep) {
    for (let y = -half; y <= half; y += dotStep) {
      dots.push({ x, y });
    }
  }

  return (
    <div style={{ width: "100vw", height: "100vh", overflow: "hidden" }}>
    {/* User badge (top-left) */}
    <div style={{ position: "absolute", top: 25, left: 12, zIndex: 200 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 10px",       // bigger padding
          borderRadius: 12,
          background: "#ffffff",
          border: "1px solid #555",   // thin dark gray stroke
          boxShadow: "0 12px 30px rgba(16,24,40,0.15)", // more blur, wider spread
          fontSize: 18,
          fontWeight: 850,
          fontFamily: "Arial, sans-serif",
        }}>
          {/* Logo/Icon */}
          <img 
            src={userLogo} 
            alt="Logo" 
            style={{ width: 35, height: 35 }} 
          />
          User Name
        </div>
      </div>
    </div>

      {/* Controls (top-center) with rounded background */}
      <div style={{ position: "absolute", zIndex: 100, display: "flex", gap: 8, justifyContent: "center", top: 25, left: "50%", transform: "translateX(-50%)" }}>
        <div style={{
            display: "flex",
            gap: 10,
            alignItems: "center",
            padding: "10px 20px", // bigger
            borderRadius: 12,
            background: "rgba(255, 255, 255, 1)",
            border: "1px solid #555", // thin dark gray stroke
            boxShadow: "0 12px 30px rgba(11,22,55,0.15)" // more blur, wider spread
          }}>
          <button
            onClick={handleAddNode}
            style={{
              padding: "8px 12px",
              borderRadius: 6,
              background: "#1976d2",
              color: "white",
              border: "none",
              cursor: "pointer",
            }}
          >
            + Add Node
          </button>
          <button
            onClick={saveNodes}
            title="Save nodes to backend"
            style={{
              padding: "8px 12px",
              borderRadius: 6,
              background: "#2e7d32",
              color: "white",
              border: "none",
              cursor: "pointer",
            }}
          >
            💾 Save
          </button>
        </div>
      </div>

      <MediaOverlayProvider>
      <Stage
        ref={stageRef}
        width={window.innerWidth}
        height={window.innerHeight}
        scaleX={scale}
        scaleY={scale}
        x={position.x}
        y={position.y}
        draggable
        onWheel={handleWheel}
        onMouseMove={(e) => {
          if (!connectingFromId) return;
          const s = stageRef.current;
          if (!s) return;
          const pos = s.getPointerPosition();
          if (!pos) return;

          // detect whether pointer is over another node (simple bbox check)
          let hoverNode = null;
          for (const n of nodes) {
            if (n.id === connectingFromId) continue; // skip source
            const left = n.x;
            const top = n.y;
            const right = n.x + (n.width || 150);
            const bottom = n.y + (n.expanded ? n.height : 40);
            // if pointer inside bbox
            if (pos.x >= left - 8 && pos.x <= right + 8 && pos.y >= top - 8 && pos.y <= bottom + 8) {
              hoverNode = n;
              break;
            }
          }

          // if hovering a node, snap endpoint to its edge for a polished look
          if (hoverNode) {
            setHighlightedNodeId(hoverNode.id);
            const srcNode = findNode(connectingFromId);
            const srcCenter = nodeCenterCache.current[connectingFromId] || { x: srcNode.x + (srcNode.width || 150) / 2, y: srcNode.y + (srcNode.expanded ? srcNode.height : 40) / 2 };
            const tgtCenter = nodeCenterCache.current[hoverNode.id] || { x: hoverNode.x + (hoverNode.width || 150) / 2, y: hoverNode.y + (hoverNode.expanded ? hoverNode.height : 40) / 2 };
            const pts = computeEdgePointsFromCenters(srcCenter, srcNode, tgtCenter, hoverNode);
            // use target edge as endpoint
            setTempPointer({ x: pts[2], y: pts[3] });
          } else {
            setHighlightedNodeId(null);
            setTempPointer({ x: pos.x, y: pos.y });
          }
        }}
        onMouseDown={(e) => {
          // if user clicks empty space while connecting, cancel
          if (connectingFromId) {
            // cancel connection on stage mouse down
            setConnectingFromId(null);
            setTempPointer(null);
            setHighlightedNodeId(null);
          }
        }}
        style={{ display: "block", background: "transparent" }}
      >
        {/* Background layer: white base + blue dots */}
        <Layer>
          <Rect
            x={-half}
            y={-half}
            width={half * 2}
            height={half * 2}
            fill="#ffffff"
          />
          {dots.map((d, i) => (
            <Circle
              key={`dot-${i}`}
              x={d.x}
              y={d.y}
              radius={dotRadius}
              fill={dotColor}
              opacity={dotOpacity}
              listening={false}
            />
          ))}
        </Layer>

        {/* Arrows layer */}
        <Layer ref={arrowLayerRef}>
          {nodes.flatMap((node) =>
            node.connections.map((targetId) => {
              const srcNode = findNode(node.id) || node;
              const tgtNode = findNode(targetId) || {};
              const srcCenter = nodeCenterCache.current[srcNode.id] || { x: srcNode.x + (srcNode.width || 150) / 2, y: srcNode.y + (srcNode.expanded ? srcNode.height : 40) / 2 };
              const tgtCenter = nodeCenterCache.current[tgtNode.id] || { x: tgtNode.x + (tgtNode.width || 150) / 2, y: tgtNode.y + (tgtNode.expanded ? tgtNode.height : 40) / 2 };
              const points = computeEdgePointsFromCenters(srcCenter, srcNode, tgtCenter, tgtNode);
              const arrowKey = `${node.id}->${targetId}`;
              return (
                <Arrow
                  key={arrowKey}
                  ref={(el) => (arrowRefs.current[arrowKey] = el)}
                  points={points}
                  stroke="#666"
                  fill="#666"
                  pointerLength={8}
                  pointerWidth={8}
                />
              );
            })
          )}

          {/* Temporary connection arrow */}
          {connectingFromId && tempPointer && (() => {
            const srcNode = findNode(connectingFromId) || {};
            const srcCenter = nodeCenterCache.current[connectingFromId] || { x: srcNode.x + (srcNode.width || 150) / 2, y: srcNode.y + (srcNode.expanded ? srcNode.height : 40) / 2 };
            const points = computeEdgeToPointerFromCenter(srcCenter, srcNode, tempPointer);
            return (
              <Arrow
                key={`temp-arrow`}
                ref={(el) => (arrowRefs.current['temp-arrow'] = el)}
                points={points}
                stroke="#1976d2"
                fill="#1976d2"
                pointerLength={8}
                pointerWidth={8}
                dash={[6, 4]}
              />
            );
          })()}
        </Layer>

        {/* Nodes layer */}
        <Layer ref={nodeLayerRef}>
          {nodes.map((node) => (
            <NodeComponent
              key={node.id}
              node={node}
              onDragEnd={handleNodeDragEnd}
              onDragMove={handleNodeMove}
              onToggle={(expanded) => handleToggleExpand(node.id, expanded)}
              registerRef={(r) => registerNode(node.id, r)}
              onStartConnect={handleStartConnect}
              onCompleteConnect={handleCompleteConnect}
              onNodeClick={(id, e) => {
                // clicking (without shift) while connecting should also allow completing connection
                if (connectingFromId) {
                  if (connectingFromId === id) {
                    setConnectingFromId(null);
                    setTempPointer(null);
                    setHighlightedNodeId(null);
                    return;
                  }
                  setNodes((prev) =>
                    prev.map((n) =>
                      n.id === connectingFromId
                        ? { ...n, connections: Array.from(new Set([...(n.connections || []), id])) }
                        : n
                    )
                  );
                  setConnectingFromId(null);
                  setTempPointer(null);
                  setHighlightedNodeId(null);
                  return;
                }

                // otherwise do nothing here — label click handles expand/collapse.
              }}
              isHighlighted={highlightedNodeId === node.id}
              onUpdateNode={handleUpdateNode}
            />
          ))}
        </Layer>
      </Stage>
        {/* Media overlays (React-managed DOM overlays) */}
        <MediaOverlayLayer stageRef={stageRef} />
        </MediaOverlayProvider>

      {/* Inline node editing removed */}
      {/* Small instruction pill (bottom-left) */}
      <div style={{ position: "absolute", zIndex: 300, right: 12, top: 18 }}>
        <div style={{
          padding: "8px 12px",
          borderRadius: 8,
          background: "rgba(25,118,210,0.95)",
          color: "white",
          fontSize: 13,
          boxShadow: "0 8px 20px rgba(11,22,55,0.12)",
          border: "1px solid rgba(255,255,255,0.08)",
          maxWidth: 320
        }}>
          Hold down Shift and drag from any node to another to connect them
        </div>
      </div>

      {/* Bottom centered prompt input */}
      <div className="prompt-bar-container">
        <div className="prompt-bar">
          <input
            className="prompt-input"
            placeholder="(Does not work at all right now) Enter a prompt for making your Mind Maps..."
            aria-label="mindmap prompt"
          />
          <button className="prompt-btn">Generate</button>
        </div>
      </div>

    </div>
  );
}
