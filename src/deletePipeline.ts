import * as vscode from 'vscode';
import { deletePipeline, getWorkspaceFolder, readPipelineStore } from './storage';

export function deletePipelineCommand(output: vscode.OutputChannel) {
	return async () => {
		const workspaceFolder = getWorkspaceFolder();
		if (!workspaceFolder) {
			vscode.window.showErrorMessage('Open a workspace folder to delete a pipeline.');
			return;
		}

		const store = await readPipelineStore(workspaceFolder);
		if (!store.pipelines.length) {
			vscode.window.showInformationMessage('No pipelines found to delete.');
		 return;
		}

		const picked = await vscode.window.showQuickPick(
			store.pipelines.map((p) => ({
				label: p.name,
				detail: `${p.org}/${p.project}/${p.repo}`,
				pipeline: p
			})),
			{ title: 'Select a pipeline to delete' }
		);
		if (!picked?.pipeline) {
			return;
		}

		const confirmed = await vscode.window.showWarningMessage(
			`Delete pipeline "${picked.pipeline.name}"?`,
			{ modal: true },
			'Delete'
		);
		if (confirmed !== 'Delete') {
			return;
		}

		try {
			await deletePipeline(workspaceFolder, picked.pipeline.id);
			output.appendLine(`[gitpipelines] Deleted pipeline "${picked.pipeline.name}"`);
			vscode.window.showInformationMessage(`Pipeline "${picked.pipeline.name}" deleted.`);
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to delete pipeline: ${String(error)}`);
		}
	};
}

