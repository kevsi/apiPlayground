import { describe, it, expect } from 'vitest'
import { matchMockRoute } from '@/lib/match-mock-path'

describe('matchMockRoute', () => {
  it('matches exact path and method', () => {
    const result = matchMockRoute('GET', '/api/users', 'GET', '/api/users')
    expect(result.matched).toBe(true)
    expect(result.params).toEqual({})
  })

  it('matches with :param segments', () => {
    const result = matchMockRoute('GET', '/api/users/42', 'GET', '/api/users/:id')
    expect(result.matched).toBe(true)
    expect(result.params).toEqual({ id: '42' })
  })

  it('matches wildcard path', () => {
    const result = matchMockRoute('GET', '/api/users/42/posts/5', 'GET', '/api/users/*')
    expect(result.matched).toBe(true)
    expect(result.params['*']).toBe('42/posts/5')
  })

  it('matches method wildcard', () => {
    expect(matchMockRoute('POST', '/api/anything', '*', '/api/anything').matched).toBe(true)
    expect(matchMockRoute('DELETE', '/api/anything', '*', '/api/anything').matched).toBe(true)
  })

  it('rejects wrong method', () => {
    const result = matchMockRoute('POST', '/api/users', 'GET', '/api/users')
    expect(result.matched).toBe(false)
  })

  it('rejects wrong path', () => {
    const result = matchMockRoute('GET', '/api/other', 'GET', '/api/users')
    expect(result.matched).toBe(false)
  })

  it('matches with multiple params', () => {
    const result = matchMockRoute('GET', '/api/users/42/posts/5', 'GET', '/api/users/:userId/posts/:postId')
    expect(result.matched).toBe(true)
    expect(result.params).toEqual({ userId: '42', postId: '5' })
  })

  it('normalizes trailing slash', () => {
    expect(matchMockRoute('GET', '/api/users/', 'GET', '/api/users').matched).toBe(true)
    expect(matchMockRoute('GET', '/api/users', 'GET', '/api/users/').matched).toBe(true)
  })

  it('matches root path', () => {
    expect(matchMockRoute('GET', '/', 'GET', '/').matched).toBe(true)
  })

  it('rejects when pattern is too short', () => {
    const result = matchMockRoute('GET', '/api/users/42/extra', 'GET', '/api/users/:id')
    expect(result.matched).toBe(false)
  })

  it('rejects when pattern is too long', () => {
    const result = matchMockRoute('GET', '/api/users/42', 'GET', '/api/users/:id/extra')
    expect(result.matched).toBe(false)
  })

  it('matches wildcard with no extra segments', () => {
    const result = matchMockRoute('GET', '/api/users', 'GET', '/api/users/*')
    expect(result.matched).toBe(true)
    expect(result.params['*']).toBe('')
  })

  it('rejects wildcard when base path does not match', () => {
    const result = matchMockRoute('GET', '/api', 'GET', '/api/users/*')
    expect(result.matched).toBe(false)
  })

  it('handles empty path', () => {
    expect(matchMockRoute('GET', '', 'GET', '/').matched).toBe(true)
  })

  it('is case-insensitive for methods', () => {
    expect(matchMockRoute('get', '/api/users', 'GET', '/api/users').matched).toBe(true)
    expect(matchMockRoute('GET', '/api/users', 'get', '/api/users').matched).toBe(true)
  })

  it('matches query params when provided', () => {
    const result = matchMockRoute('GET', '/api/search', 'GET', '/api/search', { q: 'test' }, undefined, { q: 'test' })
    expect(result.matched).toBe(true)
  })

  it('rejects when query param does not match', () => {
    const result = matchMockRoute('GET', '/api/search', 'GET', '/api/search', { q: 'other' }, undefined, { q: 'test' })
    expect(result.matched).toBe(false)
  })

  it('matches headers when provided (case-insensitive)', () => {
    const result = matchMockRoute('GET', '/api/users', 'GET', '/api/users', undefined, { 'X-Api-Key': 'secret' }, undefined, { 'x-api-key': 'secret' })
    expect(result.matched).toBe(true)
  })

  it('rejects when header does not match', () => {
    const result = matchMockRoute('GET', '/api/users', 'GET', '/api/users', undefined, { 'x-api-key': 'wrong' }, undefined, { 'x-api-key': 'secret' })
    expect(result.matched).toBe(false)
  })
})
