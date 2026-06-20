/**
 * Collections Context — Direct callback for loading requests from collections
 * 
 * Replaces the sessionStorage pending request antipattern with a proper React context
 * that uses direct callbacks. This eliminates race conditions and timing issues.
 */

'use client'

import { createContext, useContext, useCallback } from 'react'
import type { RequestItem } from '@/lib/types'

export interface CollectionsContextType {
  /**
   * Called when user selects a request from the collections panel
   * Opens request in tab or focuses existing tab
   */
  onRequestSelected: (request: RequestItem, options?: { sendImmediately?: boolean }) => void
}

const CollectionsContext = createContext<CollectionsContextType | undefined>(undefined)

export interface CollectionsProviderProps {
  children: React.ReactNode
  onRequestSelected: (request: RequestItem, options?: { sendImmediately?: boolean }) => void
}

/**
 * Provider component that wraps children with collections context
 */
export function CollectionsProvider({
  children,
  onRequestSelected,
}: CollectionsProviderProps) {
  const value: CollectionsContextType = {
    onRequestSelected,
  }

  return (
    <CollectionsContext.Provider value={value}>
      {children}
    </CollectionsContext.Provider>
  )
}

/**
 * Hook to use collections context
 * Must be called within a CollectionsProvider
 */
export function useCollections() {
  const context = useContext(CollectionsContext)
  if (context === undefined) {
    throw new Error('useCollections must be used within a CollectionsProvider')
  }
  return context
}

/**
 * Helper hook for collections panel to select a request
 */
export function useSelectRequest() {
  const { onRequestSelected } = useCollections()
  
  return useCallback(
    (request: RequestItem, options?: { sendImmediately?: boolean }) => {
      onRequestSelected(request, options)
    },
    [onRequestSelected]
  )
}
