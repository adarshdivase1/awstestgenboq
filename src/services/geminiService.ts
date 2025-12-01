import { productDatabase } from '../data/productData';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';
import { Boq, BoqItem, ProductDetails } from '../types';

const client = generateClient<Schema>();

const databaseString = JSON.stringify(productDatabase.map(p => ({ brand: p.brand, model: p.model, description: p.description, category: p.category, price: p.price })));

// Helper to call backend function
async function callGeminiBackend(prompt: string, systemInstruction?: string, responseSchema?: object) {
    // Append DB string to user prompt for context (safest approach for RAG-like behavior in simple prompts)
    // Note: In a larger system, RAG would be handled by a vector store.
    const fullPrompt = `${prompt}\n\nCustom Product Database Reference:\n${databaseString}`;

    const response = await client.queries.generateBoqContent({
        prompt: fullPrompt,
        systemInstruction: systemInstruction,
        responseSchema: responseSchema ? JSON.stringify(responseSchema) : undefined
    });

    if (response.errors) {
        throw new Error(response.errors[0].message);
    }

    if (!response.data) {
        throw new Error("No data returned from AI service");
    }
    
    // The backend returns a stringified JSON (or plain text)
    let text = response.data;
    // Cleanup markdown code blocks if present
    if (text.startsWith('```json')) {
        text = text.replace(/^```json\n/, '').replace(/\n```$/, '');
    } else if (text.startsWith('```')) {
        text = text.replace(/^```\n/, '').replace(/\n```$/, '');
    }
    
    try {
        return JSON.parse(text);
    } catch (e) {
        console.error("Failed to parse JSON response:", text);
        throw new Error("AI response was not valid JSON.");
    }
}

/**
 * Generates a Bill of Quantities (BOQ) based on user requirements via Backend.
 */
export const generateBoq = async (answers: Record<string, any>): Promise<Boq> => {
    const requiredSystems = answers.requiredSystems || ['display', 'video_conferencing', 'audio', 'connectivity_control', 'infrastructure', 'acoustics'];
    
    const categoryMap: Record<string, string[]> = {
        display: ["Display"],
        video_conferencing: ["Video Conferencing & Cameras"],
        audio: ["Audio - Microphones", "Audio - DSP & Amplification", "Audio - Speakers"],
        connectivity_control: ["Video Distribution & Switching", "Control System & Environmental"],
        infrastructure: ["Cabling & Infrastructure", "Mounts & Racks"],
        acoustics: ["Acoustic Treatment"],
    };

    const allowedCategories = requiredSystems.flatMap((system: string) => categoryMap[system] || []);
    allowedCategories.push("Accessories & Services"); 

    const brandPreferences = {
        displays: Array.isArray(answers.displayBrands) ? answers.displayBrands.join(', ') : '',
        mounts: Array.isArray(answers.mountBrands) ? answers.mountBrands.join(', ') : '',
        racks: Array.isArray(answers.rackBrands) ? answers.rackBrands.join(', ') : '',
        audio: Array.isArray(answers.audioBrands) ? answers.audioBrands.join(', ') : '',
        vc: Array.isArray(answers.vcBrands) ? answers.vcBrands.join(', ') : '',
        connectivity: Array.isArray(answers.connectivityBrands) ? answers.connectivityBrands.join(', ') : '',
        control: Array.isArray(answers.controlBrands) ? answers.controlBrands.join(', ') : '',
    };

    const requirements = Object.entries(answers)
      .map(([key, value]) => {
        if (Array.isArray(value) && value.length > 0) {
          return `${key}: ${value.join(', ')}`;
        }
        if (value) return `${key}: ${value}`;
        return null;
      })
      .filter(Boolean)
      .join('; ');

    const systemInstruction = `You are a world-class, Senior AV Solutions Architect (CTS-D Certified). 
Your goal is to generate a **100% production-ready, logically flawless Bill of Quantities (BOQ)** that adheres strictly to AVIXA standards and User Brand Requests.

**CRITICAL RULES:**
1.  **BRAND LOCK:** Strictly adhere to the brand constraints listed in the prompt.
2.  **LOGICAL SIGNAL FLOW:** Ensure every source has a destination, every display has a mount, and cabling is included.
3.  **DATABASE PRIORITY:** Use the provided Custom Product Database whenever possible.
4.  **JUSTIFICATION:** Populate 'keyRemarks' with reasons for selection.
`;

    const prompt = `CLIENT CONFIGURATION: "${requirements}"

MANDATORY BRAND COMPLIANCE (ZERO TOLERANCE):
*   Displays: ${brandPreferences.displays || 'Professional defaults'}
*   Mounts: ${brandPreferences.mounts || 'Professional defaults'}
*   Racks: ${brandPreferences.racks || 'Professional defaults'}
*   Audio: ${brandPreferences.audio || 'Professional defaults'}
*   VC: ${brandPreferences.vc || 'Professional defaults'}
*   Control: ${brandPreferences.control || 'Professional defaults'}

Scope Limit: Generate items ONLY for these categories: ${allowedCategories.join(', ')}.
`;

    // Response schema matching the Type used in frontend, passed to backend
    const responseSchema = {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            category: { type: "STRING" },
            itemDescription: { type: "STRING" },
            keyRemarks: { type: "STRING" },
            brand: { type: "STRING" },
            model: { type: "STRING" },
            quantity: { type: "NUMBER" },
            unitPrice: { type: "NUMBER" },
            totalPrice: { type: "NUMBER" },
            source: { type: "STRING", enum: ['database', 'web'] },
            priceSource: { type: "STRING", enum: ['database', 'estimated'] },
          },
          required: ['category', 'itemDescription', 'keyRemarks', 'brand', 'model', 'quantity', 'unitPrice', 'totalPrice', 'source', 'priceSource'],
        },
    };

    const result = await callGeminiBackend(prompt, systemInstruction, responseSchema);
    
    return result.map((item: BoqItem) => ({
        ...item,
        totalPrice: item.quantity * item.unitPrice
    }));
};

