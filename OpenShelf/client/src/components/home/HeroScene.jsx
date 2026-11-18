import { Suspense, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Float, ContactShadows, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';

function Book({ position, rotation = [0, 0, 0], scale = 1, color = '#0769D7', delay = 0 }) {
  const group = useRef();
  useFrame((state) => {
    if (!group.current) return;
    group.current.rotation.y = rotation[1] + Math.sin(state.clock.elapsedTime * 0.42 + delay) * 0.12;
  });
  return (
    <group ref={group} position={position} rotation={rotation} scale={scale}>
      <mesh castShadow position={[0, 0, 0]}>
        <boxGeometry args={[1.15, 1.55, 0.16]} />
        <meshStandardMaterial color={color} roughness={0.48} metalness={0.18} />
      </mesh>
      <mesh position={[0.59, 0, 0.015]}>
        <boxGeometry args={[0.055, 1.46, 0.145]} />
        <meshStandardMaterial color="#FFF9E6" roughness={0.9} />
      </mesh>
      <mesh position={[-0.02, 0, 0.087]}>
        <boxGeometry args={[0.78, 0.012, 0.008]} />
        <meshBasicMaterial color="#FFFFFF" />
      </mesh>
      <mesh position={[-0.02, -0.12, 0.087]}>
        <boxGeometry args={[0.5, 0.009, 0.008]} />
        <meshBasicMaterial color="#E9DDAF" />
      </mesh>
    </group>
  );
}

function SceneContents() {
  const group = useRef();
  const particles = useMemo(() => Array.from({ length: 70 }, (_, i) => ({
    position: [(Math.random() - 0.5) * 9, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 4 - 1],
    size: 0.012 + Math.random() * 0.018,
    key: i,
  })), []);
  useFrame((state) => {
    if (!group.current) return;
    group.current.rotation.y = THREE.MathUtils.lerp(group.current.rotation.y, (state.pointer.x || 0) * 0.12, 0.035);
    group.current.rotation.x = THREE.MathUtils.lerp(group.current.rotation.x, -(state.pointer.y || 0) * 0.07, 0.035);
  });
  return (
    <group ref={group}>
      <ambientLight intensity={1.15} />
      <directionalLight position={[4, 5, 6]} intensity={2.2} color="#FFFFFF" castShadow />
      <pointLight position={[-4, 1, 2]} intensity={35} color="#0769D7" />
      <pointLight position={[3, -2, -1]} intensity={22} color="#0758AD" />
      <Float speed={1.2} rotationIntensity={0.12} floatIntensity={0.35}>
        <Book position={[0.15, 0.05, 0.2]} rotation={[-0.12, -0.45, 0.12]} scale={1.28} color="#0758AD" />
      </Float>
      <Float speed={1.7} rotationIntensity={0.2} floatIntensity={0.65}><Book position={[-2.0, 1.05, -1.2]} rotation={[0.2, 0.5, -0.3]} scale={0.55} color="#0769D7" delay={1.2} /></Float>
      <Float speed={1.4} rotationIntensity={0.2} floatIntensity={0.5}><Book position={[2.0, -1.05, -0.9]} rotation={[-0.2, 0.8, 0.25]} scale={0.62} color="#0758AD" delay={2.4} /></Float>
      {particles.map((p) => <mesh key={p.key} position={p.position}><sphereGeometry args={[p.size, 8, 8]} /><meshBasicMaterial color="#E9DDAF" transparent opacity={0.7} /></mesh>)}
      <ContactShadows position={[0, -2.05, 0]} opacity={0.32} scale={8} blur={2.5} far={4} />
    </group>
  );
}

export default function HeroScene() {
  return <div className="hero-scene" aria-label="Three dimensional floating books illustration" role="img">
    <Canvas shadows dpr={[1, 1.6]} gl={{ antialias: true, alpha: true }}>
      <PerspectiveCamera makeDefault position={[0, 0, 7.4]} fov={38} />
      <Suspense fallback={null}><SceneContents /></Suspense>
    </Canvas>
    <div className="scene-label scene-label-top"><span className="scene-label-dot" /> A WORLD OF IDEAS</div>
    <div className="scene-label scene-label-bottom">TURN THE PAGE <span>✦</span></div>
  </div>;
}
