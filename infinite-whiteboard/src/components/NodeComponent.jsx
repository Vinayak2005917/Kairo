  // auto-resize removed; relying on fixed collapsed/expanded sizes managed elsewhere

  const computeTextBlockHeight = (text, contentWidth, fontSize = 12) => {
    if (!text || !text.trim()) return 0;
    const font = `${fontSize}px sans-serif`;
    const words = text.split(/\s+/);
    let lines = 0;
    let cur = '';
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      const test = cur.length ? `${cur} ${w}` : w;
      const tw = measureTextWidth(test, font);
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
  try { clearOverlay && clearOverlay(node.id); } catch (e) {}

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
            // persist only natural dimensions (do not auto-resize node)
            if (onUpdateNode) {
              const changedMediaDims = node.mediaNaturalWidth !== natW || node.mediaNaturalHeight !== natH;
              if (changedMediaDims) onUpdateNode({ ...node, mediaNaturalWidth: natW, mediaNaturalHeight: natH });
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
              // persist only natural dimensions for thumbnail; do not auto-resize
              if (onUpdateNode) {
                const changedMediaDims = node.mediaNaturalWidth !== natW || node.mediaNaturalHeight !== natH;
                if (changedMediaDims) onUpdateNode({ ...node, mediaNaturalWidth: natW, mediaNaturalHeight: natH });
              }
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
      // audio preview is shown as a text label inside node; overlay can be opened by user action (double-click media)
      // do not auto-create DOM overlays here — overlays are managed via MediaOverlayContext
      // when a user attaches an audio file (blob URL), expand node to show a small control area
      try {
        // do not auto-resize for audio attachments; keep node size stable
        // we could persist metadata here in the future if needed
      } catch (e) {}
      return;
    }
    // end of media preview effect
  }, [node.mediaType, node.mediaSrc]);

  // overlays are managed via MediaOverlayContext; manual DOM overlays removed


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

  // compute text and media positions so media doesn't overlap text
  const contentWidth = Math.max(40, (node && node.width ? node.width - 16 : 140));
  const textBlockHeight = computeTextBlockHeight(node && node.text ? node.text : '', contentWidth, 12);
  const mediaContentHeight = (node && node.mediaType === 'image') ? (imageDisplaySize.h || 0) : (node && node.mediaType === 'video' ? (imageDisplaySize.h || 120) : (node && (node.mediaType === 'audio' || node.mediaType === 'pdf') ? 36 : 0));
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
              if (e && e.evt) {
                try { e.evt.preventDefault && e.evt.preventDefault(); } catch (err) {}
                try { e.evt.stopPropagation && e.evt.stopPropagation(); } catch (err) {}
              }
          } catch (err) {}
            if (onToggle) onToggle(!node.expanded);
            // ensure we are not left in a dragging state after toggling
            try {
              const g = groupRef.current;
              if (g) {
                try { g.stopDrag && g.stopDrag(); } catch (err) {}
                try { if (g.draggable) g.draggable(true); } catch (err) {}
              }
              const s = stageRef.current;
              if (s && s.container) {
                try { s.container().style.cursor = 'default'; } catch (err) {}
              }
            } catch (err) {}
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
          {node.mediaType === "image" && !previewImage && (
            <Text text={"Image failed to load"} fontSize={12} fill="#b71c1c" x={8} y={mediaY} />
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
              {/* Play icon: simple triangle */}
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
          {node.mediaType === "video" && !previewImage && (
            <Text text={"Video attached (double-click to change)"} fontSize={12} fill="#555" x={8} y={mediaY} />
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
            onDblClick={onDoubleClickMedia}
          />
        </>
      )}
    </Group>
  );
}
