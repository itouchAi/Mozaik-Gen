import React, { useRef, useEffect, useState, useCallback, useMemo } from "react";
import { MosaicTemplate, MosaicRegion } from "../templates";
import { MosaicOptions, TileShape } from "../types";

export interface InteractiveTile {
  id: string;
  x: number;
  y: number;
  dx: number;
  dy: number;
  angle: number;
  color: string;
  regionId?: string;
  regionName?: string;
  shadeShift: number;
  order: number;
}

interface MosaicCanvasProps {
  template: MosaicTemplate | null; // null means custom image mode
  regionColors: Record<string, string>;
  selectedRegionId: string | null;
  onRegionSelect: (regionId: string) => void;
  options: MosaicOptions;
  customImage: HTMLImageElement | null;
  viewMode: string;
  buildProgress: number; // 0 to 1 for build animation
  onTileStatsChange?: (stats: Record<string, { hex: string; count: number; name: string }>) => void;
  
  // Custom image colors and replacements
  customImageColors?: string[];
  customColorReplacements?: Record<string, string>;
  showNumbers?: boolean;
  activeEditTool?: "move" | "swap" | "erase" | "add";
  activeColor?: string;

  // Object Selection Features
  detectedObjects?: Array<{ id: string; name: string; box: number[]; polygon?: number[][] }>;
  selectedObjectIds?: string[];
  hoveredObjectId?: string | null;
  onHoverObject?: (id: string | null) => void;
  onSelectObject?: (id: string) => void;
}

// Check if a point (px, py) is inside a normalized polygon [[x1,y1], [x2,y2], ...] (coordinates 0 to 100)
function isPointInPolygon(px: number, py: number, polygon: number[][]): boolean {
  let isInside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0], yi = polygon[i][1];
    const xj = polygon[j][0], yj = polygon[j][1];
    const intersect = ((yi > py) !== (yj > py))
        && (px < (xj - xi) * (py - yi) / (yj - yi + 0.00001) + xi);
    if (intersect) isInside = !isInside;
  }
  return isInside;
}

// Fallback to organic capsule/wave polygon if only bounding box is present
function getOrganicObjectPolygon(obj: { box: number[]; polygon?: number[][] }): number[][] {
  if (obj.polygon && obj.polygon.length >= 3) {
    return obj.polygon;
  }
  const [ymin, xmin, ymax, xmax] = obj.box;
  const points: number[][] = [];
  const segments = 24;
  const cx = (xmin + xmax) / 2;
  const cy = (ymin + ymax) / 2;
  const rx = (xmax - xmin) / 2;
  const ry = (ymax - ymin) / 2;

  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    // Elegant organic ripples to trace natural, beautiful contours
    const ripple = 1.0 + 0.07 * Math.sin(angle * 4) + 0.03 * Math.cos(angle * 7);
    const px = Math.max(0, Math.min(100, cx + rx * Math.cos(angle) * ripple));
    const py = Math.max(0, Math.min(100, cy + ry * Math.sin(angle) * ripple));
    points.push([px, py]);
  }
  return points;
}

