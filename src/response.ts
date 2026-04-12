/** Standardized tool response wrapper — every tool returns this shape */

export interface ToolResponseMetadata {
  count?: number;
  totalCount?: number;
  hasMore?: boolean;
  pcoEndpoint?: string;
  executionMs?: number;
}

export interface ToolResponse<T = unknown> {
  success: boolean;
  data: T | null;
  error: string | null;
  metadata: ToolResponseMetadata;
}

/** Build a successful tool response */
export function toolSuccess<T>(data: T, metadata: ToolResponseMetadata = {}): ToolResponse<T> {
  return {
    success: true,
    data,
    error: null,
    metadata,
  };
}

/** Build an error tool response */
export function toolError(message: string, metadata: ToolResponseMetadata = {}): ToolResponse<null> {
  return {
    success: false,
    data: null,
    error: message,
    metadata,
  };
}
