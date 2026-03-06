import * as React from 'react';

import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '~/usecase/util/stringUtils';

const buttonVariants = cva(
	'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium ring-offset-background transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
	{
		defaultVariants: {
			size: 'default',
			variant: 'default'
		},
		variants: {
			size: {
				icon: 'h-10 w-10',
				default: 'h-10 px-4 py-2',
				sm: 'h-9 rounded-md px-3',
				lg: 'h-11 rounded-lg px-8 text-base',
				xl: 'h-12 rounded-lg px-10 text-base font-semibold'
			},
			variant: {
				ghost: 'hover:bg-accent hover:text-accent-foreground',
				link: 'text-primary underline-offset-4 hover:underline',
				secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
				destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
				outline: 'border border-border bg-transparent hover:bg-accent hover:text-accent-foreground',
				glass: 'bg-card/80 backdrop-blur-xl border border-border/50 hover:bg-card/90 text-foreground',
				default: 'bg-primary text-primary-foreground hover:bg-primary/90 hover:shadow-lg hover:shadow-primary/25',
				glow: 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_0_20px_hsl(var(--primary)/0.2)] hover:shadow-[0_0_40px_hsl(var(--primary)/0.3)]'
			}
		}
	}
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
	asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ size, variant, className, asChild = false, ...props }, ref) => {
	const Comp = asChild ? Slot : 'button';
	return <Comp ref={ref} className={cn(buttonVariants({ size, variant, className }))} {...props} />;
});
Button.displayName = 'Button';

export { Button, buttonVariants };