/**
 * Refines an existing BOQ based on a user-provided prompt.
 */
export const refineBoq = async (currentBoq: Boq, refinementPrompt: string): Promise<Boq> => {
    const systemInstruction = "You are an expert AV System Engineer. Refine the BOQ based on the user's specific request while maintaining system integrity.";
    const prompt = `Refine this BOQ: ${JSON.stringify(currentBoq)}. \n\nUser Request: "${refinementPrompt}". \n\nReturn the updated JSON array.`;
    
    const responseSchema = {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            category: { type: "STRING" },
            itemDescription: { type: "STRING" },
            keyRemarks: { type: "STRING" },
            brand: { type: "STRING" },
            model: { type: "STRING" },
            quantity: { type: "NUMBER" },
            unitPrice: { type: "NUMBER" },
            totalPrice: { type: "NUMBER" },
            source: { type: "STRING", enum: ['database', 'web'] },
            priceSource: { type: "STRING", enum: ['database', 'estimated'] },
          },
          required: ['category', 'itemDescription', 'keyRemarks', 'brand', 'model', 'quantity', 'unitPrice', 'totalPrice', 'source', 'priceSource'],
        },
    };

    const result = await callGeminiBackend(prompt, systemInstruction, responseSchema);
    return result.map((item: BoqItem) => ({
        ...item,
        totalPrice: item.quantity * item.unitPrice
    }));
};

/**
 * Validates a BOQ.
 */
export const validateBoq = async (boq: Boq, requirements: string): Promise<any> => {
    const systemInstruction = "You are an expert AV system design auditor (CTS-D). Analyze the BOQ for signal flow gaps, missing mounts, and brand compliance violations.";
    const prompt = `Audit this BOQ: ${JSON.stringify(boq)}. \n\nOriginal Requirements: "${requirements}". \n\nReturn JSON validation result.`;
    
    const responseSchema = {
        type: "OBJECT",
        properties: {
            isValid: { type: "BOOLEAN" },
            warnings: { type: "ARRAY", items: { type: "STRING" } },
            suggestions: { type: "ARRAY", items: { type: "STRING" } },
            missingComponents: { type: "ARRAY", items: { type: "STRING" } },
        },
        required: ['isValid', 'warnings', 'suggestions', 'missingComponents'],
    };

    return await callGeminiBackend(prompt, systemInstruction, responseSchema);
};

export const fetchProductDetails = async (productName: string): Promise<ProductDetails> => {
    const prompt = `Provide a technical description for: "${productName}". Start with description. End with "IMAGE_URL: [url]" if you know one.`;
    // We reuse the generic generation query without schema for freeform text
    const client = generateClient<Schema>();
    const response = await client.queries.generateBoqContent({
        prompt: prompt,
        systemInstruction: "You are a helpful product research assistant.",
        responseSchema: undefined
    });
    
    const responseText = response.data || "";
    
    let description = responseText;
    let imageUrl = '';

    const imageUrlMatch = responseText.match(/\nIMAGE_URL:\s*(.*)/);
    if (imageUrlMatch && imageUrlMatch[1]) {
        imageUrl = imageUrlMatch[1].trim();
        description = responseText.substring(0, imageUrlMatch.index).trim();
    }

    return {
        description,
        imageUrl,
        sources: [],
    };
};