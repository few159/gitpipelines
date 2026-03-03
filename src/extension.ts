// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { usePipelineCommand } from './usePipeline';
import { createPipelineCommand } from './createPipeline';
import { updatePipelineCommand } from './updatePipeline';
import { deletePipelineCommand } from './deletePipeline';
import { singlePipelineCommand } from './singlePipeline';

export function activate(context: vscode.ExtensionContext) {
	const output = vscode.window.createOutputChannel('GitPipelines');

	const disposables = [
		vscode.commands.registerCommand('gitpipelines.usePipelines', usePipelineCommand(context, output)),
		vscode.commands.registerCommand('gitpipelines.createPipeline', createPipelineCommand(context, output)),
		vscode.commands.registerCommand('gitpipelines.updatePipeline', updatePipelineCommand(context, output)),
		vscode.commands.registerCommand('gitpipelines.deletePipeline', deletePipelineCommand(output)),
		vscode.commands.registerCommand('gitpipelines.singlePipeline', singlePipelineCommand(context, output))
	];

	context.subscriptions.push(...disposables);
}

// This method is called when your extension is deactivated
export function deactivate() {}
