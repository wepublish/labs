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
 * Lightweight pg_trgm-style text similarity for in-batch dedup guards.
 * This intentionally complements embeddings: two units are only collapsed when
 * both semantic and lexical signals agree.
 */
export function trigramSimilarity(a: string, b: string): number {
  const normalize = (value: string) => value.toLowerCase().replace(/\s+/g, ' ').trim();
  const trigrams = (value: string): Set<string> => {
    const padded = `  ${normalize(value)} `;
    const grams = new Set<string>();
    for (let i = 0; i < padded.length - 2; i++) {
      grams.add(padded.slice(i, i + 3));
    }
    return grams;
  };

  const aGrams = trigrams(a);
  const bGrams = trigrams(b);
  if (aGrams.size === 0 && bGrams.size === 0) return 1;
  if (aGrams.size === 0 || bGrams.size === 0) return 0;

  let intersection = 0;
  for (const gram of aGrams) {
    if (bGrams.has(gram)) intersection++;
  }

  return (2 * intersection) / (aGrams.size + bGrams.size);
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

/**
 * Deduplicate pre-computed embeddings by similarity.
 * Returns indices of unique embeddings (first occurrence wins).
 */
export function deduplicateFromEmbeddings(
  vectors: number[][],
  threshold = 0.75,
): number[] {
  const uniqueIndices: number[] = [];
  const seen: number[][] = [];

  for (let i = 0; i < vectors.length; i++) {
    let isDuplicate = false;
    for (const s of seen) {
      if (cosineSimilarity(vectors[i], s) >= threshold) {
        isDuplicate = true;
        break;
      }
    }
    if (!isDuplicate) {
      uniqueIndices.push(i);
      seen.push(vectors[i]);
    }
  }

  return uniqueIndices;
}

/**
 * Deduplicate using embeddings plus lexical similarity. Embeddings alone are
 * too broad for short extracted facts; the text check prevents unrelated items
 * from collapsing just because they share date/location/source context.
 */
export function deduplicateSimilarStatements(
  statements: string[],
  vectors: number[][],
  cosineThreshold = 0.93,
  textThreshold = 0.7,
): number[] {
  const uniqueIndices: number[] = [];

  for (let i = 0; i < vectors.length; i++) {
    let isDuplicate = false;

    for (const seenIndex of uniqueIndices) {
      const cosine = cosineSimilarity(vectors[i], vectors[seenIndex]);
      if (cosine < cosineThreshold) continue;

      const text = trigramSimilarity(statements[i], statements[seenIndex]);
      if (text >= textThreshold) {
        isDuplicate = true;
        break;
      }
    }

    if (!isDuplicate) {
      uniqueIndices.push(i);
    }
  }

  return uniqueIndices;
}

// Export as module
export const embeddings = {
  generate: generateEmbedding,
  generateBatch: generateEmbeddings,
  similarity: cosineSimilarity,
  textSimilarity: trigramSimilarity,
  areSimilar,
  findMostSimilar,
  deduplicate: deduplicateTexts,
  deduplicateFromEmbeddings,
  deduplicateSimilarStatements,
};
