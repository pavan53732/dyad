/**
 * Code Graph Builder
 * 
 * Extracts code entities and relationships from source files
 * and builds the knowledge graph.
 * 
 * Supports multiple languages: TypeScript, JavaScript, Python, etc.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { createHash } from "node:crypto";
import { graphStorage } from "./storage";
import type { KnowledgeNodeType, KnowledgeEdgeType, CodeGraphBuildOptions, GraphUpdateResult } from "./types";

// ============================================================================
// Types
// ============================================================================

/**
 * Extracted code entity
 */
interface ExtractedEntity {
  type: KnowledgeNodeType;
  name: string;
  filePath: string;
  lineStart: number;
  lineEnd: number;
  columnStart?: number;
  columnEnd?: number;
  language: string;
  properties: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

/**
 * Extracted code relationship
 */
interface ExtractedRelationship {
  sourceName: string;
  sourceType: KnowledgeNodeType;
  targetName: string;
  targetType: KnowledgeNodeType;
  type: KnowledgeEdgeType;
  metadata?: Record<string, unknown>;
}

/**
 * Extraction result from a file
 */
interface FileExtractionResult {
  filePath: string;
  language: string;
  entities: ExtractedEntity[];
  relationships: ExtractedRelationship[];
  contentHash: string;
}

// ============================================================================
// Language Parsers
// ============================================================================

/**
 * Base parser interface
 */
interface LanguageParser {
  extensions: string[];
  parse(content: string, filePath: string): Promise<{ entities: ExtractedEntity[]; relationships: ExtractedRelationship[] }>;
}

/**
 * TypeScript/JavaScript parser using regex-based extraction
 * (Production would use proper AST parsing via TypeScript compiler)
 */
class TypeScriptParser implements LanguageParser {
  extensions = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];

