// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { usePipelineCommand } from './usePipeline';
import { createPipelineCommand } from './createPipeline';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	const output = vscode.window.createOutputChannel('GitPipelines');

	const disposables = [
		vscode.commands.registerCommand('gitpipelines.usePipelines', usePipelineCommand(context, output)),
		vscode.commands.registerCommand('gitpipelines.createPipeline', createPipelineCommand(context, output))
	];

	context.subscriptions.push(...disposables);
}

// This method is called when your extension is deactivated
export function deactivate() {}
