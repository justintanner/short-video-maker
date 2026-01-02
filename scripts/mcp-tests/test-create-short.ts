#!/usr/bin/env ts-node
import { connectToMcpServer, pollVideoStatus, getBaseUrl, logStep, logSuccess, logError, logInfo } from "./utils";
import { OrientationEnum, VoiceEnum, MusicMoodEnum } from "../../src/types/shorts";

async function run() {
  logStep(1, "Initializing create-short-video test");
  
  const { client, close } = await connectToMcpServer();
  const BASE_URL = getBaseUrl();

  try {
    logStep(2, "Submitting Hello World scene");
    
    // Construct a simple scene
    const scenes = [
      {
        text: "This is a test of the automated video generation system. It should be short.",
        searchTerms: ["technology", "abstract", "code"],
        // We let it search for a video or generate one, or we can provide a static image to be safe?
        // Let's rely on Pexels mock or real API if configured. 
        // If we want it to be fully independent, we might want to upload an image, but 'create-short-video' usually uses stock.
      }
    ];

    const config = {
      orientation: OrientationEnum.landscape,
      voice: VoiceEnum.af_heart,
      music: MusicMoodEnum.chill,
      veoOnly: false // We want to test the full pipeline (TTS -> Whisper -> Composition)
    };

    logInfo("Scenes:", JSON.stringify(scenes, null, 2));
    logInfo("Config:", JSON.stringify(config, null, 2));

    const result = await client.callTool({
      name: "create-short-video",
      arguments: {
        scenes,
        config
      },
    });

    const videoId = (result as any).content[0].text;
    logSuccess(`Video queued with ID: ${videoId}`);

    const status = await pollVideoStatus(client, videoId, 10); // 10 min timeout (Kokoro + Whisper can take a bit)
    
    if (status === "ready") {
        logSuccess(`Test Passed! Download: ${BASE_URL}/api/short-video/${videoId}`);
    } else {
        logError("Test Failed");
    }

  } catch (error) {
    logError("Test Execution Failed", error);
    process.exit(1);
  } finally {
    await close();
  }
}

run();
