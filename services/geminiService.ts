
import { GoogleGenAI, Type } from '@google/genai';
import type { Boq, BoqItem, ProductDetails, Room, ValidationResult, GroundingSource } from '../types';
import { productDatabase } from '../data/productData';

if (!process.env.API_KEY) {
  throw new Error("API_KEY environment variable is not set");
}

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const databaseString = JSON.stringify(productDatabase.map(p => ({ brand: p.brand, model: p.model, description: p.description, category: p.category, price: p.price })));


/**
 * Generates a Bill of Quantities (BOQ) based on user requirements.
 */
export const generateBoq = async (answers: Record<string, any>): Promise<Boq> => {
    const model = 'gemini-2.5-pro';

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
    allowedCategories.push("Accessories & Services"); // Always include this category

    // --- Extract Specific Brand Preferences for Strict Enforcement ---
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
        if (value) {
            return `${key}: ${value}`;
        }
        return null;
      })
      .filter(Boolean)
      .join('; ');

    const prompt = `You are a world-class, Senior AV Solutions Architect (CTS-D Certified) with 20 years of experience. Your goal is to generate a **100% production-ready, logically flawless Bill of Quantities (BOQ)** that adheres strictly to AVIXA standards and User Brand Requests.

**CUSTOM PRODUCT DATABASE (Priority Source):**
A JSON list of available products is provided. Check this first.

**CLIENT CONFIGURATION:** "${requirements}"

**MANDATORY BRAND COMPLIANCE (ZERO TOLERANCE):**
You must strictly adhere to the following brand constraints.
*   **Display Mounts:** ${brandPreferences.mounts || 'Use Professional defaults (e.g., Chief, Peerless-AV, B-Tech)'}
*   **Racks:** ${brandPreferences.racks || 'Use Professional defaults (e.g., Middle Atlantic, Valrack)'}
*   **Displays:** ${brandPreferences.displays || 'Use Professional defaults (e.g., Samsung, LG, Sony)'}
*   **Audio:** ${brandPreferences.audio || 'Use Professional defaults (e.g., Shure, QSC, Biamp)'}
*   **Video Conferencing:** ${brandPreferences.vc || 'Use Professional defaults'}
*   **Control:** ${brandPreferences.control || 'Use Professional defaults'}

**CRITICAL RULES:**
1.  **BRAND LOCK:** If the user specified "Chief" for Mounts, you **MUST ONLY** generate Chief mounts. Do **NOT** substitute with B-Tech, Lumi, or others.
    *   *Incorrect:* User wants Chief -> BOQ has B-Tech. (FAILURE)
    *   *Correct:* User wants Chief -> BOQ has Chief. (PASS)

2.  **LOGICAL SIGNAL FLOW (AVIXA STANDARD):**
    *   Every Display needs a Mount and Power.
    *   Every Source needs a Cable connecting it to the Sink/Switcher.
    *   Calculate cable lengths: (Room Length + Room Width) * 1.2 (Service Loop/Vertical Run).
    *   If "AV over IP" is used, include a Managed Network Switch (Netgear/Cisco) and CAT6A cabling.
    *   If "Video Conferencing" is used, ensure both Audio Input (Mics) and Output (Speakers) are accounted for.

3.  **DATABASE PRIORITY & PRICING:**
    *   **Priority 1 (DB Match):** Always prefer an item from the Custom Product Database if it matches the function and brand.
    *   **Missing DB Price:** If a database item is selected but has a price of 0 or null, use Source: 'database' but set PriceSource: 'estimated' and provide a realistic estimated market price. **DO NOT** skip a database item just because it lacks a price.
    *   **Priority 2 (Web Fallback with Brand Lock):** If the requested Brand (e.g., QSC) is NOT in the database for the required function, you **MUST** generate a valid model from that specific brand using your knowledge (Source: 'web', PriceSource: 'estimated'). **DO NOT** substitute with a different brand if a specific one was requested.

4.  **JUSTIFICATION:**
    *   For each item, populate the 'keyRemarks' field with the top 3 reasons why this specific item was selected, its key benefits, and why it is the best choice for this specific room configuration. Format this as a single string (e.g., "1. Best in class quality. 2. Seamless integration. 3. Cost effective.").

**STRICT OUTPUT ORDERING (SYSTEM FLOW):**
The returned JSON array MUST be sorted in this exact logical order to simulate the signal flow:
1.  **Visual Systems:** (Display -> Mount for that display -> Power/Video Cables for that display)
2.  **Conferencing:** (Codec/Bar -> Camera -> Mic -> Licenses)
3.  **Audio Systems:** (Microphones -> DSP -> Amps -> Speakers -> Speaker Cabling)
4.  **Connectivity & Distribution:** (Switchers -> Transmitters/Receivers -> Plates -> Patch Cables)
5.  **Infrastructure:** (Racks -> Power Distribution -> Rack Accessories -> General Cabling)
6.  **Control & Environment:** (Processor -> Touch Panel -> Acoustic Treatment)

**Scope Limit:**
Generate items ONLY for these categories: ${allowedCategories.join(', ')}.

**OUTPUT FORMAT:**
Return ONLY a JSON array of objects.
- itemDescription: Detailed technical description (e.g., "Chief XTM1U X-Large Fusion Micro-Adjustable Tilt Wall Mount").
- keyRemarks: Top 3 reasons for selection and benefits.
- brand: (MUST match Mandatory Brand Compliance).
- model: string.
- quantity: number.
- unitPrice: number (Realistic USD MSRP).
- category: (One of: "Display", "Video Conferencing & Cameras", "Audio - Microphones", "Audio - DSP & Amplification", "Audio - Speakers", "Video Distribution & Switching", "Control System & Environmental", "Cabling & Infrastructure", "Mounts & Racks", "Acoustic Treatment", "Accessories & Services").
- source: 'database' | 'web'.
- priceSource: 'database' | 'estimated'.
    `;

    const responseSchema = {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            category: { type: Type.STRING },
            itemDescription: { type: Type.STRING },
            keyRemarks: { type: Type.STRING },
            brand: { type: Type.STRING },
            model: { type: Type.STRING },
            quantity: { type: Type.NUMBER },
            unitPrice: { type: Type.NUMBER },
            totalPrice: { type: Type.NUMBER },
            source: { type: Type.STRING, enum: ['database', 'web'] },
            priceSource: { type: Type.STRING, enum: ['database', 'estimated'] },
          },
          required: ['category', 'itemDescription', 'keyRemarks', 'brand', 'model', 'quantity', 'unitPrice', 'totalPrice', 'source', 'priceSource'],
        },
    };

    try {
        const response = await ai.models.generateContent({
            model: model,
            contents: [{ 
                role: 'user', 
                parts: [
                    { text: prompt },
                    { text: `Custom Product Database: ${databaseString}` }
                ]
            }],
            config: {
                responseMimeType: "application/json",
                responseSchema: responseSchema,
                temperature: 0.1, // Lower temperature for strict adherence
            },
        });

        const jsonText = response.text.trim();
        const boq: BoqItem[] = JSON.parse(jsonText);
        
        return boq.map((item: BoqItem) => ({
            ...item,
            totalPrice: item.quantity * item.unitPrice
        }));

    } catch (error) {
        console.error('Error generating BOQ:', error);
        throw error;
    }
};

