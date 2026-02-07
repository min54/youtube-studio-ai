import { GoogleGenerativeAI } from '@google/generative-ai';

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

export const analyzeVideoContent = async (video, searchTerm) => {
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    const viewCount = video.stats.viewCount;
    const likeCount = video.stats.likeCount;
    const commentCount = video.stats.commentCount;

    const prompt = `
    제목: ${video.title}
    영상 설명 내용: ${video.description.substring(0, 3000)}
    통계: 조회수 ${viewCount}, 좋아요 ${likeCount}, 댓글 ${commentCount}

    위 영상 콘텐츠의 핵심을 분석하여 다음 항목들을 JSON 형식으로 작성해줘.
    
    **중요 지침**: 
    - 만약 영상 설명이나 제목만으로 내용을 유추하기 어렵거나 분석할 내용이 없다면,
      "analysis"에는 "분석할 내용이 없습니다."라고 적고,
      "script"에는 "내용 없음"이라고 적어줘. 없는 내용을 지어내지 마.

    1. "analysis": 이 영상이 어떤 의미가 있는지 2문장으로 명확히 분석. (내용 없으면 "분석할 내용이 없습니다.")
    2. "script": 
       - [지시사항] 당신은 **전문 아나운서**입니다. 영상 설명에 포함된 **구체적인 수치(금액, 항목, 결과값 등)**를 절대로 빠뜨리지 말고, 시청자에게 사실을 전달하는 **뉴스 리포팅 원고**를 작성해 주세요.
       - [핵심 요구사항]
         - **추측성 표현 절대 금지**: "~한 것으로 보입니다", "~할 예정입니다", "~다루고 있습니다", "전하고 있습니다", "소개합니다" 같은 제3자적 표현을 쓰지 마세요.
         - **확정형 리포팅**: "식장은 500만 원, 드레스는 200만 원으로 확인되었습니다"와 같이 **영상 속 정보를 본인이 직접 발표하는 것처럼** 작성하세요.
         - **데이터 보존**: 설명글에 적힌 구체적인 비용과 항목을 하나도 누락하지 말고 모두 대본에 녹여내세요.
         - **특정 매체, 통신사 및 인물 언급 금지**: SBS, MBC, KBS, CNN, BBC, 연합뉴스, 뉴스1 등 특정 방송사, 언론 매체, 통신사의 이름, 그리고 기자의 이름이나 특정 인물의 성함을 대본에 절대 포함하지 마세요.
         - 번호(1., 2. 등) 매기기는 절대 하지 마세요.
         - 말투: 신뢰감 있고 정중한 해요체(~해요, ~입니다).
         - 구조: 핵심 정보 전달 -> 세부 항목 리포팅 -> 요약 및 마무리.
         - 분량: 공백 포함 약 800자 정도. 줄바꿈(\n)은 호흡이 바뀌는 적절한 곳에만 넣어 가독성을 높여주세요.
    3. "imagePrompts": 위 대본의 내용 흐름에 따라 순서대로 매칭되는 10개의 **영어 프롬프트** 배열.
       - **중요**: 각 프롬프트는 해당 대본 구간의 내용을 시각적으로 묘사하는 **상황 설명**만 적을 것.
       - 스타일(흑백, 라인아트 등)에 대한 설명은 절대 포함하지 말 것.
       - **주의**: 이미지 내에 말풍선(speech bubbles)이나 텍스트를 절대 포함하지 말 것.

    응답 형식: {"analysis": "...", "script": "...", "imagePrompts": ["scene description 1", "scene description 2", ...]}
  `;

    try {
        console.log("Starting analysis for:", video.title);
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const rawText = response.text();
        console.log("AI Raw Response received:", rawText.substring(0, 100) + "...");

        let aiData = {};

        // 정규표현식으로 JSON 블록 추출 시도
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            let jsonString = jsonMatch[0];
            try {
                aiData = JSON.parse(jsonString);
            } catch (pErr) {
                console.warn("First JSON parse failed, attempting cleanup...");
                try {
                    // 제어 문자 제거 및 줄바꿈 보존 처리
                    const cleanedJson = jsonString
                        .replace(/[\u0000-\u001F\u007F-\u009F]/g, "")
                        .replace(/\\n/g, "\\\\n") // 이미 탈출된 줄바꿈 보존
                        .replace(/\n/g, "\\n");    // 실제 줄바꿈을 탈출 문자로 변경
                    aiData = JSON.parse(cleanedJson);
                } catch (e) {
                    console.error('Final JSON parse failed', e);
                    // 파싱 완전 실패 시 대략적인 복구 시도 (정말 필요한 경우만)
                }
            }
        } else {
            console.error("No JSON found in AI response");
        }

        return {
            analysis: aiData.analysis || '분석할 내용이 없거나 실패했습니다.',
            script: aiData.script || '대본 생성 실패: AI 응답 형식이 올바르지 않습니다.',
            imagePrompts: aiData.imagePrompts || Array(10).fill('scenic background'),
        };
    } catch (error) {
        console.error("Gemini API Error:", error);
        throw error;
    }
};
