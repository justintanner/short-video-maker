import { OrientationEnum } from "./../types/shorts";
/* eslint-disable @remotion/deterministic-randomness */
import fs from "fs-extra";
import cuid from "cuid";
import path from "path";
import https from "https";
import http from "http";

import { Kokoro } from "./libraries/Kokoro";
import { Remotion } from "./libraries/Remotion";
import { Whisper } from "./libraries/Whisper";
import { FFMpeg } from "./libraries/FFmpeg";
import { PexelsAPI } from "./libraries/Pexels";
import { VeoAPI } from "./libraries/Veo";
import { NanoBananaPro } from "./libraries/NanoBananaPro";
import { Config } from "../config";
import { logger } from "../logger";
import { MusicManager } from "./music";
import type {
  SceneInput,
  RenderConfig,
  Scene,
  VideoStatus,
  MusicMoodEnum,
  MusicTag,
  MusicForVideo,
} from "../types/shorts";

export class ShortCreator {
  private queue: {
    sceneInput: SceneInput[];
    config: RenderConfig;
    id: string;
  }[] = [];
  constructor(
    private config: Config,
    private remotion: Remotion,
    private kokoro: Kokoro,
    private whisper: Whisper,
    private ffmpeg: FFMpeg,
    private pexelsApi: PexelsAPI,
    private veoApi: VeoAPI,
    private nanoBananaPro: NanoBananaPro,
    private musicManager: MusicManager,
  ) {}

  public status(id: string): VideoStatus {
    const videoPath = this.getVideoPath(id);
    if (this.queue.find((item) => item.id === id)) {
      return "processing";
    }
    if (fs.existsSync(videoPath)) {
      return "ready";
    }
    return "failed";
  }

  public async generateImage(prompt: string): Promise<string> {
    const fileName = await this.nanoBananaPro.generateImage(prompt);
    return `http://localhost:${this.config.port}/api/tmp/${fileName}`;
  }

  public async saveUploadedImage(base64Data: string): Promise<string> {
    const matches = base64Data.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      throw new Error("Invalid base64 string");
    }

    const type = matches[1];
    const data = Buffer.from(matches[2], "base64");
    const extension = type.split("/")[1] || "png";
    const fileName = `${cuid()}.${extension}`;
    const filePath = path.join(this.config.tempDirPath, fileName);

