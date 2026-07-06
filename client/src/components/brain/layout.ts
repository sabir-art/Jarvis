import * as THREE from "three";
import type { BrainNode } from "../../types";

/**
 * Disposition du cerveau-sphère.
 * Les hubs sont répartis sur une sphère (spirale de Fibonacci) ; chaque nœud
 * enfant orbite près de son hub, avec une dispersion déterministe (hash de
 * l'id) pour que la carte soit stable d'une session à l'autre.
 */

export const SPHERE_RADIUS = 11;

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Pseudo-aléatoire déterministe dans [0,1) dérivé d'une chaîne. */
function rand(str: string, salt: number): number {
  return (hash(str + ":" + salt) % 100000) / 100000;
}

export function fibonacciSphere(count: number, radius: number): THREE.Vector3[] {
  const pts: THREE.Vector3[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = count === 1 ? 0 : 1 - (i / (count - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const theta = golden * i;
    pts.push(new THREE.Vector3(Math.cos(theta) * r, y, Math.sin(theta) * r).multiplyScalar(radius));
  }
  return pts;
}

export function computeLayout(nodes: BrainNode[]): Map<string, THREE.Vector3> {
  const positions = new Map<string, THREE.Vector3>();
  const hubs = nodes.filter((n) => n.type === "hub");
  const hubPts = fibonacciSphere(Math.max(hubs.length, 1), SPHERE_RADIUS);
  hubs.forEach((h, i) => positions.set(h.id, hubPts[i]));

  const up = new THREE.Vector3(0, 1, 0);
  for (const n of nodes) {
    if (n.type === "hub") continue;
    const hubPos = positions.get(n.cluster) ?? new THREE.Vector3(0, SPHERE_RADIUS, 0);
    const dir = hubPos.clone().normalize();
    // Base tangente (u, v) autour de la direction du hub.
    const u = new THREE.Vector3().crossVectors(dir, up);
    if (u.lengthSq() < 1e-4) u.set(1, 0, 0);
    u.normalize();
    const v = new THREE.Vector3().crossVectors(dir, u).normalize();

    const angle = rand(n.id, 1) * Math.PI * 2;
    const spread = 0.18 + rand(n.id, 2) * 0.5;
    const radial = SPHERE_RADIUS + (rand(n.id, 3) - 0.5) * 2.4;

    const p = dir
      .clone()
      .add(u.multiplyScalar(Math.cos(angle) * spread))
      .add(v.multiplyScalar(Math.sin(angle) * spread))
      .normalize()
      .multiplyScalar(radial);
    positions.set(n.id, p);
  }
  return positions;
}

export const NODE_COLORS: Record<string, string> = {
  hub: "#57e6ff",
  memory: "#6bffb8",
  note: "#ffe08a",
  task: "#ffc46b",
  conversation: "#8ab8ff",
  search: "#c78aff",
  document: "#7ff0e0",
  skill: "#ff9de2",
  system: "#57e6ff",
  proposal: "#ffb36b",
};

export const TYPE_LABELS: Record<string, string> = {
  hub: "Domaine",
  memory: "Mémoire",
  note: "Note",
  task: "Tâche",
  conversation: "Conversation",
  search: "Recherche",
  document: "Document",
  skill: "Compétence",
  system: "Système",
  proposal: "Proposition",
};
