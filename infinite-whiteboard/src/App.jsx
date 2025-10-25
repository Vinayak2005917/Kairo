import React, { useRef, useState, useEffect } from "react";
import { Stage, Layer, Arrow, Rect, Circle } from "react-konva";
import Konva from "konva";
import { Node } from "./models/Node.js";
import NodeComponent from "./components/NodeComponent.jsx";
import userLogo from "./enso-user-logo.png";

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
  let frameId = useRef(null);
  const handleNodeMove = (id, newX, newY) => {
    // Update node position in state for other purposes
    setNodes((prev) =>
      prev.map((n) => (n.id === id ? { ...n, x: newX, y: newY } : n))
    );

    // Update cache
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
    setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, expanded } : n)));
  };

  // request edit (open inline editor) for a node
  const [editingNodeId, setEditingNodeId] = useState(null);

  const handleRequestEdit = (id) => {
    setEditingNodeId(id);
  };

  // update node fields
  const handleUpdateNode = (id, patch) => {
    setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, ...patch } : n)));
  };

  const findNode = (id) => nodes.find((n) => n.id === id);

  const handleResize = (id, width, height, x, y) => {
    setNodes((prev) =>
      prev.map((n) =>
        n.id === id
          ? {
              ...n,
              // mark expanded when user explicitly resizes so the Rect uses the new height
              expanded: true,
              width,
              height,
              ...(typeof x === "number" ? { x } : {}),
              ...(typeof y === "number" ? { y } : {}),
            }
          : n
      )
    );

    // if we have a Konva ref for this node, ask its layer to redraw so visual update is immediate
    try {
      const ref = nodeRefs.current && nodeRefs.current[id];
      const layer = ref && ref.getLayer && ref.getLayer();
      layer && layer.batchDraw();
    } catch (e) {
      // ignore if layer not available yet
    }

    // Update cache if position changed
    if (typeof x === "number" || typeof y === "number") {
      const updatedNode = nodes.find(n => n.id === id);
      if (updatedNode) {
        nodeCenterCache.current[id] = {
          x: (typeof x === "number" ? x : updatedNode.x) + (width || updatedNode.width || 150) / 2,
          y: (typeof y === "number" ? y : updatedNode.y) + (height || updatedNode.height || 40) / 2,
        };
      }
    }
  };

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

  // Removed Konva.Animation as we update arrows directly in onDragMove

  // Background dots configuration
  const dotStep = 60; // spacing between dots in stage coordinates
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
          setTempPointer({ x: pos.x, y: pos.y });
        }}
        onMouseDown={(e) => {
          // if user clicks empty space while connecting, cancel
          if (connectingFromId) {
            // determine whether click was on empty area by checking target
            const shape = e.target;
            if (shape && shape === stageRef.current) {
              setConnectingFromId(null);
              setTempPointer(null);
            }
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
              onRequestEdit={handleRequestEdit}
              onResize={handleResize}
              onStartConnect={(id) => setConnectingFromId(id)}
              onNodeClick={(id, e) => {
                // if we are creating a connection, complete it by clicking another node
                if (connectingFromId) {
                  // clicking same node cancels
                  if (connectingFromId === id) {
                    setConnectingFromId(null);
                    setTempPointer(null);
                    return;
                  }
                  // add connection from connectingFromId -> id (avoid duplicates)
                  setNodes((prev) =>
                    prev.map((n) =>
                      n.id === connectingFromId
                        ? { ...n, connections: Array.from(new Set([...(n.connections || []), id])) }
                        : n
                    )
                  );
                  setConnectingFromId(null);
                  setTempPointer(null);
                  return;
                }
                // otherwise fall back to toggling expand (preserve old behavior)
                handleToggleExpand(id, !findNode(id)?.expanded);
              }}
            />
          ))}
        </Layer>
      </Stage>

      {/* Inline editor overlay (renders above the stage) */}
      {editingNodeId && nodeRefs.current[editingNodeId] && (
        (() => {
          const stage = stageRef.current;
          const nodeRef = nodeRefs.current[editingNodeId];
          if (!stage || !nodeRef) return null;
          const abs = nodeRef.getAbsolutePosition();
          const tr = stage.getAbsoluteTransform();
          const point = tr.point({ x: abs.x, y: abs.y });
          const rect = stage.container().getBoundingClientRect();
          const left = rect.left + point.x;
          const top = rect.top + point.y;
          const node = findNode(editingNodeId);
          const width = node ? node.width : 200;
          return (
            <div
              style={{
                position: "absolute",
                left: left,
                top: top,
                zIndex: 2000,
                background: "rgba(255,255,255,0.95)",
                padding: 8,
                borderRadius: 6,
                boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                width: width,
              }}
            >
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  value={node?.label || ""}
                  onChange={(e) => handleUpdateNode(editingNodeId, { label: e.target.value })}
                  style={{ flex: 1, fontWeight: 600 }}
                />
                <button onClick={() => setEditingNodeId(null)}>Done</button>
              </div>
              <textarea
                value={node?.content || ""}
                onChange={(e) => handleUpdateNode(editingNodeId, { content: e.target.value })}
                placeholder="Enter text..."
                style={{ width: "100%", marginTop: 8, minHeight: 80 }}
              />

              <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
                <label style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                  <input
                    type="file"
                    accept="image/*"
                    style={{ display: "none" }}
                    onChange={async (e) => {
                      const f = e.target.files && e.target.files[0];
                      if (!f) return;
                      const reader = new FileReader();
                      reader.onload = () => {
                        handleUpdateNode(editingNodeId, { image: reader.result });
                      };
                      reader.readAsDataURL(f);
                    }}
                  />
                  <span style={{ fontSize: 18 }}>➕</span>
                  <span>Add image</span>
                </label>
                {node?.image && (
                  <img src={node.image} alt="preview" style={{ maxHeight: 64, borderRadius: 4 }} />
                )}
              </div>
            </div>
          );
        })()
      )}
    </div>
  );
}
