import { useTheme } from 'next-themes';
import { toast, Toaster as Sonner } from 'sonner';

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
	const { theme = 'system' } = useTheme();

	return (
		<Sonner
			className="toaster group"
			theme={theme as ToasterProps['theme']}
			toastOptions={{
				classNames: {
					description: 'group-[.toast]:text-muted-foreground',
					cancelButton: 'group-[.toast]:bg-muted group-[.toast]:text-muted-foreground',
					actionButton: 'group-[.toast]:bg-primary group-[.toast]:text-primary-foreground',
					toast:
						'group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg'
				}
			}}
			{...props}
		/>
	);
};

export { toast, Toaster };
