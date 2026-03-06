export interface Modpack {
	id: string;
	name: string;
	loader: string;
	minecraft_version: string;
	mods: { slug: string; title: string }[];
}

export interface JoinModpackDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onJoined?: (modpackId: string) => void;
}
