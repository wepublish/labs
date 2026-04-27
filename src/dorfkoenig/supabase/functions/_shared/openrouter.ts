// OpenRouter API client for LLM operations

import {
  OPENROUTER_CHAT_TIMEOUT_MS,
  OPENROUTER_EMBEDDING_TIMEOUT_MS,
} from './constants.ts';

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

type DenoEnv = {
  env: {
    get(name: string): string | undefined;
  };
};

function getOpenRouterApiKey(): string {
  const key = (globalThis as typeof globalThis & { Deno?: DenoEnv }).Deno?.env.get('OPENROUTER_API_KEY');
  if (!key) {
    throw new Error('OPENROUTER_API_KEY is not set');
  }
  return key;
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatTool {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters: Record<string, unknown>;
  };
}

export type ChatToolChoice =
  | 'auto'
  | 'none'
  | 'required'
  | { type: 'function'; function: { name: string } };

export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

interface ChatOptions {
  model?: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  response_format?: { type: 'json_object' };
  tools?: ChatTool[];
  tool_choice?: ChatToolChoice;
  timeout_ms?: number;
}

interface ChatResponse {
  id: string;
  choices: {
    index: number;
    message: {
      role: string;
      content: string | null;
      tool_calls?: ToolCall[];
    };
    finish_reason: string;
  }[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * Make a chat completion request to OpenRouter
 */
export async function chat(options: ChatOptions): Promise<ChatResponse> {
  const {
    model = 'openai/gpt-4o-mini',
    messages,
    temperature = 0.2,
    max_tokens = 2000,
    response_format,
    tools,
    tool_choice,
    timeout_ms = OPENROUTER_CHAT_TIMEOUT_MS,
  } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout_ms);

  try {
    const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getOpenRouterApiKey()}`,
        'HTTP-Referer': 'https://dorfkoenig.labs.wepublish.ch',
        'X-Title': 'DorfKönig',
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens,
        ...(response_format && { response_format }),
        ...(tools && { tools }),
        ...(tool_choice && { tool_choice }),
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
    }

    return response.json();
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`OpenRouter chat request timed out after ${timeout_ms}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

const MAX_EMBEDDING_CHARS = 30000;

/**
 * Generate embeddings using OpenRouter
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const truncated = text.slice(0, MAX_EMBEDDING_CHARS);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), OPENROUTER_EMBEDDING_TIMEOUT_MS);

  try {
    const response = await fetch(`${OPENROUTER_BASE_URL}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getOpenRouterApiKey()}`,
      },
      body: JSON.stringify({
        model: 'openai/text-embedding-3-small',
        input: truncated,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenRouter Embedding API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    return data.data[0].embedding;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`OpenRouter embedding request timed out after ${OPENROUTER_EMBEDDING_TIMEOUT_MS}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Generate embeddings for multiple texts (batch)
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const truncated = texts.map(t => t.slice(0, MAX_EMBEDDING_CHARS));
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), OPENROUTER_EMBEDDING_TIMEOUT_MS);

  try {
    const response = await fetch(`${OPENROUTER_BASE_URL}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getOpenRouterApiKey()}`,
      },
      body: JSON.stringify({
        model: 'openai/text-embedding-3-small',
        input: truncated,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenRouter Embedding API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    return data.data.map((d: { embedding: number[] }) => d.embedding);
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`OpenRouter embedding request timed out after ${OPENROUTER_EMBEDDING_TIMEOUT_MS}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Calculate cosine similarity between two vectors
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have the same length');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dotProduct / (normA * normB);
}

// Export as module
export const openrouter = {
  chat,
  generateEmbedding,
  generateEmbeddings,
  cosineSimilarity,
};
