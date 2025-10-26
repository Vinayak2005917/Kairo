import React, { useRef, useEffect, useState } from "react";
import { Group, Rect, Text, Image as KonvaImage } from "react-konva";

export default function NodeComponent({
  node,
  onDragEnd,
  onDragMove,
  registerRef,
  onToggle,
  onStartConnect,
  onCompleteConnect,
  onNodeClick,
  isHighlighted,
  onUpdateNode,
}) {
  const groupRef = useRef(null);
  const stageRef = useRef(null);
  const [previewImage, setPreviewImage] = useState(null);
  const [previewVideo, setPreviewVideo] = useState(null);
  const audioOverlayRef = useRef(null);

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
      // cleanup any overlays
      removeAudioOverlay();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registerRef]);

  useEffect(() => {
    const g = groupRef.current;
    stageRef.current = g && g.getStage ? g.getStage() : null;
  }, []);

  // Build media previews depending on mediaType
  useEffect(() => {
    // cleanup previous
    setPreviewImage(null);
    if (previewVideo) {
      try {
        previewVideo.pause && previewVideo.pause();
        previewVideo.src && (previewVideo.src = "");
      } catch (e) {}
      setPreviewVideo(null);
    }
    removeAudioOverlay();

    if (!node || !node.mediaType || !node.mediaSrc) return;

    const src = node.mediaSrc;
    if (node.mediaType === "image") {
      const img = new window.Image();
      img.crossOrigin = "Anonymous";
      img.src = src;
      img.onload = () => setPreviewImage(img);
      img.onerror = () => setPreviewImage(null);
    } else if (node.mediaType === "video") {
      const vid = document.createElement("video");
      vid.src = src;
      vid.loop = true;
      vid.muted = true;
      vid.playsInline = true;
      vid.preload = "metadata";
      vid.style.display = "none";
      document.body.appendChild(vid);
      vid.play().catch(() => {});
      setPreviewVideo(vid);
    } else if (node.mediaType === "audio") {
      createAudioOverlay(src);
    }

    return () => {
      // cleanup for this effect
      if (previewVideo) {
        try {
          previewVideo.pause && previewVideo.pause();
          previewVideo.src && (previewVideo.src = "");
          if (previewVideo.parentNode) previewVideo.parentNode.removeChild(previewVideo);
        } catch (e) {}
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node.mediaType, node.mediaSrc]);

  // create a small audio control overlay positioned on top of the node
  const createAudioOverlay = (src) => {
    removeAudioOverlay();
    const stage = stageRef.current;
    if (!stage || !groupRef.current) return;
    const containerRect = stage.container().getBoundingClientRect();
    const absPos = groupRef.current.getAbsolutePosition();

    const wrapper = document.createElement("div");
    wrapper.style.position = "absolute";
    wrapper.style.zIndex = 999998;
    wrapper.style.left = `${Math.round(containerRect.left + absPos.x + 8)}px`;
    wrapper.style.top = `${Math.round(containerRect.top + absPos.y + 60)}px`;
    wrapper.style.background = "rgba(255,255,255,0.95)";
    wrapper.style.border = "1px solid #ddd";
    wrapper.style.padding = "6px";
    wrapper.style.borderRadius = "6px";

    const audio = document.createElement("audio");
    audio.controls = true;
    audio.src = src;
    audio.style.display = "block";
    wrapper.appendChild(audio);

    document.body.appendChild(wrapper);
    audioOverlayRef.current = wrapper;
  };

  const removeAudioOverlay = () => {
    const existing = audioOverlayRef.current;
    if (existing && existing.parentNode) {
      existing.parentNode.removeChild(existing);
    }
    audioOverlayRef.current = null;
  };

  // generic inline editor for label/text
  const startInlineEdit = (field, opts = {}) => (e) => {
    try {
      const stage = groupRef.current && groupRef.current.getStage ? groupRef.current.getStage() : null;
      if (!stage) return;

      if (e && e.cancelBubble !== undefined) e.cancelBubble = true;
      const containerRect = stage.container().getBoundingClientRect();
      const absPos = groupRef.current.getAbsolutePosition();

      // position depends on field
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
      textarea.style.lineHeight = `16px`;
      textarea.style.padding = `6px 8px`;
      textarea.style.border = `1px solid #1976d2`;
      textarea.style.borderRadius = `6px`;
      textarea.style.background = `white`;
      textarea.style.zIndex = 999999;
      textarea.style.resize = "vertical";
      textarea.style.overflow = "auto";

      document.body.appendChild(textarea);
      textarea.focus();

      const remove = () => {
        if (textarea && textarea.parentNode) textarea.parentNode.removeChild(textarea);
        window.removeEventListener("resize", onWindowResize);
        setTimeout(() => {
          try { stage.container().focus(); } catch (err) {}
        }, 20);
      };


      const commit = () => {
        const val = textarea.value;
        if (onUpdateNode) {
          onUpdateNode({ ...node, [field]: val });
        }
        remove();
      };

      // live-update for text field so user sees changes immediately
      const onInput = (ev) => {
        if (field !== "label") {
          if (onUpdateNode) onUpdateNode({ ...node, [field]: textarea.value });
        }
      };

      const onKeyDown = (ev) => {
        if (ev.key === "Enter" && field === "label") {
          ev.preventDefault();
          commit();
        } else if (ev.key === "Escape") {
          remove();
        }
      };

      const onClickOutside = (ev) => {
        if (ev.target === textarea) return;
        commit();
      };

      const onWindowResize = () => remove();

      textarea.addEventListener("keydown", onKeyDown);
      textarea.addEventListener("input", onInput);
      setTimeout(() => window.addEventListener("click", onClickOutside), 20);
      window.addEventListener("resize", onWindowResize);
      // ensure blur also commits for text (but not for label where Enter is used)
      textarea.addEventListener("blur", () => {
        if (field !== "label") commit();
      });
    } catch (err) {
      // swallow
    }
  };

  // media change flow: choose type, then file upload or URL input
  const handleMediaChange = (type) => {
    if (type === "none") {
      onUpdateNode({ ...node, mediaType: "none", mediaSrc: "" });
      return;
    }

    const accept =
      type === "image"
        ? "image/*"
        : type === "video"
        ? "video/*"
        : type === "audio"
        ? "audio/*"
        : type === "pdf"
        ? "application/pdf"
        : "*";

    // ask user whether to upload a file or provide URL
    const wantUrl = window.confirm("Do you want to provide a URL for the media? (Cancel to upload a file)");
    if (wantUrl) {
      const url = window.prompt("Enter media URL:", "");
      if (url) {
        onUpdateNode({ ...node, mediaType: type, mediaSrc: url });
      }
    } else {
      const fileInput = document.createElement("input");
      fileInput.type = "file";
      fileInput.accept = accept;
      fileInput.onchange = (e) => {
        const file = e.target.files && e.target.files[0];
        if (file) {
          const url = URL.createObjectURL(file);
          onUpdateNode({ ...node, mediaType: type, mediaSrc: url });
        }
      };
      fileInput.click();
    }
  };

  // show a small select when user double clicks media area
  const onDoubleClickMedia = (e) => {
    try {
      const stage = groupRef.current && groupRef.current.getStage ? groupRef.current.getStage() : null;
      if (!stage) return;
      const containerRect = stage.container().getBoundingClientRect();
      const absPos = groupRef.current.getAbsolutePosition();

      const sel = document.createElement("select");
      ["none", "image", "video", "audio", "pdf"].forEach((t) => {
        const o = document.createElement("option");
        o.value = t;
        o.textContent = t === "none" ? "None" : t.charAt(0).toUpperCase() + t.slice(1);
        if (t === node.mediaType) o.selected = true;
        sel.appendChild(o);
      });
      sel.style.position = "absolute";
      sel.style.left = `${Math.round(containerRect.left + absPos.x + 8)}px`;
      sel.style.top = `${Math.round(containerRect.top + absPos.y + node.height - 36)}px`;
      sel.style.zIndex = 999999;
      sel.onchange = (ev) => {
        handleMediaChange(ev.target.value);
        if (sel.parentNode) sel.parentNode.removeChild(sel);
      };
      document.body.appendChild(sel);
      sel.focus();
      const onClickOutside = (ev) => {
        if (ev.target === sel) return;
        if (sel.parentNode) sel.parentNode.removeChild(sel);
        window.removeEventListener("click", onClickOutside);
      };
      setTimeout(() => window.addEventListener("click", onClickOutside), 20);
    } catch (err) {}
  };

  // drag / click / connect handlers
  return (
    <Group
      ref={groupRef}
      draggable
      dragBoundFunc={(pos) => ({ x: Math.round(pos.x), y: Math.round(pos.y) })}
      onClick={(e) => {
        // Only forward clicks to parent handler (selection/connection). Do NOT toggle expand/collapse here.
        if (onNodeClick) {
          onNodeClick(node.id, e);
        }
      }}
      onDblClick={() => {}}
      onMouseDown={(e) => {
        try {
          if (e.evt && e.evt.shiftKey) {
            const g = groupRef.current;
            if (g && g.draggable) {
              try {
                g.draggable(false);
              } catch (err) {}
            }
            e.cancelBubble = true;
            if (onStartConnect) onStartConnect(node.id);
          }
        } catch (err) {}
      }}
      onMouseUp={(e) => {
        try {
          const g = groupRef.current;
          if (g && g.draggable) {
            try {
              g.draggable(true);
            } catch (err) {}
          }
          if (e.evt && e.evt.shiftKey) {
            if (onCompleteConnect) onCompleteConnect(node.id);
            e.cancelBubble = true;
          }
        } catch (err) {}
      }}
      onDragMove={(e) => {
        if (onDragMove) onDragMove(node.id, e.target.x(), e.target.y());
      }}
      onDragEnd={(e) => {
        try {
          const g = groupRef.current;
          if (g && g.draggable) {
            try {
              g.draggable(true);
            } catch (err) {}
          }
        } catch (err) {}
        onDragEnd(node.id, e.target.x(), e.target.y());
      }}
    >
      <Rect
        width={node.width}
        height={node.expanded ? node.height : 40}
        fill={node.color}
        cornerRadius={10}
        stroke={isHighlighted ? "#1976d2" : "#6b6b6bff"}
        strokeWidth={isHighlighted ? 2 : 1}
      />

      {/* Label zone (always visible) */}
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
          // stop propagation to group and toggle only when label is clicked
          try {
            if (e && e.evt && e.evt.stopPropagation) e.evt.stopPropagation();
          } catch (err) {}
          if (onToggle) onToggle(!node.expanded);
        }}
      />

      {/* Text zone (shows placeholder when empty) */}
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

      {/* Media zone: preview + media label, dblclick to change */}
      {node.expanded && (
        <>
          {node.mediaType === "image" && previewImage && (
            <KonvaImage
              image={previewImage}
              x={8}
              y={node.height - 68}
              width={node.width - 16}
              height={56}
              listening={false}
            />
          )}

          {node.mediaType === "video" && previewVideo && (
            <KonvaImage
              image={previewVideo}
              x={8}
              y={node.height - 68}
              width={node.width - 16}
              height={56}
              listening={false}
            />
          )}

          {node.mediaType === "audio" && (
            <Text text={"Audio attached"} fontSize={12} fill="#555" x={8} y={node.height - 60} />
          )}

          {node.mediaType === "pdf" && (
            <Text text={"PDF attached"} fontSize={12} fill="#555" x={8} y={node.height - 60} />
          )}

          <Text
            text={`Media: ${node.mediaType || "none"}`}
            fontSize={12}
            fill="#555"
            x={8}
            y={node.height - 20}
            onDblClick={onDoubleClickMedia}
          />
        </>
      )}
    </Group>
  );
}
