import React from 'react';
import { Progress } from '@/components/ui/progress';

import { ProgressType } from '~/context/AppState/types.ts';

interface Props {
	value?: number;
	variant?: ProgressType;
}

const LinearProgressWithLabel: React.FC<Props> = ({ variant, value = 0 }: Props) => {
	return (
		<div className="w-full">
			<Progress value={variant === 'indeterminate' ? undefined : value} />
		</div>
	);
};

export default LinearProgressWithLabel;
