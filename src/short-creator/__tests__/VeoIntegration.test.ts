
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import nock from 'nock';
import { ShortCreator } from '../ShortCreator';
import { VeoAPI } from '../libraries/Veo';
import { Config } from '../../config';
import { SceneInput, RenderConfig, OrientationEnum } from '../../types/shorts';

// In-memory file system state
const mockFiles = new Set<string>();

// Mock dependencies
vi.mock('fs-extra', async () => {
  return {
    default: {
      ensureDirSync: vi.fn(),
      existsSync: vi.fn((path) => mockFiles.has(path)),
      createWriteStream: vi.fn((path) => ({
        on: vi.fn((event, callback) => {
            if (event === 'finish') {
                // When write finishes, "create" the file
                mockFiles.add(path);
                setTimeout(callback, 0);
            }
            return this;
        }),
        once: vi.fn(),
        emit: vi.fn(),
        write: vi.fn(),
        end: vi.fn(),
        close: vi.fn(),
      })),
      createReadStream: vi.fn(() => ({
          pipe: vi.fn(),
          on: vi.fn(),
      })),
      readFileSync: vi.fn().mockReturnValue(Buffer.from('mock-video-content')),
      writeFile: vi.fn().mockResolvedValue(undefined),
      removeSync: vi.fn((path) => mockFiles.delete(path)),
      unlink: vi.fn((path, cb) => {
          mockFiles.delete(path);
          if (cb) cb(null);
      }),
      readdirSync: vi.fn().mockReturnValue([]),
    }
  };
});

// Mock fs for VeoAPI which uses 'fs' directly
vi.mock('fs', async () => {
    return {
      default: {
        createReadStream: vi.fn(() => ({
            pipe: vi.fn(),
            on: vi.fn(),
        })),
              createWriteStream: vi.fn((path) => ({
                on: vi.fn((event, callback) => {
                    if (event === 'finish') {
                        mockFiles.add(path);
                        setTimeout(callback, 0);
                    }
                    return this;
                }),
                once: vi.fn(),
                emit: vi.fn(),
                write: vi.fn(),
                end: vi.fn(),
                close: vi.fn(),
              })),      }
    };
});