// Highly accurate, edge-aware client-side foreground silhouette extractor
function extractClientSideForegroundContour(uploadedImgData: ImageData, edgeData: ImageData | null): number[][] {
  const size = 500;
  // Step 1: Smart background sampling around the outer margins (10% border)
  const margin = 20;
  let bgR = 0, bgG = 0, bgB = 0;
  let bgCount = 0;

  // Sample top, bottom, left, right edges
  for (let x = 0; x < size; x += 25) {
    const topIdx = (margin * size + x) * 4;
    const botIdx = ((size - margin) * size + x) * 4;
    bgR += uploadedImgData.data[topIdx] + uploadedImgData.data[botIdx];
    bgG += uploadedImgData.data[topIdx + 1] + uploadedImgData.data[botIdx + 1];
    bgB += uploadedImgData.data[topIdx + 2] + uploadedImgData.data[botIdx + 2];
    bgCount += 2;
  }
  for (let y = margin; y < size - margin; y += 25) {
    const leftIdx = (y * size + margin) * 4;
    const rightIdx = (y * size + size - margin) * 4;
    bgR += uploadedImgData.data[leftIdx] + uploadedImgData.data[rightIdx];
    bgG += uploadedImgData.data[leftIdx + 1] + uploadedImgData.data[rightIdx + 1];
    bgB += uploadedImgData.data[leftIdx + 2] + uploadedImgData.data[rightIdx + 2];
    bgCount += 2;
  }

  bgR = bgCount > 0 ? bgR / bgCount : 240;
  bgG = bgCount > 0 ? bgG / bgCount : 240;
  bgB = bgCount > 0 ? bgB / bgCount : 240;

  // Step 2: Build density map of pixels that deviate strongly from the average background color
  const fgDensity = new Float32Array(size * size);
  let centerSumX = 0;
  let centerSumY = 0;
  let totalFgWeight = 0;

  for (let y = 15; y < size - 15; y += 3) {
    for (let x = 15; x < size - 15; x += 3) {
      const idx = y * size + x;
      const pixelIdx = idx * 4;
      const r = uploadedImgData.data[pixelIdx];
      const g = uploadedImgData.data[pixelIdx + 1];
      const b = uploadedImgData.data[pixelIdx + 2];

      const colorDist = Math.hypot(r - bgR, g - bgG, b - bgB);
      let isEdge = false;
      if (edgeData) {
        isEdge = edgeData.data[pixelIdx] > 128;
      }

      // If color is distinctly different OR it sits on a strong high-contrast edge, mark it as high weight foreground
      if (colorDist > 55 || isEdge) {
        const weight = isEdge ? 2.5 : 1.0;
        fgDensity[idx] = weight;

        // Favor central weight to avoid capturing background borders
        const distanceToCenter = Math.hypot(x - size/2, y - size/2);
        const centerBonus = Math.max(0.1, 1.0 - distanceToCenter / (size / 1.5));
        
        centerSumX += x * weight * centerBonus;
        centerSumY += y * weight * centerBonus;
        totalFgWeight += weight * centerBonus;
      }
    }
  }

  // Calculate center of mass of the human silhouette/foreground object
  const cx = totalFgWeight > 10 ? Math.round(centerSumX / totalFgWeight) : Math.round(size / 2);
  const cy = totalFgWeight > 10 ? Math.round(centerSumY / totalFgWeight) : Math.round(size / 2);

  // Step 3: Run radial ray-casting outward from the center of mass to trace the silhouette boundary
  const points: number[][] = [];
  const totalRays = 36;

  for (let i = 0; i < totalRays; i++) {
    const angle = (i / totalRays) * Math.PI * 2;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);

    // Max search distance before hitting edges
    const maxD = Math.min(cx, size - 1 - cx, cy, size - 1 - cy, 240);
    let boundaryD = 15; // start slightly away from the center of mass

    for (let d = 20; d <= maxD; d += 3) {
      const rx = Math.round(cx + cosA * d);
      const ry = Math.round(cy + sinA * d);
      const idx = ry * size + rx;

      // Detect edge/boundary transition: either a Sobel edge OR transition back into background color
      let isEdge = false;
      if (edgeData) {
        isEdge = edgeData.data[idx * 4] > 128;
      }

      const pixelIdx = idx * 4;
      const r = uploadedImgData.data[pixelIdx];
      const g = uploadedImgData.data[pixelIdx + 1];
      const b = uploadedImgData.data[pixelIdx + 2];
      const colorDist = Math.hypot(r - bgR, g - bgG, b - bgB);

      // Boundary condition: hits Sobel edge OR background color becomes similar to sampled background
      if (isEdge || colorDist < 40) {
        boundaryD = d;
        break;
      }
    }

    if (boundaryD === 15) {
      // Smooth visual fallback ellipse radius if ray misses
      boundaryD = 130;
    }

    const bx = cx + cosA * boundaryD;
    const by = cy + sinA * boundaryD;

    points.push([
      Math.max(1, Math.min(99, (bx / size) * 100)),
      Math.max(1, Math.min(99, (by / size) * 100))
    ]);
  }

  // Step 4: Apply 3-pass moving-average smoothing for a beautiful, organic aesthetic
  const smoothedPoints: number[][] = [];
  for (let pass = 0; pass < 2; pass++) {
    const currentList = pass === 0 ? points : smoothedPoints;
    const targetList = pass === 0 ? smoothedPoints : [];
    
    for (let i = 0; i < totalRays; i++) {
      const prev = currentList[(i - 1 + totalRays) % totalRays];
      const curr = currentList[i];
      const next = currentList[(i + 1) % totalRays];

      const sx = (prev[0] * 0.25) + (curr[0] * 0.5) + (next[0] * 0.25);
      const sy = (prev[1] * 0.25) + (curr[1] * 0.5) + (next[1] * 0.25);
      
      if (pass === 0) {
        targetList.push([sx, sy]);
      } else {
        currentList[i] = [sx, sy];
      }
    }
  }

  return smoothedPoints;
}

