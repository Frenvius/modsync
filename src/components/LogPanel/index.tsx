import { Copy } from 'lucide-react';
import React, { useContext } from 'react';
import { Scrollbars } from 'react-custom-scrollbars-2';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
	ContextMenu,
	ContextMenuItem,
	ContextMenuContent,
	ContextMenuTrigger,
} from '@/components/ui/context-menu';

import styles from './styles.module.scss';
import { LogContext } from '~/context/LogContext/constants';

const LogPanel: React.FC = () => {
	const { logs, cleanLogs } = useContext(LogContext);
	const scrollRef = React.useRef<Scrollbars & { update: () => void; view: HTMLDivElement }>(null);
	const [copiedIndex, setCopiedIndex] = React.useState<null | number>(null);

	React.useEffect(() => {
		scrollRef?.current?.scrollToBottom();
	}, [logs]);

	const extractShareCode = (message: string): null | string => {
		const match = message.match(/Code:\s*(\S+)/);
		return match ? match[1] : null;
	};

	const handleCopyCode = (code: string, index: number) => {
		navigator.clipboard.writeText(code);
		setCopiedIndex(index);
		setTimeout(() => setCopiedIndex(null), 2000);
	};

	const handleClean = (): void => {
		cleanLogs();
	};

	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>
				<div className={styles.container}>
					<Scrollbars ref={scrollRef} style={{ width: '100%', height: '135px' }}>
						{logs.map((message, index) => {
							const shareCode = extractShareCode(message);
							return (
								<p key={index} className={shareCode ? styles.logLine : undefined}>
									<span>{message}</span>
									{shareCode && (
										<Tooltip>
											<TooltipTrigger asChild>
												<button className={styles.copyButton} onClick={() => handleCopyCode(shareCode, index)}>
													<Copy className="h-3 w-3" />
												</button>
											</TooltipTrigger>
											<TooltipContent>
												{copiedIndex === index ? 'Copied!' : 'Copy code'}
											</TooltipContent>
										</Tooltip>
									)}
								</p>
							);
						})}
					</Scrollbars>
				</div>
			</ContextMenuTrigger>
			<ContextMenuContent>
				<ContextMenuItem onClick={handleClean} className={styles.menuItem}>
					Clean
				</ContextMenuItem>
			</ContextMenuContent>
		</ContextMenu>
	);
};

export default LogPanel;
