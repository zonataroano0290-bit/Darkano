import { GoogleGenAI } from '@google/genai';
import { MediaService } from './mediaService.js';
import { CreditService } from './creditService.js';
import { MediaRecord, ModelCapabilityMatrix } from '../types.js';

export interface ImageGenerationOptions {
  prompt: string;
  aspectRatio?: '1:1' | '16:9' | '9:16' | '4:3' | '3:4';
  resolution?: string;
  style?: string;
  conversationId?: string;
  idempotencyKey?: string;
}

export interface ImageEditOptions {
  sourceMediaId: string;
  prompt: string;
  conversationId?: string;
  idempotencyKey?: string;
}

export interface AudioTranscriptionOptions {
  audioBuffer: Buffer;
  mimeType: string;
  conversationId?: string;
  language?: string;
  prompt?: string;
}

export interface TextToSpeechOptions {
  text: string;
  voiceName?: 'Kore' | 'Puck' | 'Charon' | 'Fenrir' | 'Zephyr';
  conversationId?: string;
  messageId?: string;
}

export class MultimodalService {
  private static aiClient: GoogleGenAI | null = null;

  static getClient(): GoogleGenAI {
    if (!this.aiClient) {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey || !apiKey.trim()) {
        throw new Error('Google Gemini API Key is not configured on the server.');
      }
      this.aiClient = new GoogleGenAI({
        apiKey: apiKey.trim(),
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build'
          }
        }
      });
    }
    return this.aiClient;
  }

  static isConfigured(): boolean {
    return Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim().length > 0);
  }

  /**
   * Helper: Convert raw 24kHz 16-bit mono PCM into standard playable RIFF WAVE
   */
  static pcmToWav(pcmBuffer: Buffer, sampleRate = 24000, numChannels = 1, bitsPerSample = 16): Buffer {
    const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
    const blockAlign = numChannels * (bitsPerSample / 8);
    const header = Buffer.alloc(44);

    header.write('RIFF', 0);
    header.writeUInt32LE(36 + pcmBuffer.length, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16); // Subchunk1Size
    header.writeUInt16LE(1, 20); // AudioFormat 1 = PCM
    header.writeUInt16LE(numChannels, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(byteRate, 28);
    header.writeUInt16LE(blockAlign, 32);
    header.writeUInt16LE(bitsPerSample, 34);
    header.write('data', 36);
    header.writeUInt32LE(pcmBuffer.length, 40);

    return Buffer.concat([header, pcmBuffer]);
  }

  /**
   * Real Speech-to-Text: Transcribes speech from user's microphone or uploaded audio file
   */
  static async transcribeAudio(
    userId: string,
    options: AudioTranscriptionOptions
  ): Promise<{ transcript: string; mediaRecord: MediaRecord; creditsCharged: number }> {
    if (!this.isConfigured()) {
      throw new Error('Speech-to-text provider is not configured on this host.');
    }

    const cost = 2; // 2 credits for transcription
    const currentBalance = CreditService.getBalance(userId);
    if (currentBalance < cost) {
      throw new Error(`Insufficient credits for voice transcription. Required: ${cost}, available: ${currentBalance}.`);
    }

    // Validate audio buffer
    const validation = MediaService.validateMediaBytes(options.audioBuffer, options.mimeType);
    if (!validation.valid || validation.type !== 'audio') {
      throw new Error(validation.error || 'Invalid audio payload signature.');
    }

    // Save audio input to media vault
    const mediaRecord = MediaService.saveMedia({
      userId,
      conversationId: options.conversationId,
      buffer: options.audioBuffer,
      declaredMime: validation.detectedMime || options.mimeType,
      type: 'audio'
    });

    const client = this.getClient();
    const base64Audio = options.audioBuffer.toString('base64');
    const audioMime = validation.detectedMime || options.mimeType || 'audio/webm';

    let transcript = '';
    try {
      const audioPart = {
        inlineData: {
          mimeType: audioMime,
          data: base64Audio
        }
      };

      const promptText = options.prompt
        ? `Transcribe this audio file accurately. Additional context: ${options.prompt}. Output ONLY the verbatim transcript text without preamble, quotes, or meta comments.`
        : `Transcribe this audio verbatim. Output ONLY the transcribed text without quotes, commentary, or conversational preamble.`;

      // Try gemini-3.5-transcribe first, then fallback to gemini-3.8-flash / gemini-3.1-flash-lite
      let response;
      try {
        response = await client.models.generateContent({
          model: 'gemini-3.5-transcribe',
          contents: [audioPart, { text: promptText }]
        });
      } catch (firstErr: any) {
        console.warn('[MultimodalService] Primary transcription model unavailable, retrying with flash...', firstErr?.message);
        response = await client.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: [audioPart, { text: promptText }]
        });
      }

      transcript = response.text ? response.text.trim() : '';
      if (!transcript) {
        throw new Error('Speech recognition model produced an empty transcript.');
      }
    } catch (err: any) {
      // Do not charge credits on failure
      throw new Error(`Voice transcription failed: ${err?.message || 'Provider error'}`);
    }

    // Commit charge on success
    CreditService.deductCredits({
      userId,
      amount: cost,
      type: 'ai_usage',
      source: 'Speech-to-Text Transcription',
      metadata: {
        mediaId: mediaRecord.id,
        mimeType: audioMime,
        lengthBytes: options.audioBuffer.length
      }
    });

    return {
      transcript,
      mediaRecord,
      creditsCharged: cost
    };
  }

  /**
   * Real Text-to-Speech: Transforms AI responses or text into high-fidelity speech
   */
  static async textToSpeech(
    userId: string,
    options: TextToSpeechOptions
  ): Promise<{ audioUrl: string; mediaRecord: MediaRecord; creditsCharged: number; base64Audio: string }> {
    if (!this.isConfigured()) {
      throw new Error('Text-to-speech provider is not configured on this host.');
    }

    const cleanText = (options.text || '').trim();
    if (!cleanText) {
      throw new Error('Text payload cannot be empty for speech generation.');
    }

    const cost = 2; // 2 credits for TTS
    const currentBalance = CreditService.getBalance(userId);
    if (currentBalance < cost) {
      throw new Error(`Insufficient credits for text-to-speech. Required: ${cost}, available: ${currentBalance}.`);
    }

    const client = this.getClient();
    const voice = options.voiceName || 'Kore';

    let wavBuffer: Buffer;
    try {
      const response = await client.models.generateContent({
        model: 'gemini-3.1-flash-tts-preview',
        contents: [{ parts: [{ text: cleanText.slice(0, 1500) }] }],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: voice }
            }
          }
        }
      });

      const rawBase64 = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!rawBase64) {
        throw new Error('Text-to-speech provider completed without returning audio bytes.');
      }

      const pcmBuffer = Buffer.from(rawBase64, 'base64');
      wavBuffer = this.pcmToWav(pcmBuffer, 24000, 1, 16);
    } catch (err: any) {
      throw new Error(`Text-to-speech generation failed: ${err?.message || 'Provider error'}`);
    }

    // Save generated WAV audio
    const mediaRecord = MediaService.saveMedia({
      userId,
      conversationId: options.conversationId,
      messageId: options.messageId,
      buffer: wavBuffer,
      declaredMime: 'audio/wav',
      type: 'tts_audio',
      provider: 'Google DeepMind',
      model: 'gemini-3.1-flash-tts-preview',
      prompt: cleanText.slice(0, 200),
      metadata: { voice, charCount: cleanText.length }
    });

    // Commit charge
    CreditService.deductCredits({
      userId,
      amount: cost,
      type: 'ai_usage',
      source: 'Text-to-Speech Synthesis',
      metadata: {
        mediaId: mediaRecord.id,
        voice,
        charCount: cleanText.length
      }
    });

    return {
      audioUrl: mediaRecord.fileUrl,
      mediaRecord,
      creditsCharged: cost,
      base64Audio: wavBuffer.toString('base64')
    };
  }

  /**
   * Real Image Generation: Generates visual assets using real configured image model
   */
  static async generateImage(
    userId: string,
    options: ImageGenerationOptions
  ): Promise<{ mediaRecord: MediaRecord; creditsCharged: number; imageUrl: string }> {
    if (!this.isConfigured()) {
      throw new Error('Image generation provider is not configured on this host.');
    }

    const cleanPrompt = (options.prompt || '').trim();
    if (!cleanPrompt) {
      throw new Error('Image generation prompt is required.');
    }

    const cost = 5; // 5 credits for image generation
    const currentBalance = CreditService.getBalance(userId);
    if (currentBalance < cost) {
      throw new Error(`Insufficient credits for image generation. Required: ${cost}, available: ${currentBalance}.`);
    }

    const client = this.getClient();
    const aspectRatio = options.aspectRatio || '1:1';

    let imageBuffer: Buffer;
    let mimeType = 'image/png';

    try {
      // Call gemini-3.1-flash-lite-image
      const response = await client.models.generateContent({
        model: 'gemini-3.1-flash-lite-image',
        contents: {
          parts: [{ text: cleanPrompt }]
        },
        config: {
          imageConfig: {
            aspectRatio: aspectRatio as any
          }
        }
      });

      let foundBytes: string | null = null;
      const parts = response.candidates?.[0]?.content?.parts || [];
      for (const p of parts) {
        if (p.inlineData && p.inlineData.data) {
          foundBytes = p.inlineData.data;
          mimeType = p.inlineData.mimeType || 'image/png';
          break;
        }
      }

      if (!foundBytes) {
        throw new Error('Image generation provider completed without returning image data.');
      }

      imageBuffer = Buffer.from(foundBytes, 'base64');
    } catch (err: any) {
      const errMsg = String(err?.message || '');
      if (errMsg.includes('Quota exceeded') || errMsg.includes('429') || errMsg.includes('limit: 0')) {
        throw new Error('Image generation is currently unavailable: The configured Gemini project API key does not have active quota for nano banana image generation models. Please configure a paid Gemini project key to enable image generation.');
      }
      throw new Error(`Image generation failed: ${errMsg}`);
    }

    // Save image to user media vault
    const mediaRecord = MediaService.saveMedia({
      userId,
      conversationId: options.conversationId,
      buffer: imageBuffer,
      declaredMime: mimeType,
      type: 'generated_image',
      provider: 'Google DeepMind',
      model: 'gemini-3.1-flash-lite-image',
      prompt: cleanPrompt,
      metadata: { aspectRatio }
    });

    // Commit charge
    CreditService.deductCredits({
      userId,
      amount: cost,
      type: 'image_generation_usage',
      source: 'Image Generation',
      metadata: {
        mediaId: mediaRecord.id,
        aspectRatio,
        prompt: cleanPrompt.slice(0, 100)
      }
    });

    return {
      mediaRecord,
      creditsCharged: cost,
      imageUrl: mediaRecord.fileUrl
    };
  }

  /**
   * Real Image Editing: Modifies existing user image using instruction prompt
   */
  static async editImage(
    userId: string,
    options: ImageEditOptions
  ): Promise<{ mediaRecord: MediaRecord; creditsCharged: number; imageUrl: string }> {
    if (!this.isConfigured()) {
      throw new Error('Image editing provider is not configured on this host.');
    }

    const cleanPrompt = (options.prompt || '').trim();
    if (!cleanPrompt) {
      throw new Error('Image editing instruction prompt is required.');
    }

    const cost = 5; // 5 credits for image editing
    const currentBalance = CreditService.getBalance(userId);
    if (currentBalance < cost) {
      throw new Error(`Insufficient credits for image editing. Required: ${cost}, available: ${currentBalance}.`);
    }

    // Verify source image ownership
    const sourceMedia = MediaService.getMedia(userId, options.sourceMediaId);
    if (!sourceMedia) {
      throw new Error('Source image not found or access denied.');
    }

    const sourceData = MediaService.getMediaBuffer(userId, options.sourceMediaId);
    if (!sourceData) {
      throw new Error('Source image file could not be read from disk.');
    }

    const client = this.getClient();
    const base64Source = sourceData.buffer.toString('base64');

    let editedBuffer: Buffer;
    let mimeType = 'image/png';

    try {
      const response = await client.models.generateContent({
        model: 'gemini-3.1-flash-lite-image',
        contents: {
          parts: [
            {
              inlineData: {
                data: base64Source,
                mimeType: sourceData.mimeType
              }
            },
            {
              text: cleanPrompt
            }
          ]
        }
      });

      let foundBytes: string | null = null;
      const parts = response.candidates?.[0]?.content?.parts || [];
      for (const p of parts) {
        if (p.inlineData && p.inlineData.data) {
          foundBytes = p.inlineData.data;
          mimeType = p.inlineData.mimeType || 'image/png';
          break;
        }
      }

      if (!foundBytes) {
        throw new Error('Image editing provider completed without returning edited image data.');
      }

      editedBuffer = Buffer.from(foundBytes, 'base64');
    } catch (err: any) {
      const errMsg = String(err?.message || '');
      if (errMsg.includes('Quota exceeded') || errMsg.includes('429') || errMsg.includes('limit: 0')) {
        throw new Error('Image editing is currently unavailable: The configured Gemini project API key does not have active quota for nano banana image editing models. Please configure a paid Gemini project key to enable image editing.');
      }
      throw new Error(`Image editing failed: ${errMsg}`);
    }

    // Save edited image
    const mediaRecord = MediaService.saveMedia({
      userId,
      conversationId: options.conversationId,
      buffer: editedBuffer,
      declaredMime: mimeType,
      type: 'edited_image',
      provider: 'Google DeepMind',
      model: 'gemini-3.1-flash-lite-image',
      prompt: cleanPrompt,
      metadata: { parentMediaId: options.sourceMediaId }
    });

    // Commit charge
    CreditService.deductCredits({
      userId,
      amount: cost,
      type: 'image_generation_usage',
      source: 'Image Editing',
      metadata: {
        mediaId: mediaRecord.id,
        parentMediaId: options.sourceMediaId,
        prompt: cleanPrompt.slice(0, 100)
      }
    });

    return {
      mediaRecord,
      creditsCharged: cost,
      imageUrl: mediaRecord.fileUrl
    };
  }

  /**
   * Check whether a model ID supports vision/image understanding
   */
  static modelSupportsVision(modelId: string): boolean {
    const nonVisionModels = ['darkano-code-x', 'gemini-3.1-flash-tts-preview', 'gemini-3.5-transcribe', 'deepseek-r1'];
    return !nonVisionModels.includes(modelId);
  }

  /**
   * Check whether a model ID supports image generation
   */
  static modelSupportsImageGeneration(modelId: string): boolean {
    return modelId === 'gemini-3.1-flash-lite-image' || modelId === 'gemini-3.1-flash-image';
  }
}
