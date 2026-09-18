import { AIModel } from '../types';

export const AI_MODELS: AIModel[] = [
  {
    id: 'darkano-ultra-v2',
    name: 'Darkano Ultra v2',
    provider: 'Darkano Core',
    category: 'flagship',
    description: 'Flagship frontier model engineered for deep synthetic reasoning, complex multi-domain logic, and autonomous task graphs.',
    contextWindow: '200k tokens',
    maxOutputTokens: '16k tokens',
    latencyTier: 'Deep Think',
    capabilities: ['Deep Reasoning', 'Mathematical Synthesis', 'Complex Planning', 'Multi-Modal'],
    isFlagship: true,
    accentColor: '#06b6d4'
  },
  {
    id: 'darkano-flash-v2',
    name: 'Darkano Flash v2',
    provider: 'Darkano Core',
    category: 'fast',
    description: 'Sub-second latency powerhouse optimized for high-throughput code iteration, instant chat, and massive context digestion.',
    contextWindow: '1M tokens',
    maxOutputTokens: '8k tokens',
    latencyTier: 'Ultra Fast',
    capabilities: ['Sub-second Response', '1M Context', 'Realtime Extraction', 'High Throughput'],
    accentColor: '#38bdf8'
  },
  {
    id: 'darkano-code-x',
    name: 'Darkano Code-X',
    provider: 'Darkano Systems',
    category: 'coding',
    description: 'Specialized polyglot coding model trained on verified ASTs, kernel subsystems, and distributed cloud architectures.',
    contextWindow: '128k tokens',
    maxOutputTokens: '16k tokens',
    latencyTier: 'Fast',
    capabilities: ['AST Refactoring', 'Test Scaffolding', 'Security Audit', 'Cross-Language Migration'],
    accentColor: '#10b981'
  },
  {
    id: 'gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    provider: 'Google',
    category: 'reasoning',
    description: 'Multimodal powerhouse adept at native audio, video, complex document layouts, and high-fidelity code verification.',
    contextWindow: '1M tokens',
    maxOutputTokens: '8k tokens',
    latencyTier: 'Balanced',
    capabilities: ['Multimodal Native', 'Video & Audio', 'Massive Documents', 'Factuality'],
    accentColor: '#818cf8'
  },
  {
    id: 'claude-3.7-sonnet',
    name: 'Claude 3.7 Sonnet',
    provider: 'Anthropic',
    category: 'reasoning',
    description: 'Hybrid architecture combining fast inference with dynamic extended thinking tokens for complex engineering.',
    contextWindow: '200k tokens',
    maxOutputTokens: '64k tokens',
    latencyTier: 'Deep Think',
    capabilities: ['Hybrid Reasoning', 'Long Output Generation', 'Agentic Execution', 'Nuance'],
    accentColor: '#d97706'
  },
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    provider: 'OpenAI',
    category: 'flagship',
    description: 'High-intelligence omni model supporting unified reasoning across text, code, vision, and tool calling.',
    contextWindow: '128k tokens',
    maxOutputTokens: '16k tokens',
    latencyTier: 'Fast',
    capabilities: ['Omni Modality', 'Structured JSON', 'Function Calling', 'Instruction Following'],
    accentColor: '#10a37f'
  },
  {
    id: 'deepseek-r1',
    name: 'DeepSeek R1',
    provider: 'DeepSeek',
    category: 'reasoning',
    description: 'Open-weight frontier reasoning model trained via large-scale reinforcement learning for step-by-step mathematical proofs.',
    contextWindow: '64k tokens',
    maxOutputTokens: '8k tokens',
    latencyTier: 'Deep Think',
    capabilities: ['Chain-of-Thought', 'Formal Verification', 'Math Competition', 'Logic Puzzles'],
    accentColor: '#6366f1'
  },
  {
    id: 'llama-3.3-70b',
    name: 'Llama 3.3 70B',
    provider: 'Meta',
    category: 'open-weights',
    description: 'Enterprise open-weights model balancing industry-standard safety benchmarks with state-of-the-art coding and dialogue.',
    contextWindow: '128k tokens',
    maxOutputTokens: '8k tokens',
    latencyTier: 'Balanced',
    capabilities: ['Private Hostable', 'Enterprise Tooling', 'Multilingual', 'Cost Optimized'],
    accentColor: '#0ea5e9'
  }
];

export const DEFAULT_MODEL_ID = 'darkano-ultra-v2';