    await fs.writeFile(filePath, data);
    return `http://localhost:${this.config.port}/api/tmp/${fileName}`;
  }

  public addToQueue(sceneInput: SceneInput[], config: RenderConfig): string {
    // todo add mutex lock
    const id = cuid();
    this.queue.push({
      sceneInput,
      config,
      id,
    });
    if (this.queue.length === 1) {
      this.processQueue();
    }
    return id;
  }

  private async processQueue(): Promise<void> {
    // todo add a semaphore
    if (this.queue.length === 0) {
      return;
    }
    const { sceneInput, config, id } = this.queue[0];
    logger.debug(
      { sceneInput, config, id },
      "Processing video item in the queue",
    );
    try {
      await this.createShort(id, sceneInput, config);
      logger.debug({ id }, "Video created successfully");
    } catch (error: unknown) {
      logger.error(error, "Error creating video");
    } finally {
      this.queue.shift();
      this.processQueue();
    }
  }

  private async createShort(
    videoId: string,
    inputScenes: SceneInput[],
    config: RenderConfig,
  ): Promise<string> {
    logger.debug(
      {
        inputScenes,
        config,
      },
      "Creating short video",
    );

    // Veo-only pipeline bypass - skip TTS/Whisper/Remotion
    if (config.veoOnly) {
      return this.createVeoOnlyShort(videoId, inputScenes, config);
    }

    const scenes: Scene[] = [];
    let totalDuration = 0;
    const excludeVideoIds = [];
    const tempFiles = [];

    const orientation: OrientationEnum =
      config.orientation || OrientationEnum.landscape;

    let index = 0;
    for (const scene of inputScenes) {
      const audio = await this.kokoro.generate(
        scene.text,
        config.voice ?? "af_heart",
      );
      let { audioLength } = audio;
      const { audio: audioStream } = audio;

      // add the paddingBack in seconds to the last scene
      if (index + 1 === inputScenes.length && config.paddingBack) {
        audioLength += config.paddingBack / 1000;
      }

      const tempId = cuid();
      const tempWavFileName = `${tempId}.wav`;
      const tempMp3FileName = `${tempId}.mp3`;
      const tempWavPath = path.join(this.config.tempDirPath, tempWavFileName);
      const tempMp3Path = path.join(this.config.tempDirPath, tempMp3FileName);
      tempFiles.push(tempWavPath, tempMp3Path);

      await this.ffmpeg.saveNormalizedAudio(audioStream, tempWavPath);
      const captions = await this.whisper.CreateCaption(tempWavPath);

      await this.ffmpeg.saveToMp3(audioStream, tempMp3Path);

      let videoUrl: string | undefined;
      let imageUrl: string | undefined;

      if (scene.imageInput && scene.imageInput.value) {
        // Use the provided image and animate it with Veo
        const inputImage = scene.imageInput.value;
        logger.debug({ imageUrl: inputImage }, "Using provided image for scene, animating with Veo");

        const tempVideoFileName = `${tempId}_veo.mp4`;
        const tempVideoPath = path.join(
            this.config.tempDirPath,
            tempVideoFileName,
        );
        tempFiles.push(tempVideoPath);

        const aspectRatio = orientation === OrientationEnum.landscape ? "16:9" : "9:16";
        const prompt = scene.veoPrompt || scene.text || scene.searchTerms.join(", ");

        try {
          const veoUrl = await this.veoApi.generateVideo(
            prompt,
            inputImage,   // Start frame
            inputImage,   // End frame (same image)
            aspectRatio
          );
          
          logger.debug(`Downloading Veo video from ${veoUrl} to ${tempVideoPath}`);

          await new Promise<void>((resolve, reject) => {
            const fileStream = fs.createWriteStream(tempVideoPath);
            https
                .get(veoUrl, (response: http.IncomingMessage) => {
                  if (response.statusCode !== 200) {
                    reject(
                        new Error(`Failed to download Veo video: ${response.statusCode}`),
                    );
                    return;
                  }
                  response.pipe(fileStream);
                  fileStream.on("finish", () => {
                    fileStream.close();
                    logger.debug(`Veo video downloaded successfully to ${tempVideoPath}`);
                    resolve();
                  });
                })
                .on("error", (err: Error) => {
                  fs.unlink(tempVideoPath, () => {}); 
                  logger.error(err, "Error downloading Veo video:");
                  reject(err);
                });
          });
          
          videoUrl = `http://localhost:${this.config.port}/api/tmp/${tempVideoFileName}`;
        } catch (error) {
           logger.error(error, "Failed to generate/download Veo video, falling back to static image");
        }
        
        if (!videoUrl) {
           imageUrl = inputImage;
        }

      } else {
        // Fallback to Pexels video
        const tempVideoFileName = `${tempId}.mp4`;
        const tempVideoPath = path.join(
            this.config.tempDirPath,
            tempVideoFileName,
        );
        tempFiles.push(tempVideoPath);

        const video = await this.pexelsApi.findVideo(
            scene.searchTerms,
            audioLength,
            excludeVideoIds,
            orientation,
        );

        logger.debug(`Downloading video from ${video.url} to ${tempVideoPath}`);

        await new Promise<void>((resolve, reject) => {
          const fileStream = fs.createWriteStream(tempVideoPath);
          https
              .get(video.url, (response: http.IncomingMessage) => {
                if (response.statusCode !== 200) {
                  reject(
                      new Error(`Failed to download video: ${response.statusCode}`),
                  );
                  return;
                }

                response.pipe(fileStream);

                fileStream.on("finish", () => {
                  fileStream.close();
                  logger.debug(`Video downloaded successfully to ${tempVideoPath}`);
                  resolve();
                });
              })
              .on("error", (err: Error) => {
                fs.unlink(tempVideoPath, () => {}); // Delete the file if download failed
                logger.error(err, "Error downloading video:");
                reject(err);
              });
        });

        excludeVideoIds.push(video.id);
        videoUrl = `http://localhost:${this.config.port}/api/tmp/${tempVideoFileName}`;
      }

      scenes.push({
        captions,
        video: videoUrl,
        image: imageUrl,
        audio: {
          url: `http://localhost:${this.config.port}/api/tmp/${tempMp3FileName}`,
          duration: audioLength,
        },
      });

      totalDuration += audioLength;
      index++;
    }
    if (config.paddingBack) {
      totalDuration += config.paddingBack / 1000;
    }

    const selectedMusic = this.findMusic(totalDuration, config.music);
    logger.debug({ selectedMusic }, "Selected music for the video");

    await this.remotion.render(
      {
        music: selectedMusic,
        scenes,
        config: {
          durationMs: totalDuration * 1000,
          paddingBack: config.paddingBack,
          ...{
            captionBackgroundColor: config.captionBackgroundColor,
            captionPosition: config.captionPosition,
          },
          musicVolume: config.musicVolume,
        },
      },
      videoId,
      orientation,
    );

    for (const file of tempFiles) {
      fs.removeSync(file);
    }

    return videoId;
  }

  /**
   * Create a video using only Veo - skip TTS, Whisper, and Remotion entirely
   */
  private async createVeoOnlyShort(
    videoId: string,
    inputScenes: SceneInput[],
    config: RenderConfig,
  ): Promise<string> {
    logger.debug(
      { videoId, inputScenes, config },
      "Creating Veo-only video (no TTS/Whisper/Remotion)",
    );

    // Only process first scene for veo-only mode
    const scene = inputScenes[0];

    if (!scene.imageInput || !scene.imageInput.value) {
      throw new Error("Veo-only mode requires an imageInput");
    }

    let inputImage = scene.imageInput.value;
    const orientation: OrientationEnum =
      config.orientation || OrientationEnum.landscape;
    const aspectRatio =
      orientation === OrientationEnum.landscape ? "16:9" : "9:16";
    const prompt =
      scene.veoPrompt || scene.text || scene.searchTerms.join(", ");

    // If the image is a localhost URL (static file), upload it to Veo first
    if (inputImage.includes("localhost") || inputImage.includes("127.0.0.1")) {
      logger.debug(
        { originalUrl: inputImage },
        "Detected localhost URL, uploading to Veo",
      );

      // Convert localhost URL to file path
      // e.g., http://localhost:3123/static/1080p-blank.png -> /path/to/static/1080p-blank.png
      const urlPath = new URL(inputImage).pathname;
      const fileName = path.basename(urlPath);

      let filePath: string;
      if (urlPath.startsWith("/static/")) {
        // Static files are served from the static directory
        filePath = path.join(process.cwd(), "static", fileName);
      } else if (urlPath.startsWith("/api/tmp/")) {
        // Temp files are served from the temp directory
        filePath = path.join(this.config.tempDirPath, fileName);
      } else {
        throw new Error(`Unsupported URL path: ${urlPath}`);
      }

      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }

      // Upload to Veo and get public URL
      inputImage = await this.veoApi.uploadFile(filePath);
      logger.debug({ publicUrl: inputImage }, "Image uploaded to Veo");
    }

    logger.debug({ prompt, inputImage, aspectRatio }, "Generating Veo video");

    // Generate video with Veo (start and end frames are the same image URL)
    const veoUrl = await this.veoApi.generateVideo(
      prompt,
      inputImage, // Start frame
      inputImage, // End frame (same image)
      aspectRatio,
    );

    // Download the video directly to final location (not temp)
    const videoPath = this.getVideoPath(videoId);

    logger.debug(
      { veoUrl, videoPath },
      "Downloading Veo video to final location",
    );

    await new Promise<void>((resolve, reject) => {
      const fileStream = fs.createWriteStream(videoPath);
      const request = https.get(veoUrl, (response: http.IncomingMessage) => {
        if (response.statusCode !== 200) {
          reject(
            new Error(`Failed to download Veo video: ${response.statusCode}`),
          );
          return;
        }

        response.pipe(fileStream);

        fileStream.on("finish", () => {
          fileStream.close();
          logger.debug({ videoPath }, "Veo video downloaded successfully");
          resolve();
        });
      });

      // Add timeout for download (60 seconds)
      request.setTimeout(60000, () => {
        request.destroy();
        fs.unlink(videoPath, () => {});
        reject(new Error("Veo video download timed out after 60 seconds"));
      });

      request.on("error", (err: Error) => {
        fs.unlink(videoPath, () => {});
        logger.error(err, "Error downloading Veo video");
        reject(err);
      });
    });

    logger.debug(
      { videoId, videoPath },
      "Veo-only video created successfully",
    );
    return videoId;
  }

  public getVideoPath(videoId: string): string {
    return path.join(this.config.videosDirPath, `${videoId}.mp4`);
  }

  public deleteVideo(videoId: string): void {
    const videoPath = this.getVideoPath(videoId);
    fs.removeSync(videoPath);
    logger.debug({ videoId }, "Deleted video file");
  }

  public getVideo(videoId: string): Buffer {
    const videoPath = this.getVideoPath(videoId);
    if (!fs.existsSync(videoPath)) {
      throw new Error(`Video ${videoId} not found`);
    }
    return fs.readFileSync(videoPath);
  }

  private findMusic(videoDuration: number, tag?: MusicMoodEnum): MusicForVideo {
    const musicFiles = this.musicManager.musicList().filter((music) => {
      if (tag) {
        return music.mood === tag;
      }
      return true;
    });
    return musicFiles[Math.floor(Math.random() * musicFiles.length)];
  }

  public ListAvailableMusicTags(): MusicTag[] {
    const tags = new Set<MusicTag>();
    this.musicManager.musicList().forEach((music) => {
      tags.add(music.mood as MusicTag);
    });
    return Array.from(tags.values());
  }

  public listAllVideos(): { id: string; status: VideoStatus }[] {
    const videos: { id: string; status: VideoStatus }[] = [];

    // Check if videos directory exists
    if (!fs.existsSync(this.config.videosDirPath)) {
      return videos;
    }

    // Read all files in the videos directory
    const files = fs.readdirSync(this.config.videosDirPath);

    // Filter for MP4 files and extract video IDs
    for (const file of files) {
      if (file.endsWith(".mp4")) {
        const videoId = file.replace(".mp4", "");

        let status: VideoStatus = "ready";
        const inQueue = this.queue.find((item) => item.id === videoId);
        if (inQueue) {
          status = "processing";
        }

        videos.push({ id: videoId, status });
      }
    }

    // Add videos that are in the queue but not yet rendered
    for (const queueItem of this.queue) {
      const existingVideo = videos.find((v) => v.id === queueItem.id);
      if (!existingVideo) {
        videos.push({ id: queueItem.id, status: "processing" });
      }
    }

    return videos;
  }

  public ListAvailableVoices(): string[] {
    return this.kokoro.listAvailableVoices();
  }
}
