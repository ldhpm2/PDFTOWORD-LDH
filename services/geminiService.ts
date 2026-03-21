import { GoogleGenAI, Type } from "@google/genai";
import { GeminiContentBlock, ContentType } from "../types";

const MODEL_NAME = 'gemini-3-flash-preview';

export const validateApiKey = async (apiKey: string): Promise<boolean> => {
  if (!apiKey || apiKey.trim().length < 10) {
    throw new Error("API Key quá ngắn hoặc không hợp lệ.");
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    // Simple test call
    await ai.models.generateContent({
      model: MODEL_NAME,
      contents: "Test connection",
      config: { maxOutputTokens: 1 }
    });
    return true;
  } catch (error: any) {
    console.error("API Key Validation Error:", error);
    if (error.message?.includes('API_KEY_INVALID') || error.message?.includes('invalid')) {
      throw new Error("API Key không hợp lệ. Vui lòng kiểm tra lại.");
    }
    throw new Error("Không thể xác thực API Key. Vui lòng kiểm tra kết nối mạng.");
  }
};

export const analyzePageContent = async (
  base64Image: string,
  apiKey?: string
): Promise<GeminiContentBlock[]> => {
  try {
    // Initialize Gemini Client inside the function to ensure the latest key is used
    const effectiveApiKey = apiKey || process.env.API_KEY;
    if (!effectiveApiKey) {
      throw new Error("Missing API Key. Please provide a valid Gemini API Key.");
    }
    const ai = new GoogleGenAI({ apiKey: effectiveApiKey });

    // Remove header if present
    const cleanBase64 = base64Image.replace(/^data:image\/(png|jpeg|jpg);base64,/, "");

    const prompt = `
      Analyze this document page image (which may contain Vietnamese text and math problems).
      
      **GOAL**: Reconstruct the document content as a linear sequence of blocks for export to Word.

      **CRITICAL RULES FOR IMAGES (DRAWINGS/FIGURES)**:
      1. **DETECTION**: Identify ALL geometry figures, function graphs, electrical circuit diagrams, or physics illustrations.
      2. **BOUNDING BOX (CRITICAL)**: 
         - Draw the bounding box **GENEROUSLY**. 
         - **MUST INCLUDE** all labels (A, B, C, x, y), axis numbers, captions, and legend text associated with the figure.
         - It is better to include a bit of whitespace around the diagram than to cut off a label.
         - Provide precise 'box_2d' coordinates [ymin, xmin, ymax, xmax] (0-1000 scale).
      3. **PLACEMENT**: You must output an 'image' block **EXACTLY** where it appears in the logical reading order.
         - Typically: Question Text -> Image -> Options.
      4. **EXCLUSION**: Do NOT OCR text labels *inside* the diagram. Let them remain part of the image block.

      **RULES FOR TEXT & MATH**:
      1. Extract all text that is NOT part of a diagram.
      2. **MATH**: Convert ALL mathematical formulas to **LaTeX**. 
         - Inline: $E=mc^2$
         - Block: $$ \int_{0}^{\infty} x dx $$
      3. **OPTIONS**: For multiple-choice questions, **ALWAYS** put each option (A., B., C., D.) on a **NEW LINE**.
         - Incorrect: "A. 5 cm  B. 10 cm"
         - Correct:
           "A. 5 cm"
           "B. 10 cm"

      Return a JSON object with a 'blocks' array.
    `;

    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: {
        parts: [
          { text: prompt },
          {
            inlineData: {
              mimeType: 'image/png',
              data: cleanBase64
            }
          }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            blocks: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  type: { type: Type.STRING, enum: [ContentType.TEXT, ContentType.IMAGE] },
                  content: { type: Type.STRING },
                  box_2d: { 
                    type: Type.ARRAY,
                    items: { type: Type.INTEGER }
                  }
                }
              }
            }
          }
        }
      }
    });

    if (!response.text) {
      throw new Error("Gemini returned an empty response. This might be due to safety filters or an invalid image.");
    }

    const json = JSON.parse(response.text);
    return json.blocks || [];

  } catch (error: any) {
    console.error("Gemini Error:", error);
    // Re-throw the error so the UI can catch it and show a specific message
    throw error;
  }
};