  async parse(content: string, filePath: string): Promise<{ entities: ExtractedEntity[]; relationships: ExtractedRelationship[] }> {
    const entities: ExtractedEntity[] = [];
    const relationships: ExtractedRelationship[] = [];
    const lines = content.split("\n");

    // Extract imports
    const importRegex = /import\s+(?:\{([^}]+)\}|(\w+)(?:\s*,\s*\{([^}]+)\})?)\s+from\s+['"]([^'"]+)['"]/g;
    let match;
    while ((match = importRegex.exec(content)) !== null) {
      const moduleName = match[4];
      const importedNames = (match[1] || match[2] || "").split(",").map(s => s.trim()).filter(Boolean);
      
      entities.push({
        type: "module",
        name: moduleName,
        filePath,
        lineStart: content.substring(0, match.index).split("\n").length,
        lineEnd: content.substring(0, match.index).split("\n").length,
        language: "typescript",
        properties: {
          modulePath: moduleName,
          isExternal: !moduleName.startsWith(".") && !moduleName.startsWith("/"),
          imports: importedNames,
        },
      });
    }

    // Extract exported functions
    const functionRegex = /(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)(?:\s*:\s*(\w+))?/g;
    while ((match = functionRegex.exec(content)) !== null) {
      const lineStart = content.substring(0, match.index).split("\n").length;
      const name = match[1];
      const params = match[2].split(",").map(p => {
        const [paramName, paramType] = p.trim().split(":").map(s => s.trim());
        return {
          name: paramName?.replace("?", "") || "",
          type: paramType,
          optional: p.includes("?"),
        };
      }).filter(p => p.name);

      entities.push({
        type: "function",
        name,
        filePath,
        lineStart,
        lineEnd: lineStart + 5, // Estimate
        language: "typescript",
        properties: {
          signature: match[0],
          returnType: match[3],
          parameters: params,
          isAsync: match[0].includes("async"),
          isExported: match[0].includes("export"),
          isGenerator: false,
        },
      });
    }

    // Extract arrow functions
    const arrowFunctionRegex = /(?:export\s+)?(?:const|let)\s+(\w+)\s*(?::\s*[^=]+)?\s*=\s*(?:async\s+)?(?:\([^)]*\)|[^=])\s*=>/g;
    while ((match = arrowFunctionRegex.exec(content)) !== null) {
      const lineStart = content.substring(0, match.index).split("\n").length;
      const name = match[1];

      entities.push({
        type: "function",
        name,
        filePath,
        lineStart,
        lineEnd: lineStart + 3, // Estimate
        language: "typescript",
        properties: {
          signature: match[0],
          isAsync: match[0].includes("async"),
          isExported: match[0].includes("export"),
          isArrowFunction: true,
          parameters: [],
        },
      });
    }

    // Extract classes
    const classRegex = /(?:export\s+)?(?:abstract\s+)?class\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+([^{]+))?/g;
    while ((match = classRegex.exec(content)) !== null) {
      const lineStart = content.substring(0, match.index).split("\n").length;
      const name = match[1];
      const extendsClass = match[2];
      const implementsInterfaces = match[3]?.split(",").map(s => s.trim()).filter(Boolean) || [];

      entities.push({
        type: "class",
        name,
        filePath,
        lineStart,
        lineEnd: lineStart + 20, // Estimate
        language: "typescript",
        properties: {
          isAbstract: match[0].includes("abstract"),
          isExported: match[0].includes("export"),
          extendsClass,
          implementsInterfaces,
          methods: [],
          properties: [],
        },
      });

      // Create inheritance relationships
      if (extendsClass) {
        relationships.push({
          sourceName: name,
          sourceType: "class",
          targetName: extendsClass,
          targetType: "class",
          type: "extends",
        });
      }

      for (const iface of implementsInterfaces) {
        relationships.push({
          sourceName: name,
          sourceType: "class",
          targetName: iface,
          targetType: "interface",
          type: "implements",
        });
      }
    }

    // Extract interfaces
    const interfaceRegex = /(?:export\s+)?interface\s+(\w+)(?:\s+extends\s+([^{]+))?/g;
    while ((match = interfaceRegex.exec(content)) !== null) {
      const lineStart = content.substring(0, match.index).split("\n").length;
      const name = match[1];
      const extendsInterfaces = match[2]?.split(",").map(s => s.trim()).filter(Boolean) || [];

      entities.push({
        type: "interface",
        name,
        filePath,
        lineStart,
        lineEnd: lineStart + 10, // Estimate
        language: "typescript",
        properties: {
          isExported: match[0].includes("export"),
          extendsInterfaces,
          methods: [],
          properties: [],
        },
      });

      for (const extended of extendsInterfaces) {
        relationships.push({
          sourceName: name,
          sourceType: "interface",
          targetName: extended,
          targetType: "interface",
          type: "extends",
        });
      }
    }

    // Extract React components
    const componentRegex = /(?:export\s+)?(?:default\s+)?function\s+([A-Z]\w+)\s*(?:\([^)]*\))?\s*(?::\s*\w+)?\s*\{/g;
    while ((match = componentRegex.exec(content)) !== null) {
      const name = match[1];
      // Check if it's likely a React component (starts with capital letter, takes props)
      if (name[0] === name[0].toUpperCase() && name[0] !== "_") {
        const existingFunction = entities.find(e => e.name === name && e.type === "function");
        if (existingFunction) {
          existingFunction.type = "component";
          existingFunction.properties = {
            ...existingFunction.properties,
            framework: "react",
          };
        }
      }
    }

    // Extract function calls for relationships
    const callRegex = /(\w+)\s*\(/g;
    const definedFunctions = new Set(entities.filter(e => e.type === "function" || e.type === "component").map(e => e.name));
    while ((match = callRegex.exec(content)) !== null) {
      const calledFunction = match[1];
      if (definedFunctions.has(calledFunction) || calledFunction.startsWith("use")) {
        // Find which function this call is inside
        const callLine = content.substring(0, match.index).split("\n").length;
        const containingFunction = entities.find(e => 
          (e.type === "function" || e.type === "component") &&
          e.lineStart <= callLine &&
          e.lineEnd >= callLine &&
          e.name !== calledFunction
        );

        if (containingFunction && calledFunction !== containingFunction.name) {
          relationships.push({
            sourceName: containingFunction.name,
            sourceType: containingFunction.type,
            targetName: calledFunction,
            targetType: "function",
            type: "calls",
          });
        }
      }
    }

    return { entities, relationships };
  }
}

/**
 * Python parser
 */
class PythonParser implements LanguageParser {
  extensions = [".py"];

