import * as vscode from 'vscode';
import { randomUUID } from 'node:crypto';
import { addPipeline, ensurePat, pickWorkspaceFolder, Pipeline } from './storage';
import { fetchBranches } from './azureDevops';
import { getOriginUrl, parseAzureRemoteUrl } from './git';

function makeId(): string {
	return typeof randomUUID === 'function' ? randomUUID() : `pipeline-${Date.now()}`;
}

async function promptOrWarn(title: string, value?: string): Promise<string | undefined> {
	const input = await vscode.window.showInputBox({
		title,
		value,
		ignoreFocusOut: true
	});
	return input?.trim();
}

export function createPipelineCommand(context: vscode.ExtensionContext, output: vscode.OutputChannel) {
	return async () => {
		const workspaceFolder = await pickWorkspaceFolder();
		if (!workspaceFolder) {
			vscode.window.showErrorMessage('Open a workspace folder to create a pipeline.');
			return;
		}

		const originUrl = await getOriginUrl(workspaceFolder);
		const defaults = parseAzureRemoteUrl(originUrl);

		const org = await promptOrWarn('Azure DevOps Organization', defaults?.org);
		if (!org) {
			return;
		}

		const project = await promptOrWarn('Azure DevOps Project', defaults?.project);
		if (!project) {
			return;
		}

		const repo = await promptOrWarn('Azure DevOps Repository', defaults?.repo);
		if (!repo) {
			return;
		}

		const pat = await ensurePat(context.secrets);
		if (!pat) {
			vscode.window.showWarningMessage('A PAT is required to fetch branches.');
			return;
		}

		let branches: string[];
		try {
			branches = await fetchBranches({ org, project, repo, pat });
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to fetch branches: ${String(error)}`);
			return;
		}

		if (!branches.length) {
			vscode.window.showWarningMessage('No branches found in this repository.');
			return;
		}

		const targets = await vscode.window.showQuickPick(branches, {
			title: 'Select target branches for the pipeline',
			canPickMany: true,
			placeHolder: 'Select one or more branches'
		});

		if (!targets || targets.length === 0) {
			vscode.window.showInformationMessage('Pipeline creation cancelled (no branches selected).');
			return;
		}

		const pipelineName = await promptOrWarn('Pipeline name', `${project}-${repo}-pipeline`);
		if (!pipelineName) {
			return;
		}

		const projectAlias = await vscode.window.showInputBox({
			title: 'Project alias (optional)',
			prompt: 'A short alias to show in pipeline output',
			value: defaults?.project
		});

		const pipeline: Pipeline = {
			id: makeId(),
			name: pipelineName,
			org,
			project,
			projectAlias: projectAlias?.trim() || undefined,
			repo,
			targetBranches: targets,
			createdAt: new Date().toISOString()
		};

		try {
			await addPipeline(workspaceFolder, pipeline);
			output.appendLine(`[gitpipelines] Added pipeline "${pipelineName}" targeting: ${targets.join(', ')}`);
			vscode.window.showInformationMessage(`Saved pipeline "${pipelineName}" with ${targets.length} target branch(es).`);
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to save pipeline: ${String(error)}`);
		}
	};
}