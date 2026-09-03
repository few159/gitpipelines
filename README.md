# GitPipelines

Create and run branch pipelines for Azure DevOps from VS Code or Cursor. Pick target branches once, then open pull requests from your current branch to every target with a single command.

## Features
- Fetch branches from Azure DevOps and save reusable pipelines per repo.
- Securely store PAT in editor secret storage.
- From any branch, open PRs to all pipeline targets and get the URLs in the GitPipelines output channel.

## Requirements
- Azure DevOps Personal Access Token with Code (read/write) scope.
- Git remote `origin` pointing to an Azure DevOps repo (HTTPS or SSH).

## Install in your IDE
Install the VSIX file, `gitpipelines-1.2.1.vsix`, in VS Code or Cursor.

### VS Code
1. Open the Extensions view.
2. Select **Install from VSIX...** from the view menu.
3. Choose `gitpipelines-1.2.1.vsix`.

You can also install it from the command line:

```bash
code --install-extension gitpipelines-1.2.1.vsix
```

### Cursor
1. Open the Extensions view.
2. Select **Install from VSIX...** from the view menu.
3. Choose `gitpipelines-1.2.1.vsix`.

You can also install it from the command line:

```bash
cursor --install-extension gitpipelines-1.2.1.vsix
```

## Commands
- `GitPipelines: Create GitPipelines` — select org/project/repo, choose target branches, and save the pipeline.
- `GitPipelines: Update GitPipeline` — edit pipeline name, org/project/repo, or targets.
- `GitPipelines: Delete GitPipeline` — remove a saved pipeline.
- `GitPipelines: Use GitPipelines` — from your current branch, create PRs to all targets in the selected pipeline.

## Usage
1) Run **Create GitPipelines**, sign in with PAT when prompted, and pick target branches.  
2) Checkout a feature branch.  
3) Run **Use GitPipelines**; optionally provide work item IDs to link; PR URLs are shown in the GitPipelines output channel and a notification.

Both **Use GitPipelines** and **Use Single Pipeline** suggest the work item ID from a branch named `<prefix>/<WI-ID>-description`, regardless of prefix (for example, `feat/123456-description`, `fix/123456-bug`, or `chore/123456-cleanup`). The ID must immediately follow the first `/`. The suggestion is editable: replace it, clear it to link no work items, or add more IDs separated by commas, such as `123456, 654321, 321456`. IDs must be positive integers; spaces are trimmed and duplicates are removed.

**Use Single Pipeline** lets you select targets for a one-off run without saving a pipeline. It does not ask for an additional PR afterward.

## Pipeline storage
- Pipelines are stored per workspace in root-level `gitpipelines.json`; the extension auto-adds this file to your project `.gitignore`.
- PAT is stored in the editor’s secret storage (never in the workspace).

### Additional PR prompt

New pipelines include `"askForAdditionalPr": false`. To be asked whether to create an additional PR after a saved pipeline finishes, set this property to `true` on that pipeline in `gitpipelines.json`:

```json
{
  "pipelines": [
    {
      "id": "example",
      "name": "Release pipeline",
      "org": "my-org",
      "project": "my-project",
      "repo": "my-repo",
      "targetBranches": [{ "name": "main" }],
      "askForAdditionalPr": true,
      "createdAt": "2026-09-03T00:00:00.000Z"
    }
  ]
}
```

An omitted property or `false` skips the prompt, including for existing pipelines. Only the JSON boolean `true` enables it. Updating a pipeline preserves this setting.

## Build
```bash
npm install
npx @vscode/vsce package
```

Run command regression tests without launching VS Code using `npm run test:unit`.

