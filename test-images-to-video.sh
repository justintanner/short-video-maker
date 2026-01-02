#!/bin/bash
# Simple test script for images-to-video MCP tool using curl
#
# Usage:
#   1. Start the server: pnpm dev
#   2. Run this script: bash test-images-to-video.sh

PORT=${PORT:-3123}
BASE_URL="http://localhost:${PORT}"
BLANK_IMAGE_URL="${BASE_URL}/static/1080p-blank.png"

echo "🧪 Testing images-to-video MCP tool with curl..."
echo ""

# Note: MCP uses SSE protocol which is complex to test with curl
# This script uses the REST API instead for simplicity

echo "📝 Using REST API endpoint instead of MCP for simpler testing"
echo ""

# Test using REST API (simpler than MCP protocol)
echo "🎬 Creating video with blank PNG..."
echo "   Image: ${BLANK_IMAGE_URL}"
echo "   Date: Friday, January 2nd, 2026"
echo "   Prompt: Smooth camera dolly push forward, Friday January second 2026, professional cinematic lighting, calm atmospheric mood, gentle elegant motion"
echo ""

# Create video request
response=$(curl -s -X POST "${BASE_URL}/api/short-video" \
  -H "Content-Type: application/json" \
  -d '{
    "scenes": [{
      "text": "",
      "searchTerms": [],
      "imageInput": {
        "type": "upload",
        "value": "'"${BLANK_IMAGE_URL}"'"
      },
      "veoPrompt": "Smooth camera dolly push forward, Friday January second 2026, professional cinematic lighting, calm atmospheric mood, gentle elegant motion"
    }],
    "config": {
      "veoOnly": true,
      "veoModel": "veo3_fast",
      "orientation": "landscape"
    }
  }')

echo "📝 Response: ${response}"
echo ""

# Extract video ID
video_id=$(echo "${response}" | grep -o '"videoId":"[^"]*"' | cut -d'"' -f4)

if [ -z "$video_id" ]; then
  echo "❌ Failed to create video. Response:"
  echo "${response}" | jq . 2>/dev/null || echo "${response}"
  exit 1
fi

echo "✅ Video queued with ID: ${video_id}"
echo ""

# Poll for status
echo "⏳ Polling video status..."
max_attempts=60
attempt=0
status="processing"

while [ "${status}" = "processing" ] && [ ${attempt} -lt ${max_attempts} ]; do
  sleep 5
  attempt=$((attempt + 1))

  status_response=$(curl -s "${BASE_URL}/api/short-video/${video_id}/status")
  status=$(echo "${status_response}" | grep -o '"status":"[^"]*"' | cut -d'"' -f4)

  echo "   [${attempt}/${max_attempts}] Status: ${status}"

  if [ "${status}" = "ready" ]; then
    echo ""
    echo "✅ Video ready!"
    echo "📥 Download: ${BASE_URL}/api/short-video/${video_id}"
    echo "🎥 Open in browser: ${BASE_URL}/api/short-video/${video_id}"

    # Try to open in browser (macOS)
    if command -v open &> /dev/null; then
      echo ""
      read -p "Open video in browser? [y/N] " -n 1 -r
      echo
      if [[ $REPLY =~ ^[Yy]$ ]]; then
        open "${BASE_URL}/api/short-video/${video_id}"
      fi
    fi

    exit 0
  elif [ "${status}" = "failed" ]; then
    echo ""
    echo "❌ Video generation failed"
    exit 1
  fi
done

echo ""
echo "⏰ Timeout: Video still processing after $((max_attempts * 5))s"
echo "   Check status: ${BASE_URL}/api/short-video/${video_id}/status"
echo "   Download (when ready): ${BASE_URL}/api/short-video/${video_id}"
