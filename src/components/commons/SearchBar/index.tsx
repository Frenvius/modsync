import { X, Search } from 'lucide-react';

import { cn } from '~/lib/utils';
import { Input } from '~/components/ui/input';
import { Button } from '~/components/ui/button';

interface SearchBarProps {
  value: string;
  className?: string;
  autoFocus?: boolean;
  placeholder?: string;
  onChange: (value: string) => void;
}

const SearchBar = ({ value, onChange, className, autoFocus, placeholder = 'Search' }: SearchBarProps) => (
  <div className={cn('relative', className)}>
    <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
    <Input
      value={value}
      autoFocus={autoFocus}
      placeholder={placeholder}
      className="bg-muted/40 pr-8 pl-8"
      onChange={(e) => onChange(e.target.value)}
    />
    {value && (
      <Button
        size="icon-xs"
        variant="ghost"
        aria-label="Clear search"
        onClick={() => onChange('')}
        className="absolute top-1/2 right-1 -translate-y-1/2"
      >
        <X />
      </Button>
    )}
  </div>
);

export default SearchBar;
