export interface ModVersion {
	id: string;
	name: string;
	loaders: string[];
	project_id: string;
	version_number: string;
	date_published: string;
	game_versions: string[];
}

interface ModrinthMod {
	slug: string;
	title: string;
	author: string;
	description: string;
	icon_url: null | string;
}

export interface SelectVersionDialogProps {
	open: boolean;
	loader: string;
	mod: null | ModrinthMod;
	minecraftVersion: string;
	onOpenChange: (open: boolean) => void;
	onVersionSelect: (version: ModVersion) => void;
}
