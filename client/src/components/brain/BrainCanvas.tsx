import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, OrbitControls, Stars } from "@react-three/drei";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { useJarvis } from "../../state";
import type { BrainNode } from "../../types";
import {
  clusterColor,
  computeGalaxyLayout,
  makeClusterDust,
  TYPE_LABELS,
  type GalaxyLayout,
} from "./layout";
import GridView from "./GridView";

/**
 * Le cerveau de JARVIS, deux vues :
 *  - « Galaxie » : amas 3D massifs par domaine, cœur central, poussière
 *    d'étoiles, zoom sémantique, vol de caméra vers un nœud.
 *  - « Grille » : la même connaissance, organisée par domaine, lisible et
 *    cliquable.
 */

function useLayout(): GalaxyLayout {
  const nodes = useJarvis((s) => s.nodes);
  return useMemo(() => computeGalaxyLayout(nodes), [nodes]);
}

/** Rotation lente de l'ensemble, en pause quand un nœud est sélectionné. */
function SpinGroup({ children }: { children: React.ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  const selected = useJarvis((s) => s.selectedNodeId);
  useFrame((_, delta) => {
    if (ref.current && !selected) ref.current.rotation.y += delta * 0.03;
  });
  return (
    <group ref={ref} name="brain-root">
      {children}
    </group>
  );
}

/** Le cœur : JARVIS lui-même, au centre de toutes les galaxies. */
function Core() {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (ref.current) ref.current.scale.setScalar(1 + Math.sin(clock.elapsedTime * 2) * 0.08);
  });
  return (
    <group>
      <mesh ref={ref}>
        <sphereGeometry args={[0.9, 32, 32]} />
        <meshBasicMaterial color="#bff4ff" toneMapped={false} />
      </mesh>
      <mesh scale={2.4}>
        <sphereGeometry args={[0.9, 16, 16]} />
        <meshBasicMaterial color="#57e6ff" transparent opacity={0.1} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      <Html center position={[0, -1.9, 0]} zIndexRange={[2, 0]}>
        <div className="core-label">◈ JARVIS</div>
      </Html>
    </group>
  );
}

function Edges({ layout }: { layout: GalaxyLayout }) {
  const edges = useJarvis((s) => s.edges);
  const nodes = useJarvis((s) => s.nodes);
  const geometry = useMemo(() => {
    const pts: number[] = [];
    const colors: number[] = [];
    const c = new THREE.Color();
    const push = (a: THREE.Vector3, b: THREE.Vector3, color: string) => {
      pts.push(a.x, a.y, a.z, b.x, b.y, b.z);
      c.set(color);
      colors.push(c.r, c.g, c.b, c.r, c.g, c.b);
    };
    // cœur → hubs
    const origin = new THREE.Vector3();
    for (const h of nodes.filter((n) => n.type === "hub")) {
      const p = layout.positions.get(h.id);
      if (p) push(origin, p, clusterColor(h.id));
    }
    // arêtes réelles du graphe
    const clusterOf = new Map(nodes.map((n) => [n.id, n.type === "hub" ? n.id : n.cluster]));
    for (const e of edges) {
      const a = layout.positions.get(e.source);
      const b = layout.positions.get(e.target);
      if (!a || !b) continue;
      push(a, b, clusterColor(clusterOf.get(e.source) ?? "hub_system"));
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    return g;
  }, [edges, nodes, layout]);

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial vertexColors transparent opacity={0.16} blending={THREE.AdditiveBlending} depthWrite={false} />
    </lineSegments>
  );
}

/** Texture circulaire douce pour les particules (sinon : carrés visibles de près). */
let dotTexture: THREE.Texture | null = null;
function getDotTexture(): THREE.Texture {
  if (dotTexture) return dotTexture;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.4, "rgba(255,255,255,0.45)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  dotTexture = new THREE.CanvasTexture(c);
  return dotTexture;
}

