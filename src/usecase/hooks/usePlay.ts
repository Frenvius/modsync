import React from 'react';

import { toast } from 'sonner';

import { useAppStore } from '~/usecase/store/appStore';
import { getErrorMessage } from '~/usecase/util/getErrorMessage';

export const usePlay = (instanceId: string) => {
  const [playing, setPlaying] = React.useState(false);
  const playInstance = useAppStore((state) => state.playInstance);

  const play = async (event?: React.MouseEvent) => {
    event?.stopPropagation();
    setPlaying(true);
    try {
      await playInstance(instanceId);
      toast.success('Game launched');
    } catch (error) {
      toast.error(getErrorMessage(error, 'Could not launch the game'));
    } finally {
      setPlaying(false);
    }
  };

  return { play, playing };
};
