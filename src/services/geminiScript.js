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
        - [지시사항] 당신은 **전문 아나운서**입니다. 영상 내용을 분석한 뒤, 마치 본인이 직접 취재하고 공부한 내용을 시청자에게 들려주듯 자연스러운 **스토리텔링 뉴스 원고**를 작성해 주세요.
        - [핵심 요구사항]
          - **도입부 머릿말 및 인사 제거**: "오늘의 주요 내용입니다", "안녕하세요", "지금부터 살펴보겠습니다" 같은 불필요한 서두를 **절대** 쓰지 마세요. 뜸을 들이지 말고 바로 첫 번째 팩트나 사건부터 이야기를 시작하세요.
          - **영상 메타데이터 언급 금지**: "이 영상은 ~를 다룹니다", "~분 ~초부터는 ~가 나옵니다" 같이 **영상을 분석하고 있다는 느낌을 주는 표현을 절대 쓰지 마세요.** 영상 속 타임스탬프 정보를 대본에 포함하지 마세요.
          - **확정형 리포팅 & 스토리텔링**: "영상에서 장제스의 북벌을 설명합니다"가 아니라, **"장제스의 북벌은 당시 중국의 운명을 가를 중대한 전환점이었습니다"**와 같이 사건 자체를 직접 전달하는 방식으로 작성하세요.
          - **데이터 활용**: 영상 설명에 포함된 구체적인 수치(금액, 연도, 수량 등)를 자연스럽게 문맥에 녹여내세요.
          - **이미지 매칭 마커**: 대본의 시작부터 끝까지 흐름에 맞춰 [1]부터 [10]까지의 숫자 마커를 문장 사이에 자연스럽게 기입해 주세요. (예: "1926년 시작된 북벌은 [1] 광둥을 출발해...")
          - **특정 매체 및 인물 언급 금지**: 방송사 이름, 기자 이름 등을 대본에 포함하지 마세요.
          - **시청자 호칭 금지**: "시청자 여러분" 등의 표현을 절대 포함하지 마세요.
          - 말투: 친절하고 신뢰감 있는 해요체(~해요, ~입니다).
          - 분량: 공백 포함 약 800자 이내. 적절한 줄바꿈으로 가독성을 확보하세요.
    3. "imagePrompts": 위 대본의 내용 흐름에 따라 순서대로 매칭되는 10개의 **영어 프롬프트** 배열.
       - **중요**: 각 프롬프트는 해당 대본 구간의 내용을 시각적으로 묘사하는 **상황 설명**만 적을 것.
       - 스타일(흑백, 라인아트 등)에 대한 설명은 절대 포함하지 말 것.
       - **주의**: 이미지 내에 말풍선(speech bubbles)이나 텍스트를 절대 포함하지 말 것.

    응답 형식: {"analysis": "...", "script": "...", "imagePrompts": ["...", ...]}
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
                // 더 강력한 JSON 추출 (마크다운 코드 블록 제거 등)
                const jsonBlockMatch = jsonString.match(/\{[\s\S]*\}/); // Re-match to ensure it's a clean JSON block
                const targetJson = jsonBlockMatch ? jsonBlockMatch[0] : jsonString;

                try {
                    aiData = JSON.parse(targetJson);
                } catch (pErr) {
                    console.warn("Standard JSON parse failed, attempting cleanup...");
                    // eslint-disable-next-line no-control-regex
                    const cleanedJson = targetJson
                        .replace(/[\u0000-\u001F\u007F-\u009F]/g, "")
                        .replace(/\\n/g, "\\\\n")
                        .replace(/\n/g, "\\n");
                    aiData = JSON.parse(cleanedJson);
                }
            } catch (e) {
                console.error('AI Response parsing reached fatal error:', e);
                console.log('Original AI Text:', jsonString);
            }
        } else {
            console.error("No JSON found in AI response");
        }

        return {
            analysis: aiData.analysis || '분석할 내용이 없거나 실패했습니다.',
            script: aiData.script || '대본 생성 실패: AI 응답 형식이 올바르지 않습니다.',
            imagePrompts: aiData.imagePrompts || Array(10).fill('scenic background')
        };
    } catch (error) {
        console.error("Gemini API Error:", error);
        throw error;
    }
};
