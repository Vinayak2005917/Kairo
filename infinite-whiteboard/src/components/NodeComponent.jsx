import React, { useRef, useEffect, useState } from "react";
import { Group, Rect, Text, Image as KonvaImage, Transformer } from "react-konva";

export default function NodeComponent({ node, onDragEnd, registerRef, onToggle, onRequestEdit, onResize }) {
  const groupRef = useRef(null);
  const [img, setImg] = useState(null);
  const trRef = useRef(null);
  const [isHovered, setHovered] = useState(false);
  const stageRef = useRef(null);
  const resizingRef = useRef(null);

  // keep Konva group in sync with node props (applies after drag end)
  useEffect(() => {
    const g = groupRef.current;
    if (g) {
      g.x(node.x);
      g.y(node.y);
    }
  }, [node.x, node.y]);

  // register this group's ref with parent so arrows can read absolute positions
  useEffect(() => {
    const g = groupRef.current;
    if (registerRef) registerRef(g);
    return () => {
      if (registerRef) registerRef(null);
    };
  }, [registerRef]);

  // attach/detach transformer when hovered
  useEffect(() => {
    const tr = trRef.current;
    const g = groupRef.current;
    if (tr && g) {
      if (isHovered) tr.nodes([g]);
      else tr.nodes([]);
      tr.getLayer() && tr.getLayer().batchDraw();
    }
    // cache stage reference
    stageRef.current = g && g.getStage ? g.getStage() : null;
  }, [isHovered]);

  // load image if node.image (data URL or path) is present or content looks like an image URL
  useEffect(() => {
    const imageUrlPattern = /\.(jpeg|jpg|gif|png|webp|bmp|svg)(\?.*)?$/i;
    const looksLikeImage = node.contentType === "image" || (typeof node.content === "string" && imageUrlPattern.test(node.content));
    const src = node.image || (looksLikeImage ? node.content : null);
    if (src) {
      const image = new window.Image();
      // allow cross-origin image loading for external URLs
      try {
        image.crossOrigin = "Anonymous";
      } catch (e) {
        // ignore if not supported
      }
      image.src = src;
      image.onload = () => setImg(image);
      image.onerror = () => setImg(null);
      return () => {};
    } else {
      setImg(null);
    }
  }, [node.image, node.content, node.contentType]);

  // auto-fit node size to content when expanded
  useEffect(() => {
    if (!node.expanded || !onResize) return;
    // measure label and content widths
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    ctx.font = "16px sans-serif";
    const labelW = ctx.measureText(node.label || "").width;
    ctx.font = "12px sans-serif";
    const contentW = ctx.measureText(node.content || "").width;
    const maxTextW = Math.max(labelW, contentW);
    const desiredWidth = Math.min(400, Math.max(100, Math.ceil(maxTextW) + 32));

    // estimate content height (simple wrap calculation)
    const textAreaWidth = desiredWidth - 16;
    const approxCharWidth = 7; // rough estimate
    const contentChars = (node.content || "").length;
    const estimatedLines = Math.max(1, Math.ceil((contentW || (contentChars * approxCharWidth)) / textAreaWidth));
    const textHeight = estimatedLines * 16;

    // image height scaled to fit width if present
    let imgHeight = 0;
    if (img && img.width && img.height) {
      const availableW = desiredWidth - 16;
      imgHeight = Math.min(200, Math.round((img.height * availableW) / img.width));
    }

    const desiredHeight = Math.max(40, 28 + textHeight + imgHeight + 8);

    // if dimensions are significantly different, update
    if (Math.abs((node.width || 0) - desiredWidth) > 6 || Math.abs((node.height || 0) - desiredHeight) > 6) {
      onResize(node.id, desiredWidth, desiredHeight);
    }
  }, [node.label, node.content, node.image, img, node.expanded, onResize]);

  return (
    <Group
      ref={groupRef}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => {
        setHovered(false);
        const s = stageRef.current;
        if (s) s.container().style.cursor = "default";
      }}
      onMouseMove={() => {
        // change cursor when near edges to indicate resizing
        try {
          const s = stageRef.current;
          const g = groupRef.current;
          if (!s || !g) return;
          const pointer = s.getPointerPosition();
          if (!pointer) return;
          const rect = g.getClientRect();
          const margin = 8;
          const dx = pointer.x - rect.x;
          const dy = pointer.y - rect.y;
          const left = dx <= margin && dx >= 0 && dy >= 0 && dy <= rect.height;
          const right = dx >= rect.width - margin && dx <= rect.width && dy >= 0 && dy <= rect.height;
          const top = dy <= margin && dy >= 0 && dx >= 0 && dx <= rect.width;
          const bottom = dy >= rect.height - margin && dy <= rect.height && dx >= 0 && dx <= rect.width;
          let cursor = "default";
          if ((top && left) || (bottom && right)) cursor = "nwse-resize";
          else if ((top && right) || (bottom && left)) cursor = "nesw-resize";
          else if (left || right) cursor = "ew-resize";
          else if (top || bottom) cursor = "ns-resize";
          s.container().style.cursor = cursor;
        } catch (e) {
          // ignore
        }
      }}
      onMouseDown={(e) => {
        // start edge-drag resize when pointer is near edges
        try {
          const s = stageRef.current;
          const g = groupRef.current;
          if (!s || !g) return;
          const pointer = s.getPointerPosition();
          if (!pointer) return;
          const rect = g.getClientRect();
          const margin = 8;
          const dx = pointer.x - rect.x;
          const dy = pointer.y - rect.y;
          const left = dx <= margin && dx >= 0 && dy >= 0 && dy <= rect.height;
          const right = dx >= rect.width - margin && dx <= rect.width && dy >= 0 && dy <= rect.height;
          const top = dy <= margin && dy >= 0 && dx >= 0 && dx <= rect.width;
          const bottom = dy >= rect.height - margin && dy <= rect.height && dx >= 0 && dx <= rect.width;
          if (!(left || right || top || bottom)) return;
          // prevent parent click/drag
          e.cancelBubble = true;
          s.container().style.cursor = "default";
          const startPointer = { x: pointer.x, y: pointer.y };
          const startRect = rect;
          const startNode = { x: g.x(), y: g.y() };
          resizingRef.current = { left, right, top, bottom, startPointer, startRect, startNode };
          // disable group dragging while resizing
          g.draggable(false);
          const onMouseMoveWindow = (we) => {
            const pos = s.getPointerPosition();
            if (!pos) return;
            const info = resizingRef.current;
            if (!info) return;
            const dx2 = pos.x - info.startPointer.x;
            const dy2 = pos.y - info.startPointer.y;
            let newW = info.startRect.width;
            let newH = info.startRect.height;
            let newX = info.startNode.x;
            let newY = info.startNode.y;
            const minW = 40;
            const minH = 30;
            if (info.right) newW = Math.max(minW, info.startRect.width + dx2);
            if (info.bottom) newH = Math.max(minH, info.startRect.height + dy2);
            if (info.left) {
              newW = Math.max(minW, info.startRect.width - dx2);
              newX = info.startNode.x + dx2;
            }
            if (info.top) {
              newH = Math.max(minH, info.startRect.height - dy2);
              newY = info.startNode.y + dy2;
            }
            // update via callback
            if (onResize) onResize(node.id, Math.round(newW), Math.round(newH), Math.round(newX), Math.round(newY));
          };

          const onMouseUpWindow = () => {
            resizingRef.current = null;
            // restore dragging
            try {
              g.draggable(true);
            } catch (e) {}
            window.removeEventListener("mousemove", onMouseMoveWindow);
            window.removeEventListener("mouseup", onMouseUpWindow);
          };

          window.addEventListener("mousemove", onMouseMoveWindow);
          window.addEventListener("mouseup", onMouseUpWindow);
        } catch (err) {
          // ignore
        }
      }}
      draggable
      onClick={() => {
        if (onToggle) onToggle(!node.expanded);
      }}
      onTransformEnd={() => {
        const g = groupRef.current;
        if (!g) return;
        const rect = g.findOne('Rect');
        if (!rect) return;
        const scaleX = g.scaleX();
        const scaleY = g.scaleY();
        const newW = Math.max(40, rect.width() * scaleX);
        const newH = Math.max(30, rect.height() * scaleY);
        // reset scale
        g.scaleX(1);
        g.scaleY(1);
        if (onResize) onResize(node.id, newW, newH);
      }}
      onDragEnd={(e) => {
        onDragEnd(node.id, e.target.x(), e.target.y());
      }}
    >
      <Transformer
        ref={trRef}
        rotateEnabled={false}
        enabledAnchors={["top-left","top-center","top-right","middle-left","middle-right","bottom-left","bottom-center","bottom-right"]}
      />
      {/* rectangle adjusts height when collapsed */}
      <Rect
        width={node.width}
        height={node.expanded ? node.height : 40}
        fill={node.color}
        cornerRadius={10}
        shadowBlur={5}
      />

      {/* label always visible */}
      <Text
        text={node.label}
        fontSize={16}
        fill="#000"
        align="center"
        verticalAlign="top"
        width={node.width}
        padding={8}
      />

      {/* pencil icon (top-right) to request inline edit from parent */}
      {node.expanded && (
        <Group
          x={node.width - 28}
          y={4}
          onClick={(e) => {
            // stop parent click (which toggles expand)
            e.cancelBubble = true;
            if (onRequestEdit) onRequestEdit(node.id);
          }}
        >
          <Rect width={24} height={24} fill="#ffffff" cornerRadius={6} opacity={0.9} />
          <Text text="✏️" fontSize={12} x={4} y={4} />
        </Group>
      )}

      {/* expanded content area */}
      {/* content text (shown when expanded and content is not an image URL) */}
      {(() => {
        const imageUrlPattern = /\.(jpeg|jpg|gif|png|webp|bmp|svg)(\?.*)?$/i;
        const isContentImage = node.contentType === "image" || (typeof node.content === "string" && imageUrlPattern.test(node.content));
        return (
          node.expanded && node.content && !isContentImage && (
            <Text
              text={node.content}
              fontSize={12}
              fill="#333"
              width={node.width - 16}
              x={8}
              y={28}
              wrap="word"
            />
          )
        );
      })()}

      {/* image preview (when present) */}
      {node.expanded && img && (
        <KonvaImage
          image={img}
          x={8}
          y={28 + (node.content && !(node.contentType === "image") ? 60 : 0)}
          width={node.width - 16}
          height={node.height - 36 - (node.content && !(node.contentType === "image") ? 60 : 0)}
          listening={false}
        />
      )}
      {/* transform end handled on Group to persist resized dimensions */}
    </Group>
  );
}
