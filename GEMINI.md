# GEMINI.md

This file provides context and guidance for Gemini when working on the Short Video Maker project.

## Project Overview

Short Video Maker is an automated tool for generating short-form videos (TikTok, Reels, Shorts) from text.
It orchestrates several technologies:
- **TTS**: Kokoro (local/downloaded model)
- **Captions**: Whisper.cpp
- **Background**: Pexels API (stock videos) or Veo (AI generation)
- **Composition**: Remotion (React-based video rendering)
- **Audio**: FFmpeg

## Development Workflow

### Commands
- **Install**: `npm install`
- **Dev**: `npm run dev` (Backend + Watch)
- **UI Dev**: `npm run ui:dev`
- **Build**: `npm run build` (TypeScript + Vite)
- **Test**: `npm test` (Vitest)
- **Preview**: `npx remotion studio`

### Environment Variables
- `PEXELS_API_KEY`: Required (Get from pexels.com/api)
- See `.env.example` for others.

## Codebase Structure

- `src/short-creator/`: Core logic (ShortCreator.ts orchestrates the pipeline).
- `src/components/`: Remotion video templates (React).
- `src/server/`: Express API and MCP server.
- `src/ui/`: Frontend React app.
- `static/`: Assets (music, fonts).

## Key Constraints & Notes

- **OS**: macOS (supported), Ubuntu (supported), Windows (NOT supported).
- **Dependencies**: FFmpeg must be installed (via brew on macOS).
- **No Generative Video**: It composites stock footage; it does not generate video pixels from noise.
- **Conventions**:
  - Use `npm` for package management.
  - Follow existing formatting (Prettier/ESLint).
  - Tests are in `vitest`.
  - Pexels API is mocked in tests.

## Architecture

1. **Queue**: Sequential processing in `ShortCreator.ts`.
2. **Scene Processing**:
   - Text -> Audio (Kokoro)
   - Audio -> Captions (Whisper)
   - Search -> Video (Pexels) OR Prompt -> Video (Veo)
3. **Composition**: All assets assembled in Remotion `src/components/videos/`.

## Common Tasks

- **Adding a new voice**: Check `Kokoro.ts`.
- **Modifying video layout**: Edit `src/components/videos/LandscapeVideo.tsx` or `PortraitVideo.tsx`.
- **API changes**: Update `src/server/routers/`.
