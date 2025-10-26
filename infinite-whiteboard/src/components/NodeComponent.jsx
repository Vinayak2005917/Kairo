import React, { useRef, useEffect, useState } from "react";
import { Group, Rect, Text, Image as KonvaImage, Line } from "react-konva";

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
  const [imageDisplaySize, setImageDisplaySize] = useState({ w: 0, h: 0 });
  const audioOverlayRef = useRef(null);
  const videoOverlayRef = useRef(null);

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
      removeVideoOverlay();
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

    // For remote http(s) media, prefer proxying through the backend to avoid
    // CORS problems. If mediaSrc is a blob URL or same-origin, use it directly.
    const rawSrc = node.mediaSrc || "";
    let src = rawSrc;
    try {
      if (/^https?:\/\//i.test(rawSrc)) {
        // proxy through backend
        src = `http://localhost:8000/proxy-image?url=${encodeURIComponent(rawSrc)}`;
      }
    } catch (e) {
      src = rawSrc;
    }
    if (node.mediaType === "image") {
      // Fetch the image as a blob and create an object URL — this avoids
      // subtle issues with using proxied URLs or crossOrigin image loading
      // directly on Image.src which sometimes triggers onerror despite 200 OK.
      const controller = new AbortController();
      let objectUrl = null;
      const loadBlob = async () => {
        try {
          const res = await fetch(src, { signal: controller.signal });
          console.log("proxy fetch", src, "status", res.status, "ctype", res.headers.get("content-type"));
          if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
          const blob = await res.blob();
          console.log("fetched blob", blob.type, blob.size);
          // ensure blob is an image
          if (!blob.type || !blob.type.startsWith("image/")) {
            console.warn("Fetched resource is not an image for node", node.id, blob.type);
            setPreviewImage(null);
            return;
          }
          objectUrl = URL.createObjectURL(blob);
          const img = new window.Image();
          img.onload = () => {
            // compute display size preserving aspect ratio
            const natW = img.naturalWidth || img.width || 1;
            const natH = img.naturalHeight || img.height || 1;
            const PAD_X = 16; // left+right padding inside node
            const MAX_IMAGE_DISPLAY_WIDTH = 260; // cap to keep nodes reasonable (smaller preview)
            // if image is wider than current node, expand node width up to cap
            let newWidth = node.width || 180;
            if (natW + PAD_X > newWidth) {
              newWidth = Math.min(natW + PAD_X, MAX_IMAGE_DISPLAY_WIDTH + PAD_X);
            }
            const displayW = Math.min(newWidth - PAD_X, natW, MAX_IMAGE_DISPLAY_WIDTH);
            const displayH = Math.round((displayW * natH) / natW);

            // compute new node height to fit label/text + image + media label area
            const LABEL_AREA = 36; // space for label + text top area
            const MEDIA_LABEL_AREA = 28; // space for Media: line and bottom padding
            const newHeight = Math.max(node.height || 100, LABEL_AREA + displayH + MEDIA_LABEL_AREA + 8);

            setImageDisplaySize({ w: displayW, h: displayH });
            // persist new node size if changed
            if (onUpdateNode) {
              const changed = (newWidth !== node.width) || (newHeight !== node.height);
              if (changed) onUpdateNode({ ...node, width: newWidth, height: newHeight });
            }
            setPreviewImage(img);
          };
          img.onerror = (err) => {
            console.warn("Failed to load image for node", node.id, src, err);
            setPreviewImage(null);
            setImageDisplaySize({ w: 0, h: 0 });
          };
          img.src = objectUrl;
        } catch (err) {
          if (err.name === 'AbortError') return;
          console.warn("Failed to fetch image for node", node.id, src, err);
          setPreviewImage(null);
        }
      };
      loadBlob();

      return () => {
        controller.abort();
        if (objectUrl) {
          try { URL.revokeObjectURL(objectUrl); } catch (e) {}
        }
      };
    } else if (node.mediaType === "video") {
      // If this is a YouTube link, fetch the thumbnail and show as an image preview.
      const youTubeMatch = (rawSrc || "").match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{6,})/i);
      if (youTubeMatch) {
        const id = youTubeMatch[1];
        const thumbUrl = `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
        const controller = new AbortController();
        let objectUrl = null;
        const loadThumb = async () => {
          try {
            const res = await fetch(thumbUrl, { signal: controller.signal });
            if (!res.ok) throw new Error(`thumb fetch failed: ${res.status}`);
            const blob = await res.blob();
            if (!blob.type || !blob.type.startsWith("image/")) {
              setPreviewImage(null);
              return;
            }
            objectUrl = URL.createObjectURL(blob);
            const img = new window.Image();
            img.onload = () => {
              const natW = img.naturalWidth || img.width || 1;
              const natH = img.naturalHeight || img.height || 1;
              const PAD_X = 16;
              const MAX_IMAGE_DISPLAY_WIDTH = 260;
              let newWidth = node.width || 180;
              if (natW + PAD_X > newWidth) {
                newWidth = Math.min(natW + PAD_X, MAX_IMAGE_DISPLAY_WIDTH + PAD_X);
              }
              const displayW = Math.min(newWidth - PAD_X, natW, MAX_IMAGE_DISPLAY_WIDTH);
              const displayH = Math.round((displayW * natH) / natW);
              setImageDisplaySize({ w: displayW, h: displayH });
              setPreviewImage(img);
            };
            img.onerror = () => setPreviewImage(null);
            img.src = objectUrl;
          } catch (err) {
            if (err.name === 'AbortError') return;
            setPreviewImage(null);
          }
        };
        loadThumb();
        return () => {
          controller.abort();
          if (objectUrl) try { URL.revokeObjectURL(objectUrl); } catch (e) {}
        };
      }
    } else if (node.mediaType === "audio") {
      createAudioOverlay(src);
    }

    return () => {
      // cleanup for this effect
      removeVideoOverlay();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node.mediaType, node.mediaSrc]);

  // Auto-size node to fit label, text and media content when expanded.
  useEffect(() => {
    try {
      if (!node) return;
      // Only auto-resize for expanded nodes. When collapsed, the app's collapse
      // handler will control width/height (keeps UI predictable).
      if (!node.expanded) return;

      const PADDING_X = 16; // left + right total
      const MIN_WIDTH = 140;
      const MAX_WIDTH = 600;

      const LABEL_FONT = 16;
      const TEXT_FONT = 12;

      // helper: measure text width using canvas 2D context
      const measureTextWidth = (txt, fontSize, fontFamily = "Arial") => {
        try {
          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d");
          ctx.font = `${fontSize}px ${fontFamily}`;
          const metrics = ctx.measureText(txt || "");
          return Math.ceil(metrics.width || 0);
        } catch (e) {
          return 0;
        }
      };

      // compute label width (single line)
      const labelWidth = measureTextWidth(node.label || "", LABEL_FONT) + PADDING_X;

      // compute text width: compute the max line width among lines (respect existing newlines)
      const textRaw = node.text || "";
      const textLines = textRaw.split(/\r?\n/);
      let maxTextLineWidth = 0;
      for (const line of textLines) {
        const w = measureTextWidth(line, TEXT_FONT);
        if (w > maxTextLineWidth) maxTextLineWidth = w;
      }
      // add padding
      const textNeededWidth = Math.min(MAX_WIDTH, Math.max(maxTextLineWidth + PADDING_X, MIN_WIDTH));

      // media width (if image/video) — prefer measured display size from state
      const mediaWidth = (node.mediaType === "image" || node.mediaType === "video") ? (imageDisplaySize.w || 0) + PADDING_X : 0;

      // desired width is the max of label/text/media required widths
      let desiredWidth = Math.max(labelWidth, textNeededWidth, mediaWidth, MIN_WIDTH);
      desiredWidth = Math.min(desiredWidth, MAX_WIDTH);

      // compute heights
      const labelHeight = Math.round(LABEL_FONT * 1.4) + 8; // small padding above/below

      // for text height, simulate wrapping by using desired content width
      const wrapWidth = Math.max(40, desiredWidth - PADDING_X);
      const words = textRaw.split(/\s+/);
      const lineHeight = Math.round(TEXT_FONT * 1.25);
      let lines = 0;
      if (!textRaw || textRaw.trim().length === 0) {
        lines = 0; // no content — placeholder only
      } else {
        // naive word-wrap
        let cur = "";
        for (let i = 0; i < words.length; i++) {
          const w = words[i];
          const test = cur.length ? `${cur} ${w}` : w;
          const testWidth = measureTextWidth(test, TEXT_FONT);
          if (testWidth > wrapWidth && cur.length > 0) {
            lines++;
            cur = w;
          } else {
            cur = test;
          }
        }
        if (cur.length) lines++;
      }
      const textHeight = Math.max(0, lines * lineHeight);

      // media height: use imageDisplaySize.h for images; for video use a small fixed height; for audio/pdf use a small label area
      let mediaContentHeight = 0;
      if (node.mediaType === "image") mediaContentHeight = imageDisplaySize.h || 0;
  else if (node.mediaType === "video") mediaContentHeight = 120; // smaller preview height for video
      else if (node.mediaType === "audio" || node.mediaType === "pdf") mediaContentHeight = 36;

      const MEDIA_LABEL_AREA = 28; // bottom area with the `Media: ...` label

      const calculatedHeight = Math.max(node.height || 100, labelHeight + textHeight + mediaContentHeight + MEDIA_LABEL_AREA + 16);

      // only persist if there's a meaningful change to avoid loops
      const roundedDesiredWidth = Math.round(desiredWidth);
      const roundedDesiredHeight = Math.round(calculatedHeight);
      const widthChanged = Math.abs((node.width || 0) - roundedDesiredWidth) > 2;
      const heightChanged = Math.abs((node.height || 0) - roundedDesiredHeight) > 2;
      if ((widthChanged || heightChanged) && onUpdateNode) {
        onUpdateNode({ ...node, width: roundedDesiredWidth, height: roundedDesiredHeight });
      }
    } catch (e) {
      // swallow — sizing is best-effort
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node.label, node.text, node.mediaType, imageDisplaySize?.w, imageDisplaySize?.h, node.expanded]);

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

  const createVideoOverlay = (src) => {
    removeVideoOverlay();
    const stage = stageRef.current;
    if (!stage || !groupRef.current) return;
    const containerRect = stage.container().getBoundingClientRect();
    const absPos = groupRef.current.getAbsolutePosition();

    const wrapper = document.createElement("div");
    wrapper.style.position = "absolute";
    wrapper.style.zIndex = 999998;
    wrapper.style.left = `${Math.round(containerRect.left + absPos.x + 8)}px`;
    wrapper.style.top = `${Math.round(containerRect.top + absPos.y + 60)}px`;
    wrapper.style.background = "rgba(0,0,0,0)";
    wrapper.style.padding = "0px";
    wrapper.style.borderRadius = "6px";

    const width = Math.max(120, (imageDisplaySize.w || (node.width - 16)));
    const height = Math.max(90, (imageDisplaySize.h || 120));
    wrapper.style.width = `${width}px`;
    wrapper.style.height = `${height}px`;

  // detect YouTube links and embed via iframe (also accept embed URLs)
  const youTubeMatch = (src || "").match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([A-Za-z0-9_-]{6,})/i);
    if (youTubeMatch) {
      const id = youTubeMatch[1];
      const iframe = document.createElement("iframe");
      iframe.src = `https://www.youtube.com/embed/${id}`;
      iframe.width = String(width);
      iframe.height = String(height);
      iframe.frameBorder = "0";
      iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
      iframe.allowFullscreen = true;
      wrapper.appendChild(iframe);
    } else {
      // create a native video element for direct video URLs or blob URLs
      const video = document.createElement("video");
      video.src = src;
      video.controls = true;
      video.autoplay = false;
      video.muted = false;
      video.playsInline = true;
      video.style.width = "100%";
      video.style.height = "100%";
      video.style.display = "block";
      wrapper.appendChild(video);
    }

    document.body.appendChild(wrapper);
    videoOverlayRef.current = wrapper;
  };

  const removeVideoOverlay = () => {
    const existing = videoOverlayRef.current;
    if (existing && existing.parentNode) {
      existing.parentNode.removeChild(existing);
    }
    videoOverlayRef.current = null;
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
              y={36}
              width={imageDisplaySize.w || node.width - 16}
              height={imageDisplaySize.h || 56}
              listening={false}
            />
          )}
          {node.mediaType === "image" && !previewImage && (
            <Text text={"Image failed to load"} fontSize={12} fill="#b71c1c" x={8} y={node.height - 68} />
          )}

          {node.mediaType === "video" && previewImage && (
            <>
              <KonvaImage
                image={previewImage}
                x={8}
                y={36}
                width={imageDisplaySize.w || node.width - 16}
                height={imageDisplaySize.h || 120}
                listening={true}
                onClick={() => {
                  try {
                    // open overlay with the original mediaSrc (playable)
                    createVideoOverlay(node.mediaSrc);
                  } catch (e) {}
                }}
              />
              {/* Play icon: simple triangle */}
              <Line
                points={[
                  8 + (imageDisplaySize.w || node.width - 16) / 2 - 10,
                  36 + (imageDisplaySize.h || 120) / 2 - 12,
                  8 + (imageDisplaySize.w || node.width - 16) / 2 - 10,
                  36 + (imageDisplaySize.h || 120) / 2 + 12,
                  8 + (imageDisplaySize.w || node.width - 16) / 2 + 12,
                  36 + (imageDisplaySize.h || 120) / 2,
                ]}
                closed
                fill="#ffffff"
                opacity={0.95}
                stroke="rgba(0,0,0,0.2)"
                strokeWidth={1}
              />
            </>
          )}
          {node.mediaType === "video" && !previewImage && (
            <Text text={"Video attached (double-click to change)"} fontSize={12} fill="#555" x={8} y={node.height - 68} />
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
