import React from 'react';

import { useAppStore } from '~/usecase/store/appStore';

export const usePlay = (instanceId: string) => {
  const [playing, setPlaying] = React.useState(false);
  const playInstance = useAppStore((state) => state.playInstance);

  const play = async (event?: React.MouseEvent) => {
    event?.stopPropagation();
    setPlaying(true);
    await playInstance(instanceId);
    setPlaying(false);
  };

  return { play, playing };
};
