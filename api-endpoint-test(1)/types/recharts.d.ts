import "react"

declare module "recharts" {
  export interface ContentRenderer<P> {
    (props: P): React.ReactNode
  }

  export type TooltipProps<TValue extends string | number, TName extends string | number> = {
    active?: boolean
    payload?: Array<{ value: TValue; name: TName; payload: Record<string, unknown> }>
    label?: string
    labelFormatter?: (label: string) => React.ReactNode
    formatter?: (value: TValue, name: TName) => React.ReactNode
    content?: React.ReactElement | ContentRenderer<TooltipProps<TValue, TName>>
  }

  export type ChartTooltipContentProps = {
    active?: boolean
    payload?: Array<Record<string, unknown>>
    label?: string
    labelFormatter?: (label: string) => React.ReactNode
    labelClassName?: string
    formatter?: (value: unknown, name: string) => React.ReactNode
    indicator?: "line" | "dot" | "dashed"
    hideLabel?: boolean
    hideIndicator?: boolean
    nameKey?: string
    labelKey?: string
  }
}
