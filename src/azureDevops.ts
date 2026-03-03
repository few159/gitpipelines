import { Buffer } from 'node:buffer';
import { AzureRemoteInfo } from './git';

export interface AzureDevOpsConfig extends AzureRemoteInfo {
	pat: string;
}

export interface AzureBranch {
	name: string;
}

export interface CreatedPullRequest {
	id: number;
	webUrl: string;
	targetBranch: string;
}

const API_VERSION = '7.1-preview.1';

function authHeader(pat: string): string {
	const token = Buffer.from(`:${pat}`).toString('base64');
	return `Basic ${token}`;
}

function baseUrl(config: AzureDevOpsConfig): string {
	return `https://dev.azure.com/${encodeURIComponent(config.org)}/${encodeURIComponent(config.project)}`;
}

async function request<T>(config: AzureDevOpsConfig, url: string, init?: RequestInit): Promise<T> {
	const response = await fetch(url, {
		...init,
		headers: {
			'Content-Type': 'application/json',
			Authorization: authHeader(config.pat),
			...(init?.headers ?? {})
		}
	});

	if (!response.ok) {
		const text = await response.text();
		throw new Error(`Azure DevOps request failed (${response.status}): ${text}`);
	}

	return response.json() as Promise<T>;
}

export async function fetchBranches(config: AzureDevOpsConfig): Promise<string[]> {
	const url = `${baseUrl(config)}/_apis/git/repositories/${encodeURIComponent(config.repo)}/refs?filter=heads/&api-version=${API_VERSION}`;
	type Response = { value: { name: string }[] };
	const data = await request<Response>(config, url);
	return (data.value ?? []).map((ref) => ref.name.replace(/^refs\/heads\//, ''));
}

export async function createPullRequest(
	config: AzureDevOpsConfig,
	sourceBranch: string,
	targetBranch: string,
	title?: string,
	description?: string,
	workItemIds?: number[],
	deleteSourceBranch?: boolean
): Promise<CreatedPullRequest> {
	const url = `${baseUrl(config)}/_apis/git/repositories/${encodeURIComponent(config.repo)}/pullrequests?api-version=${API_VERSION}`;
	const payload = {
		sourceRefName: `refs/heads/${sourceBranch}`,
		targetRefName: `refs/heads/${targetBranch}`,
		title: title ?? `${sourceBranch} -> ${targetBranch}`,
		description,
		...(workItemIds && workItemIds.length
			? { workItemRefs: workItemIds.map((id) => ({ id })) }
			: {}),
		...(deleteSourceBranch
			? { completionOptions: { deleteSourceBranch: true } }
			: {})
	};

	type Response = {
		pullRequestId: number;
		_links?: { web?: { href?: string } };
		url?: string;
	};

	const friendlyUrl = (id: number) =>
		`${baseUrl(config)}/_git/${encodeURIComponent(config.repo)}/pullrequest/${id}`;

	const data = await request<Response>(config, url, {
		method: 'POST',
		body: JSON.stringify(payload)
	});

	const rawUrl = data._links?.web?.href ?? data.url ?? '';
	const webUrl =
		rawUrl && !rawUrl.includes('/_apis/')
			? rawUrl
			: friendlyUrl(data.pullRequestId);
	return {
		id: data.pullRequestId,
		webUrl,
		targetBranch
	};
}