/** Poussière d'étoiles : la masse visuelle de chaque galaxie. */
function ClusterDust({ layout }: { layout: GalaxyLayout }) {
  const nodes = useJarvis((s) => s.nodes);
  const hubs = nodes.filter((n) => n.type === "hub");
  return (
    <>
      {hubs.map((h) => {
        const pos = layout.positions.get(h.id);
        const b = layout.basis.get(h.id);
        const r = layout.clusterRadius.get(h.id);
        if (!pos || !b || !r) return null;
        const count = layout.members.get(h.id)?.length ?? 0;
        const arr = makeClusterDust(h.id, pos, b, r, count);
        return (
          <points key={`${h.id}-${count}`}>
            <bufferGeometry>
              <bufferAttribute attach="attributes-position" args={[arr, 3]} />
            </bufferGeometry>
            <pointsMaterial
              color={clusterColor(h.id)}
              size={0.22}
              map={getDotTexture()}
              sizeAttenuation
              transparent
              opacity={0.5}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </points>
        );
      })}
    </>
  );
}

function Hubs({ layout }: { layout: GalaxyLayout }) {
  const nodes = useJarvis((s) => s.nodes);
  const selectNode = useJarvis((s) => s.selectNode);
  const hubs = nodes.filter((n) => n.type === "hub");
  return (
    <>
      {hubs.map((h) => (
        <Hub
          key={h.id}
          node={h}
          position={layout.positions.get(h.id) ?? new THREE.Vector3()}
          scale={layout.sizes.get(h.id) ?? 1.5}
          count={layout.members.get(h.id)?.length ?? 0}
          onSelect={() => selectNode(h.id)}
        />
      ))}
    </>
  );
}

function Hub({
  node,
  position,
  scale,
  count,
  onSelect,
}: {
  node: BrainNode;
  position: THREE.Vector3;
  scale: number;
  count: number;
  onSelect: () => void;
}) {
  const ref = useRef<THREE.Mesh>(null);
  const seed = useMemo(() => Math.random() * Math.PI * 2, []);
  const color = clusterColor(node.id);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.scale.setScalar(scale * (1 + Math.sin(clock.elapsedTime * 1.4 + seed) * 0.09));
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
        <sphereGeometry args={[0.42, 24, 24]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
      <mesh scale={scale * 2.6}>
        <sphereGeometry args={[0.42, 16, 16]} />
        <meshBasicMaterial color={color} transparent opacity={0.09} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      <Html center position={[0, -(scale * 0.6 + 1.1), 0]} zIndexRange={[2, 0]}>
        <div className="hub-label" onClick={onSelect}>
          <span className="hub-dot" style={{ background: color, boxShadow: `0 0 8px ${color}` }} />
          {node.label}
          <span className="hub-count">{count}</span>
        </div>
      </Html>
    </group>
  );
}

function NodeCloud({ layout }: { layout: GalaxyLayout }) {
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
      const p = layout.positions.get(n.id);
      dummy.position.copy(p ?? new THREE.Vector3());
      const base = layout.sizes.get(n.id) ?? 1;
      const boost = n.id === selectedId ? 1.6 : n.id === hoverId ? 1.35 : 1;
      dummy.scale.setScalar(base * boost);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, color.set(clusterColor(n.cluster)));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [others, layout, hoverId, selectedId]);

  const hoverNode = hoverId ? others.find((n) => n.id === hoverId) : null;
  const hoverPos = hoverNode ? layout.positions.get(hoverNode.id) : null;

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
        <sphereGeometry args={[0.3, 14, 14]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>

      {hoverNode && hoverPos && (
        <Html center position={[hoverPos.x, hoverPos.y + 0.8, hoverPos.z]} zIndexRange={[3, 0]}>
          <div className="node-label">{hoverNode.label}</div>
        </Html>
      )}
    </>
  );
}

/** Zoom sémantique : étiquettes des nœuds proches quand la caméra plonge. */
function NearLabels({ layout }: { layout: GalaxyLayout }) {
  const nodes = useJarvis((s) => s.nodes);
  const [visible, setVisible] = useState<BrainNode[]>([]);
  const frame = useRef(0);
  const { camera, scene } = useThree();

  useFrame(() => {
    frame.current++;
    if (frame.current % 20 !== 0) return;
    const camDist = camera.position.length();
    if (camDist > 24) {
      if (visible.length) setVisible([]);
      return;
    }
    const root = scene.getObjectByName("brain-root");
    if (!root) return;
    const world = new THREE.Vector3();
    const near = nodes
      .filter((n) => n.type !== "hub")
      .map((n) => {
        const p = layout.positions.get(n.id);
        if (!p) return { n, d: Infinity };
        world.copy(p);
        root.localToWorld(world);
        return { n, d: world.distanceTo(camera.position) };
      })
      .filter((x) => x.d < 11)
      .sort((a, b) => a.d - b.d)
      .slice(0, 12)
      .map((x) => x.n);
    setVisible(near);
  });

  return (
    <>
      {visible.map((n) => {
        const p = layout.positions.get(n.id);
        if (!p) return null;
        return (
          <Html key={n.id} center position={[p.x, p.y - 0.75, p.z]} zIndexRange={[2, 0]}>
            <div className="node-label">{n.label}</div>
          </Html>
        );
      })}
    </>
  );
}

