import { GoogleGenerativeAI } from '@google/generative-ai';
import 'dotenv/config';

const GEMINI_API_KEY = process.env.VITE_GEMINI_API_KEY;

async function debugGen() {
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    const dummyNews = {
        title: "최신 뉴스 테스트용 제목",
        description: "이것은 뉴스 테스트용 상세 설명입니다. 500자 이상의 대본 생성이 잘 되는지 확인하기 위한 데이터입니다."
    };

    const prompt = `
    [주요 뉴스 심층 브리핑 및 웹툰 삽화 요청] 
    제목: ${dummyNews.title}
    영상 설명 내용: ${dummyNews.description}
    통계: 조회수 1,000, 좋아요 100, 댓글 10

    위 뉴스 콘텐츠의 핵심을 분석하여 다음 세 가지 항목을 JSON 형식으로 작성해줘:
    1. "analysis": 이 뉴스가 현재 사회적으로 어떤 의미가 있는지 2문장으로 명확히 분석.
    2. "script": 뉴스에 담긴 '진짜 내용'을 중심으로 청중에게 직접 리포트하는 전문 뉴스 대본 (최소 500자 이상). 
       - 인사는 생략하고 본론으로 시작. 전문 뉴스 앵커 스타일.
    3. "imagePrompt": 이 뉴스 내용을 상직적으로 보여줄 수 있는 '웹툰 스타일 삽화'를 위한 영어 프롬프트.
       - "Korean Webtoon style, clean lines, vibrant colors, anime aesthetic" 포함.

    응답 형식: {"analysis": "...", "script": "...", "imagePrompt": "..."}
  `;

    console.log("--- Sending Prompt ---");
    try {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const rawText = response.text();
        console.log("--- Raw AI Response ---");
        console.log(rawText);

        console.log("--- Parsing Test ---");
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            try {
                const parsed = JSON.parse(jsonMatch[0]);
                console.log("Parsing Success!");
                console.log("Script Length:", parsed.script.length);
            } catch (e) {
                console.log("Standard JSON.parse failed. Error:", e.message);
                try {
                    // Attempt cleaning
                    const cleanedJson = jsonMatch[0].replace(/\n/g, '\\n');
                    const parsed = JSON.parse(cleanedJson);
                    console.log("Cleaning + Parse Success!");
                } catch (e2) {
                    console.log("Cleaning + Parse failed too. Error:", e2.message);
                }
            }
        } else {
            console.log("No JSON found in response.");
        }
    } catch (err) {
        console.error("API Call Error:", err);
    }
}

debugGen();
