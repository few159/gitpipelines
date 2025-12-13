import * as vscode from 'vscode';

export interface Pipeline {
	id: string;
	name: string;
	org: string;
	project: string;
	repo: string;
	targetBranches: string[];
	createdAt: string;
}

export interface PipelineStore {
	pipelines: Pipeline[];
}

const STORAGE_FILE = 'gitpipelines.json';
const SECRET_PAT_KEY = 'gitpipelines.azureDevOps.pat';

function defaultStore(): PipelineStore {
	return { pipelines: [] };
}

function storageUri(workspaceFolder: vscode.WorkspaceFolder): vscode.Uri {
	return vscode.Uri.joinPath(workspaceFolder.uri, STORAGE_FILE);
}

export async function readPipelineStore(workspaceFolder: vscode.WorkspaceFolder): Promise<PipelineStore> {
	try {
		const uri = storageUri(workspaceFolder);
		const content = await vscode.workspace.fs.readFile(uri);
		const parsed = JSON.parse(new TextDecoder().decode(content)) as PipelineStore;
		return parsed?.pipelines ? parsed : defaultStore();
	} catch (error) {
		// File likely missing on first run; return default store instead of failing.
		return defaultStore();
	}
}

export async function writePipelineStore(workspaceFolder: vscode.WorkspaceFolder, store: PipelineStore): Promise<void> {
	const uri = storageUri(workspaceFolder);
	const encoder = new TextEncoder();
	const data = encoder.encode(JSON.stringify(store, null, 2));
	await vscode.workspace.fs.writeFile(uri, data);
}

export async function addPipeline(workspaceFolder: vscode.WorkspaceFolder, pipeline: Pipeline): Promise<void> {
	const store = await readPipelineStore(workspaceFolder);
	store.pipelines.push(pipeline);
	await writePipelineStore(workspaceFolder, store);
}

export async function getPat(secretStorage: vscode.SecretStorage): Promise<string | undefined> {
	return secretStorage.get(SECRET_PAT_KEY);
}

export async function ensurePat(secretStorage: vscode.SecretStorage): Promise<string | undefined> {
	const existing = await getPat(secretStorage);
	if (existing) {
		return existing;
	}

	const pat = await vscode.window.showInputBox({
		title: 'Azure DevOps Personal Access Token',
		prompt: 'Enter a PAT with Code access to create pull requests.',
		ignoreFocusOut: true,
		password: true,
	});

	if (!pat) {
		return undefined;
	}

	await secretStorage.store(SECRET_PAT_KEY, pat);
	return pat;
}

export function getWorkspaceFolder(): vscode.WorkspaceFolder | undefined {
	return vscode.workspace.workspaceFolders?.[0];
}