  async parse(content: string, filePath: string): Promise<{ entities: ExtractedEntity[]; relationships: ExtractedRelationship[] }> {
    const entities: ExtractedEntity[] = [];
    const relationships: ExtractedRelationship[] = [];
    const lines = content.split("\n");

    // Extract imports
    const importRegex = /(?:from\s+(\w+(?:\.\w+)*)\s+)?import\s+([^\n]+)/g;
    let match;
    while ((match = importRegex.exec(content)) !== null) {
      const moduleName = match[1] || match[2].trim().split(",").map(s => s.trim().split(" as ")[0])[0];
      const lineStart = content.substring(0, match.index).split("\n").length;

      entities.push({
        type: "module",
        name: moduleName,
        filePath,
        lineStart,
        lineEnd: lineStart,
        language: "python",
        properties: {
          modulePath: moduleName,
          isExternal: !moduleName.startsWith("."),
        },
      });
    }

    // Extract functions
    const functionRegex = /def\s+(\w+)\s*\(([^)]*)\)(?:\s*->\s*(\w+))?:/g;
    while ((match = functionRegex.exec(content)) !== null) {
      const lineStart = content.substring(0, match.index).split("\n").length;
      const name = match[1];
      const params = match[2].split(",").map(p => {
        const [paramName, paramType] = p.trim().split(":").map(s => s.trim());
        return {
          name: paramName?.replace("?", "") || "",
          type: paramType,
        };
      }).filter(p => p.name);

      entities.push({
        type: "function",
        name,
        filePath,
        lineStart,
        lineEnd: lineStart + 10, // Estimate
        language: "python",
        properties: {
          signature: match[0],
          returnType: match[3],
          parameters: params,
          isAsync: false,
          isExported: false,
        },
      });
    }

    // Extract classes
    const classRegex = /class\s+(\w+)(?:\s*\(\s*([^)]+)\s*\))?:/g;
    while ((match = classRegex.exec(content)) !== null) {
      const lineStart = content.substring(0, match.index).split("\n").length;
      const name = match[1];
      const baseClasses = match[2]?.split(",").map(s => s.trim()).filter(Boolean) || [];

      entities.push({
        type: "class",
        name,
        filePath,
        lineStart,
        lineEnd: lineStart + 20, // Estimate
        language: "python",
        properties: {
          extendsClass: baseClasses[0],
          implementsInterfaces: baseClasses.slice(1),
          methods: [],
          properties: [],
        },
      });

      for (const base of baseClasses) {
        relationships.push({
          sourceName: name,
          sourceType: "class",
          targetName: base,
          targetType: "class",
          type: "extends",
        });
      }
    }

    return { entities, relationships };
  }
}

/**
 * CSS/SCSS parser (limited)
 */
class CSSParser implements LanguageParser {
  extensions = [".css", ".scss", ".less"];

  async parse(content: string, filePath: string): Promise<{ entities: ExtractedEntity[]; relationships: ExtractedRelationship[] }> {
    const entities: ExtractedEntity[] = [];

    // Extract CSS classes
    const classRegex = /\.([a-zA-Z][\w-]*)\s*\{/g;
    let match;
    while ((match = classRegex.exec(content)) !== null) {
      const lineStart = content.substring(0, match.index).split("\n").length;
      entities.push({
        type: "variable",
        name: match[1],
        filePath,
        lineStart,
        lineEnd: lineStart + 2,
        language: "css",
        properties: {
          cssClass: true,
        },
      });
    }

    return { entities, relationships: [] };
  }
}

/**
 * JSON parser for config files
 */
class JSONParser implements LanguageParser {
  extensions = [".json"];

