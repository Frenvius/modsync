import React from "react";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogTitle,
	DialogHeader,
	DialogContent,
	DialogDescription,
} from "@/components/ui/dialog";

import { profileService } from "~/services/profile.service";
import { AppStateContext } from "~/context/AppState/constants";
import { Modpack, ShareCode, syncService } from "~/services/sync.service";

interface JoinDialogProps {
	open: boolean;
	onClose: () => void;
	onJoined: (shareCode: string, host: string, port: number, modpack: Modpack, profileName: string) => void;
}

const JoinDialog = ({ open, onClose, onJoined }: JoinDialogProps) => {
	const { activeTmmProfile, refreshTmmProfiles, setActiveTmmProfile } = React.useContext(AppStateContext);
	const [shareCode, setShareCode] = React.useState("");
	const [isJoining, setIsJoining] = React.useState(false);
	const [error, setError] = React.useState("");

	const handleJoin = async () => {
		if (!shareCode.trim()) {
			setError("Enter a share code");
			return;
		}

		setIsJoining(true);
		setError("");

		try {
			const info: ShareCode = await syncService.decodeShareCode(shareCode);

			handleClose();

			const modpack: Modpack = await syncService.joinModpack(shareCode);

			let profileToUse = activeTmmProfile;
			if (!profileToUse) {
				const newProfile = await profileService.createTmmProfile(modpack.name);
				await refreshTmmProfiles();
				await setActiveTmmProfile(newProfile.name);
				profileToUse = newProfile.name;
			}

			onJoined(shareCode, info.host, info.port, modpack, profileToUse);
		} catch (err) {
			setIsJoining(false);
		}
	};

	const handleClose = () => {
		setShareCode("");
		setError("");
		setIsJoining(false);
		onClose();
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter" && shareCode.trim() && !isJoining) {
			handleJoin();
		} else if (e.key === "Escape") {
			handleClose();
		}
	};

	return (
		<Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
			<DialogContent className="sm:max-w-md glass">
				<DialogHeader>
					<DialogTitle>Join Modpack</DialogTitle>
					<DialogDescription>
						Enter the share code to join a modpack from a host
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-4 pt-4">
					<Input
						autoFocus
						type="text"
						value={shareCode}
						disabled={isJoining}
						onKeyDown={handleKeyDown}
						placeholder="Paste share code"
						onChange={(e) => setShareCode(e.target.value)}
					/>
					{error && <p className="text-sm text-destructive">{error}</p>}
					<div className="flex justify-end gap-2">
						<Button variant="outline" disabled={isJoining} onClick={handleClose}>
							Cancel
						</Button>
						<Button variant="glow" onClick={handleJoin} disabled={isJoining || !shareCode.trim()}>
							{isJoining && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
							{isJoining ? "Joining..." : "Join"}
						</Button>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
};

export default JoinDialog;
