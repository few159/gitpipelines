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
Install the published VSIX file, `gitpipelines-1.2.0.vsix`, in VS Code or Cursor.

### VS Code
1. Open the Extensions view.
2. Select **Install from VSIX...** from the view menu.
3. Choose `gitpipelines-1.2.0.vsix`.

You can also install it from the command line:

```bash
code --install-extension gitpipelines-1.2.0.vsix
```

### Cursor
1. Open the Extensions view.
2. Select **Install from VSIX...** from the view menu.
3. Choose `gitpipelines-1.2.0.vsix`.

You can also install it from the command line:

```bash
cursor --install-extension gitpipelines-1.2.0.vsix
```

## Commands
- `GitPipelines: Create GitPipelines` — select org/project/repo, choose target branches, and save the pipeline.
- `GitPipelines: Update GitPipeline` — edit pipeline name, org/project/repo, or targets.
- `GitPipelines: Delete GitPipeline` — remove a saved pipeline.
- `GitPipelines: Use GitPipelines` — from your current branch, create PRs to all targets in the selected pipeline.

## Usage
1) Run **Create GitPipelines**, sign in with PAT when prompted, and pick target branches.  
2) Checkout a feature branch.  
3) Run **Use GitPipelines**; optionally provide a Work Item ID to link; PR URLs are shown in the GitPipelines output channel and a notification.

## Pipeline storage
- Pipelines are stored per workspace in root-level `gitpipelines.json`; the extension auto-adds this file to your project `.gitignore`.
- PAT is stored in the editor’s secret storage (never in the workspace).

## Build
```bash
npm install
npx @vscode/vsce package
```

