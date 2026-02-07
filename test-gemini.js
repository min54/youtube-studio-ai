import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config();

const API_KEY = process.env.VITE_GEMINI_API_KEY;

async function testGeminiAPI() {
    console.log('--- Gemini API 연결 테스트 시작 ---');
    try {
        const genAI = new GoogleGenerativeAI(API_KEY);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

        const prompt = '유튜브 영상이 사람들에게 인기를 끄는 일반적인 이유 3가지만 짧게 알려줘.';

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        console.log('✅ 성공: Gemini API가 정상적으로 응답했습니다.');
        console.log('Gemini의 답변:\n', text);
    } catch (error) {
        console.error('❌ 실패: Gemini API 호출 중 오류가 발생했습니다.');
        console.error('오류 내용:', error.message);
    }
    console.log('--- 테스트 종료 ---');
}

testGeminiAPI();
