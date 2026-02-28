import React, { useContext } from "react";
import { Copy, Check } from "lucide-react";
import { Scrollbars } from "react-custom-scrollbars-2";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
	ContextMenu,
	ContextMenuItem,
	ContextMenuContent,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";

import { LogContext } from "~/context/LogContext/constants";

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
				<div className="h-full glass rounded-xl overflow-hidden">
					<Scrollbars ref={scrollRef} style={{ width: "100%", height: "100%" }}>
						<div className="p-4 space-y-1">
							{logs.map((message, index) => {
								const shareCode = extractShareCode(message);
								return (
									<div
										key={index}
										className={`text-sm font-mono flex items-center justify-between gap-2 ${
											shareCode ? "text-primary" : "text-muted-foreground"
										}`}
									>
										<span className="break-all">{message}</span>
										{shareCode && (
											<Tooltip>
												<TooltipTrigger asChild>
													<button
														onClick={() => handleCopyCode(shareCode, index)}
														className="shrink-0 p-1 rounded hover:bg-primary/20 transition-colors"
													>
														{copiedIndex === index ? (
															<Check className="h-3 w-3 text-success" />
														) : (
															<Copy className="h-3 w-3" />
														)}
													</button>
												</TooltipTrigger>
												<TooltipContent>
													{copiedIndex === index ? "Copied!" : "Copy code"}
												</TooltipContent>
											</Tooltip>
										)}
									</div>
								);
							})}
						</div>
					</Scrollbars>
				</div>
			</ContextMenuTrigger>
			<ContextMenuContent>
				<ContextMenuItem onClick={handleClean}>
					Clear logs
				</ContextMenuItem>
			</ContextMenuContent>
		</ContextMenu>
	);
};

export default LogPanel;
