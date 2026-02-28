import * as React from "react"
import { cn } from "@/lib/utils"
import * as ProgressPrimitive from "@radix-ui/react-progress"

const Progress = React.forwardRef<
	React.ElementRef<typeof ProgressPrimitive.Root>,
	React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root>
>(({ value, className, ...props }, ref) => (
	<ProgressPrimitive.Root
		ref={ref}
		className={cn(
			"relative h-[30px] w-full overflow-hidden border border-[#646464] bg-[#262626]",
			className
		)}
		{...props}
	>
		<ProgressPrimitive.Indicator
			style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
			className="h-full w-full flex-1 border border-[#646464] bg-[#308fe8] transition-all"
		/>
	</ProgressPrimitive.Root>
))
Progress.displayName = ProgressPrimitive.Root.displayName

export { Progress }
