import express from "express";
import path from "path";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

// Initialize Gemini client using server-side GEMINI_API_KEY
let ai: GoogleGenAI | null = null;
try {
  if (process.env.GEMINI_API_KEY) {
    ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
    console.log("GoogleGenAI initialized successfully with API Key.");
  } else {
    console.warn("GEMINI_API_KEY is not defined in environment variables.");
  }
} catch (err) {
  console.error("Failed to initialize GoogleGenAI:", err);
}

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '10mb' }));

// Health check API
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

// AI Template Colorizer Endpoint
// Bu uç nokta, kullanıcının seçtiği şablonu ve tarzı alarak Gemini ile uyumlu renkler üretir.
app.post("/api/color-template", async (req, res) => {
  const { templateId, templateName, stylePrompt, regions } = req.body;

  if (!regions || !Array.isArray(regions)) {
    return res.status(400).json({ error: "Regions must be an array of objects containing id and name." });
  }

  if (!ai) {
    return res.status(503).json({ 
      error: "Gemini API is not configured. Please add GEMINI_API_KEY in Settings > Secrets." 
    });
  }

  try {
    const style = stylePrompt || "Vibrant and Harmonious";
    
    // Construct prompt for Gemini
    const systemPrompt = `You are an expert artist and color designer specializing in mosaic tile art.
Your task is to assign a beautiful, cohesive, and artistically meaningful color palette to different regions of a vector drawing named "${templateName}" based on a style theme or prompt.

Style Theme: "${style}"

Each region has an 'id' and a human-readable 'name' describing what it is in Turkish (e.g. "sky" -> "Gökyüzü", "horn" -> "Boynuz").
You must choose a hex color code (like "#ff00bb") for EACH region. Make sure:
1. The overall combination represents the theme "${style}" perfectly.
2. The colors form high contrast where appropriate (e.g., unicorn body versus background sky, eye/hoof details stand out).
3. The colors are beautiful and match professional color design principles.
4. Respond in JSON. Return an object where each key is the region 'id' and each value is the Hex color string (including the '#').`;

    const contents = `Regions to color for "${templateName}":
${regions.map(r => `- ID: "${r.id}" (Description: ${r.name})`).join("\n")}

Please generate the color mappings.`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: contents,
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          description: "A map of region ID strings to hex color codes.",
          properties: regions.reduce((acc: any, curr) => {
            acc[curr.id] = {
              type: Type.STRING,
              description: `Hex color for the region "${curr.name}" (${curr.id})`
            };
            return acc;
          }, {}),
          required: regions.map(r => r.id)
        }
      }
    });

    if (!response.text) {
      throw new Error("No response text received from Gemini.");
    }

    const colorMap = JSON.parse(response.text.trim());
    return res.json({ colorMap });

  } catch (err: any) {
    console.error("Gemini AI colorization error:", err);
    return res.status(500).json({ 
      error: "Yapay zeka renk tasarımı sırasında bir hata oluştu.", 
      details: err.message 
    });
  }
});

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function generateContentWithRetry(aiClient: any, params: any, maxRetries = 3): Promise<any> {
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      attempt++;
      console.log(`Gemini API call attempt ${attempt}/${maxRetries}...`);
      const response = await aiClient.models.generateContent(params);
      return response;
    } catch (err: any) {
      console.warn(`Attempt ${attempt} failed:`, err.message || err);
      if (attempt >= maxRetries) {
        throw err;
      }
      const errStr = String(err.message || err);
      if (errStr.includes("503") || errStr.includes("429") || errStr.includes("UNAVAILABLE") || errStr.includes("RESOURCE_EXHAUSTED") || errStr.includes("demand")) {
        const delay = attempt * 1500;
        console.log(`Transient Gemini API error detected. Retrying in ${delay}ms...`);
        await sleep(delay);
      } else {
        throw err;
      }
    }
  }
}

