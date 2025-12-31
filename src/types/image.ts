export type Image = {
  id: string; // taskId from KIE API
  url: string; // Local temp path
  width: number; // 2K resolution dimensions
  height: number; // Based on aspect ratio
  aspectRatio: string; // "9:16" or "16:9"
};

export type KIETaskRequest = {
  model: "nano-banana-pro";
  callBackUrl?: string;
  input: {
    prompt: string;
    image_input: [];
    aspect_ratio: "9:16" | "16:9";
    resolution: "2K";
    output_format: "png" | "jpg";
  };
};

export type KIETaskResponse = {
  code: number;
  message: string;
  data: {
    taskId: string;
  };
};

export type KIETaskStatus = {
  code: number;
  message: string;
  data: {
    taskId: string;
    state: "pending" | "processing" | "success" | "fail";
    resultJson?: string;
    failCode?: string;
    failMsg?: string;
  };
};

export type KIETaskResult = {
  resultUrls: string[];
};
