# ElevenLabs API 키 발급 가이드

## 1단계: 회원가입
1. https://elevenlabs.io 접속
2. **Sign Up** 클릭 (구글 계정으로 간편 가입 가능)
3. 무료 플랜: 월 10,000자 무료

## 2단계: API 키 발급
1. 로그인 후 **프로필 아이콘** 클릭
2. **Profile + API key** 선택
3. **Create Key** 또는 **Generate New API Key** 클릭
4. API 키 **복사** (한 번만 표시됨!)

## 3단계: .env 파일에 추가
```bash
VITE_ELEVENLABS_API_KEY=your_api_key_here
```

## 참고사항
- **한국어 지원**: Eleven Multilingual v2 모델 사용
- **무료 플랜**: 월 10,000자 (약 텍스트 페이지 4~5장)
- **고품질**: 매우 자연스러운 AI 음성, 감정 표현 가능
