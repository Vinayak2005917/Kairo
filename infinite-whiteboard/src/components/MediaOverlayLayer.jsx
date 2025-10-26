import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMediaOverlay } from './MediaOverlayContext';

// Renders overlays (video/pdf/audio) in a single React-managed DOM layer
export default function MediaOverlayLayer({ stageRef }) {
  const { overlays } = useMediaOverlay();
  const [tick, setTick] = useState(0); // used to rerender on stage changes

  useEffect(() => {
    const stage = stageRef && stageRef.current;
    if (!stage) return;

    const onChange = () => setTick((t) => t + 1);
    stage.on && stage.on('wheel', onChange);
    stage.on && stage.on('dragmove', onChange);
    stage.on && stage.on('transform', onChange);
    window.addEventListener('resize', onChange);
    window.addEventListener('scroll', onChange);

    return () => {
      stage.off && stage.off('wheel', onChange);
      stage.off && stage.off('dragmove', onChange);
      stage.off && stage.off('transform', onChange);
      window.removeEventListener('resize', onChange);
      window.removeEventListener('scroll', onChange);
    };
  }, [stageRef]);

  // render nothing if no overlays
  if (!stageRef || !stageRef.current) return null;

  const stage = stageRef.current;
  const containerRect = stage.container().getBoundingClientRect();
  const scale = stage.scaleX() || 1;
  const stagePos = stage.position();

  const overlayRoot = document.body; // portal into body so we can absolutely position

  const nodes = Object.values(overlays || {});

  const elements = (
    <div style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none' }}>
      {nodes.map((o) => {
        if (!o || !o.type || !o.src) return null;
        // o.rect is in stage coordinates { x,y,w,h }
        const sx = (o.rect && o.rect.x) || 0;
        const sy = (o.rect && o.rect.y) || 0;
        const sw = (o.rect && o.rect.w) || (o.w || 120);
        const sh = (o.rect && o.rect.h) || (o.h || 90);

        const left = Math.round(containerRect.left + stagePos.x + sx * scale);
        const top = Math.round(containerRect.top + stagePos.y + sy * scale);
        const widthPx = Math.max(80, Math.round(sw * scale));
        const heightPx = Math.max(48, Math.round(sh * scale));

        const style = {
          position: 'absolute',
          left: left + 'px',
          top: top + 'px',
          width: widthPx + 'px',
          height: heightPx + 'px',
          zIndex: 99999,
          pointerEvents: 'auto',
          background: 'transparent',
          overflow: 'hidden',
          borderRadius: 6,
        };

        if (o.type === 'video') {
          // detect youtube links
          const isYouTube = /(?:youtube\.com|youtu\.be)/i.test(o.src);
          return (
            <div key={o.id} style={style}>
              {isYouTube ? (
                <iframe
                  src={o.src.includes('watch?v=') ? o.src.replace('watch?v=', 'embed/') : o.src}
                  width="100%"
                  height="100%"
                  frameBorder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  title={`video-${o.id}`}
                  style={{ border: 0 }}
                />
              ) : (
                <video src={o.src} width="100%" height="100%" controls style={{ display: 'block' }} />
              )}
            </div>
          );
        }

        if (o.type === 'audio') {
          return (
            <div key={o.id} style={style}>
              <audio src={o.src} controls style={{ width: '100%' }} />
            </div>
          );
        }

        if (o.type === 'pdf') {
          return (
            <div key={o.id} style={style}>
              <iframe src={o.src} width="100%" height="100%" title={`pdf-${o.id}`} />
            </div>
          );
        }

        if (o.type === 'image') {
          return (
            <div key={o.id} style={style}>
              <img src={o.src} alt={`img-${o.id}`} style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
            </div>
          );
        }

        return null;
      })}
    </div>
  );

  return createPortal(elements, overlayRoot);
}
