import axios from "axios";
import FormData from "form-data";
import fs from "fs";
import path from "path";
import { logger } from "../../logger";
import { VeoError, VeoContentPolicyError, VeoAPIError, VeoTimeoutError, isRetryableVeoError } from './VeoErrors';

interface VeoErrorResponse {
  code?: string;
  msg?: string;
  data?: unknown;
}

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
      throw new VeoAPIError(
        `Veo file upload failed`,
        response.data.code,
        response.data.code,
        response.data.msg,
        undefined,
        { fileName: path.basename(filePath) }
      );
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
    model: "veo3" | "veo3_fast" = "veo3_fast",
    maxRetries: number = 2,
  ): Promise<string> {
    let lastError: VeoError | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const payload: VeoGenerateRequest = {
          prompt,
          model,
          aspectRatio,
          enableTranslation: true,
          imageUrls: [startFrameUrl, endFrameUrl],
          generationType: "FIRST_AND_LAST_FRAMES_2_VIDEO",
        };

        logger.debug({
          payload,
          attempt: attempt + 1,
          maxRetries: maxRetries + 1
        }, "Starting Veo video generation");

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
          const errorMessage = response.data.msg || 'Unknown error';

          // Detect content policy violations from message text
          const isContentPolicy =
            errorMessage.toLowerCase().includes('content policy') ||
            errorMessage.toLowerCase().includes('safety') ||
            errorMessage.toLowerCase().includes('violat');

          if (isContentPolicy) {
            throw new VeoContentPolicyError(
              'Veo content policy violation',
              errorMessage,
              prompt,
              { model, aspectRatio, imageUrls: [startFrameUrl, endFrameUrl] }
            );
          } else {
            throw new VeoAPIError(
              'Veo video generation request failed',
              response.data.code,
              response.data.code,
              errorMessage,
              prompt,
              { model, aspectRatio }
            );
          }
        }

        const taskId = response.data.data.taskId;
        logger.debug({ taskId }, "Veo task started");

        return await this.pollTask(taskId, prompt);

      } catch (error) {
        if (axios.isAxiosError(error) && error.response) {
          const data = error.response.data as VeoErrorResponse;
          lastError = new VeoAPIError(
            'Veo API request failed',
            error.response.status,
            data?.code,
            data?.msg || error.message,
            prompt,
            { model, aspectRatio }
          );
        } else if (error instanceof VeoError) {
          lastError = error;
        } else {
          throw error; // Re-throw unknown errors
        }

        // Don't retry if error is not retryable
        if (lastError && !isRetryableVeoError(lastError)) {
          logger.debug({
            error: lastError.toJSON(),
            attempt: attempt + 1
          }, 'Non-retryable Veo error, aborting');
          throw lastError;
        }

        // Retry with exponential backoff
        if (attempt < maxRetries) {
          const backoffMs = Math.min(1000 * Math.pow(2, attempt), 10000);
          logger.warn({
            error: lastError?.toJSON(),
            attempt: attempt + 1,
            maxRetries: maxRetries + 1,
            backoffMs
          }, 'Veo generation failed, retrying after backoff');
          await new Promise(resolve => setTimeout(resolve, backoffMs));
          continue;
        }
      }
    }

    throw lastError || new Error('Veo generation failed after retries');
  }

  private async pollTask(taskId: string, prompt: string): Promise<string> {
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
          const veoMessage = errorMessage || "Unknown error";

          // Detect content policy from error message
          const isContentPolicy =
            veoMessage.toLowerCase().includes('content policy') ||
            veoMessage.toLowerCase().includes('safety') ||
            veoMessage.toLowerCase().includes('violat');

          if (isContentPolicy) {
            throw new VeoContentPolicyError(
              'Veo content policy violation during generation',
              veoMessage,
              prompt,
              { taskId, successFlag }
            );
          } else {
            throw new VeoAPIError(
              'Veo video generation failed',
              undefined,
              successFlag,
              veoMessage,
              prompt,
              { taskId }
            );
          }
        }

        // Still generating (successFlag === 0)
        logger.debug({ taskId, attempt: i + 1 }, "Waiting for Veo task...");
      } catch (error) {
        // If the task failed (VeoError caught above), rethrow
        if (error instanceof VeoError) {
          throw error;
        }

        // Check for auth/client errors that shouldn't retry
        if (axios.isAxiosError(error) && error.response) {
          const status = error.response.status;

          // Don't retry on auth or rate limit errors
          if (status === 401 || status === 403) {
            throw new VeoAPIError(
              `Veo authentication failed (check API key)`,
              status,
              undefined,
              JSON.stringify(error.response.data),
              prompt
            );
          }
          if (status === 429) {
            throw new VeoAPIError(
              `Veo rate limit exceeded`,
              status,
              undefined,
              undefined,
              prompt
            );
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
    throw new VeoTimeoutError(taskId, MAX_POLLING_ATTEMPTS);
  }
}
