import React, { useRef, useEffect, useState, useCallback, Suspense, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Float } from '@react-three/drei';
import * as THREE from 'three';
import ChibiModel from './ChibiModel';
import MascotBrain from './MascotBrain';

/* ═══════════════════════════════════════════════════════════
   SparkleParticles — magical sparkle effect around mascot
   ═══════════════════════════════════════════════════════════ */
function SparkleParticles({ active }) {
  const ref = useRef();
  const count = 18;

  const [positions, velocities] = useMemo(() => {
    const p = new Float32Array(count * 3);
    const v = [];
    for (let i = 0; i < count; i++) {
      p[i * 3] = (Math.random() - 0.5) * 1.2;
      p[i * 3 + 1] = (Math.random() - 0.5) * 1.5;
      p[i * 3 + 2] = (Math.random() - 0.5) * 0.5;
      v.push({
        vx: (Math.random() - 0.5) * 0.3,
        vy: 0.2 + Math.random() * 0.4,
        vz: (Math.random() - 0.5) * 0.1,
        life: Math.random(),
      });
    }
    return [p, v];
  }, []);

  useFrame((_, dt) => {
    if (!ref.current || !active) return;
    const geo = ref.current.geometry;
    const pos = geo.attributes.position.array;
    for (let i = 0; i < count; i++) {
      const vel = velocities[i];
      vel.life += dt * 0.4;
      if (vel.life > 1) vel.life = 0;
      pos[i * 3] += vel.vx * dt;
      pos[i * 3 + 1] += vel.vy * dt;
      pos[i * 3 + 2] += vel.vz * dt;
      // reset when too high
      if (pos[i * 3 + 1] > 1.0) {
        pos[i * 3] = (Math.random() - 0.5) * 1.2;
        pos[i * 3 + 1] = -0.5;
        pos[i * 3 + 2] = (Math.random() - 0.5) * 0.5;
        vel.life = 0;
      }
    }
    geo.attributes.position.needsUpdate = true;
  });

  if (!active) return null;

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={count} array={positions} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial size={0.04} color="#ff9de0" transparent opacity={0.8} sizeAttenuation depthWrite={false} />
    </points>
  );
}

/* ═══════════════════════════════════════════════════════════
   SceneContent — inner R3F scene
   ═══════════════════════════════════════════════════════════ */
