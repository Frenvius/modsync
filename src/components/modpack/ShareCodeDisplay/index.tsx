import React from 'react';
import { Button } from '~/components/ui/button';
import { cn } from '~/usecase/util/stringUtils';
import { Check, Copy, Share2 } from 'lucide-react';

import { ShareCodeDisplayProps } from './types';

export function ShareCodeDisplay({ code, modpackName }: ShareCodeDisplayProps) {
	const [copied, setCopied] = React.useState(false);

	const handleCopy = () => {
		navigator.clipboard.writeText(code);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	return (
		<div className="p-6 rounded-xl bg-card border border-border">
			<div className="text-center mb-4">
				<Share2 className="w-8 h-8 text-primary mx-auto mb-2" />
				<h3 className="font-semibold text-lg">Share "{modpackName}"</h3>
				<p className="text-sm text-muted-foreground">Share this code with friends to sync your modpack</p>
			</div>

			<div className="relative">
				<div className="flex items-center justify-center gap-2 p-4 rounded-lg bg-secondary border border-border">
					<span className="text-2xl font-mono font-bold tracking-widest text-primary">{code}</span>
				</div>

				<Button
					size="icon"
					variant="outline"
					onClick={handleCopy}
					className={cn('absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8', copied && 'bg-primary/10 border-primary text-primary')}
				>
					{copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
				</Button>
			</div>

			<div className="mt-4">
				<Button variant="outline" className="w-full gap-2">
					<Share2 className="w-4 h-4" />
					Share Link
				</Button>
			</div>
		</div>
	);
}
