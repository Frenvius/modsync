import React from 'react';
import { RotateCcw } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectItem, SelectValue, SelectContent, SelectTrigger } from '@/components/ui/select';

import { ConfigValueType, ConfigEntry as ConfigEntryType } from '~/services/config.service';

interface ConfigEntryProps {
	disabled?: boolean;
	entry: ConfigEntryType;
	onReset: (key: string) => void;
	onValueChange: (key: string, value: string) => void;
}

function getValueDisplay(value: ConfigValueType): string {
	switch (value.type) {
		case 'Boolean':
			return value.value ? 'true' : 'false';
		case 'Integer':
		case 'Float':
			return String(value.value);
		case 'String':
		case 'KeyboardShortcut':
			return value.value;
		case 'Choice':
			return value.value.value;
	}
}

const ConfigEntryComponent: React.FC<ConfigEntryProps> = ({ entry, onReset, disabled, onValueChange }) => {
	const currentValue = getValueDisplay(entry.value);

	const handleChange = (newValue: string) => {
		if (disabled) return;
		onValueChange(entry.key, newValue);
	};

	const renderInput = () => {
		switch (entry.value.type) {
			case 'Boolean':
				return (
					<Select disabled={disabled} value={currentValue} onValueChange={handleChange}>
						<SelectTrigger className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="true">true</SelectItem>
							<SelectItem value="false">false</SelectItem>
						</SelectContent>
					</Select>
				);

			case 'Choice':
				return (
					<Select disabled={disabled} value={currentValue} onValueChange={handleChange}>
						<SelectTrigger className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{entry.value.value.options.map((option) => (
								<SelectItem key={option} value={option}>
									{option}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				);

			case 'Integer':
				return (
					<Input
						step="1"
						type="number"
						className="w-full"
						disabled={disabled}
						value={currentValue}
						onChange={(e) => handleChange(e.target.value)}
					/>
				);

			case 'Float':
				return (
					<Input
						step="0.1"
						type="number"
						className="w-full"
						disabled={disabled}
						value={currentValue}
						onChange={(e) => handleChange(e.target.value)}
					/>
				);

			case 'KeyboardShortcut':
			case 'String':
			default:
				return (
					<Input type="text" className="w-full" disabled={disabled} value={currentValue} onChange={(e) => handleChange(e.target.value)} />
				);
		}
	};

	return (
		<div className="py-3 border-b border-border last:border-b-0">
			<div className="flex items-start justify-between gap-4">
				<div className="flex-1 min-w-0">
					<Label className="font-medium text-foreground">{entry.key}</Label>
					{entry.description && <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">{entry.description}</p>}
					{entry.default_value && <p className="text-xs text-muted-foreground mt-1">Default: {entry.default_value}</p>}
				</div>
				<div className="flex items-center gap-2 shrink-0">
					<div className="w-48">{renderInput()}</div>
					{entry.default_value && currentValue !== entry.default_value && !disabled && (
						<Button size="icon" variant="ghost" title="Reset to default" onClick={() => onReset(entry.key)}>
							<RotateCcw className="h-4 w-4" />
						</Button>
					)}
				</div>
			</div>
		</div>
	);
};

export default ConfigEntryComponent;
