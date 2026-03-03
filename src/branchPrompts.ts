import * as vscode from 'vscode';
import { TargetBranch } from './storage';

export async function promptTemporaryBranches(selectedBranches: string[]): Promise<TargetBranch[] | undefined> {
	const tempPicks = await vscode.window.showQuickPick(
		selectedBranches.map((b) => ({ label: b, picked: false })),
		{
			title: 'Which branches should use a temporary PR branch?',
			canPickMany: true,
			placeHolder: 'Select branches (or skip to use none)'
		}
	);

	if (tempPicks === undefined) {
		return undefined;
	}

	const tempNames = new Set(tempPicks.map((p) => p.label));

	const targets: TargetBranch[] = [];
	for (const branch of selectedBranches) {
		if (tempNames.has(branch)) {
			const suffix = await vscode.window.showInputBox({
				title: `Temp branch suffix for "${branch}"`,
				prompt: `The temp branch will be named {source}-{suffix}`,
				value: 'temp',
				ignoreFocusOut: true
			});
			if (suffix === undefined) {
				return undefined;
			}
			targets.push({ name: branch, temporary: true, tempSuffix: suffix.trim() || 'temp' });
		} else {
			targets.push({ name: branch });
		}
	}

	return targets;
}
