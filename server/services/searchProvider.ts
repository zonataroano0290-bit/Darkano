import { GoogleGenAI } from '@google/genai';

export interface SearchResult {
  title: string;
  url: string;
  domain: string;
  snippet: string;
}

export interface WebPageContent {
  url: string;
  domain: string;
  title: string;
  text: string;
  status: number;
}

export interface ResearchExecutionResult {
  query: string;
  searchQueries: string[];
  sources: SearchResult[];
  synthesizedAnswer?: string;
}

export interface SearchProvider {
  readonly id: string;
  readonly name: string;
  isConfigured(): boolean;
  search(query: string, limit?: number): Promise<SearchResult[]>;
  fetchPage(url: string, timeoutMs?: number): Promise<WebPageContent>;
  normalizeResult(raw: any): SearchResult;
  validateResult(result: SearchResult): boolean;
}

export class WebSearchService implements SearchProvider {
  readonly id = 'google-grounding';
  readonly name = 'Google Web Search Grounding';

  private aiClient: GoogleGenAI | null = null;

  private getClient(): GoogleGenAI {
    if (!this.aiClient) {
      const key = process.env.GEMINI_API_KEY;
      if (!key || !key.trim()) {
        throw new Error('Web search requires GEMINI_API_KEY configuration on the server.');
      }
      this.aiClient = new GoogleGenAI({
        apiKey: key.trim(),
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build'
          }
        }
      });
    }
    return this.aiClient;
  }

  isConfigured(): boolean {
    return Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim().length > 0);
  }

  normalizeResult(raw: any): SearchResult {
    const url = String(raw.url || raw.uri || '');
    let domain = '';
    try {
      domain = new URL(url).hostname;
    } catch {}

    return {
      title: String(raw.title || domain || 'Web Resource').trim(),
      url,
      domain,
      snippet: String(raw.snippet || raw.text || '').trim().slice(0, 500)
    };
  }

  validateResult(result: SearchResult): boolean {
    if (!result.url || !result.url.startsWith('http')) return false;
    try {
      const parsed = new URL(result.url);
      return Boolean(parsed.hostname && parsed.protocol.startsWith('http'));
    } catch {
      return false;
    }
  }

  /**
   * Safe URL check to prevent SSRF (Server-Side Request Forgery)
   */
  static isSafeUrl(targetUrl: string): boolean {
    try {
      const parsed = new URL(targetUrl);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return false;
      }
      const host = parsed.hostname.toLowerCase();
      // Block loopbacks and internal hosts
      if (
        host === 'localhost' ||
        host === '127.0.0.1' ||
        host === '0.0.0.0' ||
        host === '::1' ||
        host.endsWith('.local') ||
        host.endsWith('.internal')
      ) {
        return false;
      }

      // Block RFC 1918 private subnets & AWS/Cloud link-local metadata (169.254.169.254)
      const ipParts = host.split('.').map(Number);
      if (ipParts.length === 4 && ipParts.every(n => !isNaN(n) && n >= 0 && n <= 255)) {
        if (ipParts[0] === 10) return false;
        if (ipParts[0] === 127) return false;
        if (ipParts[0] === 169 && ipParts[1] === 254) return false;
        if (ipParts[0] === 172 && ipParts[1] >= 16 && ipParts[1] <= 31) return false;
        if (ipParts[0] === 192 && ipParts[1] === 168) return false;
        if (ipParts[0] === 0) return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Fetch and extract text from an external web page with strict timeout and SSRF guard
   */
  async fetchPage(url: string, timeoutMs: number = 8000): Promise<WebPageContent> {
    if (!WebSearchService.isSafeUrl(url)) {
      throw new Error(`Access to private or restricted network address '${url}' is blocked.`);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const parsedUrl = new URL(url);
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) DarkanoBot/1.5 (Research Extraction)',
          'Accept': 'text/html,application/xhtml+xml,text/plain;q=0.9'
        }
      });

      clearTimeout(timeout);

      if (!res.ok) {
        throw new Error(`HTTP fetch error ${res.status}: ${res.statusText}`);
      }

      const rawHtml = await res.text();
      // Cap at 500KB
      const truncatedHtml = rawHtml.slice(0, 500000);

      // Extract title
      const titleMatch = truncatedHtml.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      const title = titleMatch ? titleMatch[1].trim() : parsedUrl.hostname;

      // Clean HTML to text
      const cleanText = truncatedHtml
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
        .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, ' ')
        .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, ' ')
        .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 16000);

      return {
        url,
        domain: parsedUrl.hostname,
        title,
        text: cleanText,
        status: res.status
      };
    } catch (err: any) {
      clearTimeout(timeout);
      throw new Error(`Failed to fetch web page ${url}: ${err?.message || 'Network timeout'}`);
    }
  }

  /**
   * Real Search using Gemini with Google Search Grounding
   */
  async search(query: string, limit: number = 8): Promise<SearchResult[]> {
    if (!this.isConfigured()) {
      throw new Error('Web search is not configured. Please ensure GEMINI_API_KEY is configured.');
    }

    const client = this.getClient();

    const response = await client.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: `Search the live web for the following query and provide verified factual resources: "${query}"`,
      config: {
        tools: [{ googleSearch: {} }] as any
      }
    });

    const sources: SearchResult[] = [];
    const groundingChunks = (response.candidates?.[0] as any)?.groundingMetadata?.groundingChunks || [];

    for (const chunk of groundingChunks) {
      if (chunk.web?.uri) {
        const result = this.normalizeResult({
          title: chunk.web.title || '',
          url: chunk.web.uri,
          snippet: chunk.web.title || ''
        });
        if (this.validateResult(result) && !sources.some(s => s.url === result.url)) {
          sources.push(result);
          if (sources.length >= limit) break;
        }
      }
    }

    return sources;
  }

  /**
   * Execute real deep research with stages, grounding metadata, and citations
   */
  async executeResearchStream(
    query: string,
    onStage: (stage: string, detail?: any) => void
  ): Promise<{
    searchQueries: string[];
    sources: SearchResult[];
    responseStream: any;
  }> {
    if (!this.isConfigured()) {
      throw new Error('Web search is not configured on this server.');
    }

    onStage('searching', { query });

    const client = this.getClient();

    // Use gemini-3.8-flash with googleSearch tool for real-time live grounding
    const responseStream = await client.models.generateContentStream({
      model: 'gemini-3.8-flash',
      contents: query,
      config: {
        systemInstruction:
          `You are Darkano AI Research Intelligence. Synthesize findings objectively with deep empirical rigor. ` +
          `Whenever stating facts, data points, or claims, cite verifiable sources transparently using Markdown links [Source Title](URL). ` +
          `Structure findings with clear analytical headers, executive summary, comparative data points, and primary sources.`,
        tools: [{ googleSearch: {} }] as any
      }
    });

    return {
      searchQueries: [query],
      sources: [],
      responseStream
    };
  }
}

export const webSearchService = new WebSearchService();
