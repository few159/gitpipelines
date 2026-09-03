import * as vscode from 'vscode';

function validateWorkItemIds(value: string): string | null {
	if (!value.trim()) {
		return null;
	}
	return value.split(',').every((part) => {
		const id = part.trim();
		return /^\d+$/.test(id) && Number.isSafeInteger(Number(id)) && Number(id) > 0;
	}) ? null : 'Enter positive numeric work item IDs separated by commas';
}

export async function promptWorkItemIds(sourceBranch: string): Promise<number[] | undefined> {
	const detectedId = /^[^/]+\/(\d+)-.+$/.exec(sourceBranch)?.[1] ?? '';
	const input = await vscode.window.showInputBox({
		title: 'Optional: Work Item IDs to link to PRs',
		prompt: 'Enter Azure DevOps work item IDs separated by commas, or leave blank',
		value: validateWorkItemIds(detectedId) === null ? detectedId : '',
		ignoreFocusOut: true,
		validateInput: validateWorkItemIds
	});
	return input?.trim()
		? [...new Set(input.split(',').map((id) => Number(id.trim())))]
		: undefined;
}
