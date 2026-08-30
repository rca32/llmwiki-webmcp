'use client';

import { useEffect } from 'react';

type JsonObject = Record<string, unknown>;

interface SiteTool {
  name: string;
  title: string;
  description: string;
  inputSchema: JsonObject;
  annotations?: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
  };
  execute: (input: JsonObject) => unknown | Promise<unknown>;
}

interface ModelContext {
  registerTool: (
    tool: SiteTool,
    options?: { signal?: AbortSignal },
  ) => void | Promise<void>;
}

declare global {
  interface Document {
    modelContext?: ModelContext;
  }
}

interface SessionCapabilities {
  can_update?: boolean;
}

const READ_TOOLS: SiteTool[] = [
  {
    name: 'example_search',
    title: 'Search example records',
    description:
      'Search active records by title and summary. Use this before requesting a record by ID.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          minLength: 1,
          maxLength: 200,
          description: 'Search text',
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 10,
          default: 5,
        },
      },
      required: ['query'],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    execute: async (input) => {
      const query = requiredText(input, 'query', 200);
      const limit = boundedInteger(input.limit, 1, 10, 5);
      return requestJson(
        `/api/examples?query=${encodeURIComponent(query)}&limit=${limit}`,
      );
    },
  },
];

const UPDATE_TOOL: SiteTool = {
  name: 'example_update',
  title: 'Update an example record',
  description:
    'Update a record for an authorized editor. Read the current record first and pass its version as expected_version.',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', minLength: 1, maxLength: 100 },
      expected_version: { type: 'integer', minimum: 1 },
      title: { type: 'string', minLength: 1, maxLength: 200 },
    },
    required: ['id', 'expected_version', 'title'],
    additionalProperties: false,
  },
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  execute: async (input) => {
    const body = {
      id: requiredText(input, 'id', 100),
      expected_version: boundedInteger(input.expected_version, 1),
      title: requiredText(input, 'title', 200),
    };

    return requestJson('/api/examples', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  },
};

export function SiteTools() {
  useEffect(() => {
    const modelContext = document.modelContext;
    if (typeof modelContext?.registerTool !== 'function') return;

    const controller = new AbortController();
    const options = { signal: controller.signal };

    void (async () => {
      const session = await requestJson('/api/session') as SessionCapabilities;
      const tools = [...READ_TOOLS];

      if (session.can_update) tools.push(UPDATE_TOOL);

      await Promise.all(
        tools.map((tool) => modelContext.registerTool(tool, options)),
      );
    })().catch((error: unknown) => {
      console.error('WebMCP site tool registration failed', error);
    });

    return () => controller.abort();
  }, []);

  return null;
}

function requiredText(input: JsonObject, key: string, maxLength: number): string {
  const value = input[key];
  if (typeof value !== 'string') throw new Error(`${key} must be a string.`);

  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) {
    throw new Error(`${key} must contain 1-${maxLength} characters.`);
  }

  return normalized;
}

function boundedInteger(
  value: unknown,
  minimum: number,
  maximum = Number.MAX_SAFE_INTEGER,
  fallback?: number,
): number {
  if (value === undefined && fallback !== undefined) return fallback;
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new Error(`Expected an integer between ${minimum} and ${maximum}.`);
  }
  return value;
}

async function requestJson(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(path, {
    ...init,
    credentials: 'same-origin',
  });
  const result = await response.json() as { error?: string };

  if (!response.ok) {
    throw new Error(result.error ?? `Request failed (${response.status}).`);
  }

  return result;
}
