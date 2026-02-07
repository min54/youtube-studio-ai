import axios from 'axios';
import fs from 'fs';
import 'dotenv/config';

const ELEVENLABS_API_KEY = process.env.VITE_ELEVENLABS_API_KEY;
const VOICE_ID = 'pNInz6obpgDQGcFmaJgB'; // Adam (multilingual voice)

async function testElevenLabs() {
    if (!ELEVENLABS_API_KEY) {
        console.error('❌ VITE_ELEVENLABS_API_KEY가 .env 파일에 없습니다!');
        console.log('\n📋 설정 방법:');
        console.log('1. https://elevenlabs.io 에서 API 키 발급');
        console.log('2. .env 파일에 다음 추가:');
        console.log('   VITE_ELEVENLABS_API_KEY=your_api_key_here');
        return;
    }

    const testText = '안녕하세요. 일레븐랩스 음성 테스트입니다. 한국어 발음이 자연스러운지 확인해 주세요.';

    console.log('🎙️ ElevenLabs TTS 테스트 시작...');
    console.log('텍스트:', testText);
    console.log('Voice ID:', VOICE_ID);

    try {
        const response = await axios.post(
            `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`,
            {
                text: testText,
                model_id: 'eleven_multilingual_v2', // 한국어 지원
                voice_settings: {
                    stability: 0.5,
                    similarity_boost: 0.75,
                    style: 0.0,
                    use_speaker_boost: true
                }
            },
            {
                headers: {
                    'Accept': 'audio/mpeg',
                    'xi-api-key': ELEVENLABS_API_KEY,
                    'Content-Type': 'application/json'
                },
                responseType: 'arraybuffer'
            }
        );

        const filename = `test-elevenlabs-${Date.now()}.mp3`;
        fs.writeFileSync(filename, response.data);

        console.log('\n✅ 성공!');
        console.log(`📁 파일 저장: ${filename}`);
        console.log('🎵 이 MP3 파일을 재생하여 음성 품질을 확인하세요.');

    } catch (error) {
        console.error('\n❌ 에러 발생:');
        if (error.response) {
            console.error('상태 코드:', error.response.status);
            console.error('에러 메시지:', error.response.data);
        } else {
            console.error(error.message);
        }
    }
}

testElevenLabs();
