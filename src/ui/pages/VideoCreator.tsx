/* eslint-disable @remotion/warn-native-media-tag */
import React, { useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Button,
  TextField,
  Typography,
  Paper,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  CircularProgress,
  Alert,
  IconButton,
  Divider,
  InputAdornment,
  RadioGroup,
  Radio,
  FormControlLabel,
  FormLabel,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import {
  SceneInput,
  RenderConfig,
  MusicMoodEnum,
  CaptionPositionEnum,
  VoiceEnum,
  OrientationEnum,
  MusicVolumeEnum,
} from "../../types/shorts";

interface SceneFormData {
  text: string;
  searchTerms: string;
  imageType: "stock" | "generate" | "upload";
  imagePrompt: string;
  uploadedImage: string | null;
  generatedImage: string | null;
}

const VideoCreator: React.FC = () => {
  const navigate = useNavigate();
  const [scenes, setScenes] = useState<SceneFormData[]>([
    {
      text: "",
      searchTerms: "",
      imageType: "stock",
      imagePrompt: "",
      uploadedImage: null,
      generatedImage: null,
    },
  ]);
  const [config, setConfig] = useState<RenderConfig>({
    paddingBack: 1500,
    music: MusicMoodEnum.chill,
    captionPosition: CaptionPositionEnum.bottom,
    captionBackgroundColor: "blue",
    voice: VoiceEnum.af_heart,
    orientation: OrientationEnum.portrait,
    musicVolume: MusicVolumeEnum.high,
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatingImage, setGeneratingImage] = useState<number | null>(null);
  const [uploadingImage, setUploadingImage] = useState<number | null>(null);

  const handleAddScene = () => {
    setScenes([
      ...scenes,
      {
        text: "",
        searchTerms: "",
        imageType: "stock",
        imagePrompt: "",
        uploadedImage: null,
        generatedImage: null,
      },
    ]);
  };

  const handleRemoveScene = (index: number) => {
    if (scenes.length > 1) {
      const newScenes = [...scenes];
      newScenes.splice(index, 1);
      setScenes(newScenes);
    }
  };

  const handleSceneChange = (
    index: number,
    field: keyof SceneFormData,
    value: string | null,
  ) => {
    const newScenes = [...scenes];
    // @ts-expect-error - value type is strictly checked but field varies
    newScenes[index] = { ...newScenes[index], [field]: value };
    setScenes(newScenes);
  };

  const handleGenerateImage = async (index: number) => {
    const scene = scenes[index];
    if (!scene.imagePrompt) return;

    setGeneratingImage(index);
    try {
      const response = await axios.post("/api/generate-image", {
        prompt: scene.imagePrompt,
      });
      handleSceneChange(index, "generatedImage", response.data.url);
    } catch (err) {
      console.error("Failed to generate image:", err);
      // You might want to show a snackbar here
      alert("Failed to generate image");
    } finally {
      setGeneratingImage(null);
    }
  };

  const handleUploadImage = async (
    index: number,
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadingImage(index);
    const reader = new FileReader();
    reader.onloadend = async () => {
      try {
        const base64String = reader.result as string;
        const response = await axios.post("/api/upload-image", {
          image: base64String,
        });
        handleSceneChange(index, "uploadedImage", response.data.url);
      } catch (err) {
        console.error("Failed to upload image:", err);
        alert("Failed to upload image");
      } finally {
        setUploadingImage(null);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleConfigChange = (
    field: keyof RenderConfig,
    value: string | number,
  ) => {
    setConfig({ ...config, [field]: value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // Convert scenes to the expected API format
      const apiScenes: SceneInput[] = scenes.map((scene) => {
        const baseInput: Partial<SceneInput> & {
          text: string;
          searchTerms: string[];
        } = {
          text: scene.text,
          searchTerms: scene.searchTerms
            .split(",")
            .map((term) => term.trim())
            .filter((term) => term.length > 0),
        };

        if (scene.imageType === "generate" && scene.generatedImage) {
          baseInput.imageInput = {
            type: "generate",
            value: scene.generatedImage,
          };
        } else if (scene.imageType === "upload" && scene.uploadedImage) {
          baseInput.imageInput = {
            type: "upload",
            value: scene.uploadedImage,
          };
        }

        return baseInput as SceneInput;
      });

      const response = await axios.post("/api/short-video", {
        scenes: apiScenes,
        config,
      });

      navigate(`/video/${response.data.videoId}`);
    } catch (err) {
      setError("Failed to create video. Please try again.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box maxWidth="md" mx="auto" py={4}>
      <Typography variant="h4" component="h1" gutterBottom>
        Create New Video
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      <form onSubmit={handleSubmit}>
        <Typography variant="h5" component="h2" gutterBottom>
          Scenes
        </Typography>

        {scenes.map((scene, index) => (
          <Paper key={index} sx={{ p: 3, mb: 3 }}>
            <Box
              display="flex"
              justifyContent="space-between"
              alignItems="center"
              mb={2}
            >
              <Typography variant="h6">Scene {index + 1}</Typography>
              {scenes.length > 1 && (
                <IconButton
                  onClick={() => handleRemoveScene(index)}
                  color="error"
                  size="small"
                >
                  <DeleteIcon />
                </IconButton>
              )}
            </Box>

            <Grid container spacing={3}>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Text"
                  multiline
                  rows={4}
                  value={scene.text}
                  onChange={(e) =>
                    handleSceneChange(index, "text", e.target.value)
                  }
                  required
                />
              </Grid>

              <Grid item xs={12}>
                <FormControl component="fieldset">
                  <FormLabel component="legend">Visual Source</FormLabel>
                  <RadioGroup
                    row
                    value={scene.imageType}
                    onChange={(e) =>
                      handleSceneChange(index, "imageType", e.target.value)
                    }
                  >
                    <FormControlLabel
                      value="stock"
                      control={<Radio />}
                      label="Stock Video (Pexels)"
                    />
                    <FormControlLabel
                      value="generate"
                      control={<Radio />}
                      label="Generate Image (Nano Banana Pro)"
                    />
                    <FormControlLabel
                      value="upload"
                      control={<Radio />}
                      label="Upload Image"
                    />
                  </RadioGroup>
                </FormControl>
              </Grid>

              {scene.imageType === "stock" && (
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="Search Terms (comma-separated)"
                    value={scene.searchTerms}
                    onChange={(e) =>
                      handleSceneChange(index, "searchTerms", e.target.value)
                    }
                    helperText="Enter keywords for background video, separated by commas"
                    required
                  />
                </Grid>
              )}

              {scene.imageType === "generate" && (
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="Image Description"
                    value={scene.imagePrompt}
                    onChange={(e) =>
                      handleSceneChange(index, "imagePrompt", e.target.value)
                    }
                    helperText="Describe the image you want to generate"
                  />
                  <Box mt={2} display="flex" alignItems="center" gap={2}>
                    <Button
                      variant="contained"
                      onClick={() => handleGenerateImage(index)}
                      disabled={!scene.imagePrompt || generatingImage === index}
                      startIcon={<AutoFixHighIcon />}
                    >
                      {generatingImage === index
                        ? "Generating..."
                        : "Generate Preview"}
                    </Button>
                  </Box>
                  {scene.generatedImage && (
                    <Box mt={2}>
                      <Typography variant="subtitle2" gutterBottom>
                        Preview:
                      </Typography>
                      <img
                        src={scene.generatedImage}
                        alt="Generated preview"
                        style={{
                          maxWidth: "100%",
                          maxHeight: "300px",
                          borderRadius: "4px",
                        }}
                      />
                    </Box>
                  )}
                </Grid>
              )}

              {scene.imageType === "upload" && (
                <Grid item xs={12}>
                  <Button
                    component="label"
                    variant="outlined"
                    startIcon={<CloudUploadIcon />}
                    disabled={uploadingImage === index}
                  >
                    {uploadingImage === index
                      ? "Uploading..."
                      : "Upload Image"}
                    <input
                      type="file"
                      hidden
                      accept="image/*"
                      onChange={(e) => handleUploadImage(index, e)}
                    />
                  </Button>
                  {scene.uploadedImage && (
                    <Box mt={2}>
                      <Typography variant="subtitle2" gutterBottom>
                        Preview:
                      </Typography>
                      <img
                        src={scene.uploadedImage}
                        alt="Uploaded preview"
                        style={{
                          maxWidth: "100%",
                          maxHeight: "300px",
                          borderRadius: "4px",
                        }}
                      />
                    </Box>
                  )}
                </Grid>
              )}
            </Grid>
          </Paper>
        ))}

        <Box display="flex" justifyContent="center" mb={4}>
          <Button
            variant="outlined"
            startIcon={<AddIcon />}
            onClick={handleAddScene}
          >
            Add Scene
          </Button>
        </Box>

        <Divider sx={{ mb: 4 }} />

        <Typography variant="h5" component="h2" gutterBottom>
          Video Configuration
        </Typography>

        <Paper sx={{ p: 3, mb: 3 }}>
          <Grid container spacing={3}>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                type="number"
                label="End Screen Padding (ms)"
                value={config.paddingBack}
                onChange={(e) =>
                  handleConfigChange("paddingBack", parseInt(e.target.value))
                }
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">ms</InputAdornment>
                  ),
                }}
                helperText="Duration to keep playing after narration ends"
                required
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Music Mood</InputLabel>
                <Select
                  value={config.music}
                  onChange={(e) => handleConfigChange("music", e.target.value)}
                  label="Music Mood"
                  required
                >
                  {Object.values(MusicMoodEnum).map((tag) => (
                    <MenuItem key={tag} value={tag}>
                      {tag}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Caption Position</InputLabel>
                <Select
                  value={config.captionPosition}
                  onChange={(e) =>
                    handleConfigChange("captionPosition", e.target.value)
                  }
                  label="Caption Position"
                  required
                >
                  {Object.values(CaptionPositionEnum).map((position) => (
                    <MenuItem key={position} value={position}>
                      {position}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Caption Background Color"
                value={config.captionBackgroundColor}
                onChange={(e) =>
                  handleConfigChange("captionBackgroundColor", e.target.value)
                }
                helperText="Any valid CSS color (name, hex, rgba)"
                required
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Default Voice</InputLabel>
                <Select
                  value={config.voice}
                  onChange={(e) => handleConfigChange("voice", e.target.value)}
                  label="Default Voice"
                  required
                >
                  {Object.values(VoiceEnum).map((voice) => (
                    <MenuItem key={voice} value={voice}>
                      {voice}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Orientation</InputLabel>
                <Select
                  value={config.orientation}
                  onChange={(e) =>
                    handleConfigChange("orientation", e.target.value)
                  }
                  label="Orientation"
                  required
                >
                  {Object.values(OrientationEnum).map((orientation) => (
                    <MenuItem key={orientation} value={orientation}>
                      {orientation}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Volume of the background audio</InputLabel>
                <Select
                  value={config.musicVolume}
                  onChange={(e) =>
                    handleConfigChange("musicVolume", e.target.value)
                  }
                  label="Volume of the background audio"
                  required
                >
                  {Object.values(MusicVolumeEnum).map((voice) => (
                    <MenuItem key={voice} value={voice}>
                      {voice}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        </Paper>

        <Box display="flex" justifyContent="center">
          <Button
            type="submit"
            variant="contained"
            color="primary"
            size="large"
            disabled={loading}
            sx={{ minWidth: 200 }}
          >
            {loading ? (
              <CircularProgress size={24} color="inherit" />
            ) : (
              "Create Video"
            )}
          </Button>
        </Box>
      </form>
    </Box>
  );
};

export default VideoCreator;