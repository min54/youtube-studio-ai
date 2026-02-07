import { useState, useRef } from 'react';
import axios from 'axios';
import { GoogleGenerativeAI } from '@google/generative-ai';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { analyzeVideoContent } from './services/geminiScript';
import { generateStoryboardImage } from './services/geminiImage';
import { generateVoiceNarration } from './services/geminiVoice';

const YOUTUBE_API_KEY = import.meta.env.VITE_YOUTUBE_API_KEY;
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

function App() {
  const [videos, setVideos] = useState([]);
  const [seenIds, setSeenIds] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [error, setError] = useState(null);
  const [selectedVideoId, setSelectedVideoId] = useState(null);
  const [imageStyle, setImageStyle] = useState('doodle'); // 'doodle' or 'realistic'
  const [searchTerm, setSearchTerm] = useState('뉴스'); // Default search term

  const decodeHtml = (html) => {
    const txt = document.createElement("textarea");
    txt.innerHTML = html;
    return txt.value;
  };

  // Ref for AbortController to stop image generation
  const abortControllerRef = useRef(null);

  // Derived state for the currently selected video object
  const selectedVideo = videos.find(v => v.id.videoId === selectedVideoId) || videos[0];

  const fetchVideoStats = async (videoIds) => {
    // 400 Error Handling: Ensure we have valid IDs
    const validIds = videoIds.filter(id => id && typeof id === 'string' && id.trim() !== '');

    if (validIds.length === 0) {
      console.warn('fetchVideoStats called with no valid IDs');
      return [];
    }

    try {
      const response = await axios.get('https://www.googleapis.com/youtube/v3/videos', {
        params: {
          part: 'snippet,statistics',
          id: validIds.join(','),
          key: YOUTUBE_API_KEY,
        },
      });
      return response.data.items;
    } catch (err) {
      console.error('Error fetching video stats:', err);
      // Return empty array to prevent crashing loop
      return [];
    }
  };

  const extractInformation = async () => {
    if (!searchTerm.trim()) {
      alert('검색어를 입력해주세요.');
      return;
    }

    setLoading(true);
    setError(null);
    setVideos([]);
    setProgress({ current: 0, total: 4 });

    try {
      const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

      // 1. Fetch Videos based on search term
      let searchResponse;
      try {
        searchResponse = await axios.get('https://www.googleapis.com/youtube/v3/search', {
          params: {
            part: 'snippet',
            q: searchTerm,
            regionCode: 'KR',
            relevanceLanguage: 'ko', // Ensure Korean content
            maxResults: 20,
            type: 'video',
            key: YOUTUBE_API_KEY,
          },
        });
      } catch (searchErr) {
        const errorMsg = searchErr.response?.data?.error?.message || searchErr.message;
        console.error('YouTube Search API Error:', errorMsg);
        throw new Error(errorMsg);
      }

      const candidates = searchResponse.data.items
        .filter(v => v.id && v.id.videoId && !seenIds.has(String(v.id.videoId)))
        .sort((a, b) => new Date(b.snippet.publishedAt) - new Date(a.snippet.publishedAt)); // 최신순 정렬

      if (candidates.length < 4) {
        setError('분석할 수 있는 새로운 영상이 부족합니다.');
        setLoading(false);
        return;
      }

      // 2. Filter Videos with AI (Modified prompt for general content)
      const filterPrompt = `
        다음은 유튜브 영상 목록입니다. 검색어: "${searchTerm}"
        
        **선정 기준**:
        1. 주제가 50% 이상 겹치지 않는, 서로 다른 내용을 다루는 영상 4개를 골라줘.
        2. 리포팅의 정확도를 위해 **가급적 최신 날짜의 영상을 우선적으로** 선택해줘.
        
        응답은 반드시 마크다운 등 부연 설명 없이 오직 JSON 형식으로만 해줘: {"selectedIndices": [index1, index2, index3, index4]}
        
        영상 목록 (최신순):
        ${candidates.map((v, i) => `${i}. [${v.snippet.publishedAt.substring(0, 10)}] ${v.snippet.title}`).join('\n')}
      `;

      let selectedIndices = [0, 1, 2, 3]; // Default fallback

      try {
        const filterResult = await model.generateContent(filterPrompt);
        const filterResponse = await filterResult.response;
        const text = filterResponse.text();
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.selectedIndices && Array.isArray(parsed.selectedIndices)) {
            selectedIndices = parsed.selectedIndices;
          }
        }
      } catch (e) {
        console.error('AI 필터링 파싱 실패, 상위 4개로 대체', e);
      }

      // Ensure indices are within bounds
      const validIndices = selectedIndices.filter(idx => idx >= 0 && idx < candidates.length).slice(0, 4);
      if (validIndices.length < 4) {
        // If AI gave weird indices, fill with available ones
        const needed = 4 - validIndices.length;
        let nextIdx = 0;
        while (validIndices.length < 4 && nextIdx < candidates.length) {
          if (!validIndices.includes(nextIdx)) validIndices.push(nextIdx);
          nextIdx++;
        }
      }

      const selectedItems = validIndices.map(idx => candidates[idx]);

      // Initialize videos state immediately
      const initialVideos = selectedItems.map(v => ({
        id: v.id,
        title: decodeHtml(v.snippet.title),
        description: decodeHtml(v.snippet.description),
        thumbnail: v.snippet.thumbnails.medium.url,
        publishedAt: v.snippet.publishedAt,
        stats: { viewCount: '-', likeCount: '-', commentCount: '-' },
        analysis: '분석 대기 중...',
        script: 'AI가 내용을 분석하고 있습니다...',
        imagePrompts: [],
        images: Array(10).fill(null),
        selectedHeadlineIndex: 0,
        isGenerating: false,
        isGeneratingVoice: false
      }));

      setVideos(initialVideos);
      setSelectedVideoId(initialVideos[0].id.videoId);

      // Fetch detailed stats
      const videoIds = selectedItems.map(v => v.id.videoId);
      const detailedVideos = await fetchVideoStats(videoIds);

      // If fetching stats failed/returned partial results, merge carefully
      // Map detailed info back to our initial structure
      const mergedVideos = initialVideos.map(iv => {
        const detail = detailedVideos.find(d => d.id === iv.id.videoId);
        if (detail) {
          return {
            ...iv,
            stats: detail.statistics,
            description: decodeHtml(detail.snippet.description) // Get full description if available
          };
        }
        return iv;
      });

      setProgress({ current: 0, total: mergedVideos.length });

      // 3. Analyze each video using Service
      for (let i = 0; i < mergedVideos.length; i++) {
        const v = mergedVideos[i];

        // Safe access to stats
        const viewCount = v.stats?.viewCount ? parseInt(v.stats.viewCount).toLocaleString() : '-';
        const likeCount = v.stats?.likeCount ? parseInt(v.stats.likeCount).toLocaleString() : '-';
        const commentCount = v.stats?.commentCount ? parseInt(v.stats.commentCount).toLocaleString() : '-';

        // Construct video data object for service
        const videoData = {
          title: v.title,
          description: v.description,
          stats: { viewCount, likeCount, commentCount }
        };

        try {
          // Call Service
          const aiData = await analyzeVideoContent(videoData, searchTerm);

          setVideos(prev => {
            return prev.map(item => {
              if (item.id.videoId === v.id.videoId) {
                return {
                  ...item,
                  stats: { viewCount, likeCount, commentCount },
                  analysis: aiData.analysis,
                  script: aiData.script,
                  imagePrompts: aiData.imagePrompts,
                };
              }
              return item;
            });
          });

        } catch (aiErr) {
          console.error("AI Analysis Error", aiErr);
          setVideos(prev => {
            return prev.map(item => {
              if (item.id.videoId === v.id.videoId) {
                return {
                  ...item,
                  stats: { viewCount, likeCount, commentCount },
                  analysis: '분석 실패',
                  script: '대본 생성 실패',
                  imagePrompts: Array(10).fill('minimalist stick figure'),
                };
              }
              return item;
            });
          });
        }
        setProgress(prev => ({ ...prev, current: i + 1 }));
      }
    } catch (err) {
      console.error(err);
      setError(err.message || '데이터를 가져오는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleStopGeneration = (video) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setVideos(prev => prev.map(v => v.id.videoId === video.id.videoId ? { ...v, isGenerating: false } : v));
    }
  };

  const handleGenerateImage = async (video) => {
    if (!video || !video.imagePrompts) return;

    // Initialize AbortController
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    setVideos(prev => prev.map(v => v.id.videoId === video.id.videoId ? { ...v, isGenerating: true } : v));

    try {
      const totalImages = video.imagePrompts.length;
      let currentImages = [...(video.images || Array(10).fill(null))];

      for (let i = 0; i < totalImages; i++) {
        if (signal.aborted) break;

        const promptText = video.imagePrompts[i];

        try {
          // Call Service
          const imageUrl = await generateStoryboardImage(promptText, imageStyle, signal);
          currentImages[i] = imageUrl;

          setVideos(prev => prev.map(v => v.id.videoId === video.id.videoId ? {
            ...v,
            images: [...currentImages],
          } : v));

        } catch (innerErr) {
          if (innerErr.message === 'Generation aborted') {
            console.log('Generation stopped by user.');
            break;
          }
          console.error(`Failed to generate image ${i} after retries:`, innerErr);
        }
      }

      if (!signal.aborted) {
        setVideos(prev => prev.map(v => v.id.videoId === video.id.videoId ? { ...v, isGenerating: false } : v));
      }

    } catch (err) {
      console.error("Image generation failed", err);
      setVideos(prev => prev.map(v => v.id.videoId === video.id.videoId ? { ...v, isGenerating: false } : v));
    } finally {
      abortControllerRef.current = null;
    }
  };

  const handleRegenerateSingleImage = async (video, imageIndex) => {
    if (!video || !video.imagePrompts[imageIndex]) return;

    // Show loading state by clearing current image
    setVideos(prev => prev.map(v => {
      if (v.id.videoId === video.id.videoId) {
        const newImages = [...v.images];
        newImages[imageIndex] = null;
        return { ...v, images: newImages };
      }
      return v;
    }));

    const controller = new AbortController();
    const promptText = video.imagePrompts[imageIndex];

    try {
      // Call Service
      const newImageUrl = await generateStoryboardImage(promptText, imageStyle, controller.signal);

      setVideos(prev => prev.map(v => {
        if (v.id.videoId === video.id.videoId) {
          const newImages = [...v.images];
          newImages[imageIndex] = newImageUrl;
          return { ...v, images: newImages };
        }
        return v;
      }));
    } catch (e) {
      console.error("Single regeneration failed after retries:", e);
      alert('이미지 생성에 실패했습니다. 다시 시도해 주세요.');
      // Optionally restore previous image or leave as null? 
      // For now, let's leave it null to indicate failure or wait for user to try again
    }
  };

  const handleDownloadAllImages = async (video) => {
    if (!video || !video.images || video.images.every(img => img === null)) {
      alert('다운로드할 이미지가 없습니다.');
      return;
    }

    const zip = new JSZip();
    const folder = zip.folder("storyboard_images");

    const validImages = video.images.map((url, idx) => ({ url, idx })).filter(item => item.url !== null);

    if (validImages.length === 0) return;

    await Promise.all(validImages.map(async ({ url, idx }) => {
      try {
        const response = await fetch(url);
        const blob = await response.blob();
        folder.file(`image_${idx + 1}.png`, blob);
      } catch (e) {
        console.error(`Failed to fetch image ${idx + 1}`, e);
      }
    }));

    const content = await zip.generateAsync({ type: "blob" });
    saveAs(content, `${video.title.substring(0, 20)}_images.zip`);
  };

  const handleGenerateVoice = async (video) => {
    if (!video || !video.script) return;

    setVideos(prev => prev.map(v => v.id.videoId === video.id.videoId ? { ...v, isGeneratingVoice: true } : v));

    try {
      // Call Service
      const { audioUrl, audioBlob } = await generateVoiceNarration(video.script);

      setVideos(prev => prev.map(v => v.id.videoId === video.id.videoId ? {
        ...v,
        audioUrl,
        audioBlob,
        isGeneratingVoice: false
      } : v));

    } catch (error) {
      console.error('Voice generation failed:', error);
      alert('음성 생성에 실패했습니다. 다시 시도해 주세요.');
      setVideos(prev => prev.map(v => v.id.videoId === video.id.videoId ? { ...v, isGeneratingVoice: false } : v));
    }
  };

  const handleDownloadAudio = (video) => {
    if (!video.audioBlob) return;

    const url = URL.createObjectURL(video.audioBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${video.title.substring(0, 30)}_narration.wav`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };


  // If no videos, show landing
  if (videos.length === 0) {
    return (
      <div id="root">
        <header className="app-header">
          <div className="logo">YOUTUBE STUDIO AI</div>
          {/* Header Search Bar */}
          <div className="header-search">
            <input
              className="header-search-input"
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="검색어 입력 (예: 뉴스, 먹방...)"
              onKeyDown={(e) => { if (e.key === 'Enter' && !loading) extractInformation(); }}
            />
            <button className="header-search-btn" onClick={extractInformation} disabled={loading}>
              {loading ? '분석 중' : '분석'}
            </button>
          </div>
        </header>

        {/* LOADING OVERLAY in Landing Mode */}
        {loading && (
          <div className="loading-overlay">
            <div className="robot-container">
              <div className="hologram-paper">
                <div className="paper-line"></div>
                <div className="paper-line"></div>
                <div className="paper-line"></div>
                <div className="paper-line"></div>
                <div className="paper-line"></div>
              </div>
              <div className="robot-arm">
                <div className="robot-hand">
                  <div className="robot-pen">
                    <div className="pen-tip"></div>
                  </div>
                </div>
              </div>
            </div>
            <div className="loading-text">AI WRITING SCRIPT...</div>
            <div className="loading-subtext">
              {progress.total > 0
                ? `Analyzing Video [${progress.current} / ${progress.total}]`
                : `Searching & Strategy Planning for '${searchTerm}'...`}
            </div>
          </div>
        )}

        <div className="landing-container">
          <h1 className="landing-title">
            오늘의 트렌드를<br />
            <span style={{ color: '#38bdf8' }}>자동으로 분석</span>하고 시각화합니다.
          </h1>
          <p className="landing-desc">
            상단 검색창에 <strong>관심있는 주제</strong>를 입력하여 분석을 시작하세요.<br />
            AI가 영상을 선별하고, 대본을 작성하며, 스토리보드를 생성합니다.
          </p>
          {error && <div style={{ color: '#ef4444', marginTop: '20px' }}>{error}</div>}
        </div>
      </div>
    )
  }

  return (
    <div id="root">
      <header className="app-header">
        <div className="logo">YOUTUBE STUDIO AI</div>
        {/* Header Search Bar */}
        <div className="header-search">
          <input
            className="header-search-input"
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="검색어 입력 (예: 뉴스, 먹방...)"
            onKeyDown={(e) => { if (e.key === 'Enter' && !loading) extractInformation(); }}
          />
          <button className="header-search-btn" onClick={extractInformation} disabled={loading}>
            {loading ? '분석 중' : '분석'}
          </button>
        </div>
      </header>

      {/* GLOBAL LOADING OVERLAY */}
      {loading && (
        <div className="loading-overlay">
          <div className="robot-container">
            <div className="hologram-paper">
              <div className="paper-line"></div>
              <div className="paper-line"></div>
              <div className="paper-line"></div>
              <div className="paper-line"></div>
              <div className="paper-line"></div>
            </div>
            <div className="robot-arm">
              <div className="robot-hand">
                <div className="robot-pen">
                  <div className="pen-tip"></div>
                </div>
              </div>
            </div>
          </div>
          <div className="loading-text">AI WRITING SCRIPT...</div>
          <div className="loading-subtext">
            {progress.total > 0
              ? `Analyzing Video [${progress.current} / ${progress.total}]`
              : `Searching & Strategy Planning for '${searchTerm}'...`}
          </div>
        </div>
      )}

      <div className="dashboard-container">
        {/* 1. Script Panel */}
        <div className="panel script-panel">
          <div className="panel-header">
            <div className="panel-title">📜 SCRIPT</div>
            {/* Analysis Summary Badge */}
            <div style={{ fontSize: '0.8rem', color: '#38bdf8' }}>
              {selectedVideo?.stats?.viewCount !== '-' ? `Views: ${selectedVideo?.stats?.viewCount}` : ''}
            </div>
          </div>
          <div className="script-content">
            <h2 style={{ fontSize: '1.4rem', marginBottom: '1rem', color: 'white' }}>
              {selectedVideo?.title}
            </h2>
            <div style={{ background: 'rgba(255,255,255,0.05)', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem', color: '#94a3b8', fontSize: '0.9rem' }}>
              <strong>💡 AI Analysis:</strong> {selectedVideo?.analysis}
            </div>
            <div className="script-text-container">
              {(() => {
                const script = selectedVideo?.script;
                if (!script) return null;

                // Split script by [n] markers
                const parts = script.split(/(\[\d+\])/g);
                return parts.map((part, index) => {
                  const match = part.match(/\[(\d+)\]/);
                  if (match) {
                    const imgIdx = parseInt(match[1]) - 1;
                    const imgUrl = selectedVideo.images?.[imgIdx];

                    // Only show annotation badge if image is actually generated
                    if (imgUrl) {
                      return (
                        <span key={index} className="script-annotation" title={`View Scene ${imgIdx + 1}`}>
                          {imgIdx + 1}
                        </span>
                      );
                    }
                    return null; // Hide marker if image is not yet generated
                  }
                  return <span key={index}>{part}</span>;
                });
              })()}
            </div>

            {/* Voice Generation Section */}
            <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
              <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                <button
                  onClick={() => {
                    console.log("Voice generation button clicked for:", selectedVideo?.title);
                    handleGenerateVoice(selectedVideo);
                  }}
                  disabled={selectedVideo?.isGeneratingVoice || loading || !selectedVideo?.script || selectedVideo?.script === 'AI가 내용을 분석하고 있습니다...' || selectedVideo?.script === '대본 생성 실패' || selectedVideo?.script === '내용 없음'}
                  style={{
                    flex: '1',
                    minWidth: '140px',
                    background: (selectedVideo?.script && selectedVideo.script !== 'AI가 내용을 분석하고 있습니다...' && selectedVideo.script !== '대본 생성 실패' && selectedVideo.script !== '내용 없음')
                      ? (selectedVideo?.audioUrl ? 'linear-gradient(135deg, #10b981, #059669)' : 'linear-gradient(135deg, #38bdf8, #3b82f6)')
                      : '#94a3b8',
                    color: 'white',
                    border: 'none',
                    padding: '0.75rem 1.25rem',
                    borderRadius: '8px',
                    fontSize: '0.95rem',
                    fontWeight: '600',
                    cursor: (selectedVideo?.isGeneratingVoice || !selectedVideo?.script || selectedVideo?.script === 'AI가 내용을 분석하고 있습니다...') ? 'not-allowed' : 'pointer',
                    opacity: (selectedVideo?.isGeneratingVoice || !selectedVideo?.script || selectedVideo?.script === 'AI가 내용을 분석하고 있습니다...') ? 0.6 : 1,
                    transition: 'all 0.2s',
                    boxShadow: selectedVideo?.audioUrl ? '0 4px 12px rgba(16,185,129,0.3)' : 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px'
                  }}
                >
                  {selectedVideo?.isGeneratingVoice ? (
                    <>
                      <div className="btn-spinner"></div>
                      🎙️ 음성 생성 중...
                    </>
                  ) : (
                    <>
                      {(!selectedVideo?.script || selectedVideo?.script === 'AI가 내용을 분석하고 있습니다...') ? '⏳ 준비 중...'
                        : (selectedVideo?.script === '대본 생성 실패' || selectedVideo?.script === '내용 없음') ? '❌ 대본 없음'
                          : selectedVideo?.audioUrl ? '✅ 음성 재생성' : '🎙️ 음성 생성'}
                    </>
                  )}
                </button>

                {selectedVideo?.audioUrl && (
                  <button
                    onClick={() => handleDownloadAudio(selectedVideo)}
                    style={{
                      background: 'linear-gradient(135deg, #a78bfa, #8b5cf6)',
                      color: 'white',
                      border: 'none',
                      padding: '0.75rem 1.25rem',
                      borderRadius: '8px',
                      fontSize: '0.95rem',
                      fontWeight: '600',
                      cursor: 'pointer',
                      minWidth: '140px',
                      transition: 'all 0.2s',
                      boxShadow: '0 4px 12px rgba(167,139,250,0.3)'
                    }}
                  >
                    💾 음성 다운로드
                  </button>
                )}
              </div>

              {/* Audio Player */}
              {selectedVideo?.audioUrl && (
                <div style={{
                  background: 'linear-gradient(135deg, rgba(56,189,248,0.1), rgba(59,130,246,0.1))',
                  padding: '1rem',
                  borderRadius: '12px',
                  border: '1px solid rgba(56,189,248,0.3)'
                }}>
                  <div style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '0.5rem', fontWeight: '500' }}>
                    🎵 생성된 음성 나레이션
                  </div>
                  <audio
                    controls
                    src={selectedVideo.audioUrl}
                    style={{
                      width: '100%',
                      borderRadius: '8px',
                      outline: 'none'
                    }}
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 2. Control / Source / List Panel */}
        <div className="control-panel">
          {/* Youtube Player */}
          <div className="panel video-box">
            {selectedVideo && (
              <iframe
                className="video-frame"
                src={`https://www.youtube.com/embed/${selectedVideo.id.videoId}`}
                title="Youtube Video"
                allowFullScreen
              />
            )}
          </div>

          {/* News Search List */}
          <div className="panel search-list-box">
            <div className="panel-header" style={{ padding: '0.8rem 1rem' }}>
              <div className="panel-title">🔍 SEARCH RESULTS</div>
            </div>
            <div className="news-list">
              {videos.map((v) => (
                <div
                  key={v.id.videoId}
                  className={`news-item ${selectedVideoId === v.id.videoId ? 'active' : ''}`}
                  onClick={() => setSelectedVideoId(v.id.videoId)}
                >
                  <img className="news-thumb" src={v.thumbnail} alt="" />
                  <div className="news-info">
                    <div className="news-title">{v.title}</div>
                    <div className="news-meta">{v.publishedAt.substring(0, 10)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 3. Gallery Panel */}
        <div className="panel gallery-track-panel">
          <div className="panel-header">
            <div className="panel-title">🎨 STORYBOARD GENERATION</div>

            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <div style={{ display: 'flex', background: 'rgba(0,0,0,0.2)', borderRadius: '6px', padding: '2px', marginRight: '1rem' }}>
                <button
                  onClick={() => setImageStyle('doodle')}
                  style={{
                    background: imageStyle === 'doodle' ? '#38bdf8' : 'transparent',
                    color: imageStyle === 'doodle' ? 'white' : '#94a3b8',
                    border: 'none',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                    fontWeight: '600'
                  }}
                >
                  🖌️ 썰툰
                </button>
                <button
                  onClick={() => setImageStyle('realistic')}
                  style={{
                    background: imageStyle === 'realistic' ? '#38bdf8' : 'transparent',
                    color: imageStyle === 'realistic' ? 'white' : '#94a3b8',
                    border: 'none',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                    fontWeight: '600'
                  }}
                >
                  📸 실사
                </button>
              </div>

              {selectedVideo?.isGenerating ? (
                <button
                  className="generate-btn"
                  style={{ background: '#ef4444' }} // Red for stop
                  onClick={() => handleStopGeneration(selectedVideo)}
                >
                  ⏹ STOP
                </button>
              ) : (
                <button
                  className="generate-btn"
                  onClick={() => handleGenerateImage(selectedVideo)}
                  disabled={selectedVideo?.isGenerating}
                >
                  Generate All Images
                </button>
              )}

              {/* Batch Download Button */}
              {selectedVideo?.images.some(img => img !== null) && (
                <button
                  className="generate-btn"
                  style={{ background: '#a78bfa', marginLeft: '0.5rem' }}
                  onClick={() => handleDownloadAllImages(selectedVideo)}
                >
                  💾 ZIP
                </button>
              )}
            </div>
          </div>

          <div className="gallery-grid">
            {/* Render 10 grids always */}
            {selectedVideo?.images.map((imgUrl, idx) => (
              <div key={idx} className="gallery-item">
                {imgUrl ? (
                  <>
                    <img src={imgUrl} className="gallery-img" alt={`Scene ${idx + 1}`} />
                    <div className="gallery-actions">
                      <button className="mini-btn" onClick={(e) => {
                        e.stopPropagation();
                        handleRegenerateSingleImage(selectedVideo, idx);
                      }}>
                        🔄
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="gallery-placeholder">
                    {selectedVideo?.isGenerating ? (
                      <>
                        <div className="spinner"></div>
                        <div style={{ fontSize: '0.8rem', marginTop: '5px' }}>Generating...</div>
                      </>
                    ) : (
                      <div style={{ opacity: 0.3 }}>{idx + 1}</div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}

export default App;
