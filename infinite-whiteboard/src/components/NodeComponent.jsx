import React, { useEffect, useRef, useState } from "react";
import { Group, Rect, Text, Image as KonvaImage, Line } from "react-konva";
import { useMediaOverlay } from "./MediaOverlayContext.jsx";

export default function NodeComponent({
  node,
  onDragEnd = () => {},
  onDragMove = () => {},
  onToggle = () => {},
  registerRef = () => {},
  onStartConnect = () => {},
  onCompleteConnect = () => {},
  onNodeClick = () => {},
  isHighlighted = false,
  onUpdateNode = () => {},
  stageRef,
}) {
  const groupRef = useRef(null);
  const { overlays, setOverlay, clearOverlay } = useMediaOverlay();

  const [previewImage, setPreviewImage] = useState(null);
  const [imageDisplaySize, setImageDisplaySize] = useState({ w: 0, h: 0 });

  // register ref for external arrow math
  useEffect(() => {
    if (registerRef) registerRef(node.id, groupRef.current);
    return () => {
      if (registerRef) registerRef(node.id, null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupRef.current]);

  // load image preview (or youtube thumbnail) and persist natural dims only
  useEffect(() => {
    setPreviewImage(null);
    setImageDisplaySize({ w: 0, h: 0 });
    if (!node || !node.mediaType || !node.mediaSrc) return;

    const raw = node.mediaSrc || "";
    // For remote http(s) use proxy path to avoid CORS if needed
    let src = raw;
    try {
      if (/^https?:\/\//i.test(raw)) {
        src = `http://localhost:8000/proxy-image?url=${encodeURIComponent(raw)}`;
      }
    } catch (e) {}

    // branch by media type: video thumbnails (YouTube) get special handling
    let cancelled = false;
    if (node.mediaType === "video") {
      // try YouTube thumbnail first
      const youTubeMatch = (node.mediaSrc || "").match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{6,})/i);
      if (youTubeMatch) {
        const id = youTubeMatch[1];
        const thumbUrl = `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
        const img = new window.Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
          if (cancelled) return;
          const natW = img.naturalWidth || img.width || 1;
          const natH = img.naturalHeight || img.height || 1;
          const MAX_W = 300;
          const displayW = Math.min(MAX_W, natW);
          const displayH = Math.round((displayW * natH) / natW);
          setImageDisplaySize({ w: displayW, h: displayH });
          setPreviewImage(img);
          try {
            const changed = node.mediaNaturalWidth !== natW || node.mediaNaturalHeight !== natH;
            if (changed && onUpdateNode) onUpdateNode({ ...node, mediaNaturalWidth: natW, mediaNaturalHeight: natH });
          } catch (e) {}
        };
        img.onerror = () => {
          if (cancelled) return;
          setPreviewImage(null);
          setImageDisplaySize({ w: 0, h: 0 });
        };
        img.src = thumbUrl;
        return () => { cancelled = true; };
      }

      // fallback: try to capture first frame from a video blob or same-origin URL
      let videoEl = null;
      let canvas = null;
      const loadVideoFrame = async () => {
        try {
          videoEl = document.createElement('video');
          videoEl.muted = true;
          videoEl.playsInline = true;
          videoEl.crossOrigin = 'anonymous';
          videoEl.src = src;
          // wait for metadata / first frame
          await new Promise((res, rej) => {
            const onLoaded = () => { res(); };
            const onErr = (e) => { rej(e); };
            videoEl.addEventListener('loadeddata', onLoaded, { once: true });
            videoEl.addEventListener('error', onErr, { once: true });
          });
          if (cancelled) return;
          // seek to 0 and draw frame
          try {
            videoEl.currentTime = 0;
          } catch (e) {}
          canvas = document.createElement('canvas');
          canvas.width = videoEl.videoWidth || 320;
          canvas.height = videoEl.videoHeight || 180;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/png');
          const img = new window.Image();
          img.onload = () => {
            if (cancelled) return;
            const natW = img.naturalWidth || img.width || 1;
            const natH = img.naturalHeight || img.height || 1;
            const MAX_W = 300;
            const displayW = Math.min(MAX_W, natW);
            const displayH = Math.round((displayW * natH) / natW);
            setImageDisplaySize({ w: displayW, h: displayH });
            setPreviewImage(img);
            try {
              const changed = node.mediaNaturalWidth !== natW || node.mediaNaturalHeight !== natH;
              if (changed && onUpdateNode) onUpdateNode({ ...node, mediaNaturalWidth: natW, mediaNaturalHeight: natH });
            } catch (e) {}
          };
          img.onerror = () => { if (!cancelled) { setPreviewImage(null); setImageDisplaySize({ w: 0, h: 0 }); } };
          img.src = dataUrl;
        } catch (err) {
          if (!cancelled) {
            setPreviewImage(null);
            setImageDisplaySize({ w: 0, h: 0 });
          }
        }
      };
      loadVideoFrame();
      return () => {
        cancelled = true;
        try { if (videoEl) { videoEl.pause(); videoEl.src = ''; } } catch (e) {}
        try { if (canvas) canvas.remove(); } catch (e) {}
      };
    }

    // otherwise treat as an image (covers node.mediaType === 'image')
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (cancelled) return;
      const natW = img.naturalWidth || img.width || 1;
      const natH = img.naturalHeight || img.height || 1;
      const MAX_W = 300;
      const displayW = Math.min(MAX_W, natW);
      const displayH = Math.round((displayW * natH) / natW);
      setImageDisplaySize({ w: displayW, h: displayH });
      setPreviewImage(img);
      try {
        const changed = node.mediaNaturalWidth !== natW || node.mediaNaturalHeight !== natH;
        if (changed && onUpdateNode) onUpdateNode({ ...node, mediaNaturalWidth: natW, mediaNaturalHeight: natH });
      } catch (e) {}
    };
    img.onerror = () => {
      if (cancelled) return;
      setPreviewImage(null);
      setImageDisplaySize({ w: 0, h: 0 });
    };
    img.src = src;
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node.mediaType, node.mediaSrc]);

  const computeTextBlockHeight = (text, contentWidth, fontSize = 12) => {
    if (!text || !text.trim()) return 0;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    ctx.font = `${fontSize}px sans-serif`;
    const words = text.split(/\s+/);
    let lines = 0;
    let cur = "";
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      const test = cur.length ? `${cur} ${w}` : w;
      const tw = ctx.measureText(test).width;
      if (tw > contentWidth && cur.length > 0) {
        lines++;
        cur = w;
      } else {
        cur = test;
      }
    }
    if (cur.length) lines++;
    const lineHeight = Math.round(fontSize * 1.25);
    return lines * lineHeight;
  };

  const contentWidth = Math.max(40, (node && node.width ? node.width - 16 : 140));
  const textBlockHeight = computeTextBlockHeight(node && node.text ? node.text : "", contentWidth, 12);
  const mediaContentHeight = node && node.mediaType && (node.mediaType === "image" || node.mediaType === "video") ? (imageDisplaySize.h || 0) : (node && (node.mediaType === "audio" || node.mediaType === "pdf") ? 36 : 0);
  const mediaY = 36 + (textBlockHeight || 0) + (textBlockHeight ? 8 : 0);
  const mediaLabelY = mediaY + mediaContentHeight + 8;

  const getMediaRect = (w, h, localX = 8, localY = mediaY) => {
    try {
      const g = groupRef.current;
      if (!g) return { x: localX, y: localY, w: w || (node.width - 16), h: h || 90 };
      const abs = g.getAbsolutePosition();
      return { x: Math.round(abs.x + localX), y: Math.round(abs.y + localY), w: Math.round(w || (node.width - 16)), h: Math.round(h || 90) };
    } catch (e) {
      return { x: localX, y: localY, w: w || (node.width - 16), h: h || 90 };
    }
  };

  const toggleOverlayForNode = (type, src, rect) => {
    try {
      if (!type || !src) return;
      const existing = overlays && overlays[node.id];
      if (existing) {
        try { clearOverlay && clearOverlay(node.id); } catch (e) {}
      } else {
        const info = { id: node.id, type, src, rect };
        setOverlay && setOverlay(node.id, info);
      }
    } catch (e) {}
  };

  // simple inline editor using a DOM textarea (keeps parity with previous behavior)
  const startInlineEdit = (field) => (e) => {
    try {
      const stage = groupRef.current && groupRef.current.getStage ? groupRef.current.getStage() : null;
      if (!stage) return;
      if (e && e.cancelBubble !== undefined) e.cancelBubble = true;
      const containerRect = stage.container().getBoundingClientRect();
      const absPos = groupRef.current.getAbsolutePosition();
      const topOffset = field === "label" ? 8 : 36;
      const leftOffset = 8;
      const textarea = document.createElement("textarea");
      textarea.value = node[field] || "";
      textarea.style.position = "absolute";
      textarea.style.top = `${Math.round(containerRect.top + absPos.y + topOffset)}px`;
      textarea.style.left = `${Math.round(containerRect.left + absPos.x + leftOffset)}px`;
      textarea.style.width = `${Math.max(100, node.width - 16)}px`;
      textarea.style.minHeight = field === "label" ? `28px` : `60px`;
      textarea.style.fontSize = field === "label" ? `16px` : `13px`;
      textarea.style.padding = `6px 8px`;
      textarea.style.border = `1px solid #1976d2`;
      textarea.style.borderRadius = `6px`;
      textarea.style.background = `white`;
      textarea.style.zIndex = 999999;
      document.body.appendChild(textarea);
      textarea.focus();
      const remove = () => {
        if (textarea && textarea.parentNode) textarea.parentNode.removeChild(textarea);
        setTimeout(() => {
          try { stage.container().focus(); } catch (err) {}
        }, 20);
      };
      const commit = () => {
        const val = textarea.value;
        if (onUpdateNode) onUpdateNode({ ...node, [field]: val });
        remove();
      };
      textarea.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter" && field === "label") {
          ev.preventDefault();
          commit();
        } else if (ev.key === "Escape") {
          remove();
        }
      });
      textarea.addEventListener("blur", () => commit());
    } catch (err) {}
  };

  return (
    <Group
      ref={groupRef}
      x={node.x}
      y={node.y}
      draggable
      dragBoundFunc={(pos) => ({ x: Math.round(pos.x), y: Math.round(pos.y) })}
      onClick={(e) => { if (onNodeClick) onNodeClick(node.id, e); }}
      onMouseDown={(e) => {
        try {
          if (e.evt && e.evt.shiftKey) {
            const g = groupRef.current;
            if (g && g.draggable) try { g.draggable(false); } catch (err) {}
            e.cancelBubble = true;
            if (onStartConnect) onStartConnect(node.id);
          }
        } catch (err) {}
      }}
      onMouseUp={(e) => {
        try {
          const g = groupRef.current;
          if (g && g.draggable) try { g.draggable(true); } catch (err) {}
          if (e.evt && e.evt.shiftKey) {
            if (onCompleteConnect) onCompleteConnect(node.id);
            e.cancelBubble = true;
          }
        } catch (err) {}
      }}
      onDragMove={(e) => { if (onDragMove) onDragMove(node.id, e.target.x(), e.target.y()); }}
      onDragEnd={(e) => { try { const g = groupRef.current; if (g && g.draggable) try { g.draggable(true); } catch (err) {} } catch (err) {} onDragEnd(node.id, e.target.x(), e.target.y()); }}
    >
      <Rect
        width={node.width}
        height={node.expanded ? node.height : 40}
        fill={node.color}
        cornerRadius={10}
        stroke={isHighlighted ? "#1976d2" : "#6b6b6bff"}
        strokeWidth={isHighlighted ? 2 : 1}
      />

      <Text
        text={node.label}
        fontSize={16}
        fill="#000"
        align="left"
        width={node.width}
        padding={8}
        y={8}
        onDblClick={startInlineEdit("label")}
        onClick={(e) => {
          try { if (e && e.evt) { try { e.evt.preventDefault && e.evt.preventDefault(); } catch (err) {} try { e.evt.stopPropagation && e.evt.stopPropagation(); } catch (err) {} } } catch (err) {}
          if (onToggle) onToggle(!node.expanded);
          try { const g = groupRef.current; if (g) { try { g.stopDrag && g.stopDrag(); } catch (err) {} try { if (g.draggable) g.draggable(true); } catch (err) {} } const s = stageRef && stageRef.current; if (s && s.container) try { s.container().style.cursor = 'default'; } catch (err) {} } catch (err) {}
        }}
      />

      {node.expanded && (
        <Text
          text={node.text && node.text.length > 0 ? node.text : "Double-click to edit..."}
          fontSize={12}
          fill={node.text && node.text.length > 0 ? "#333" : "#9e9e9e"}
          width={node.width - 16}
          x={8}
          y={36}
          wrap="word"
          onDblClick={startInlineEdit("text")}
        />
      )}

      {node.expanded && (
        <>
          {node.mediaType === "image" && previewImage && (
            <KonvaImage
              image={previewImage}
              x={8}
              y={mediaY}
              width={imageDisplaySize.w || node.width - 16}
              height={imageDisplaySize.h || 56}
              listening={true}
              onClick={() => {
                try {
                  const rect = getMediaRect(imageDisplaySize.w || node.width - 16, imageDisplaySize.h || 56);
                  toggleOverlayForNode('image', node.mediaSrc, rect);
                } catch (e) {}
              }}
            />
          )}

          {node.mediaType === "video" && previewImage && (
            <>
              <KonvaImage
                image={previewImage}
                x={8}
                y={mediaY}
                width={imageDisplaySize.w || node.width - 16}
                height={imageDisplaySize.h || 120}
                listening={true}
                onClick={() => {
                  try {
                    const rect = getMediaRect(imageDisplaySize.w || node.width - 16, imageDisplaySize.h || 120);
                    toggleOverlayForNode('video', node.mediaSrc, rect);
                  } catch (e) {}
                }}
              />
              <Line
                points={[
                  8 + (imageDisplaySize.w || node.width - 16) / 2 - 10,
                  mediaY + (imageDisplaySize.h || 120) / 2 - 12,
                  8 + (imageDisplaySize.w || node.width - 16) / 2 - 10,
                  mediaY + (imageDisplaySize.h || 120) / 2 + 12,
                  8 + (imageDisplaySize.w || node.width - 16) / 2 + 12,
                  mediaY + (imageDisplaySize.h || 120) / 2,
                ]}
                closed
                fill="#ffffff"
                opacity={0.95}
                stroke="rgba(0,0,0,0.2)"
                strokeWidth={1}
              />
            </>
          )}

          {node.mediaType === "audio" && (
            <Text text={"Audio attached"} fontSize={12} fill="#555" x={8} y={mediaY} onClick={() => {
              try {
                const rect = getMediaRect(Math.max(160, node.width - 16), 40);
                toggleOverlayForNode('audio', node.mediaSrc, rect);
              } catch (e) {}
            }} />
          )}

          {node.mediaType === "pdf" && (
            <Text text={"PDF attached"} fontSize={12} fill="#555" x={8} y={mediaY} onClick={() => {
              try {
                const rect = getMediaRect(Math.max(260, node.width - 16), 320);
                toggleOverlayForNode('pdf', node.mediaSrc, rect);
              } catch (e) {}
            }} />
          )}

          <Text
            text={`Media: ${node.mediaType || "none"}`}
            fontSize={12}
            fill="#555"
            x={8}
            y={mediaLabelY}
          />
        </>
      )}
    </Group>
  );
}
