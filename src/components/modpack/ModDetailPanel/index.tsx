import React from 'react';

import { AlertCircle, Loader2, X } from 'lucide-react';

import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { ScrollArea } from '~/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs';

import { AddToModpackDialog } from '../AddToModpackDialog';

import { MarkdownContent } from './MarkdownContent';
import { ModDetailHeader } from './ModDetailHeader';
import { ModDetailPanelProps } from './types';

export function ModDetailPanel({
  mod,
  loading,
  error,
  onClose,
  mode
}: ModDetailPanelProps) {
  const [addDialogOpen, setAddDialogOpen] = React.useState(false);

  if (loading) {
    return (
      <div className="h-full flex flex-col bg-card border-l border-border">
        <div className="flex items-center justify-between p-2 px-4 border-b border-border">
          <h3 className="text-sm font-medium text-foreground">Mod Details</h3>
          <Button size="icon" variant="ghost" onClick={onClose} className="h-7 w-7">
            <X className="w-4 h-4" />
          </Button>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (error || !mod) {
    return (
      <div className="h-full flex flex-col bg-card border-l border-border">
        <div className="flex items-center justify-between p-2 px-4 border-b border-border">
          <h3 className="text-sm font-medium text-foreground">Mod Details</h3>
          <Button size="icon" variant="ghost" onClick={onClose} className="h-7 w-7">
            <X className="w-4 h-4" />
          </Button>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6">
          <AlertCircle className="w-10 h-10 text-destructive" />
          <p className="text-sm text-muted-foreground text-center">{error || 'Failed to load mod details'}</p>
        </div>
      </div>
    );
  }

  const readmeContent = mod.readme ?? mod.body;

  return (
    <>
      <div className="h-full flex flex-col bg-card border-l border-border">
        <div className="flex items-center justify-between p-2 px-4 flex-shrink-0 border-b border-border">
          <h3 className="text-sm font-medium text-foreground">Mod Details</h3>
          <Button size="icon" variant="ghost" onClick={onClose} className="h-7 w-7">
            <X className="w-4 h-4" />
          </Button>
        </div>

        <ModDetailHeader
          mod={mod}
          mode={mode}
          onAddClick={mode === 'browse' ? () => setAddDialogOpen(true) : undefined}
        />

        <Tabs defaultValue="readme" className="flex-1 flex flex-col overflow-hidden min-h-0">
          <TabsList className="mx-4 mt-3 flex-shrink-0 w-auto self-start">
            <TabsTrigger value="readme" className="text-xs">README</TabsTrigger>
            <TabsTrigger value="changelog" className="text-xs">Changelog</TabsTrigger>
            <TabsTrigger value="dependencies" className="text-xs">
              Deps {mod.dependencies.length > 0 && `(${mod.dependencies.length})`}
            </TabsTrigger>
            <TabsTrigger value="info" className="text-xs">Info</TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-hidden min-h-0 mt-2">
            <TabsContent value="readme" className="h-full m-0 data-[state=active]:flex data-[state=active]:flex-col">
              <MarkdownContent content={readmeContent} emptyMessage="No README available" />
            </TabsContent>

            <TabsContent value="changelog" className="h-full m-0 data-[state=active]:flex data-[state=active]:flex-col">
              <MarkdownContent content={mod.changelog} emptyMessage="No changelog available" />
            </TabsContent>

            <TabsContent value="dependencies" className="h-full m-0 data-[state=active]:flex data-[state=active]:flex-col">
              <ScrollArea className="h-full">
                <div className="p-4 space-y-2">
                  {mod.dependencies.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">No dependencies</p>
                  ) : (
                    mod.dependencies.map((dep) => (
                      <div key={dep.slug} className="flex items-center gap-3 p-2 rounded-lg bg-secondary/50">
                        {dep.icon_url ? (
                          <img src={dep.icon_url} alt={dep.title} className="w-8 h-8 rounded object-cover flex-shrink-0" />
                        ) : (
                          <div className="w-8 h-8 rounded bg-gradient-to-br from-primary/30 to-primary/10 flex-shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{dep.title || dep.slug}</p>
                          {dep.author && <p className="text-xs text-muted-foreground">by {dep.author}</p>}
                        </div>
                        <Badge variant="outline" className="text-xs flex-shrink-0">
                          {dep.dependency_type}
                        </Badge>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="info" className="h-full m-0 data-[state=active]:flex data-[state=active]:flex-col">
              <ScrollArea className="h-full">
                <div className="p-4 space-y-4">
                  <InfoRow label="Source" value={mod.source === 'thunderstore' ? 'Thunderstore' : 'Modrinth'} />
                  {mod.latest_version && <InfoRow label="Latest Version" value={mod.latest_version} />}
                  <InfoRow label="Downloads" value={mod.downloads.toLocaleString()} />
                  <InfoRow label="Follows" value={mod.follows.toLocaleString()} />
                  {mod.file_size && <InfoRow label="File Size" value={formatFileSize(mod.file_size)} />}
                  {mod.date_created && <InfoRow label="Created" value={formatDate(mod.date_created)} />}
                  {mod.date_updated && <InfoRow label="Updated" value={formatDate(mod.date_updated)} />}
                  {mod.categories.length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Categories</p>
                      <div className="flex flex-wrap gap-1">
                        {mod.categories.map((cat) => (
                          <Badge key={cat} variant="outline" className="text-xs">
                            {cat}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {mod.issues_url && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Issues</p>
                      <a
                        href={mod.issues_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-primary hover:underline truncate block"
                      >
                        {mod.issues_url}
                      </a>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>
          </div>
        </Tabs>
      </div>

      {mod && mode === 'browse' && (
        <AddToModpackDialog
          modSlug={mod.slug}
          modName={mod.title}
          modAuthor={mod.author}
          modIconUrl={mod.icon_url}
          open={addDialogOpen}
          onOpenChange={setAddDialogOpen}
        />
      )}
    </>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm text-foreground">{value}</p>
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}
