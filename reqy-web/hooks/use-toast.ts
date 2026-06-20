'use client'

import * as React from 'react'

type ToastVariant = 'default' | 'destructive'

export interface Toast {
  id: string
  title?: React.ReactNode
  description?: React.ReactNode
  variant?: ToastVariant
  duration?: number
  onClick?: () => void
}

const TOAST_REMOVE_DELAY = 6000

const actionTypes = {
  ADD_TOAST: 'ADD_TOAST',
  DISMISS_TOAST: 'DISMISS_TOAST',
  REMOVE_TOAST: 'REMOVE_TOAST',
} as const

type ActionType = typeof actionTypes

type Action =
  | { type: ActionType['ADD_TOAST']; toast: Toast }
  | { type: ActionType['DISMISS_TOAST']; toastId?: string }
  | { type: ActionType['REMOVE_TOAST']; toastId?: string }

interface State {
  toasts: Toast[]
}

const toastTimeouts = new Map<string, ReturnType<typeof setTimeout>>()

function addToRemoveQueue(toastId: string) {
  if (toastTimeouts.has(toastId)) return
  const timeout = setTimeout(() => {
    toastTimeouts.delete(toastId)
    dispatch({ type: 'REMOVE_TOAST', toastId })
  }, TOAST_REMOVE_DELAY)
  toastTimeouts.set(toastId, timeout)
}

export const reducer = (state: State, action: Action): State => {
  switch (action.type) {
    case 'ADD_TOAST':
      return { ...state, toasts: [action.toast, ...state.toasts].slice(0, 1) }
    case 'DISMISS_TOAST': {
      const id = action.toastId
      if (id) {
        addToRemoveQueue(id)
      } else {
        state.toasts.forEach((t) => addToRemoveQueue(t.id))
      }
      return {
        ...state,
        toasts: state.toasts.map((t) =>
          id === undefined || t.id === id ? { ...t } : t
        ),
      }
    }
    case 'REMOVE_TOAST':
      if (action.toastId === undefined) return { ...state, toasts: [] }
      return { ...state, toasts: state.toasts.filter((t) => t.id !== action.toastId) }
    default:
      return state
  }
}

const listeners: Array<(state: State) => void> = []
let memoryState: State = { toasts: [] }

function dispatch(action: Action) {
  memoryState = reducer(memoryState, action)
  listeners.forEach((l) => l(memoryState))
}

let count = 0
function genId() {
  count = (count + 1) % Number.MAX_SAFE_INTEGER
  return count.toString()
}

function toast({ ...props }: Omit<Toast, 'id'>) {
  const id = genId()

  const dismiss = () => dispatch({ type: 'DISMISS_TOAST', toastId: id })

  dispatch({
    type: 'ADD_TOAST',
    toast: { ...props, id, duration: props.duration ?? 5000 },
  })

  if (props.duration !== Infinity) {
    setTimeout(() => {
      dispatch({ type: 'DISMISS_TOAST', toastId: id })
    }, props.duration ?? 5000)
  }

  return { id, dismiss }
}

function useToast() {
  const [state, setState] = React.useState<State>(memoryState)

  React.useEffect(() => {
    listeners.push(setState)
    return () => {
      const idx = listeners.indexOf(setState)
      if (idx > -1) listeners.splice(idx, 1)
    }
  }, [])

  return {
    ...state,
    toast,
    dismiss: (toastId?: string) => dispatch({ type: 'DISMISS_TOAST', toastId }),
  }
}

export { useToast, toast }