/** Vol de caméra vers le nœud sélectionné (recherche ou clic). */
function CameraRig({ layout }: { layout: GalaxyLayout }) {
  const flyToNodeId = useJarvis((s) => s.flyToNodeId);
  const clearFlyTo = useJarvis((s) => s.clearFlyTo);
  const { camera, scene, controls } = useThree();

  useFrame(() => {
    if (!flyToNodeId) return;
    const orbit = controls as unknown as OrbitControlsImpl | null;
    const local = layout.positions.get(flyToNodeId);
    const root = scene.getObjectByName("brain-root");
    if (!local || !root || !orbit) {
      clearFlyTo();
      return;
    }
    const target = root.localToWorld(local.clone());
    const desired = target.clone().multiplyScalar((target.length() + 7) / Math.max(target.length(), 0.001));
    camera.position.lerp(desired, 0.08);
    orbit.target.lerp(target, 0.12);
    orbit.update();
    if (camera.position.distanceTo(desired) < 0.18) clearFlyTo();
  });
  return null;
}

function GalaxyScene() {
  const layout = useLayout();
  const selectNode = useJarvis((s) => s.selectNode);
  return (
    <Canvas
      camera={{ position: [0, 11, 40], fov: 50 }}
      dpr={[1, 1.75]}
      onPointerMissed={() => selectNode(null, false)}
    >
      <color attach="background" args={["#04070d"]} />
      <fog attach="fog" args={["#04070d", 45, 110]} />
      <Stars radius={110} depth={50} count={3000} factor={3.4} saturation={0} fade speed={0.3} />
      <SpinGroup>
        <Core />
        <Edges layout={layout} />
        <ClusterDust layout={layout} />
        <Hubs layout={layout} />
        <NodeCloud layout={layout} />
        <NearLabels layout={layout} />
      </SpinGroup>
      <CameraRig layout={layout} />
      <OrbitControls makeDefault enablePan={false} minDistance={4} maxDistance={90} enableDamping dampingFactor={0.08} />
    </Canvas>
  );
}

export default function BrainCanvas() {
  const nodes = useJarvis((s) => s.nodes);
  const selectedId = useJarvis((s) => s.selectedNodeId);
  const selectNode = useJarvis((s) => s.selectNode);
  const [view, setView] = useState<"galaxy" | "grid">("galaxy");
  const selected = selectedId ? nodes.find((n) => n.id === selectedId) : null;
  const cluster = selected ? nodes.find((n) => n.id === selected.cluster) : null;

  return (
    <div className="brain-stage">
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

      <div className="view-toggle">
        <button className={`btn ${view === "galaxy" ? "active" : ""}`} onClick={() => setView("galaxy")}>
          ✦ Galaxie
        </button>
        <button className={`btn ${view === "grid" ? "active" : ""}`} onClick={() => setView("grid")}>
          ▦ Grille
        </button>
      </div>

      {view === "galaxy" ? (
        <>
          <div className="brain-hint">glisser : tourner · molette : zoomer · clic : ouvrir un nœud</div>
          <GalaxyScene />
        </>
      ) : (
        <GridView onOpenInGalaxy={() => setView("galaxy")} />
      )}

      {selected && (
        <div className={`node-detail ${selected.type === "wiki" ? "wiki" : ""}`}>
          <button className="close" onClick={() => selectNode(null, false)}>✕</button>
          <div className="node-type" style={{ color: clusterColor(selected.type === "hub" ? selected.id : selected.cluster) }}>
            {TYPE_LABELS[selected.type] ?? selected.type}
          </div>
          <h3>{selected.label}</h3>
          {selected.type === "wiki" ? (
            <div className="wiki-page">
              <ReactMarkdown>{selected.content || "(page vide)"}</ReactMarkdown>
            </div>
          ) : (
            <p>{selected.content || "(sans contenu)"}</p>
          )}
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
