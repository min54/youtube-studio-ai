import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const API_KEY = process.env.VITE_YOUTUBE_API_KEY;

async function testYouTubeAPI() {
  console.log('--- 유튜브 API 연결 테스트 시작 ---');
  try {
    const response = await axios.get('https://www.googleapis.com/youtube/v3/videos', {
      params: {
        part: 'snippet,statistics',
        chart: 'mostPopular',
        regionCode: 'KR',
        maxResults: 1,
        key: API_KEY,
      },
    });

    if (response.data.items.length > 0) {
      console.log('✅ 성공: 유튜브 API가 정상적으로 호출되었습니다.');
      console.log('가장 인기 있는 영상 정보:', response.data.items[0].snippet.title);
    } else {
      console.log('❓ 성공했으나 데이터가 없습니다 (지역 설정 문제일 수 있음).');
    }
  } catch (error) {
    console.error('❌ 실패: 유튜브 API 호출 중 오류가 발생했습니다.');
    if (error.response) {
      console.error('상태 코드:', error.response.status);
      console.error('오류 메시지:', error.response.data.error.message);
    } else {
      console.error('오류 내용:', error.message);
    }
  }
  console.log('--- 테스트 종료 ---');
}

testYouTubeAPI();
