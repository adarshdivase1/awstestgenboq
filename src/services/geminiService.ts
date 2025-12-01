
import { productDatabase } from '../data/productData';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';
import { Boq, BoqItem, ProductDetails } from '../types';

const client = generateClient<Schema>();

const databaseString = JSON.stringify(productDatabase.map(p => ({ brand: p.brand, model: p.model, description: p.description, category: p.category, price: p.price })));

// Helper to call backend function
async function callGeminiBackend(prompt: string, responseSchema?: object) {
    const fullPrompt = `${prompt}\n\nCustom Product Database: ${databaseString}`;

    const response = await client.queries.generateBoqContent({
        prompt: fullPrompt,
        responseSchema: responseSchema ? JSON.stringify(responseSchema) : undefined
    });

    if (!response.data) {
        throw new Error("No data returned from AI service");
    }
    
    // The backend returns a stringified JSON
    let text = response.data;
    if (text.startsWith('```json')) {
        text = text.replace(/^```json\n/, '').replace(/\n```$/, '');
    }
    
    return JSON.parse(text);
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

    const prompt = `You are a world-class, Senior AV Solutions Architect (CTS-D Certified). Generate a BOQ.
    
    CLIENT CONFIGURATION: "${requirements}"

    MANDATORY BRAND COMPLIANCE:
    * Displays: ${brandPreferences.displays}
    * Mounts: ${brandPreferences.mounts}
    * Racks: ${brandPreferences.racks}
    * Audio: ${brandPreferences.audio}
    * VC: ${brandPreferences.vc}
    * Control: ${brandPreferences.control}

    Generate items ONLY for these categories: ${allowedCategories.join(', ')}.
    Return a JSON array of objects with keys: category, itemDescription, keyRemarks, brand, model, quantity, unitPrice, totalPrice, source ('database'|'web'), priceSource ('database'|'estimated').
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

    const result = await callGeminiBackend(prompt, responseSchema);
    
    return result.map((item: BoqItem) => ({
        ...item,
        totalPrice: item.quantity * item.unitPrice
    }));
};

/**
 * Refines an existing BOQ based on a user-provided prompt.
 */
export const refineBoq = async (currentBoq: Boq, refinementPrompt: string): Promise<Boq> => {
    const prompt = `Refine this BOQ: ${JSON.stringify(currentBoq)}. User Request: "${refinementPrompt}". Return the updated JSON array.`;
    
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

    const result = await callGeminiBackend(prompt, responseSchema);
    return result.map((item: BoqItem) => ({
        ...item,
        totalPrice: item.quantity * item.unitPrice
    }));
};

/**
 * Validates a BOQ.
 */
export const validateBoq = async (boq: Boq, requirements: string): Promise<any> => {
    const prompt = `Audit this BOQ: ${JSON.stringify(boq)}. Requirements: "${requirements}". Return JSON validation result.`;
    
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

    return await callGeminiBackend(prompt, responseSchema);
};

// Note: Using simple generation for product details to avoid complex tool chaining in the initial backend setup.
export const fetchProductDetails = async (productName: string): Promise<ProductDetails> => {
    const prompt = `Provide a technical description for: "${productName}". Start with description. End with "IMAGE_URL: [url]" if you know one.`;
    // We reuse the generic generation query without schema for freeform text
    const response = await client.queries.generateBoqContent({
        prompt: prompt,
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
