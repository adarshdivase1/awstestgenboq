import { type Schema } from '../../data/resource';
import { GoogleGenAI } from '@google/genai';

// Simple in-memory rate limiting map (For strict global limiting, use DynamoDB)
const rateLimitMap = new Map<string, number>();
const RATE_LIMIT_WINDOW = 5000; // 5 seconds between requests

export const handler: Schema["generateBoqContent"]["functionHandler"] = async (event, context) => {
  const { prompt, systemInstruction, responseSchema } = event.arguments;
  
  // 1. Rate Limiting Check
  // We use the Identity ID (user ID) to rate limit
  const userId = event.identity?.sub || 'unknown';
  const lastCall = rateLimitMap.get(userId);
  const now = Date.now();

  if (lastCall && (now - lastCall < RATE_LIMIT_WINDOW)) {
    throw new Error(`Rate limit exceeded. Please wait ${Math.ceil((RATE_LIMIT_WINDOW - (now - lastCall)) / 1000)} seconds.`);
  }
  rateLimitMap.set(userId, now);

  // 2. Setup Gemini
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Server configuration error: API Key missing.");
  }

  const ai = new GoogleGenAI({ apiKey });

  try {
    // Parse the schema string back to object if provided
    let config: any = {
        responseMimeType: "application/json",
        temperature: 0.1
    };

    if (responseSchema) {
        config.responseSchema = JSON.parse(responseSchema);
    }
    if (systemInstruction) {
        config.systemInstruction = systemInstruction;
    }

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-pro',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: config
    });

    return response.text || "[]";

  } catch (error) {
    console.error("Gemini API Error:", error);
    throw new Error("Failed to generate content from AI provider.");
  }
};