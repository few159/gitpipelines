import * as vscode from "vscode";
import { getCurrentBranch, getLastCommitMessage, isBranchPublished, pushBranch } from "./git";
import { ensurePat, pickWorkspaceFolder, readPipelineStore } from "./storage";
import { promptAdditionalBranchPr, runPipeline, showResults } from "./pipelineRunner";

export function usePipelineCommand(
  context: vscode.ExtensionContext,
  output: vscode.OutputChannel
) {
  return async () => {
    const workspaceFolder = await pickWorkspaceFolder();
    if (!workspaceFolder) {
      vscode.window.showErrorMessage(
        "Open a workspace folder to use a pipeline."
      );
      return;
    }

    const store = await readPipelineStore(workspaceFolder);
    if (!store.pipelines.length) {
      vscode.window.showInformationMessage(
        "No pipelines found. Create one first."
      );
      return;
    }

    const pickedId = await vscode.window.showQuickPick(
      store.pipelines.map((p) => ({
        label: p.name,
        detail: `${p.org}/${p.project}/${p.repo}`,
        pipeline: p,
      })),
      {
        title: "Select a pipeline to run",
      }
    );

    if (!pickedId?.pipeline) {
      return;
    }
    const pipeline = pickedId.pipeline;

    const pat = await ensurePat(context.secrets);
    if (!pat) {
      vscode.window.showWarningMessage(
        "A PAT is required to create pull requests."
      );
      return;
    }

    const currentBranch = await getCurrentBranch(workspaceFolder);
    if (!currentBranch) {
      vscode.window.showErrorMessage("Unable to detect the current branch.");
      return;
    }

    const published = await isBranchPublished(workspaceFolder, currentBranch);
    if (!published) {
      const action = await vscode.window.showWarningMessage(
        `Branch "${currentBranch}" has not been pushed to origin. Push it now?`,
        "Push",
        "Cancel"
      );
      if (action !== "Push") {
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

    const workItemInput = await vscode.window.showInputBox({
      title: "Optional: Work Item ID to link to PRs",
      prompt: "Enter a single Azure DevOps work item ID or leave blank",
      ignoreFocusOut: true,
      validateInput: (value) => {
        if (!value.trim()) {
          return null;
        }
        return /^\d+$/.test(value.trim())
          ? null
          : "Work item ID must be numeric";
      },
    });

    const workItemIds = workItemInput?.trim()
      ? [Number(workItemInput.trim())]
      : undefined;
    const lastCommitMessage = await getLastCommitMessage(workspaceFolder);
    const aliasLabel = pipeline.projectAlias || pipeline.project;
    const config = { org: pipeline.org, project: pipeline.project, repo: pipeline.repo, pat };

    const results = await runPipeline({
      workspaceFolder,
      config,
      sourceBranch: currentBranch,
      targets: pipeline.targetBranches,
      pipelineName: aliasLabel,
      workItemIds,
      lastCommitMessage,
      output,
    });

    const additionalResult = await promptAdditionalBranchPr(
      workspaceFolder,
      config,
      currentBranch,
      aliasLabel,
      pipeline.targetBranches.map((t) => t.name),
      workItemIds,
      lastCommitMessage,
      output
    );
    if (additionalResult) {
      results.push(additionalResult);
    }

    await showResults(results, aliasLabel, currentBranch, output);
  };
}
