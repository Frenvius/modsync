import { ExternalLink, Globe } from 'lucide-react';

import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { formatDownloads } from '~/usecase/util/stringUtils';

import { ModDetails } from './types';

interface ModDetailHeaderProps {
  mod: ModDetails;
  mode: 'browse' | 'modpack-view';
  onAddClick?: () => void;
}

export function ModDetailHeader({ mod, mode, onAddClick }: ModDetailHeaderProps) {
  const formattedDownloads = formatDownloads(mod.downloads);

  return (
    <div className="p-4 border-b border-border">
      <div className="flex gap-3">
        <div className="w-16 h-16 rounded-lg bg-secondary flex items-center justify-center overflow-hidden flex-shrink-0">
          {mod.icon_url ? (
            <img alt={mod.title} src={mod.icon_url} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-primary/30 to-primary/10" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h2 className="font-semibold text-foreground truncate">{mod.title}</h2>
              <p className="text-sm text-muted-foreground">by {mod.author}</p>
            </div>
            {mode === 'browse' && onAddClick && (
              <Button size="sm" variant="glow" onClick={onAddClick} className="flex-shrink-0">
                Add
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {mod.latest_version && (
              <Badge variant="secondary" className="text-xs">
                v{mod.latest_version}
              </Badge>
            )}
            <span className="text-xs text-muted-foreground">{formattedDownloads} downloads</span>
            {mod.website_url && (
              <a
                href={mod.website_url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
              >
                <Globe className="w-3 h-3" />
                Website
                <ExternalLink className="w-2.5 h-2.5" />
              </a>
            )}
            {mod.source_url && mod.source_url !== mod.website_url && (
              <a
                href={mod.source_url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
              >
                Source
                <ExternalLink className="w-2.5 h-2.5" />
              </a>
            )}
          </div>
        </div>
      </div>

      {mod.description && (
        <p className="text-sm text-muted-foreground mt-3 line-clamp-3">{mod.description}</p>
      )}
    </div>
  );
}
