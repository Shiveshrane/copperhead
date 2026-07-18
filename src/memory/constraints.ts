import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

/**
 * Machine-readable constraint registry (SPEC §2.6). Built simultaneously with
 * the docs: every stated/assumed/discovered constraint lands in both in the
 * same tool turn. `affects` drives propagation.
 */
export interface Constraint {
  min?: number;
  max?: number;
  forbidden?: string[];
  value?: string | number;
  source: string;
  affects: string[];
}

export type ConstraintRegistry = Record<string, Constraint>;

export function constraintsPath(repoRoot: string): string {
  return path.join(repoRoot, '.copperhead', 'constraints.json');
}

export async function loadConstraints(repoRoot: string): Promise<ConstraintRegistry> {
  const p = constraintsPath(repoRoot);
  if (!existsSync(p)) return {};
  return JSON.parse(await readFile(p, 'utf8')) as ConstraintRegistry;
}

export async function saveConstraint(
  repoRoot: string,
  key: string,
  constraint: Constraint,
): Promise<ConstraintRegistry> {
  const registry = await loadConstraints(repoRoot);
  registry[key] = constraint;
  const p = constraintsPath(repoRoot);
  await mkdir(path.dirname(p), { recursive: true });
  await writeFile(p, JSON.stringify(registry, null, 2) + '\n', 'utf8');
  return registry;
}

export interface ConstraintViolation {
  key: string;
  description: string;
  source: string;
}

/**
 * Mechanical validation where possible (SPEC §2.6): forbidden pins against the
 * pinout, numeric budget keys surfaced for the doc-level checks. Geometry
 * checks are out of scope for Phase 1.
 */
export function checkForbiddenPins(
  registry: ConstraintRegistry,
  pinNets: { ref: string; pinName: string; net: string | null }[],
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];
  for (const [key, c] of Object.entries(registry)) {
    if (!c.forbidden?.length) continue;
    for (const pn of pinNets) {
      if (pn.net && c.forbidden.includes(pn.pinName)) {
        violations.push({
          key,
          description: `${pn.ref} pin ${pn.pinName} is connected to net ${pn.net} but is forbidden by ${key}`,
          source: c.source,
        });
      }
    }
  }
  return violations;
}
