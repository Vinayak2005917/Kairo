import React, { useRef, useEffect, useState } from "react";
import { Group, Rect, Text, Image as KonvaImage } from "react-konva";

export default function NodeComponent({ node, onDragEnd, onDragMove, registerRef, onToggle, onStartConnect, onCompleteConnect, onNodeClick, isHighlighted }) {
  const groupRef = useRef(null);
  const [img, setImg] = useState(null);
  const stageRef = useRef(null);

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

  // cache stage reference for pointer events
  useEffect(() => {
    const g = groupRef.current;
    stageRef.current = g && g.getStage ? g.getStage() : null;
  }, []);

  // load image if node.image (data URL or path) is present or content looks like an image URL
  useEffect(() => {
    const imageUrlPattern = /\.(jpeg|jpg|gif|png|webp|bmp|svg)(\?.*)?$/i;
    const looksLikeImage = node.contentType === "image" || (typeof node.content === "string" && imageUrlPattern.test(node.content));
    const src = node.image || (looksLikeImage ? node.content : null);
    if (src) {
      const image = new window.Image();
      try {
        image.crossOrigin = "Anonymous";
      } catch (e) {}
      image.src = src;
      image.onload = () => setImg(image);
      image.onerror = () => setImg(null);
      return () => {};
    } else {
      setImg(null);
    }
  }, [node.image, node.content, node.contentType]);

  return (
    <Group
      ref={groupRef}
      draggable
      dragBoundFunc={(pos) => ({ x: Math.round(pos.x), y: Math.round(pos.y) })}
      onClick={(e) => {
        if (onNodeClick) {
          onNodeClick(node.id, e);
          return;
        }
        if (onToggle) onToggle(!node.expanded);
      }}
      onMouseDown={(e) => {
        // Start a connection if user holds Shift while mousing down (assumption: use Shift+drag to connect)
        try {
          if (e.evt && e.evt.shiftKey) {
            // temporarily disable dragging so we can draw connection instead of moving node
            const g = groupRef.current;
            if (g && g.draggable) {
              try { g.draggable(false); } catch (err) {}
            }
            e.cancelBubble = true;
            if (onStartConnect) onStartConnect(node.id);
          }
        } catch (err) {}
      }}
      onMouseUp={(e) => {
        // Complete a connection if the parent is in connecting mode
        try {
          const g = groupRef.current;
          if (g && g.draggable) {
            try { g.draggable(true); } catch (err) {}
          }
          if (e.evt && e.evt.shiftKey) {
            // if we started connecting with shift, complete connection
            if (onCompleteConnect) onCompleteConnect(node.id);
            e.cancelBubble = true;
          }
        } catch (err) {}
      }}
      onDragMove={(e) => {
        if (onDragMove) onDragMove(node.id, e.target.x(), e.target.y());
      }}
      onDragEnd={(e) => {
        // ensure draggable is restored after drag
        try {
          const g = groupRef.current;
          if (g && g.draggable) {
            try { g.draggable(true); } catch (err) {}
          }
        } catch (err) {}
        onDragEnd(node.id, e.target.x(), e.target.y());
      }}
    >
      {/* rectangle adjusts height when collapsed; removed shadow */}
      <Rect
        width={node.width}
        height={node.expanded ? node.height : 40}
        fill={node.color}
        cornerRadius={10}
        stroke={isHighlighted ? "#1976d2" : "#6b6b6bff"}
        strokeWidth={isHighlighted ? 2 : 1}
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

      {/* expanded content area (text) */}
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
    </Group>
  );
}
