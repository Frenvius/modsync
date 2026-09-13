import { Toaster as Sonner, type ToasterProps } from 'sonner';
import { InfoIcon, Loader2Icon, OctagonXIcon, CircleCheckIcon, TriangleAlertIcon } from 'lucide-react';

const Toaster = ({ ...props }: ToasterProps) => (
  <Sonner
    theme="dark"
    className="toaster group"
    toastOptions={{
      classNames: {
        toast: 'cn-toast'
      }
    }}
    style={
      {
        '--normal-bg': 'var(--popover)',
        '--normal-border': 'var(--border)',
        '--border-radius': 'var(--radius)',
        '--normal-text': 'var(--popover-foreground)'
      } as React.CSSProperties
    }
    icons={{
      info: <InfoIcon className="size-4" />,
      error: <OctagonXIcon className="size-4" />,
      success: <CircleCheckIcon className="size-4" />,
      warning: <TriangleAlertIcon className="size-4" />,
      loading: <Loader2Icon className="size-4 animate-spin" />
    }}
    {...props}
  />
);

export { Toaster };
