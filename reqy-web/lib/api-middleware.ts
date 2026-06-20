/**
 * API Middleware — Request validation and error handling
 * 
 * Provides standard middleware for API routes to validate payloads,
 * handle errors consistently, and send proper responses.
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { StorageError } from './storage-error'

export interface StructuredErrorResponse {
  error: string
  code: string
  message: string
  details?: Record<string, unknown>
  timestamp: number
}

/**
 * Create a structured error response
 */
export function structuredError(
  error: string,
  code: string,
  status: number = 400,
  message?: string,
  details?: Record<string, unknown>
): NextResponse<StructuredErrorResponse> {
  return NextResponse.json(
    {
      error,
      code,
      message: message || error,
      details,
      timestamp: Date.now(),
    },
    { status }
  )
}

/**
 * Create a success response with consistent format
 */
export function structuredSuccess<T>(data: T, status: number = 200): NextResponse<T> {
  return NextResponse.json(data, { status })
}

/**
 * Middleware to parse and validate JSON body
 */
export async function parseJsonBody(request: NextRequest): Promise<unknown | null> {
  try {
    const contentType = request.headers.get('content-type')
    
    if (!contentType?.includes('application/json')) {
      return null
    }

    const body = await request.json()
    return body
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON: ${error.message}`, { cause: error })
    }
    throw error
  }
}

/**
 * Handle storage errors with proper response
 */
export function handleStorageError(error: unknown): NextResponse<StructuredErrorResponse> {
  if (error instanceof StorageError) {
    return structuredError(
      error.name,
      'STORAGE_ERROR',
      error.recoverable ? 503 : 500,
      error.getUserMessage(),
      { context: error.context }
    )
  }

  if (error instanceof Error) {
    return structuredError(
      'Internal Server Error',
      'INTERNAL_ERROR',
      500,
      error.message
    )
  }

  return structuredError(
    'Internal Server Error',
    'INTERNAL_ERROR',
    500,
    'An unknown error occurred'
  )
}

/**
 * Log error with context
 */
export function logError(context: string, error: unknown, level: 'error' | 'warn' = 'error') {
  const prefix = `[${context}]`
  
  if (error instanceof Error) {
    if (level === 'error') {
      console.error(`${prefix} ${error.name}: ${error.message}`)
    } else {
      console.warn(`${prefix} ${error.name}: ${error.message}`)
    }
  } else if (typeof error === 'string') {
    if (level === 'error') {
      console.error(`${prefix} ${error}`)
    } else {
      console.warn(`${prefix} ${error}`)
    }
  } else {
    if (level === 'error') {
      console.error(`${prefix}`, error)
    } else {
      console.warn(`${prefix}`, error)
    }
  }
}

/**
 * Create a CORS response header
 */
export function getCorsHeaders(origin?: string) {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }
}

/**
 * Handle CORS preflight requests
 */
export function handleCorsPreFlight(origin?: string): NextResponse {
  return new NextResponse(null, {
    status: 200,
    headers: getCorsHeaders(origin),
  })
}
