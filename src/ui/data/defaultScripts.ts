export interface VeoDialogPrompt {
  id: string;
  narration: string;
  veoPrompt: string;
  category?: string;
}

export const DEFAULT_VEO_SCRIPTS: VeoDialogPrompt[] = [
  {
    id: "motivational-1",
    narration: "Every journey begins with a single step. The path ahead may seem daunting, but remember: progress, not perfection, is what truly matters.",
    veoPrompt: "Cinematic slow forward dolly, gentle camera push through soft ethereal clouds, warm golden hour lighting, inspirational uplifting atmosphere, smooth motion",
    category: "motivational"
  },
  {
    id: "tech-1",
    narration: "The future of artificial intelligence isn't just about machines learning. It's about humans and machines working together to solve humanity's greatest challenges.",
    veoPrompt: "Smooth camera push forward, digital particles forming intricate neural network patterns, electric blue and cyan technological glow, futuristic sci-fi aesthetic, clean precise movement",
    category: "technology"
  },
  {
    id: "nature-1",
    narration: "Nature has been perfecting its designs for billions of years. Perhaps it's time we started paying closer attention to its wisdom.",
    veoPrompt: "Gentle slow zoom in, organic flowing camera motion, natural earth tones with soft green and brown hues, delicate bokeh effects, serene contemplative peaceful mood",
    category: "nature"
  },
  {
    id: "business-1",
    narration: "Success in business isn't measured by how fast you grow, but by how sustainably you build. Create value that lasts.",
    veoPrompt: "Professional upward tilt camera movement, clean geometric patterns slowly emerging and aligning, corporate blue and gold metallic accents, confident steady pacing",
    category: "business"
  },
  {
    id: "mindfulness-1",
    narration: "In a world that never stops moving, the most revolutionary act might just be to pause, breathe, and simply be present.",
    veoPrompt: "Ultra slow gentle rotation, soft focus transitions with dreamy blur, calming pastel gradients of lavender and peach, meditative peaceful tranquil energy, minimal motion",
    category: "mindfulness"
  },
  {
    id: "science-1",
    narration: "Science doesn't just answer questions. It teaches us how to ask better ones, challenging everything we thought we knew about reality.",
    veoPrompt: "Dynamic dolly zoom vertigo effect, abstract geometric crystalline formations appearing, electric purple and blue scientific visualization, curious exploratory movement",
    category: "science"
  },
  {
    id: "creativity-1",
    narration: "Creativity isn't a talent you're born with. It's a muscle you build through practice, failure, and the courage to try again.",
    veoPrompt: "Playful spiral camera swirl, vibrant rainbow color transitions and gradients, energetic bouncing motion with artistic flair, creative spontaneous joyful feeling",
    category: "creativity"
  },
  {
    id: "philosophy-1",
    narration: "We spend our lives searching for meaning, never realizing that meaning isn't found. It's created, one choice at a time.",
    veoPrompt: "Contemplative slow horizontal pan, dramatic chiaroscuro lighting with deep shadows and highlights, rich indigo and amber tones, philosophical depth, deliberate thoughtful pace",
    category: "philosophy"
  },
  {
    id: "wellness-1",
    narration: "Your body keeps the score. Listen to what it's telling you, because sometimes the quietest whispers carry the loudest truths.",
    veoPrompt: "Gentle breathing rhythm camera motion in and out, soft warm healing light, calming aqua and soft pink tones, nurturing protective atmosphere, natural organic flow",
    category: "wellness"
  },
  {
    id: "adventure-1",
    narration: "Life is either a daring adventure or nothing at all. The safety of the shore will never give you the thrill of the open ocean.",
    veoPrompt: "Bold forward rush camera movement, dynamic swooping motion, vibrant saturated colors with high contrast, adventurous exciting energy, fast confident pacing",
    category: "adventure"
  }
];

export function getRandomVeoScript(): VeoDialogPrompt {
  // eslint-disable-next-line @remotion/deterministic-randomness
  const randomIndex = Math.floor(Math.random() * DEFAULT_VEO_SCRIPTS.length);
  return DEFAULT_VEO_SCRIPTS[randomIndex];
}
