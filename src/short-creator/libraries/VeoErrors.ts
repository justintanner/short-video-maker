export class VeoError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public veoCode?: number,
    public veoMessage?: string,
    public prompt?: string,
    public context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'VeoError';
    Object.setPrototypeOf(this, VeoError.prototype);
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      statusCode: this.statusCode,
      veoCode: this.veoCode,
      veoMessage: this.veoMessage,
      prompt: this.prompt,
      context: this.context,
    };
  }
}

export class VeoContentPolicyError extends VeoError {
  constructor(message: string, veoMessage: string, prompt: string, context?: Record<string, unknown>) {
    super(message, 400, undefined, veoMessage, prompt, context);
    this.name = 'VeoContentPolicyError';
    Object.setPrototypeOf(this, VeoContentPolicyError.prototype);
  }
}

export class VeoAPIError extends VeoError {
  constructor(message: string, statusCode: number, veoCode?: number, veoMessage?: string, prompt?: string, context?: Record<string, unknown>) {
    super(message, statusCode, veoCode, veoMessage, prompt, context);
    this.name = 'VeoAPIError';
    Object.setPrototypeOf(this, VeoAPIError.prototype);
  }
}

export class VeoTimeoutError extends VeoError {
  constructor(taskId: string, attempts: number) {
    super(
      `Veo task timed out after ${attempts} attempts`,
      undefined, undefined, undefined, undefined,
      { taskId, attempts }
    );
    this.name = 'VeoTimeoutError';
    Object.setPrototypeOf(this, VeoTimeoutError.prototype);
  }
}

export function isRetryableVeoError(error: VeoError): boolean {
  // Don't retry content policy violations or auth errors
  if (error instanceof VeoContentPolicyError) return false;
  if (error.statusCode === 401 || error.statusCode === 403) return false;

  // Retry other 400s (could be spurious), 500s
  if (error.statusCode === 400) return true;
  if (error.statusCode && error.statusCode >= 500) return true;

  return false;
}
