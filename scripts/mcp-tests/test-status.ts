#!/usr/bin/env ts-node
import { connectToMcpServer, pollVideoStatus, logStep, logError } from "./utils";

async function run() {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.error("Usage: ts-node scripts/mcp-tests/test-status.ts <videoId>");
    process.exit(1);
  }

  const videoId = args[0];

  logStep(1, `Checking status for Video ID: ${videoId}`);
  
  const { client, close } = await connectToMcpServer();

  try {
    // We reuse pollVideoStatus but with a short timeout or just once? 
    // The user probably wants to see it finish if they run this.
    // Let's poll until done.
    await pollVideoStatus(client, videoId, 30); 
  } catch (error) {
    logError("Error checking status", error);
  } finally {
    await close();
  }
}

run();
