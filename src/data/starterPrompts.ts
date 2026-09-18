import { WorkspaceMode } from '../types';

export interface StarterPrompt {
  id: string;
  title: string;
  subtitle: string;
  prompt: string;
  mode: WorkspaceMode;
  tag: string;
}

export const STARTER_PROMPTS: StarterPrompt[] = [
  // Chat
  {
    id: 'chat-1',
    title: 'Architectural Trade-offs',
    subtitle: 'Evaluate distributed consensus and CQRS vs event sourcing',
    prompt: 'Deconstruct the architectural trade-offs between Event Sourcing with CQRS versus traditional relational databases for high-throughput financial ledgers.',
    mode: 'chat',
    tag: 'Systems'
  },
  {
    id: 'chat-2',
    title: 'Executive Strategic Brief',
    subtitle: 'Synthesize geopolitical impacts on semiconductor supply',
    prompt: 'Draft an executive strategic brief analyzing geopolitical choke-points and mitigation strategies across the global advanced semiconductor supply chain.',
    mode: 'chat',
    tag: 'Strategy'
  },
  {
    id: 'chat-3',
    title: 'Cognitive Architecture Spec',
    subtitle: 'Formulate autonomous agent memory hierarchy',
    prompt: 'Outline a production-grade cognitive architecture for autonomous AI agents, detailing episodic, semantic, and working memory tiering with vector stores.',
    mode: 'chat',
    tag: 'AI Systems'
  },

  // Code
  {
    id: 'code-1',
    title: 'Zero-Copy Ring Buffer',
    subtitle: 'Design lock-free ring buffer with SIMD acceleration',
    prompt: 'Design a lock-free, zero-copy ring buffer in Rust or C++ suitable for high-frequency market data streaming, with memory fences and cache line alignment.',
    mode: 'code',
    tag: 'Performance'
  },
  {
    id: 'code-2',
    title: 'Concurrent Async Pipeline',
    subtitle: 'TypeScript pipeline with bounded backpressure',
    prompt: 'Implement a resilient TypeScript async pipeline featuring bounded worker pools, exponential backoff with jitter, and dynamic backpressure signaling.',
    mode: 'code',
    tag: 'TypeScript'
  },
  {
    id: 'code-3',
    title: 'Enterprise RBAC & Token Engine',
    subtitle: 'Zero-trust auth middleware with cryptographic rotation',
    prompt: 'Write an enterprise-grade Zero-Trust authorization middleware implementing Role-Based and Attribute-Based Access Control (RBAC/ABAC) with JWT public key rotation.',
    mode: 'code',
    tag: 'Security'
  },

  // Research
  {
    id: 'research-1',
    title: 'Sparse Attention Literature',
    subtitle: 'Comprehensive synthesis of sub-quadratic Transformers',
    prompt: 'Perform an exhaustive literature synthesis on sub-quadratic attention mechanisms (Linear Attention, FlashAttention-3, State Space Models) comparing compute complexity and retrieval recall.',
    mode: 'research',
    tag: 'Deep Learning'
  },
  {
    id: 'research-2',
    title: 'Quantum Error Correction',
    subtitle: 'Evaluate surface code thresholds and physical qubit ratios',
    prompt: 'Synthesize recent experimental milestones in topological quantum error correction, evaluating logical error rate thresholds and physical-to-logical qubit overhead.',
    mode: 'research',
    tag: 'Quantum'
  },
  {
    id: 'research-3',
    title: 'Solid-State Battery Chemistries',
    subtitle: 'Compare sulfide vs oxide electrolytes and dendrite suppression',
    prompt: 'Conduct a deep comparative investigation into sulfide vs oxide solid-state electrolyte chemistries, focusing on interface impedance, ionic conductivity, and lithium dendrite suppression mechanisms.',
    mode: 'research',
    tag: 'Materials'
  },

  // Analyze
  {
    id: 'analyze-1',
    title: 'Financial Variance & Risk Matrix',
    subtitle: 'Audit quarterly earnings statements for margin erosion',
    prompt: 'Analyze a 10-K financial statement for non-GAAP reconciliation discrepancies, free cash flow margin degradation, and debt covenant compliance risks.',
    mode: 'analyze',
    tag: 'Finance'
  },
  {
    id: 'analyze-2',
    title: 'P99 Latency & Distributed Tracing',
    subtitle: 'Isolate microservice tail latencies and contention',
    prompt: 'Analyze distributed trace flamegraphs to pinpoint database lock contention, serialized garbage collection pauses, and upstream P99 latency spikes.',
    mode: 'analyze',
    tag: 'Observability'
  },
  {
    id: 'analyze-3',
    title: 'SOC2 vs ISO 27001 Cross-Audit',
    subtitle: 'Correlate and diff information security controls',
    prompt: 'Analyze and map security controls between SOC 2 Trust Services Criteria and ISO/IEC 27001:2022 Annex A, highlighting gap remediations.',
    mode: 'analyze',
    tag: 'Compliance'
  }
];
