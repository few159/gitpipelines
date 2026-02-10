import * as vscode from 'vscode';
import { fetchBranches } from './azureDevops';
import { pickWorkspaceFolder, ensurePat, readPipelineStore, updatePipeline, Pipeline } from './storage';

function sanitizeInput(value: string | undefined, fallback: string): string {
	if (value === undefined) {
		return fallback;
	}
	const trimmed = value.trim();
	return trimmed || fallback;
}

export function updatePipelineCommand(context: vscode.ExtensionContext, output: vscode.OutputChannel) {
	return async () => {
		const workspaceFolder = await pickWorkspaceFolder();
		if (!workspaceFolder) {
			vscode.window.showErrorMessage('Open a workspace folder to update a pipeline.');
			return;
		}

		const store = await readPipelineStore(workspaceFolder);
		if (!store.pipelines.length) {
			vscode.window.showInformationMessage('No pipelines found. Create one first.');
			return;
		}

		const picked = await vscode.window.showQuickPick(
			store.pipelines.map((p) => ({
				label: p.name,
				detail: `${p.org}/${p.project}/${p.repo}`,
				pipeline: p
			})),
			{ title: 'Select a pipeline to update' }
		);
		if (!picked?.pipeline) {
			return;
		}

		const pipeline = picked.pipeline;

		const nameInput = await vscode.window.showInputBox({
			title: 'Pipeline name',
			value: pipeline.name,
			ignoreFocusOut: true
		});
		if (nameInput === undefined) {
			return;
		}

		const orgInput = await vscode.window.showInputBox({
			title: 'Azure DevOps Organization',
			value: pipeline.org,
			ignoreFocusOut: true
		});
		if (orgInput === undefined) {
			return;
		}

		const projectInput = await vscode.window.showInputBox({
			title: 'Azure DevOps Project',
			value: pipeline.project,
			ignoreFocusOut: true
		});
		if (projectInput === undefined) {
			return;
		}

		const repoInput = await vscode.window.showInputBox({
			title: 'Azure DevOps Repository',
			value: pipeline.repo,
			ignoreFocusOut: true
		});
		if (repoInput === undefined) {
			return;
		}

		const projectAliasInput = await vscode.window.showInputBox({
			title: 'Project alias (optional)',
			prompt: 'A short alias to show in pipeline output',
			value: pipeline.projectAlias ?? '',
			ignoreFocusOut: true
		});

		const updateTargets = await vscode.window.showQuickPick(
			[
				{ label: 'Yes', target: true },
				{ label: 'No', target: false }
			],
			{ title: 'Update target branches?', placeHolder: 'Yes to reselect targets, No to keep current' }
		);
		if (!updateTargets) {
			return;
		}

		let targetBranches = pipeline.targetBranches;
		if (updateTargets.target) {
			const pat = await ensurePat(context.secrets);
			if (!pat) {
				vscode.window.showWarningMessage('A PAT is required to fetch branches.');
				return;
			}
			let branches: string[];
			try {
				branches = await fetchBranches({
					org: orgInput,
					project: projectInput,
					repo: repoInput,
					pat
				});
			} catch (error) {
				vscode.window.showErrorMessage(`Failed to fetch branches: ${String(error)}`);
				return;
			}
			if (!branches.length) {
				vscode.window.showWarningMessage('No branches found in this repository.');
				return;
			}

			const picks = await vscode.window.showQuickPick(branches, {
				title: 'Select target branches for the pipeline',
				canPickMany: true,
				placeHolder: 'Select one or more branches'
			});
			if (!picks) {
				return;
			}
			if (picks.length === 0) {
				vscode.window.showWarningMessage('Update cancelled: no branches selected.');
				return;
			}
			targetBranches = picks;
		}

		const updated: Pipeline = {
			...pipeline,
			name: sanitizeInput(nameInput, pipeline.name),
			org: sanitizeInput(orgInput, pipeline.org),
			project: sanitizeInput(projectInput, pipeline.project),
			projectAlias: sanitizeInput(projectAliasInput, pipeline.projectAlias ?? '') || undefined,
			repo: sanitizeInput(repoInput, pipeline.repo),
			targetBranches
		};

		try {
			await updatePipeline(workspaceFolder, updated);
			output.appendLine(`[gitpipelines] Updated pipeline "${updated.name}" targeting: ${updated.targetBranches.join(', ')}`);
			vscode.window.showInformationMessage(`Pipeline "${updated.name}" updated.`);
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to update pipeline: ${String(error)}`);
		}
	};
}

