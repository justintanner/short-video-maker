#!/usr/bin/env ts-node
import { connectToMcpServer, pollVideoStatus, getBaseUrl, logStep, logSuccess, logError, logInfo } from "./utils";

async function run() {
  logStep(1, "Initializing images-to-video test");
  
  const { client, close } = await connectToMcpServer();
  const BASE_URL = getBaseUrl();

  try {
    // Test 1: Single image
    logStep(2, "Test 1: Single blank PNG with veo3_fast");
    const blankImageUrl = `${BASE_URL}/static/1080p-blank.png`;
    
    logInfo(`Using image: ${blankImageUrl}`);
    
    const result1 = await client.callTool({
      name: "images-to-video",
      arguments: {
        imageUrls: [blankImageUrl],
        prompt: "Slow camera zoom in, cinematic lighting",
        model: "veo3_fast",
      },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const videoId1 = (result1 as any).content[0].text;
    logSuccess(`Video queued with ID: ${videoId1}`);

    const status1 = await pollVideoStatus(client, videoId1, 5); // 5 min timeout
    
    if (status1 === "ready") {
        logSuccess(`Test 1 Passed! Download: ${BASE_URL}/api/short-video/${videoId1}`);
    } else {
        logError("Test 1 Failed");
    }

    // Test 2: Two images (transition)
    logStep(3, "Test 2: Two images (transition) with veo3");
    logInfo("Using same image twice to simulate transition");
    
    const result2 = await client.callTool({
      name: "images-to-video",
      arguments: {
        imageUrls: [blankImageUrl, blankImageUrl],
        prompt: "Smooth transition, atmospheric lighting",
        model: "veo3", // Test the other model
      },
    });
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const videoId2 = (result2 as any).content[0].text;
    logSuccess(`Video queued with ID: ${videoId2}`);
    
    logInfo("Not polling for Test 2 to save time/quota, but request was successful.");
    logInfo(`You can check status manually: ${BASE_URL}/api/short-video/${videoId2}/status`);

  } catch (error) {
    logError("Test Execution Failed", error);
    process.exit(1);
  } finally {
    await close();
  }
}

run();
