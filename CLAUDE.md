# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Short Video Maker is an automated video creation tool for generating short-form video content (TikTok, Instagram Reels, YouTube Shorts). It combines text-to-speech (Kokoro), automatic captions (Whisper), background videos (Pexels), and music to create engaging videos from text inputs.

The server exposes both a REST API and an MCP (Model Context Protocol) server, plus a web UI for browser-based video generation.

## Development Commands

### Setup
```bash
pnpm install
cp .env.example .env  # Set PEXELS_API_KEY and other env vars
pnpm dev
```

### Build and Run
```bash
pnpm build          # Build TypeScript and Vite (outputs to dist/)
pnpm start          # Run production build
pnpm dev            # Development mode with watch
```

### Testing
```bash
pnpm test           # Run vitest tests
npx remotion studio # Preview videos and debug Remotion rendering
```

### UI Development
```bash
pnpm ui:dev         # Vite dev server for UI
pnpm ui:build       # Build UI only
pnpm ui:preview     # Preview UI build
```

### Docker
```bash
# Three variants: tiny (low resources), normal, cuda (GPU)
docker run -it --rm -p 3123:3123 -e PEXELS_API_KEY=<key> gyoridavid/short-video-maker:latest-tiny
```

## Architecture

### Core Pipeline (ShortCreator.ts)

The video generation follows this sequence:
1. **Text → Audio**: Kokoro TTS generates speech from text
2. **Audio → Captions**: Whisper transcribes audio to timed captions
3. **Search → Video**: Pexels API finds background videos matching search terms
4. **Compose**: Remotion renders final video combining all elements
5. **Queue**: Videos are processed sequentially through a queue system

### Directory Structure

```
src/
├── short-creator/          # Core video generation logic
│   ├── ShortCreator.ts     # Main orchestrator with queue system
│   ├── libraries/          # Wrapper classes for external tools
│   │   ├── Kokoro.ts       # Text-to-speech integration
│   │   ├── Whisper.ts      # Caption generation via whisper.cpp
│   │   ├── Pexels.ts       # Background video search
│   │   ├── Remotion.ts     # Video rendering
│   │   └── FFmpeg.ts       # Audio processing
│   └── music.ts            # Background music management
├── server/                 # HTTP servers
│   ├── server.ts           # Express app setup
│   ├── routers/
│   │   ├── rest.ts         # REST API endpoints
│   │   └── mcp.ts          # MCP server implementation
│   └── validator.ts        # Zod schema validation
├── components/             # Remotion video components
│   ├── videos/             # Video templates (Portrait/Landscape)
│   └── root/               # Remotion root component
├── ui/                     # React web interface
├── types/shorts.ts         # Zod schemas and TypeScript types
├── config.ts               # Environment config and paths
└── index.ts                # Application entry point
```

### Key Data Flow

**Scene**: The fundamental unit - each video consists of multiple scenes
- `text`: Narration for TTS
- `searchTerms`: Keywords for Pexels video search (fallback: nature, globe, space, ocean)

**Temporary Files**: Audio/video files are stored in temp directory during processing, then cleaned up after rendering completes.

**Video Status**: Videos can be "processing" (in queue), "ready" (rendered), or "failed".

## Configuration

### Required Environment Variables
- `PEXELS_API_KEY`: Free API key from pexels.com/api (REQUIRED)

### Optional Environment Variables
- `PORT`: Server port (default: 3123)
- `LOG_LEVEL`: pino log level (default: info)
- `WHISPER_VERBOSE`: Forward whisper.cpp output (default: false)
- `WHISPER_MODEL`: Whisper model size (default: medium.en for npm, varies for Docker)
- `KOKORO_MODEL_PRECISION`: fp32, fp16, q8, q4, q4f16 (default: fp32)
- `CONCURRENCY`: Remotion browser tab concurrency (Docker only, for memory management)
- `VIDEO_CACHE_SIZE_IN_BYTES`: Remotion video cache size (Docker only)

### Video Configuration Options
- `paddingBack`: End screen duration in milliseconds
- `music`: Mood/genre (get options from GET `/api/music-tags`)
- `captionPosition`: top, center, or bottom
- `captionBackgroundColor`: CSS color for caption background
- `voice`: Kokoro voice identifier (get options from GET `/api/voices`)
- `orientation`: portrait or landscape
- `musicVolume`: muted, low, medium, high

## REST API Endpoints

```
GET  /health                           # Healthcheck
POST /api/short-video                  # Create video (returns videoId)
GET  /api/short-video/{id}/status      # Check video status
GET  /api/short-video/{id}             # Download video binary
GET  /api/short-videos                 # List all videos
DELETE /api/short-video/{id}           # Delete video
GET  /api/voices                       # List available voices
GET  /api/music-tags                   # List available music moods
```

## MCP Server

- SSE endpoint: `/mcp/sse`
- Messages endpoint: `/mcp/messages`
- Tools: `create-short-video`, `get-video-status`

## Important Notes

### Platform Support
- **Supported**: Ubuntu ≥22.04 (with system packages), macOS (with ffmpeg via brew)
- **NOT Supported**: Windows (whisper.cpp installation issues)

### Resource Requirements
- ≥3GB RAM (4GB recommended)
- ≥2 vCPU
- ≥5GB disk space
- Internet connection (for Pexels API)

### External Dependencies
All are auto-installed during setup:
- Remotion (video composition/rendering)
- Whisper.cpp v1.7.1 (speech-to-text, installed via @remotion/install-whisper-cpp)
- Kokoro.js (TTS, model downloaded from HuggingFace)
- FFmpeg (audio processing)
- Pexels API (background videos)

### Limitations
- English voiceover only (kokoro-js limitation)
- Background videos sourced exclusively from Pexels
- Cannot use custom videos or images
- Does not generate videos from scratch (not image-to-video)

### Testing
- Tests use vitest
- Pexels API calls are mocked with `__mocks__/pexels-response.json`
- Use `npx remotion studio` to preview and debug video rendering
