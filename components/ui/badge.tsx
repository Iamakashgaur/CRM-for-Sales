import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors duration-180 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        destructive: "border-transparent bg-destructive/90 text-destructive-foreground",
        outline: "text-foreground border-border/80 bg-background",
        success: "border-transparent bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
        warning: "border-transparent bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300",
        info: "border-transparent bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300",
        gold: "border-transparent bg-accent-soft text-accent-strong dark:bg-accent/15 dark:text-accent",
        "success-soft": "border-transparent bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
        "warning-soft": "border-transparent bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300",
        "info-soft": "border-transparent bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300",
        "destructive-soft": "border-transparent bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300",
      },
    },
    defaultVariants: { variant: "default" },
  }
)

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
