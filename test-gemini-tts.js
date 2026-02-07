import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';
import 'dotenv/config';

const GEMINI_API_KEY = process.env.VITE_GEMINI_API_KEY;

async function testGeminiTTS() {
    if (!GEMINI_API_KEY) {
        console.error('❌ VITE_GEMINI_API_KEY가 .env 파일에 없습니다!');
        return;
    }

    const testText = '안녕하세요. 제미나이 음성 테스트입니다. 한국어 발음이 자연스러운지 확인해 주세요.';

    console.log('🎙️ Gemini TTS 테스트 시작...');
    console.log('텍스트:', testText);
    console.log('모델: gemini-2.5-flash-preview-tts');
    console.log('음성: Kore (Korean support)');

    try {
        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-preview-tts' });

        const result = await model.generateContent({
            contents: [{ parts: [{ text: testText }] }],
            generationConfig: {
                responseModalities: ['AUDIO'],
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: { voiceName: 'Kore' }
                    }
                }
            }
        });

        // Extract base64 audio data
        const audioData = result.response.candidates[0].content.parts[0].inlineData.data;
        const audioBuffer = Buffer.from(audioData, 'base64');

        const filename = `test-gemini-tts-${Date.now()}.wav`;
        fs.writeFileSync(filename, audioBuffer);

        console.log('\n✅ 성공!');
        console.log(`📁 파일 저장: ${filename}`);
        console.log(`📊 파일 크기: ${audioBuffer.length} bytes`);
        console.log('🎵 이 WAV 파일을 재생하여 음성 품질을 확인하세요.');

    } catch (error) {
        console.error('\n❌ 에러 발생:');
        if (error.response) {
            console.error('상태:', error.response.status);
            console.error('메시지:', error.response.data);
        } else {
            console.error(error.message);
        }
    }
}

testGeminiTTS();