describe('ShortCreator - Veo Integration', () => {
  let shortCreator: ShortCreator;
  let veoApi: VeoAPI;
  let config: Config;

  beforeEach(() => {
    nock.cleanAll();
    mockFiles.clear();

    // Mock Config
    config = new Config();
    config.veoApiKey = 'mock-veo-key';
    config.tempDirPath = '/tmp';
    config.videosDirPath = '/videos';
    config.port = 3000;
    
    // Disable retries to fail fast in tests
    config.veoMaxRetries = 0;

    // Real VeoAPI instance (we will nock its calls)
    veoApi = new VeoAPI(config.veoApiKey);

    // Mock other dependencies
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const remotion = { render: vi.fn() } as unknown as any;
    const kokoro = { generate: vi.fn() } as unknown as any;
    const whisper = {} as unknown as any;
    const ffmpeg = {} as unknown as any;
    const pexelsApi = {} as unknown as any;
    const nanoBananaPro = {} as unknown as any;
    const musicManager = { musicList: vi.fn().mockReturnValue([]) } as unknown as any;
    /* eslint-enable @typescript-eslint/no-explicit-any */

    shortCreator = new ShortCreator(
      config,
      remotion,
      kokoro,
      whisper,
      ffmpeg,
      pexelsApi,
      veoApi,
      nanoBananaPro,
      musicManager
    );
  });

  afterEach(() => {
    nock.cleanAll();
    vi.clearAllMocks();
  });

  it('should successfully create a video using Veo only', async () => {
    const startImageUrl = 'https://example.com/image.png';
    const taskId = 'mock-task-id';
    const resultVideoUrl = 'https://example.com/result.mp4';

    // Mock Veo Generate API
    const scope = nock('https://api.kie.ai')
      .post('/api/v1/veo/generate', (body) => {
        return body.prompt === 'test prompt' && 
               body.model === 'veo3_fast' &&
               Array.isArray(body.imageUrls) && 
               body.imageUrls.length === 2;
      })
      .reply(200, {
        code: 200,
        msg: 'success',
        data: { taskId },
      });

    // Mock Veo Poll API - First attempt: Generating
    nock('https://api.kie.ai')
      .get('/api/v1/veo/record-info')
      .query({ taskId })
      .reply(200, {
        code: 200,
        msg: 'success',
        data: {
          successFlag: 0, // Generating
          taskId,
        },
      });

    // Mock Veo Poll API - Second attempt: Success
    nock('https://api.kie.ai')
      .get('/api/v1/veo/record-info')
      .query({ taskId })
      .reply(200, {
        code: 200,
        msg: 'success',
        data: {
          successFlag: 1, // Success
          taskId,
          response: {
            resultUrls: [resultVideoUrl],
          },
        },
      });

    // Mock Video Download
    nock('https://example.com')
      .get('/result.mp4')
      .reply(200, 'video-content');

    const scenes: SceneInput[] = [
      {
        text: '',
        searchTerms: [],
        imageInput: {
          type: 'upload',
          value: startImageUrl,
        },
        veoPrompt: 'test prompt',
      },
    ];

    const renderConfig: RenderConfig = {
      veoOnly: true,
      veoModel: 'veo3_fast',
      orientation: OrientationEnum.landscape,
    };

    const returnedId = shortCreator.addToQueue(scenes, renderConfig);
    expect(returnedId).toBeDefined();

    // Verify status is processing immediately
    expect(shortCreator.status(returnedId)).toBe('processing');

    // Wait for the async process to complete
    await new Promise<void>((resolve) => {
        const checkStatus = () => {
            // Status stays processing until queue clears
            // But if it's done, queue clears.
            const status = shortCreator.status(returnedId);
            
            // If it returns ready, it found the file and queue is empty of that id
            if (status === 'ready') {
                resolve();
            } else if (status === 'failed') {
                 // Should not happen in this test
                 resolve();
            } else {
                setTimeout(checkStatus, 50);
            }
        };
        checkStatus();
    });

    expect(shortCreator.status(returnedId)).toBe('ready');
    
    // Check internal errors if any (for debugging)
    const statusDetail = shortCreator.statusDetail(returnedId);
    if (statusDetail.error) {
        console.error('Video processing failed with:', statusDetail.error);
    }
    expect(statusDetail.error).toBeUndefined();
    expect(scope.isDone()).toBe(true);
  }, 20000); // Increase timeout to 20s because VeoAPI polling interval is 5s

  it('should handle Veo API errors gracefully', async () => {
    const startImageUrl = 'https://example.com/image.png';

    // Mock Veo Generate API to fail
    nock('https://api.kie.ai')
      .post('/api/v1/veo/generate')
      .reply(400, {
        code: 400,
        msg: 'Invalid prompt',
      });

    const scenes: SceneInput[] = [
      {
        text: '',
        searchTerms: [],
        imageInput: {
          type: 'upload',
          value: startImageUrl,
        },
        veoPrompt: 'bad prompt',
      },
    ];

    const renderConfig: RenderConfig = {
      veoOnly: true,
    };

    const returnedId = shortCreator.addToQueue(scenes, renderConfig);

    // Wait for completion
    await new Promise<void>((resolve) => {
        const checkStatus = () => {
            const status = shortCreator.status(returnedId);
            if (status === 'failed') {
                resolve();
            } else if (status === 'ready') {
                 resolve();
            } else {
                setTimeout(checkStatus, 50);
            }
        };
        checkStatus();
    });

    expect(shortCreator.status(returnedId)).toBe('failed');
    
    const statusDetail = shortCreator.statusDetail(returnedId);
    expect(statusDetail.error).toBeDefined();
    // Check veoMessage if available, otherwise check main message
    if (statusDetail.error?.veoMessage) {
        expect(statusDetail.error.veoMessage).toContain('Invalid prompt');
    } else {
        expect(statusDetail.error?.message).toBe('Veo API request failed');
    }
  });
});
