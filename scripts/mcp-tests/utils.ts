import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

const PORT = process.env.PORT || 3123;
const BASE_URL = `http://localhost:${PORT}`;

export interface McpConnection {
  client: Client;
  transport: SSEClientTransport;
  close: () => Promise<void>;
}

export function logInfo(message: string, ...args: any[]) {
  console.log(`ℹ️  ${message}`, ...args);
}

export function logSuccess(message: string, ...args: any[]) {
  console.log(`✅ ${message}`, ...args);
}

export function logError(message: string, ...args: any[]) {
  console.error(`❌ ${message}`, ...args);
}

export function logStep(step: number, message: string) {
  console.log(`
🔹 Step ${step}: ${message}`);
}

export async function connectToMcpServer(): Promise<McpConnection> {
  logInfo(`Connecting to MCP server at ${BASE_URL}/mcp/sse...`);
  
  const transport = new SSEClientTransport(new URL(`${BASE_URL}/mcp/sse`));
  const client = new Client(
    {
      name: "mcp-test-client",
      version: "1.0.0",
    },
    {
      capabilities: {},
    }
  );

  try {
    await client.connect(transport);
    logSuccess("Connected to MCP server");
    
    return {
      client,
      transport,
      close: async () => {
        try {
          await client.close();
          logInfo("Disconnected from MCP server");
        } catch (e) {
          // Ignore close errors
        }
      }
    };
  } catch (error) {
    logError("Failed to connect to MCP server. Is it running? (pnpm dev)");
    throw error;
  }
}

export async function pollVideoStatus(client: Client, videoId: string, timeoutMinutes: number = 10): Promise<string> {
  logInfo(`Polling status for video ID: ${videoId}`);
  logInfo(`Timeout set to ${timeoutMinutes} minutes`);
  
  let status = "processing";
  let attempts = 0;
  const intervalSeconds = 5;
  const maxAttempts = (timeoutMinutes * 60) / intervalSeconds;
  
  const startTime = Date.now();

  while ((status === "processing" || status === "pending") && attempts < maxAttempts) {
    await new Promise((resolve) => setTimeout(resolve, intervalSeconds * 1000));
    attempts++;
    
    try {
      const result = await client.callTool({
        name: "get-video-status",
        arguments: { videoId },
      });
      
      const content = (result as any).content[0];
      const rawText = content.text;
      
      // Check if it's a JSON error
      try {
        const json = JSON.parse(rawText);
        if (json.status) {
           status = json.status;
        } else {
           status = rawText;
        }
      } catch {
        status = rawText;
      }

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      process.stdout.write(`\r   [${elapsed}s] Current Status: ${status}   `);
      
      if (status === "ready") {
        console.log(""); // New line
        return status;
      } else if (status === "failed") {
        console.log(""); // New line
        // Try to parse detailed error
        try {
           const json = JSON.parse(rawText);
           logError("Video generation failed details:", JSON.stringify(json, null, 2));
        } catch {
           logError("Video generation failed");
        }
        return status;
      }
    } catch (error) {
       console.log(""); // New line
       logError("Error polling status:", error);
    }
  }
  
  console.log(""); // New line
  if (status === "processing") {
    logError(`Timeout reached after ${timeoutMinutes} minutes`);
  }
  
  return status;
}

export function getBaseUrl() {
    return BASE_URL;
}
