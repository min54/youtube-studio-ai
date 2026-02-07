import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';
import 'dotenv/config';

const API_KEY = process.env.VITE_GEMINI_API_KEY;

async function testNanoBanana() {
    const genAI = new GoogleGenerativeAI(API_KEY);

    // Use Nano Banana Pro (gemini-3-pro-image-preview) for high quality
    const model = genAI.getGenerativeModel({
        model: "gemini-3-pro-image-preview"
    });

    const prompt = `A cute hand-drawn doodle style illustration: A person reading a news report on a tablet, 
    simple round head, minimal face features, black line art on white background, rough sketch style, 
    no shading, simple cartoon illustration, storyboard sketch aesthetic.`;

    console.log("Testing Nano Banana Pro...");
    console.log("Prompt:", prompt);

    try {
        const result = await model.generateContent({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
                responseModalities: ['IMAGE'],
                imageConfig: {
                    aspectRatio: "16:9",
                    imageSize: "2K"
                }
            }
        });

        const response = result.response;
        console.log("\n✅ SUCCESS! Nano Banana Pro is working!");
        console.log("Response structure:", JSON.stringify(response, null, 2));

        // Try to extract image data
        if (response.candidates && response.candidates[0]) {
            const parts = response.candidates[0].content.parts;
            console.log("\nParts received:", parts.length);

            // Look for inline image data
            parts.forEach((part, idx) => {
                if (part.inlineData) {
                    console.log(`Part ${idx}: Image data found (${part.inlineData.mimeType})`);
                    const base64Data = part.inlineData.data;
                    const buffer = Buffer.from(base64Data, 'base64');
                    const filename = `test-nano-banana-${Date.now()}.png`;
                    fs.writeFileSync(filename, buffer);
                    console.log(`✅ Image saved to: ${filename}`);
                }
            });
        }

    } catch (error) {
        console.error("❌ Error:", error.message);
        console.error("Status:", error.status);
        console.error("Details:", error.errorDetails);
    }
}

testNanoBanana();
