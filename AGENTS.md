# AGENTS.md

## Commands

```bash
npm install          # Install dependencies
npm run build        # Build TypeScript and Vite (outputs to dist/)
npm start            # Run production build
npm run dev          # Development mode with watch
npm test             # Run vitest tests
npx remotion studio  # Preview videos and debug Remotion rendering
```

## Project Overview

Short Video Maker generates short-form videos (TikTok, Reels, Shorts) from text inputs. It combines:
- Kokoro TTS (text-to-speech)
- Whisper (automatic captions)
- Pexels API (background videos)
- Remotion (video rendering)

## Key Directories

- `src/short-creator/` - Core video generation logic
- `src/server/` - Express REST API and MCP server
- `src/components/` - Remotion video components
- `src/ui/` - React web interface
- `src/types/` - Zod schemas and TypeScript types

## Testing

- Tests use vitest
- Pexels API calls are mocked with `__mocks__/pexels-response.json`
- Use `npx remotion studio` to preview/debug video rendering

## Environment

Required: `PEXELS_API_KEY` (free from pexels.com/api)
