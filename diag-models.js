import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config();

const API_KEY = process.env.VITE_GEMINI_API_KEY;

async function listModels() {
    console.log('--- 사용 가능한 모델 목록 조회 시작 ---');
    try {
        // Note: The SDK doesn't directly expose a simple listModels, 
        // but we can try a basic generation with gemini-pro as a fallback test
        const genAI = new GoogleGenerativeAI(API_KEY);

        console.log('1. gemini-1.5-flash 테스트...');
        try {
            const modelFlash = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
            const resultFlash = await modelFlash.generateContent('안녕');
            console.log('✅ gemini-1.5-flash 성공');
        } catch (e) {
            console.log('❌ gemini-1.5-flash 실패:', e.message);
        }

        console.log('2. gemini-pro 테스트...');
        try {
            const modelPro = genAI.getGenerativeModel({ model: 'gemini-pro' });
            const resultPro = await modelPro.generateContent('안녕');
            console.log('✅ gemini-pro 성공');
        } catch (e) {
            console.log('❌ gemini-pro 실패:', e.message);
        }

    } catch (error) {
        console.error('❌ 전체 에러:', error.message);
    }
}

listModels();
