import { GoogleGenerativeAI } from '@google/generative-ai';

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

// Helper: Write string to DataView
const writeString = (view, offset, string) => {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
};

// Helper: Create WAV Header
const getWavHeader = (audioLength, sampleRate = 24000, numChannels = 1, bitsPerSample = 16) => {
    const wavHeader = new Uint8Array(44);
    const view = new DataView(wavHeader.buffer);

    // RIFF identifier
    writeString(view, 0, 'RIFF');
    // file length
    view.setUint32(4, 36 + audioLength, true);
    // RIFF type
    writeString(view, 8, 'WAVE');
    // format chunk identifier
    writeString(view, 12, 'fmt ');
    // format chunk length
    view.setUint32(16, 16, true);
    // sample format (raw)
    view.setUint16(20, 1, true);
    // channel count
    view.setUint16(22, numChannels, true);
    // sample rate
    view.setUint32(24, sampleRate, true);
    // byte rate (sampleRate * blockAlign)
    view.setUint32(28, sampleRate * numChannels * (bitsPerSample / 8), true);
    // block align (channel count * bytes per sample)
    view.setUint16(32, numChannels * (bitsPerSample / 8), true);
    // bits per sample
    view.setUint16(34, bitsPerSample, true);
    // data chunk identifier
    writeString(view, 36, 'data');
    // data chunk length
    view.setUint32(40, audioLength, true);

    return wavHeader;
};

export const generateVoiceNarration = async (scriptText, retries = 3) => {
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    // Initialize model with configuration
    const model = genAI.getGenerativeModel({
        model: 'gemini-2.5-flash-preview-tts',
        generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: {
                voiceConfig: {
                    prebuiltVoiceConfig: { voiceName: 'Kore' }
                }
            }
        }
    });

    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            // Simple text call - SDK handles formatting relative to config
            const result = await model.generateContent(scriptText);

            // Extract base64 audio data
            const audioData = result.response.candidates[0].content.parts[0].inlineData.data;

            // Convert base64 to PCM Uint8Array
            const audioBuffer = Uint8Array.from(atob(audioData), c => c.charCodeAt(0));

            // Create WAV header
            const wavHeader = getWavHeader(audioBuffer.length);

            // Combine header and PCM data
            const wavBytes = new Uint8Array(wavHeader.length + audioBuffer.length);
            wavBytes.set(wavHeader, 0);
            wavBytes.set(audioBuffer, wavHeader.length);

            // Create Blob from combined data
            const audioBlob = new Blob([wavBytes], { type: 'audio/wav' });
            const audioUrl = URL.createObjectURL(audioBlob);

            return { audioUrl, audioBlob };

        } catch (error) {
            console.error(`Voice generation attempt ${attempt}/${retries} failed:`, error.message);

            if (attempt < retries) {
                await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
            } else {
                throw error;
            }
        }
    }
};
