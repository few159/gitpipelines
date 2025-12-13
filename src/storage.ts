import * as vscode from 'vscode';

export interface Pipeline {
	id: string;
	name: string;
	org: string;
	project: string;
	projectAlias?: string;
	repo: string;
	targetBranches: string[];
	createdAt: string;
}

export interface PipelineStore {
	pipelines: Pipeline[];
}

const STORAGE_FILE = 'gitpipelines.json';
const SECRET_PAT_KEY = 'gitpipelines.azureDevOps.pat';
export const PIPELINE_STORE_FILENAME = STORAGE_FILE;
const GITIGNORE_FILE = '.gitignore';

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
	await ensureStoreIgnored(workspaceFolder);
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

export async function updatePipeline(workspaceFolder: vscode.WorkspaceFolder, pipeline: Pipeline): Promise<void> {
	const store = await readPipelineStore(workspaceFolder);
	const idx = store.pipelines.findIndex((p) => p.id === pipeline.id);
	if (idx === -1) {
		throw new Error('Pipeline not found');
	}
	store.pipelines[idx] = pipeline;
	await writePipelineStore(workspaceFolder, store);
}

export async function deletePipeline(workspaceFolder: vscode.WorkspaceFolder, pipelineId: string): Promise<void> {
	const store = await readPipelineStore(workspaceFolder);
	const next = store.pipelines.filter((p) => p.id !== pipelineId);
	store.pipelines = next;
	await writePipelineStore(workspaceFolder, store);
}

async function ensureStoreIgnored(workspaceFolder: vscode.WorkspaceFolder): Promise<void> {
	const gitignoreUri = vscode.Uri.joinPath(workspaceFolder.uri, GITIGNORE_FILE);
	let current = '';
	try {
		const buf = await vscode.workspace.fs.readFile(gitignoreUri);
		current = new TextDecoder().decode(buf);
	} catch {
		// Missing .gitignore; we'll create it.
	}

	if (current.split(/\r?\n/).some((line) => line.trim() === STORAGE_FILE)) {
		return;
	}

	const nextContent = current && !current.endsWith('\n')
		? `${current}\n${STORAGE_FILE}\n`
		: `${current}${STORAGE_FILE}\n`;

	await vscode.workspace.fs.writeFile(gitignoreUri, new TextEncoder().encode(nextContent));
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

