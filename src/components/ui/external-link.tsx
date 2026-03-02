import React from 'react';
import { commandService } from '@/services/command.service';

interface ExternalLinkProps {
	href: string;
	className?: string;
	children: React.ReactNode;
}

export function ExternalLink({ href, children, className }: ExternalLinkProps) {
	const handleClick = (e: React.MouseEvent) => {
		e.preventDefault();
		commandService.openExternal(href);
	};

	return (
		<a href={href} onClick={handleClick} className={className}>
			{children}
		</a>
	);
}
