import https from "https";
import http from "http";
import fs from "fs-extra";
import path from "path";
import cuid from "cuid";

import { logger } from "../../logger";
import { OrientationEnum } from "../../types/shorts";
import type {
  Image,
  KIETaskRequest,
  KIETaskResponse,
  KIETaskStatus,
  KIETaskResult,
} from "../../types/image";

const defaultPollIntervalMs = 2000;
const defaultTimeoutMs = 120000;
const maxPollIntervalMs = 10000;

export class KIEAPI {
  private baseUrl = "https://api.kie.ai/api/v1";

  constructor(
    private API_KEY: string,
    private tempDirPath: string,
    private pollIntervalMs: number = defaultPollIntervalMs,
    private pollTimeoutMs: number = defaultTimeoutMs,
  ) {}

  async generateImage(
    searchTerms: string[],
    sceneText: string,
    orientation: OrientationEnum,
  ): Promise<Image> {
    if (!this.API_KEY) {
      throw new Error("KIE API key not set");
    }

    logger.debug(
      { searchTerms, sceneText, orientation },
      "Generating image via KIE API",
    );

    const prompt = this.buildPrompt(searchTerms, sceneText);
    const aspectRatio = this.mapOrientationToAspectRatio(orientation);

    const taskId = await this.createTask(prompt, aspectRatio);
    logger.debug({ taskId, prompt }, "KIE task created");

    const result = await this.pollTaskStatus(taskId);
    logger.debug({ taskId, imageUrl: result.imageUrl }, "KIE task completed");

    const tempFileName = `${cuid()}.png`;
    const tempFilePath = path.join(this.tempDirPath, tempFileName);

    await this.downloadImage(result.imageUrl, tempFilePath);
    logger.debug({ tempFilePath }, "Image downloaded");

    return {
      id: taskId,
      url: tempFilePath, // Local file path
      width: result.width,
      height: result.height,
      aspectRatio,
    };
  }

  private buildPrompt(searchTerms: string[], sceneText: string): string {
    const basePrompt = searchTerms.join(", ");
    const contextSnippet = sceneText.substring(0, 50).trim();

    const qualityModifiers =
      "cinematic, high quality, detailed, professional photography";

    return `${basePrompt}, ${contextSnippet}, ${qualityModifiers}`;
  }

  private mapOrientationToAspectRatio(orientation: OrientationEnum): string {
    return orientation === OrientationEnum.portrait ? "9:16" : "16:9";
  }

  private async createTask(
    prompt: string,
    aspectRatio: string,
  ): Promise<string> {
    const requestBody: KIETaskRequest = {
      model: "nano-banana-pro",
      input: {
        prompt,
        image_input: [],
        aspect_ratio: aspectRatio as "9:16" | "16:9",
        resolution: "2K",
        output_format: "png",
      },
    };

    const response = await fetch(`${this.baseUrl}/jobs/createTask`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.API_KEY}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      if (response.status === 401) {
        throw new Error(
          "Invalid KIE API key - get a valid key from https://kie.ai",
        );
      }
      throw new Error(
        `KIE API error: ${response.status} ${response.statusText} - ${errorText}`,
      );
    }

    const data: KIETaskResponse = await response.json();

    if (data.code !== 200) {
      throw new Error(`KIE API error: ${data.message}`);
    }

    return data.data.taskId;
  }

  private async pollTaskStatus(
    taskId: string,
  ): Promise<{ imageUrl: string; width: number; height: number }> {
    const startTime = Date.now();
    let pollInterval = this.pollIntervalMs;
    let attempt = 0;

    while (Date.now() - startTime < this.pollTimeoutMs) {
      attempt++;

      logger.debug({ taskId, attempt, pollInterval }, "Polling KIE task status");

      const response = await fetch(
        `${this.baseUrl}/jobs/recordInfo?taskId=${taskId}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${this.API_KEY}`,
          },
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `KIE API polling error: ${response.status} - ${errorText}`,
        );
      }

      const data: KIETaskStatus = await response.json();

      if (data.data.state === "success" && data.data.resultJson) {
        const result: KIETaskResult = JSON.parse(data.data.resultJson);
        if (result.resultUrls && result.resultUrls.length > 0) {
          // Calculate dimensions based on aspect ratio
          const aspectRatio = this.extractAspectRatioFromTaskId(taskId);
          const { width, height } = this.calculateDimensions(aspectRatio);

          return {
            imageUrl: result.resultUrls[0],
            width,
            height,
          };
        }
      }

      if (data.data.state === "fail") {
        throw new Error(
          `KIE image generation failed for task ${taskId}: ${data.data.failMsg || "Unknown error"}`,
        );
      }

      // Exponential backoff with cap
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
      pollInterval = Math.min(pollInterval + 2000, maxPollIntervalMs);
    }

    throw new Error(
      `KIE task ${taskId} timed out after ${this.pollTimeoutMs}ms`,
    );
  }

  private extractAspectRatioFromTaskId(_taskId: string): string {
    // We don't have access to the original aspect ratio from the task response
    // So we'll store it temporarily or calculate based on standard dimensions
    // For now, return a default - this is a simplification
    // In production, we'd want to track this better
    return "9:16";
  }

  private calculateDimensions(
    aspectRatio: string,
  ): { width: number; height: number } {
    // 2K resolution dimensions for different aspect ratios
    if (aspectRatio === "9:16") {
      return { width: 1080, height: 1920 }; // Portrait
    } else if (aspectRatio === "16:9") {
      return { width: 1920, height: 1080 }; // Landscape
    }
    // Default to portrait
    return { width: 1080, height: 1920 };
  }

  private async downloadImage(
    imageUrl: string,
    tempFilePath: string,
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const fileStream = fs.createWriteStream(tempFilePath);

      https
        .get(imageUrl, (response: http.IncomingMessage) => {
          if (response.statusCode !== 200) {
            reject(
              new Error(`Failed to download image: ${response.statusCode}`),
            );
            return;
          }

          response.pipe(fileStream);

          fileStream.on("finish", () => {
            fileStream.close();
            logger.debug(`Image downloaded successfully to ${tempFilePath}`);
            resolve();
          });
        })
        .on("error", (err: Error) => {
          fs.unlink(tempFilePath, () => {});
          logger.error(err, "Error downloading image");
          reject(err);
        });
    });
  }
}
