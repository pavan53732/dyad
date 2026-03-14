import { z } from "zod";
import log from "electron-log";
import {
  ToolDefinition,
  AgentContext,
  escapeXmlAttr,
  escapeXmlContent,
} from "./types";
import fetch from "node-fetch";

const logger = log.scope("web_search");

const webSearchSchema = z.object({
  query: z.string().describe("The search query to look up on the web"),
});

const DESCRIPTION = `
Use this tool to access real-time information beyond your training data cutoff.

When to Search:
- Current API documentation, library versions, or breaking changes
- Latest best practices, security advisories, or bug fixes
- Specific error messages or troubleshooting solutions
- Recent framework updates or deprecation notices

Query Tips:
- Be specific: Include version numbers, exact error messages, or technical terms
- Add context: "React 19 useEffect cleanup" not just "React hooks"

Examples:

<example>
OpenAI GPT-5 API model names
</example>

<example>
NextJS 14 app router middleware auth
</example>
`;

/**
 * Perform a web search using DuckDuckGo Lite (HTML scraping).
 * This is a free, no-API-key-required approach that fetches DuckDuckGo's
 * lite HTML results page and parses out the search results.
 */
async function performLocalWebSearch(query: string): Promise<string> {
  const url = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`;

  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
  });

  if (!response.ok) {
    throw new Error(
      `DuckDuckGo search failed: ${response.status} ${response.statusText}`,
    );
  }

  const html = await response.text();

  // Parse the DuckDuckGo Lite HTML to extract search results
  const results: string[] = [];

  // DuckDuckGo Lite returns results in a table format.
  // Each result has a link in <a class="result-link"> and a snippet in <td class="result-snippet">
  const linkRegex =
    /<a[^>]*class="result-link"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  const snippetRegex = /<td[^>]*class="result-snippet"[^>]*>([\s\S]*?)<\/td>/gi;

  const links: { url: string; title: string }[] = [];
  let match;

  while ((match = linkRegex.exec(html)) !== null) {
    const linkUrl = match[1].replace(/&amp;/g, "&");
    const title = match[2].replace(/<[^>]*>/g, "").trim();
    links.push({ url: linkUrl, title });
  }

  const snippets: string[] = [];
  while ((match = snippetRegex.exec(html)) !== null) {
    const snippet = match[1]
      .replace(/<[^>]*>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#x27;/g, "'")
      .trim();
    snippets.push(snippet);
  }

  // Combine links and snippets into formatted results
  const maxResults = Math.min(links.length, 10);
  for (let i = 0; i < maxResults; i++) {
    const link = links[i];
    const snippet = snippets[i] || "No description available";
    results.push(
      `### ${i + 1}. ${link.title}\n**URL:** ${link.url}\n${snippet}\n`,
    );
  }

  if (results.length === 0) {
    // Fallback: try to extract any links from the page
    const fallbackLinkRegex =
      /<a[^>]*href="(https?:\/\/[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
    while ((match = fallbackLinkRegex.exec(html)) !== null) {
      const linkUrl = match[1];
      const title = match[2].replace(/<[^>]*>/g, "").trim();
      if (title && !linkUrl.includes("duckduckgo.com") && results.length < 10) {
        results.push(
          `### ${results.length + 1}. ${title}\n**URL:** ${linkUrl}\n`,
        );
      }
    }
  }

  if (results.length === 0) {
    return "No search results found. Try rephrasing your query.";
  }

  return `## Search Results for: "${query}"\n\n${results.join("\n---\n\n")}`;
}

export const webSearchTool: ToolDefinition<z.infer<typeof webSearchSchema>> = {
  name: "web_search",
  description: DESCRIPTION,
  inputSchema: webSearchSchema,
  defaultConsent: "ask",

  // Override: enabled for all users (uses free DuckDuckGo Lite)
  isEnabled: () => true,

  getConsentPreview: (args) => `Search the web: "${args.query}"`,

  execute: async (args, ctx: AgentContext) => {
    logger.log(`Executing web search: ${args.query}`);

    ctx.onXmlStream(`<dyad-web-search query="${escapeXmlAttr(args.query)}">`);

    const result = await performLocalWebSearch(args.query);

    // Write final result to UI and DB with dyad-web-search wrapper
    ctx.onXmlComplete(
      `<dyad-web-search query="${escapeXmlAttr(args.query)}">${escapeXmlContent(result)}</dyad-web-search>`,
    );

    logger.log(`Web search completed for query: ${args.query}`);
    return result;
  },
};
