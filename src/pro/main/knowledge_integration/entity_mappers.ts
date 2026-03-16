/**
 * Entity Mappers for Knowledge Integration Layer
 *
 * Provides type mapping utilities to convert between source-specific types
 * and unified knowledge entity types.
 */

import type { KnowledgeNodeRow } from "../knowledge_graph/storage";
import type { MemoryEntry } from "../vector_memory/types";
import type { KnowledgeNodeType } from "../knowledge_graph/types";
import type { MemoryContentType } from "../vector_memory/types";
import type {
  UnifiedKnowledgeEntity,
  KnowledgeEntityType,
  KnowledgeSource,
} from "./types";

// ============================================================================
// Type Mappings
// ============================================================================

/**
 * Map Knowledge Graph node types to unified entity types
 */
const NODE_TYPE_TO_ENTITY_TYPE: Record<KnowledgeNodeType, KnowledgeEntityType> = {
  function: "function",
  class: "class",
  interface: "interface",
  type: "type",
  variable: "variable",
  constant: "constant",
  component: "component",
  hook: "function",
  page: "component",
  api: "function",
  config: "config",
  util: "function",
  test: "function",
  documentation: "documentation",
};

/**
 * Map Vector Memory content types to unified entity types
 */
const CONTENT_TYPE_TO_ENTITY_TYPE: Record<MemoryContentType, KnowledgeEntityType> = {
  code: "code",
  documentation: "documentation",
  decision: "decision",
  error: "error",
  pattern: "pattern",
  context: "context",
  summary: "summary",
};

/**
 * Map unified entity types back to knowledge node types
 */
const ENTITY_TYPE_TO_NODE_TYPES: Record<KnowledgeEntityType, KnowledgeNodeType[]> = {
  function: ["function", "hook", "util"],
  class: ["class"],
  interface: ["interface", "type"],
  type: ["type", "interface"],
  variable: ["variable"],
  constant: ["constant"],
  component: ["component", "page"],
  hook: ["hook", "function"],
  api: ["api", "function"],
  config: ["config"],
  file: [],
  module: [],
  package: [],
  decision: [],
  pattern: [],
  code: ["function", "class", "interface", "variable", "constant"],
  documentation: ["documentation"],
  error: [],
  context: [],
  summary: [],
};

// ============================================================================
// Mapper Functions
// ============================================================================

/**
 * Map a Knowledge Graph node to a unified entity
 */
export function mapNodeToEntity(node: KnowledgeNodeRow): UnifiedKnowledgeEntity {
  return {
    id: `kg:${node.id}`,
    sourceId: node.id,
    source: "code_graph" as KnowledgeSource,
    type: NODE_TYPE_TO_ENTITY_TYPE[node.type as KnowledgeNodeType] || "code",
    name: node.name,
    filePath: node.filePath || undefined,
    description: node.documentation || undefined,
    data: {
      signature: node.signature || undefined,
      lineStart: node.lineStart || undefined,
      lineEnd: node.lineEnd || undefined,
      nodeType: node.type,
      exported: node.exported,
      async: node.async,
    },
    relationships: [], // Relationships loaded separately
    metadata: {
      confidence: 1.0, // Knowledge graph data is deterministic
      lastUpdated: node.updatedAt,
      accessCount: 0,
    },
  };
}

/**
 * Map multiple Knowledge Graph nodes to unified entities
 */
export function mapNodesToEntities(nodes: KnowledgeNodeRow[]): UnifiedKnowledgeEntity[] {
  return nodes.map(mapNodeToEntity);
}

/**
 * Map a Vector Memory entry to a unified entity
 */
export function mapMemoryEntryToEntity(entry: MemoryEntry): UnifiedKnowledgeEntity {
  return {
    id: `vm:${entry.id}`,
    sourceId: entry.id,
    source: "vector_memory" as KnowledgeSource,
    type: CONTENT_TYPE_TO_ENTITY_TYPE[entry.contentType] || "code",
    name: extractNameFromContent(entry.content),
    filePath: entry.filePath,
    description: truncateContent(entry.content, 200),
    data: {
      contentType: entry.contentType,
      importance: entry.importance,
      dimensions: entry.dimensions,
      lineStart: entry.lineStart,
      lineEnd: entry.lineEnd,
      knowledgeGraphNodeId: entry.knowledgeGraphNodeId,
    },
    relationships: [],
    metadata: {
      confidence: entry.importance,
      lastUpdated: entry.updatedAt,
      accessCount: entry.accessCount,
    },
  };
}

/**
 * Map multiple Vector Memory entries to unified entities
 */
export function mapMemoryEntriesToEntities(entries: MemoryEntry[]): UnifiedKnowledgeEntity[] {
  return entries.map(mapMemoryEntryToEntity);
}

