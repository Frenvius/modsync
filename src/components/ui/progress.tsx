import * as React from "react"
import { cn } from "@/lib/utils"
import * as ProgressPrimitive from "@radix-ui/react-progress"

interface ProgressProps extends React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root> {
	glow?: boolean
}

const Progress = React.forwardRef<
	React.ElementRef<typeof ProgressPrimitive.Root>,
	ProgressProps
>(({ value, className, glow = false, ...props }, ref) => (
	<ProgressPrimitive.Root
		ref={ref}
		className={cn(
			"relative h-3 w-full overflow-hidden rounded-full bg-secondary border border-border",
			className
		)}
		{...props}
	>
		<ProgressPrimitive.Indicator
			style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
			className={cn(
				"h-full w-full flex-1 bg-primary transition-all duration-300 rounded-full",
				glow && "shadow-[0_0_20px_hsl(209_79%_55%/0.5)]"
			)}
		/>
	</ProgressPrimitive.Root>
))
Progress.displayName = ProgressPrimitive.Root.displayName

export { Progress }
