import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

/* ── colour palette ────────────────────────────────────────── */
const SKIN   = '#fce4c8';
const HAIR   = '#ff6b9d';
const HAIR_D = '#d94a7e';
const EYE_W  = '#ffffff';
const IRIS_L = '#64d8ff';
const IRIS_R = '#ff6baa';
const BLUSH  = '#ffb3b3';
const OUTFIT = '#7c5cff';
const OUTFIT2= '#9b7aff';
const SHOE   = '#3a2a5c';
const WHITE  = '#ffffff';

/* ── helpers ──────────────────────────────────────────────── */
function m(ref, x, y, z) { ref.current?.position.set(x, y, z); }

/* ════════════════════════════════════════════════════════════
   ChibiModel  — fully procedural anime chibi character
   props:
     mouseNDC     — normalized mouse [-1,1] for eye/head tracking
     blink        — 0‒1 blink factor (0 = open, 1 = closed)
     breathe      — 0‒1 sine-wave breathing cycle
     state        — 'idle' | 'walk' | 'sit' | 'fly'
     tint         — subtle colour tint from background
   ════════════════════════════════════════════════════════════ */
export default function ChibiModel({
  mouseNDC = [0, 0],
  blink = 0,
  breathe = 0,
  state = 'idle',
  tint = '#000000',
}) {
  const groupRef = useRef();
  const headRef = useRef();
  const bodyRef = useRef();
  const lEyeRef = useRef();
  const rEyeRef = useRef();
  const lArmRef = useRef();
  const rArmRef = useRef();
  const lLegRef = useRef();
  const rLegRef = useRef();
  const skirtRef = useRef();

  /* ── materials (memoised) ─────────────────────────────── */
  const mat = useMemo(() => {
    const skinMat  = new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.55, metalness: 0 });
    const hairMat  = new THREE.MeshStandardMaterial({ color: HAIR, roughness: 0.35, metalness: 0.05 });
    const hairD    = new THREE.MeshStandardMaterial({ color: HAIR_D, roughness: 0.4, metalness: 0.05 });
    const eyeW     = new THREE.MeshStandardMaterial({ color: EYE_W, roughness: 0.3 });
    const irisMat  = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.2, metalness: 0.1, emissive: c, emissiveIntensity: 0.15 });
    const pupil    = new THREE.MeshStandardMaterial({ color: '#1a1a2e', roughness: 0.3 });
    const blushMat = new THREE.MeshStandardMaterial({ color: BLUSH, transparent: true, opacity: 0.35, roughness: 1 });
    const outfit   = new THREE.MeshStandardMaterial({ color: OUTFIT, roughness: 0.4, metalness: 0.05 });
    const outfit2  = new THREE.MeshStandardMaterial({ color: OUTFIT2, roughness: 0.5, metalness: 0.05 });
    const shoe     = new THREE.MeshStandardMaterial({ color: SHOE, roughness: 0.5, metalness: 0.1 });
    const white    = new THREE.MeshStandardMaterial({ color: WHITE, roughness: 0.3 });
    return { skinMat, hairMat, hairD, eyeW, irisMat, pupil, blushMat, outfit, outfit2, shoe, white };
  }, []);

  /* ── per-frame animation ───────────────────────────────── */
  useFrame((_, dt) => {
    if (!groupRef.current) return;
    const t = performance.now() * 0.001;

    // breathing (subtle body scale)
    const breathScale = 1 + Math.sin(t * 2.5) * 0.012;
    if (bodyRef.current) {
      bodyRef.current.scale.set(1, breathScale, 1);
      bodyRef.current.position.y = 0.15 + Math.sin(t * 2.5) * 0.008;
    }

    // head tracks mouse
    if (headRef.current) {
      headRef.current.rotation.y = THREE.MathUtils.lerp(headRef.current.rotation.y, mouseNDC[0] * 0.35, 0.08);
      headRef.current.rotation.x = THREE.MathUtils.lerp(headRef.current.rotation.x, -mouseNDC[1] * 0.2, 0.08);
      headRef.current.rotation.z = Math.sin(t * 1.2) * 0.03;
    }

    // blink
    if (lEyeRef.current) {
      const s = Math.max(0.05, 1 - blink);
      lEyeRef.current.scale.y = THREE.MathUtils.lerp(lEyeRef.current.scale.y, s, 0.15);
      rEyeRef.current.scale.y = lEyeRef.current.scale.y;
    }

    // arm swing / wing flap
    if (state === 'walk') {
      if (lArmRef.current) lArmRef.current.rotation.z = Math.sin(t * 6) * 0.5;
      if (rArmRef.current) rArmRef.current.rotation.z = -Math.sin(t * 6) * 0.5;
      if (lLegRef.current) lLegRef.current.rotation.x = Math.sin(t * 6) * 0.4;
      if (rLegRef.current) rLegRef.current.rotation.x = -Math.sin(t * 6) * 0.4;
    } else if (state === 'fly') {
      if (lArmRef.current) lArmRef.current.rotation.z = Math.sin(t * 3) * 1.2 - 0.5;
      if (rArmRef.current) rArmRef.current.rotation.z = -Math.sin(t * 3) * 1.2 + 0.5;
    } else if (state === 'sit') {
      if (lArmRef.current) lArmRef.current.rotation.z = 0.15;
      if (rArmRef.current) rArmRef.current.rotation.z = -0.15;
      if (lLegRef.current) lLegRef.current.rotation.x = -0.9;
      if (rLegRef.current) rLegRef.current.rotation.x = 0.3;
    } else {
      // idle
      if (lArmRef.current) lArmRef.current.rotation.z = Math.sin(t * 1.5) * 0.08;
      if (rArmRef.current) rArmRef.current.rotation.z = -Math.sin(t * 1.5) * 0.08;
      if (lLegRef.current) lLegRef.current.rotation.x = 0;
      if (rLegRef.current) rLegRef.current.rotation.x = 0;
    }

    // fly bobbing
    if (state === 'fly') {
      groupRef.current.position.y = Math.sin(t * 2) * 0.08;
    }

    // tap glass animation (rotate whole body)
    if (state === 'tap') {
      groupRef.current.rotation.z = Math.sin(t * 8) * 0.12;
    } else {
      groupRef.current.rotation.z = THREE.MathUtils.lerp(groupRef.current.rotation.z, 0, 0.05);
    }
  });

  return (
    <group ref={groupRef} scale={0.55} position={[0, 0, 0]}>
      {/* ─── BODY ─── */}
      <group ref={bodyRef} position={[0, 0.15, 0]}>
        {/* Torso / outfit */}
        <mesh material={mat.outfit}>
          <capsuleGeometry args={[0.28, 0.35, 8, 16]} />
        </mesh>

        {/* Collar ribbon */}
        <mesh material={mat.white} position={[0, 0.48, 0.18]}>
          <sphereGeometry args={[0.08, 8, 8]} />
        </mesh>

        {/* Skirt */}
        <group ref={skirtRef}>
          <mesh material={mat.outfit2} position={[0, -0.12, 0]}>
            <cylinderGeometry args={[0.18, 0.38, 0.25, 16]} />
          </mesh>
        </group>

        {/* Blush L */}
        <mesh material={mat.blushMat} position={[-0.2, 0.32, 0.22]}>
          <circleGeometry args={[0.07, 16]} />
        </mesh>
        {/* Blush R */}
        <mesh material={mat.blushMat} position={[0.2, 0.32, 0.22]}>
          <circleGeometry args={[0.07, 16]} />
        </mesh>

        {/* ─── ARMS ─── */}
        {/* Left arm */}
        <group ref={lArmRef} position={[-0.34, 0.3, 0]} rotation={[0, 0, 0.1]}>
          <mesh material={mat.outfit} position={[0, -0.15, 0]}>
            <capsuleGeometry args={[0.06, 0.2, 6, 8]} />
          </mesh>
          <mesh material={mat.skinMat} position={[0, -0.32, 0]}>
            <sphereGeometry args={[0.06, 8, 8]} />
          </mesh>
        </group>
        {/* Right arm */}
        <group ref={rArmRef} position={[0.34, 0.3, 0]} rotation={[0, 0, -0.1]}>
          <mesh material={mat.outfit} position={[0, -0.15, 0]}>
            <capsuleGeometry args={[0.06, 0.2, 6, 8]} />
          </mesh>
          <mesh material={mat.skinMat} position={[0, -0.32, 0]}>
            <sphereGeometry args={[0.06, 8, 8]} />
          </mesh>
        </group>

        {/* ─── LEGS ─── */}
        {/* Left leg */}
        <group ref={lLegRef} position={[-0.12, -0.3, 0]}>
          <mesh material={mat.skinMat} position={[0, -0.15, 0]}>
            <capsuleGeometry args={[0.06, 0.18, 6, 8]} />
          </mesh>
          <mesh material={mat.shoe} position={[0, -0.3, 0.02]}>
            <capsuleGeometry args={[0.065, 0.08, 6, 8]} />
          </mesh>
        </group>
        {/* Right leg */}
        <group ref={rLegRef} position={[0.12, -0.3, 0]}>
          <mesh material={mat.skinMat} position={[0, -0.15, 0]}>
            <capsuleGeometry args={[0.06, 0.18, 6, 8]} />
          </mesh>
          <mesh material={mat.shoe} position={[0, -0.3, 0.02]}>
            <capsuleGeometry args={[0.065, 0.08, 6, 8]} />
          </mesh>
        </group>
      </group>

      {/* ─── HEAD ─── */}
      <group ref={headRef} position={[0, 0.85, 0]}>
        {/* Head sphere */}
        <mesh material={mat.skinMat}>
          <sphereGeometry args={[0.32, 24, 24]} />
        </mesh>

        {/* ── Hair back (main volume) ── */}
        <mesh material={mat.hairMat} position={[0, 0.05, -0.08]} scale={[1.15, 1.1, 1.05]}>
          <sphereGeometry args={[0.36, 24, 24]} />
        </mesh>

        {/* Hair side-left */}
        <mesh material={mat.hairD} position={[-0.26, -0.08, 0.06]} rotation={[0, 0, 0.2]}>
          <capsuleGeometry args={[0.1, 0.32, 8, 8]} />
        </mesh>
        {/* Hair side-right */}
        <mesh material={mat.hairD} position={[0.26, -0.08, 0.06]} rotation={[0, 0, -0.2]}>
          <capsuleGeometry args={[0.1, 0.32, 8, 8]} />
        </mesh>

        {/* Hair bangs (front fringe) */}
        <mesh material={mat.hairMat} position={[0, 0.12, 0.25]} scale={[1.3, 0.7, 0.5]}>
          <sphereGeometry args={[0.3, 16, 16]} />
        </mesh>

        {/* Ahoge (antenna hair) */}
        <mesh material={mat.hairMat} position={[0.05, 0.4, 0]}>
          <cylinderGeometry args={[0.015, 0.005, 0.2, 6]} />
        </mesh>

        {/* Cat ears (decorative) */}
        <group position={[-0.22, 0.32, -0.02]} rotation={[0, 0, 0.4]}>
          <mesh material={mat.hairMat}>
            <coneGeometry args={[0.08, 0.14, 4]} />
          </mesh>
          <mesh material={mat.blushMat} position={[0, -0.02, 0.04]}>
            <coneGeometry args={[0.05, 0.08, 4]} />
          </mesh>
        </group>
        <group position={[0.22, 0.32, -0.02]} rotation={[0, 0, -0.4]}>
          <mesh material={mat.hairMat}>
            <coneGeometry args={[0.08, 0.14, 4]} />
          </mesh>
          <mesh material={mat.blushMat} position={[0, -0.02, 0.04]}>
            <coneGeometry args={[0.05, 0.08, 4]} />
          </mesh>
        </group>

        {/* ── EYES ── */}
        {/* Left eye white */}
        <group ref={lEyeRef} position={[-0.12, 0.02, 0.27]}>
          <mesh material={mat.eyeW}>
            <sphereGeometry args={[0.085, 16, 16]} />
          </mesh>
          {/* Left iris */}
          <mesh material={mat.irisMat(IRIS_L)} position={[0, -0.01, 0.05]}>
            <sphereGeometry args={[0.055, 16, 16]} />
          </mesh>
          {/* Left pupil */}
          <mesh material={mat.pupil} position={[0, -0.01, 0.08]}>
            <sphereGeometry args={[0.03, 12, 12]} />
          </mesh>
          {/* Left eye highlight */}
          <mesh material={mat.white} position={[0.025, 0.025, 0.085]}>
            <sphereGeometry args={[0.015, 8, 8]} />
          </mesh>
          {/* Left eye sparkle */}
          <mesh material={mat.white} position={[-0.02, -0.015, 0.075]}>
            <sphereGeometry args={[0.008, 8, 8]} />
          </mesh>
        </group>
        {/* Right eye white */}
        <group ref={rEyeRef} position={[0.12, 0.02, 0.27]}>
          <mesh material={mat.eyeW}>
            <sphereGeometry args={[0.085, 16, 16]} />
          </mesh>
          {/* Right iris */}
          <mesh material={mat.irisMat(IRIS_R)} position={[0, -0.01, 0.05]}>
            <sphereGeometry args={[0.055, 16, 16]} />
          </mesh>
          {/* Right pupil */}
          <mesh material={mat.pupil} position={[0, -0.01, 0.08]}>
            <sphereGeometry args={[0.03, 12, 12]} />
          </mesh>
          {/* Right eye highlight */}
          <mesh material={mat.white} position={[0.025, 0.025, 0.085]}>
            <sphereGeometry args={[0.015, 8, 8]} />
          </mesh>
          {/* Right eye sparkle */}
          <mesh material={mat.white} position={[-0.02, -0.015, 0.075]}>
            <sphereGeometry args={[0.008, 8, 8]} />
          </mesh>
        </group>

        {/* Mouth (small cute smile) */}
        <mesh position={[0, -0.12, 0.3]} rotation={[0.2, 0, 0]}>
          <torusGeometry args={[0.025, 0.008, 8, 16, Math.PI]} />
          <meshStandardMaterial color="#e88" roughness={0.5} />
        </mesh>
      </group>
    </group>
  );
}