/**
 * Map unified entity types to Knowledge Graph node types for querying
 */
export function mapEntityTypesToNodeTypes(entityTypes?: KnowledgeEntityType[]): KnowledgeNodeType[] | undefined {
  if (!entityTypes || entityTypes.length === 0) return undefined;

  const nodeTypes: KnowledgeNodeType[] = [];
  for (const entityType of entityTypes) {
    const mapped = ENTITY_TYPE_TO_NODE_TYPES[entityType];
    if (mapped && mapped.length > 0) {
      nodeTypes.push(...mapped);
    }
  }

  // Deduplicate
  return [...new Set(nodeTypes)];
}

/**
 * Map unified entity types to Vector Memory content types for querying
 */
export function mapEntityTypesToContentTypes(entityTypes?: KnowledgeEntityType[]): MemoryContentType[] | undefined {
  if (!entityTypes || entityTypes.length === 0) return undefined;

  const contentTypes: MemoryContentType[] = [];
  const typeToContent: Partial<Record<KnowledgeEntityType, MemoryContentType>> = {
    code: "code",
    documentation: "documentation",
    decision: "decision",
    pattern: "pattern",
    error: "error",
    context: "context",
    summary: "summary",
  };

  for (const entityType of entityTypes) {
    const mapped = typeToContent[entityType];
    if (mapped) {
      contentTypes.push(mapped);
    }
  }

  return contentTypes.length > 0 ? contentTypes : undefined;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Extract a name from content (for memory entries without explicit names)
 */
function extractNameFromContent(content: string): string {
  // Try to extract from first line or significant text
  const lines = content.split("\n").filter(l => l.trim().length > 0);
  if (lines.length === 0) return "unnamed";

  const firstLine = lines[0].trim();

  // Try to find function/class/file names
  const patterns = [
    /^(?:function|class|interface|const|let|var)\s+(\w+)/,
    /^(\w+)\s*[=:]/,
    /^["']?([^"'\n]{1,50})["']?$/,
  ];

  for (const pattern of patterns) {
    const match = firstLine.match(pattern);
    if (match && match[1]) {
      return match[1].substring(0, 100);
    }
  }

  // Fall back to truncated first line
  return truncateContent(firstLine, 100);
}

/**
 * Truncate content to a maximum length
 */
function truncateContent(content: string, maxLength: number): string {
  if (content.length <= maxLength) return content;
  return content.substring(0, maxLength - 3) + "...";
}

/**
 * Merge entities from multiple sources, deduplicating by ID
 */
export function mergeEntities(
  entities: UnifiedKnowledgeEntity[],
  preferSource?: KnowledgeSource
): UnifiedKnowledgeEntity[] {
  const entityMap = new Map<string, UnifiedKnowledgeEntity>();

  for (const entity of entities) {
    const existing = entityMap.get(entity.id);
    if (!existing) {
      entityMap.set(entity.id, entity);
    } else if (preferSource && entity.source === preferSource) {
      // Prefer the specified source
      entityMap.set(entity.id, entity);
    } else {
      // Merge metadata (keep higher confidence)
      if (entity.metadata.confidence > existing.metadata.confidence) {
        entityMap.set(entity.id, entity);
      }
    }
  }

  return Array.from(entityMap.values());
}

/**
 * Calculate combined relevance score
 */
export function calculateRelevanceScore(
  entity: UnifiedKnowledgeEntity,
  query: string
): number {
  const queryLower = query.toLowerCase();
  let score = 0;

  // Name match
  if (entity.name.toLowerCase().includes(queryLower)) {
    score += 0.5;
    // Exact match bonus
    if (entity.name.toLowerCase() === queryLower) {
      score += 0.3;
    }
  }

  // Path match
  if (entity.filePath?.toLowerCase().includes(queryLower)) {
    score += 0.2;
  }

  // Description match
  if (entity.description?.toLowerCase().includes(queryLower)) {
    score += 0.1;
  }

  // Source weight
  const sourceWeights: Record<KnowledgeSource, number> = {
    code_graph: 1.0,
    vector_memory: 0.9,
    dependency_graph: 0.8,
    architecture: 0.85,
    reasoning: 0.75,
    memory: 0.7,
  };

  score *= sourceWeights[entity.source] || 1.0;

  return score;
}

/**
 * Sort entities by relevance to a query
 */
export function sortByRelevance(
  entities: UnifiedKnowledgeEntity[],
  query: string
): UnifiedKnowledgeEntity[] {
  return entities
    .map(entity => ({
      entity,
      score: calculateRelevanceScore(entity, query),
    }))
    .sort((a, b) => b.score - a.score)
    .map(item => item.entity);
}
