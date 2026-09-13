import type { InstanceMenuProps } from './types';

import React from 'react';
import { useNavigate } from 'react-router-dom';

import { toast } from 'sonner';
import { Copy, Trash2, Settings2, FolderOpen, MoreHorizontal } from 'lucide-react';

import { Button } from '~/components/ui/button';
import { useAppStore } from '~/usecase/store/appStore';
import { instanceService } from '~/usecase/service/instance';
import ConfirmDialog from '~/components/commons/ConfirmDialog';
import { getErrorMessage } from '~/usecase/util/getErrorMessage';
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuGroup,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from '~/components/ui/dropdown-menu';

const InstanceMenu = ({ instance, size = 'icon-sm', variant = 'ghost' }: InstanceMenuProps) => {
  const navigate = useNavigate();
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const deleteInstance = useAppStore((s) => s.deleteInstance);
  const duplicateInstance = useAppStore((s) => s.duplicateInstance);

  const duplicate = async () => {
    try {
      const copy = await duplicateInstance(instance.id);
      toast.success(`Duplicated as "${copy.name}"`);
    } catch (error) {
      toast.error(getErrorMessage(error, 'Could not duplicate the instance'));
    }
  };

  const openFolder = async () => {
    try {
      await instanceService.openFolder(instance);
    } catch (error) {
      toast.error(getErrorMessage(error, 'Could not open the instance folder'));
    }
  };

  const remove = async () => {
    try {
      await deleteInstance(instance.id);
      toast.success(`"${instance.name}" deleted`);
      navigate('/library');
    } catch (error) {
      toast.error(getErrorMessage(error, 'Could not delete the instance'));
    }
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
            <DropdownMenuItem onClick={openFolder}>
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
        onConfirm={remove}
        open={confirmDelete}
        confirmLabel="Delete"
        onOpenChange={setConfirmDelete}
        title={`Delete "${instance.name}"?`}
        description={
          instance.location.kind === 'external'
            ? 'ModSync will forget this instance. The linked folder will remain on disk.'
            : 'The instance folder, mods and saves will be permanently removed.'
        }
      />
    </>
  );
};

export default InstanceMenu;
