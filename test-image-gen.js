import axios from 'axios';
import fs from 'fs';

async function testImageGeneration() {
    console.log("🎨 이미지 생성 테스트 ('나노바나나' 스타일 적용)...");

    // 사용자가 제공한 스타일 프롬프트
    const stylePrompt = "cute hand-drawn doodle character sheet, simple round head, minimal face, black line art on white background, various cute expressions, sketch style, no shading, simple cartoon illustration";

    // 상황 묘사 (예시)
    const contentPrompt = "A happy stick figure jumping with joy";

    const fullPrompt = `${contentPrompt}, ${stylePrompt}`;
    const encodedPrompt = encodeURIComponent(fullPrompt);

    // 모델: flux (안정성 및 퀄리티 고려), nologo=true
    const url = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=512&height=512&model=flux&nologo=true&seed=${Math.floor(Math.random() * 1000)}`;

    console.log(`🔗 요청 URL: ${url}`);

    try {
        const response = await axios({
            method: 'GET',
            url: url,
            responseType: 'arraybuffer',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            },
            timeout: 30000 // 30초
        });

        console.log(`✅ 응답 상태: ${response.status}`);

        if (response.status === 200 && response.data.length > 0) {
            console.log("🎉 '나노바나나' 스타일 이미지 생성 성공!");
            fs.writeFileSync('test_nanobanana.jpg', response.data);
            console.log("💾 test_nanobanana.jpg 저장 완료.");
        }

    } catch (error) {
        console.error("❌ 이미지 요청 실패:", error.message);
        if (error.response) {
            console.error(`Status: ${error.response.status}`);
            // HTML 응답일 경우 요약
            const dataStr = error.response.data.toString().substring(0, 200);
            console.error(`Data Preview: ${dataStr}`);
        }
    }
}

testImageGeneration();
