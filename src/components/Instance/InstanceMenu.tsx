import type { Instance } from '~/domain/interfaces/instance.interface';

import React from 'react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { Copy, Trash2, Share2, FolderOpen, Settings2, MoreHorizontal } from 'lucide-react';

import { Button } from '~/components/ui/button';
import { useAppStore } from '~/usecase/store/appStore';
import ConfirmDialog from '~/components/commons/ConfirmDialog';
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuGroup,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from '~/components/ui/dropdown-menu';

interface InstanceMenuProps {
  instance: Instance;
  size?: 'icon-xs' | 'icon-sm' | 'icon';
  variant?: 'ghost' | 'outline';
}

const InstanceMenu = ({ instance, size = 'icon-sm', variant = 'ghost' }: InstanceMenuProps) => {
  const navigate = useNavigate();
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const deleteInstance = useAppStore((s) => s.deleteInstance);
  const duplicateInstance = useAppStore((s) => s.duplicateInstance);
  const createModpack = useAppStore((s) => s.createModpackFromInstance);

  const duplicate = async () => {
    const copy = await duplicateInstance(instance.id);
    toast.success(`Duplicated as "${copy.name}"`);
  };

  const share = async () => {
    const pack = await createModpack(instance.id);
    toast.success('Modpack created from instance');
    navigate(`/modpack/${pack.id}`);
  };

  const remove = () => {
    deleteInstance(instance.id);
    toast.success(`"${instance.name}" deleted`);
    navigate('/library');
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size={size} variant={variant} aria-label="Instance menu" onClick={(e) => e.stopPropagation()}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={() => navigate(`/instance/${instance.id}?tab=settings`)}>
              <Settings2 />
              Settings
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => toast.info('Opened instance folder')}>
              <FolderOpen />
              Open folder
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={duplicate}>
              <Copy />
              Duplicate
            </DropdownMenuItem>
            <DropdownMenuItem onClick={share}>
              <Share2 />
              Share as modpack
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem variant="destructive" onClick={() => setConfirmDelete(true)}>
              <Trash2 />
              Delete
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        destructive
        open={confirmDelete}
        onConfirm={remove}
        confirmLabel="Delete"
        onOpenChange={setConfirmDelete}
        title={`Delete "${instance.name}"?`}
        description="The instance folder, mods and saves will be removed. This cannot be undone."
      />
    </>
  );
};

export default InstanceMenu;
