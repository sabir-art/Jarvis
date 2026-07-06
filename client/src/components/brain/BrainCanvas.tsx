import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, OrbitControls, Stars } from "@react-three/drei";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { useJarvis } from "../../state";
import type { BrainNode } from "../../types";
import { computeLayout, NODE_COLORS, TYPE_LABELS } from "./layout";

/**
 * Le cerveau-sphère : graphe de connaissance rendu en WebGL.
 * - Vue macro : hubs lumineux + constellation de nœuds reliés par des arcs.
 * - Zoom sémantique : en s'approchant, les étiquettes des nœuds proches apparaissent.
 * - Clic sur un nœud : la caméra « vole » jusqu'à lui et ouvre le détail.
 */

function useLayout() {
  const nodes = useJarvis((s) => s.nodes);
  return useMemo(() => computeLayout(nodes), [nodes]);
}

/** Rotation lente de l'ensemble, en pause quand un nœud est sélectionné. */
function SpinGroup({ children }: { children: React.ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  const selected = useJarvis((s) => s.selectedNodeId);
  useFrame((_, delta) => {
    if (ref.current && !selected) ref.current.rotation.y += delta * 0.04;
  });
  return (
    <group ref={ref} name="brain-root">
      {children}
    </group>
  );
}

function Edges({ positions }: { positions: Map<string, THREE.Vector3> }) {
  const edges = useJarvis((s) => s.edges);
  const geometry = useMemo(() => {
    const pts: number[] = [];
    for (const e of edges) {
      const a = positions.get(e.source);
      const b = positions.get(e.target);
      if (!a || !b) continue;
      pts.push(a.x, a.y, a.z, b.x, b.y, b.z);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, [edges, positions]);

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial
        color="#2fa8d8"
        transparent
        opacity={0.22}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </lineSegments>
  );
}

function Hubs({ positions }: { positions: Map<string, THREE.Vector3> }) {
  const nodes = useJarvis((s) => s.nodes);
  const selectNode = useJarvis((s) => s.selectNode);
  const hubs = nodes.filter((n) => n.type === "hub");
  return (
    <>
      {hubs.map((h) => (
        <Hub key={h.id} node={h} position={positions.get(h.id) ?? new THREE.Vector3()} onSelect={() => selectNode(h.id)} />
      ))}
    </>
  );
}

function Hub({ node, position, onSelect }: { node: BrainNode; position: THREE.Vector3; onSelect: () => void }) {
  const ref = useRef<THREE.Mesh>(null);
  const seed = useMemo(() => Math.random() * Math.PI * 2, []);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const s = 1 + Math.sin(clock.elapsedTime * 1.6 + seed) * 0.12;
    ref.current.scale.setScalar(s);
  });
  return (
    <group position={position}>
      <mesh
        ref={ref}
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
        onPointerOver={() => (document.body.style.cursor = "pointer")}
        onPointerOut={() => (document.body.style.cursor = "default")}
      >
        <sphereGeometry args={[0.55, 24, 24]} />
        <meshBasicMaterial color="#8ff0ff" toneMapped={false} />
      </mesh>
      {/* halo */}
      <mesh scale={2.1}>
        <sphereGeometry args={[0.55, 16, 16]} />
        <meshBasicMaterial color="#57e6ff" transparent opacity={0.08} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      <Html center position={[0, 1.05, 0]} zIndexRange={[2, 0]}>
        <div className="hub-label">{node.label}</div>
      </Html>
    </group>
  );
}

