import * as vscode from 'vscode';
import { createPullRequest } from './azureDevops';
import { getCurrentBranch } from './git';
import { ensurePat, getWorkspaceFolder, readPipelineStore } from './storage';

export function usePipelineCommand(context: vscode.ExtensionContext, output: vscode.OutputChannel) {
	return async () => {
		const workspaceFolder = getWorkspaceFolder();
		if (!workspaceFolder) {
			vscode.window.showErrorMessage('Open a workspace folder to use a pipeline.');
			return;
		}

		const store = await readPipelineStore(workspaceFolder);
		if (!store.pipelines.length) {
			vscode.window.showInformationMessage('No pipelines found. Create one first.');
			return;
		}

		const pickedId = await vscode.window.showQuickPick(
			store.pipelines.map((p) => ({
				label: p.name,
				detail: `${p.org}/${p.project}/${p.repo}`,
				pipeline: p
			})),
			{
				title: 'Select a pipeline to run'
			}
		);

		if (!pickedId?.pipeline) {
			return;
		}
		const pipeline = pickedId.pipeline;

		const pat = await ensurePat(context.secrets);
		if (!pat) {
			vscode.window.showWarningMessage('A PAT is required to create pull requests.');
			return;
		}

		const currentBranch = await getCurrentBranch(workspaceFolder);
		if (!currentBranch) {
			vscode.window.showErrorMessage('Unable to detect the current branch.');
			return;
		}

		const results: { target: string; url?: string; error?: string }[] = [];
		output.appendLine(`[gitpipelines] Running pipeline "${pipeline.name}" from branch "${currentBranch}"`);

		for (const target of pipeline.targetBranches) {
			if (target === currentBranch) {
				const msg = 'Skipped (source and target are the same)';
				output.appendLine(` - ${target}: ${msg}`);
				results.push({ target, error: msg });
				continue;
			}

			try {
				const pr = await createPullRequest(
					{ ...pipeline, pat },
					currentBranch,
					target,
					`${currentBranch} -> ${target}`
				);
				output.appendLine(` - ${target}: ${pr.webUrl || 'PR created'}`);
				results.push({ target, url: pr.webUrl || '' });
			} catch (error) {
				const message = String(error);
				output.appendLine(` - ${target}: failed (${message})`);
				results.push({ target, error: message });
			}
		}

		const succeeded = results.filter((r) => r.url);
		const failed = results.filter((r) => r.error);

		if (succeeded.length) {
			const urls = succeeded.map((r) => `${r.target}: ${r.url}`).join('\n');
			vscode.window.showInformationMessage(`Created ${succeeded.length} PR(s). See output for details.`);
			output.show(true);
			output.appendLine('[gitpipelines] Created PR URLs:');
			output.appendLine(urls);
		}

		if (failed.length) {
			const summary = failed.map((r) => `${r.target}: ${r.error}`).join('; ');
			vscode.window.showErrorMessage(`Some PRs failed: ${summary}`);
		}
	};
}
