import * as vscode from 'vscode';
import { AmplifierChatProvider } from './provider';
import * as path from 'path';
import * as fs from 'fs';

let provider: AmplifierChatProvider | undefined;

export function activate(context: vscode.ExtensionContext) {
    console.log('Amplifier extension is now active');
    
    // Load .env file from workspace root if it exists
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (workspaceRoot) {
        const envPath = path.join(workspaceRoot, '.env');
        if (fs.existsSync(envPath)) {
            console.log('[Amplifier] Loading .env file from workspace');
            require('dotenv').config({ path: envPath });
        }
    }
    
    // Also try extension directory
    const extensionEnvPath = path.join(context.extensionPath, '.env');
    if (fs.existsSync(extensionEnvPath)) {
        console.log('[Amplifier] Loading .env file from extension directory');
        require('dotenv').config({ path: extensionEnvPath });
    }

    // Create the Amplifier language model provider
    provider = new AmplifierChatProvider();
    
    // Pass context so provider can access extension path
    (provider as any).context = context;
    
    // Register the provider
    const disposable = vscode.lm.registerLanguageModelChatProvider('amplifier', provider);

    context.subscriptions.push(disposable);
    
    // Ensure cleanup on extension deactivation
    context.subscriptions.push({
        dispose: async () => {
            if (provider) {
                await provider.shutdown();
            }
        }
    });
}

export async function deactivate() {
    // Gracefully shutdown the bridge process
    if (provider) {
        await provider.shutdown();
    }
}
