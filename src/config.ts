import path from "path";
import "dotenv/config";
import os from "os";
import fs from "fs-extra";
import pino from "pino";
import { kokoroModelPrecision, whisperModels } from "./types/shorts";

const defaultLogLevel: pino.Level = "info";
const defaultPort = 3123;
const whisperVersion = "1.7.1";
const defaultWhisperModel: whisperModels = "medium.en"; // possible options: "tiny", "tiny.en", "base", "base.en", "small", "small.en", "medium", "medium.en", "large-v1", "large-v2", "large-v3", "large-v3-turbo"

// Create the global logger
const versionNumber = process.env.npm_package_version;
export const logger = pino({
  level: process.env.LOG_LEVEL || defaultLogLevel,
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label) => {
      return { level: label };
    },
  },
  base: {
    pid: process.pid,
    version: versionNumber,
  },
});

export class Config {
  private dataDirPath: string;
  private libsDirPath: string;
  private staticDirPath: string;

  public installationSuccessfulPath: string;
  public whisperInstallPath: string;
  public videosDirPath: string;
  public tempDirPath: string;
  public packageDirPath: string;
  public musicDirPath: string;
  public kieApiKey: string;
  public kieImageResolution: "1K" | "2K" | "4K" = "2K";
  public kieOutputFormat: "png" | "jpg" = "png";
  public kiePollIntervalMs: number = 2000;
  public kiePollTimeoutMs: number = 120000;
  public logLevel: pino.Level;
  public whisperVerbose: boolean;
  public port: number;
  public runningInDocker: boolean;
  public devMode: boolean;
  public whisperVersion: string = whisperVersion;
  public whisperModel: whisperModels = defaultWhisperModel;
  public kokoroModelPrecision: kokoroModelPrecision = "fp32";

  // docker-specific, performance-related settings to prevent memory issues
  public concurrency?: number;
  public videoCacheSizeInBytes: number | null = null;

  constructor() {
    this.dataDirPath =
      process.env.DATA_DIR_PATH ||
      path.join(os.homedir(), ".ai-agents-az-video-generator");
    this.libsDirPath = path.join(this.dataDirPath, "libs");

    this.whisperInstallPath = path.join(this.libsDirPath, "whisper");
    this.videosDirPath = path.join(this.dataDirPath, "videos");
    this.tempDirPath = path.join(this.dataDirPath, "temp");
    this.installationSuccessfulPath = path.join(
      this.dataDirPath,
      "installation-successful",
    );

    fs.ensureDirSync(this.dataDirPath);
    fs.ensureDirSync(this.libsDirPath);
    fs.ensureDirSync(this.videosDirPath);
    fs.ensureDirSync(this.tempDirPath);

    this.packageDirPath = path.join(__dirname, "..");
    this.staticDirPath = path.join(this.packageDirPath, "static");
    this.musicDirPath = path.join(this.staticDirPath, "music");

    this.kieApiKey = process.env.KIE_API_KEY as string;

    if (process.env.KIE_IMAGE_RESOLUTION) {
      this.kieImageResolution = process.env.KIE_IMAGE_RESOLUTION as
        | "1K"
        | "2K"
        | "4K";
    }
    if (process.env.KIE_OUTPUT_FORMAT) {
      this.kieOutputFormat = process.env.KIE_OUTPUT_FORMAT as "png" | "jpg";
    }
    if (process.env.KIE_POLL_INTERVAL_MS) {
      this.kiePollIntervalMs = parseInt(process.env.KIE_POLL_INTERVAL_MS);
    }
    if (process.env.KIE_POLL_TIMEOUT_MS) {
      this.kiePollTimeoutMs = parseInt(process.env.KIE_POLL_TIMEOUT_MS);
    }

    this.logLevel = (process.env.LOG_LEVEL || defaultLogLevel) as pino.Level;
    this.whisperVerbose = process.env.WHISPER_VERBOSE === "true";
    this.port = process.env.PORT ? parseInt(process.env.PORT) : defaultPort;
    this.runningInDocker = process.env.DOCKER === "true";
    this.devMode = process.env.DEV === "true";

    if (process.env.WHISPER_MODEL) {
      this.whisperModel = process.env.WHISPER_MODEL as whisperModels;
    }
    if (process.env.KOKORO_MODEL_PRECISION) {
      this.kokoroModelPrecision = process.env
        .KOKORO_MODEL_PRECISION as kokoroModelPrecision;
    }

    this.concurrency = process.env.CONCURRENCY
      ? parseInt(process.env.CONCURRENCY)
      : undefined;

    if (process.env.VIDEO_CACHE_SIZE_IN_BYTES) {
      this.videoCacheSizeInBytes = parseInt(
        process.env.VIDEO_CACHE_SIZE_IN_BYTES,
      );
    }
  }

  public ensureConfig() {
    if (!this.kieApiKey) {
      throw new Error(
        "KIE_API_KEY environment variable is missing. Get your API key from https://kie.ai - see how to run the project: https://github.com/gyoridavid/short-video-maker",
      );
    }
  }
}

export const KOKORO_MODEL = "onnx-community/Kokoro-82M-v1.0-ONNX";
