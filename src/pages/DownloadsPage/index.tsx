import type { GameId } from '~/domain/enums/provider.enum';

import React from 'react';
import { Trash2, Download } from 'lucide-react';

import { GAMES } from '~/usecase/mock/games';
import { Button } from '~/components/ui/button';
import { useAppStore } from '~/usecase/store/appStore';
import GameIcon from '~/components/commons/GameIcon';
import EmptyState from '~/components/commons/EmptyState';
import PageHeader from '~/components/commons/PageHeader';
import DownloadItem from '~/components/Download/DownloadItem';
import { DownloadStatus } from '~/domain/enums/provider.enum';
import { formatSpeed } from '~/usecase/util/formatUtils';
import { Select, SelectItem, SelectGroup, SelectValue, SelectContent, SelectTrigger } from '~/components/ui/select';

const RUNNING = [DownloadStatus.Active, DownloadStatus.Queued, DownloadStatus.Paused];
const ALL_GAMES = '__all';

const DownloadsPage = () => {
  const downloads = useAppStore((s) => s.downloads);
  const clearCompleted = useAppStore((s) => s.clearCompleted);
  const [gameId, setGameId] = React.useState<GameId | typeof ALL_GAMES>(ALL_GAMES);
  const visibleDownloads = gameId === ALL_GAMES ? downloads : downloads.filter((download) => download.gameId === gameId);
  const running = visibleDownloads.filter((d) => RUNNING.includes(d.status));
  const finished = visibleDownloads.filter((d) => !RUNNING.includes(d.status));
  const speed = running.reduce((acc, d) => acc + d.bytesPerSecond, 0);

  return (
    <div className="flex flex-col gap-4 p-4">
      <PageHeader title="Downloads" description={running.length ? `${running.length} in progress · ${formatSpeed(speed)}` : 'Nothing in progress.'}>
        <Select value={gameId} onValueChange={(value) => setGameId(value as GameId | typeof ALL_GAMES)}>
          <SelectTrigger className="w-44" aria-label="Filter downloads by game">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value={ALL_GAMES}>All games</SelectItem>
              {GAMES.map((game) => (
                <SelectItem key={game.id} value={game.id}>
                  <GameIcon size="sm" gameId={game.id} />
                  {game.name}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <Button variant="outline" disabled={finished.length === 0} onClick={() => clearCompleted(gameId === ALL_GAMES ? undefined : gameId)}>
          <Trash2 data-icon="inline-start" />
          Clear finished
        </Button>
      </PageHeader>

      {visibleDownloads.length === 0 && <EmptyState icon={Download} title="No downloads yet" description="Installs and updates will show up here." />}

      {running.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold">In progress</h2>
          {running.map((d) => (
            <DownloadItem key={d.id} item={d} />
          ))}
        </section>
      )}

      {finished.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold">Finished</h2>
          {finished.map((d) => (
            <DownloadItem key={d.id} item={d} />
          ))}
        </section>
      )}
    </div>
  );
};

export default DownloadsPage;
