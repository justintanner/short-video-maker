import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import z from "zod";

import { ShortCreator } from "../../short-creator/ShortCreator";
import { VeoError } from "../../short-creator/libraries/VeoErrors";
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
        description: "Get the status of a video (ready, processing, failed). Returns detailed error information if failed.",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        inputSchema: getVideoStatusSchema as any,
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async (args: any) => {
        const { videoId } = args;
        const statusDetail = this.shortCreator.statusDetail(videoId);

        let responseText: string;
        if (statusDetail.status === 'failed' && statusDetail.error) {
          responseText = JSON.stringify({
            status: statusDetail.status,
            error: {
              type: statusDetail.error.name,
              message: statusDetail.error.message,
              ...(statusDetail.error.veoMessage && { veoMessage: statusDetail.error.veoMessage }),
              ...(statusDetail.error.prompt && { prompt: statusDetail.error.prompt }),
            },
          }, null, 2);
        } else {
          responseText = statusDetail.status;
        }

        return {
          content: [
            {
              type: "text" as const,
              text: responseText,
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

    // New tool: images-to-video
    const imagesToVideoSchema = z.object({
      imageUrls: z
        .array(z.string().url())
        .min(1)
        .max(2)
        .describe("1-2 image URLs. If only 1 provided, it will be used for both start and end frames"),
      prompt: z
        .string()
        .describe("Animation prompt for Veo (camera motion, atmosphere, visual style)"),
      model: z
        .enum(["veo3_fast", "veo3"])
        .optional()
        .default("veo3_fast")
        .describe("Veo model: veo3_fast for speed (default), veo3 for quality"),
    });

    this.mcpServer.registerTool(
      "images-to-video",
      {
        description: "Generate a Veo 3.1 video from 1-2 images using image-to-video animation. Provide 1 image to animate it, or 2 images to transition between them.",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        inputSchema: imagesToVideoSchema as any,
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async (args: any) => {
        try {
          const { imageUrls, prompt, model = "veo3_fast" } = args;

          // Handle 1 or 2 image URLs
          let startImageUrl: string;
          let endImageUrl: string;

          if (imageUrls.length === 1) {
            startImageUrl = imageUrls[0];
            endImageUrl = imageUrls[0]; // Use same image for both frames
          } else {
            startImageUrl = imageUrls[0];
            endImageUrl = imageUrls[1];
          }

          // Construct scene with imageInput and optional endImageInput
          const scenes = [{
            text: "",
            searchTerms: [],
            imageInput: {
              type: "upload" as const,
              value: startImageUrl,
            },
            ...(imageUrls.length === 2 && {
              endImageInput: {
                type: "upload" as const,
                value: endImageUrl,
              }
            }),
            veoPrompt: prompt,
          }];

          // Config for Veo-only mode with selected model
          const config = {
            veoOnly: true,
            veoModel: model,
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
          logger.error(error, "Error generating images-to-video");

          let errorMessage: string;
          if (error instanceof VeoError) {
            errorMessage = JSON.stringify({
              error: error.name,
              message: error.message,
              ...(error.veoMessage && { veoMessage: error.veoMessage }),
              ...(error.prompt && { prompt: error.prompt }),
            }, null, 2);
          } else {
            errorMessage = `Error: ${error instanceof Error ? error.message : "Unknown error"}`;
          }

          return {
            content: [{
              type: "text" as const,
              text: errorMessage,
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