/**
 * Refines an existing BOQ based on a user-provided prompt.
 */
export const refineBoq = async (currentBoq: Boq, refinementPrompt: string): Promise<Boq> => {
    const model = 'gemini-2.5-pro';
    const prompt = `Refine the following Bill of Quantities (BOQ) based on the user's request.

    Current BOQ (JSON):
    ${JSON.stringify(currentBoq, null, 2)}

    User Request: "${refinementPrompt}"

    **INSTRUCTIONS:**
    1.  **User Authority:** The User Request overrides all previous logic. If they ask for a specific brand, model, or change, execute it exactly.
    2.  **Database Check:** When adding/swapping items, check the Custom Product Database first.
    3.  **Priorities:**
        *   **Priority 1:** Database item matches functionality. If price is missing, use item and set PriceSource to 'estimated'.
        *   **Priority 2:** If not in DB, search web but STRICTLY follow any requested Brand.
    4.  **Technical Consistency:** Ensure the system remains functional.
    5.  **Field Requirement:** Ensure 'source', 'priceSource' are populated correctly.
    6.  **Key Remarks:** For any NEW or MODIFIED items, provide a 'keyRemarks' string explaining the top 3 reasons for the selection/change and its benefits.
    
    Return the complete, updated JSON array. Preserve the logical order of items where possible.
    `;
    
    const responseSchema = {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            category: { type: Type.STRING },
            itemDescription: { type: Type.STRING },
            keyRemarks: { type: Type.STRING },
            brand: { type: Type.STRING },
            model: { type: Type.STRING },
            quantity: { type: Type.NUMBER },
            unitPrice: { type: Type.NUMBER },
            totalPrice: { type: Type.NUMBER },
            source: { type: Type.STRING, enum: ['database', 'web'] },
            priceSource: { type: Type.STRING, enum: ['database', 'estimated'] },
          },
          required: ['category', 'itemDescription', 'keyRemarks', 'brand', 'model', 'quantity', 'unitPrice', 'totalPrice', 'source', 'priceSource'],
        },
    };

    try {
        const response = await ai.models.generateContent({
            model: model,
            contents: [{ 
                role: 'user', 
                parts: [
                    { text: prompt },
                    { text: `Custom Product Database: ${databaseString}` }
                ]
            }],
            config: {
                responseMimeType: "application/json",
                responseSchema: responseSchema,
            },
        });

        const jsonText = response.text.trim();
        const boq = JSON.parse(jsonText);
        
        return boq.map((item: BoqItem) => ({
            ...item,
            totalPrice: item.quantity * item.unitPrice
        }));
    } catch (error) {
        console.error('Error refining BOQ:', error);
        throw error;
    }
};

