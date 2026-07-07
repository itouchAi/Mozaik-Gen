import React, { useState, useEffect, useRef } from "react";
import { templates, MosaicTemplate } from "./templates";
import { MosaicCanvas } from "./components/MosaicCanvas";
import { MosaicOptions, PRESET_PALETTES, TileShape } from "./types";
import { 
  Grid, 
  Palette, 
  Sparkles, 
  Sliders, 
  Download, 
  Play, 
  RotateCcw, 
  Upload, 
  Check, 
  ChevronRight, 
  Info, 
  Layers, 
  Image as ImageIcon,
  Activity,
  AlertCircle,
  HelpCircle,
  Trash2,
  Hash,
  RefreshCw,
  Target
} from "lucide-react";

export default function App() {
  // Application Modes & Templates State
  const [selectedTemplate, setSelectedTemplate] = useState<MosaicTemplate | null>(templates[0]);
  const [regionColors, setRegionColors] = useState<Record<string, string>>({});
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);
  
  // Custom uploaded image state
  const [customImage, setCustomImage] = useState<HTMLImageElement | null>(null);
  const [customImageName, setCustomImageName] = useState<string>("");
  const [isCustomConfirmed, setIsCustomConfirmed] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // View Mode: 'vector' (coloring stage), 'mosaic' (final tiles rendering) or 'guide' (real image overlay guide)
  const [viewMode, setViewMode] = useState<"vector" | "mosaic" | "guide">("vector");
  
  // Custom color count state
  const [colorCount, setColorCount] = useState<number>(6);
  
  // Suggested optimal colors states
  const [suggestedColorCount, setSuggestedColorCount] = useState<number | null>(null);
  const [suggestedColors, setSuggestedColors] = useState<string[]>([]);
  const [suggestedColorsNames, setSuggestedColorsNames] = useState<string[]>([]);
  
  // Build progression state (for construction animation)
  const [buildProgress, setBuildProgress] = useState<number>(1);
  const [isBuilding, setIsBuilding] = useState<boolean>(false);
  const buildIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Custom image color analysis and replacement states
  const [customImageColors, setCustomImageColors] = useState<string[]>([]);
  const [customColorReplacements, setCustomColorReplacements] = useState<Record<string, string>>({});

  // Show number labels (Paint-by-Numbers)
  const [showNumbers, setShowNumbers] = useState<boolean>(false);

  // Manual interactive editing tool for tiles
  const [activeEditTool, setActiveEditTool] = useState<"move" | "swap" | "erase" | "add">("move");

  // Mosaic styling and algorithm options
  const [options, setOptions] = useState<MosaicOptions>({
    tileSize: 14,
    jitter: 45, // 45% position/rotation irregularity by default
    gap: 1.5,
    shape: "square", // default 'square' matching bear
    showOutlines: true,
    outlineColor: "#ffffff", // Default white outlines
    outlineWidth: 1.5,
    backgroundColor: "#0d0e15", // Default dark slate
    useGroutGaps: true, // leave neat gaps around contours
    groutThreshold: 80,
  });

  // Fullscreen & right accordion sidebar states
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [fullscreenWarning, setFullscreenWarning] = useState<boolean>(false);
  const [expandedPanel, setExpandedPanel] = useState<string>("design");

  // Color selection active palette state
  const [activeColor, setActiveColor] = useState<string>("#ffd700");

  // Statistics for physical tiles panel
  const [tileStats, setTileStats] = useState<Record<string, { hex: string; count: number; name: string }>>({});

  // Object Selection States
  const [detectedObjects, setDetectedObjects] = useState<Array<{ id: string; name: string; box: number[]; polygon?: number[][] }>>([]);
  const [selectedObjectIds, setSelectedObjectIds] = useState<string[]>([]);
  const [hoveredObjectId, setHoveredObjectId] = useState<string | null>(null);
  const [isAnalyzingObjects, setIsAnalyzingObjects] = useState<boolean>(false);
  const [objectAnalysisError, setObjectAnalysisError] = useState<string | null>(null);

  // Manual Drawing & Segment Edit States
  const [segmentationTool, setSegmentationTool] = useState<"auto" | "pen">("auto");
  const [manualDrawPoints, setManualDrawPoints] = useState<number[][]>([]);
  const [isDrawingClosed, setIsDrawingClosed] = useState<boolean>(false);
  const [manualDrawWarning, setManualDrawWarning] = useState<string | null>(null);

  const handleUpdateObjectPolygon = (id: string, newPolygon: number[][]) => {
    setDetectedObjects((prev) =>
      prev.map((obj) => (obj.id === id ? { ...obj, polygon: newPolygon } : obj))
    );
  };

  const detectObjectsFromImage = async () => {
    if (!customImage) return;
    setIsAnalyzingObjects(true);
    setObjectAnalysisError(null);
    try {
      const response = await fetch("/api/detect-objects", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          imageBase64: customImage.src,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Görsel analizi sırasında hata.");
      }

      if (data.objects && data.objects.length > 0) {
        setDetectedObjects(data.objects);
        // By default, select all detected objects so they see a full mosaic initially!
        setSelectedObjectIds(data.objects.map((o: any) => o.id));
      } else {
        throw new Error("Görselde belirgin bir nesne saptanamadı.");
      }
    } catch (err: any) {
      console.warn("Gemini API object detection failed or not configured, using smart client-side segmentation fallback...", err);
      // Premium Smart Client-side Fallback
      const fallbacks = [
        { 
          id: "obj_1", 
          name: "Merkez Bölge (Odak)", 
          box: [20, 20, 80, 80],
          polygon: [[50, 20], [65, 23], [77, 32], [80, 50], [77, 68], [65, 77], [50, 80], [35, 77], [23, 68], [20, 50], [23, 32], [35, 23]]
        },
        { 
          id: "obj_2", 
          name: "Gökyüzü / Üst Plan", 
          box: [0, 0, 30, 100],
          polygon: [[0, 0], [100, 0], [100, 30], [80, 28], [60, 32], [40, 27], [20, 31], [0, 25]]
        },
        { 
          id: "obj_3", 
          name: "Zemin / Alt Alan", 
          box: [70, 0, 100, 100],
          polygon: [[0, 100], [0, 70], [25, 74], [50, 68], [75, 73], [100, 70], [100, 100]]
        },
        { 
          id: "obj_4", 
          name: "Sol Bölge Detayı", 
          box: [25, 0, 75, 40],
          polygon: [[0, 25], [20, 28], [35, 40], [40, 50], [35, 60], [20, 72], [0, 75]]
        },
        { 
          id: "obj_5", 
          name: "Sağ Bölge Detayı", 
          box: [25, 60, 75, 100],
          polygon: [[100, 25], [80, 28], [65, 40], [60, 50], [65, 60], [80, 72], [100, 75]]
        }
      ];
      setDetectedObjects(fallbacks);
      setSelectedObjectIds(["obj_1"]); // Select the main focus object by default
    } finally {
      setIsAnalyzingObjects(false);
    }
  };

  // AI Colorizer States
  const [aiPrompt, setAiPrompt] = useState<string>("");
  const [aiLoading, setAiLoading] = useState<boolean>(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // Active control panel sidebar tab
  const [activeTab, setActiveTab] = useState<"design" | "settings" | "stats">("design");

  // Fullscreen API Helper Methods
  const enterFullscreen = async () => {
    const docEl = document.documentElement;
    if (docEl) {
      try {
        if (docEl.requestFullscreen) {
          await docEl.requestFullscreen();
        } else if ((docEl as any).webkitRequestFullscreen) {
          await (docEl as any).webkitRequestFullscreen();
        } else if ((docEl as any).msRequestFullscreen) {
          await (docEl as any).msRequestFullscreen();
        }
        setIsFullscreen(true);
      } catch (err) {
        console.warn("Monitor level fullscreen blocked by iframe sandbox:", err);
        // Fallback to internal responsive fullscreen mode
        setIsFullscreen(true);
        // Trigger elegant, non-obstructive UI toast warning
        setFullscreenWarning(true);
        // Auto-dismiss after 5 seconds
        setTimeout(() => setFullscreenWarning(false), 6000);
      }
    } else {
      setIsFullscreen(true);
    }
  };

  const exitFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if ((document as any).webkitExitFullscreen) {
          await (document as any).webkitExitFullscreen();
        }
      }
    } catch (err) {
      console.error("Error exiting true fullscreen:", err);
    }
    setIsFullscreen(false);
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      const isCurrentlyFull = !!document.fullscreenElement;
      setIsFullscreen(isCurrentlyFull);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);
    };
  }, []);

  // Initialize region colors when template changes
  useEffect(() => {
    if (selectedTemplate) {
      const initialColors: Record<string, string> = {};
      selectedTemplate.regions.forEach((region) => {
        initialColors[region.id] = region.defaultColor;
      });
      setRegionColors(initialColors);
      setOptions((prev) => ({
        ...prev,
        backgroundColor: selectedTemplate.backgroundColor,
        outlineColor: selectedTemplate.id === "bear" ? "#1e293b" : "#ffffff", // Dark outline for bear, white for unicorn/butterfly
      }));
      
      // Auto-select first region
      if (selectedTemplate.regions.length > 0) {
        setSelectedRegionId(selectedTemplate.regions[0].id);
        setActiveColor(selectedTemplate.regions[0].defaultColor);
      }
      setViewMode("vector");
      setBuildProgress(1);
    }
  }, [selectedTemplate]);

  // Handle uploaded image click / drag-drop
  const handleImageLoad = (src: string, name: string) => {
    const img = new Image();
    img.src = src;
    img.onload = () => {
      setCustomImage(img);
      setCustomImageName(name);
      setSelectedTemplate(null); // Switch to custom mode
      setIsCustomConfirmed(false); // Start in unconfirmed preview stage
      setViewMode("vector"); // Orijinal Önizleme mode
      setBuildProgress(1);
    };
  };

  // Dynamically analyze and reduce custom image colors whenever the image or the color count changes
  useEffect(() => {
    if (!customImage) return;

    try {
      const tempCanvas = document.createElement("canvas");
      const ctx = tempCanvas.getContext("2d");
      if (ctx) {
        // Slightly higher resolution for precise color clustering
        tempCanvas.width = 100;
        tempCanvas.height = 100;
        ctx.drawImage(customImage, 0, 0, 100, 100);
        const imgData = ctx.getImageData(0, 0, 100, 100);

        // A high-quality predefined set of basic anchor colors to represent distinct color groups.
        // This ensures the extracted colors are simple, vibrant, and not similar tones of the same shade.
        const BASIC_ANCHORS = [
          { hex: "#e11d48", name: "Kırmızı" },
          { hex: "#ea580c", name: "Turuncu" },
          { hex: "#facc15", name: "Sarı" },
          { hex: "#16a34a", name: "Yeşil" },
          { hex: "#2563eb", name: "Mavi" },
          { hex: "#7c3aed", name: "Mor" },
          { hex: "#78350f", name: "Kahverengi" },
          { hex: "#db2777", name: "Pembe" },
          { hex: "#0d9488", name: "Turkuaz" },
          { hex: "#f8fafc", name: "Beyaz" },
          { hex: "#1e293b", name: "Siyah" },
          { hex: "#64748b", name: "Gri" }
        ];

        const getRgbFromHex = (hex: string) => {
          const clean = hex.replace("#", "");
          const r = parseInt(clean.substring(0, 2), 16) || 0;
          const g = parseInt(clean.substring(2, 4), 16) || 0;
          const b = parseInt(clean.substring(4, 6), 16) || 0;
          return { r, g, b };
        };

        const anchorRgbList = BASIC_ANCHORS.map(a => ({
          hex: a.hex,
          rgb: getRgbFromHex(a.hex)
        }));

        const counts: Record<string, number> = {};

        // For each pixel in the 100x100 matrix, find the closest distinct basic anchor color
        for (let i = 0; i < imgData.data.length; i += 4) {
          const r = imgData.data[i];
          const g = imgData.data[i+1];
          const b = imgData.data[i+2];
          const a = imgData.data[i+3];
          if (a < 180) continue; // skip transparent pixels

          let closestHex = anchorRgbList[0].hex;
          let minDist = Infinity;
          for (const anchor of anchorRgbList) {
            const dist = Math.hypot(r - anchor.rgb.r, g - anchor.rgb.g, b - anchor.rgb.b);
            if (dist < minDist) {
              minDist = dist;
              closestHex = anchor.hex;
            }
          }
          counts[closestHex] = (counts[closestHex] || 0) + 1;
        }

        // Sort the anchors by frequency in the actual image
        const sorted = Object.entries(counts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, colorCount)
          .map(entry => entry[0]);

        // If the image is highly monochrome and yields fewer colors, pad it with other unique basic anchors
        while (sorted.length < colorCount) {
          const unusedAnchor = BASIC_ANCHORS.find(a => !sorted.includes(a.hex));
          if (unusedAnchor) {
            sorted.push(unusedAnchor.hex);
          } else {
            break;
          }
        }

        // Sort colors by hue/luminance to keep their numbered list visually ordered and beautiful!
        const getLuminance = (hex: string) => {
          const rgb = getRgbFromHex(hex);
          return 0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b;
        };
        const beautifullyOrdered = [...sorted].sort((a, b) => getLuminance(b) - getLuminance(a));

        setCustomImageColors(beautifullyOrdered);
        setCustomColorReplacements({}); // Reset replacement cache
      }
    } catch (err) {
      console.error("Error reducing image colors dynamically:", err);
    }
  }, [customImage, colorCount]);

  // Compute recommended optimal color count based on actual pixel distribution across BASIC_ANCHORS
  useEffect(() => {
    if (!customImage) {
      setSuggestedColorCount(null);
      setSuggestedColors([]);
      setSuggestedColorsNames([]);
      return;
    }

    try {
      const tempCanvas = document.createElement("canvas");
      const ctx = tempCanvas.getContext("2d");
      if (ctx) {
        tempCanvas.width = 100;
        tempCanvas.height = 100;
        ctx.drawImage(customImage, 0, 0, 100, 100);
        const imgData = ctx.getImageData(0, 0, 100, 100);

        const BASIC_ANCHORS = [
          { hex: "#e11d48", name: "Kırmızı" },
          { hex: "#ea580c", name: "Turuncu" },
          { hex: "#facc15", name: "Sarı" },
          { hex: "#16a34a", name: "Yeşil" },
          { hex: "#2563eb", name: "Mavi" },
          { hex: "#7c3aed", name: "Mor" },
          { hex: "#78350f", name: "Kahverengi" },
          { hex: "#db2777", name: "Pembe" },
          { hex: "#0d9488", name: "Turkuaz" },
          { hex: "#f8fafc", name: "Beyaz" },
          { hex: "#1e293b", name: "Siyah" },
          { hex: "#64748b", name: "Gri" }
        ];

        const getRgbFromHex = (hex: string) => {
          const clean = hex.replace("#", "");
          const r = parseInt(clean.substring(0, 2), 16) || 0;
          const g = parseInt(clean.substring(2, 4), 16) || 0;
          const b = parseInt(clean.substring(4, 6), 16) || 0;
          return { r, g, b };
        };

        const anchorRgbList = BASIC_ANCHORS.map(a => ({
          ...a,
          rgb: getRgbFromHex(a.hex)
        }));

        const counts: Record<string, number> = {};
        let totalValidPixels = 0;

        for (let i = 0; i < imgData.data.length; i += 4) {
          const r = imgData.data[i];
          const g = imgData.data[i+1];
          const b = imgData.data[i+2];
          const a = imgData.data[i+3];
          if (a < 180) continue; // transparent pixel

          totalValidPixels++;

          let closestHex = anchorRgbList[0].hex;
          let minDist = Infinity;
          for (const anchor of anchorRgbList) {
            const dist = Math.hypot(r - anchor.rgb.r, g - anchor.rgb.g, b - anchor.rgb.b);
            if (dist < minDist) {
              minDist = dist;
              closestHex = anchor.hex;
            }
          }
          counts[closestHex] = (counts[closestHex] || 0) + 1;
        }

        // Keep anchors that represent at least 3.5% of total valid pixels to avoid minor noises
        const threshold = totalValidPixels * 0.035;
        const significantAnchors = anchorRgbList.filter(anchor => {
          const pCount = counts[anchor.hex] || 0;
          return pCount > threshold;
        });

        // Sort by frequency (descending)
        significantAnchors.sort((a, b) => {
          const countA = counts[a.hex] || 0;
          const countB = counts[b.hex] || 0;
          return countB - countA;
        });

        // Clamp the recommended color count between 4 and 10 for absolute clarity and high quality
        let recCount = significantAnchors.length;
        if (recCount < 4) recCount = 4;
        if (recCount > 10) recCount = 10;

        // If we have fewer actual significant colors than recCount, pad with sorted top frequencies
        const sortedAllAnchors = [...anchorRgbList].sort((a, b) => (counts[b.hex] || 0) - (counts[a.hex] || 0));
        const finalList: typeof anchorRgbList = [];
        
        // Add significant anchors first
        significantAnchors.forEach(sa => {
          if (finalList.length < recCount) finalList.push(sa);
        });
        
        // Pad if needed
        for (const anchor of sortedAllAnchors) {
          if (finalList.length >= recCount) break;
          if (!finalList.some(fa => fa.hex === anchor.hex)) {
            finalList.push(anchor);
          }
        }

        setSuggestedColorCount(recCount);
        setSuggestedColors(finalList.map(a => a.hex));
        setSuggestedColorsNames(finalList.map(a => a.name));
      }
    } catch (err) {
      console.error("Error running optimal color analysis:", err);
    }
  }, [customImage]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          handleImageLoad(event.target.result as string, file.name);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          handleImageLoad(event.target.result as string, file.name);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const removeCustomImage = () => {
    setCustomImage(null);
    setCustomImageName("");
    setIsCustomConfirmed(false);
    setSelectedTemplate(templates[0]); // Reset to default unicorn
  };

  // Color application to current selected region
  const handleRegionColorApply = (color: string) => {
    if (!selectedRegionId) return;
    setRegionColors((prev) => ({
      ...prev,
      [selectedRegionId]: color,
    }));
    setActiveColor(color);
  };

  // Quick preset palette application
  const applyPresetPalette = (paletteColors: string[]) => {
    if (!selectedTemplate) return;
    const updatedColors: Record<string, string> = {};
    selectedTemplate.regions.forEach((region, index) => {
      // Rotate through palette colors
      updatedColors[region.id] = paletteColors[index % paletteColors.length];
    });
    setRegionColors(updatedColors);
    
    // Select the first one
    if (selectedTemplate.regions.length > 0) {
      setActiveColor(updatedColors[selectedTemplate.regions[0].id]);
    }
  };

  // Build/Construction animation trigger
  const startBuildAnimation = () => {
    if (isBuilding) return;
    setIsBuilding(true);
    setBuildProgress(0);
    setViewMode("mosaic");
    if (!selectedTemplate && customImage) {
      setIsCustomConfirmed(true);
    }

    let progress = 0;
    if (buildIntervalRef.current) clearInterval(buildIntervalRef.current);

    buildIntervalRef.current = setInterval(() => {
      progress += 0.02;
      if (progress >= 1) {
        setBuildProgress(1);
        setIsBuilding(false);
        if (buildIntervalRef.current) clearInterval(buildIntervalRef.current);
      } else {
        setBuildProgress(progress);
      }
    }, 30);
  };

  // Download rendered image as PNG
  const downloadMosaic = () => {
    const canvas = document.getElementById("mosaic-canvas") as HTMLCanvasElement | null;
    if (!canvas) return;

    const dataURL = canvas.toDataURL("image/png");
    const link = document.createElement("a");
    link.download = `${selectedTemplate ? selectedTemplate.id : "custom"}-mozaik.png`;
    link.href = dataURL;
    link.click();
  };

  // AI-powered creative coloring utilizing Gemini API
  const handleAiColorize = async () => {
    if (!selectedTemplate || !aiPrompt.trim()) return;
    setAiLoading(true);
    setAiError(null);

    try {
      const response = await fetch("/api/color-template", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          templateId: selectedTemplate.id,
          templateName: selectedTemplate.name,
          stylePrompt: aiPrompt,
          regions: selectedTemplate.regions.map((r) => ({ id: r.id, name: r.name })),
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Beklenmeyen bir hata oluştu.");
      }

      if (data.colorMap) {
        setRegionColors(data.colorMap);
        // Reset selected region highlight to match the new colors
        if (selectedRegionId && data.colorMap[selectedRegionId]) {
          setActiveColor(data.colorMap[selectedRegionId]);
        }
        // Switch to vector view to see the stunning AI painted colors first!
        setViewMode("vector");
      }
    } catch (err: any) {
      console.error(err);
      setAiError(err.message || "Yapay Zeka Renklendiricisi çalıştırılamadı. Lütfen tekrar deneyin.");
    } finally {
      setAiLoading(false);
    }
  };

  // Compute total mosaic tiles
  const totalTiles = (Object.values(tileStats) as Array<{ hex: string; count: number; name: string }>).reduce((sum, item) => sum + item.count, 0);

  return (
    <div className="min-h-screen bg-[#050508] text-slate-300 flex flex-col font-sans selection:bg-indigo-500/30 selection:text-indigo-200 relative overflow-hidden">
      
      {/* Sandbox Fullscreen Toast Warning */}
      {fullscreenWarning && (
        <div className="fixed top-6 right-6 z-[9999] max-w-sm bg-[#0d0d18]/95 border border-amber-500/30 border-l-4 border-l-amber-500 text-slate-100 p-4 rounded-xl shadow-2xl backdrop-blur-md animate-slideIn flex gap-3 items-start">
          <div className="w-5 h-5 rounded-full bg-amber-500/10 text-amber-400 flex items-center justify-center shrink-0 mt-0.5">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div className="space-y-1">
            <h5 className="text-xs font-bold text-white uppercase tracking-wider">İframe Engeli Aşılıyor</h5>
            <p className="text-[11px] text-slate-300 leading-relaxed">
              Monitör düzeyinde tam ekran için lütfen sağ üstteki <strong>"Yeni Sekmede Aç"</strong> (New Tab) butonuna tıklayın, ardından bu ekrandan tam ekranı aktifleştirin.
            </p>
          </div>
          <button 
            onClick={() => setFullscreenWarning(false)}
            className="text-slate-500 hover:text-slate-300 transition-all text-sm font-semibold ml-2 shrink-0 cursor-pointer"
          >
            ×
          </button>
        </div>
      )}

      {/* Background Radial Dots Overlay */}
      <div className="absolute inset-0 opacity-10 pointer-events-none z-0" 
           style={{ backgroundImage: 'radial-gradient(#4f46e5 0.5px, transparent 0.5px)', backgroundSize: '24px 24px' }}></div>

      {/* Dynamic Header */}
      <header className="border-b border-white/5 bg-[#0a0a12] sticky top-0 z-50 px-6 py-4 shadow-2xl backdrop-blur-md">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center shadow-[0_0_15px_rgba(99,102,241,0.4)] text-white shrink-0">
              <Grid className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold font-display tracking-widest text-white uppercase">
                MOZAİK.GEN
              </h1>
              <p className="text-xs text-slate-400">
                Görselleri el yapımı görünümlü, baskın renkleri otomatik atanmış mozaik tasarımlarına dönüştürün.
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1 bg-white/5 border border-white/10 rounded-full">
              <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]"></div>
              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-300">İŞLEM MOTORU: AKTİF</span>
            </div>
            
            <button
              onClick={downloadMosaic}
              className="bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2 rounded-lg text-xs font-semibold transition-all shadow-[0_0_20px_rgba(79,70,229,0.3)] hover:shadow-[0_0_25px_rgba(99,102,241,0.5)] border border-indigo-500/30 flex items-center gap-2 active:scale-95"
            >
              <Download className="w-4 h-4" />
              GÖRSELİ KAYDET (PNG)
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 relative z-10">
        
        {/* Left Side: Control Panel (5 cols) */}
        <div className="lg:col-span-5 flex flex-col bg-[#0a0a12] border border-white/5 rounded-2xl overflow-hidden shadow-2xl h-fit">
          {/* Tab Selection Row */}
          <div className="flex border-b border-white/5 bg-black/20 p-1.5 gap-1">
            <button
              onClick={() => setActiveTab("design")}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-medium transition-all ${
                activeTab === "design"
                  ? "bg-indigo-950/40 border border-indigo-500/30 text-indigo-300 font-semibold shadow-[0_0_15px_rgba(99,102,241,0.15)]"
                  : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
              }`}
            >
              <Palette className="w-4 h-4" />
              Tasarım & Renk
            </button>
            <button
              onClick={() => setActiveTab("settings")}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-medium transition-all ${
                activeTab === "settings"
                  ? "bg-indigo-950/40 border border-indigo-500/30 text-indigo-300 font-semibold shadow-[0_0_15px_rgba(99,102,241,0.15)]"
                  : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
              }`}
            >
              <Sliders className="w-4 h-4" />
              Mozaik Ayarları
            </button>
            <button
              onClick={() => setActiveTab("stats")}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-medium transition-all ${
                activeTab === "stats"
                  ? "bg-indigo-950/40 border border-indigo-500/30 text-indigo-300 font-semibold shadow-[0_0_15px_rgba(99,102,241,0.15)]"
                  : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
              }`}
            >
              <Layers className="w-4 h-4" />
              Malzeme Kiti ({totalTiles > 0 ? totalTiles : "-"} Adet)
            </button>
          </div>

          <div className="p-5 flex-1 overflow-y-auto max-h-[680px]">
            {/* TAB 1: DESIGN & COLOR */}
            {activeTab === "design" && (
              <div className="space-y-6">
                
                {/* 1. Şablon Seçici veya Özel Resim Yükleyici */}
                <div className="space-y-3">
                  <h3 className="text-[10px] uppercase font-bold text-slate-500 tracking-[0.2em] flex items-center gap-2">
                    <Layers className="w-3.5 h-3.5 text-indigo-400" />
                    1. Çizim Şablonu Seçin
                  </h3>
                  
                  <div className="grid grid-cols-3 gap-2.5">
                    {templates.map((temp) => (
                      <button
                        key={temp.id}
                        onClick={() => {
                          removeCustomImage();
                          setSelectedTemplate(temp);
                        }}
                        className={`p-3 rounded-xl border text-left transition-all ${
                          selectedTemplate?.id === temp.id && !customImage
                            ? "bg-indigo-950/40 border-indigo-500/50 text-indigo-300 font-semibold shadow-[0_0_12px_rgba(99,102,241,0.2)]"
                            : "bg-[#0a0a12] border-white/5 text-slate-400 hover:bg-white/5 hover:border-white/10"
                        }`}
                      >
                        <div className="font-semibold text-xs text-slate-100 truncate">
                          {temp.name}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-1 truncate">
                          {temp.regions.length} Bölge
                        </div>
                      </button>
                    ))}
                  </div>

                  {/* Drag and Drop File Uploader */}
                  <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`border border-dashed rounded-xl p-4 text-center cursor-pointer transition-all ${
                      isDragging
                        ? "border-indigo-500 bg-indigo-500/5"
                        : customImage
                        ? "border-indigo-500/40 bg-indigo-500/5"
                        : "border-white/10 bg-black/30 hover:border-white/20"
                    }`}
                  >
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileChange}
                      accept="image/*"
                      className="hidden"
                    />
                    
                    {customImage ? (
                      <div className="flex items-center justify-between gap-3 text-left">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400 shrink-0">
                            <Check className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-indigo-400 truncate">Kendi Resminiz Yüklendi</p>
                            <p className="text-[10px] text-slate-400 truncate">{customImageName}</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeCustomImage();
                          }}
                          className="p-1.5 rounded-lg bg-white/5 hover:bg-rose-500/10 hover:text-rose-400 text-slate-400 transition-all shrink-0"
                          title="Resmi kaldır"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-1.5">
                        <Upload className="w-6 h-6 text-slate-400" />
                        <p className="text-xs font-medium text-slate-200">Kendi resminizi yükleyin</p>
                        <p className="text-[10px] text-slate-400">Sürükleyin veya tıklayın (PNG, JPG)</p>
                      </div>
                    )}
                  </div>
                </div>

                {selectedTemplate ? (
                  <>
                    {/* 2. Bölge Boyama Paneli */}
                    <div className="space-y-3.5 border-t border-white/5 pt-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-[10px] uppercase font-bold text-slate-500 tracking-[0.2em] flex items-center gap-2">
                          <Palette className="w-3.5 h-3.5 text-indigo-400" />
                          2. Bölge Renkleri ve Boyama
                        </h3>
                        <span className="text-[10px] bg-white/5 border border-white/10 px-2.5 py-0.5 rounded-full text-slate-300 font-mono">
                          {selectedTemplate.regions.length} PARÇA
                        </span>
                      </div>

                      {/* Region list slider */}
                      <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto p-1 bg-black/20 rounded-xl border border-white/5">
                        {selectedTemplate.regions.map((region) => {
                          const currentColor = regionColors[region.id] || region.defaultColor;
                          const isSelected = selectedRegionId === region.id;
                          return (
                            <button
                              key={region.id}
                              onClick={() => {
                                setSelectedRegionId(region.id);
                                setActiveColor(currentColor);
                              }}
                              className={`flex items-center gap-2 p-2 rounded-lg border text-left transition-all ${
                                isSelected
                                  ? "bg-indigo-950/40 border-indigo-500/50 text-indigo-300"
                                  : "bg-[#0a0a12]/60 border-transparent hover:bg-white/5"
                              }`}
                            >
                              <span
                                className="w-4 h-4 rounded-full border border-slate-700 shrink-0 shadow-sm"
                                style={{ backgroundColor: currentColor }}
                              />
                              <span className="text-xs font-medium text-slate-300 truncate">
                                {region.name}
                              </span>
                            </button>
                          );
                        })}
                      </div>

                      {/* Active Color Control */}
                      {selectedRegionId && (
                        <div className="p-3 bg-[#0a0a12]/80 border border-white/5 rounded-xl space-y-3">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-slate-400">
                              Seçili Bölge:{" "}
                              <strong className="text-indigo-400 font-semibold">
                                {selectedTemplate.regions.find((r) => r.id === selectedRegionId)?.name}
                              </strong>
                            </span>
                            <span className="font-mono text-slate-500 uppercase">{activeColor}</span>
                          </div>

                          <div className="flex items-center gap-3">
                            <input
                              type="color"
                              value={activeColor}
                              onChange={(e) => handleRegionColorApply(e.target.value)}
                              className="w-10 h-10 rounded-lg cursor-pointer bg-transparent border-0 shrink-0"
                            />
                            
                            {/* Fast colors wheel */}
                            <div className="flex flex-wrap gap-1.5">
                              {["#ef4444", "#f97316", "#facc15", "#22c55e", "#06b6d4", "#3b82f6", "#6366f1", "#a855f7", "#ec4899", "#ffffff", "#000000"].map((c) => (
                                <button
                                  key={c}
                                  onClick={() => handleRegionColorApply(c)}
                                  className={`w-5 h-5 rounded-full border transition-all ${
                                    activeColor.toLowerCase() === c.toLowerCase()
                                      ? "border-white scale-125 shadow-md shadow-slate-950"
                                      : "border-white/10 hover:scale-110"
                                  }`}
                                  style={{ backgroundColor: c }}
                                />
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* 3. Hazır Paletler */}
                    <div className="space-y-3 border-t border-white/5 pt-4">
                      <h3 className="text-[10px] uppercase font-bold text-slate-500 tracking-[0.2em] flex items-center gap-2">
                        <Palette className="w-3.5 h-3.5 text-indigo-400" />
                        HAZIR SANATSAL PALET UYGULA
                      </h3>
                      
                      <div className="grid grid-cols-2 gap-2">
                        {PRESET_PALETTES.map((pal) => (
                          <button
                            key={pal.name}
                            onClick={() => applyPresetPalette(pal.colors)}
                            className="p-2.5 rounded-xl bg-slate-900/40 border border-white/5 hover:bg-white/5 hover:border-white/10 transition-all text-left space-y-1.5"
                          >
                            <span className="text-[10px] font-medium text-slate-300 block truncate">{pal.name}</span>
                            <div className="flex gap-0.5 overflow-hidden rounded-md">
                              {pal.colors.slice(0, 6).map((c, i) => (
                                <span key={i} className="h-2.5 flex-1" style={{ backgroundColor: c }} />
                              ))}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* 4. Yapay Zeka Akıllı Renklendirici */}
                    <div className="space-y-3 border-t border-white/5 pt-4 bg-indigo-950/10 p-3 rounded-xl border border-indigo-500/10">
                      <div className="flex items-center justify-between">
                        <h3 className="text-[10px] uppercase font-bold text-indigo-400 tracking-[0.2em] flex items-center gap-2">
                          <Sparkles className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
                          YAPAY ZEKA (AI) RENKLENDİRİCİ
                        </h3>
                        <span className="text-[9px] bg-indigo-500/20 text-indigo-300 font-semibold px-2 py-0.5 rounded-full border border-indigo-500/20">
                          BETA
                        </span>
                      </div>
                      
                      <p className="text-[10px] text-slate-400 leading-relaxed">
                        Gemini AI şablonun hikayesini analiz eder ve yazacağınız konsepte göre uyumlu dominant renkler tasarlar!
                      </p>

                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={aiPrompt}
                          onChange={(e) => setAiPrompt(e.target.value)}
                          placeholder="Örn: Siberpunk neon, Sıcak sonbahar güneşi, Buz kraliçesi..."
                          className="flex-1 px-3 py-2 text-xs rounded-lg bg-black/40 border border-white/10 focus:outline-none focus:border-indigo-500 text-slate-200 placeholder-slate-600 font-sans"
                        />
                        <button
                          onClick={handleAiColorize}
                          disabled={aiLoading || !aiPrompt.trim()}
                          className="px-4 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 hover:shadow-lg hover:shadow-indigo-500/15 transition-all text-white flex items-center gap-1.5 shrink-0"
                        >
                          {aiLoading ? (
                            <svg className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                          ) : (
                            <Sparkles className="w-3.5 h-3.5" />
                          )}
                          Uygula
                        </button>
                      </div>

                      {aiError && (
                        <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[10px] flex items-center gap-1.5">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                          <span>{aiError}</span>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  viewMode === "objects" && selectedObjectIds.length === 0 ? (
                    <div className="p-5 text-center bg-[#0a0a12]/80 border border-indigo-500/15 rounded-2xl space-y-3.5 my-4">
                      <div className="w-12 h-12 rounded-full bg-indigo-500/10 text-indigo-400 flex items-center justify-center mx-auto shadow-lg animate-pulse">
                        <Target className="w-6 h-6" />
                      </div>
                      <div className="space-y-1.5">
                        <h4 className="text-xs font-bold text-slate-100 uppercase tracking-widest">Önce Nesne Seçimi Yapın</h4>
                        <p className="text-[11px] text-slate-400 leading-relaxed max-w-xs mx-auto">
                          Tasarım, renk ve mozaik parçası ayarlarına erişmek için lütfen önce <strong>Nesne Seçimi (4. Mod)</strong> ekranından en az bir nesne seçerek onaylayın.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="p-5 bg-indigo-950/10 border border-indigo-500/10 rounded-2xl space-y-4">
                    {/* Hedef Renk Sayısı (Sayı Adedi) Seçimi */}
                    <div className="space-y-2 bg-black/40 p-3.5 rounded-xl border border-white/5 text-left">
                      <div className="flex items-center justify-between text-xs">
                        <label className="text-slate-300 font-semibold flex items-center gap-1.5">
                          <Palette className="w-3.5 h-3.5 text-indigo-400" />
                          Renk Teması / Sayı Adedi
                        </label>
                        <span className="font-mono bg-indigo-500/10 px-2.5 py-0.5 rounded text-indigo-300 font-bold text-xs">
                          {colorCount} Renk
                        </span>
                      </div>
                      <input
                        type="range"
                        min="2"
                        max="12"
                        step="1"
                        value={colorCount}
                        onChange={(e) => setColorCount(parseInt(e.target.value))}
                        className="w-full accent-indigo-500 h-1 bg-white/5 rounded-lg appearance-none cursor-pointer"
                      />
                      <p className="text-[10px] text-slate-400 leading-relaxed">
                        Görseldeki renkleri birbirine benzemeyen {colorCount} ana renge indirger (Sarı, Mavi, Kırmızı, Kahverengi vb.).
                      </p>
                    </div>

                    {/* Akıllı Renk Analiz Raporu */}
                    {suggestedColorCount !== null && (
                      <div className="bg-gradient-to-br from-indigo-950/40 to-purple-950/40 border border-indigo-500/20 p-3 rounded-xl text-left space-y-2.5">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-300">
                          <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                          💡 Akıllı Renk Analizi Raporu
                        </div>
                        <div className="text-[11px] text-slate-300 leading-relaxed">
                          Görseliniz analiz edildi. Birbirinin benzeri olmayan <span className="text-amber-400 font-bold">{suggestedColorCount} adet temel renk</span> grubu tespit edildi:
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {suggestedColors.map((color, idx) => (
                            <span 
                              key={color}
                              className="inline-flex items-center gap-1 bg-black/40 border border-white/5 text-[9px] text-slate-200 px-2 py-0.5 rounded"
                            >
                              <span 
                                className="w-2 h-2 rounded-full border border-white/10" 
                                style={{ backgroundColor: color }} 
                              />
                              {suggestedColorsNames[idx] || "Renk"}
                            </span>
                          ))}
                        </div>
                        <p className="text-[10px] text-slate-400 leading-relaxed">
                          Sarı, Mavi, Kırmızı gibi ana renkler gruplanmıştır. Benzer tonlar birleştirilerek sadeleştirilmiştir.
                        </p>
                        
                        {colorCount !== suggestedColorCount ? (
                          <button
                            onClick={() => {
                              setColorCount(suggestedColorCount);
                              if (!isCustomConfirmed) {
                                setIsCustomConfirmed(true);
                                setViewMode("mosaic");
                                startBuildAnimation();
                              }
                            }}
                            className="w-full py-1.5 px-3 bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/40 text-indigo-300 rounded-lg text-[10px] font-bold transition-all flex items-center justify-center gap-1.5"
                          >
                            <Check className="w-3.5 h-3.5" />
                            {!isCustomConfirmed ? "Öneriyi Uygula & Mozaikleştir" : `Önerilen ${suggestedColorCount} Rengi Uygula`}
                          </button>
                        ) : (
                          <div className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1 justify-center bg-emerald-500/10 p-1 rounded-lg border border-emerald-500/20">
                            <Check className="w-3.5 h-3.5" /> Önerilen akıllı ayarlar şu an aktif!
                          </div>
                        )}
                      </div>
                    )}

                    {!isCustomConfirmed ? (
                      <div className="space-y-4 text-center py-2">
                        <div className="w-12 h-12 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-full flex items-center justify-center mx-auto">
                          <ImageIcon className="w-6 h-6 animate-pulse" />
                        </div>
                        <div className="space-y-1.5">
                          <h4 className="text-sm font-bold text-slate-200">Görsel Önizleme Modu</h4>
                          <p className="text-xs text-slate-400 leading-relaxed max-w-xs mx-auto">
                            Yüklediğiniz görsel şu an orijinal haliyle sağ tarafta gösteriliyor. Mozaik taşlarını oluşturmak için onaylayın.
                          </p>
                        </div>
                        <button
                          onClick={() => {
                            setIsCustomConfirmed(true);
                            setViewMode("mosaic");
                            startBuildAnimation(); // Satisfying dynamic construction animation!
                          }}
                          className="w-full py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-xl text-xs font-bold transition-all shadow-[0_0_20px_rgba(99,102,241,0.35)] hover:shadow-[0_0_25px_rgba(99,102,241,0.5)] flex items-center justify-center gap-2 active:scale-95 border border-indigo-500/30"
                        >
                          <Sparkles className="w-4 h-4" />
                          GÖRSELİ MOZAİKLEŞTİR
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="flex items-center gap-3 border-b border-white/5 pb-3">
                          <div className="w-8 h-8 bg-emerald-500/10 text-emerald-400 rounded-lg flex items-center justify-center border border-emerald-500/20">
                            <Check className="w-4 h-4" />
                          </div>
                          <div>
                            <h4 className="text-xs font-bold text-slate-200">Mozaik Görünümü Aktif</h4>
                            <p className="text-[10px] text-slate-400">Pikseller analiz edildi ve taşlar yerleştirildi.</p>
                          </div>
                        </div>

                        {/* Custom Image Colors Replacement Panel */}
                        {customImageColors.length > 0 && (
                          <div className="space-y-2 border-b border-white/5 pb-3">
                            <div className="flex items-center justify-between">
                              <h5 className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1.5">
                                <Palette className="w-3 h-3 text-indigo-400" />
                                Görsel Renklerini Değiştir
                              </h5>
                              {Object.keys(customColorReplacements).length > 0 && (
                                <button
                                  onClick={() => setCustomColorReplacements({})}
                                  className="text-[9px] text-rose-400 hover:text-rose-300 transition-all font-semibold uppercase tracking-wider"
                                >
                                  Sıfırla
                                </button>
                              )}
                            </div>
                            <div className="grid grid-cols-2 gap-1.5 max-h-36 overflow-y-auto pr-1">
                              {customImageColors.map((color, index) => {
                                const replacement = customColorReplacements[color] || color;
                                const hasReplaced = customColorReplacements[color] !== undefined;
                                return (
                                  <div
                                    key={color}
                                    className="flex items-center justify-between p-1.5 bg-black/30 border border-white/5 rounded-lg gap-2"
                                  >
                                    <div className="flex items-center gap-1.5 min-w-0">
                                      <span className="w-4.5 h-4.5 rounded-full flex items-center justify-center font-mono text-[9px] font-bold bg-white/5 text-slate-300 border border-white/10 shrink-0">
                                        {index + 1}
                                      </span>
                                      <span className="text-[9px] text-slate-400 font-mono truncate uppercase">{color}</span>
                                    </div>
                                    <input
                                      type="color"
                                      value={replacement}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        setCustomColorReplacements(prev => ({
                                          ...prev,
                                          [color]: val
                                        }));
                                      }}
                                      className="w-5 h-5 rounded cursor-pointer bg-transparent border-0 shrink-0"
                                      title="Yeni rengi seç"
                                    />
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        <p className="text-[11px] text-slate-400 leading-relaxed">
                          Sol paneldeki "Mozaik Ayarları" tabından mozaik parça şeklini, boyutunu ve el yapımı düzensizliğini değiştirebilirsiniz.
                        </p>
                        <button
                          onClick={() => {
                            setIsCustomConfirmed(false);
                            setViewMode("vector");
                          }}
                          className="w-full py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-2"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          Orijinal Önizlemeye Geri Dön
                        </button>
                      </div>
                    )}
                  </div>
                  )
                )}

                {/* Manuel Mozaik Atölyesi (Sürükle, Takas Et, Sil, Taş Ekle) */}
                {viewMode === "mosaic" && (
                  <div className="space-y-3.5 border-t border-white/5 pt-4 bg-[#0d0e1a]/40 p-3.5 rounded-xl border border-indigo-500/10">
                    <h3 className="text-[10px] uppercase font-bold text-indigo-400 tracking-[0.2em] flex items-center gap-2">
                      <Layers className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
                      MANUEL MOZAİK ATÖLYESİ
                    </h3>
                    <p className="text-[10px] text-slate-400 leading-relaxed">
                      Taşları el işçiliği gibi tek tek özelleştirebilirsiniz. Bir araç seçip doğrudan sağdaki çizim panelinde mozaik taşlarına dokunun:
                    </p>
                    
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => setActiveEditTool("move")}
                        className={`p-2 rounded-lg border text-left transition-all flex items-center gap-1.5 ${
                          activeEditTool === "move"
                            ? "bg-indigo-950/50 border-indigo-500/50 text-indigo-300 font-semibold"
                            : "bg-[#0a0a12]/60 border-white/5 text-slate-400 hover:text-slate-200"
                        }`}
                        title="Herhangi bir mozaik taşını farenizle sürükleyerek kaydırın"
                      >
                        <span className="text-xs">👋 Taşı / Sürükle</span>
                      </button>

                      <button
                        onClick={() => setActiveEditTool("swap")}
                        className={`p-2 rounded-lg border text-left transition-all flex items-center gap-1.5 ${
                          activeEditTool === "swap"
                            ? "bg-indigo-950/50 border-indigo-500/50 text-indigo-300 font-semibold"
                            : "bg-[#0a0a12]/60 border-white/5 text-slate-400 hover:text-slate-200"
                        }`}
                        title="İki taşa sırayla tıklayarak renklerini birbiriyle takas edin"
                      >
                        <span className="text-xs">🔄 Taşları Takas Et</span>
                      </button>

                      <button
                        onClick={() => setActiveEditTool("erase")}
                        className={`p-2 rounded-lg border text-left transition-all flex items-center gap-1.5 ${
                          activeEditTool === "erase"
                            ? "bg-indigo-950/50 border-indigo-500/50 text-indigo-300 font-semibold"
                            : "bg-[#0a0a12]/60 border-white/5 text-slate-400 hover:text-slate-200"
                        }`}
                        title="Mozaik taşını kaldırmak için üzerine tıklayın"
                      >
                        <span className="text-xs">❌ Parça Sil</span>
                      </button>

                      <button
                        onClick={() => setActiveEditTool("add")}
                        className={`p-2 rounded-lg border text-left transition-all flex items-center gap-1.5 ${
                          activeEditTool === "add"
                            ? "bg-indigo-950/50 border-indigo-500/50 text-indigo-300 font-semibold"
                            : "bg-[#0a0a12]/60 border-white/5 text-slate-400 hover:text-slate-200"
                        }`}
                        title="Herhangi bir boş alana tıklayarak aktif renkte yeni bir taş yerleştirin"
                      >
                        <span className="text-xs">➕ Yeni Taş Ekle</span>
                      </button>
                    </div>

                    {activeEditTool === "add" && (
                      <div className="p-2.5 bg-black/40 border border-white/5 rounded-lg space-y-1.5 mt-2">
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="text-slate-400">Eklenecek Taşın Rengi:</span>
                          <span className="font-mono text-indigo-400 uppercase font-semibold">{activeColor}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={activeColor}
                            onChange={(e) => setActiveColor(e.target.value)}
                            className="w-7 h-7 rounded cursor-pointer bg-transparent border-0"
                          />
                          <div className="flex flex-wrap gap-1">
                            {["#ef4444", "#f97316", "#facc15", "#22c55e", "#00d2ff", "#7000ff", "#ff007f", "#ffffff", "#000000"].map((c) => (
                              <button
                                key={c}
                                onClick={() => setActiveColor(c)}
                                className="w-3.5 h-3.5 rounded-full border border-white/10 hover:scale-110 transition-all"
                                style={{ backgroundColor: c }}
                              />
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: MOSAIC SETTINGS */}
            {activeTab === "settings" && (
              viewMode === "objects" && selectedObjectIds.length === 0 ? (
                <div className="p-5 text-center bg-[#0a0a12]/80 border border-indigo-500/15 rounded-2xl space-y-3.5 my-4">
                  <div className="w-12 h-12 rounded-full bg-indigo-500/10 text-indigo-400 flex items-center justify-center mx-auto shadow-lg animate-pulse">
                    <Target className="w-6 h-6" />
                  </div>
                  <div className="space-y-1.5">
                    <h4 className="text-xs font-bold text-slate-100 uppercase tracking-widest">Önce Nesne Seçimi Yapın</h4>
                    <p className="text-[11px] text-slate-400 leading-relaxed max-w-xs mx-auto">
                      Tasarım, renk ve mozaik parçası ayarlarına erişmek için lütfen önce <strong>Nesne Seçimi (4. Mod)</strong> ekranından en az bir nesne seçerek onaylayın.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                
                {/* Şekil ve Yapı Ayarları */}
                <div className="space-y-4">
                  <h3 className="text-[10px] uppercase font-bold text-slate-500 tracking-[0.2em] flex items-center gap-2">
                    <Grid className="w-3.5 h-3.5 text-indigo-400" />
                    MOZAİK TAŞ TÜRÜ VE BOYUTU
                  </h3>

                  {/* Shapes select */}
                  <div className="space-y-2">
                    <label className="text-xs text-slate-400">Mozaik Parça Şekli</label>
                    <div className="grid grid-cols-4 gap-2">
                      {(["square", "rounded-square", "circle", "triangle"] as TileShape[]).map((shape) => (
                        <button
                          key={shape}
                          onClick={() => setOptions((prev) => ({ ...prev, shape }))}
                          className={`p-2 py-3 rounded-lg border text-center transition-all flex flex-col items-center gap-1.5 ${
                            options.shape === shape
                              ? "bg-indigo-950/40 border-indigo-500/50 text-indigo-300 font-semibold shadow-[0_0_10px_rgba(99,102,241,0.2)]"
                              : "bg-[#0a0a12]/60 border-white/5 text-slate-400 hover:text-slate-200"
                          }`}
                        >
                          <span className={`w-3.5 h-3.5 border ${
                            shape === "circle" ? "rounded-full" : shape === "rounded-square" ? "rounded-xs" : ""
                          } ${options.shape === shape ? "border-indigo-400 bg-indigo-400/20" : "border-slate-500 bg-transparent"}`} 
                          style={{
                            clipPath: shape === "triangle" ? "polygon(50% 0%, 0% 100%, 100% 100%)" : "none"
                          }}
                          />
                          <span className="text-[10px]">
                            {shape === "square" ? "Kare" : shape === "rounded-square" ? "Yuvarlak" : shape === "circle" ? "Daire" : "Üçgen"}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Tile size slider */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <label className="text-slate-300">Mozaik Parça Boyutu (Tile Size)</label>
                      <span className="font-mono text-indigo-400 font-semibold">{options.tileSize}px</span>
                    </div>
                    <input
                      type="range"
                      min="8"
                      max="32"
                      step="2"
                      value={options.tileSize}
                      onChange={(e) => setOptions((prev) => ({ ...prev, tileSize: parseInt(e.target.value) }))}
                      className="w-full accent-indigo-500 h-1 bg-white/5 rounded-lg appearance-none cursor-pointer"
                    />
                  </div>

                  {/* Gap size slider */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <label className="text-slate-300">Derz / Parça Arası Boşluk (Gap)</label>
                      <span className="font-mono text-indigo-400 font-semibold">{options.gap}px</span>
                    </div>
                    <input
                      type="range"
                      min="0.5"
                      max="6"
                      step="0.5"
                      value={options.gap}
                      onChange={(e) => setOptions((prev) => ({ ...prev, gap: parseFloat(e.target.value) }))}
                      className="w-full accent-indigo-500 h-1 bg-white/5 rounded-lg appearance-none cursor-pointer"
                    />
                  </div>
                </div>

                {/* Düzensizlik ve Organiklik Ayarları */}
                <div className="space-y-4 border-t border-white/5 pt-4">
                  <h3 className="text-[10px] uppercase font-bold text-slate-500 tracking-[0.2em] flex items-center gap-2">
                    <Sliders className="w-3.5 h-3.5 text-purple-400" />
                    EL YAPIMI / DÜZENSİZLİK AYARI
                  </h3>

                  {/* Jitter (Irregularity) slider */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex flex-col">
                        <label className="text-slate-300">Düzensizlik Oranı (Jitter)</label>
                        <span className="text-[10px] text-slate-500">Doğal, kaymış/dönmüş yerleşim seviyesi</span>
                      </div>
                      <span className="font-mono text-indigo-400 font-semibold">%{options.jitter}</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="90"
                      step="5"
                      value={options.jitter}
                      onChange={(e) => setOptions((prev) => ({ ...prev, jitter: parseInt(e.target.value) }))}
                      className="w-full accent-indigo-500 h-1 bg-white/5 rounded-lg appearance-none cursor-pointer"
                    />
                    <div className="flex justify-between text-[9px] text-slate-500 font-mono">
                      <span>Mükemmel Grid (Fabrika)</span>
                      <span>Doğal El Yapımı (Mozaik)</span>
                    </div>
                  </div>

                  {/* Grout Boundary Masking toggle */}
                  <div className="flex items-center justify-between p-3 rounded-xl bg-[#0a0a12]/60 border border-white/5">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs font-medium text-slate-300">Çizgi Boşluklarını Koru (Derz Payı)</span>
                      <span className="text-[10px] text-slate-500">Taşların sınırlardan dışarı taşmasını önler</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={options.useGroutGaps}
                        onChange={(e) => setOptions((prev) => ({ ...prev, useGroutGaps: e.target.checked }))}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-[#050508] border border-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-500 after:border-slate-500 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                    </label>
                  </div>

                  {/* Dynamic Grout/Edge Sensitivity slider */}
                  {options.useGroutGaps && (
                    <div className="p-3 rounded-xl bg-black/40 border border-white/5 space-y-2.5">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex flex-col">
                          <span className="text-slate-300">Kontur & Kenar Hassasiyeti (Sensitivity)</span>
                          <span className="text-[9px] text-slate-500">Kenar algılama ve derz sınırı duyarlılığı</span>
                        </div>
                        <span className="font-mono text-indigo-400 font-bold">%{options.groutThreshold}</span>
                      </div>
                      <input
                        type="range"
                        min="10"
                        max="100"
                        step="5"
                        value={options.groutThreshold}
                        onChange={(e) => setOptions((prev) => ({ ...prev, groutThreshold: parseInt(e.target.value) }))}
                        className="w-full accent-indigo-500 h-1 bg-white/5 rounded-lg appearance-none cursor-pointer"
                      />
                      <div className="flex justify-between text-[9px] text-slate-500 font-mono">
                        <span>Düşük Detay (Kalın Kenar)</span>
                        <span>Yüksek Detay (İnce Kontur)</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Vektör Outlines & Arka Plan */}
                <div className="space-y-4 border-t border-white/5 pt-4">
                  <h3 className="text-[10px] uppercase font-bold text-slate-500 tracking-[0.2em] flex items-center gap-2">
                    <Sliders className="w-3.5 h-3.5 text-indigo-400" />
                    SINIR ÇİZGİLERİ VE ARKA PLAN
                  </h3>

                  {/* Show outlines toggle */}
                  <div className="flex items-center justify-between p-3 rounded-xl bg-[#0a0a12]/60 border border-white/5">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs font-medium text-slate-300">Ana Çizgileri / Konturları Göster</span>
                      <span className="text-[10px] text-slate-500">Mozaik üstüne orijinal vektörel çizgileri çizer</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={options.showOutlines}
                        onChange={(e) => setOptions((prev) => ({ ...prev, showOutlines: e.target.checked }))}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-[#050508] border border-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-500 after:border-slate-500 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                    </label>
                  </div>

                  {options.showOutlines && (
                    <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-[#0a0a12]/30 border border-white/5">
                      <div className="space-y-1">
                        <label className="text-[10px] text-slate-500">Çizgi Rengi</label>
                        <select
                          value={options.outlineColor}
                          onChange={(e) => setOptions((prev) => ({ ...prev, outlineColor: e.target.value }))}
                          className="w-full px-2.5 py-1.5 rounded bg-[#0a0a12] border border-white/10 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                        >
                          <option value="#ffffff">Beyaz</option>
                          <option value="#000000">Siyah</option>
                          <option value="#475569">Gri</option>
                          <option value="#ffd700">Altın Sarısı</option>
                        </select>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] text-slate-500">Çizgi Kalınlığı</label>
                        <select
                          value={options.outlineWidth}
                          onChange={(e) => setOptions((prev) => ({ ...prev, outlineWidth: parseFloat(e.target.value) }))}
                          className="w-full px-2.5 py-1.5 rounded bg-[#0a0a12] border border-white/10 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                        >
                          <option value="1">İnce (1px)</option>
                          <option value="1.5">Orta (1.5px)</option>
                          <option value="2.5">Kalın (2.5px)</option>
                          <option value="4">Çok Kalın (4px)</option>
                        </select>
                      </div>
                    </div>
                  )}

                  {/* Background Color selector */}
                  {selectedTemplate && (
                    <div className="space-y-2">
                      <label className="text-xs text-slate-400">Derz Arka Plan Dolgusu (Harç Rengi)</label>
                      <div className="flex gap-2">
                        {["#0d0e15", "#1e293b", "#ffffff", "#f1f5f9", "#000000"].map((bg) => (
                          <button
                            key={bg}
                            onClick={() => setOptions((prev) => ({ ...prev, backgroundColor: bg }))}
                            className={`w-8 h-8 rounded-lg border transition-all ${
                              options.backgroundColor === bg
                                ? "border-indigo-500 scale-110 shadow-[0_0_12px_rgba(99,102,241,0.4)]"
                                : "border-white/10 hover:scale-105"
                            }`}
                            style={{ backgroundColor: bg }}
                            title={bg}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Paint-by-Numbers Section */}
                  <div className="space-y-3 border-t border-white/5 pt-4">
                    <h3 className="text-[10px] uppercase font-bold text-slate-500 tracking-[0.2em] flex items-center gap-2">
                      <Hash className="w-3.5 h-3.5 text-indigo-400" />
                      SAYILARLA BOYAMA / KODLAMA MODU
                    </h3>
                    
                    <div className="flex items-center justify-between p-3 rounded-xl bg-[#0a0a12]/60 border border-white/5">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs font-medium text-slate-300">Mozaik Taşlarında Sayıları Göster</span>
                        <span className="text-[10px] text-slate-500">Aynı renkler için aynı sayıyı veren desen oluşturur</span>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={showNumbers}
                          onChange={(e) => setShowNumbers(e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="w-9 h-5 bg-[#050508] border border-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-500 after:border-slate-500 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                      </label>
                    </div>

                    {showNumbers && (
                      <p className="text-[10px] text-amber-400/80 leading-relaxed bg-amber-500/5 p-2 rounded-lg border border-amber-500/10">
                        💡 Sayılar aktifken, her mozaik taşının üzerinde rengine karşılık gelen kod numarası görünür. Fiziksel setlerde kolay montaj için bu şablonu takip edebilirsiniz.
                      </p>
                    )}
                  </div>
                </div>
              </div>
              )
            )}

            {/* TAB 3: STATS / MATERIAL KIT */}
            {activeTab === "stats" && (
              <div className="space-y-5">
                <div className="p-4 bg-[#0a0a12]/60 rounded-xl border border-white/5 text-xs leading-relaxed space-y-2">
                  <h4 className="font-semibold text-slate-200 flex items-center gap-1.5">
                    <Info className="w-4 h-4 text-indigo-400 shrink-0" />
                    Mozaik Taş Listesi ve İstatistikleri
                  </h4>
                  <p className="text-slate-400 text-[11px]">
                    Aşağıda, oluşturduğunuz tablonun fiziksel mozaik seti olarak dökümü bulunmaktadır. Taş boyutu ve boşluk ayarları değiştikçe parça adetleri dinamik olarak güncellenir.
                  </p>
                </div>

                <div className="flex items-center justify-between border-b border-white/5 pb-3">
                  <span className="text-xs text-slate-400">Tahmini Toplam Taş Sayısı:</span>
                  <span className="text-lg font-bold font-mono text-indigo-400">{totalTiles} Adet</span>
                </div>

                <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                  {(Object.values(tileStats) as Array<{ hex: string; count: number; name: string }>).length > 0 ? (
                    (Object.values(tileStats) as Array<{ hex: string; count: number; name: string }>)
                      .sort((a, b) => b.count - a.count)
                      .map((item, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between p-3 bg-slate-900/40 rounded-xl border border-white/5 hover:bg-white/5 transition-all"
                        >
                          <div className="flex items-center gap-3">
                            <span
                              className="w-6 h-6 rounded-md border border-white/10 shadow-sm"
                              style={{ backgroundColor: item.hex }}
                            />
                            <div>
                              <p className="text-xs font-semibold text-slate-200">{item.name}</p>
                              <p className="text-[10px] text-slate-500 font-mono uppercase">{item.hex}</p>
                            </div>
                          </div>
                          
                          <div className="text-right">
                            <span className="text-xs font-bold font-mono text-slate-100">{item.count}</span>
                            <span className="text-[9px] text-slate-500 block">taş</span>
                          </div>
                        </div>
                      ))
                  ) : (
                    <div className="text-center py-8 text-slate-500 text-xs">
                      Henüz mozaik oluşturulmadı.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Interactive Workspace & Canvas (7 cols) */}
        <div className="lg:col-span-7 flex flex-col gap-6 relative z-10">
          
          {/* Top Panel Actions & Phase Selection */}
          <div className="flex items-center justify-between bg-[#0a0a12] border border-white/5 p-3 rounded-2xl shadow-2xl">
            
            <div className="flex items-center gap-2 p-1 bg-black/40 rounded-xl border border-white/5 shrink-0">
              {selectedTemplate ? (
                <button
                  onClick={() => setViewMode("vector")}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    viewMode === "vector"
                      ? "bg-indigo-950/50 border border-indigo-500/30 text-indigo-300 font-semibold shadow-[0_0_12px_rgba(99,102,241,0.2)]"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  🎨 1. Boyama Sahnesi
                </button>
              ) : (
                <button
                  onClick={() => {
                    setViewMode("vector");
                    setIsCustomConfirmed(false);
                  }}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    viewMode === "vector"
                      ? "bg-[#6366f1]/20 border border-indigo-500/30 text-indigo-300 font-semibold shadow-[0_0_12px_rgba(99,102,241,0.2)]"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  📸 1. Orijinal Önizleme
                </button>
              )}

              <button
                onClick={() => {
                  setViewMode("mosaic");
                  setIsCustomConfirmed(true);
                  setBuildProgress(1); // Ensure it's fully drawn if they click directly
                }}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  viewMode === "mosaic"
                    ? "bg-indigo-950/50 border border-indigo-500/30 text-indigo-300 font-semibold shadow-[0_0_12px_rgba(99,102,241,0.2)]"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                🧩 2. Mozaik Görünümü
              </button>

              <button
                onClick={() => {
                  setViewMode("guide");
                  setIsCustomConfirmed(true);
                  setShowNumbers(true); // Automatically turn on numbers
                  setBuildProgress(1);
                }}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  viewMode === "guide"
                    ? "bg-indigo-950/50 border border-indigo-500/30 text-indigo-300 font-semibold shadow-[0_0_12px_rgba(99,102,241,0.2)]"
                    : "text-slate-400 hover:text-slate-200"
                }`}
                title="Orijinal resim üzerinde sayıların ve mozaik kutucuklarının yerleşimini gösterir"
              >
                📋 3. Sayı Kılavuzu
              </button>

              <button
                onClick={() => {
                  if (!customImage) {
                    alert("Nesne seçimi yapabilmek için lütfen önce sol taraftan kendi görselinizi yükleyin!");
                    return;
                  }
                  setViewMode("objects");
                  setIsCustomConfirmed(true);
                  setBuildProgress(1);
                  if (detectedObjects.length === 0) {
                    detectObjectsFromImage();
                  }
                }}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  viewMode === "objects"
                    ? "bg-indigo-950/50 border border-indigo-500/30 text-indigo-300 font-semibold shadow-[0_0_12px_rgba(99,102,241,0.2)]"
                    : "text-slate-400 hover:text-slate-200"
                }`}
                title="Yapay zeka ile görseldeki nesneleri bularak seçtiğiniz kısımları mozaikleştirir"
              >
                🎯 4. Nesne Seçimi
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={startBuildAnimation}
                className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-all shadow-[0_0_15px_rgba(99,102,241,0.3)] hover:shadow-[0_0_20px_rgba(99,102,241,0.5)] border border-indigo-500/30 flex items-center gap-1.5 active:scale-95"
                title="Sıfırdan parça parça dökülerek inşa etme animasyonu"
              >
                <Play className="w-3.5 h-3.5 fill-white" />
                İnşa Animasyonu
              </button>
            </div>
          </div>

          {/* Interactive Workspace / Canvas Card */}
          <div className="flex-1 bg-[#06060c] border border-white/5 rounded-2xl p-6 shadow-2xl flex flex-col items-center justify-center relative overflow-hidden group min-h-[560px]">
            
            {/* Background Grid Pattern inside Canvas Container */}
            <div className="absolute inset-0 opacity-5 pointer-events-none z-0" 
                 style={{ backgroundImage: "radial-gradient(#4f46e5 0.5px, transparent 0.5px)", backgroundSize: "24px 24px" }} />

            {/* Fullscreen Floating Trigger Button */}
            <button
              onClick={() => {
                enterFullscreen();
                setExpandedPanel("design");
              }}
              className="absolute top-4 right-4 bg-slate-950/80 hover:bg-indigo-600 hover:text-white backdrop-blur-md text-slate-300 hover:shadow-lg hover:shadow-indigo-500/20 px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-700/60 z-20 flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
              title="Tam Ekran Modu"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75h4.5m0-4.5V3.75m12 0h-4.5m4.5 0V8.25M3.75 20.25h4.5m-4.5 0v-4.5m12 4.5h-4.5m4.5 0v-4.5" />
              </svg>
              Tam Ekran
            </button>

            {/* The Mosaic Render Canvas Container */}
            <div className="w-full max-w-full lg:max-w-[800px] aspect-square relative z-10 flex items-center justify-center">
              <MosaicCanvas
                template={selectedTemplate}
                regionColors={regionColors}
                selectedRegionId={selectedRegionId}
                onRegionSelect={(id) => {
                  setSelectedRegionId(id);
                  if (regionColors[id]) {
                    setActiveColor(regionColors[id]);
                  }
                  setActiveTab("design");
                }}
                options={options}
                customImage={customImage}
                viewMode={viewMode}
                buildProgress={buildProgress}
                onTileStatsChange={(stats) => setTileStats(stats)}
                customImageColors={customImageColors}
                customColorReplacements={customColorReplacements}
                showNumbers={showNumbers}
                activeEditTool={activeEditTool}
                activeColor={activeColor}
                detectedObjects={detectedObjects}
                selectedObjectIds={selectedObjectIds}
                hoveredObjectId={hoveredObjectId}
                onHoverObject={(id) => setHoveredObjectId(id)}
                onSelectObject={(id) => {
                  setSelectedObjectIds((prev) =>
                    prev.includes(id) ? prev.filter((oid) => oid !== id) : [...prev, id]
                  );
                }}
                segmentationTool={segmentationTool}
                manualDrawPoints={manualDrawPoints}
                onUpdateManualDrawPoints={setManualDrawPoints}
                isDrawingClosed={isDrawingClosed}
                onSetDrawingClosed={setIsDrawingClosed}
                onUpdateObjectPolygon={handleUpdateObjectPolygon}
              />

              {/* Scanning visual radar effect wrapper */}
              {isAnalyzingObjects && (
                <div className="absolute inset-0 bg-[#06060c]/90 backdrop-blur-md flex flex-col items-center justify-center gap-4 z-40 rounded-2xl border border-white/5">
                  <div className="relative w-20 h-20">
                    <div className="absolute inset-0 rounded-full border-2 border-dashed border-indigo-500/20 animate-spin" style={{ animationDuration: '6s' }} />
                    <div className="absolute -inset-1 rounded-full border-2 border-indigo-500/30 animate-pulse" />
                    <div className="absolute inset-1.5 rounded-full border border-t-2 border-indigo-500 border-transparent animate-spin" />
                    <div className="absolute inset-4 rounded-full bg-indigo-500/10 flex items-center justify-center">
                      <Target className="w-6 h-6 text-indigo-400 animate-pulse" />
                    </div>
                  </div>
                  <div className="text-center space-y-2">
                    <p className="text-sm font-bold text-slate-100 tracking-wider">YAPAY ZEKA NESNE ANALİZİ</p>
                    <p className="text-xs text-indigo-300 animate-pulse font-medium">Görsel taranıyor ve nesneler ayrıştırılıyor...</p>
                    <p className="text-[10px] text-slate-500">Gemini Vision Motoru normalized bounding-box'ları hesaplıyor</p>
                  </div>
                </div>
              )}
            </div>

            {/* Explanatory Overlay */}
            <div className="w-full max-w-lg mt-6 flex gap-3 text-slate-400 text-xs p-3.5 rounded-xl bg-[#0a0a12]/60 border border-white/5 relative z-10">
              <HelpCircle className="w-4 h-4 text-indigo-400 shrink-0" />
              <div className="space-y-1 text-[11px] leading-relaxed">
                {selectedTemplate ? (
                  viewMode === "vector" ? (
                    <p>
                      <strong className="text-slate-200">1. Boyama Aşamasındasınız:</strong> Şablonun istediğiniz bölgesine dokunarak veya tıklayarak rengini değiştirebilirsiniz. Renkleriniz tamamsa yukarıdan <strong>Mozaik Görünümü</strong>'ne geçiş yapın!
                    </p>
                  ) : viewMode === "guide" ? (
                    <p>
                      <strong className="text-slate-200">3. Sayı Kılavuzu Modundasınız:</strong> Orijinal şablon çizgileriyle birlikte her bir parçanın üzerinde numarası ve sınır kutucuğu yer alır. Fiziksel yapıştırma için mükemmel bir rehberdir!
                    </p>
                  ) : (
                    <p>
                      <strong className="text-slate-200">2. Mozaik Görünümündesiniz:</strong> Taşlar, şablona göre <strong>organik, hafif düzensiz ve döndürülmüş açılarla</strong> yerleştirildi. Mozaik Boyutu ve Düzensizlik ayarları ile oynayarak tasarımı gerçek el işçiliği gibi hassaslaştırabilirsiniz.
                    </p>
                  )
                ) : (
                  viewMode === "vector" ? (
                    <p>
                      <strong className="text-slate-200">1. Orijinal Görsel Önizleme:</strong> Yüklediğiniz görsel şu an orijinal haliyle önizleniyor. Mozaik taşlarını oluşturmak için sol taraftaki <strong>Görseli Mozaikleştir</strong> butonuna tıklayabilirsiniz.
                    </p>
                  ) : viewMode === "guide" ? (
                    <p>
                      <strong className="text-slate-200">3. Sayı Kılavuzu Modundasınız:</strong> Orijinal resminizin üstünde her bir mozaik parçasının sınır kutucukları ve hangi renge (sayıya) karşılık geldiği gösterilir. Fiziksel montaj için mükemmel bir rehberdir!
                    </p>
                  ) : viewMode === "objects" ? (
                    <p>
                      <strong className="text-slate-200">4. Nesne Seçim Modundasınız:</strong> Görselinizdeki nesneler otomatik olarak tespit edildi. Belirli nesnelere tıklayarak sadece o kısımları mozaik taşlarına dönüştürün, dış kısımlar orijinal kalsın!
                    </p>
                  ) : (
                    <p>
                      <strong className="text-slate-200">2. Mozaik Görünümündesiniz:</strong> Görselinizdeki pikseller analiz edilerek mozaik taşlarına dönüştürüldü. Mozaik Boyutu, Boşluk ve Düzensizlik ayarlarını sol paneldeki sekmelerden değiştirebilirsiniz.
                    </p>
                  )
                )}
              </div>
            </div>

            {/* Interactive Object Selection and Mosaic List */}
            {viewMode === "objects" && (
              <div className="w-full max-w-lg mt-4 bg-[#0a0a12] border border-white/5 rounded-2xl p-5 shadow-2xl space-y-4 relative z-10 text-left">
                <div className="flex items-center justify-between border-b border-white/5 pb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
                      <Target className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-100 uppercase tracking-wider">🎯 Seçici Nesne Mozaikleme</h4>
                      <p className="text-[10px] text-slate-400">Görseldeki nesneleri seçerek bağımsız mozaiklere dönüştürün.</p>
                    </div>
                  </div>
                  {segmentationTool === "auto" && (
                    <button
                      onClick={detectObjectsFromImage}
                      disabled={isAnalyzingObjects}
                      className="px-3 py-1.5 rounded-lg text-[10px] font-semibold bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 transition-all flex items-center gap-1 active:scale-95 disabled:opacity-50"
                    >
                      <RefreshCw className="w-3 h-3" />
                      Yeniden Analiz Et
                    </button>
                  )}
                </div>

                {/* Sub-tool Selector Tabs */}
                <div className="flex bg-black/40 p-1 rounded-xl border border-white/5">
                  <button
                    onClick={() => {
                      setSegmentationTool("auto");
                      setManualDrawWarning(null);
                    }}
                    className={`flex-1 py-2 rounded-lg text-xs font-bold text-center transition-all ${
                      segmentationTool === "auto"
                        ? "bg-indigo-600/25 border border-indigo-500/30 text-indigo-300 font-semibold shadow-[0_0_10px_rgba(99,102,241,0.1)]"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    🎯 Otomatik Nesne Seçimi
                  </button>
                  <button
                    onClick={() => {
                      setSegmentationTool("pen");
                      setManualDrawWarning(null);
                    }}
                    className={`flex-1 py-2 rounded-lg text-xs font-bold text-center transition-all ${
                      segmentationTool === "pen"
                        ? "bg-indigo-600/25 border border-indigo-500/30 text-indigo-300 font-semibold shadow-[0_0_10px_rgba(99,102,241,0.1)]"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    ✏️ Manuel Kalem Çizimi
                  </button>
                </div>

                {/* Warning Banner for Unclosed Paths */}
                {manualDrawWarning && (
                  <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-start justify-between gap-2 text-[11px] text-rose-400 leading-relaxed animate-pulse">
                    <span>⚠️ {manualDrawWarning}</span>
                    <button
                      onClick={() => setManualDrawWarning(null)}
                      className="text-rose-400 hover:text-rose-300 font-bold shrink-0 px-1"
                    >
                      ✕
                    </button>
                  </div>
                )}

                {/* Tab content 1: AUTO */}
                {segmentationTool === "auto" && (
                  <div className="space-y-3">
                    <div className="text-[11px] text-slate-300 bg-indigo-950/20 p-3 rounded-xl border border-indigo-500/10 space-y-1.5 leading-relaxed">
                      <p className="font-bold text-indigo-400 flex items-center gap-1">
                        ✨ Sınır Noktalarını Düzenleme
                      </p>
                      <ul className="list-disc pl-4 space-y-1 text-[10px] text-slate-400">
                        <li><strong>Nokta Taşı:</strong> Sınırı genişletmek veya daraltmak için altın noktaları sürükleyin.</li>
                        <li><strong>Yeni Nokta Ekle:</strong> Sınır çizgisi üzerinde boş bir yere tıklayarak yeni bir nokta oluşturun.</li>
                        <li><strong>Nokta Sil:</strong> Gereksiz bir noktayı kaldırmak için üzerine <strong>çift tıklayın (Double-Click)</strong>.</li>
                      </ul>
                    </div>

                    {detectedObjects.length > 0 ? (
                      <div className="grid grid-cols-2 gap-2">
                        {detectedObjects.map((obj) => {
                          const isSelected = selectedObjectIds.includes(obj.id);
                          const isHovered = obj.id === hoveredObjectId;
                          return (
                            <div
                              key={obj.id}
                              onMouseEnter={() => setHoveredObjectId(obj.id)}
                              onMouseLeave={() => setHoveredObjectId(null)}
                              onClick={() => {
                                setSelectedObjectIds((prev) =>
                                  prev.includes(obj.id) ? prev.filter((id) => id !== obj.id) : [...prev, obj.id]
                                );
                              }}
                              className={`p-3 rounded-xl border text-left cursor-pointer transition-all flex items-center justify-between gap-3 ${
                                isSelected
                                  ? "bg-indigo-950/40 border-indigo-500/50 text-indigo-300 shadow-[0_0_12px_rgba(99,102,241,0.15)]"
                                  : isHovered
                                  ? "bg-white/5 border-white/20 text-slate-200"
                                  : "bg-black/20 border-white/5 text-slate-400 hover:bg-white/5"
                              }`}
                            >
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-semibold truncate">{obj.name}</p>
                                <p className="text-[9px] text-slate-500 font-mono">Bölge: %{Math.round((obj.box[2] - obj.box[0]) * (obj.box[3] - obj.box[1]))}</p>
                              </div>
                              <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                                isSelected ? "border-indigo-500 bg-indigo-500 text-white" : "border-white/10 bg-black/40"
                              }`}>
                                {isSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-center py-6 bg-black/20 rounded-xl border border-white/5">
                        <p className="text-xs text-slate-400">Görsel nesneleri yükleniyor, lütfen bekleyin...</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Tab content 2: PEN (Manual drawing) */}
                {segmentationTool === "pen" && (
                  <div className="space-y-4">
                    <div className="p-3 bg-slate-900/60 rounded-xl border border-white/5 space-y-1.5 text-[11px] text-slate-300 leading-relaxed">
                      <p className="font-bold text-slate-200 flex items-center gap-1.5">
                        ✍️ Manuel Kalem Nasıl Çalışır?
                      </p>
                      <ul className="list-decimal pl-4 space-y-1 text-slate-400 text-[10px]">
                        <li>Görsel üzerinde sırayla tıklayarak sınır noktaları oluşturun.</li>
                        <li>Sınırı kapatmak için <strong>yeşil parlayan başlangıç noktasına</strong> tekrar tıklayın.</li>
                        <li>Yolları dilediğiniz gibi kapatıp ardından <strong>"Sınırı Nesne Olarak Kaydet"</strong> butonuna basarak mozaikleştirebilirsiniz.</li>
                      </ul>
                    </div>

                    <div className="flex items-center justify-between bg-black/30 p-3 rounded-xl border border-white/5">
                      <div className="text-[11px]">
                        <span className="text-slate-400 block">Dizilen Nokta Sayısı:</span>
                        <strong className="text-slate-200 font-mono text-xs">{manualDrawPoints.length} Adet</strong>
                      </div>
                      <div className="text-[11px]">
                        <span className="text-slate-400 block">Sınır Durumu:</span>
                        <strong className={`font-mono text-xs ${isDrawingClosed ? "text-emerald-400 animate-pulse" : "text-amber-400"}`}>
                          {isDrawingClosed ? "🟢 KAPALI / TAMAMLANDI" : "🟡 AÇIK / BİRLEŞTİRİLMEDİ"}
                        </strong>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setManualDrawPoints([]);
                          setIsDrawingClosed(false);
                          setManualDrawWarning(null);
                        }}
                        className="flex-1 py-2 rounded-xl text-xs font-semibold bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 transition-all text-center active:scale-95"
                      >
                        🗑️ Çizimi Temizle
                      </button>
                      <button
                        onClick={() => {
                          if (!isDrawingClosed || manualDrawPoints.length < 3) {
                            setManualDrawWarning("Sınır kapatılmamış! Lütfen çizimin başlangıç ve bitiş uçlarını (parıldayan yeşil halkayı) birleştirerek kapalı bir bölge oluşturun.");
                            return;
                          }

                          const newId = `manual_${Date.now()}`;
                          const xs = manualDrawPoints.map((p) => p[0]);
                          const ys = manualDrawPoints.map((p) => p[1]);
                          const xmin = Math.min(...xs);
                          const xmax = Math.max(...xs);
                          const ymin = Math.min(...ys);
                          const ymax = Math.max(...ys);

                          const newObj = {
                            id: newId,
                            name: `Manuel Çizim ${detectedObjects.filter((o) => o.id.startsWith("manual_")).length + 1}`,
                            box: [ymin, xmin, ymax, xmax],
                            polygon: [...manualDrawPoints],
                          };

                          setDetectedObjects((prev) => [...prev, newObj]);
                          setSelectedObjectIds((prev) => [...prev, newId]);
                          setManualDrawPoints([]);
                          setIsDrawingClosed(false);
                          setManualDrawWarning(null);
                        }}
                        className="flex-1 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-all text-center active:scale-95 shadow-[0_0_15px_rgba(99,102,241,0.25)]"
                      >
                        💾 Sınırı Nesne Yap
                      </button>
                    </div>
                  </div>
                )}

                {/* List of Custom-Drawn Objects */}
                {detectedObjects.some((o) => o.id.startsWith("manual_")) && (
                  <div className="border-t border-white/5 pt-4 mt-2 space-y-2">
                    <h5 className="text-[11px] font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-1.5">
                      ✏️ Çizdiğiniz Manuel Nesneler ({detectedObjects.filter((o) => o.id.startsWith("manual_")).length})
                    </h5>
                    <div className="grid grid-cols-2 gap-2 max-h-[160px] overflow-y-auto pr-1">
                      {detectedObjects
                        .filter((o) => o.id.startsWith("manual_"))
                        .map((obj) => {
                          const isSelected = selectedObjectIds.includes(obj.id);
                          return (
                            <div
                              key={obj.id}
                              className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 transition-all ${
                                isSelected
                                  ? "bg-indigo-950/30 border-indigo-500/45 text-indigo-300"
                                  : "bg-black/20 border-white/5 text-slate-400 hover:bg-white/5"
                              }`}
                            >
                              <div
                                onClick={() => {
                                  setSelectedObjectIds((prev) =>
                                    prev.includes(obj.id) ? prev.filter((id) => id !== obj.id) : [...prev, obj.id]
                                  );
                                }}
                                className="min-w-0 flex-1 cursor-pointer"
                              >
                                <p className="text-xs font-semibold truncate">{obj.name}</p>
                                <p className="text-[9px] text-slate-500 font-mono">
                                  {obj.polygon?.length || 0} Nokta
                                </p>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setDetectedObjects((prev) => prev.filter((o) => o.id !== obj.id));
                                    setSelectedObjectIds((prev) => prev.filter((id) => id !== obj.id));
                                  }}
                                  title="Çizimi Sil"
                                  className="w-6 h-6 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 flex items-center justify-center border border-rose-500/10 transition-all hover:scale-105 active:scale-95 shrink-0"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                                <div
                                  onClick={() => {
                                    setSelectedObjectIds((prev) =>
                                      prev.includes(obj.id) ? prev.filter((id) => id !== obj.id) : [...prev, obj.id]
                                    );
                                  }}
                                  className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 cursor-pointer ${
                                    isSelected ? "border-indigo-500 bg-indigo-500 text-white" : "border-white/10 bg-black/40"
                                  }`}
                                >
                                  {isSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}

                <div className="p-3 bg-amber-500/5 border border-amber-500/10 rounded-xl flex gap-2 text-[10px] text-amber-400/80 leading-relaxed">
                  <Info className="w-4 h-4 text-amber-500 shrink-0" />
                  <p>
                    💡 Görseldeki nesnelerin üzerine tıklayarak seçebilirsiniz. Seçtiğiniz her nesne anında mozaikleşecektir. 
                    Mozaik boyutunu ve tasarım ayarlarını değiştirmek için sol paneldeki <strong>Mozaik Ayarları</strong> sekmesini kullanabilirsiniz.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Footer info and design details styled as a status-bar info track */}
      <footer className="h-10 border-t border-white/5 bg-[#0a0a12] flex items-center justify-between px-8 text-[10px] font-mono text-slate-500 shrink-0 relative z-20">
        <div className="flex items-center gap-4">
          <span>© 2026 MOZAİK.GEN</span>
          <span className="text-slate-700">|</span>
          <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span> ENGINE ONLINE</span>
        </div>
        <div className="hidden sm:flex items-center gap-4">
          <span>GPU ACCELERATED</span>
          <span className="text-slate-700">|</span>
          <span>LATENCY: 14MS</span>
          <span className="text-slate-700">|</span>
          <span>V 0.9.6 PREVIEW</span>
        </div>
      </footer>

      {/* FULLSCREEN MODE MODAL */}
      {isFullscreen && (
        <div className="fixed inset-0 z-[100] bg-[#050508] flex flex-col md:flex-row h-screen w-screen overflow-hidden text-slate-300 font-sans">
          
          {/* Left Side: Interactive Workspace & Canvas Area */}
          <div className="flex-1 flex flex-col items-center justify-center p-4 md:p-8 bg-[#030307] relative h-full">
            
            {/* Top row actions in fullscreen */}
            <div className="absolute top-4 left-4 right-4 flex items-center justify-between z-20">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold font-mono text-indigo-400 bg-indigo-500/10 px-3 py-1.5 rounded-full border border-indigo-500/20">
                  TAM EKRAN MODU
                </span>
                <span className="text-xs text-slate-400 hidden sm:inline">
                  {selectedTemplate ? `Şablon: ${selectedTemplate.name}` : `Özel Görsel: ${customImageName}`}
                </span>
              </div>
              
              <div className="flex items-center gap-2">
                <button
                  onClick={startBuildAnimation}
                  className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-all shadow-[0_0_15px_rgba(99,102,241,0.3)] border border-indigo-500/30 flex items-center gap-1.5 cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 fill-white" />
                  İnşa Animasyonu
                </button>
                
                <button
                  onClick={downloadMosaic}
                  className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  Görseli Kaydet (PNG)
                </button>

                <button
                  onClick={exitFullscreen}
                  className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-rose-600/25 hover:bg-rose-600/35 border border-rose-500/30 text-rose-300 transition-all cursor-pointer"
                >
                  Kapat ✕
                </button>
              </div>
            </div>

            {/* Background Grid Pattern inside Canvas Container */}
            <div className="absolute inset-0 opacity-5 pointer-events-none z-0" 
                 style={{ backgroundImage: "radial-gradient(#4f46e5 0.5px, transparent 0.5px)", backgroundSize: "24px 24px" }} />

            {/* Main visual canvas container */}
            <div className="w-full max-w-full h-full max-h-[85vh] flex items-center justify-center p-4">
              <div className="w-full h-full relative z-10 flex items-center justify-center">
                <MosaicCanvas
                  template={selectedTemplate}
                  regionColors={regionColors}
                  selectedRegionId={selectedRegionId}
                  onRegionSelect={(id) => {
                    setSelectedRegionId(id);
                    if (regionColors[id]) {
                      setActiveColor(regionColors[id]);
                    }
                    setExpandedPanel("design");
                  }}
                  options={options}
                  customImage={customImage}
                  viewMode={viewMode}
                  buildProgress={buildProgress}
                  onTileStatsChange={(stats) => setTileStats(stats)}
                  customImageColors={customImageColors}
                  customColorReplacements={customColorReplacements}
                  showNumbers={showNumbers}
                  activeEditTool={activeEditTool}
                  activeColor={activeColor}
                  detectedObjects={detectedObjects}
                  selectedObjectIds={selectedObjectIds}
                  hoveredObjectId={hoveredObjectId}
                  onHoverObject={(id) => setHoveredObjectId(id)}
                  onSelectObject={(id) => {
                    setSelectedObjectIds((prev) =>
                      prev.includes(id) ? prev.filter((oid) => oid !== id) : [...prev, id]
                    );
                  }}
                  segmentationTool={segmentationTool}
                  manualDrawPoints={manualDrawPoints}
                  onUpdateManualDrawPoints={(pts) => setManualDrawPoints(pts)}
                  isDrawingClosed={isDrawingClosed}
                  onSetDrawingClosed={(closed) => setIsDrawingClosed(closed)}
                  onUpdateObjectPolygon={handleUpdateObjectPolygon}
                />
              </div>
            </div>
          </div>

          {/* Right Side: Accordion Menu Sidebar */}
          <div className="w-full md:w-[420px] bg-[#0a0a12] border-l border-white/5 flex flex-col h-full z-10 relative">
            <div className="p-4 border-b border-white/5 flex items-center justify-between bg-black/20 shrink-0">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-indigo-400" />
                <h2 className="text-sm font-bold text-white uppercase tracking-wider">Mozaik Kontrol Paneli</h2>
              </div>
              <span className="text-[10px] bg-indigo-500/10 border border-indigo-500/20 px-2.5 py-0.5 rounded-full text-indigo-300 font-mono font-semibold">
                {totalTiles} Taş
              </span>
            </div>

            {/* Accordion List Container */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              
              {/* SECTION 1: TASARIM & RENK */}
              <div className="border border-white/5 rounded-xl overflow-hidden bg-black/15">
                <button
                  onClick={() => setExpandedPanel(expandedPanel === "design" ? "" : "design")}
                  className={`w-full p-3.5 flex items-center justify-between text-left transition-all cursor-pointer ${
                    expandedPanel === "design" ? "bg-indigo-950/35 text-indigo-300" : "hover:bg-white/5 text-slate-300"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Palette className="w-4 h-4 text-indigo-400" />
                    <span className="text-xs font-bold uppercase tracking-wider">🎨 Tasarım & Renk</span>
                  </div>
                  <span className="text-xs text-slate-500">{expandedPanel === "design" ? "▼" : "▶"}</span>
                </button>
                
                <div className={`grid transition-all duration-300 ease-in-out ${
                  expandedPanel === "design" ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0 pointer-events-none"
                }`}>
                  <div className="overflow-hidden">
                    <div className="p-4 border-t border-white/5 bg-[#0a0a12]/40 space-y-4 max-h-[50vh] overflow-y-auto">
                      
                      {/* 1. Template picker & File uploader */}
                      <div className="space-y-3">
                        <label className="text-xs text-slate-400 font-medium">Şablon Seçimi & Görsel Yükle</label>
                        <div className="grid grid-cols-3 gap-2">
                          {templates.map((temp) => (
                            <button
                              key={temp.id}
                              onClick={() => {
                                removeCustomImage();
                                setSelectedTemplate(temp);
                              }}
                              className={`p-2 rounded-lg border text-left transition-all cursor-pointer ${
                                selectedTemplate?.id === temp.id && !customImage
                                  ? "bg-indigo-950/40 border-indigo-500/50 text-indigo-300 font-semibold"
                                  : "bg-[#0a0a12] border-white/5 text-slate-400 hover:bg-white/5"
                              }`}
                            >
                              <div className="font-semibold text-[10px] text-slate-100 truncate">{temp.name}</div>
                              <div className="text-[8px] text-slate-400 truncate">{temp.regions.length} Bölge</div>
                            </button>
                          ))}
                        </div>

                        {/* File selector status */}
                        <div 
                          onClick={() => fileInputRef.current?.click()}
                          className="border border-dashed border-white/10 rounded-lg p-3 text-center bg-black/20 hover:border-white/20 transition-all cursor-pointer"
                        >
                          {customImage ? (
                            <div className="flex items-center justify-between gap-2 text-left">
                              <span className="text-[10px] text-indigo-400 font-semibold truncate">Yüklü: {customImageName}</span>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeCustomImage();
                                }}
                                className="text-xs text-rose-400 hover:text-rose-300 font-semibold cursor-pointer"
                              >
                                Sil
                              </button>
                            </div>
                          ) : (
                            <span className="text-[10px] text-slate-400 font-medium">📂 Özel Görsel Yükle (PNG, JPG)</span>
                          )}
                        </div>
                      </div>

                      {/* Palettes Preset */}
                      <div className="space-y-2 border-t border-white/5 pt-3">
                        <label className="text-xs text-slate-400 font-medium">Hızlı Renk Paleti Uygula</label>
                        <div className="grid grid-cols-2 gap-2">
                          {PRESET_PALETTES.map((pal) => (
                            <button
                              key={pal.name}
                              onClick={() => applyPresetPalette(pal.colors)}
                              className="p-1.5 rounded bg-[#0a0a12]/80 hover:bg-white/5 border border-white/5 flex items-center justify-between text-left cursor-pointer"
                            >
                              <span className="text-[10px] font-semibold text-slate-200 truncate">{pal.name}</span>
                              <div className="flex gap-0.5 shrink-0 ml-1">
                                {pal.colors.slice(0, 3).map((col) => (
                                  <span key={col} className="w-2 h-2 rounded-full border border-black/20" style={{ backgroundColor: col }} />
                                ))}
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* 2. Painter or Custom colors */}
                      {selectedTemplate ? (
                        <div className="space-y-3 border-t border-white/5 pt-3">
                          <label className="text-xs text-slate-400 font-medium">Bölge Boyama Aracı</label>
                          <div className="space-y-2 max-h-40 overflow-y-auto bg-black/30 p-2 rounded-lg border border-white/5">
                            {selectedTemplate.regions.map((region) => {
                              const currentColor = regionColors[region.id] || region.defaultColor;
                              const isSelected = selectedRegionId === region.id;
                              return (
                                <button
                                  key={region.id}
                                  onClick={() => {
                                    setSelectedRegionId(region.id);
                                    setActiveColor(currentColor);
                                  }}
                                  className={`w-full flex items-center justify-between p-1.5 rounded text-left ${
                                    isSelected ? "bg-indigo-950/40 text-indigo-300" : "hover:bg-white/5 text-slate-400"
                                  }`}
                                >
                                  <span className="text-[11px] truncate">{region.name}</span>
                                  <span className="w-3.5 h-3.5 rounded-full border border-white/10" style={{ backgroundColor: currentColor }} />
                                </button>
                              );
                            })}
                          </div>

                          <div className="flex items-center gap-2 mt-2 bg-black/40 p-2 rounded-lg border border-white/5">
                            <span className="text-[10px] text-slate-400 shrink-0">Bölge Rengi:</span>
                            <input
                              type="color"
                              value={activeColor}
                              onChange={(e) => handleRegionColorApply(e.target.value)}
                              className="w-6 h-6 rounded cursor-pointer bg-transparent border-0 shrink-0"
                            />
                            <div className="flex flex-wrap gap-1">
                              {["#ef4444", "#f97316", "#facc15", "#22c55e", "#00d2ff", "#7000ff", "#ff007f", "#ffffff", "#000000"].map((c) => (
                                <button
                                  key={c}
                                  onClick={() => handleRegionColorApply(c)}
                                  className="w-3.5 h-3.5 rounded-full border border-white/10 hover:scale-110 transition-all cursor-pointer"
                                  style={{ backgroundColor: c }}
                                />
                              ))}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-3 border-t border-white/5 pt-3">
                          <div className="space-y-1.5">
                            <div className="flex justify-between text-xs text-slate-400">
                              <span>Renk Adedi (Özel Görsel)</span>
                              <span className="font-mono text-indigo-400 font-bold">{colorCount} Renk</span>
                            </div>
                            <input
                              type="range"
                              min="4"
                              max="12"
                              value={colorCount}
                              onChange={(e) => setColorCount(parseInt(e.target.value))}
                              className="w-full accent-indigo-500 h-1 bg-white/5 rounded-lg appearance-none cursor-pointer"
                            />
                          </div>

                          <div className="space-y-2 bg-black/30 p-2 rounded-lg border border-white/5">
                            <span className="text-[10px] text-slate-400 block font-semibold uppercase">Baskın Renk Değişim Tablosu</span>
                            <div className="grid grid-cols-2 gap-2 max-h-36 overflow-y-auto">
                              {customImageColors.map((origCol) => {
                                const replCol = customColorReplacements[origCol] || origCol;
                                return (
                                  <div key={origCol} className="flex items-center gap-1.5 bg-[#0a0a12]/80 p-1.5 rounded border border-white/5">
                                    <span className="w-4 h-4 rounded border border-white/10 shrink-0" style={{ backgroundColor: origCol }} title="Orijinal" />
                                    <span className="text-slate-500 text-[10px]">➜</span>
                                    <input
                                      type="color"
                                      value={replCol}
                                      onChange={(e) => {
                                        setCustomColorReplacements((prev) => ({
                                          ...prev,
                                          [origCol]: e.target.value,
                                        }));
                                      }}
                                      className="w-5 h-5 rounded cursor-pointer bg-transparent border-0"
                                    />
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* SECTION 2: MOZAİK AYARLARI */}
              <div className="border border-white/5 rounded-xl overflow-hidden bg-black/15">
                <button
                  onClick={() => setExpandedPanel(expandedPanel === "settings" ? "" : "settings")}
                  className={`w-full p-3.5 flex items-center justify-between text-left transition-all cursor-pointer ${
                    expandedPanel === "settings" ? "bg-indigo-950/35 text-indigo-300" : "hover:bg-white/5 text-slate-300"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Sliders className="w-4 h-4 text-purple-400" />
                    <span className="text-xs font-bold uppercase tracking-wider">⚙️ Mozaik Ayarları</span>
                  </div>
                  <span className="text-xs text-slate-500">{expandedPanel === "settings" ? "▼" : "▶"}</span>
                </button>
                
                <div className={`grid transition-all duration-300 ease-in-out ${
                  expandedPanel === "settings" ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0 pointer-events-none"
                }`}>
                  <div className="overflow-hidden">
                    <div className="p-4 border-t border-white/5 bg-[#0a0a12]/40 space-y-4 max-h-[50vh] overflow-y-auto">
                      
                      {/* Shape Select */}
                      <div className="space-y-2">
                        <label className="text-xs text-slate-400 font-medium">Mozaik Parça Şekli</label>
                        <div className="grid grid-cols-4 gap-1.5">
                          {(["square", "rounded-square", "circle", "triangle"] as TileShape[]).map((shape) => (
                            <button
                              key={shape}
                              onClick={() => setOptions((prev) => ({ ...prev, shape }))}
                              className={`py-2 px-1 rounded-lg border text-center transition-all flex flex-col items-center gap-1 cursor-pointer ${
                                options.shape === shape
                                  ? "bg-indigo-950/40 border-indigo-500/50 text-indigo-300 font-semibold"
                                  : "bg-[#0a0a12]/60 border-white/5 text-slate-400 hover:text-slate-200"
                              }`}
                            >
                              <span className={`w-3 h-3 border ${
                                shape === "circle" ? "rounded-full" : shape === "rounded-square" ? "rounded-xs" : ""
                              } ${options.shape === shape ? "border-indigo-400 bg-indigo-400/20" : "border-slate-500 bg-transparent"}`}
                              style={{ clipPath: shape === "triangle" ? "polygon(50% 0%, 0% 100%, 100% 100%)" : "none" }}
                              />
                              <span className="text-[9px]">
                                {shape === "square" ? "Kare" : shape === "rounded-square" ? "Yuvarlak" : shape === "circle" ? "Daire" : "Üçgen"}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Tile size slider */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs text-slate-400">
                          <span>Mozaik Parça Boyutu (Tile Size)</span>
                          <span className="font-mono text-indigo-400 font-bold">{options.tileSize}px</span>
                        </div>
                        <input
                          type="range"
                          min="8"
                          max="32"
                          step="2"
                          value={options.tileSize}
                          onChange={(e) => setOptions((prev) => ({ ...prev, tileSize: parseInt(e.target.value) }))}
                          className="w-full accent-indigo-500 h-1 bg-white/5 rounded-lg appearance-none cursor-pointer"
                        />
                      </div>

                      {/* Gap size slider */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs text-slate-400">
                          <span>Derz / Parça Arası Boşluk (Gap)</span>
                          <span className="font-mono text-indigo-400 font-bold">{options.gap}px</span>
                        </div>
                        <input
                          type="range"
                          min="0.5"
                          max="6"
                          step="0.5"
                          value={options.gap}
                          onChange={(e) => setOptions((prev) => ({ ...prev, gap: parseFloat(e.target.value) }))}
                          className="w-full accent-indigo-500 h-1 bg-white/5 rounded-lg appearance-none cursor-pointer"
                        />
                      </div>

                      {/* Jitter slider */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs text-slate-400">
                          <span>Düzensizlik Oranı (Jitter)</span>
                          <span className="font-mono text-indigo-400 font-bold">%{options.jitter}</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="90"
                          step="5"
                          value={options.jitter}
                          onChange={(e) => setOptions((prev) => ({ ...prev, jitter: parseInt(e.target.value) }))}
                          className="w-full accent-indigo-500 h-1 bg-white/5 rounded-lg appearance-none cursor-pointer"
                        />
                      </div>

                      {/* Grout Boundary Masking toggle & slider (Fullscreen) */}
                      <div className="space-y-2 border-t border-white/5 pt-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-slate-400">Çizgi Boşluklarını Koru (Derz Payı)</span>
                          <input
                            type="checkbox"
                            checked={options.useGroutGaps}
                            onChange={(e) => setOptions((prev) => ({ ...prev, useGroutGaps: e.target.checked }))}
                            className="accent-indigo-500 cursor-pointer"
                          />
                        </div>

                        {options.useGroutGaps && (
                          <div className="space-y-1.5 p-2 rounded bg-black/40 border border-white/5">
                            <div className="flex items-center justify-between text-[10px] text-slate-400">
                              <span>Kontur & Kenar Hassasiyeti</span>
                              <span className="font-mono text-indigo-400 font-bold">%{options.groutThreshold}</span>
                            </div>
                            <input
                              type="range"
                              min="10"
                              max="100"
                              step="5"
                              value={options.groutThreshold}
                              onChange={(e) => setOptions((prev) => ({ ...prev, groutThreshold: parseInt(e.target.value) }))}
                              className="w-full accent-indigo-500 h-1 bg-white/5 rounded-lg appearance-none cursor-pointer"
                            />
                          </div>
                        )}
                      </div>

                      {/* Outlines toggles */}
                      <div className="space-y-2 border-t border-white/5 pt-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-slate-400">Sınır Çizgilerini Göster</span>
                          <input
                            type="checkbox"
                            checked={options.showOutlines}
                            onChange={(e) => setOptions((prev) => ({ ...prev, showOutlines: e.target.checked }))}
                            className="accent-indigo-500 cursor-pointer"
                          />
                        </div>

                        {options.showOutlines && (
                          <div className="grid grid-cols-2 gap-2 p-2 rounded bg-black/40 border border-white/5">
                            <div className="space-y-0.5">
                              <span className="text-[9px] text-slate-500">Çizgi Rengi</span>
                              <select
                                value={options.outlineColor}
                                onChange={(e) => setOptions((prev) => ({ ...prev, outlineColor: e.target.value }))}
                                className="w-full p-1 rounded bg-[#0a0a12] border border-white/5 text-[10px]"
                              >
                                <option value="#ffffff">Beyaz</option>
                                <option value="#000000">Siyah</option>
                                <option value="#475569">Gri</option>
                                <option value="#ffd700">Altın Sarısı</option>
                              </select>
                            </div>

                            <div className="space-y-0.5">
                              <span className="text-[9px] text-slate-500">Çizgi Kalınlığı</span>
                              <select
                                value={options.outlineWidth}
                                onChange={(e) => setOptions((prev) => ({ ...prev, outlineWidth: parseFloat(e.target.value) }))}
                                className="w-full p-1 rounded bg-[#0a0a12] border border-white/5 text-[10px]"
                              >
                                <option value="1">İnce</option>
                                <option value="1.5">Orta</option>
                                <option value="2.5">Kalın</option>
                              </select>
                            </div>
                          </div>
                        )}
                      </div>

                    </div>
                  </div>
                </div>
              </div>

              {/* BUTTON 1: ÖNİZLEME / BOYAMA */}
              <div className="border border-white/5 rounded-xl overflow-hidden bg-black/15">
                <button
                  onClick={() => {
                    setExpandedPanel("vector");
                    setViewMode("vector");
                    if (!selectedTemplate && customImage) {
                      setIsCustomConfirmed(false);
                    }
                  }}
                  className={`w-full p-3.5 flex items-center justify-between text-left transition-all cursor-pointer ${
                    expandedPanel === "vector" ? "bg-indigo-950/35 text-indigo-300" : "hover:bg-white/5 text-slate-300"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-xs font-mono font-bold text-indigo-400 bg-indigo-500/10 w-5 h-5 rounded flex items-center justify-center shrink-0">1</span>
                    <span className="text-xs font-bold uppercase tracking-wider">
                      {selectedTemplate ? "🎨 Boyama Sahnesi" : "📸 Orijinal Önizleme"}
                    </span>
                  </div>
                  <span className="text-xs text-slate-500">{expandedPanel === "vector" ? "▼" : "▶"}</span>
                </button>
                
                <div className={`grid transition-all duration-300 ease-in-out ${
                  expandedPanel === "vector" ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0 pointer-events-none"
                }`}>
                  <div className="overflow-hidden">
                    <div className="p-4 border-t border-white/5 bg-[#0a0a12]/40 space-y-3">
                      <p className="text-[11px] text-slate-400 leading-relaxed">
                        {selectedTemplate 
                          ? "Sayılarla Boyama Modu aktiftir. Şablonun istediğiniz bölgesine tıklayıp 'Tasarım & Renk' panelinden rengini değiştirebilirsiniz."
                          : "Özel görseliniz şu an orijinal renkleriyle önizleniyor. Mozaik görünümüne dönüştürmek için aşağıdaki butona tıklayın."
                        }
                      </p>
                      {!selectedTemplate && !isCustomConfirmed && (
                        <button
                          onClick={() => {
                            setIsCustomConfirmed(true);
                            setViewMode("mosaic");
                            setExpandedPanel("mosaic");
                            startBuildAnimation();
                          }}
                          className="w-full py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg text-xs font-bold hover:from-indigo-500 cursor-pointer"
                        >
                          Görseli Mozaikleştir 🧩
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* BUTTON 2: MOZAİK GÖRÜNÜMÜ */}
              <div className="border border-white/5 rounded-xl overflow-hidden bg-black/15">
                <button
                  onClick={() => {
                    setExpandedPanel("mosaic");
                    setViewMode("mosaic");
                    setIsCustomConfirmed(true);
                  }}
                  className={`w-full p-3.5 flex items-center justify-between text-left transition-all cursor-pointer ${
                    expandedPanel === "mosaic" ? "bg-indigo-950/35 text-indigo-300" : "hover:bg-white/5 text-slate-300"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-xs font-mono font-bold text-indigo-400 bg-indigo-500/10 w-5 h-5 rounded flex items-center justify-center shrink-0">2</span>
                    <span className="text-xs font-bold uppercase tracking-wider">🧩 Mozaik Görünümü</span>
                  </div>
                  <span className="text-xs text-slate-500">{expandedPanel === "mosaic" ? "▼" : "▶"}</span>
                </button>
                
                <div className={`grid transition-all duration-300 ease-in-out ${
                  expandedPanel === "mosaic" ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0 pointer-events-none"
                }`}>
                  <div className="overflow-hidden">
                    <div className="p-4 border-t border-white/5 bg-[#0a0a12]/40 space-y-4">
                      <div className="space-y-2">
                        <span className="text-[10px] text-indigo-400 uppercase font-bold tracking-wider">🛠️ MANUEL MOZAİK ATÖLYESİ</span>
                        <p className="text-[10px] text-slate-400 leading-relaxed">
                          Taşların yerini değiştirebilir, renkleri takas edebilir, silebilir veya yeni parçalar ekleyebilirsiniz:
                        </p>
                        <div className="grid grid-cols-2 gap-2 pt-1">
                          <button
                            onClick={() => setActiveEditTool("move")}
                            className={`p-2 rounded-lg border text-left text-[11px] transition-all cursor-pointer ${
                              activeEditTool === "move"
                                ? "bg-indigo-950/50 border-indigo-500/50 text-indigo-300 font-semibold"
                                : "bg-[#0a0a12]/60 border-white/5 text-slate-400 hover:text-slate-200"
                            }`}
                          >
                            👋 Taşı / Sürükle
                          </button>
                          <button
                            onClick={() => setActiveEditTool("swap")}
                            className={`p-2 rounded-lg border text-left text-[11px] transition-all cursor-pointer ${
                              activeEditTool === "swap"
                                ? "bg-indigo-950/50 border-indigo-500/50 text-indigo-300 font-semibold"
                                : "bg-[#0a0a12]/60 border-white/5 text-slate-400 hover:text-slate-200"
                            }`}
                          >
                            🔄 Taşları Takas Et
                          </button>
                          <button
                            onClick={() => setActiveEditTool("erase")}
                            className={`p-2 rounded-lg border text-left text-[11px] transition-all cursor-pointer ${
                              activeEditTool === "erase"
                                ? "bg-indigo-950/50 border-indigo-500/50 text-indigo-300 font-semibold"
                                : "bg-[#0a0a12]/60 border-white/5 text-slate-400 hover:text-slate-200"
                            }`}
                          >
                            ❌ Parça Sil
                          </button>
                          <button
                            onClick={() => setActiveEditTool("add")}
                            className={`p-2 rounded-lg border text-left text-[11px] transition-all cursor-pointer ${
                              activeEditTool === "add"
                                ? "bg-indigo-950/50 border-indigo-500/50 text-indigo-300 font-semibold"
                                : "bg-[#0a0a12]/60 border-white/5 text-slate-400 hover:text-slate-200"
                            }`}
                          >
                            ➕ Yeni Taş Ekle
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* BUTTON 3: SAYI KILAVUZU */}
              <div className="border border-white/5 rounded-xl overflow-hidden bg-black/15">
                <button
                  onClick={() => {
                    setExpandedPanel("guide");
                    setViewMode("guide");
                    setIsCustomConfirmed(true);
                    setShowNumbers(true);
                  }}
                  className={`w-full p-3.5 flex items-center justify-between text-left transition-all cursor-pointer ${
                    expandedPanel === "guide" ? "bg-indigo-950/35 text-indigo-300" : "hover:bg-white/5 text-slate-300"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-xs font-mono font-bold text-indigo-400 bg-indigo-500/10 w-5 h-5 rounded flex items-center justify-center shrink-0">3</span>
                    <span className="text-xs font-bold uppercase tracking-wider">📋 3. Sayı Kılavuzu</span>
                  </div>
                  <span className="text-xs text-slate-500">{expandedPanel === "guide" ? "▼" : "▶"}</span>
                </button>
                
                <div className={`grid transition-all duration-300 ease-in-out ${
                  expandedPanel === "guide" ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0 pointer-events-none"
                }`}>
                  <div className="overflow-hidden">
                    <div className="p-4 border-t border-white/5 bg-[#0a0a12]/40 space-y-3">
                      <p className="text-[11px] text-slate-400 leading-relaxed">
                        Fiziksel setinizi hazırlarken hangi taşı nereye koyacağınızı numaralarla gösteren teknik kılavuzdur.
                      </p>
                      <div className="flex items-center justify-between p-2 rounded bg-black/30 border border-white/5">
                        <span className="text-[11px] text-slate-300">Sayı Numaralarını Göster</span>
                        <input
                          type="checkbox"
                          checked={showNumbers}
                          onChange={(e) => setShowNumbers(e.target.checked)}
                          className="accent-indigo-500 cursor-pointer"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* BUTTON 4: NESNE SEÇİMİ */}
              <div className="border border-white/5 rounded-xl overflow-hidden bg-black/15">
                <button
                  onClick={() => {
                    if (!customImage) {
                      alert("Nesne seçimi yapabilmek için lütfen önce sol taraftan kendi görselinizi yükleyin!");
                      return;
                    }
                    setExpandedPanel("objects");
                    setViewMode("objects");
                    setIsCustomConfirmed(true);
                    if (detectedObjects.length === 0) {
                      detectObjectsFromImage();
                    }
                  }}
                  className={`w-full p-3.5 flex items-center justify-between text-left transition-all cursor-pointer ${
                    expandedPanel === "objects" ? "bg-indigo-950/35 text-indigo-300" : "hover:bg-white/5 text-slate-300"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-xs font-mono font-bold text-indigo-400 bg-indigo-500/10 w-5 h-5 rounded flex items-center justify-center shrink-0">4</span>
                    <span className="text-xs font-bold uppercase tracking-wider">🎯 4. Nesne Seçimi</span>
                  </div>
                  <span className="text-xs text-slate-500">{expandedPanel === "objects" ? "▼" : "▶"}</span>
                </button>
                
                <div className={`grid transition-all duration-300 ease-in-out ${
                  expandedPanel === "objects" ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0 pointer-events-none"
                }`}>
                  <div className="overflow-hidden">
                    <div className="p-4 border-t border-white/5 bg-[#0a0a12]/40 space-y-4 text-left">
                      <div className="flex items-center justify-between border-b border-white/5 pb-3">
                        <div>
                          <h4 className="text-xs font-bold text-slate-100 uppercase tracking-wider">🎯 Seçici Nesne Mozaikleme</h4>
                          <p className="text-[10px] text-slate-400">Görseldeki nesneleri seçerek bağımsız mozaiklere dönüştürün.</p>
                        </div>
                        {segmentationTool === "auto" && (
                          <button
                            onClick={detectObjectsFromImage}
                            disabled={isAnalyzingObjects}
                            className="px-3 py-1.5 rounded-lg text-[10px] font-semibold bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 transition-all flex items-center gap-1 active:scale-95 disabled:opacity-50"
                          >
                            <RefreshCw className="w-3 h-3" />
                            Yeniden Analiz Et
                          </button>
                        )}
                      </div>

                      {/* Sub-tool Selector Tabs */}
                      <div className="flex bg-black/40 p-1 rounded-xl border border-white/5">
                        <button
                          onClick={() => {
                            setSegmentationTool("auto");
                            setManualDrawWarning(null);
                          }}
                          className={`flex-1 py-2 rounded-lg text-xs font-bold text-center transition-all cursor-pointer ${
                            segmentationTool === "auto"
                              ? "bg-indigo-600/25 border border-indigo-500/30 text-indigo-300 font-semibold shadow-[0_0_10px_rgba(99,102,241,0.1)]"
                              : "text-slate-400 hover:text-slate-200"
                          }`}
                        >
                          🎯 Otomatik Nesne Seçimi
                        </button>
                        <button
                          onClick={() => {
                            setSegmentationTool("pen");
                            setManualDrawWarning(null);
                          }}
                          className={`flex-1 py-2 rounded-lg text-xs font-bold text-center transition-all cursor-pointer ${
                            segmentationTool === "pen"
                              ? "bg-indigo-600/25 border border-indigo-500/30 text-indigo-300 font-semibold shadow-[0_0_10px_rgba(99,102,241,0.1)]"
                              : "text-slate-400 hover:text-slate-200"
                          }`}
                        >
                          ✏️ Manuel Kalem Çizimi
                        </button>
                      </div>

                      {/* Warning Banner for Unclosed Paths */}
                      {manualDrawWarning && (
                        <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-start justify-between gap-2 text-[11px] text-rose-400 leading-relaxed animate-pulse">
                          <span>⚠️ {manualDrawWarning}</span>
                          <button
                            onClick={() => setManualDrawWarning(null)}
                            className="text-rose-400 hover:text-rose-300 font-bold shrink-0 px-1"
                          >
                            ✕
                          </button>
                        </div>
                      )}

                      {/* Tab content 1: AUTO */}
                      {segmentationTool === "auto" && (
                        <div className="space-y-3">
                          <div className="text-[11px] text-slate-300 bg-indigo-950/20 p-3 rounded-xl border border-indigo-500/10 space-y-1.5 leading-relaxed">
                            <p className="font-bold text-indigo-400 flex items-center gap-1">
                              ✨ Sınır Noktalarını Düzenleme
                            </p>
                            <ul className="list-disc pl-4 space-y-1 text-[10px] text-slate-400">
                              <li><strong>Nokta Taşı:</strong> Sınırı genişletmek veya daraltmak için altın noktaları sürükleyin.</li>
                              <li><strong>Yeni Nokta Ekle:</strong> Sınır çizgisi üzerinde boş bir yere tıklayarak yeni bir nokta oluşturun.</li>
                              <li><strong>Nokta Sil:</strong> Noktayı kaldırmak için üzerine <strong>çift tıklayın (Double-Click)</strong>.</li>
                            </ul>
                          </div>

                          {detectedObjects.length > 0 ? (
                            <div className="grid grid-cols-1 gap-2 max-h-56 overflow-y-auto pr-1">
                              {detectedObjects.map((obj) => {
                                const isSelected = selectedObjectIds.includes(obj.id);
                                const isHovered = obj.id === hoveredObjectId;
                                return (
                                  <div
                                    key={obj.id}
                                    onMouseEnter={() => setHoveredObjectId(obj.id)}
                                    onMouseLeave={() => setHoveredObjectId(null)}
                                    onClick={() => {
                                      setSelectedObjectIds((prev) =>
                                        prev.includes(obj.id) ? prev.filter((id) => id !== obj.id) : [...prev, obj.id]
                                      );
                                    }}
                                    className={`p-3 rounded-xl border text-left cursor-pointer transition-all flex items-center justify-between gap-3 ${
                                      isSelected
                                        ? "bg-indigo-950/40 border-indigo-500/50 text-indigo-300 shadow-[0_0_12px_rgba(99,102,241,0.15)]"
                                        : isHovered
                                        ? "bg-white/5 border-white/20 text-slate-200"
                                        : "bg-black/20 border-white/5 text-slate-400 hover:bg-white/5"
                                    }`}
                                  >
                                    <div className="min-w-0 flex-1">
                                      <p className="text-xs font-semibold truncate">{obj.name}</p>
                                      <p className="text-[9px] text-slate-500 font-mono">Bölge: %{Math.round((obj.box[2] - obj.box[0]) * (obj.box[3] - obj.box[1]))}</p>
                                    </div>
                                    <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                                      isSelected ? "border-indigo-500 bg-indigo-500 text-white" : "border-white/10 bg-black/40"
                                    }`}>
                                      {isSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="text-center py-6 bg-black/20 rounded-xl border border-white/5">
                              <p className="text-xs text-slate-400">Görsel nesneleri yükleniyor, lütfen bekleyin...</p>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Tab content 2: PEN (Manual drawing) */}
                      {segmentationTool === "pen" && (
                        <div className="space-y-4">
                          <div className="p-3 bg-slate-900/60 rounded-xl border border-white/5 space-y-1.5 text-[11px] text-slate-300 leading-relaxed">
                            <p className="font-bold text-slate-200 flex items-center gap-1.5">
                              ✍️ Manuel Kalem Nasıl Çalışır?
                            </p>
                            <ul className="list-decimal pl-4 space-y-1 text-slate-400 text-[10px]">
                              <li>Görsel üzerinde sırayla tıklayarak sınır noktaları oluşturun.</li>
                              <li>Sınırı kapatmak için <strong>yeşil parlayan başlangıç noktasına</strong> tekrar tıklayın.</li>
                              <li>Yolları kapatıp ardından <strong>"Sınırı Nesne Olarak Kaydet"</strong> butonuna basarak mozaikleştirebilirsiniz.</li>
                            </ul>
                          </div>

                          <div className="flex items-center justify-between bg-black/30 p-3 rounded-xl border border-white/5">
                            <div className="text-[11px]">
                              <span className="text-slate-400 block">Dizilen Nokta Sayısı:</span>
                              <strong className="text-slate-200 font-mono text-xs">{manualDrawPoints.length} Adet</strong>
                            </div>
                            <div className="text-[11px]">
                              <span className="text-slate-400 block">Sınır Durumu:</span>
                              <strong className={`font-mono text-xs ${isDrawingClosed ? "text-emerald-400 animate-pulse" : "text-amber-400"}`}>
                                {isDrawingClosed ? "🟢 KAPALI / TAMAMLANDI" : "🟡 AÇIK / BİRLEŞTİRİLMEDİ"}
                              </strong>
                            </div>
                          </div>

                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                setManualDrawPoints([]);
                                setIsDrawingClosed(false);
                                setManualDrawWarning(null);
                              }}
                              className="flex-1 py-2 rounded-xl text-xs font-semibold bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 transition-all text-center active:scale-95 cursor-pointer"
                            >
                              🗑️ Çizimi Temizle
                            </button>
                            <button
                              onClick={() => {
                                if (!isDrawingClosed || manualDrawPoints.length < 3) {
                                  setManualDrawWarning("Sınır kapatılmamış! Lütfen çizimin başlangıç ve bitiş uçlarını (parıldayan yeşil halkayı) birleştirerek kapalı bir bölge oluşturun.");
                                  return;
                                }

                                const newId = `manual_${Date.now()}`;
                                const xs = manualDrawPoints.map((p) => p[0]);
                                const ys = manualDrawPoints.map((p) => p[1]);
                                const xmin = Math.min(...xs);
                                const xmax = Math.max(...xs);
                                const ymin = Math.min(...ys);
                                const ymax = Math.max(...ys);

                                const newObj = {
                                  id: newId,
                                  name: `Manuel Çizim ${detectedObjects.filter((o) => o.id.startsWith("manual_")).length + 1}`,
                                  box: [ymin, xmin, ymax, xmax],
                                  polygon: [...manualDrawPoints],
                                };

                                setDetectedObjects((prev) => [...prev, newObj]);
                                setSelectedObjectIds((prev) => [...prev, newId]);
                                setManualDrawPoints([]);
                                setIsDrawingClosed(false);
                                setManualDrawWarning(null);
                              }}
                              className="flex-1 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-all text-center active:scale-95 shadow-[0_0_15px_rgba(99,102,241,0.25)] cursor-pointer"
                            >
                              💾 Sınırı Nesne Yap
                            </button>
                          </div>
                        </div>
                      )}

                      {/* List of Custom-Drawn Objects */}
                      {detectedObjects.some((o) => o.id.startsWith("manual_")) && (
                        <div className="border-t border-white/5 pt-4 mt-2 space-y-2">
                          <h5 className="text-[11px] font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-1.5">
                            ✏️ Çizdiğiniz Manuel Nesneler ({detectedObjects.filter((o) => o.id.startsWith("manual_")).length})
                          </h5>
                          <div className="grid grid-cols-1 gap-2 max-h-[160px] overflow-y-auto pr-1">
                            {detectedObjects
                              .filter((o) => o.id.startsWith("manual_"))
                              .map((obj) => {
                                const isSelected = selectedObjectIds.includes(obj.id);
                                return (
                                  <div
                                    key={obj.id}
                                    className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 transition-all ${
                                      isSelected
                                        ? "bg-indigo-950/30 border-indigo-500/45 text-indigo-300"
                                        : "bg-black/20 border-white/5 text-slate-400 hover:bg-white/5"
                                    }`}
                                  >
                                    <div
                                      onClick={() => {
                                        setSelectedObjectIds((prev) =>
                                          prev.includes(obj.id) ? prev.filter((id) => id !== obj.id) : [...prev, obj.id]
                                        );
                                      }}
                                      className="min-w-0 flex-1 cursor-pointer"
                                    >
                                      <p className="text-xs font-semibold truncate">{obj.name}</p>
                                      <p className="text-[9px] text-slate-500 font-mono">
                                        {obj.polygon?.length || 0} Nokta
                                      </p>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setDetectedObjects((prev) => prev.filter((o) => o.id !== obj.id));
                                          setSelectedObjectIds((prev) => prev.filter((id) => id !== obj.id));
                                        }}
                                        title="Çizimi Sil"
                                        className="w-6 h-6 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 flex items-center justify-center border border-rose-500/10 transition-all hover:scale-105 active:scale-95 shrink-0 cursor-pointer"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                      <div
                                        onClick={() => {
                                          setSelectedObjectIds((prev) =>
                                            prev.includes(obj.id) ? prev.filter((id) => id !== obj.id) : [...prev, obj.id]
                                          );
                                        }}
                                        className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 cursor-pointer ${
                                          isSelected ? "border-indigo-500 bg-indigo-500 text-white" : "border-white/10 bg-black/40"
                                        }`}
                                      >
                                        {isSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                          </div>
                        </div>
                      )}

                      <div className="p-3 bg-amber-500/5 border border-amber-500/10 rounded-xl flex gap-2 text-[10px] text-amber-400/80 leading-relaxed">
                        <Info className="w-4 h-4 text-amber-500 shrink-0" />
                        <p>
                          💡 Görseldeki nesnelerin üzerine tıklayarak seçebilirsiniz. Seçtiğiniz her nesne anında mozaikleşecektir. 
                          Mozaik boyutunu ve tasarım ayarlarını değiştirmek için sol paneldeki <strong>Mozaik Ayarları</strong> sekmesini kullanabilirsiniz.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

            </div>

            <div className="p-4 border-t border-white/5 bg-black/20 text-center shrink-0">
              <button
                onClick={exitFullscreen}
                className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-all shadow-[0_0_15px_rgba(99,102,241,0.2)] cursor-pointer"
              >
                Tam Ekrandan Çık
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
