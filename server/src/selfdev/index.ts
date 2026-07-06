import { getDb, newId, save, logActivity } from "../db/store.js";
import { addNode } from "../brain/graph.js";
import type { SkillProposal } from "../types.js";

/**
 * Auto-développement supervisé : JARVIS propose des compétences (code JS),
 * l'humain valide ou rejette. Une compétence approuvée devient un outil
 * dynamique disponible dans la boucle agentique. Chaque étape est journalisée
 * dans le cerveau.
 */

export function createProposal(input: {
  name: string;
  description: string;
  code: string;
  inputSchema: Record<string, unknown>;
  rationale: string;
}): SkillProposal {
  const db = getDb();
  const clean = input.name.toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 40);
  const proposal: SkillProposal = {
    id: newId("prop"),
    name: clean,
    description: input.description,
    code: input.code,
    inputSchema: input.inputSchema,
    rationale: input.rationale,
    status: "pending",
    createdAt: new Date().toISOString(),
  };
  const node = addNode({
    type: "proposal",
    label: `Proposition : ${clean}`,
    content: `${input.description}\n\nJustification : ${input.rationale}`,
    tags: ["auto-dev", "en attente"],
  });
  proposal.nodeId = node.id;
  db.proposals.push(proposal);
  logActivity("selfdev", `JARVIS propose une nouvelle compétence : « ${clean} » (validation requise)`);
  save();
  return proposal;
}

export function reviewProposal(id: string, decision: "approved" | "rejected"): SkillProposal | null {
  const db = getDb();
  const p = db.proposals.find((x) => x.id === id);
  if (!p || p.status !== "pending") return null;
  p.status = decision;
  p.reviewedAt = new Date().toISOString();
  if (decision === "approved") {
    const node = addNode({
      type: "skill",
      label: `Compétence : ${p.name}`,
      content: p.description,
      tags: ["auto-dev", "active"],
      meta: { proposalId: p.id },
    });
    p.nodeId = node.id;
    logActivity("selfdev", `Compétence « ${p.name} » approuvée et activée.`);
  } else {
    logActivity("selfdev", `Proposition « ${p.name} » rejetée.`);
  }
  save();
  return p;
}

export function approvedSkills(): SkillProposal[] {
  return getDb().proposals.filter((p) => p.status === "approved");
}

export function listProposals(): SkillProposal[] {
  return getDb().proposals;
}