  async parse(content: string, filePath: string): Promise<{ entities: ExtractedEntity[]; relationships: ExtractedRelationship[] }> {
    const entities: ExtractedEntity[] = [];
    const fileName = path.basename(filePath);

    // Only process package.json specially
    if (fileName === "package.json") {
      try {
        const pkg = JSON.parse(content);
        const lineStart = 1;

        entities.push({
          type: "config",
          name: fileName,
          filePath,
          lineStart,
          lineEnd: content.split("\n").length,
          language: "json",
          properties: {
            name: pkg.name,
            version: pkg.version,
            dependencies: Object.keys(pkg.dependencies || {}),
            devDependencies: Object.keys(pkg.devDependencies || {}),
          },
        });

        // Add dependencies as nodes
        for (const [dep, version] of Object.entries(pkg.dependencies || {})) {
          entities.push({
            type: "dependency",
            name: dep,
            filePath,
            lineStart: 0, // Can't easily determine line
            lineEnd: 0,
            language: "json",
            properties: {
              packageName: dep,
              versionConstraint: version,
              isDev: false,
              isPeer: false,
            },
          });
        }

        for (const [dep, version] of Object.entries(pkg.devDependencies || {})) {
          entities.push({
            type: "dependency",
            name: dep,
            filePath,
            lineStart: 0,
            lineEnd: 0,
            language: "json",
            properties: {
              packageName: dep,
              versionConstraint: version,
              isDev: true,
              isPeer: false,
            },
          });
        }
      } catch {
        // Invalid JSON, skip
      }
    }

    return { entities, relationships: [] };
  }
}

// ============================================================================
// Code Graph Builder Class
// ============================================================================

/**
 * CodeGraphBuilder extracts code entities and relationships from source files
 */
export class CodeGraphBuilder {
  private parsers: LanguageParser[] = [
    new TypeScriptParser(),
    new PythonParser(),
    new CSSParser(),
    new JSONParser(),
  ];

  private excludePatterns = [
    /node_modules/,
    /\.git/,
    /\.next/,
    /dist/,
    /build/,
    /\.dyad/,
    /__pycache__/,
    /\.pytest_cache/,
    /coverage/,
    /\.nyc_output/,
  ];

  /**
   * Build knowledge graph from codebase
   */
  async buildGraph(options: CodeGraphBuildOptions): Promise<GraphUpdateResult> {
    const result: GraphUpdateResult = {
      nodesAdded: 0,
      nodesUpdated: 0,
      nodesDeleted: 0,
      edgesAdded: 0,
      edgesUpdated: 0,
      edgesDeleted: 0,
      errors: [],
      timestamp: new Date(),
    };

    try {
      // Get all files to process
      const files = await this.findFiles(options);

      // Process each file
      const allEntities: Array<ExtractedEntity & { appId: number }> = [];
      const allRelationships: ExtractedRelationship[] = [];

      for (const file of files) {
        try {
          const extraction = await this.processFile(file, options.rootPath);
          if (extraction) {
            for (const entity of extraction.entities) {
              allEntities.push({ ...entity, appId: options.appId });
            }
            allRelationships.push(...extraction.relationships);
          }
        } catch (error) {
          result.errors.push({
            message: `Failed to process file ${file}: ${error}`,
            context: { file },
          });
        }
      }

      // Create file nodes
      for (const file of files) {
        const relativePath = path.relative(options.rootPath, file);
        const content = await fs.promises.readFile(file, "utf-8");
        const contentHash = createHash("md5").update(content).update(content).digest("hex");

        allEntities.push({
          type: "file",
          name: path.basename(file),
          filePath: relativePath,
          lineStart: 0,
          lineEnd: content.split("\n").length,
          language: this.getLanguageFromExtension(path.extname(file)),
          appId: options.appId,
          properties: {
            extension: path.extname(file),
            size: content.length,
            contentHash,
            lineCount: content.split("\n").length,
          },
        });
      }

      // Store entities as nodes
      for (const entity of allEntities) {
        try {
          const nodeId = this.generateNodeId(entity);
          
          // Check if node exists
          const existing = await graphStorage.getNode(nodeId);
          
          if (existing) {
            await graphStorage.updateNode(nodeId, {
              name: entity.name,
              filePath: entity.filePath,
              lineStart: entity.lineStart,
              lineEnd: entity.lineEnd,
              properties: entity.properties,
              contentHash: createHash("md5").update(JSON.stringify(entity.properties)).digest("hex"),
            });
            result.nodesUpdated++;
          } else {
            await graphStorage.insertNode({
              id: nodeId,
              appId: entity.appId,
              type: entity.type,
              name: entity.name,
              filePath: entity.filePath,
              lineStart: entity.lineStart,
              lineEnd: entity.lineEnd,
              language: entity.language,
              properties: entity.properties,
              contentHash: createHash("md5").update(JSON.stringify(entity.properties)).digest("hex"),
            });
            result.nodesAdded++;
          }
        } catch (error) {
          result.errors.push({
            message: `Failed to store entity ${entity.name}: ${error}`,
            context: { entity },
          });
        }
      }

      // Create relationships as edges
      for (const rel of allRelationships) {
        try {
          const sourceId = this.generateNodeId({ name: rel.sourceName, type: rel.sourceType, filePath: "", lineStart: 0, lineEnd: 0, language: "", properties: {}, appId: options.appId });
          const targetId = this.generateNodeId({ name: rel.targetName, type: rel.targetType, filePath: "", lineStart: 0, lineEnd: 0, language: "", properties: {}, appId: options.appId });

          // Verify both nodes exist
          const [source, target] = await Promise.all([
            graphStorage.getNode(sourceId),
            graphStorage.getNode(targetId),
          ]);

          if (source && target) {
            const edgeId = `${sourceId}:${rel.type}:${targetId}`;
            await graphStorage.insertEdge({
              id: edgeId,
              appId: options.appId,
              sourceId,
              targetId,
              type: rel.type,
              metadata: rel.metadata,
            });
            result.edgesAdded++;
          }
        } catch (error) {
          // Edge might already exist, that's OK
        }
      }

      // Create "contains" edges (file -> entities in file)
      for (const entity of allEntities.filter(e => e.type !== "file")) {
        try {
          const fileNode = allEntities.find(e => 
            e.type === "file" && 
            e.filePath === entity.filePath &&
            e.appId === entity.appId
          );

          if (fileNode) {
            const fileId = this.generateNodeId(fileNode);
            const entityId = this.generateNodeId(entity);
            const edgeId = `${fileId}:contains:${entityId}`;

            await graphStorage.insertEdge({
              id: edgeId,
              appId: options.appId,
              sourceId: fileId,
              targetId: entityId,
              type: "contains",
            });
            result.edgesAdded++;
          }
        } catch (error) {
          // Edge might already exist
        }
      }

    } catch (error) {
      result.errors.push({
        message: `Failed to build graph: ${error}`,
      });
    }

    return result;
  }