// Convert Hex to RGB with optional shift and transparency
function hexToRgb(hex: string, shift = 0, alpha = 1.0): string {
  const cleanHex = hex.replace("#", "");
  let r = parseInt(cleanHex.substring(0, 2), 16) || 0;
  let g = parseInt(cleanHex.substring(2, 4), 16) || 0;
  let b = parseInt(cleanHex.substring(4, 6), 16) || 0;

  if (shift !== 0) {
    r = Math.max(0, Math.min(255, r + shift));
    g = Math.max(0, Math.min(255, g + shift));
    b = Math.max(0, Math.min(255, b + shift));
  }
  
  if (alpha !== 1.0) {
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return `rgb(${r}, ${g}, ${b})`;
}

// Helper to draw custom tile shapes on canvas
function drawTile(
  ctx: CanvasRenderingContext2D,
  shape: TileShape,
  size: number,
  gap: number
) {
  const tileSize = size - gap;
  if (tileSize <= 1) return;

  const half = tileSize / 2;

  switch (shape) {
    case "circle":
      ctx.beginPath();
      ctx.arc(0, 0, half, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      break;

    case "rounded-square":
      const radius = Math.max(2, tileSize * 0.2);
      ctx.beginPath();
      ctx.moveTo(-half + radius, -half);
      ctx.lineTo(half - radius, -half);
      ctx.quadraticCurveTo(half, -half, half, -half + radius);
      ctx.lineTo(half, half - radius);
      ctx.quadraticCurveTo(half, half, half - radius, half);
      ctx.lineTo(-half + radius, half);
      ctx.quadraticCurveTo(-half, half, -half, half - radius);
      ctx.lineTo(-half, -half + radius);
      ctx.quadraticCurveTo(-half, -half, -half + radius, -half);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;

    case "triangle":
      ctx.beginPath();
      ctx.moveTo(0, -half);
      ctx.lineTo(half, half);
      ctx.lineTo(-half, half);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;

    case "square":
    default:
      ctx.beginPath();
      ctx.rect(-half, -half, tileSize, tileSize);
      ctx.fill();
      ctx.stroke();
      break;
  }
}

export const MosaicCanvas: React.FC<MosaicCanvasProps> = ({
  template,
  regionColors,
  selectedRegionId,
  onRegionSelect,
  options,
  customImage,
  viewMode,
  buildProgress,
  onTileStatsChange,
  customImageColors = [],
  customColorReplacements = {},
  showNumbers = false,
  activeEditTool = "move",
  activeColor = "#ffd700",
  detectedObjects = [],
  selectedObjectIds = [],
  hoveredObjectId = null,
  onHoverObject,
  onSelectObject,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hoveredRegionId, setHoveredRegionId] = useState<string | null>(null);
  const [edgeData, setEdgeData] = useState<ImageData | null>(null);
  const [uploadedImgData, setUploadedImgData] = useState<ImageData | null>(null);

  // Local high-precision edge-aware object polygon generator (Magic Wand & Contour Refinement)
  const getObjectPolygon = useCallback((obj: { id: string; box: number[]; polygon?: number[][] }): number[][] => {
    // 1. If we have a custom semantic polygon directly from Gemini Vision, use it 100%!
    if (obj.polygon && obj.polygon.length >= 3 && !obj.id.startsWith("fallback_")) {
      return obj.polygon;
    }

    // 2. If it is the fallback's main focus region, generate a smart client-side foreground contour!
    if (obj.id === "fallback_obj_1" && uploadedImgData) {
      return extractClientSideForegroundContour(uploadedImgData, edgeData);
    }

    // If the image data is not loaded yet, use the organic fallback
    if (!uploadedImgData) {
      return getOrganicObjectPolygon(obj);
    }

    try {
      // 1. Convert normalized box (0-100) to 500x500 pixel coordinate scale
      const size = 500;
      const [ymin, xmin, ymax, xmax] = obj.box;
      const xStart = Math.max(0, Math.min(size - 1, Math.round((xmin / 100) * size)));
      const xEnd = Math.max(0, Math.min(size - 1, Math.round((xmax / 100) * size)));
      const yStart = Math.max(0, Math.min(size - 1, Math.round((ymin / 100) * size)));
      const yEnd = Math.max(0, Math.min(size - 1, Math.round((ymax / 100) * size)));

      // 2. Compute seed coordinate as the center of the bounding box
      const cx = Math.max(0, Math.min(size - 1, Math.round((xStart + xEnd) / 2)));
      const cy = Math.max(0, Math.min(size - 1, Math.round((yStart + yEnd) / 2)));

      // 3. Sample average color around the center point
      let sumR = 0, sumG = 0, sumB = 0, count = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const sx = cx + dx;
          const sy = cy + dy;
          if (sx >= 0 && sx < size && sy >= 0 && sy < size) {
            const idx = (sy * size + sx) * 4;
            sumR += uploadedImgData.data[idx];
            sumG += uploadedImgData.data[idx + 1];
            sumB += uploadedImgData.data[idx + 2];
            count++;
          }
        }
      }
      const seedR = count > 0 ? sumR / count : 128;
      const seedG = count > 0 ? sumG / count : 128;
      const seedB = count > 0 ? sumB / count : 128;

      // 4. Run simple queue-based flood fill to build a binary mask of the object
      const mask = new Uint8Array(size * size);
      const queue: [number, number][] = [[cx, cy]];
      mask[cy * size + cx] = 1;

      // Color tolerance threshold - tuned for high quality natural boundaries
      const colorTolerance = 75;

      while (queue.length > 0) {
        const [x, y] = queue.shift()!;

        const neighbors = [
          [x + 1, y],
          [x - 1, y],
          [x, y + 1],
          [x, y - 1]
        ];

        for (const [nx, ny] of neighbors) {
          if (nx >= xStart && nx <= xEnd && ny >= yStart && ny <= yEnd) {
            const idx = ny * size + nx;
            if (mask[idx] === 0) {
              // Edge barrier from Sobel filter
              const isEdge = edgeData ? edgeData.data[idx * 4] > 100 : false;

              // Color similarity
              const pixelIdx = idx * 4;
              const r = uploadedImgData.data[pixelIdx];
              const g = uploadedImgData.data[pixelIdx + 1];
              const b = uploadedImgData.data[pixelIdx + 2];
              const colorDist = Math.hypot(r - seedR, g - seedG, b - seedB);

              if (!isEdge && colorDist < colorTolerance) {
                mask[idx] = 1;
                queue.push([nx, ny]);
              }
            }
          }
        }
      }

      // 5. Trace 36 radial rays from center to extract a beautiful smooth closed contour
      const points: number[][] = [];
      const totalRays = 36;

      for (let i = 0; i < totalRays; i++) {
        const angle = (i / totalRays) * Math.PI * 2;
        const cosA = Math.cos(angle);
        const sinA = Math.sin(angle);

        // Max search distance is distance from center to box edge in that direction
        const tX = cosA > 0 ? (xEnd - cx) / cosA : (xStart - cx) / cosA;
        const tY = sinA > 0 ? (yEnd - cy) / sinA : (yStart - cy) / sinA;
        const maxD = Math.min(Math.abs(tX), Math.abs(tY));

        let lastValidX = cx;
        let lastValidY = cy;

        for (let d = 0; d <= maxD; d += 2) {
          const rxPixel = Math.round(cx + cosA * d);
          const ryPixel = Math.round(cy + sinA * d);

          if (rxPixel >= 0 && rxPixel < size && ryPixel >= 0 && ryPixel < size) {
            if (mask[ryPixel * size + rxPixel] === 1) {
              lastValidX = rxPixel;
              lastValidY = ryPixel;
            } else {
              break;
            }
          } else {
            break;
          }
        }

        // Convert back to percentage (0-100)
        const px = Math.max(0, Math.min(100, (lastValidX / size) * 100));
        const py = Math.max(0, Math.min(100, (lastValidY / size) * 100));
        points.push([px, py]);
      }

      // Smooth the points with a sliding window for extra visual elegance
      const smoothedPoints: number[][] = [];
      for (let i = 0; i < totalRays; i++) {
        const prev = points[(i - 1 + totalRays) % totalRays];
        const curr = points[i];
        const next = points[(i + 1) % totalRays];

        const sx = (prev[0] + curr[0] + next[0]) / 3;
        const sy = (prev[1] + curr[1] + next[1]) / 3;
        smoothedPoints.push([sx, sy]);
      }

      return smoothedPoints;
    } catch (e) {
      console.warn("Error calculating high-precision polygon, using fallback:", e);
      return getOrganicObjectPolygon(obj);
    }
  }, [uploadedImgData, edgeData]);

  // Interactive manual tiles state
  const [tiles, setTiles] = useState<InteractiveTile[]>([]);
  const [draggedTileId, setDraggedTileId] = useState<string | null>(null);
  const [dragStartOffset, setDragStartOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [swapSelectedTileId, setSwapSelectedTileId] = useState<string | null>(null);
  const [hoveredTileId, setHoveredTileId] = useState<string | null>(null);

  // Initialize Path2D objects for regions once
  const [pathCache, setPathCache] = useState<Record<string, Path2D>>({});

  useEffect(() => {
    if (template) {
      const cache: Record<string, Path2D> = {};
      template.regions.forEach((region) => {
        cache[region.id] = new Path2D(region.path);
      });
      setPathCache(cache);
    }
  }, [template]);

  // Handle Edge Detection on uploaded image
  useEffect(() => {
    if (!template && customImage) {
      const tempCanvas = document.createElement("canvas");
      const ctx = tempCanvas.getContext("2d");
      if (!ctx) return;

      const size = 500;
      tempCanvas.width = size;
      tempCanvas.height = size;

      // Draw and scale the image to fit 500x500 box
      ctx.drawImage(customImage, 0, 0, size, size);
      const imgData = ctx.getImageData(0, 0, size, size);
      setUploadedImgData(imgData);

      // Sobel Edge Filter
      const gray = new Float32Array(size * size);
      for (let i = 0; i < imgData.data.length; i += 4) {
        gray[i / 4] =
          0.299 * imgData.data[i] +
          0.587 * imgData.data[i + 1] +
          0.114 * imgData.data[i + 2];
      }

      const sobelData = ctx.createImageData(size, size);
      for (let y = 1; y < size - 1; y++) {
        for (let x = 1; x < size - 1; x++) {
          const idx = y * size + x;
          const gx =
            -1 * gray[(y - 1) * size + (x - 1)] +
            1 * gray[(y - 1) * size + (x + 1)] -
            2 * gray[y * size + (x - 1)] +
            2 * gray[y * size + (x + 1)] -
            1 * gray[(y + 1) * size + (x - 1)] +
            1 * gray[(y + 1) * size + (x + 1)];

          const gy =
            -1 * gray[(y - 1) * size + (x - 1)] -
            2 * gray[(y - 1) * size + x] -
            1 * gray[(y - 1) * size + (x + 1)] +
            1 * gray[(y + 1) * size + (x - 1)] +
            2 * gray[(y + 1) * size + x] +
            1 * gray[(y + 1) * size + (x + 1)];

          const val = Math.sqrt(gx * gx + gy * gy);
          const pixelIdx = idx * 4;
          sobelData.data[pixelIdx] = val > 50 ? 255 : 0; // high contrast edges
          sobelData.data[pixelIdx + 1] = val > 50 ? 255 : 0;
          sobelData.data[pixelIdx + 2] = val > 50 ? 255 : 0;
          sobelData.data[pixelIdx + 3] = 255;
        }
      }
      setEdgeData(sobelData);
    } else {
      setEdgeData(null);
      setUploadedImgData(null);
    }
  }, [template, customImage]);

  // COLOR & UTILITY HELPERS FOR SAYILARLA BOYAMA / RENK DEĞİŞTİRME
  const getRgb = (hex: string) => {
    const clean = hex.replace("#", "");
    const r = parseInt(clean.substring(0, 2), 16) || 0;
    const g = parseInt(clean.substring(2, 4), 16) || 0;
    const b = parseInt(clean.substring(4, 6), 16) || 0;
    return { r, g, b };
  };

  const getColorDistance = (hex1: string, hex2: string): number => {
    const c1 = getRgb(hex1);
    const c2 = getRgb(hex2);
    return Math.hypot(c1.r - c2.r, c1.g - c2.g, c1.b - c2.b);
  };

  const getClosestDominantColor = (hex: string, dominantColors: string[]): string => {
    if (dominantColors.length === 0) return hex;
    let closest = dominantColors[0];
    let minDist = getColorDistance(hex, closest);
    for (let i = 1; i < dominantColors.length; i++) {
      const dist = getColorDistance(hex, dominantColors[i]);
      if (dist < minDist) {
        minDist = dist;
        closest = dominantColors[i];
      }
    }
    return closest;
  };

  const getColorNumber = (colorHex: string): number => {
    if (template) {
      // Find index in region colors to assign a unique stable number for each unique color
      const uniqueColors = Array.from(new Set(Object.values(regionColors))).sort();
      const idx = uniqueColors.indexOf(colorHex);
      return idx !== -1 ? idx + 1 : 1;
    } else if (customImageColors && customImageColors.length > 0) {
      const closestDom = getClosestDominantColor(colorHex, customImageColors);
      const idx = customImageColors.indexOf(closestDom);
      return idx !== -1 ? idx + 1 : 1;
    }
    return 1;
  };

  const getDisplayColor = (baseColor: string): string => {
    if (!template && customImageColors && customImageColors.length > 0) {
      const closestDom = getClosestDominantColor(baseColor, customImageColors);
      if (customColorReplacements[closestDom]) {
        return customColorReplacements[closestDom];
      }
    }
    return baseColor;
  };

  // 1. TILES GENERATION EFFECT
  // Generates/Regenerates the list of tiles whenever source, shape, or dimensions change.
  useEffect(() => {
    const tempCanvas = document.createElement("canvas");
    const ctx = tempCanvas.getContext("2d");
    if (!ctx) return;

    const width = template ? template.width : 500;
    const height = template ? template.height : 500;
    tempCanvas.width = width;
    tempCanvas.height = height;

    const generatedTiles: InteractiveTile[] = [];
    const step = options.tileSize;
    const hStep = step / 2;

    // Seed-based stable random generator to avoid flickering tiles
    let lcgSeed = 12345;
    function pseudoRandom() {
      lcgSeed = (lcgSeed * 1664525 + 1013904223) % 4294967296;
      return lcgSeed / 4294967296;
    }

    if (template) {
      // Mode A: Vector Template Mosaic
      for (let y = hStep; y < height; y += step + options.gap) {
        for (let x = hStep; x < width; x += step + options.gap) {
          let targetRegion: MosaicRegion | null = null;
          for (let i = template.regions.length - 1; i >= 0; i--) {
            const reg = template.regions[i];
            const p = pathCache[reg.id];
            if (p && ctx.isPointInPath(p, x, y)) {
              targetRegion = reg;
              break;
            }
          }

          if (targetRegion) {
            const regId = targetRegion.id;
            const regColor = regionColors[regId] || targetRegion.defaultColor;

            if (options.useGroutGaps) {
              const p = pathCache[regId];
              const corners = [
                [x - hStep, y - hStep],
                [x + hStep, y - hStep],
                [x - hStep, y + hStep],
                [x + hStep, y + hStep],
              ];
              const allInside = corners.every(([cx, cy]) => ctx.isPointInPath(p, cx, cy));
              if (!allInside) continue;
            }

            const randVal1 = pseudoRandom();
            const randVal2 = pseudoRandom();
            const randVal3 = pseudoRandom();
            const randVal4 = pseudoRandom();

            const offsetMax = (options.jitter / 100) * options.tileSize * 0.35;
            const dx = (randVal1 - 0.5) * offsetMax;
            const dy = (randVal2 - 0.5) * offsetMax;

            const angleMax = (options.jitter / 100) * (Math.PI / 6);
            const angle = (randVal3 - 0.5) * angleMax;
            const shadeShift = Math.round((randVal4 - 0.5) * 24);

            generatedTiles.push({
              id: `tile-${x}-${y}`,
              x,
              y,
              dx,
              dy,
              angle,
              color: regColor,
              regionId: regId,
              regionName: targetRegion.name,
              shadeShift,
              order: randVal1,
            });
          }
        }
      }
    } else if (uploadedImgData) {
      // Mode B: Uploaded Image Mosaic
      const imgW = uploadedImgData.width;
      const imgH = uploadedImgData.height;

      for (let y = hStep; y < height; y += step + options.gap) {
        for (let x = hStep; x < width; x += step + options.gap) {
          // If we are in "objects" mode, we ONLY generate tiles inside selected object precise polygon shapes!
          if (viewMode === "objects") {
            const px = (x / width) * 100;
            const py = (y / height) * 100;
            const isInsideSelected = selectedObjectIds.some(id => {
              const obj = detectedObjects.find(o => o.id === id);
              if (!obj) return false;
              const poly = getObjectPolygon(obj);
              return isPointInPolygon(px, py, poly);
            });
            if (!isInsideSelected) continue;
          }

          let rSum = 0, gSum = 0, bSum = 0, count = 0;
          const startX = Math.max(0, Math.floor(x - hStep));
          const endX = Math.min(imgW - 1, Math.floor(x + hStep));
          const startY = Math.max(0, Math.floor(y - hStep));
          const endY = Math.min(imgH - 1, Math.floor(y + hStep));

          for (let cy = startY; cy <= endY; cy++) {
            for (let cx = startX; cx <= endX; cx++) {
              const pIdx = (cy * imgW + cx) * 4;
              rSum += uploadedImgData.data[pIdx];
              gSum += uploadedImgData.data[pIdx + 1];
              bSum += uploadedImgData.data[pIdx + 2];
              count++;
            }
          }

          if (count > 0) {
            const hexColor =
              "#" +
              [rSum / count, gSum / count, bSum / count]
                .map((val) => Math.round(val).toString(16).padStart(2, "0"))
                .join("");

            if (options.useGroutGaps && edgeData) {
              let isEdge = false;
              const checkPoints = [
                [x, y],
                [x - hStep, y - hStep],
                [x + hStep, y - hStep],
                [x - hStep, y + hStep],
                [x + hStep, y + hStep],
              ];
              for (const [px, py] of checkPoints) {
                const edgeIdx = (Math.floor(py) * imgW + Math.floor(px)) * 4;
                if (edgeIdx >= 0 && edgeIdx < edgeData.data.length && edgeData.data[edgeIdx] > 128) {
                  isEdge = true;
                  break;
                }
              }
              if (isEdge) continue;
            }

            const randVal1 = pseudoRandom();
            const randVal2 = pseudoRandom();
            const randVal3 = pseudoRandom();
            const randVal4 = pseudoRandom();

            const offsetMax = (options.jitter / 100) * options.tileSize * 0.35;
            const dx = (randVal1 - 0.5) * offsetMax;
            const dy = (randVal2 - 0.5) * offsetMax;

            const angleMax = (options.jitter / 100) * (Math.PI / 6);
            const angle = (randVal3 - 0.5) * angleMax;
            const shadeShift = Math.round((randVal4 - 0.5) * 16);

            generatedTiles.push({
              id: `tile-custom-${x}-${y}`,
              x,
              y,
              dx,
              dy,
              angle,
              color: hexColor,
              shadeShift,
              order: randVal1,
            });
          }
        }
      }
    }

    setTiles(generatedTiles);
    setSwapSelectedTileId(null);
  }, [
    template,
    pathCache,
    regionColors,
    options.tileSize,
    options.gap,
    options.shape,
    options.jitter,
    options.useGroutGaps,
    uploadedImgData,
    edgeData,
    viewMode,
    selectedObjectIds,
    detectedObjects
  ]);

  // 2. MAIN DRAW EFFECT
  // Renders the current state of tiles to the canvas (includes real-time replacements, drag-highlights, and numbers)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = template ? template.width : 500;
    const height = template ? template.height : 500;
    canvas.width = width;
    canvas.height = height;

    // Draw Background
    ctx.fillStyle = template ? options.backgroundColor : (options.backgroundColor || "#0d0e15");
    ctx.fillRect(0, 0, width, height);

    if (viewMode === "guide") {
      ctx.save();
      if (template) {
        // Draw template faded regions as a guide background
        ctx.globalAlpha = 0.35;
        template.regions.forEach((region) => {
          const path = pathCache[region.id];
          if (!path) return;
          ctx.fillStyle = regionColors[region.id] || region.defaultColor;
          ctx.fill(path);
        });
        ctx.globalAlpha = 1.0;
      } else if (customImage) {
        // Draw custom uploaded image as a semi-transparent guide background
        ctx.globalAlpha = 0.45;
        ctx.drawImage(customImage, 0, 0, width, height);
        ctx.globalAlpha = 1.0;
      }
      ctx.restore();
    }

    if (viewMode === "vector") {
      if (template) {
        // VECTOR PREVIEW MODE
        template.regions.forEach((region) => {
          const path = pathCache[region.id];
          if (!path) return;

          const baseColor = regionColors[region.id] || region.defaultColor;

          ctx.fillStyle = baseColor;
          ctx.fill(path);

          // Highlight selected/hovered region
          if (selectedRegionId === region.id) {
            ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
            ctx.fill(path);
            ctx.lineWidth = options.outlineWidth + 1.5;
            ctx.strokeStyle = "#fbbf24"; // Gold highlight
            ctx.stroke(path);
          } else if (hoveredRegionId === region.id) {
            ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
            ctx.fill(path);
          }
        });

        // Draw outlines
        if (options.showOutlines) {
          ctx.strokeStyle = options.outlineColor;
          ctx.lineWidth = options.outlineWidth;
          template.regions.forEach((region) => {
            const path = pathCache[region.id];
            if (path) ctx.stroke(path);
          });
        }
      } else if (customImage) {
        // DRAW ORIGINAL IMAGE PREVIEW
        ctx.drawImage(customImage, 0, 0, width, height);
      }
    } else if (viewMode === "objects" && customImage) {
      // OBJECT SELECTION VIEW MODE:
      // 1. Draw original background image
      ctx.drawImage(customImage, 0, 0, width, height);

      // 2. Draw our generated mosaic tiles inside the selected objects
      ctx.save();
      for (const tile of tiles) {
        const displayColor = getDisplayColor(tile.color);
        ctx.save();
        ctx.translate(tile.x + tile.dx, tile.y + tile.dy);
        ctx.rotate(tile.angle);
        
        // Render mosaic tiles with a clean, standard look on top of the original image
        ctx.fillStyle = hexToRgb(displayColor, tile.shadeShift, 1.0);
        ctx.strokeStyle = "rgba(0, 0, 0, 0.2)";
        ctx.lineWidth = 0.5;
        
        drawTile(ctx, options.shape, options.tileSize, options.gap);

        // Show numbers if requested
        if (showNumbers) {
          const num = getColorNumber(tile.color);
          const rgb = getRgb(displayColor);
          const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
          ctx.fillStyle = luminance > 0.55 ? "#000000" : "#ffffff";
          ctx.font = `bold ${Math.max(6, options.tileSize * 0.45)}px monospace`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(num.toString(), 0, 0);
        }

        ctx.restore();
      }
      ctx.restore();

      // 3. Draw precise silhouette polygons and text labels for objects
      if (detectedObjects && detectedObjects.length > 0) {
        detectedObjects.forEach((obj) => {
          const polyPoints = getObjectPolygon(obj);
          if (polyPoints.length === 0) return;

          const isHovered = obj.id === hoveredObjectId;
          const isSelected = selectedObjectIds.includes(obj.id);

          ctx.save();
          
          // Generate precise canvas path for the polygon
          ctx.beginPath();
          polyPoints.forEach(([px, py], idx) => {
            const cx = (px / 100) * width;
            const cy = (py / 100) * height;
            if (idx === 0) {
              ctx.moveTo(cx, cy);
            } else {
              ctx.lineTo(cx, cy);
            }
          });
          ctx.closePath();

          if (isHovered) {
            // Elegant glowing hover style
            ctx.shadowColor = "rgba(99, 102, 241, 0.85)";
            ctx.shadowBlur = 12;
            ctx.strokeStyle = "#818cf8";
            ctx.lineWidth = 2.5;
            ctx.fillStyle = "rgba(99, 102, 241, 0.18)";
            ctx.fill();
            ctx.stroke();
          } else if (isSelected) {
            // Gold outline for selected object silhouette
            ctx.strokeStyle = "#ffd700";
            ctx.lineWidth = 2.0;
            ctx.setLineDash([5, 5]);
            ctx.stroke();
            // Subtle amber tint for selected area
            ctx.fillStyle = "rgba(245, 158, 11, 0.05)";
            ctx.fill();
          } else {
            // Translucent dashed contour line for discoverability
            ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
            ctx.lineWidth = 1.2;
            ctx.setLineDash([3, 5]);
            ctx.stroke();
          }
          ctx.restore();

          // Draw elegant floating badge near the top-most center coordinate of the polygon
          let minY = 999;
          let topX = 0;
          let topY = 0;
          polyPoints.forEach(([px, py]) => {
            const cx = (px / 100) * width;
            const cy = (py / 100) * height;
            if (cy < minY) {
              minY = cy;
              topX = cx;
              topY = cy;
            }
          });

          // Fallback to bounding box center if topX calculation fails
          if (topX === 0 && topY === 0) {
            const [ymin, xmin] = obj.box;
            topX = (xmin / 100) * width;
            topY = (ymin / 100) * height;
          }

          ctx.save();
          ctx.font = "bold 10px Inter, system-ui, sans-serif";
          const text = `${obj.name}${isSelected ? " 🧩" : ""}`;
          const textWidth = ctx.measureText(text).width;
          
          ctx.fillStyle = isHovered 
            ? "rgba(99, 102, 241, 0.95)" 
            : isSelected 
            ? "rgba(217, 119, 6, 0.95)" 
            : "rgba(15, 23, 42, 0.75)";
          
          // Align badge neatly above the top of the polygon, or offset down if near the canvas boundary
          const badgeY = topY > 20 ? topY - 5 : topY + 15;
          const badgeX = Math.max(5, Math.min(width - textWidth - 15, topX - 10));

          // Draw rounded badge container
          const radius = 4;
          const bx = badgeX;
          const by = badgeY - 11;
          const bw = textWidth + 12;
          const bh = 16;
          
          ctx.beginPath();
          ctx.moveTo(bx + radius, by);
          ctx.lineTo(bx + bw - radius, by);
          ctx.quadraticCurveTo(bx + bw, by, bx + bw, by + radius);
          ctx.lineTo(bx + bw, by + bh - radius);
          ctx.quadraticCurveTo(bx + bw, by + bh, bx + bw - radius, by + bh);
          ctx.lineTo(bx + radius, by + bh);
          ctx.quadraticCurveTo(bx, by + bh, bx, by + bh - radius);
          ctx.lineTo(bx, by + radius);
          ctx.quadraticCurveTo(bx, by, bx + radius, by);
          ctx.closePath();
          ctx.fill();
          
          ctx.fillStyle = "#ffffff";
          ctx.fillText(text, badgeX + 6, badgeY + 1);
          ctx.restore();
        });
      }
    } else if (viewMode === "mosaic" || viewMode === "guide") {
      // MOSAIC RENDER & GUIDE MODE - Consume state `tiles`

      // Compute stats
      const stats: Record<string, { hex: string; count: number; name: string }> = {};
      tiles.forEach((tile) => {
        const displayColor = getDisplayColor(tile.color);
        const hex = displayColor.toLowerCase();
        if (!stats[hex]) {
          stats[hex] = {
            hex,
            count: 0,
            name: tile.regionName || "Serbest Mozaik Parçası",
          };
        }
        stats[hex].count++;
      });

      if (onTileStatsChange) {
        onTileStatsChange(stats);
      }

      // Sort tiles by 'order' to draw them in build order when buildProgress < 1
      const totalTiles = tiles.length;
      const countToDraw = Math.floor(totalTiles * buildProgress);

      const sortedTiles = [...tiles].sort((a, b) => a.order - b.order);

      const isGuideMode = viewMode === "guide";

      for (let i = 0; i < countToDraw; i++) {
        const tile = sortedTiles[i];
        const displayColor = getDisplayColor(tile.color);

        ctx.save();
        ctx.translate(tile.x + tile.dx, tile.y + tile.dy);
        ctx.rotate(tile.angle);

        // Apply shade shift to displayColor
        // If guide mode, render tiles with high transparency to reveal the background image underneath, and no random shade variation to keep the basic color clear!
        ctx.fillStyle = hexToRgb(displayColor, isGuideMode ? 0 : tile.shadeShift, isGuideMode ? 0.35 : 1.0);

        // Highlight if hovered or selected for swap
        const isHovered = hoveredTileId === tile.id;
        const isSwapSelected = swapSelectedTileId === tile.id;

        if (isHovered || isSwapSelected) {
          ctx.strokeStyle = isSwapSelected ? "#fbbf24" : "#6366f1";
          ctx.lineWidth = isSwapSelected ? 2.5 : 1.5;
        } else if (isGuideMode) {
          // Draw neat, visible outlines (kutucuklar) around the tiles in guide mode
          ctx.strokeStyle = "rgba(0, 0, 0, 0.45)";
          ctx.lineWidth = 0.8;
        } else {
          ctx.strokeStyle = "rgba(0, 0, 0, 0.15)";
          ctx.lineWidth = 0.5;
        }

        // Draw the tile
        drawTile(ctx, options.shape, options.tileSize, options.gap);

        // Draw numbers overlay inside the tile if enabled (always show in guide mode)
        if (showNumbers || isGuideMode) {
          const num = getColorNumber(tile.color);
          const rgb = getRgb(displayColor);
          const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
          ctx.fillStyle = luminance > 0.55 ? "#000000" : "#ffffff";
          ctx.font = `bold ${Math.max(6, options.tileSize * 0.45)}px monospace`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(num.toString(), 0, 0);
        }

        ctx.restore();
      }

      // Draw outlines on top in template mode (only for mosaic mode)
      if (options.showOutlines && template && viewMode === "mosaic") {
        ctx.strokeStyle = options.outlineColor;
        ctx.lineWidth = options.outlineWidth;
        template.regions.forEach((region) => {
          const path = pathCache[region.id];
          if (path) ctx.stroke(path);
        });
      }
    }
  }, [
    template,
    pathCache,
    regionColors,
    selectedRegionId,
    hoveredRegionId,
    options,
    viewMode,
    buildProgress,
    tiles,
    customColorReplacements,
    customImageColors,
    showNumbers,
    hoveredTileId,
    swapSelectedTileId,
    detectedObjects,
    selectedObjectIds,
    hoveredObjectId
  ]);

  // 3. INTERACTIVE COORDINATE & TILE SELECTION HELPERS
  const getCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((e.clientY - rect.top) / rect.height) * canvas.height;
    return { x, y };
  };

  const findClosestTile = (x: number, y: number, maxDistance = options.tileSize * 1.5): InteractiveTile | null => {
    if (tiles.length === 0) return null;
    let closest: InteractiveTile | null = null;
    let minDist = Infinity;
    for (const tile of tiles) {
      const tx = tile.x + tile.dx;
      const ty = tile.y + tile.dy;
      const dist = Math.hypot(x - tx, y - ty);
      if (dist < minDist && dist <= maxDistance) {
        minDist = dist;
        closest = tile;
      }
    }
    return closest;
  };

  // Vector preview & Object detection mouse handlers
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (viewMode === "objects") {
      const coords = getCanvasCoords(e);
      if (!coords) return;
      const width = template ? template.width : 500;
      const height = template ? template.height : 500;
      const px = (coords.x / width) * 100;
      const py = (coords.y / height) * 100;

      let clickedId: string | null = null;
      if (detectedObjects && detectedObjects.length > 0) {
        let bestArea = Infinity;
        for (const obj of detectedObjects) {
          const poly = getObjectPolygon(obj);
          if (isPointInPolygon(px, py, poly)) {
            const [ymin, xmin, ymax, xmax] = obj.box;
            const area = (ymax - ymin) * (xmax - xmin);
            if (area < bestArea) {
              bestArea = area;
              clickedId = obj.id;
            }
          }
        }
      }
      if (clickedId && onSelectObject) {
        onSelectObject(clickedId);
      }
      return;
    }

    if (viewMode !== "vector" || !template) return;
    const coords = getCanvasCoords(e);
    if (!coords) return;

    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;

    for (let i = template.regions.length - 1; i >= 0; i--) {
      const region = template.regions[i];
      const path = pathCache[region.id];
      if (path && ctx.isPointInPath(path, coords.x, coords.y)) {
        onRegionSelect(region.id);
        break;
      }
    }
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (viewMode === "objects") {
      const coords = getCanvasCoords(e);
      if (!coords) return;
      const width = template ? template.width : 500;
      const height = template ? template.height : 500;
      const px = (coords.x / width) * 100;
      const py = (coords.y / height) * 100;

      let hoveredId: string | null = null;
      if (detectedObjects && detectedObjects.length > 0) {
        let bestArea = Infinity;
        for (const obj of detectedObjects) {
          const poly = getObjectPolygon(obj);
          if (isPointInPolygon(px, py, poly)) {
            const [ymin, xmin, ymax, xmax] = obj.box;
            const area = (ymax - ymin) * (xmax - xmin);
            if (area < bestArea) {
              bestArea = area;
              hoveredId = obj.id;
            }
          }
        }
      }
      if (onHoverObject) {
        onHoverObject(hoveredId);
      }
      return;
    }

    if (viewMode !== "vector" || !template) return;
    const coords = getCanvasCoords(e);
    if (!coords) return;

    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;

    let foundId: string | null = null;
    for (let i = template.regions.length - 1; i >= 0; i--) {
      const region = template.regions[i];
      const path = pathCache[region.id];
      if (path && ctx.isPointInPath(path, coords.x, coords.y)) {
        foundId = region.id;
        break;
      }
    }
    setHoveredRegionId(foundId);
  };

  // 4. INTERACTIVE MOSAIC EDIT EVENT HANDLERS
  const [isMouseDown, setIsMouseDown] = useState(false);

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (viewMode === "objects") {
      handleCanvasClick(e);
      return;
    }
    if (viewMode !== "mosaic") {
      handleCanvasClick(e);
      return;
    }
    setIsMouseDown(true);
    const coords = getCanvasCoords(e);
    if (!coords) return;

    const closest = findClosestTile(coords.x, coords.y);

    if (activeEditTool === "move" && closest) {
      setDraggedTileId(closest.id);
      setDragStartOffset({
        x: coords.x - (closest.x + closest.dx),
        y: coords.y - (closest.y + closest.dy)
      });
    } else if (activeEditTool === "swap" && closest) {
      if (!swapSelectedTileId) {
        setSwapSelectedTileId(closest.id);
      } else {
        if (swapSelectedTileId !== closest.id) {
          setTiles(prev => {
            const firstIdx = prev.findIndex(t => t.id === swapSelectedTileId);
            const secondIdx = prev.findIndex(t => t.id === closest.id);
            if (firstIdx !== -1 && secondIdx !== -1) {
              const updated = [...prev];
              const tempColor = updated[firstIdx].color;
              updated[firstIdx].color = updated[secondIdx].color;
              updated[secondIdx].color = tempColor;
              return updated;
            }
            return prev;
          });
        }
        setSwapSelectedTileId(null);
      }
    } else if (activeEditTool === "erase" && closest) {
      setTiles(prev => prev.filter(t => t.id !== closest.id));
    } else if (activeEditTool === "add") {
      if (closest) {
        // Paintbrush effect: Click an existing tile to change its color to the active color
        setTiles(prev => prev.map(t => t.id === closest.id ? { ...t, color: activeColor || "#ffd700" } : t));
      } else {
        // Add new custom tile at exact clicked coordinates
        const newTile: InteractiveTile = {
          id: `tile-added-${Date.now()}-${Math.random()}`,
          x: coords.x,
          y: coords.y,
          dx: 0,
          dy: 0,
          angle: 0,
          color: activeColor || "#ffd700",
          shadeShift: 0,
          order: 1,
        };
        setTiles(prev => [...prev, newTile]);
      }
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (viewMode === "objects") {
      handleCanvasMouseMove(e);
      return;
    }
    if (viewMode !== "mosaic") {
      handleCanvasMouseMove(e);
      return;
    }
    const coords = getCanvasCoords(e);
    if (!coords) return;

    const closest = findClosestTile(coords.x, coords.y);
    setHoveredTileId(closest ? closest.id : null);

    if (activeEditTool === "move" && draggedTileId && isMouseDown) {
      setTiles(prev => prev.map(t => {
        if (t.id === draggedTileId) {
          return {
            ...t,
            dx: coords.x - t.x - dragStartOffset.x,
            dy: coords.y - t.y - dragStartOffset.y,
          };
        }
        return t;
      }));
    }
  };

  const handleMouseUp = () => {
    setIsMouseDown(false);
    setDraggedTileId(null);
  };

  return (
    <div className="relative group overflow-hidden border border-slate-700/60 rounded-xl bg-slate-900 shadow-2xl">
      {/* Interactive indicator overlay */}
      {viewMode === "vector" && template && (
        <div className="absolute top-3 left-3 bg-slate-950/80 backdrop-blur-md text-xs font-medium text-amber-400 px-3 py-1.5 rounded-full shadow-lg flex items-center gap-1.5 z-10 pointer-events-none border border-amber-500/30">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
          Renklemek istediğiniz bölgeye tıklayın
        </div>
      )}

      {viewMode === "mosaic" && buildProgress < 1 && (
        <div className="absolute top-3 left-3 bg-slate-950/85 backdrop-blur-md text-xs font-semibold text-sky-400 px-3.5 py-2 rounded-full shadow-xl flex items-center gap-2 z-10 pointer-events-none border border-sky-500/20">
          <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          Mozaik Parçaları Diziliyor... %{Math.round(buildProgress * 100)}
        </div>
      )}

      <canvas
        id="mosaic-canvas"
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => {
          setHoveredRegionId(null);
          setHoveredTileId(null);
          handleMouseUp();
        }}
        className={`w-full max-w-[500px] h-[500px] block transition-all duration-300 mx-auto select-none ${
          viewMode === "vector" && template ? "cursor-crosshair" : "cursor-grab"
        }`}
      />
    </div>
  );
};
