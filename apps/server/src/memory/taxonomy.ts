/**
 * Memory tag taxonomy based on cognitive psychology's long-term memory model.
 *
 * Tier 1 (Chronically Active)  — Self-schema: always loaded into working set
 * Tier 2 (Context-Primed)      — Activated by environmental cues (space, workspace)
 * Tier 3 (Retrieval-Based)     — Requires effortful retrieval (semantic search)
 */

export enum ActivationTier {
  /** Always injected into L1 working set, regardless of recency or pinning. */
  ChronicallyActive = 1,
  /** Auto-boosted when space or workspace context matches. */
  ContextPrimed = 2,
  /** Standard semantic retrieval or explicit search_memory. */
  RetrievalBased = 3,
}

export interface TaxonomyNode {
  description: string
  tier: ActivationTier
  children?: Record<string, TaxonomyNode>
}

export const MEMORY_TAXONOMY: Record<string, TaxonomyNode> = {
  identity: {
    description: 'Self-schema: who the user is',
    tier: ActivationTier.ChronicallyActive,
    children: {
      personal: { description: 'Name, age, location, nationality, native language', tier: ActivationTier.ChronicallyActive },
      professional: { description: 'Role, company, tech stack, expertise', tier: ActivationTier.ChronicallyActive },
      social: { description: 'Family, relationships, social circles', tier: ActivationTier.ChronicallyActive },
    },
  },
  preference: {
    description: 'Affective attitudes: likes, dislikes, habits',
    tier: ActivationTier.ContextPrimed,
    children: {
      development: {
        description: 'Development preferences',
        tier: ActivationTier.ContextPrimed,
        children: {
          'language': { description: 'Programming language preferences', tier: ActivationTier.ContextPrimed },
          'editor': { description: 'Editor / IDE preferences', tier: ActivationTier.ContextPrimed },
          'code-style': { description: 'Formatting, indent, naming conventions', tier: ActivationTier.ContextPrimed },
          'framework': { description: 'Framework and library preferences', tier: ActivationTier.ContextPrimed },
        },
      },
      communication: {
        description: 'Communication preferences',
        tier: ActivationTier.RetrievalBased,
        children: {
          language: { description: 'Preferred natural language for responses', tier: ActivationTier.RetrievalBased },
          tone: { description: 'Formal / casual / concise tone', tier: ActivationTier.RetrievalBased },
          format: { description: 'Output format preferences (markdown, bullet points, etc.)', tier: ActivationTier.RetrievalBased },
        },
      },
      lifestyle: {
        description: 'Lifestyle preferences',
        tier: ActivationTier.RetrievalBased,
        children: {
          food: { description: 'Food and cuisine preferences', tier: ActivationTier.RetrievalBased },
          entertainment: { description: 'Hobbies, media, games', tier: ActivationTier.RetrievalBased },
          schedule: { description: 'Work hours, timezone, routine', tier: ActivationTier.RetrievalBased },
        },
      },
    },
  },
  knowledge: {
    description: 'Semantic memory: domain facts and project knowledge',
    tier: ActivationTier.RetrievalBased,
    children: {
      domain: { description: 'Technical domain expertise', tier: ActivationTier.RetrievalBased },
      project: { description: 'Project facts, architecture, tech stack', tier: ActivationTier.ContextPrimed },
      reference: { description: 'Frequently used resources, documentation links', tier: ActivationTier.RetrievalBased },
    },
  },
  experience: {
    description: 'Episodic memory: time-bound personal experiences',
    tier: ActivationTier.RetrievalBased,
    children: {
      lesson: { description: 'Debugging lessons, pitfalls encountered', tier: ActivationTier.RetrievalBased },
      decision: { description: 'Architecture decisions, technology choices', tier: ActivationTier.RetrievalBased },
      milestone: { description: 'Notable achievements, events', tier: ActivationTier.RetrievalBased },
    },
  },
  procedure: {
    description: 'Procedural memory: how-to knowledge and workflows',
    tier: ActivationTier.ContextPrimed,
    children: {
      workflow: { description: 'Dev workflows, CI/CD, code review', tier: ActivationTier.ContextPrimed },
      convention: { description: 'Naming rules, code standards', tier: ActivationTier.ContextPrimed },
      routine: { description: 'Daily habits, fixed routines', tier: ActivationTier.RetrievalBased },
    },
  },
}

// ---------------------------------------------------------------------------
// Activation tier prefix sets — used by retrieval and injection layers
// ---------------------------------------------------------------------------

/** Tier 1: always injected into L1 working set. */
export const TIER1_TAG_PREFIXES = ['identity/'] as const

/** Tier 2: auto-boosted in coding space. */
export const TIER2_CODING_PREFIXES = [
  'preference/development/',
  'procedure/workflow/',
  'procedure/convention/',
] as const

/** Tier 2: auto-boosted when workspace matches. */
export const TIER2_WORKSPACE_PREFIXES = [
  'knowledge/project/',
] as const

/** All top-level domain prefixes (the five roots). */
export const TOP_LEVEL_DOMAINS = [
  'identity',
  'preference',
  'knowledge',
  'experience',
  'procedure',
] as const

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/**
 * Determine the activation tier for a given tag path.
 * Matches the most specific prefix first, then falls back to parent.
 */
const RE_END_WITH_SLASH = /\/$/
export function getActivationTier(tagPath: string): ActivationTier {
  const normalized = tagPath.toLowerCase().trim()

  for (const prefix of TIER1_TAG_PREFIXES) {
    if (normalized.startsWith(prefix) || normalized === prefix.replace(RE_END_WITH_SLASH, ''))
      return ActivationTier.ChronicallyActive
  }

  for (const prefix of TIER2_CODING_PREFIXES) {
    if (normalized.startsWith(prefix) || normalized === prefix.replace(RE_END_WITH_SLASH, ''))
      return ActivationTier.ContextPrimed
  }

  for (const prefix of TIER2_WORKSPACE_PREFIXES) {
    if (normalized.startsWith(prefix) || normalized === prefix.replace(RE_END_WITH_SLASH, ''))
      return ActivationTier.ContextPrimed
  }

  return ActivationTier.RetrievalBased
}

/**
 * Check whether any of the given tag names match a Tier 1 prefix.
 */
export function hasChronicallyActiveTags(tagNames: string[]): boolean {
  return tagNames.some(name =>
    TIER1_TAG_PREFIXES.some(prefix => name.toLowerCase().startsWith(prefix)),
  )
}

/**
 * Check whether any of the given tag names match a Tier 2 coding prefix.
 */
export function hasCodingPrimedTags(tagNames: string[]): boolean {
  return tagNames.some(name =>
    TIER2_CODING_PREFIXES.some(prefix => name.toLowerCase().startsWith(prefix)),
  )
}

/**
 * Check whether any of the given tag names match a Tier 2 workspace prefix.
 */
export function hasWorkspacePrimedTags(tagNames: string[]): boolean {
  return tagNames.some(name =>
    TIER2_WORKSPACE_PREFIXES.some(prefix => name.toLowerCase().startsWith(prefix)),
  )
}
