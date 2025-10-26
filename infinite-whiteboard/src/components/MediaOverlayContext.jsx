import React, { createContext, useState, useCallback, useContext } from 'react';

const MediaOverlayContext = createContext(null);

export function MediaOverlayProvider({ children }) {
  // overlays is a map: id -> overlayInfo
  const [overlays, setOverlays] = useState({});

  const setOverlay = useCallback((id, info) => {
    setOverlays((prev) => {
      if (!info) {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      }
      return { ...prev, [id]: info };
    });
  }, []);

  const clearOverlay = useCallback((id) => setOverlays((prev) => {
    const copy = { ...prev };
    delete copy[id];
    return copy;
  }), []);

  return (
    <MediaOverlayContext.Provider value={{ overlays, setOverlay, clearOverlay }}>
      {children}
    </MediaOverlayContext.Provider>
  );
}

export function useMediaOverlay() {
  const ctx = useContext(MediaOverlayContext);
  if (!ctx) throw new Error('useMediaOverlay must be used within MediaOverlayProvider');
  return ctx;
}

export default MediaOverlayContext;
