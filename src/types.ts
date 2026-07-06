// Mozaik Sanat Stüdyosu Ortak Tipleri

export type TileShape = "square" | "circle" | "rounded-square" | "triangle";

export interface MosaicOptions {
  tileSize: number; // 8 - 40
  jitter: number; // 0 - 100 (percentage)
  gap: number; // 0 - 10
  shape: TileShape;
  showOutlines: boolean;
  outlineColor: string; // "#ffffff", "#000000", etc.
  outlineWidth: number; // 1 - 5
  backgroundColor: string; // Canvas background
  useGroutGaps: boolean; // Avoid edges
  groutThreshold: number; // Sensitivity of edge masking
}

export interface ColorPalette {
  name: string;
  colors: string[];
}

export const PRESET_PALETTES: ColorPalette[] = [
  {
    name: "Sihirli Galaksi",
    colors: ["#2d00f7", "#6a00f4", "#8900f2", "#a100f2", "#b100e8", "#bc00dd", "#db00b6", "#f20089"],
  },
  {
    name: "Gün Batımı Esintisi",
    colors: ["#f72585", "#b5179e", "#7209b7", "#560bad", "#480ca8", "#3f37c9", "#4361ee", "#4cc9f0"],
  },
  {
    name: "Sonbahar Yaprakları",
    colors: ["#ffb703", "#fb8500", "#d97706", "#b45309", "#78350f", "#451a03", "#7c2d12", "#9a3412"],
  },
  {
    name: "Okyanus Akıntısı",
    colors: ["#03045e", "#023e8a", "#0077b6", "#0096c7", "#00b4d8", "#48cae4", "#90e0ef", "#ade8f4"],
  },
  {
    name: "Doğa Fısıltısı",
    colors: ["#132a13", "#31572c", "#4f772d", "#90a955", "#ecf39e", "#3a5a40", "#588157", "#a3b18a"],
  },
  {
    name: "Kozmik Pastel",
    colors: ["#ffb5a7", "#fcd5ce", "#f8edeb", "#f9dec9", "#fec89a", "#ffd166", "#06d6a0", "#118ab2"],
  },
];
