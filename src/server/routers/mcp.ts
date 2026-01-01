import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import z from "zod";

import { ShortCreator } from "../../short-creator/ShortCreator";
import { logger } from "../../logger";
import { Config } from "../../config";
import {
  renderConfig,
  sceneInput,
  OrientationEnum,
} from "../../types/shorts";

export class MCPRouter {
  router: express.Router;
  shortCreator: ShortCreator;
  transports: { [sessionId: string]: SSEServerTransport } = {};
  mcpServer: McpServer;
  private config: Config;
  constructor(config: Config, shortCreator: ShortCreator) {
    this.router = express.Router();
    this.config = config;
    this.shortCreator = shortCreator;

    this.mcpServer = new McpServer({
      name: "Short Creator",
      version: "0.0.1",
    });

    this.setupMCPServer();
    this.setupRoutes();
  }

  private setupMCPServer() {
    const getVideoStatusSchema = z.object({
      videoId: z.string().describe("The ID of the video"),
    });

    this.mcpServer.registerTool(
      "get-video-status",
      {
        description: "Get the status of a video (ready, processing, failed)",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        inputSchema: getVideoStatusSchema as any,
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async (args: any) => {
        const { videoId } = args;
        const status = this.shortCreator.status(videoId);
        return {
          content: [
            {
              type: "text" as const,
              text: status,
            },
          ],
        };
      },
    );

    const createShortVideoSchema = z.object({
      scenes: z.array(sceneInput),
      config: renderConfig,
    });

    this.mcpServer.registerTool(
      "create-short-video",
      {
        description: "Create a short video from a list of scenes",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        inputSchema: createShortVideoSchema as any,
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async (args: any) => {
        const { scenes, config } = args;
        const videoId = await this.shortCreator.addToQueue(scenes, config);

        return {
          content: [
            {
              type: "text" as const,
              text: videoId,
            },
          ],
        };
      },
    );

    // New tool: generate-veo-from-blank
    const generateVeoFromBlankSchema = z.object({
      prompt: z.string().describe("Animation prompt for Veo (camera motion, atmosphere, visual style)"),
    });

    this.mcpServer.registerTool(
      "generate-veo-from-blank",
      {
        description: "Generate a Veo 3.1 video from a blank 1080p landscape image using pure Veo mode (no TTS/Whisper/Remotion)",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        inputSchema: generateVeoFromBlankSchema as any,
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async (args: any) => {
        try {
          const { prompt } = args;

          // Construct blank image URL using localhost
          const blankImageUrl = `http://localhost:${this.config.port}/static/1080p-blank.png`;

          // Construct scene with imageInput and veoPrompt
          // Note: text and searchTerms are unused in veoOnly mode but required by schema
          const scenes = [{
            text: "",
            searchTerms: [],
            imageInput: {
              type: "upload" as const,
              value: blankImageUrl,
            },
            veoPrompt: prompt,
          }];

          // Config for Veo-only mode (landscape orientation)
          const config = {
            veoOnly: true,
            orientation: OrientationEnum.landscape,
          };

          const videoId = await this.shortCreator.addToQueue(scenes, config);

          return {
            content: [{
              type: "text" as const,
              text: videoId,
            }],
          };
        } catch (error) {
          logger.error(error, "Error generating veo-from-blank video");
          return {
            content: [{
              type: "text" as const,
              text: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
            }],
          };
        }
      }
    );
  }

  private setupRoutes() {
    this.router.get("/sse", async (req, res) => {
      logger.info("SSE GET request received");

      const transport = new SSEServerTransport("/mcp/messages", res);
      this.transports[transport.sessionId] = transport;
      res.on("close", () => {
        delete this.transports[transport.sessionId];
      });
      await this.mcpServer.connect(transport);
    });

    this.router.post("/messages", async (req, res) => {
      logger.info("SSE POST request received");

      const sessionId = req.query.sessionId as string;
      const transport = this.transports[sessionId];
      if (transport) {
        await transport.handlePostMessage(req, res);
      } else {
        res.status(400).send("No transport found for sessionId");
      }
    });
  }
}
