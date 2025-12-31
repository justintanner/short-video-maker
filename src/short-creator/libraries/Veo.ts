import axios from "axios";
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
const MAX_POLLING_ATTEMPTS = 120; // 10 minutes

export class VeoAPI {
  constructor(private apiKey: string) {}

  public async generateVideo(
    prompt: string,
    imageUrl?: string,
    aspectRatio: "16:9" | "9:16" | "Auto" = "Auto",
  ): Promise<string> {
    const payload: VeoGenerateRequest = {
      prompt,
      model: "veo3_fast", // Default to fast
      aspectRatio,
      enableTranslation: true,
    };

    if (imageUrl) {
      payload.imageUrls = [imageUrl];
      payload.generationType = "FIRST_AND_LAST_FRAMES_2_VIDEO";
    } else {
      payload.generationType = "TEXT_2_VIDEO";
    }

    logger.debug({ payload }, "Starting Veo video generation");

    const response = await axios.post<VeoTaskResponse>(
      "https://api.kie.ai/api/v1/veo/generate",
      payload,
      {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
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
        // Otherwise continue polling (maybe transient network error)
        if (axios.isAxiosError(error) && error.response) {
          logger.error(
            { status: error.response.status, data: error.response.data },
            "Veo polling error",
          );
        } else {
            logger.error(error, "Veo polling error");
        }
      }
    }
    throw new Error("Veo task timed out");
  }
}
