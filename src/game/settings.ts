/** Per-device player settings: audio, graphics, controls and accessibility. */
export type GraphicsQuality = 'low' | 'medium' | 'high';

export interface Settings {
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  muted: boolean;
  mouseSensitivity: number;
  invertY: boolean;
  fov: number;
  graphics: GraphicsQuality;
  brightness: number;
  uiScale: number;
  highContrast: boolean;
  readableFont: boolean;
  reducedMotion: boolean;
  captions: boolean;
  typewriter: boolean;
  navAssist: boolean;
  autoJump: boolean;
  showFps: boolean;
}

export function defaultSettings(): Settings {
  return {
    masterVolume: 0.8,
    musicVolume: 0.45,
    sfxVolume: 0.8,
    muted: false,
    mouseSensitivity: 1,
    invertY: false,
    fov: 75,
    graphics: 'medium',
    brightness: 0.5,
    uiScale: 1,
    highContrast: false,
    readableFont: false,
    reducedMotion: false,
    captions: false,
    typewriter: true,
    navAssist: false,
    autoJump: true,
    showFps: false,
  };
}

export function parseSettings(raw: unknown): Settings {
  const d = defaultSettings();
  if (!raw || typeof raw !== 'object') return d;
  const r = raw as Record<string, unknown>;
  const out = { ...d };
  for (const key of Object.keys(d) as (keyof Settings)[]) {
    const v = r[key];
    if (typeof v === typeof d[key]) (out as Record<string, unknown>)[key] = v;
  }
  if (!['low', 'medium', 'high'].includes(out.graphics)) out.graphics = 'medium';
  out.uiScale = Math.min(1.6, Math.max(0.75, out.uiScale));
  out.fov = Math.min(100, Math.max(55, out.fov));
  return out;
}

export const QUALITY = {
  low: { renderDistance: 40, pixelRatio: 0.75, particles: 0.35, maxChunksPerFrame: 2 },
  medium: { renderDistance: 64, pixelRatio: 1, particles: 0.7, maxChunksPerFrame: 3 },
  high: { renderDistance: 96, pixelRatio: 1.5, particles: 1, maxChunksPerFrame: 4 },
} as const;
