import * as vscode from 'vscode';
import { AmplifierChatProvider } from './provider';
import * as path from 'path';
import * as fs from 'fs';

let provider: AmplifierChatProvider | undefined;

/**
 * Get API key from multiple sources (priority order)
 */
export async function getApiKey(context: vscode.ExtensionContext, providerType: string): Promise<string | undefined> {
    const secretKey = `amplifier.${providerType}.apiKey`;
    
    // 1. Check VSCode secrets (most secure)
    const storedKey = await context.secrets.get(secretKey);
    if (storedKey) {
        return storedKey;
    }
    
    // 2. Check environment variables
    const envKeyNames: Record<string, string> = {
        'anthropic': 'ANTHROPIC_API_KEY',
        'openai': 'OPENAI_API_KEY',
        'azure': 'AZURE_OPENAI_API_KEY'
    };
    
    const envKey = process.env[envKeyNames[providerType]];
    if (envKey) {
        return envKey;
    }
    
    return undefined;
}

/**
 * Prompt user for API key and store it securely
 */
async function promptForApiKey(context: vscode.ExtensionContext, providerType: string): Promise<string | undefined> {
    const providerNames: Record<string, string> = {
        'anthropic': 'Anthropic (Claude)',
        'openai': 'OpenAI (GPT)',
        'azure': 'Azure OpenAI'
    };
    
    const apiKey = await vscode.window.showInputBox({
        prompt: `Enter your ${providerNames[providerType]} API key`,
        password: true,
        placeHolder: 'sk-ant-... or sk-...',
        ignoreFocusOut: true
    });
    
    if (apiKey) {
        // Store in VSCode secrets
        await context.secrets.store(`amplifier.${providerType}.apiKey`, apiKey);
        vscode.window.showInformationMessage('API key saved securely!');
        return apiKey;
    }
    
    return undefined;
}

export function activate(context: vscode.ExtensionContext) {
    console.log('Amplifier extension is now active');
    
    // Load .env file from workspace root if it exists (development convenience)
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (workspaceRoot) {
        const envPath = path.join(workspaceRoot, '.env');
        if (fs.existsSync(envPath)) {
            require('dotenv').config({ path: envPath });
        }
    }
    
    // Also try extension directory
    const extensionEnvPath = path.join(context.extensionPath, '.env');
    if (fs.existsSync(extensionEnvPath)) {
        require('dotenv').config({ path: extensionEnvPath });
    }

    // Create the Amplifier language model provider
    provider = new AmplifierChatProvider();
    
    // Pass context so provider can access secrets and extension path
    (provider as any).context = context;
    
    // Register the provider
    const disposable = vscode.lm.registerLanguageModelChatProvider('amplifier', provider);
    context.subscriptions.push(disposable);
    
    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('amplifier.setApiKey', async () => {
            const provider = vscode.workspace.getConfiguration('amplifier').get<string>('provider') || 'anthropic';
            await promptForApiKey(context, provider);
        })
    );
    
    context.subscriptions.push(
        vscode.commands.registerCommand('amplifier.clearApiKey', async () => {
            const provider = vscode.workspace.getConfiguration('amplifier').get<string>('provider') || 'anthropic';
            await context.secrets.delete(`amplifier.${provider}.apiKey`);
            vscode.window.showInformationMessage('API key cleared');
        })
    );
    
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
