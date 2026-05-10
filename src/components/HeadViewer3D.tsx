import React, { useEffect, useRef } from 'react';
import { SkinViewer } from 'skinview3d';

interface HeadViewer3DProps {
  skinUrl: string;
  width?: number;
  height?: number;
}

const HeadViewer3D: React.FC<HeadViewer3DProps> = ({
  skinUrl,
  width = 40,
  height = 40,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewerRef = useRef<SkinViewer | null>(null);

  useEffect(() => {
    if (!canvasRef.current || !skinUrl || skinUrl.length < 10) {
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
        skin: skinUrl,
      });

      viewer.autoRotate = false;
      viewer.zoom = 1;
      viewer.fov = 50;

      const playerWrapper = (viewer as any).playerWrapper;
      if (playerWrapper) {
        playerWrapper.position.y = -4;
      }

      const playerObj = (viewer as any).playerObject;
      if (playerObj) {
        playerObj.skin.visible = false;
        playerObj.body.visible = false;
        playerObj.cape.visible = false;
        playerObj.elytra.visible = false;
        playerObj.ears.visible = false;
        if (playerObj.leftArm) playerObj.leftArm.visible = false;
        if (playerObj.rightArm) playerObj.rightArm.visible = false;
        if (playerObj.leftLeg) playerObj.leftLeg.visible = false;
        if (playerObj.rightLeg) playerObj.rightLeg.visible = false;
        playerObj.head.visible = true;
      }

      viewerRef.current = viewer;
    } catch (error) {
      console.error('Failed to initialize head viewer:', error);
    }

    return () => {
      if (viewerRef.current) {
        viewerRef.current.dispose();
        viewerRef.current = null;
      }
    };
  }, [skinUrl, width, height]);

  if (!skinUrl || skinUrl.length < 10) {
    return (
      <div
        style={{
          width: width,
          height: height,
          background: '#27272a',
          borderRadius: '0.5rem',
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
        borderRadius: '0.5rem',
        background: '#121214',
      }}
    />
  );
};

export default HeadViewer3D;