function NodeCloud({ positions }: { positions: Map<string, THREE.Vector3> }) {
  const nodes = useJarvis((s) => s.nodes);
  const selectNode = useJarvis((s) => s.selectNode);
  const selectedId = useJarvis((s) => s.selectedNodeId);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const meshRef = useRef<THREE.InstancedMesh>(null);

  const others = useMemo(() => nodes.filter((n) => n.type !== "hub"), [nodes]);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    others.forEach((n, i) => {
      const p = positions.get(n.id);
      dummy.position.copy(p ?? new THREE.Vector3());
      const scale = n.id === selectedId ? 1.7 : n.id === hoverId ? 1.4 : 1;
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, color.set(NODE_COLORS[n.type] ?? "#57e6ff"));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [others, positions, hoverId, selectedId]);

  const hoverNode = hoverId ? others.find((n) => n.id === hoverId) : null;
  const hoverPos = hoverNode ? positions.get(hoverNode.id) : null;

  if (others.length === 0) return null;

  return (
    <>
      <instancedMesh
        key={others.length}
        ref={meshRef}
        args={[undefined as unknown as THREE.BufferGeometry, undefined as unknown as THREE.Material, others.length]}
        onClick={(e) => {
          e.stopPropagation();
          if (e.instanceId !== undefined) selectNode(others[e.instanceId].id);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          if (e.instanceId !== undefined) {
            setHoverId(others[e.instanceId].id);
            document.body.style.cursor = "pointer";
          }
        }}
        onPointerOut={() => {
          setHoverId(null);
          document.body.style.cursor = "default";
        }}
      >
        <sphereGeometry args={[0.26, 14, 14]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>

      {hoverNode && hoverPos && (
        <Html center position={[hoverPos.x, hoverPos.y + 0.7, hoverPos.z]} zIndexRange={[3, 0]}>
          <div className="node-label">{hoverNode.label}</div>
        </Html>
      )}
    </>
  );
}

/** Zoom sémantique : étiquettes des nœuds proches quand la caméra plonge. */
function NearLabels({ positions }: { positions: Map<string, THREE.Vector3> }) {
  const nodes = useJarvis((s) => s.nodes);
  const [visible, setVisible] = useState<BrainNode[]>([]);
  const frame = useRef(0);
  const { camera, scene } = useThree();

  useFrame(() => {
    frame.current++;
    if (frame.current % 20 !== 0) return;
    const camDist = camera.position.length();
    if (camDist > 17) {
      if (visible.length) setVisible([]);
      return;
    }
    const root = scene.getObjectByName("brain-root");
    if (!root) return;
    const world = new THREE.Vector3();
    const near = nodes
      .filter((n) => n.type !== "hub")
      .map((n) => {
        const p = positions.get(n.id);
        if (!p) return { n, d: Infinity };
        world.copy(p);
        root.localToWorld(world);
        return { n, d: world.distanceTo(camera.position) };
      })
      .filter((x) => x.d < 9)
      .sort((a, b) => a.d - b.d)
      .slice(0, 10)
      .map((x) => x.n);
    setVisible(near);
  });

  return (
    <>
      {visible.map((n) => {
        const p = positions.get(n.id);
        if (!p) return null;
        return (
          <Html key={n.id} center position={[p.x, p.y - 0.6, p.z]} zIndexRange={[2, 0]}>
            <div className="node-label">{n.label}</div>
          </Html>
        );
      })}
    </>
  );
}

/** Vol de caméra vers le nœud sélectionné (recherche ou clic). */
function CameraRig({ positions }: { positions: Map<string, THREE.Vector3> }) {
  const flyToNodeId = useJarvis((s) => s.flyToNodeId);
  const clearFlyTo = useJarvis((s) => s.clearFlyTo);
  const { camera, scene, controls } = useThree();

  useFrame(() => {
    if (!flyToNodeId) return;
    const orbit = controls as unknown as OrbitControlsImpl | null;
    const local = positions.get(flyToNodeId);
    const root = scene.getObjectByName("brain-root");
    if (!local || !root || !orbit) {
      clearFlyTo();
      return;
    }
    const target = root.localToWorld(local.clone());
    // Position idéale : légèrement en retrait du nœud, dans l'axe radial.
    const desired = target.clone().multiplyScalar((target.length() + 5.5) / Math.max(target.length(), 0.001));
    camera.position.lerp(desired, 0.08);
    orbit.target.lerp(target, 0.12);
    orbit.update();
    if (camera.position.distanceTo(desired) < 0.15) clearFlyTo();
  });
  return null;
}

export default function BrainCanvas() {
  const positions = useLayout();
  const nodes = useJarvis((s) => s.nodes);
  const selectedId = useJarvis((s) => s.selectedNodeId);
  const selectNode = useJarvis((s) => s.selectNode);
  const selected = selectedId ? nodes.find((n) => n.id === selectedId) : null;
  const cluster = selected ? nodes.find((n) => n.id === selected.cluster) : null;

  return (
    <div className="panel brain">
      <div className="breadcrumb">
        CERVEAU
        {cluster && cluster.id !== selected?.id && (
          <>
            {" ▸ "}
            <b>{cluster.label}</b>
          </>
        )}
        {selected && (
          <>
            {" ▸ "}
            <b>{selected.label}</b>
          </>
        )}
      </div>
      <div className="brain-hint">glisser : tourner · molette : zoomer · clic : ouvrir un nœud</div>

      <Canvas
        camera={{ position: [0, 7, 30], fov: 50 }}
        dpr={[1, 1.75]}
        onPointerMissed={() => selectNode(null, false)}
      >
        <color attach="background" args={["#04070d"]} />
        <fog attach="fog" args={["#04070d", 34, 85]} />
        <Stars radius={95} depth={40} count={2600} factor={3.2} saturation={0} fade speed={0.35} />
        <SpinGroup>
          <Edges positions={positions} />
          <Hubs positions={positions} />
          <NodeCloud positions={positions} />
          <NearLabels positions={positions} />
        </SpinGroup>
        <CameraRig positions={positions} />
        <OrbitControls makeDefault enablePan={false} minDistance={3.5} maxDistance={70} enableDamping dampingFactor={0.08} />
      </Canvas>

      {selected && (
        <div className="node-detail">
          <button className="close" onClick={() => selectNode(null, false)}>✕</button>
          <div className="node-type">{TYPE_LABELS[selected.type] ?? selected.type}</div>
          <h3>{selected.label}</h3>
          <p>{selected.content || "(sans contenu)"}</p>
          {selected.tags.length > 0 && (
            <div className="tags">
              {selected.tags.map((t) => (
                <span key={t} className="chip">{t}</span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
