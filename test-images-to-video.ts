#!/usr/bin/env ts-node
/**
 * Test script for the images-to-video MCP tool
 *
 * This script tests the new images-to-video MCP tool with the blank PNG
 *
 * Usage:
 *   1. Start the server: pnpm dev
 *   2. In another terminal: ts-node test-images-to-video.ts
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

const PORT = process.env.PORT || 3123;
const BASE_URL = `http://localhost:${PORT}`;

async function testImagesToVideo() {
  console.log("🧪 Testing images-to-video MCP tool...\n");

  // Create MCP client
  const transport = new SSEClientTransport(new URL(`${BASE_URL}/mcp/sse`));
  const client = new Client(
    {
      name: "test-client",
      version: "1.0.0",
    },
    {
      capabilities: {},
    }
  );

  try {
    // Connect to server
    console.log("📡 Connecting to MCP server...");
    await client.connect(transport);
    console.log("✅ Connected to MCP server\n");

    // Test 1: Single image (blank PNG)
    console.log("🎬 Test 1: Animating single blank PNG with veo3_fast");
    console.log("   Image: static/1080p-blank.png");
    console.log("   Prompt: Gentle camera push forward, cinematic atmosphere");
    console.log("   Model: veo3_fast (default)\n");

    const blankImageUrl = `${BASE_URL}/static/1080p-blank.png`;

    const result1 = await client.callTool({
      name: "images-to-video",
      arguments: {
        imageUrls: [blankImageUrl],
        prompt: "Gentle camera push forward with cinematic atmosphere and soft lighting",
        model: "veo3_fast",
      },
    });

    console.log("📝 Result:", result1.content[0]);
    const videoId1 = (result1.content[0] as any).text;
    console.log(`✅ Video queued with ID: ${videoId1}\n`);

    // Poll for status
    console.log("⏳ Polling video status...");
    let status = "processing";
    let attempts = 0;
    const maxAttempts = 60; // 5 minutes (5s interval)

    while (status === "processing" && attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 5000));

      const statusResult = await client.callTool({
        name: "get-video-status",
        arguments: { videoId: videoId1 },
      });

      status = (statusResult.content[0] as any).text;
      attempts++;

      console.log(`   [${attempts}/${maxAttempts}] Status: ${status}`);

      if (status === "ready") {
        console.log(`\n✅ Video ready! Download from: ${BASE_URL}/api/short-video/${videoId1}`);
        break;
      } else if (status === "failed") {
        console.log(`\n❌ Video generation failed`);
        break;
      }
    }

    if (status === "processing") {
      console.log(`\n⏰ Timeout: Video still processing after ${maxAttempts * 5}s`);
      console.log(`   Check status at: ${BASE_URL}/api/short-video/${videoId1}/status`);
    }

    // Test 2: Two different images (if we had them)
    console.log("\n\n🎬 Test 2: Using same image twice (transition simulation)");
    console.log("   Images: [blank, blank]");
    console.log("   Prompt: Smooth transition with camera rotation");
    console.log("   Model: veo3 (quality)\n");

    const result2 = await client.callTool({
      name: "images-to-video",
      arguments: {
        imageUrls: [blankImageUrl, blankImageUrl],
        prompt: "Smooth camera rotation with elegant transition and atmospheric lighting",
        model: "veo3",
      },
    });

    const videoId2 = (result2.content[0] as any).text;
    console.log(`✅ Video queued with ID: ${videoId2}`);
    console.log(`   Status endpoint: ${BASE_URL}/api/short-video/${videoId2}/status`);
    console.log(`   Download endpoint: ${BASE_URL}/api/short-video/${videoId2}\n`);

    console.log("✅ All tests completed!");
    console.log("\n📊 Summary:");
    console.log(`   - Test 1 (single image, veo3_fast): ${status === "ready" ? "✅ SUCCESS" : status === "failed" ? "❌ FAILED" : "⏳ PROCESSING"}`);
    console.log(`   - Test 2 (two images, veo3): ⏳ QUEUED`);

  } catch (error) {
    console.error("\n❌ Error during test:", error);
    if (error instanceof Error) {
      console.error("   Message:", error.message);
      console.error("   Stack:", error.stack);
    }
  } finally {
    // Close connection
    try {
      await client.close();
      console.log("\n👋 Disconnected from MCP server");
    } catch (e) {
      // Ignore close errors
    }
  }
}

// Run the test
testImagesToVideo().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