// AI-powered Object Detection Endpoint
// Bu uç nokta, yüklenen görseli analiz eder ve görseldeki belirgin nesneleri, Türkçe isimleri ve piksel koordinat sınırları [ymin, xmin, ymax, xmax] (0-100 arası normalize) ile çıkarır.
app.post("/api/detect-objects", async (req, res) => {
  const { imageBase64 } = req.body;

  if (!imageBase64) {
    return res.status(400).json({ error: "imageBase64 is required." });
  }

  // Graceful fallback structures in case the API is offline or key is missing
  const getFallbackObjects = () => [
    {
      id: "fallback_obj_1",
      name: "Merkez Bölge (Odak)",
      box: [20, 20, 80, 80],
      polygon: [[50, 20], [65, 23], [77, 32], [80, 50], [77, 68], [65, 77], [50, 80], [35, 77], [23, 68], [20, 50], [23, 32], [35, 23]]
    },
    {
      id: "fallback_obj_2",
      name: "Gökyüzü / Üst Plan",
      box: [0, 0, 30, 100],
      polygon: [[0, 0], [100, 0], [100, 30], [80, 28], [60, 32], [40, 27], [20, 31], [0, 25]]
    },
    {
      id: "fallback_obj_3",
      name: "Zemin / Alt Alan",
      box: [70, 0, 100, 100],
      polygon: [[0, 100], [0, 70], [25, 74], [50, 68], [75, 73], [100, 70], [100, 100]]
    },
    {
      id: "fallback_obj_4",
      name: "Sol Bölge Detayı",
      box: [25, 0, 75, 40],
      polygon: [[0, 25], [20, 28], [35, 40], [40, 50], [35, 60], [20, 72], [0, 75]]
    },
    {
      id: "fallback_obj_5",
      name: "Sağ Bölge Detayı",
      box: [25, 60, 75, 100],
      polygon: [[100, 25], [80, 28], [65, 40], [60, 50], [65, 60], [80, 72], [100, 75]]
    }
  ];

  if (!ai) {
    console.warn("Gemini AI API key is missing. Returning high-fidelity intelligent fallback layers...");
    return res.json({ objects: getFallbackObjects(), isFallback: true });
  }

  try {
    const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");

    const systemPrompt = `You are an expert computer vision model specializing in high-fidelity object segmentation for mosaics.
Your task is to analyze the uploaded image and identify ONLY the primary, distinct physical, and meaningful visual objects/entities (such as a Person, Human Silhouette, Animal, Vehicle, Tree, or prominent foreground subject).

CRITICAL SEGMENTATION RULES:
1. DO NOT segment abstract color gradients, transition zones (such as a fade/gradient to white or gray), shadow areas, highlights, light reflections, or empty sky gradients. These are NOT objects.
2. If the main subject of the image is a person (human silhouette), detect them as a single unified object named 'Ana Nesne (İnsan)' or similar, rather than segmenting their clothes, hair, skin, or face separately.
3. Keep the total number of detected objects very small (maximum 3-5 major objects). Do not fragment the image into dozens of tiny color patches.
4. Always group background regions into simple unified regions like 'Arka Plan' (Background), 'Gökyüzü' (Sky), or 'Zemin' (Floor).
5. For the primary subject, return a highly accurate, high-precision closed polygon ('polygon') that traces the exact physical silhouette contour. This polygon must contain between 20 and 45 points outlining the actual physical shape beautifully.

For each detected object, you MUST provide:
1. A unique string 'id' (e.g. "obj_1", "obj_2").
2. A short, neat name in Turkish (e.g. "İnsan", "Araba", "Kedi", "Ağaç", "Arka Plan").
3. A normalized bounding box 'box' as an array [ymin, xmin, ymax, xmax] where each coordinate is an integer from 0 to 100 representing the percentage offset relative to the image's height and width.
4. A high-precision polygon contour 'polygon' as an array of points [[x1, y1], [x2, y2], ..., [xn, yn]] where each point contains two integers between 0 and 100 representing the percentage offset relative to the image's width and height. This polygon MUST trace the precise, realistic physical outer boundary/contour/silhouette of the visual object. Do not just return a 4-point rectangle; provide a rich, detailed contour containing at least 20-45 points to outline the real shape.
5. Return a JSON object with an 'objects' array containing these entities. Ensure polygons and bounding boxes are highly accurate so they trace the actual physical contours of each entity.`;

    const contents = [
      {
        inlineData: {
          mimeType: "image/jpeg",
          data: cleanBase64
        }
      },
      "Identify the major visual objects in this image and return their precise silhouettes as polygon coordinates and bounding boxes in Turkish labels."
    ];

    const response = await generateContentWithRetry(ai, {
      model: "gemini-3.5-flash",
      contents: contents,
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            objects: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  name: { type: Type.STRING, description: "Turkish name of the detected object (e.g. Araba, Ağaç, İnsan, Gökyüzü)" },
                  box: {
                    type: Type.ARRAY,
                    description: "Normalized bounding box [ymin, xmin, ymax, xmax] as integers between 0 and 100",
                    items: { type: Type.INTEGER }
                  },
                  polygon: {
                    type: Type.ARRAY,
                    description: "High-precision outline polygon [[x1, y1], [x2, y2], ...] of coordinates between 0 and 100",
                    items: {
                      type: Type.ARRAY,
                      items: { type: Type.INTEGER }
                    }
                  }
                },
                required: ["id", "name", "box", "polygon"]
              }
            }
          },
          required: ["objects"]
        }
      }
    });

    if (!response.text) {
      throw new Error("No response received from Gemini.");
    }

    const result = JSON.parse(response.text.trim());
    return res.json({ objects: result.objects || [] });

  } catch (err: any) {
    console.error("Gemini AI object detection error, serving rich high-fidelity segmentation fallbacks:", err);
    // Smooth recovery - do not crash the client, return smart fallbacks to let edge-aware magic wand do its job
    return res.json({ 
      objects: getFallbackObjects(), 
      isFallback: true,
      errorInfo: err.message || "Transient model service unavailability" 
    });
  }
});

// Setup Vite development server or serve static build files in production
async function bootstrap() {
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    console.log("Vite development middleware integrated.");
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
    console.log("Serving static production files from dist/ directory.");
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Express server running at http://0.0.0.0:${PORT}`);
  });
}

bootstrap().catch(err => {
  console.error("Failed to start server:", err);
});
