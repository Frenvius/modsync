import React from 'react';

import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Check, Copy, Minus, Plus, Search, Square, Trash2, User, X } from 'lucide-react';

import { Input } from '~/components/ui/input';
import { Button } from '~/components/ui/button';
import { useGame } from '~/usecase/contexts/GameContext';
import { LoginDialog } from '~/components/auth/LoginDialog';
import { Avatar, AvatarFallback, AvatarImage } from '~/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '~/components/ui/dropdown-menu';

import { AccountInfo } from './types';

export const TopBar = React.memo(function TopBar() {
  const [isMaximized, setIsMaximized] = React.useState(false);
  const [accounts, setAccounts] = React.useState<AccountInfo[]>([]);
  const [loginDialogOpen, setLoginDialogOpen] = React.useState(false);
  const appWindow = getCurrentWindow();
  const { selectedGame } = useGame();

  const loadAccounts = React.useCallback(async () => {
    try {
      const accountList = await invoke<AccountInfo[]>('list_accounts');
      setAccounts(accountList);
    } catch (err) {
      console.error('Failed to load accounts:', err);
    }
  }, []);

  React.useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  React.useEffect(() => {
    const checkMaximized = async () => {
      setIsMaximized(await appWindow.isMaximized());
    };
    checkMaximized();

    const unlisten = appWindow.onResized(async () => {
      setIsMaximized(await appWindow.isMaximized());
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const handleSetDefault = React.useCallback(async (uuid: string) => {
    try {
      await invoke('set_default_account', { uuid });
      await loadAccounts();
    } catch (err) {
      console.error('Failed to set default account:', err);
    }
  }, [loadAccounts]);

  const handleRemoveAccount = React.useCallback(async (uuid: string) => {
    try {
      await invoke('remove_account', { uuid });
      await loadAccounts();
    } catch (err) {
      console.error('Failed to remove account:', err);
    }
  }, [loadAccounts]);

  const handleLoginSuccess = React.useCallback(async () => {
    await loadAccounts();
  }, [loadAccounts]);

  const defaultAccount = React.useMemo(() => accounts.find((a) => a.is_default), [accounts]);

  const getHeadUrl = React.useCallback((uuid: string) => {
    return `https://mc-heads.net/avatar/${uuid}/32`;
  }, []);

  return (
    <>
      <header
        data-tauri-drag-region
        className="h-12 border-b border-border bg-background/80 backdrop-blur-xl sticky top-0 z-40 select-none"
      >
        <div data-tauri-drag-region className="h-full flex items-center justify-between px-4">
          <div className="relative w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search modpacks, mods..." className="pl-10 bg-secondary border-border h-8 text-sm" />
          </div>
          <div className="flex items-center">
            {selectedGame?.id === 'minecraft' && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="icon" variant="ghost" className="rounded-full h-8 w-8">
                    {defaultAccount ? (
                      <Avatar className="h-7 w-7">
                        <AvatarImage alt={defaultAccount.username} src={getHeadUrl(defaultAccount.uuid)} />
                        <AvatarFallback className="text-xs">{defaultAccount.username.slice(0, 2).toUpperCase()}</AvatarFallback>
                      </Avatar>
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center">
                        <User className="w-3.5 h-3.5 text-primary" />
                      </div>
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-popover w-64">
                  {accounts.length > 0 ? (
                    <>
                      <DropdownMenuLabel>Accounts</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {accounts.map((account) => (
                        <DropdownMenuItem
                          key={account.uuid}
                          onClick={() => handleSetDefault(account.uuid)}
                          className="flex items-center justify-between cursor-pointer"
                        >
                          <div className="flex items-center gap-2">
                            <Avatar className="h-6 w-6">
                              <AvatarImage alt={account.username} src={getHeadUrl(account.uuid)} />
                              <AvatarFallback className="text-[10px]">{account.username.slice(0, 2).toUpperCase()}</AvatarFallback>
                            </Avatar>
                            <span className="font-medium">{account.username}</span>
                            {account.is_default && <Check className="w-3 h-3 text-primary" />}
                          </div>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 opacity-50 hover:opacity-100 hover:text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveAccount(account.uuid);
                            }}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </DropdownMenuItem>
                      ))}
                      <DropdownMenuSeparator />
                    </>
                  ) : (
                    <>
                      <DropdownMenuLabel className="text-center text-muted-foreground font-normal">No accounts linked</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                    </>
                  )}
                  <DropdownMenuItem className="cursor-pointer" onClick={() => setLoginDialogOpen(true)}>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Microsoft Account
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <div className="flex items-center ml-4 -mr-4">
              <button
                onClick={() => appWindow.minimize()}
                className="h-12 px-4 hover:bg-muted/50 transition-colors flex items-center justify-center"
              >
                <Minus className="w-4 h-4 text-muted-foreground" />
              </button>
              <button
                onClick={() => appWindow.toggleMaximize()}
                className="h-12 px-4 hover:bg-muted/50 transition-colors flex items-center justify-center"
              >
                {isMaximized ? (
                  <Copy className="w-3.5 h-3.5 text-muted-foreground rotate-180" />
                ) : (
                  <Square className="w-3 h-3 text-muted-foreground" />
                )}
              </button>
              <button
                onClick={() => appWindow.close()}
                className="h-12 px-4 hover:bg-destructive transition-colors flex items-center justify-center group"
              >
                <X className="w-4 h-4 text-muted-foreground group-hover:text-destructive-foreground" />
              </button>
            </div>
          </div>
        </div>
      </header>
      <LoginDialog isOpen={loginDialogOpen} onSuccess={handleLoginSuccess} onOpenChange={setLoginDialogOpen} />
    </>
  );
});
