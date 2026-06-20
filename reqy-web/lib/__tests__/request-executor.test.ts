import { describe, it, expect } from 'vitest'
import { normalizeUrl, buildUrl, buildHeaders, sanitizeUrl } from '@/lib/request-executor'
import type { Header, QueryParam } from '@/lib/request-executor'

describe('sanitizeUrl', () => {
  it('trims whitespace', () => {
    expect(sanitizeUrl('  http://example.com  ')).toBe('http://example.com')
  })

  it('removes HTTP method prefix', () => {
    expect(sanitizeUrl('GET http://example.com/api')).toBe('http://example.com/api')
    expect(sanitizeUrl('POST http://example.com/api')).toBe('http://example.com/api')
  })

  it('fixes protocol with missing slash', () => {
    expect(sanitizeUrl('https:/example.com')).toBe('https://example.com')
  })

  it('fixes multiple slashes after protocol', () => {
    expect(sanitizeUrl('https:///example.com')).toBe('https://example.com')
  })
})

describe('normalizeUrl', () => {
  it('adds https:// for hostnames with dots', () => {
    expect(normalizeUrl('example.com/api')).toBe('https://example.com/api')
  })

  it('adds http:// for localhost', () => {
    expect(normalizeUrl('localhost:3000/api')).toBe('http://localhost:3000/api')
  })

  it('adds http:// for IP addresses', () => {
    expect(normalizeUrl('192.168.1.1:8080')).toBe('http://192.168.1.1:8080')
  })

  it('does not modify already valid https URL', () => {
    expect(normalizeUrl('https://api.example.com/v1')).toBe('https://api.example.com/v1')
  })

  it('does not modify already valid http URL', () => {
    expect(normalizeUrl('http://localhost:3000')).toBe('http://localhost:3000')
  })
})

describe('buildUrl', () => {
  it('appends query params', () => {
    const params: QueryParam[] = [
      { key: 'q', value: 'test' },
      { key: 'page', value: '1' },
    ]
    const url = buildUrl('https://example.com/search', params)
    expect(url).toBe('https://example.com/search?q=test&page=1')
  })

  it('encodes special characters in query params', () => {
    const params: QueryParam[] = [
      { key: 'name', value: 'John Doe' },
      { key: 'q', value: 'a+b' },
    ]
    const url = buildUrl('https://example.com/search', params)
    expect(url).toContain('name=John+Doe')
    expect(url).toContain('q=a%2Bb')
  })

  it('appends params to existing query string', () => {
    const params: QueryParam[] = [
      { key: 'page', value: '2' },
    ]
    const url = buildUrl('https://example.com/search?q=hello', params)
    expect(url).toContain('q=hello')
    expect(url).toContain('page=2')
  })

  it('skips empty keys or values', () => {
    const params: QueryParam[] = [
      { key: '', value: 'val' },
      { key: 'key', value: '' },
      { key: 'valid', value: 'true' },
    ]
    const url = buildUrl('https://example.com/api', params)
    expect(url).not.toContain('=val')
    expect(url).not.toContain('key=')
    expect(url).toContain('valid=true')
  })
})

describe('buildHeaders', () => {
  const defaultHeaders: Header[] = [
    { key: 'Accept', value: 'application/json' },
  ]

  it('includes custom headers', () => {
    const result = buildHeaders(defaultHeaders, 'none', '')
    expect(result['Accept']).toBe('application/json')
  })

  it('adds Bearer authorization', () => {
    const result = buildHeaders(defaultHeaders, 'bearer', 'token123')
    expect(result['Authorization']).toBe('Bearer token123')
  })

  it('adds Basic authorization', () => {
    const result = buildHeaders(defaultHeaders, 'basic', 'base64creds')
    expect(result['Authorization']).toBe('Basic base64creds')
  })

  it('adds API Key authorization', () => {
    const result = buildHeaders(defaultHeaders, 'api-key', 'key-abc')
    expect(result['x-api-key']).toBe('key-abc')
  })

  it('does not add auth header when authType is none', () => {
    const result = buildHeaders(defaultHeaders, 'none', 'token123')
    expect(result['Authorization']).toBeUndefined()
  })

  it('does not add auth header when token is empty', () => {
    const result = buildHeaders(defaultHeaders, 'bearer', '')
    expect(result['Authorization']).toBeUndefined()
  })
})
