import { GoogleGenerativeAI } from '@google/generative-ai';

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

// Helper: Convert base64 to Blob
const base64ToBlob = (base64, mimeType) => {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: mimeType });
};

export const generateStoryboardImage = async (promptText, style, signal, retries = 3) => {
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-3-pro-image-preview" });

    let stylePrompt = "";
    if (style === 'doodle') {
        stylePrompt = "Style: Minimalist black and white stick figure drawing, funny hand-drawn doodle, simple sketch, thick lines on white background. IMPORTANT: No text.";
    } else {
        stylePrompt = "Style: Cinematic photorealistic image, high quality, 4k, detailed texture, dramatic lighting. IMPORTANT: No text.";
    }

    // Pure scene description without style instructions to prevent text generation
    const detailedPrompt = `${promptText}\n\n${stylePrompt}`;

    for (let attempt = 1; attempt <= retries; attempt++) {
        if (signal.aborted) throw new Error('Generation aborted');

        try {
            const result = await model.generateContent({
                contents: [{ role: 'user', parts: [{ text: detailedPrompt }] }],
                generationConfig: {
                    responseModalities: ['IMAGE'],
                    imageConfig: {
                        aspectRatio: "16:9",
                        imageSize: "2K"
                    }
                }
            });

            const response = result.response;

            // Extract base64 image from response
            if (response.candidates && response.candidates[0]) {
                const parts = response.candidates[0].content.parts;
                for (const part of parts) {
                    if (part.inlineData && part.inlineData.data) {
                        const base64Data = part.inlineData.data;
                        const mimeType = part.inlineData.mimeType || 'image/png';
                        const blob = base64ToBlob(base64Data, mimeType);
                        const blobUrl = URL.createObjectURL(blob);
                        return blobUrl;
                    }
                }
            }

            throw new Error('No image data in response');

        } catch (error) {
            if (signal.aborted) throw new Error('Generation aborted');
            console.error(`Image generation attempt ${attempt}/${retries} failed:`, error.message);

            if (attempt < retries) {
                // Wait before retry (exponential backoff)
                await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
            } else {
                throw error;
            }
        }
    }
};
