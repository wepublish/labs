// Embedding utilities for semantic search and deduplication

import { openrouter } from './openrouter.ts';

/**
 * Generate embedding for a single text
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  return openrouter.generateEmbedding(text);
}

/**
 * Generate embeddings for multiple texts (batch operation)
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  return openrouter.generateEmbeddings(texts);
}

/**
 * Calculate cosine similarity between two embedding vectors
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  return openrouter.cosineSimilarity(a, b);
}

/**
 * Check if two texts are semantically similar above threshold
 */
export async function areSimilar(
  textA: string,
  textB: string,
  threshold = 0.85
): Promise<boolean> {
  const embeddings = await generateEmbeddings([textA, textB]);
  const similarity = cosineSimilarity(embeddings[0], embeddings[1]);
  return similarity >= threshold;
}

/**
 * Find the most similar text from a list
 */
export async function findMostSimilar(
  query: string,
  candidates: string[],
  minSimilarity = 0.3
): Promise<{ text: string; similarity: number; index: number } | null> {
  if (candidates.length === 0) return null;

  const allTexts = [query, ...candidates];
  const embeddings = await generateEmbeddings(allTexts);
  const queryEmbedding = embeddings[0];

  let bestMatch: { text: string; similarity: number; index: number } | null = null;

  for (let i = 1; i < embeddings.length; i++) {
    const similarity = cosineSimilarity(queryEmbedding, embeddings[i]);
    if (similarity >= minSimilarity) {
      if (!bestMatch || similarity > bestMatch.similarity) {
        bestMatch = {
          text: candidates[i - 1],
          similarity,
          index: i - 1,
        };
      }
    }
  }

  return bestMatch;
}

/**
 * Deduplicate a list of texts using embedding similarity
 * Returns indices of unique texts (first occurrence wins)
 */
export async function deduplicateTexts(
  texts: string[],
  threshold = 0.75
): Promise<number[]> {
  if (texts.length <= 1) return texts.map((_, i) => i);

  const embeddings = await generateEmbeddings(texts);
  const uniqueIndices: number[] = [];
  const seenEmbeddings: number[][] = [];

  for (let i = 0; i < embeddings.length; i++) {
    const embedding = embeddings[i];
    let isDuplicate = false;

    for (const seen of seenEmbeddings) {
      const similarity = cosineSimilarity(embedding, seen);
      if (similarity >= threshold) {
        isDuplicate = true;
        break;
      }
    }

    if (!isDuplicate) {
      uniqueIndices.push(i);
      seenEmbeddings.push(embedding);
    }
  }

  return uniqueIndices;
}

// Export as module
export const embeddings = {
  generate: generateEmbedding,
  generateBatch: generateEmbeddings,
  similarity: cosineSimilarity,
  areSimilar,
  findMostSimilar,
  deduplicate: deduplicateTexts,
};
