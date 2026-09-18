import { webSearchService, SearchResult, WebPageContent } from './searchProvider.js';
import { FileService, FileRecord } from './fileService.js';
import { DocumentContextManager, PreparedDocumentContext } from './documentContext.js';

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, any>;
  execute: (args: any, context: ToolExecutionContext) => Promise<any>;
}

export interface ToolExecutionContext {
  userId: string;
  conversationId?: string;
  timeoutMs?: number;
}

export class ToolRegistry {
  private static tools: Map<string, ToolDefinition> = new Map();

  static registerTool(tool: ToolDefinition) {
    this.tools.set(tool.name, tool);
  }

  static getTool(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  static getAllTools(): Array<{ name: string; description: string; parameters: any }> {
    return Array.from(this.tools.values()).map(t => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters
    }));
  }

  static async executeTool(
    name: string,
    args: any,
    context: ToolExecutionContext
  ): Promise<{ success: boolean; result?: any; error?: string }> {
    const tool = this.tools.get(name);
    if (!tool) {
      return {
        success: false,
        error: `Tool '${name}' is not in the authorized Darkano tool allowlist.`
      };
    }

    const timeoutLimit = Math.min(context.timeoutMs || 10000, 15000);

    try {
      const execPromise = tool.execute(args, context);
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Tool '${name}' execution timed out after ${timeoutLimit}ms`)), timeoutLimit)
      );

      const result = await Promise.race([execPromise, timeoutPromise]);
      return { success: true, result };
    } catch (err: any) {
      console.error(`[Darkano ToolRegistry] Error executing ${name}:`, err?.message);
      return { success: false, error: err?.message || 'Tool execution failed' };
    }
  }
}

// 1. Tool: web_search
ToolRegistry.registerTool({
  name: 'web_search',
  description: 'Search the live web for verified information, scientific papers, documentation, or technical news.',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'The search query' },
      limit: { type: 'number', description: 'Maximum number of results (1-10)' }
    },
    required: ['query']
  },
  execute: async (args, context) => {
    const query = String(args.query || '').trim();
    if (!query) throw new Error('Search query parameter is required.');
    const limit = Math.max(1, Math.min(Number(args.limit) || 6, 10));
    return await webSearchService.search(query, limit);
  }
});

// 2. Tool: fetch_web_page
ToolRegistry.registerTool({
  name: 'fetch_web_page',
  description: 'Fetch and extract readable text content from a safe, verified HTTP/HTTPS web page.',
  parameters: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Full URL to fetch (must be public http/https)' }
    },
    required: ['url']
  },
  execute: async (args, context) => {
    const url = String(args.url || '').trim();
    if (!url) throw new Error('Target URL parameter is required.');
    return await webSearchService.fetchPage(url, 8000);
  }
});

// 3. Tool: analyze_document
ToolRegistry.registerTool({
  name: 'analyze_document',
  description: 'Inspect and parse structured details of a user document in the Darkano files vault.',
  parameters: {
    type: 'object',
    properties: {
      fileId: { type: 'string', description: 'ID of the uploaded file' }
    },
    required: ['fileId']
  },
  execute: async (args, context) => {
    const fileId = String(args.fileId || '').trim();
    if (!fileId) throw new Error('File ID is required.');
    const file = FileService.getFile(context.userId, fileId);
    if (!file) throw new Error('File not found or access denied.');

    let meta = {};
    try {
      if (file.metadataJson) meta = JSON.parse(file.metadataJson);
    } catch {}

    return {
      fileId: file.id,
      name: file.originalName,
      mimeType: file.mimeType,
      size: file.fileSize,
      status: file.status,
      metadata: meta,
      preview: file.extractedText?.slice(0, 2000)
    };
  }
});

// 4. Tool: retrieve_document_context
ToolRegistry.registerTool({
  name: 'retrieve_document_context',
  description: 'Retrieve relevant textual or tabular sections from user files matching a natural language query.',
  parameters: {
    type: 'object',
    properties: {
      fileIds: { type: 'array', items: { type: 'string' }, description: 'List of file IDs to inspect' },
      query: { type: 'string', description: 'Topic or query to find relevant sections for' }
    },
    required: ['fileIds', 'query']
  },
  execute: async (args, context) => {
    const fileIds = Array.isArray(args.fileIds) ? args.fileIds : [];
    const query = String(args.query || '').trim();
    return DocumentContextManager.prepareContext(context.userId, fileIds, query);
  }
});