function SceneContent({ brain }) {
  const groupRef = useRef();
  const lightRef = useRef();
  const clock = useRef({ elapsed: 0, last: performance.now() });

  useFrame(() => {
    const now = performance.now();
    const dt = Math.min((now - clock.current.last) / 1000, 0.1);
    clock.current.last = now;
    clock.current.elapsed += dt;
    brain.update(dt);

    if (groupRef.current) {
      // convert normalised pos (0-1) to screen-space NDC (-1 to 1)
      const x = (brain.pos.x - 0.5) * 3.0;
      const y = -(brain.pos.y - 0.5) * 3.0;
      groupRef.current.position.x = THREE.MathUtils.lerp(groupRef.current.position.x, x, 0.04);
      groupRef.current.position.y = THREE.MathUtils.lerp(groupRef.current.position.y, y, 0.04);
    }

    // subtle light follow
    if (lightRef.current) {
      lightRef.current.position.x = brain.mouseNDC[0] * 2;
      lightRef.current.position.y = brain.mouseNDC[1] * 2;
    }
  });

  return (
    <>
      {/* Lights */}
      <ambientLight intensity={0.6} />
      <directionalLight ref={lightRef} position={[2, 3, 5]} intensity={1.2} color="#fff5f0" />
      <pointLight position={[-1, -1, 3]} intensity={0.4} color="#8b5ad5" distance={8} />

      <group ref={groupRef}>
        <Float speed={2} rotationIntensity={0.15} floatIntensity={0.3} floatingRange={[-0.02, 0.02]}>
          <ChibiModel
            mouseNDC={brain.mouseNDC}
            blink={brain.blink}
            breathe={brain.breathe}
            state={brain.state}
          />
        </Float>
        <SparkleParticles active={brain.state === 'fly'} />
      </group>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════
   SpeechBubble — comic-book style overlay
   ═══════════════════════════════════════════════════════════ */
function SpeechBubble({ text, mascotX, mascotY, onDismiss }) {
  if (!text) return null;

  // position bubble above the mascot
  const left = `${Math.min(Math.max(mascotX * 100, 5), 60)}%`;
  const top = `${Math.max(mascotY * 100 - 12, 2)}%`;

  return (
    <div
      className="mascot-bubble"
      style={{ left, top }}
      onClick={(e) => { e.stopPropagation(); onDismiss(); }}
    >
      {/* SFX decorations */}
      <span className="mascot-bubble-sfx">✦</span>
      <p className="mascot-bubble-text">{text}</p>
      <span className="mascot-bubble-sfx" style={{ right: '8px', bottom: '4px', fontSize: '14px' }}>!</span>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   AnimeMascot — main export component
   Fixed overlay with R3F canvas + speech bubble
   ═══════════════════════════════════════════════════════════ */
export default function AnimeMascot() {
  const brainRef = useRef(null);
  const [dialogue, setDialogue] = useState(null);
  const [mascotPos, setMascotPos] = useState({ x: 0.65, y: 0.7 });
  const [mounted, setMounted] = useState(false);
  const tickRef = useRef(null);

  useEffect(() => {
    if (!brainRef.current) {
      brainRef.current = new MascotBrain();
    }
    brainRef.current.init();

    // poll brain state at 30fps for React state sync
    tickRef.current = setInterval(() => {
      const b = brainRef.current;
      if (!b) return;
      if (b.currentDialogue !== dialogue) setDialogue(b.currentDialogue);
      setMascotPos({ x: b.pos.x, y: b.pos.y });
    }, 33);

    // small delay to ensure smooth mount
    setTimeout(() => setMounted(true), 500);

    return () => {
      clearInterval(tickRef.current);
      brainRef.current?.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dismissDialogue = useCallback(() => {
    if (brainRef.current) brainRef.current.dismissDialogue();
    setDialogue(null);
  }, []);

  // Expose hover methods via global so App can call them
  useEffect(() => {
    window.__mascotHover = (section) => brainRef.current?.onHoverSection(section);
    window.__mascotClick = () => brainRef.current?.onClickMascot();
    return () => { delete window.__mascotHover; delete window.__mascotClick; };
  }, []);

  if (!mounted) return null;

  return (
    <div className="mascot-overlay" style={{ pointerEvents: 'none' }}>
      {/* R3F Canvas — transparent background, pointer-events pass-through */}
      <div className="mascot-canvas-wrap">
        <Canvas
          orthographic
          camera={{ zoom: 80, near: 0.1, far: 100, position: [0, 0, 10] }}
          style={{ background: 'transparent' }}
          gl={{ alpha: true, antialias: true, powerPreference: 'low-power' }}
          dpr={Math.min(window.devicePixelRatio, 2)}
          frameloop="always"
        >
          <Suspense fallback={null}>
            <SceneContent brain={brainRef.current} />
          </Suspense>
        </Canvas>
        {/* Clickable area over mascot */}
        <div
          className="mascot-hitbox"
          style={{
            left: `${mascotPos.x * 100 - 5}%`,
            top: `${mascotPos.y * 100 - 5}%`,
            pointerEvents: 'auto',
          }}
          onClick={() => brainRef.current?.onClickMascot()}
        />
      </div>

      {/* Speech bubble — highest z-index */}
      <SpeechBubble
        text={dialogue}
        mascotX={mascotPos.x}
        mascotY={mascotPos.y}
        onDismiss={dismissDialogue}
      />
    </div>
  );
}
