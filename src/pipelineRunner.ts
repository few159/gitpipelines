import * as vscode from 'vscode';
import { AzureDevOpsConfig, createPullRequest, fetchBranches } from './azureDevops';
import { createAndPushTempBranch } from './git';
import { appendLog, TargetBranch } from './storage';

export interface PipelineRunOptions {
	workspaceFolder: vscode.WorkspaceFolder;
	config: AzureDevOpsConfig;
	sourceBranch: string;
	targets: TargetBranch[];
	pipelineName: string;
	workItemIds?: number[];
	lastCommitMessage?: string;
	output: vscode.OutputChannel;
}

export interface PrResult {
	target: string;
	url?: string;
	error?: string;
}

export async function runPipeline(options: PipelineRunOptions): Promise<PrResult[]> {
	const { workspaceFolder, config, sourceBranch, targets, pipelineName, workItemIds, lastCommitMessage, output } = options;
	const aliasLabel = pipelineName;
	const results: PrResult[] = [];

	const log = (line: string) => output.appendLine(line);
	log(`[${aliasLabel}] Running pipeline from branch "${sourceBranch}"`);

	for (const target of targets) {
		if (target.name === sourceBranch) {
			const msg = 'Skipped (source and target are the same)';
			log(`[${aliasLabel}] ${target.name}: ${msg}`);
			results.push({ target: target.name, error: msg });
			continue;
		}

		let effectiveSource = sourceBranch;
		const prTitle = `${sourceBranch} -> ${target.name}`;

		if (target.temporary) {
			const suffix = target.tempSuffix || 'temp';
			const tempBranchName = `${sourceBranch}-${suffix}`;
			try {
				log(`[${aliasLabel}] Creating temp branch "${tempBranchName}" for ${target.name}`);
				await createAndPushTempBranch(workspaceFolder, sourceBranch, tempBranchName);
				effectiveSource = tempBranchName;
			} catch (error) {
				const message = String(error);
				log(`[${aliasLabel}] ${target.name}: failed to create temp branch (${message})`);
				results.push({ target: target.name, error: message });
				await appendLog(workspaceFolder, { pipelineName, prTitle, linkOrError: `FAILED: ${message}` });
				continue;
			}
		}

		try {
			const pr = await createPullRequest(
				config,
				effectiveSource,
				target.name,
				prTitle,
				lastCommitMessage,
				workItemIds,
				target.temporary
			);
			const url = pr.webUrl || '';
			log(`[${aliasLabel}] ${target.name}: ${url || 'PR created'}`);
			results.push({ target: target.name, url });
			await appendLog(workspaceFolder, { pipelineName, prTitle, linkOrError: url || 'PR created (no URL)' });
		} catch (error) {
			const message = String(error);
			log(`[${aliasLabel}] ${target.name}: failed (${message})`);
			results.push({ target: target.name, error: message });
			await appendLog(workspaceFolder, { pipelineName, prTitle, linkOrError: `FAILED: ${message}` });
		}
	}

	return results;
}

export async function promptAdditionalBranchPr(
	workspaceFolder: vscode.WorkspaceFolder,
	config: AzureDevOpsConfig,
	sourceBranch: string,
	pipelineName: string,
	alreadyTargeted: string[],
	workItemIds: number[] | undefined,
	lastCommitMessage: string | undefined,
	output: vscode.OutputChannel
): Promise<PrResult | undefined> {
	const action = await vscode.window.showQuickPick(
		[{ label: 'Yes' }, { label: 'No' }],
		{ title: 'Create an additional PR to another branch?' }
	);
	if (!action || action.label !== 'Yes') {
		return undefined;
	}

	let branches: string[];
	try {
		branches = await fetchBranches(config);
	} catch (error) {
		vscode.window.showErrorMessage(`Failed to fetch branches: ${String(error)}`);
		return undefined;
	}

	const available = branches.filter((b) => !alreadyTargeted.includes(b) && b !== sourceBranch);
	if (!available.length) {
		vscode.window.showInformationMessage('No additional branches available.');
		return undefined;
	}

	const picked = await vscode.window.showQuickPick(available, {
		title: 'Select a branch to open a PR against',
		placeHolder: 'Pick one branch'
	});
	if (!picked) {
		return undefined;
	}

	const prTitle = `${sourceBranch} -> ${picked}`;
	try {
		const pr = await createPullRequest(
			config,
			sourceBranch,
			picked,
			prTitle,
			lastCommitMessage,
			workItemIds
		);
		const url = pr.webUrl || '';
		output.appendLine(`[${pipelineName}] ${picked}: ${url || 'PR created'}`);
		await appendLog(workspaceFolder, { pipelineName, prTitle, linkOrError: url || 'PR created (no URL)' });
		return { target: picked, url };
	} catch (error) {
		const message = String(error);
		output.appendLine(`[${pipelineName}] ${picked}: failed (${message})`);
		await appendLog(workspaceFolder, { pipelineName, prTitle, linkOrError: `FAILED: ${message}` });
		return { target: picked, error: message };
	}
}

export async function showResults(
	results: PrResult[],
	pipelineName: string,
	sourceBranch: string,
	output: vscode.OutputChannel
): Promise<void> {
	const succeeded = results.filter((r) => r.url);
	const failed = results.filter((r) => r.error);
	const logLines: string[] = [];

	if (succeeded.length) {
		const urls = succeeded.map((r) => `${r.target}: ${r.url}`).join('\n');
		vscode.window.showInformationMessage(
			`Created ${succeeded.length} PR(s). See output for details.`
		);
		output.show(true);
		output.appendLine(`[${pipelineName}] Created PR URLs:`);
		output.appendLine(urls);

		logLines.push(`[${pipelineName}] - ${sourceBranch}`);
		logLines.push(urls);
	}

	if (failed.length) {
		const summary = failed.map((r) => `${r.target}: ${r.error}`).join('; ');
		vscode.window.showErrorMessage(`Some PRs failed: ${summary}`);
	}

	if (logLines.length) {
		const doc = await vscode.workspace.openTextDocument({
			content: logLines.join('\n'),
			language: 'markdown',
		});
		await vscode.window.showTextDocument(doc, { preview: true });
	}
}
