import * as vscode from 'vscode';
import { fetchBranches } from './azureDevops';
import { getCurrentBranch, getLastCommitMessage, getOriginUrl, isBranchPublished, parseAzureRemoteUrl, pushBranch } from './git';
import { ensurePat, pickWorkspaceFolder } from './storage';
import { promptTemporaryBranches } from './branchPrompts';
import { promptAdditionalBranchPr, runPipeline, showResults } from './pipelineRunner';

const ANONYMOUS = 'ANONYMOUS';

export function singlePipelineCommand(
	context: vscode.ExtensionContext,
	output: vscode.OutputChannel
) {
	return async () => {
		const workspaceFolder = await pickWorkspaceFolder();
		if (!workspaceFolder) {
			vscode.window.showErrorMessage('Open a workspace folder to run a single pipeline.');
			return;
		}

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

		const published = await isBranchPublished(workspaceFolder, currentBranch);
		if (!published) {
			const action = await vscode.window.showWarningMessage(
				`Branch "${currentBranch}" has not been pushed to origin. Push it now?`,
				'Push',
				'Cancel'
			);
			if (action !== 'Push') {
				return;
			}
			try {
				await pushBranch(workspaceFolder, currentBranch);
				vscode.window.showInformationMessage(`Branch "${currentBranch}" pushed to origin.`);
			} catch (error) {
				vscode.window.showErrorMessage(`Failed to push branch: ${String(error)}`);
				return;
			}
		}

		const originUrl = await getOriginUrl(workspaceFolder);
		const remoteInfo = parseAzureRemoteUrl(originUrl);
		if (!remoteInfo) {
			vscode.window.showErrorMessage('Could not parse Azure DevOps remote from origin URL.');
			return;
		}

		const config = { ...remoteInfo, pat };

		let branches: string[];
		try {
			branches = await fetchBranches(config);
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to fetch branches: ${String(error)}`);
			return;
		}

		if (!branches.length) {
			vscode.window.showWarningMessage('No branches found in this repository.');
			return;
		}

		const branchPicks = await vscode.window.showQuickPick(branches, {
			title: 'Select target branches',
			canPickMany: true,
			placeHolder: 'Select one or more branches'
		});

		if (!branchPicks || branchPicks.length === 0) {
			return;
		}

		const targetBranches = await promptTemporaryBranches(branchPicks);
		if (!targetBranches) {
			return;
		}

		const workItemInput = await vscode.window.showInputBox({
			title: 'Optional: Work Item ID to link to PRs',
			prompt: 'Enter a single Azure DevOps work item ID or leave blank',
			ignoreFocusOut: true,
			validateInput: (value) => {
				if (!value.trim()) {
					return null;
				}
				return /^\d+$/.test(value.trim()) ? null : 'Work item ID must be numeric';
			}
		});

		const workItemIds = workItemInput?.trim()
			? [Number(workItemInput.trim())]
			: undefined;
		const lastCommitMessage = await getLastCommitMessage(workspaceFolder);

		const results = await runPipeline({
			workspaceFolder,
			config,
			sourceBranch: currentBranch,
			targets: targetBranches,
			pipelineName: ANONYMOUS,
			workItemIds,
			lastCommitMessage,
			output
		});

		const additionalResult = await promptAdditionalBranchPr(
			workspaceFolder,
			config,
			currentBranch,
			ANONYMOUS,
			targetBranches.map((t) => t.name),
			workItemIds,
			lastCommitMessage,
			output
		);
		if (additionalResult) {
			results.push(additionalResult);
		}

		await showResults(results, ANONYMOUS, currentBranch, output);
	};
}
