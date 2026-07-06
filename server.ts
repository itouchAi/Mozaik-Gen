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
