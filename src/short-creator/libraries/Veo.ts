import axios from "axios";
import FormData from "form-data";
import fs from "fs";
import { logger } from "../../logger";

interface VeoGenerateRequest {
  prompt: string;
  imageUrls?: string[];
  model?: "veo3" | "veo3_fast";
  generationType?:
    | "TEXT_2_VIDEO"
    | "FIRST_AND_LAST_FRAMES_2_VIDEO"
    | "REFERENCE_2_VIDEO";
  aspectRatio?: "16:9" | "9:16" | "Auto";
  callBackUrl?: string;
  enableTranslation?: boolean;
}

interface VeoTaskResponse {
  code: number;
  msg: string;
  data: {
    taskId: string;
  };
}

interface VeoTaskStatusResponse {
  code: number;
  msg: string;
  data: {
    taskId: string;
    successFlag: number; // 0: Generating, 1: Success, 2: Failed, 3: Generation Failed
    response?: {
      resultUrls: string[];
    };
    errorMessage?: string;
  };
}

const POLLING_INTERVAL_MS = 5000;
const MAX_POLLING_ATTEMPTS = 40; // 3-4 minutes (reduced from 10)
const REQUEST_TIMEOUT_MS = 30000; // 30 second timeout for API requests

interface VeoUploadResponse {
  code: number;
  msg: string;
  data: {
    downloadUrl: string;
    fileName: string;
    fileSize: number;
    filePath: string;
    mimeType: string;
  };
}

export class VeoAPI {
  constructor(private apiKey: string) {}

  /**
   * Upload a file to Veo's file storage and get a public URL
   */
  public async uploadFile(filePath: string): Promise<string> {
    logger.debug({ filePath }, "Uploading file to Veo");

    const form = new FormData();
    form.append("file", fs.createReadStream(filePath));
    form.append("uploadPath", "veo-images"); // Required parameter

    const response = await axios.post<VeoUploadResponse>(
      "https://kieai.redpandaai.co/api/file-stream-upload",
      form,
      {
        headers: {
          ...form.getHeaders(),
          Authorization: `Bearer ${this.apiKey}`,
        },
        timeout: REQUEST_TIMEOUT_MS,
      },
    );

    logger.debug({ response: response.data }, "Veo upload response received");

    if (response.data.code !== 200) {
      throw new Error(`Veo upload failed: ${response.data.msg}`);
    }

    if (!response.data.data || !response.data.data.downloadUrl) {
      throw new Error(
        `Veo upload succeeded but no URL returned: ${JSON.stringify(response.data)}`,
      );
    }

    const uploadedUrl = response.data.data.downloadUrl;
    logger.debug({ url: uploadedUrl }, "File uploaded successfully to Veo");
    return uploadedUrl;
  }

  public async generateVideo(
    prompt: string,
    startFrameUrl: string,
    endFrameUrl: string,
    aspectRatio: "16:9" | "9:16" | "Auto" = "Auto",
  ): Promise<string> {
    const payload: VeoGenerateRequest = {
      prompt,
      model: "veo3", // Default to veo3
      aspectRatio,
      enableTranslation: true,
      imageUrls: [startFrameUrl, endFrameUrl],
      generationType: "FIRST_AND_LAST_FRAMES_2_VIDEO",
    };

    logger.debug({ payload }, "Starting Veo video generation");

    const response = await axios.post<VeoTaskResponse>(
      "https://api.kie.ai/api/v1/veo/generate",
      payload,
      {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        timeout: REQUEST_TIMEOUT_MS,
      },
    );

    if (response.data.code !== 200) {
      throw new Error(`Veo API error: ${response.data.msg}`);
    }

    const taskId = response.data.data.taskId;
    logger.debug({ taskId }, "Veo task started");

    return this.pollTask(taskId);
  }

  private async pollTask(taskId: string): Promise<string> {
    for (let i = 0; i < MAX_POLLING_ATTEMPTS; i++) {
      await new Promise((resolve) => setTimeout(resolve, POLLING_INTERVAL_MS));

      try {
        const response = await axios.get<VeoTaskStatusResponse>(
          `https://api.kie.ai/api/v1/veo/record-info`,
          {
            params: { taskId },
            headers: {
              Authorization: `Bearer ${this.apiKey}`,
            },
            timeout: REQUEST_TIMEOUT_MS,
          },
        );

        const {
          successFlag,
          response: taskResult,
          errorMessage,
        } = response.data.data;

        if (successFlag === 1) {
          if (taskResult?.resultUrls && taskResult.resultUrls.length > 0) {
            logger.debug(
              { taskId, url: taskResult.resultUrls[0] },
              "Veo task completed",
            );
            return taskResult.resultUrls[0];
          }
          throw new Error("Veo task succeeded but no video URL returned");
        } else if (successFlag === 2 || successFlag === 3) {
          throw new Error(
            `Veo task failed: ${errorMessage || "Unknown error"}`,
          );
        }

        // Still generating (successFlag === 0)
        logger.debug({ taskId, attempt: i + 1 }, "Waiting for Veo task...");
      } catch (error) {
        // If the task failed (caught above), rethrow
        if (
          error instanceof Error &&
          error.message.includes("Veo task failed")
        ) {
          throw error;
        }

        // Check for auth/client errors that shouldn't retry
        if (axios.isAxiosError(error) && error.response) {
          const status = error.response.status;

          // Don't retry on auth or rate limit errors
          if (status === 401 || status === 403) {
            throw new Error(
              `Veo authentication failed (check API key): ${JSON.stringify(error.response.data)}`,
            );
          }
          if (status === 429) {
            throw new Error(`Veo rate limit exceeded`);
          }

          // Log other HTTP errors and continue polling
          logger.error(
            { status, data: error.response.data, attempt: i + 1 },
            "Veo polling error (will retry)",
          );
        } else {
          // Log network errors and continue polling
          logger.error({ attempt: i + 1 }, "Veo network error (will retry)");
        }
      }
    }
    throw new Error("Veo task timed out");
  }
}
