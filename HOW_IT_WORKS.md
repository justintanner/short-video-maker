# How Short Video Maker Creates Videos

This document explains the technical process of how Short Video Maker generates videos from text inputs.

## Overview

Short Video Maker is an intelligent video compositor that combines multiple technologies to create polished short-form videos. It **does not generate videos from scratch** using AI - instead, it assembles videos from components: generated audio, stock footage, timed captions, and background music.

## The Video Generation Pipeline

### 1. Queue System

When you request a video, it enters a processing queue managed by `ShortCreator.ts:54-86`:

```typescript
public addToQueue(sceneInput: SceneInput[], config: RenderConfig): string {
  const id = cuid();
  this.queue.push({ sceneInput, config, id });
  if (this.queue.length === 1) {
    this.processQueue();
  }
  return id;
}
```

Videos are processed sequentially (one at a time) to manage system resources effectively. Each video gets a unique ID that you can use to check status and retrieve the final result.

### 2. Scene-by-Scene Processing

Each video consists of multiple "scenes" - individual segments with their own narration and background video. The system processes each scene through five steps:

#### Step A: Text → Audio (Kokoro TTS)

**Location**: `ShortCreator.ts:111-116`

```typescript
const audio = await this.kokoro.generate(
  scene.text,
  config.voice ?? "af_heart"
);
```

**What happens**:
- Converts your input text into spoken audio using the Kokoro text-to-speech model
- Returns an audio stream and precise duration
- Saves to a temporary `.wav` file for processing
- Uses the specified voice (or defaults to `af_heart`)

**Library**: `src/short-creator/libraries/Kokoro.ts`

#### Step B: Audio → Captions (Whisper)

**Location**: `ShortCreator.ts:137`

```typescript
const captions = await this.whisper.CreateCaption(tempWavPath);
```

**What happens**:
- Uses whisper.cpp (speech recognition) to transcribe the audio
- Generates word-level timestamps for each word
- Returns array of caption objects: `{ text: string, startMs: number, endMs: number }`
- These timestamps enable perfect synchronization of captions with narration

**Library**: `src/short-creator/libraries/Whisper.ts`

#### Step C: Audio Format Conversion (FFmpeg)

**Location**: `ShortCreator.ts:139`

```typescript
await this.ffmpeg.saveToMp3(audioStream, tempMp3Path);
```

**What happens**:
- Converts the audio stream to MP3 format for final video composition
- Normalizes audio levels for consistent volume

**Library**: `src/short-creator/libraries/FFmpeg.ts`

#### Step D: Background Video Search (Pexels)

**Location**: `ShortCreator.ts:140-173`

```typescript
const video = await this.pexelsApi.findVideo(
  scene.searchTerms,
  audioLength,
  excludeVideoIds,
  orientation
);
```

**What happens**:
- Searches the Pexels API using your provided search terms
- Filters videos by:
  - **Duration**: Must be long enough for the narration
  - **Orientation**: Portrait (9:16) or landscape (16:9)
  - **Exclusion list**: Avoids reusing videos from previous scenes
- Falls back to generic terms (`nature`, `globe`, `space`, `ocean`) if no matches found
- Downloads the selected video to temporary storage via HTTPS

**Library**: `src/short-creator/libraries/Pexels.ts`

#### Step E: Scene Assembly

**Location**: `ShortCreator.ts:177-187`

