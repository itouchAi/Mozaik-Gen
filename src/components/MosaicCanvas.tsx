import React, { useRef, useEffect, useState } from "react";
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
  viewMode: "vector" | "mosaic" | "guide";
  buildProgress: number; // 0 to 1 for build animation
  onTileStatsChange?: (stats: Record<string, { hex: string; count: number; name: string }>) => void;
  
  // Custom image colors and replacements
  customImageColors?: string[];
  customColorReplacements?: Record<string, string>;
  showNumbers?: boolean;
  activeEditTool?: "move" | "swap" | "erase" | "add";
  activeColor?: string;
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
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hoveredRegionId, setHoveredRegionId] = useState<string | null>(null);
  const [edgeData, setEdgeData] = useState<ImageData | null>(null);
  const [uploadedImgData, setUploadedImgData] = useState<ImageData | null>(null);

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
    edgeData
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
    swapSelectedTileId
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

  // Vector preview mouse handlers
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
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
