import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';
import 'dotenv/config';

const API_KEY = process.env.VITE_GEMINI_API_KEY;

async function testImage() {
    const genAI = new GoogleGenerativeAI(API_KEY);
    // Imagen 3 model name (experimental or GA)
    const model = genAI.getGenerativeModel({ model: "imagen-3.0-generate-001" });

    const prompt = "A high-quality Korean webtoon style illustration of a person reading a news report on a holographic screen, vibrant colors, manhwa aesthetic.";

    console.log("Generating image...");
    try {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        // For images, the response might contain inlineData or parts with images
        console.log("Response received:", response);
        // Note: How to extract the image depends on the response structure for Imagen
        // If it's similar to text, it might be in parts[0].inlineData
    } catch (error) {
        console.error("Error generating image:", error);
    }
}

testImage();