```typescript
scenes.push({
  captions,
  video: `http://localhost:${this.config.port}/api/tmp/${tempVideoFileName}`,
  audio: {
    url: `http://localhost:${this.config.port}/api/tmp/${tempMp3FileName}`,
    duration: audioLength,
  },
});
```

**What happens**:
- Combines all scene components into a data structure
- Uses localhost URLs to reference temporary files
- Tracks total video duration across all scenes
- Adds padding time to the last scene if configured

### 3. Music Selection

**Location**: `ShortCreator.ts:193-194`

```typescript
const selectedMusic = this.findMusic(totalDuration, config.music);
```

**What happens**:
- Scans the `static/music/` directory for available background music
- Filters by mood/tag if specified (e.g., `chill`, `happy`, `dark`, `sad`)
- Randomly selects a track that fits the total video duration
- Returns music file path and metadata

**Library**: `src/short-creator/music.ts`

### 4. Video Composition (Remotion)

**Location**: `ShortCreator.ts:196-212`

```typescript
await this.remotion.render({
  music: selectedMusic,
  scenes,
  config: {
    durationMs: totalDuration * 1000,
    paddingBack: config.paddingBack,
    captionBackgroundColor: config.captionBackgroundColor,
    captionPosition: config.captionPosition,
    musicVolume: config.musicVolume,
  },
}, videoId, orientation);
```

**What happens** (this is where the magic happens):

1. **Launches headless Chrome browser** - Remotion uses Puppeteer to control Chrome
2. **Renders React components** - Video is defined as React code in `src/components/videos/`:
   - `PortraitVideo.tsx` for 9:16 videos
   - `LandscapeVideo.tsx` for 16:9 videos
3. **Composes layers**:
   - Background video layer (Pexels footage)
   - Audio narration track (Kokoro TTS)
   - Caption overlays with word-by-word timing (Whisper data)
   - Background music layer with volume control
4. **Screenshots each frame** - Chrome renders each frame at 30 FPS
5. **Stitches frames together** - Creates final MP4 video file
6. **Saves to**: `{DATA_DIR}/videos/{videoId}.mp4`

**Libraries**:
- `src/short-creator/libraries/Remotion.ts` - Wrapper for Remotion API
- `src/components/videos/PortraitVideo.tsx` - Portrait template
- `src/components/videos/LandscapeVideo.tsx` - Landscape template

### 5. Cleanup

**Location**: `ShortCreator.ts:214-216`

```typescript
for (const file of tempFiles) {
  fs.removeSync(file);
}
```

**What happens**:
- Deletes all temporary files (WAV, MP3, downloaded videos)
- Keeps only the final rendered MP4 in the videos directory
- Frees up disk space for subsequent renders

## The Key Insight

Short Video Maker is **not a generative AI tool** - it's an intelligent compositor:

| Component | Source | Technology |
|-----------|--------|------------|
| **Audio** | Generated from text | Kokoro TTS |
| **Captions** | Transcribed from audio | Whisper.cpp |
| **Background Videos** | Downloaded stock footage | Pexels API |
| **Music** | Local library (`static/music/`) | Pre-curated tracks |
| **Final Video** | Programmatically composed | Remotion (React) |

Think of it as an **automated video editor** that:
- Takes your script
- Finds relevant stock footage
- Generates professional voiceover
- Creates perfectly timed captions
- Assembles everything into a polished video

All without any manual editing or expensive GPU-intensive video generation models.

## Processing Flow Diagram

```
User Input (text + search terms)
    ↓
[Queue System] → Sequential processing
    ↓
[For Each Scene]
    ├─→ [Kokoro TTS] → Audio WAV
    ├─→ [Whisper] → Timed Captions
    ├─→ [FFmpeg] → Audio MP3
    └─→ [Pexels API] → Background Video
    ↓
[Music Selection] → Background Track
    ↓
[Remotion Composition]
    ├─→ Launch Chrome
    ├─→ Render React Components
    ├─→ Screenshot Frames
    └─→ Stitch to MP4
    ↓
[Cleanup] → Remove temp files
    ↓
Final Video (videos/{id}.mp4)
```

## Video Status States

Throughout this process, videos move through three status states:

- **`processing`** - Video is in queue or actively being rendered
- **`ready`** - Video successfully rendered and available for download
- **`failed`** - An error occurred during processing

Check status via: `GET /api/short-video/{id}/status`

## Performance Considerations

- **Sequential Processing**: One video at a time prevents memory issues
- **Concurrency Control**: Remotion's browser tab concurrency is configurable via `CONCURRENCY` env var
- **Cache Management**: Video frame cache size controlled via `VIDEO_CACHE_SIZE_IN_BYTES`
- **Resource Requirements**: 3-4GB RAM, 2 vCPU minimum for stable operation

## Related Files

- **Main Orchestrator**: `src/short-creator/ShortCreator.ts`
- **Library Wrappers**: `src/short-creator/libraries/`
- **Video Templates**: `src/components/videos/`
- **Type Definitions**: `src/types/shorts.ts`
- **Configuration**: `src/config.ts`
