import React, { useRef, useState, useEffect } from "react";
import { Stage, Layer, Arrow, Rect, Circle } from "react-konva";
import Konva from "konva";
import { Node } from "./models/Node.js";
import NodeComponent from "./components/NodeComponent.jsx";

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
  };

  // Load nodes from backend on mount (no local fallback)
  const loadNodes = async () => {
    try {
      const res = await fetch("http://localhost:8000/load");
      const data = await res.json();
      if (data && Array.isArray(data.nodes)) {
        setNodes(data.nodes);
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
    const scaleBy = 1.05;
    const newScale = e.evt.deltaY > 0 ? oldScale / scaleBy : oldScale * scaleBy;

    const mousePointTo = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale,
    };

    const newPos = {
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    };

    setScale(newScale);
    setPosition(newPos);
  };

  // 🧩 Node move finalize (only when drag ends)
  const handleNodeDragEnd = (id, newX, newY) => {
    setNodes((prev) =>
      prev.map((n) => (n.id === id ? { ...n, x: newX, y: newY } : n))
    );
  };

  // 🧠 Live update (while dragging)
  const handleNodeMove = (id, newX, newY) => {
    setNodes((prev) =>
      prev.map((n) => (n.id === id ? { ...n, x: newX, y: newY } : n))
    );
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
              width,
              height,
              ...(typeof x === "number" ? { x } : {}),
              ...(typeof y === "number" ? { y } : {}),
            }
          : n
      )
    );
  };

  // keep refs to Konva node Groups so arrows can read positions directly
  const nodeRefs = useRef({});
  const registerNode = (id, ref) => {
    if (ref) nodeRefs.current[id] = ref;
  };

  // update connections manually on each frame using Konva.Animation to redraw layer
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const layers = stage.getLayers();
    // assume second layer (index 1) contains arrows+nodes
    const targetLayer = layers[1] || layers[0];
    const anim = new Konva.Animation(() => {
      // empty frame callback - we rely on layer redraw to pick up updated arrow points
    }, targetLayer);
    anim.start();
    return () => anim.stop();
  }, []);

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
      {/* Controls */}
      <div style={{ position: "absolute", zIndex: 100, display: "flex", gap: 8, justifyContent: "center", top: 12, left: "50%", transform: "translateX(-50%)" }}>
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
        style={{ background: "transparent" }}
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

        <Layer>
          {/* Arrows computed from Konva node refs (faster redraw) */}
          {nodes.flatMap((node) =>
            node.connections.map((targetId) => {
              const srcRef = nodeRefs.current[node.id];
              const tgtRef = nodeRefs.current[targetId];
              if (!srcRef || !tgtRef) return null;
              const srcPos = srcRef.getAbsolutePosition();
              const tgtPos = tgtRef.getAbsolutePosition();
              const srcNode = findNode(node.id) || node;
              const tgtNode = findNode(targetId) || {};
              const srcH = srcNode.expanded ? srcNode.height : 40;
              const tgtH = tgtNode.expanded ? tgtNode.height : 40;
              return (
                <Arrow
                  key={`${node.id}->${targetId}`}
                  points={[
                    srcPos.x + (srcNode.width || 150) / 2,
                    srcPos.y + srcH / 2,
                    tgtPos.x + (tgtNode.width || 150) / 2,
                    tgtPos.y + tgtH / 2,
                  ]}
                  stroke="#ccc"
                  fill="#ccc"
                  pointerLength={8}
                  pointerWidth={8}
                />
              );
            })
          )}

          {/* Nodes */}
          {nodes.map((node) => (
            <NodeComponent
              key={node.id}
              node={node}
              onDragEnd={handleNodeDragEnd}
              onToggle={(expanded) => handleToggleExpand(node.id, expanded)}
              registerRef={(r) => registerNode(node.id, r)}
              onRequestEdit={handleRequestEdit}
              onResize={handleResize}
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
