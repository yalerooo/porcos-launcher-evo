import React, { useEffect, useRef, useState } from 'react';
import { SkinViewer, WalkingAnimation } from 'skinview3d';
import { Play, Pause, RotateCw } from 'lucide-react';

interface SkinViewer3DProps {
  skinUrl: string;
  capeUrl?: string | null;
  width?: number;
  height?: number;
}

const SkinViewer3D: React.FC<SkinViewer3DProps> = ({
  skinUrl,
  capeUrl,
  width = 260,
  height = 340,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewerRef = useRef<SkinViewer | null>(null);
  const animationRef = useRef<WalkingAnimation | null>(null);

  const [isWalking, setIsWalking] = useState(true);
  const [isRotating, setIsRotating] = useState(true);

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

      viewer.autoRotate = isRotating;
      viewer.autoRotateSpeed = 1;
      viewer.zoom = 0.8;
      viewer.fov = 50;

      if (capeUrl && capeUrl.length > 10) {
        try {
          viewer.loadCape(capeUrl);
        } catch (capeError) {
          console.warn('Failed to load cape:', capeError);
        }
      }

      const animation = new WalkingAnimation();
      animation.speed = 1;
      animation.paused = !isWalking;
      viewer.animation = animation;
      animationRef.current = animation;

      viewerRef.current = viewer;
    } catch (error) {
      console.error('Failed to initialize skin viewer:', error);
    }

    return () => {
      if (viewerRef.current) {
        viewerRef.current.dispose();
        viewerRef.current = null;
      }
    };
  }, [skinUrl, capeUrl, width, height, isWalking, isRotating]);

  const toggleWalking = () => {
    if (animationRef.current) {
      animationRef.current.paused = !isWalking;
    }
    setIsWalking(!isWalking);
  };

  const toggleRotating = () => {
    if (viewerRef.current) {
      viewerRef.current.autoRotate = !isRotating;
    }
    setIsRotating(!isRotating);
  };

  if (!skinUrl || skinUrl.length < 10) {
    return (
      <div
        style={{
          width: '100%',
          maxWidth: width,
          height: height,
          borderRadius: '0.75rem',
          background: 'linear-gradient(180deg, #1a1a2e 0%, #16213e 50%, #0f0f23 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#71717a',
          fontSize: '0.875rem',
        }}
      >
        Loading...
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: width }}>
      <div
        style={{
          position: 'absolute',
          top: '0.5rem',
          right: '0.5rem',
          display: 'flex',
          gap: '0.25rem',
          zIndex: 10,
        }}
      >
        <button
          onClick={toggleWalking}
          style={{
            width: '28px',
            height: '28px',
            borderRadius: '0.375rem',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: isWalking ? '#ffbfba' : '#71717a',
          }}
          title={isWalking ? 'Stop walking' : 'Start walking'}
        >
          {isWalking ? <Pause size={14} /> : <Play size={14} />}
        </button>
        <button
          onClick={toggleRotating}
          style={{
            width: '28px',
            height: '28px',
            borderRadius: '0.375rem',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: isRotating ? '#ffbfba' : '#71717a',
          }}
          title={isRotating ? 'Stop rotating' : 'Start rotating'}
        >
          <RotateCw size={14} />
        </button>
      </div>
      <canvas
        ref={canvasRef}
        style={{
          width: '100%',
          maxWidth: width,
          height: height,
          borderRadius: '0.75rem',
          background: 'linear-gradient(180deg, #1a1a2e 0%, #16213e 50%, #0f0f23 100%)',
        }}
      />
    </div>
  );
};

export default SkinViewer3D;