  /**
   * Find all files to process
   */
  private async findFiles(options: CodeGraphBuildOptions): Promise<string[]> {
    const files: string[] = [];
    const extensions = this.parsers.flatMap(p => p.extensions);

    const walk = async (dir: string) => {
      try {
        const entries = await fs.promises.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);

          if (entry.isDirectory()) {
            // Check exclude patterns
            if (!this.excludePatterns.some(p => p.test(fullPath))) {
              await walk(fullPath);
            }
          } else if (entry.isFile()) {
            const ext = path.extname(fullPath);
            if (extensions.includes(ext)) {
              files.push(fullPath);
            }
          }
        }
      } catch {
        // Directory might not exist or be accessible
      }
    };

    await walk(options.rootPath);
    return files;
  }

  /**
   * Process a single file
   */
  private async processFile(
    filePath: string,
    rootPath: string,
  ): Promise<FileExtractionResult | null> {
    const ext = path.extname(filePath);
    const parser = this.parsers.find(p => p.extensions.includes(ext));

    if (!parser) return null;

    const content = await fs.promises.readFile(filePath, "utf-8");
    const relativePath = path.relative(rootPath, filePath);
    const contentHash = createHash("md5").update(content).digest("hex");

    const { entities, relationships } = await parser.parse(content, relativePath);

    return {
      filePath: relativePath,
      language: this.getLanguageFromExtension(ext),
      entities,
      relationships,
      contentHash,
    };
  }

  /**
   * Generate a unique node ID
   */
  private generateNodeId(entity: { name: string; type: string; appId: number }): string {
    return createHash("md5")
      .update(`${entity.appId}:${entity.type}:${entity.name}:${entity.filePath || "global"}`)
      .digest("hex")
      .substring(0, 16);
  }

  /**
   * Get language name from file extension
   */
  private getLanguageFromExtension(ext: string): string {
    const map: Record<string, string> = {
      ".ts": "typescript",
      ".tsx": "typescript",
      ".js": "javascript",
      ".jsx": "javascript",
      ".mjs": "javascript",
      ".cjs": "javascript",
      ".py": "python",
      ".css": "css",
      ".scss": "scss",
      ".less": "less",
      ".json": "json",
    };
    return map[ext] || "unknown";
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

export const codeGraphBuilder = new CodeGraphBuilder();
