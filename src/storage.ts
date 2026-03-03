import * as vscode from 'vscode';

export interface TargetBranch {
	name: string;
	temporary?: boolean;
	tempSuffix?: string;
}

export interface Pipeline {
	id: string;
	name: string;
	org: string;
	project: string;
	projectAlias?: string;
	repo: string;
	targetBranches: TargetBranch[];
	createdAt: string;
}

export interface PipelineStore {
	pipelines: Pipeline[];
}

const STORAGE_FILE = 'gitpipelines.json';
const LOG_FILE = 'gitpipelines.log';
const SECRET_PAT_KEY = 'gitpipelines.azureDevOps.pat';
export const PIPELINE_STORE_FILENAME = STORAGE_FILE;
const GITIGNORE_FILE = '.gitignore';
const IGNORED_FILES = [STORAGE_FILE, LOG_FILE];

function defaultStore(): PipelineStore {
	return { pipelines: [] };
}

function storageUri(workspaceFolder: vscode.WorkspaceFolder): vscode.Uri {
	return vscode.Uri.joinPath(workspaceFolder.uri, STORAGE_FILE);
}

function migratePipelines(store: PipelineStore): PipelineStore {
	for (const pipeline of store.pipelines) {
		if (pipeline.targetBranches.length > 0 && typeof pipeline.targetBranches[0] === 'string') {
			pipeline.targetBranches = (pipeline.targetBranches as unknown as string[]).map(
				(name) => ({ name })
			);
		}
	}
	return store;
}

export async function readPipelineStore(workspaceFolder: vscode.WorkspaceFolder): Promise<PipelineStore> {
	try {
		const uri = storageUri(workspaceFolder);
		const content = await vscode.workspace.fs.readFile(uri);
		const parsed = JSON.parse(new TextDecoder().decode(content)) as PipelineStore;
		return parsed?.pipelines ? migratePipelines(parsed) : defaultStore();
	} catch (error) {
		return defaultStore();
	}
}

export async function writePipelineStore(workspaceFolder: vscode.WorkspaceFolder, store: PipelineStore): Promise<void> {
	await ensureFilesIgnored(workspaceFolder);
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

async function ensureFilesIgnored(workspaceFolder: vscode.WorkspaceFolder): Promise<void> {
	const gitignoreUri = vscode.Uri.joinPath(workspaceFolder.uri, GITIGNORE_FILE);
	let current = '';
	try {
		const buf = await vscode.workspace.fs.readFile(gitignoreUri);
		current = new TextDecoder().decode(buf);
	} catch {
		// Missing .gitignore; we'll create it.
	}

	const lines = current.split(/\r?\n/).map((l) => l.trim());
	const missing = IGNORED_FILES.filter((f) => !lines.includes(f));
	if (missing.length === 0) {
		return;
	}

	let nextContent = current;
	for (const file of missing) {
		nextContent = nextContent && !nextContent.endsWith('\n')
			? `${nextContent}\n${file}\n`
			: `${nextContent}${file}\n`;
	}

	await vscode.workspace.fs.writeFile(gitignoreUri, new TextEncoder().encode(nextContent));
}

export interface LogEntry {
	pipelineName: string;
	prTitle: string;
	linkOrError: string;
}

export async function appendLog(workspaceFolder: vscode.WorkspaceFolder, entry: LogEntry): Promise<void> {
	await ensureFilesIgnored(workspaceFolder);
	const uri = vscode.Uri.joinPath(workspaceFolder.uri, LOG_FILE);
	const timestamp = new Date().toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '');
	const line = `[${timestamp}] (${entry.pipelineName}) "${entry.prTitle}" -- ${entry.linkOrError}\n`;

	let existing = '';
	try {
		const buf = await vscode.workspace.fs.readFile(uri);
		existing = new TextDecoder().decode(buf);
	} catch {
		// File doesn't exist yet.
	}

	const content = existing + line;
	await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(content));
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

export async function pickWorkspaceFolder(): Promise<vscode.WorkspaceFolder | undefined> {
	const folders = vscode.workspace.workspaceFolders;
	if (!folders || folders.length === 0) {
		return undefined;
	}
	if (folders.length === 1) {
		return folders[0];
	}

	const picked = await vscode.window.showQuickPick(
		folders.map((f) => ({
			label: f.name,
			detail: f.uri.fsPath,
			folder: f
		})),
		{ title: 'Select a workspace folder' }
	);

	return picked?.folder;
}

