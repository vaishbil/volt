import express from "express";
import path from "path";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Initialize Gemini SDK with the required telemetry header
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      "User-Agent": "aistudio-build",
    },
  },
});

const generateContentWithFallback = async (aiClient: any, params: any) => {
  const modelToTry = params.model || "gemini-3.5-flash";
  try {
    return await aiClient.models.generateContent({
      ...params,
      model: modelToTry,
    });
  } catch (err: any) {
    console.warn(`Failed with model ${modelToTry}. Trying fallback...`, err);
    // Fallback models in order of capability / availability
    const fallbacks = ["gemini-2.5-flash", "gemini-3.1-flash-lite", "gemini-flash-latest"];
    for (const fb of fallbacks) {
      if (fb === modelToTry) continue;
      try {
        console.log(`Attempting fallback model: ${fb}`);
        return await aiClient.models.generateContent({
          ...params,
          model: fb,
        });
      } catch (innerErr) {
        console.warn(`Fallback model ${fb} also failed:`, innerErr);
      }
    }
    // If all else fails, rethrow the original error
    throw err;
  }
};

// API Routes
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// Endpoint for Habit Nudge
app.post("/api/habits/nudge", async (req, res) => {
  try {
    const { habits } = req.body;

    if (!habits || !Array.isArray(habits)) {
      return res.status(400).json({ error: "Invalid habits list" });
    }

    if (habits.length === 0) {
      return res.json({
        nudge: "Welcome to Habits & Goals! Start by adding your first habit to begin building clean, positive streaks. Small daily steps lead to life-changing results!",
      });
    }

    // Construct prompt
    const habitsDesc = habits
      .map(
         (h: any) =>
          `- ${h.name} (${h.frequency}, Current streak: ${h.streak} days)`
      )
      .join("\n");

    const prompt = `User has these habits:
${habitsDesc}

Give one short motivational nudge (max 2 sentences) to keep them going. Be specific to their habits, not generic. Keep it brief, encouraging, and clean (no markdown formatting other than plain text).`;

    const response = await generateContentWithFallback(ai, {
      model: "gemini-3.5-flash",
      contents: prompt,
    });

    res.json({ nudge: response.text });
  } catch (error: any) {
    console.error("Error in Gemini API call:", error);
    res.status(500).json({ error: error.message || "Failed to generate nudge" });
  }
});

async function startServer() {
  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
