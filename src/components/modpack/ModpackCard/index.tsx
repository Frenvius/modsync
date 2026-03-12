import React from 'react';
import { useNavigate } from 'react-router-dom';

import { invoke } from '@tauri-apps/api/core';
import {
  AlertCircle,
  Copy,
  Download,
  FolderOpen,
  Loader2,
  MoreVertical,
  Package,
  Pencil,
  Play,
  RefreshCw,
  Share2,
  Trash2,
  Users,
  Wifi,
  WifiOff
} from 'lucide-react';

import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { toast } from '~/usecase/hooks/use-toast';
import { Progress } from '~/components/ui/progress';
import { getStageLabel } from '~/usecase/util/labelUtils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '~/components/ui/dropdown-menu';

import { GamePathDialog } from '../GamePathDialog';
import { EditModpackDialog } from '../EditModpackDialog';
import { ShareModpackDialog } from '../ShareModpackDialog';
import { DeleteModpackDialog } from '../DeleteModpackDialog';

import { ModpackCardProps } from './types';

export function ModpackCard({
  id,
  name,
  onEdit,
  version,
  modCount,
  gameId,
  modSource,
  imageUrl,
  syncInfo,
  onDelete,
  onClone,
  imagePath,
  shareCode,
  installStatus,
  isOwner = false,
  onShareStatusChange
}: ModpackCardProps) {
  const navigate = useNavigate();
  const [shareDialogOpen, setShareDialogOpen] = React.useState(false);
  const [editDialogOpen, setEditDialogOpen] = React.useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [gamePathDialogOpen, setGamePathDialogOpen] = React.useState(false);
  const [isLaunching, setIsLaunching] = React.useState(false);
  const [resolvedImageUrl, setResolvedImageUrl] = React.useState<null | string>(null);

  const isThunderstoreGame = modSource === 'thunderstore';

  const handleThunderstoreLaunch = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsLaunching(true);
    try {
      await invoke('launch_thunderstore_instance', { modpackId: id });
    } catch (err) {
      const { toast } = await import('~/usecase/hooks/use-toast');
      toast({ title: 'Launch failed', variant: 'destructive', description: String(err) });
    } finally {
      setIsLaunching(false);
    }
  };

  React.useEffect(() => {
    const resolveImage = async () => {
      if (imagePath) {
        try {
          const dataUrl = await invoke<string>('get_image_data', {
            relativePath: imagePath
          });
          setResolvedImageUrl(dataUrl);
        } catch (err) {
          console.error('Failed to resolve image:', err);
          setResolvedImageUrl(null);
        }
      } else {
        setResolvedImageUrl(imageUrl || null);
      }
    };
    resolveImage();
  }, [imagePath, imageUrl]);

  const handleCardClick = () => {
    navigate(`/modpack/${id}`);
  };

  const handleDuplicate = () => {
    toast({
      title: 'Modpack duplicated',
      description: `"${name} (Copy)" has been created.`
    });
  };

  return (
    <>
      <div
        onClick={handleCardClick}
        className="group relative bg-card hover:bg-card-hover border border-border rounded-lg overflow-hidden transition-all duration-300 hover:shadow-lg hover:shadow-primary/5 hover:border-primary/30 cursor-pointer animate-fade-in flex h-20"
      >
        <div className="w-20 h-20 shrink-0 relative overflow-hidden">
          {resolvedImageUrl ? (
            <img alt={name} src={resolvedImageUrl} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-primary/20 via-card to-card flex items-center justify-center">
              <Package className="w-8 h-8 text-primary/50" />
            </div>
          )}
          {isOwner ? (
            <Badge className="absolute top-1 left-1 bg-primary/90 text-[10px] px-1.5 py-0 h-5">Owner</Badge>
          ) : (
            <Badge className="absolute top-1 left-1 bg-blue-500/90 text-[10px] px-1.5 py-0 h-5 gap-0.5">
              <Users className="w-2.5 h-2.5" />
              Joined
            </Badge>
          )}
        </div>
        <div className="flex-1 p-2 flex flex-col justify-between min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1 flex flex-col justify-center">
              <h3 className="font-medium text-sm text-foreground group-hover:text-primary transition-colors truncate">{name}</h3>
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                <span>{version}</span>
                <div className="flex items-center gap-1">
                  <Package className="w-3 h-3" />
                  <span>{modCount}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {!isOwner &&
                syncInfo &&
                (syncInfo.checking ? (
                  <Badge
                    variant="outline"
                    className="gap-1 text-[10px] px-1.5 py-0 h-5 border-muted-foreground/50 text-muted-foreground bg-muted"
                  >
                    <Loader2 className="w-2 h-2 animate-spin" />
                    Checking
                  </Badge>
                ) : syncInfo.is_synced ? (
                  <Badge variant="outline" className="gap-1 text-[10px] px-1.5 py-0 h-5 border-primary/50 text-primary bg-primary/10">
                    <RefreshCw className="w-2 h-2" />
                    Synced
                  </Badge>
                ) : syncInfo.owner_online ? (
                  <Badge variant="outline" className="gap-1 text-[10px] px-1.5 py-0 h-5 border-warning/50 text-warning bg-warning/10">
                    <AlertCircle className="w-2 h-2" />
                    Update
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="gap-1 text-[10px] px-1.5 py-0 h-5 border-muted-foreground/50 text-muted-foreground bg-muted"
                  >
                    <WifiOff className="w-2 h-2" />
                    Offline
                  </Badge>
                ))}
              {isOwner && shareCode && (
                <Badge variant="outline" className="gap-1 text-[10px] px-1.5 py-0 h-5 border-primary/50 text-primary bg-primary/10">
                  <Wifi className="w-2 h-2" />
                  Sharing
                </Badge>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                  <Button size="icon" variant="ghost" className="h-6 w-6">
                    <MoreVertical className="w-3 h-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-popover">
                  {!isOwner && onClone && (
                    <>
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          onClone();
                        }}
                      >
                        <Copy className="w-4 h-4 mr-2" />
                        Clone
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                    </>
                  )}
                  {isOwner && (
                    <>
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          setShareDialogOpen(true);
                        }}
                      >
                        <Share2 className="w-4 h-4 mr-2" />
                        Share
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditDialogOpen(true);
                        }}
                      >
                        <Pencil className="w-4 h-4 mr-2" />
                        Edit Modpack
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDuplicate();
                        }}
                      >
                        <Copy className="w-4 h-4 mr-2" />
                        Duplicate
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                    </>
                  )}
                  {isThunderstoreGame && (
                    <>
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          setGamePathDialogOpen(true);
                        }}
                      >
                        <FolderOpen className="w-4 h-4 mr-2" />
                        Set Game Path
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                    </>
                  )}
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteDialogOpen(true);
                    }}
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    {isOwner ? 'Delete' : 'Leave Modpack'}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {isThunderstoreGame ? (
              <Button
                size="sm"
                variant="glow"
                onClick={handleThunderstoreLaunch}
                disabled={isLaunching}
                className="flex-1 gap-1 h-6 text-[11px]"
              >
                {isLaunching ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                {isLaunching ? 'Launching...' : 'Launch'}
              </Button>
            ) : installStatus?.installing ? (
              <div onClick={(e) => e.stopPropagation()} className="flex-1 flex flex-col gap-1">
                <div className="flex items-center gap-1.5">
                  <Loader2 className="w-3 h-3 animate-spin text-primary shrink-0" />
                  <span className="text-[10px] text-muted-foreground truncate">
                    {getStageLabel(installStatus.progress?.stage || 'installing')}
                  </span>
                </div>
                <Progress
                  className="h-1.5"
                  value={
                    installStatus.progress
                      ? installStatus.progress.total > 0
                        ? (installStatus.progress.current / installStatus.progress.total) * 100
                        : 0
                      : 0
                  }
                />
              </div>
            ) : installStatus?.installed ? (
              <Button size="sm" variant="glow" onClick={(e) => e.stopPropagation()} className="flex-1 gap-1 h-6 text-[11px]">
                <Play className="w-3 h-3" />
                Launch
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={(e) => e.stopPropagation()} className="flex-1 gap-1 h-6 text-[11px]">
                <Download className="w-3 h-3" />
                Install
              </Button>
            )}
            {isOwner && (
              <Button
                size="sm"
                variant="outline"
                className="h-6 w-6 p-0"
                onClick={(e) => {
                  e.stopPropagation();
                  setShareDialogOpen(true);
                }}
              >
                <Share2 className="w-3 h-3" />
              </Button>
            )}
          </div>
        </div>
      </div>
      {isOwner && (
        <ShareModpackDialog
          modpackId={id}
          modpackName={name}
          open={shareDialogOpen}
          currentShareCode={shareCode}
          onOpenChange={setShareDialogOpen}
          onShareStatusChange={onShareStatusChange}
        />
      )}
      <EditModpackDialog
        modpackId={id}
        onSave={onEdit}
        modpackName={name}
        open={editDialogOpen}
        modpackVersion={version}
        modpackImagePath={imagePath}
        onOpenChange={setEditDialogOpen}
      />
      <DeleteModpackDialog modpackName={name} onConfirm={onDelete} open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen} />
      {isThunderstoreGame && (
        <GamePathDialog open={gamePathDialogOpen} gameId={gameId} gameName={name} onOpenChange={setGamePathDialogOpen} />
      )}
    </>
  );
}
