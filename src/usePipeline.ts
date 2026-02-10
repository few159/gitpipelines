import * as vscode from "vscode";
import { createPullRequest } from "./azureDevops";
import { getCurrentBranch, getLastCommitMessage, isBranchPublished, pushBranch } from "./git";
import { ensurePat, pickWorkspaceFolder, readPipelineStore } from "./storage";


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

    const results: { target: string; url?: string; error?: string }[] = [];
    const aliasLabel = pipeline.projectAlias || pipeline.project;
    const logLines: string[] = [];
    const log = (line: string) => {
      output.appendLine(line);
    };

    log(
      `[${aliasLabel}] Running pipeline "${pipeline.name}" from branch "${currentBranch}"`
    );

    for (const target of pipeline.targetBranches) {
      if (target === currentBranch) {
        const msg = "Skipped (source and target are the same)";
        log(`[${aliasLabel}] ${target}: ${msg}`);
        results.push({ target, error: msg });
        continue;
      }

      try {
        const pr = await createPullRequest(
          { ...pipeline, pat },
          currentBranch,
          target,
          `${currentBranch} -> ${target}`,
          lastCommitMessage,
          workItemIds
        );
        const url = pr.webUrl || "";
        log(`[${aliasLabel}] ${target}: ${url || "PR created"}`);
        results.push({ target, url });
      } catch (error) {
        const message = String(error);
        log(`[${aliasLabel}] ${target}: failed (${message})`);
        results.push({ target, error: message });
      }
    }

    const succeeded = results.filter((r) => r.url);
    const failed = results.filter((r) => r.error);

    if (succeeded.length) {
      const urls = succeeded.map((r) => `${r.target}: ${r.url}`).join("\n");
      vscode.window.showInformationMessage(
        `Created ${succeeded.length} PR(s). See output for details.`
      );
      output.show(true);
      log(`[${aliasLabel}] Created PR URLs:`);
      log(urls);

      logLines.push(`[${aliasLabel}] - ${currentBranch}`);
      logLines.push(urls);
    }

    if (failed.length) {
      const summary = failed.map((r) => `${r.target}: ${r.error}`).join("; ");
      vscode.window.showErrorMessage(`Some PRs failed: ${summary}`);
    }

    if (logLines.length) {
      const doc = await vscode.workspace.openTextDocument({
        content: logLines.join("\n"),
        language: "markdown",
      });
      await vscode.window.showTextDocument(doc, { preview: true });

      //   const choice = await vscode.window.showInformationMessage(
      //     "Open pipeline results in a temporary editor?",
      //     "Open",
      //     "Skip"
      //   );
      //   if (choice === "Open") {
      //     const doc = await vscode.workspace.openTextDocument({
      //       content: logLines.join("\n"),
      //       language: "markdown",
      //     });
      //     await vscode.window.showTextDocument(doc, { preview: true });
      //   }
    }
  };
}
