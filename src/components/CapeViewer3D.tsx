import React, { useEffect, useRef } from 'react';
import { SkinViewer } from 'skinview3d';

interface CapeViewer3DProps {
  capeUrl: string;
  width?: number;
  height?: number;
}

const CapeViewer3D: React.FC<CapeViewer3DProps> = ({
  capeUrl,
  width = 40,
  height = 52,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewerRef = useRef<SkinViewer | null>(null);

  useEffect(() => {
    if (!canvasRef.current || !capeUrl || capeUrl.length < 10) {
      return;
    }

    if (viewerRef.current) {
      viewerRef.current.dispose();
      viewerRef.current = null;
    }

    try {
      const viewer = new SkinViewer({
        canvas: canvasRef.current,
        width,
        height,
        skin: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      });

      viewer.autoRotate = false;
      viewer.zoom = 2.5;
      viewer.fov = 10;

      if ((viewer as any).controls) {
        (viewer as any).controls.enableZoom = false;
        (viewer as any).controls.enableRotate = false;
      }

      (viewer as any).playerWrapper.rotation.y = Math.PI;

      try {
        viewer.loadCape(capeUrl);
      } catch (capeError) {
        console.warn('Failed to load cape:', capeError);
      }

      viewerRef.current = viewer;
    } catch (error) {
      console.error('Failed to initialize cape viewer:', error);
    }

    return () => {
      if (viewerRef.current) {
        viewerRef.current.dispose();
        viewerRef.current = null;
      }
    };
  }, [capeUrl, width, height]);

  if (!capeUrl || capeUrl.length < 10) {
    return (
      <div
        style={{
          width: width,
          height: height,
          background: '#121214',
          borderRadius: '0.25rem',
        }}
      />
    );
  }

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: width,
        height: height,
        borderRadius: '0.25rem',
        background: '#121214',
      }}
    />
  );
};

export default CapeViewer3D;