/**
 * Validates a BOQ against requirements and best practices.
 */
export const validateBoq = async (boq: Boq, requirements: string): Promise<ValidationResult> => {
    const model = 'gemini-2.5-pro';
    const prompt = `You are an expert AV system design auditor (CTS-D). Analyze the provided Bill of Quantities (BOQ) against the user's requirements.

    User Requirements: "${requirements}"

    Current BOQ (JSON):
    ${JSON.stringify(boq, null, 2)}

    **STRICT BRAND AUDIT:**
    - Check if the user requested specific brands in the requirements (look for 'mountBrands', 'displayBrands', etc.).
    - **Verify:** Did the BOQ actually use those brands?
    - **FAIL:** If user asked for "Chief" mounts but BOQ has "B-Tech", this is a BRAND COMPLIANCE FAILURE. Flag it immediately in warnings.

    **SYSTEM AUDIT:**
    1.  **Signal Flow:** Are there breaks in the signal chain? (e.g., Source -> missing cable -> Display).
    2.  **Mounting:** Does every display/projector/camera have a mount?
    3.  **Ecosystem:** Are components compatible?
    4.  **Infrastructure:** Are racks, power, and network switches included where necessary?

    Provide your findings in a structured JSON format.
    - isValid: boolean (False if any critical Brand Compliance or Signal Flow issues exist).
    - warnings: string[] (List of failures).
    - suggestions: string[] (Recommendations).
    - missingComponents: string[] (Specific missing items).
    `;

    const responseSchema = {
        type: Type.OBJECT,
        properties: {
            isValid: { type: Type.BOOLEAN },
            warnings: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
            },
            suggestions: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
            },
            missingComponents: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
            },
        },
        required: ['isValid', 'warnings', 'suggestions', 'missingComponents'],
    };

    try {
        const response = await ai.models.generateContent({
            model: model,
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: responseSchema,
            },
        });

        const jsonText = response.text.trim();
        return JSON.parse(jsonText);

    } catch (error) {
        console.error('Error validating BOQ:', error);
        return {
            isValid: false,
            warnings: ['AI validation failed to run. Please check the BOQ manually.'],
            suggestions: [],
            missingComponents: [],
        };
    }
};

/**
 * Fetches product details using Google Search grounding.
 */
export const fetchProductDetails = async (productName: string): Promise<ProductDetails> => {
    const model = 'gemini-2.5-flash';
    const prompt = `Give me a one-paragraph technical and functional overview for the product: "${productName}". The description should be suitable for a customer proposal.
    After the description, on a new line, write "IMAGE_URL:" followed by a direct URL to a high-quality, front-facing image of the product if you can find one.
    `;
    try {
        const response = await ai.models.generateContent({
            model: model,
            contents: prompt,
            config: {
                tools: [{ googleSearch: {} }],
            },
        });

        const text = response.text;
        let description = text;
        let imageUrl = '';

        const imageUrlMatch = text.match(/\nIMAGE_URL:\s*(.*)/);
        if (imageUrlMatch && imageUrlMatch[1]) {
            imageUrl = imageUrlMatch[1].trim();
            description = text.substring(0, imageUrlMatch.index).trim();
        }

        const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
        
        const sources: GroundingSource[] = groundingChunks
            ?.filter((chunk): chunk is { web: { uri: string; title: string } } => !!chunk.web)
            .map(chunk => ({ web: chunk.web! })) || [];

        return {
            description,
            imageUrl,
            sources,
        };
    } catch (error) {
        console.error(`Error fetching product details for "${productName}":`, error);
        throw new Error(`Failed to fetch product details for "${productName}".`);
    }
};
