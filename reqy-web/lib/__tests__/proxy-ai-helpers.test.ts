import { describe, it, expect } from 'vitest'
import { parseBody, openAIStyleContent, tryParseGeminiError } from '@/lib/proxy-ai-helpers'

describe('parseBody', () => {
  it('returns null for non-object input', () => {
    expect(parseBody(null)).toBeNull()
    expect(parseBody(undefined)).toBeNull()
    expect(parseBody('string')).toBeNull()
    expect(parseBody(42)).toBeNull()
  })

  it('returns null when provider is missing', () => {
    expect(parseBody({})).toBeNull()
    expect(parseBody({ apiKey: 'sk-123' })).toBeNull()
  })

  it('parses a minimal valid body', () => {
    const result = parseBody({ provider: 'openai' })
    expect(result).toEqual({ provider: 'openai' })
  })

  it('trims provider and message', () => {
    const result = parseBody({ provider: '  openai  ', message: '  hello  ' })
    expect(result?.provider).toBe('openai')
    expect(result?.message).toBe('hello')
  })

  it('parses all optional fields', () => {
    const result = parseBody({
      provider: 'anthropic',
      apiKey: 'sk-test',
      model: 'claude-sonnet-4-6',
      openaiUrl: 'https://custom.openai.com',
      host: 'localhost',
      port: 11434,
      system: 'You are a test assistant',
      message: 'Hello',
    })
    expect(result).toEqual({
      provider: 'anthropic',
      apiKey: 'sk-test',
      model: 'claude-sonnet-4-6',
      openaiUrl: 'https://custom.openai.com',
      host: 'localhost',
      port: '11434',
      system: 'You are a test assistant',
      message: 'Hello',
    })
  })

  it('ignores empty host values', () => {
    const result = parseBody({ provider: 'ollama', host: '   ' })
    expect(result?.host).toBeUndefined()
  })

  it('converts numeric port to string', () => {
    const result = parseBody({ provider: 'ollama', port: 8080 })
    expect(result?.port).toBe('8080')
  })

  it('handles string port', () => {
    const result = parseBody({ provider: 'ollama', port: '8080' })
    expect(result?.port).toBe('8080')
  })
})

describe('openAIStyleContent', () => {
  it('returns empty string for empty response', () => {
    expect(openAIStyleContent({})).toBe('')
  })

  it('extracts content from choices[0].message.content', () => {
    expect(openAIStyleContent({
      choices: [{ message: { content: 'Hello world' } }],
    })).toBe('Hello world')
  })

  it('falls back to choices[0].text', () => {
    expect(openAIStyleContent({
      choices: [{ text: 'Fallback text' }],
    })).toBe('Fallback text')
  })

  it('prefers message.content over text', () => {
    expect(openAIStyleContent({
      choices: [{ message: { content: 'Primary' }, text: 'Secondary' }],
    })).toBe('Primary')
  })

  it('handles missing choices', () => {
    expect(openAIStyleContent({ choices: [] })).toBe('')
  })
})

describe('tryParseGeminiError', () => {
  it('returns raw string when JSON is invalid', () => {
    expect(tryParseGeminiError('not json')).toBe('not json')
  })

  it('extracts error.message from valid JSON', () => {
    expect(tryParseGeminiError('{"error":{"message":"Rate limit exceeded"}}')).toBe('Rate limit exceeded')
  })

  it('falls back to raw string when error.message is missing', () => {
    expect(tryParseGeminiError('{"error":"generic"}}')).toBe('{"error":"generic"}}')
  })

  it('handles empty string', () => {
    expect(tryParseGeminiError('')).toBe('')
  })
})
