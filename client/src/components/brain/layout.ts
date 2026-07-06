import * as THREE from "three";
import type { BrainNode } from "../../types";

/**
 * Disposition « galaxie » du cerveau.
 * Un cœur JARVIS au centre ; chaque domaine (hub) est une galaxie : un amas
 * dense de nœuds aux tailles variables, coloré par domaine, entouré d'une
 * poussière d'étoiles décorative. Déterministe (hash des ids) pour que la
 * carte reste stable d'une session à l'autre.
 */

export const GALAXY_RADIUS = 15;
const GOLDEN = Math.PI * (3 - Math.sqrt(5));

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Pseudo-aléatoire déterministe dans [0,1) dérivé d'une chaîne. */
export function rand(str: string, salt: number): number {
  return (hash(str + ":" + salt) % 100000) / 100000;
}

export function fibonacciSphere(count: number, radius: number): THREE.Vector3[] {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < count; i++) {
    const y = count === 1 ? 0 : 1 - (i / (count - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const theta = GOLDEN * i;
    pts.push(new THREE.Vector3(Math.cos(theta) * r, y, Math.sin(theta) * r).multiplyScalar(radius));
  }
  return pts;
}

/** Couleur de chaque domaine (galaxie). */
export const CLUSTER_COLORS: Record<string, string> = {
  hub_memory: "#4de3c0",
  hub_notes: "#ffd24d",
  hub_tasks: "#ffa94d",
  hub_conversations: "#b58aff",
  hub_search: "#e06bff",
  hub_documents: "#5ec6ff",
  hub_skills: "#ff8a3d",
  hub_system: "#57e6ff",
  hub_wiki: "#a8ff6b",
};

export function clusterColor(clusterId: string): string {
  return CLUSTER_COLORS[clusterId] ?? "#57e6ff";
}

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
  wiki: "Synthèse wiki",
};

/** Base d'importance visuelle par type de nœud. */
const TYPE_SIZE: Record<string, number> = {
  memory: 1.0,
  note: 1.15,
  task: 0.95,
  conversation: 0.8,
  search: 0.9,
  document: 1.3,
  skill: 1.25,
  system: 1.1,
  proposal: 1.2,
  wiki: 1.4,
};

export interface GalaxyLayout {
  positions: Map<string, THREE.Vector3>;
  /** échelle visuelle par nœud (1 = base) */
  sizes: Map<string, number>;
  /** membres par hub (ordre stable) */
  members: Map<string, BrainNode[]>;
  /** rayon de l'amas par hub */
  clusterRadius: Map<string, number>;
  /** base tangente (u, v, normale) par hub, pour la poussière */
  basis: Map<string, { u: THREE.Vector3; v: THREE.Vector3; n: THREE.Vector3 }>;
}

export function computeGalaxyLayout(nodes: BrainNode[]): GalaxyLayout {
  const positions = new Map<string, THREE.Vector3>();
  const sizes = new Map<string, number>();
  const members = new Map<string, BrainNode[]>();
  const clusterRadius = new Map<string, number>();
  const basis = new Map<string, { u: THREE.Vector3; v: THREE.Vector3; n: THREE.Vector3 }>();

  const hubs = nodes.filter((n) => n.type === "hub");
  for (const h of hubs) members.set(h.id, []);
  for (const n of nodes) {
    if (n.type === "hub") continue;
    const list = members.get(n.cluster);
    if (list) list.push(n);
    else members.set(n.cluster, [n]);
  }

  // Hubs répartis autour du cœur, sphère légèrement aplatie (allure de carte).
  const hubPts = fibonacciSphere(Math.max(hubs.length, 1), GALAXY_RADIUS);
  const up = new THREE.Vector3(0, 1, 0);
  hubs.forEach((h, i) => {
    const p = hubPts[i].clone();
    p.y *= 0.55;
    positions.set(h.id, p);

    const count = members.get(h.id)?.length ?? 0;
    sizes.set(h.id, 1.5 + Math.min(Math.sqrt(count) * 0.35, 1.8));

    const n = p.clone().normalize();
    const u = new THREE.Vector3().crossVectors(n, up);
    if (u.lengthSq() < 1e-4) u.set(1, 0, 0);
    u.normalize();
    const v = new THREE.Vector3().crossVectors(n, u).normalize();
    basis.set(h.id, { u, v, n });

    clusterRadius.set(h.id, 2.6 + Math.min(Math.sqrt(count + 1) * 1.05, 6));
  });

  // Membres : spirale dorée dans le plan tangent du hub (amas en disque épais).
  for (const [hubId, list] of members) {
    const hubPos = positions.get(hubId) ?? new THREE.Vector3(0, 0, GALAXY_RADIUS);
    const b = basis.get(hubId) ?? { u: new THREE.Vector3(1, 0, 0), v: new THREE.Vector3(0, 1, 0), n: new THREE.Vector3(0, 0, 1) };
    const R = clusterRadius.get(hubId) ?? 3;
    list.forEach((node, i) => {
      const t = (i + 0.6) / Math.max(list.length, 1);
      const r = R * (0.3 + 0.7 * Math.sqrt(t)) * (0.85 + rand(node.id, 1) * 0.3);
      const angle = i * GOLDEN + rand(node.id, 2) * 0.8;
      const lift = (rand(node.id, 3) - 0.5) * 1.6;
      const p = hubPos
        .clone()
        .add(b.u.clone().multiplyScalar(Math.cos(angle) * r))
        .add(b.v.clone().multiplyScalar(Math.sin(angle) * r))
        .add(b.n.clone().multiplyScalar(lift));
      positions.set(node.id, p);

      const base = TYPE_SIZE[node.type] ?? 1;
      const richness = Math.min(node.content.length / 600, 1) * 0.6;
      sizes.set(node.id, base + richness + rand(node.id, 4) * 0.25);
    });
  }

  return { positions, sizes, members, clusterRadius, basis };
}

/** Poussière d'étoiles décorative d'un amas (donne sa masse visuelle à la galaxie). */
export function makeClusterDust(
  hubId: string,
  hubPos: THREE.Vector3,
  b: { u: THREE.Vector3; v: THREE.Vector3; n: THREE.Vector3 },
  clusterR: number,
  memberCount: number,
): Float32Array {
  const count = Math.min(90 + memberCount * 10, 320);
  const arr = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const r = clusterR * (0.15 + 0.95 * Math.sqrt(rand(hubId, i * 3 + 10)));
    const angle = i * GOLDEN + rand(hubId, i * 3 + 11) * 1.2;
    const lift = (rand(hubId, i * 3 + 12) - 0.5) * 2.2;
    const p = hubPos
      .clone()
      .add(b.u.clone().multiplyScalar(Math.cos(angle) * r))
      .add(b.v.clone().multiplyScalar(Math.sin(angle) * r))
      .add(b.n.clone().multiplyScalar(lift));
    arr[i * 3] = p.x;
    arr[i * 3 + 1] = p.y;
    arr[i * 3 + 2] = p.z;
  }
  return arr;
}
