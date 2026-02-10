import { execFile } from 'node:child_process';
import * as vscode from 'vscode';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface AzureRemoteInfo {
	org: string;
	project: string;
	repo: string;
}

async function execGit(args: string[], cwd: string): Promise<string> {
	const { stdout } = await execFileAsync('git', args, { cwd });
	return stdout.trim();
}

export async function getOriginUrl(workspaceFolder: vscode.WorkspaceFolder): Promise<string | undefined> {
	try {
		return await execGit(['config', '--get', 'remote.origin.url'], workspaceFolder.uri.fsPath);
	} catch (error) {
		return undefined;
	}
}

export async function getCurrentBranch(workspaceFolder: vscode.WorkspaceFolder): Promise<string | undefined> {
	try {
		return await execGit(['rev-parse', '--abbrev-ref', 'HEAD'], workspaceFolder.uri.fsPath);
	} catch {
		return undefined;
	}
}

export async function getLastCommitMessage(workspaceFolder: vscode.WorkspaceFolder): Promise<string | undefined> {
	try {
		return await execGit(['log', '-1', '--pretty=%B'], workspaceFolder.uri.fsPath);
	} catch {
		return undefined;
	}
}

export async function isBranchPublished(workspaceFolder: vscode.WorkspaceFolder, branch: string): Promise<boolean> {
	try {
		await execGit(['rev-parse', '--verify', `origin/${branch}`], workspaceFolder.uri.fsPath);
		return true;
	} catch {
		return false;
	}
}

export async function pushBranch(workspaceFolder: vscode.WorkspaceFolder, branch: string): Promise<void> {
	await execGit(['push', '-u', 'origin', branch], workspaceFolder.uri.fsPath);
}

export function parseAzureRemoteUrl(remoteUrl: string | undefined): AzureRemoteInfo | undefined {
	if (!remoteUrl) {
		return undefined;
	}

	// HTTPS pattern: https://dev.azure.com/org/project/_git/repo or https://org@dev.azure.com/org/project/_git/repo
	const httpsMatch = remoteUrl.match(/https?:\/\/(?:[^@]+@)?dev\.azure\.com\/([^/]+)\/([^/]+)\/_git\/([^/]+)(?:\/)?$/i);
	if (httpsMatch) {
		const [, org, project, repo] = httpsMatch;
		return { org, project, repo };
	}

	// SSH pattern: git@ssh.dev.azure.com:v3/org/project/repo
	const sshMatch = remoteUrl.match(/git@ssh\.dev\.azure\.com:v3\/([^/]+)\/([^/]+)\/([^/]+)$/i);
	if (sshMatch) {
		const [, org, project, repo] = sshMatch;
		return { org, project, repo };
	}

	return undefined;
}

