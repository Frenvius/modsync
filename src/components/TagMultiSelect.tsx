import React from 'react';

import { Check, ChevronDown, X } from 'lucide-react';

import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '~/components/ui/popover';
import { ScrollArea } from '~/components/ui/scroll-area';
import { cn } from '~/usecase/util/stringUtils';

interface TagMultiSelectProps {
  categories: string[];
  selected: string[];
  onSelectedChange: (selected: string[]) => void;
  disabledItems?: string[];
  label: string;
  variant?: 'default' | 'destructive';
}

export function TagMultiSelect({
  categories,
  selected,
  onSelectedChange,
  disabledItems = [],
  label,
  variant = 'default'
}: TagMultiSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');

  const filtered = categories.filter(
    (c) => c.toLowerCase().includes(search.toLowerCase()) && !disabledItems.includes(c)
  );

  const toggle = (category: string) => {
    if (selected.includes(category)) {
      onSelectedChange(selected.filter((s) => s !== category));
    } else {
      onSelectedChange([...selected, category]);
    }
  };

  const isDestructive = variant === 'destructive';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            'h-9 gap-1.5',
            isDestructive && selected.length > 0 && 'border-destructive/50 text-destructive'
          )}
        >
          {label}
          {selected.length > 0 && (
            <Badge
              variant={isDestructive ? 'destructive' : 'default'}
              className="ml-1 h-5 px-1.5 text-xs rounded-full"
            >
              {selected.length}
            </Badge>
          )}
          <ChevronDown className="w-3.5 h-3.5 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <div className="p-2 border-b">
          <Input
            placeholder="Search tags..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 text-sm"
          />
        </div>
        <ScrollArea className="h-56">
          <div className="p-1">
            {filtered.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">No tags found</p>
            )}
            {filtered.map((category) => {
              const isSelected = selected.includes(category);
              return (
                <button
                  key={category}
                  onClick={() => toggle(category)}
                  className={cn(
                    'flex items-center gap-2 w-full rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors',
                    isSelected && !isDestructive && 'bg-primary/10 text-primary',
                    isSelected && isDestructive && 'bg-destructive/10 text-destructive'
                  )}
                >
                  <div
                    className={cn(
                      'flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border',
                      isSelected && !isDestructive && 'bg-primary border-primary text-primary-foreground',
                      isSelected && isDestructive && 'bg-destructive border-destructive text-destructive-foreground',
                      !isSelected && 'border-muted-foreground/30'
                    )}
                  >
                    {isSelected && <Check className="h-3 w-3" />}
                  </div>
                  {category}
                </button>
              );
            })}
          </div>
        </ScrollArea>
        {selected.length > 0 && (
          <div className="p-2 border-t">
            <Button
              variant="ghost"
              size="sm"
              className="w-full h-7 text-xs"
              onClick={() => onSelectedChange([])}
            >
              Clear all
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

interface ActiveFilterBadgesProps {
  selectedCategories: string[];
  excludedCategories: string[];
  onRemoveSelected: (category: string) => void;
  onRemoveExcluded: (category: string) => void;
}

export function ActiveFilterBadges({
  selectedCategories,
  excludedCategories,
  onRemoveSelected,
  onRemoveExcluded
}: ActiveFilterBadgesProps) {
  if (selectedCategories.length === 0 && excludedCategories.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {selectedCategories.map((cat) => (
        <Badge key={`inc-${cat}`} variant="default" className="gap-1 pr-1 cursor-pointer" onClick={() => onRemoveSelected(cat)}>
          {cat}
          <X className="w-3 h-3" />
        </Badge>
      ))}
      {excludedCategories.map((cat) => (
        <Badge
          key={`exc-${cat}`}
          variant="destructive"
          className="gap-1 pr-1 cursor-pointer"
          onClick={() => onRemoveExcluded(cat)}
        >
          -{cat}
          <X className="w-3 h-3" />
        </Badge>
      ))}
    </div>
  );
}
