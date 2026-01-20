import * as vscode from 'vscode';
import { ChildProcess } from 'child_process';

export class AmplifierChatProvider implements vscode.LanguageModelChatProvider {
    
    private bridgeProcess?: ChildProcess;
    private isInitialized = false;
    private pendingResponses = new Map<string, (value: any) => void>();
    private responseBuffer = '';
    private pythonPath?: string;  // Cached Python path
    public context?: vscode.ExtensionContext;  // Set by extension.ts
import * as vscode from 'vscode';
import { ChildProcess } from 'child_process';

export class AmplifierChatProvider implements vscode.LanguageModelChatProvider {
    
    private bridgeProcess?: ChildProcess;
    private isInitialized = false;
    private pendingResponses = new Map<string, (value: any) => void>();
    private responseBuffer = '';
    private pythonPath?: string;  // Cached Python path
    public context?: vscode.ExtensionContext;  // Set by extension.ts
    
    /**
     * Provide information about available Amplifier models
     */
    async provideLanguageModelChatInformation(
        options: { silent: boolean },
        token: vscode.CancellationToken
    ): Promise<vscode.LanguageModelChatInformation[]> {
        
        // Check if Python and amplifier-foundation are available
        if (!options.silent) {
            const isAvailable = await this.checkBridgeAvailable();
            if (!isAvailable) {
                vscode.window.showErrorMessage(
                    'Amplifier bridge not available. Ensure Python and amplifier-foundation are installed.'
                );
                return [];
            }
        }

        // Return a single Amplifier "model"
        return [{
            id: 'amplifier-persistent',
            name: 'Amplifier (Persistent Session)',
            family: 'amplifier',
            version: '1.0.0',
            maxInputTokens: 200000,  // Amplifier handles context internally
            maxOutputTokens: 8192,
            capabilities: {
                toolCalling: true,  // Amplifier has its own tool system
                imageInput: false
            }
        }];
    }

    /**
     * Handle chat requests by communicating with Python bridge
     */
    async provideLanguageModelChatResponse(
        model: vscode.LanguageModelChatInformation,
        messages: readonly vscode.LanguageModelChatRequestMessage[],
        options: vscode.ProvideLanguageModelChatResponseOptions,
        progress: vscode.Progress<vscode.LanguageModelResponsePart>,
        token: vscode.CancellationToken
    ): Promise<void> {
        
        // Get the workspace directory
        const workspaceRoot = this.getWorkspaceRoot();
        if (!workspaceRoot) {
            progress.report(new vscode.LanguageModelTextPart(
                '⚠️ No workspace folder is open. Please open a folder to use Amplifier.'
            ));
            return;
        }

        // Extract the user's latest prompt
        const userPrompt = this.extractUserPrompt(messages);
        if (!userPrompt) {
            progress.report(new vscode.LanguageModelTextPart('⚠️ No prompt provided.'));
            return;
        }

        try {
            // Ensure bridge process is running
            this.ensureBridgeProcess();
            
            if (!this.bridgeProcess) {
                throw new Error('Failed to start bridge process');
            }
            
            // Initialize bridge if needed
            if (!this.isInitialized) {
                progress.report(new vscode.LanguageModelTextPart('_Initializing Amplifier..._\n\n'));
                await this.initializeBridge(workspaceRoot);
            }

            // Execute prompt on persistent session
            await this.executeOnBridge(userPrompt, progress, token);
            
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            progress.report(new vscode.LanguageModelTextPart(
                `❌ Error: ${errorMsg}`
            ));
        }
    }

    /**
     * Estimate token count (simple heuristic)
     */
    async provideTokenCount(
        model: vscode.LanguageModelChatInformation,
        text: string | vscode.LanguageModelChatRequestMessage,
        token: vscode.CancellationToken
    ): Promise<number> {
        const content = typeof text === 'string' ? text : this.messageToString(text);
        // Simple estimation: ~4 chars per token
        return Math.ceil(content.length / 4);
    }

    /**
     * Get bridge process (lazily spawn if needed)
     */
    private ensureBridgeProcess(): void {
        if (this.bridgeProcess || !this.context) {
            return;
        }
        
        const { spawn } = require('child_process');
        const path = require('path');
        const { spawn } = require('child_process');
        const path = require('path');
        
        // Path to the Python bridge script
        const bridgePath = path.join(this.context.extensionPath, 'src-amplifier', 'amplifier_bridge.py');
        
        // Get Python executable - use configuration or default to 'python3'
        this.pythonPath = vscode.workspace.getConfiguration('amplifier').get<string>('pythonPath') || 'python3';
        
        console.log(`[Bridge] Starting bridge with Python: ${this.pythonPath}`);
        console.log(`[Bridge] Bridge script: ${bridgePath}`);
        
        // Convert Windows path to WSL path for the script
        const wslScriptPath = bridgePath.replace(/\\/g, '/').replace(/^([A-Za-z]):/, (_: string, drive: string) => `/mnt/${drive.toLowerCase()}`);
        
        let command: string;
        let args: string[];
        
        // Check if pythonPath is a WSL path
        if (this.pythonPath.includes('wsl.localhost') || this.pythonPath.includes('wsl$')) {
            // Convert UNC path to Linux path
            // \\wsl.localhost\Ubuntu\home\user\... -> /home/user/...
            let wslPythonPath = this.pythonPath
                .replace(/\\/g, '/')  // Convert backslashes to forward slashes
                .replace(/^\/\/wsl\.localhost\/Ubuntu/, '')  // Remove UNC prefix
                .replace(/^\/\/wsl\$\/Ubuntu/, '');  // Alternative UNC format
            
            // Ensure it starts with / if it doesn't already
            if (!wslPythonPath.startsWith('/')) {
                wslPythonPath = '/' + wslPythonPath;
            }
            
            // Use wsl --exec to avoid shell initialization
            command = 'wsl';
            args = ['--exec', wslPythonPath, wslScriptPath];
            console.log(`[Bridge] Using WSL: wsl --exec ${wslPythonPath} ${wslScriptPath}`);
        } else {
            // Use python directly (Windows or in PATH)
            command = this.pythonPath;
            args = [bridgePath];
        }
        });
        
        this.bridgeProcess = proc;

        // Setup stdout handler for responses
        if (proc.stdout) {
            proc.stdout.on('data', (data: Buffer) => {
                this.handleBridgeResponse(data);
            });
        }

        // Setup stderr handler for errors
        if (proc.stderr) {
            proc.stderr.on('data', (data: Buffer) => {
                console.error('[Bridge stderr]:', data.toString());
            });
        }

        // Handle process errors
        proc.on('error', (error: Error) => {
            console.error('[Bridge error]:', error);
            vscode.window.showErrorMessage(`Amplifier bridge error: ${error.message}`);
        });

        // Handle process exit
        proc.on('close', (code: number | null) => {
            console.log(`[Bridge closed] Exit code: ${code}`);
            this.bridgeProcess = undefined;
            this.isInitialized = false;
        });
    }

    /**
     * Handle responses from the bridge
     */
    private handleBridgeResponse(data: Buffer) {
        const text = data.toString();
        this.responseBuffer += text;
        
        // Process complete JSON lines
        const lines = this.responseBuffer.split('\n');
        this.responseBuffer = lines.pop() || ''; // Keep incomplete line
        
        for (const line of lines) {
            if (!line.trim()) {
                continue;
            }
            
            try {
                const response = JSON.parse(line);
                console.log('[Bridge response]:', response);
                
                // Resolve pending promise if exists
                const resolver = this.pendingResponses.get('current');
                if (resolver) {
                    resolver(response);
                }
            } catch (e) {
                console.error('[Bridge parse error]:', e, 'Line:', line);
            }
        }
    }

    /**
     * Initialize the bridge with workspace context
     */
    private async initializeBridge(workspaceRoot: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Bridge initialization timeout - try again or check connection'));
            }, 240000); // 4 minute timeout (tools need to download)
            
            this.pendingResponses.set('current', (response: any) => {
                clearTimeout(timeout);
                this.pendingResponses.delete('current');
                
                if (response.status === 'initialized') {
                    this.isInitialized = true;
                    resolve();
                } else if (response.status === 'error') {
                    reject(new Error(response.error));
                } else {
                    reject(new Error('Unexpected initialization response'));
                }
            });
            
            // Send initialize command with bundle path
            const bundlePath = this.context?.extensionPath 
                ? require('path').join(this.context.extensionPath, 'src-amplifier', 'amplifier_bundle.yaml')
                : '';
            
            // Convert Windows paths to WSL paths if using WSL Python
            const convertToWslPath = (winPath: string): string => {
                if (this.pythonPath && (this.pythonPath.includes('\\wsl.localhost\\') || this.pythonPath.includes('\\\\wsl$\\'))) {
                    return winPath.replace(/\\/g, '/').replace(/^([A-Za-z]):/, (_: string, drive: string) => `/mnt/${drive.toLowerCase()}`);
                }
                return winPath;
            };
            
            const command = JSON.stringify({
                command: 'initialize',
                workspace_root: convertToWslPath(workspaceRoot),
                bundle_path: convertToWslPath(bundlePath)
            }) + '\n';
            
            if (this.bridgeProcess?.stdin) {
                this.bridgeProcess.stdin.write(command);
            } else {
                reject(new Error('Bridge stdin not available'));
            }
        });
    }

    /**
     * Execute prompt on the bridge
     */
    private async executeOnBridge(
        prompt: string,
        progress: vscode.Progress<vscode.LanguageModelResponsePart>,
        token: vscode.CancellationToken
    ): Promise<void> {
        return new Promise((resolve, reject) => {
            let hasReceivedResponse = false;
            
            const timeout = setTimeout(() => {
                if (!hasReceivedResponse) {
                    reject(new Error('Bridge execution timeout'));
                }
            }, 300000); // 5 minute timeout for long operations
            
            // Handle cancellation
            token.onCancellationRequested(() => {
                clearTimeout(timeout);
                this.pendingResponses.delete('current');
                reject(new Error('Request cancelled by user'));
            });
            
            this.pendingResponses.set('current', (response: any) => {
                if (response.type === 'response') {
                    hasReceivedResponse = true;
                    // Clean and show the response
                    const cleaned = this.cleanAmplifierOutput(response.content);
                    if (cleaned.trim()) {
                        progress.report(new vscode.LanguageModelTextPart(cleaned));
                    }
                } else if (response.type === 'error') {
                    clearTimeout(timeout);
                    this.pendingResponses.delete('current');
                    reject(new Error(response.error));
                } else if (response.type === 'done') {
                    clearTimeout(timeout);
                    this.pendingResponses.delete('current');
                    resolve();
                }
            });
            
            // Send execute command
            const command = JSON.stringify({
                command: 'execute',
                prompt: prompt
            }) + '\n';
            
            if (this.bridgeProcess?.stdin) {
                this.bridgeProcess.stdin.write(command);
            } else {
                reject(new Error('Bridge stdin not available'));
            }
        });
    }

    /**
     * Clean Amplifier output for VSCode chat display
     */
    private cleanAmplifierOutput(text: string): string {
        // Strip ANSI color codes
        let cleaned = text.replace(/\x1b\[[0-9;]*m/g, '');
        
        // Split into lines for filtering
        const lines = cleaned.split('\n');
        const filtered = lines.filter(line => {
            const trimmed = line.trim();
            
            // Skip empty lines
            if (!trimmed) {
                return false;
            }
            
            // Skip metadata
            if (trimmed.includes('Preparing bundle') ||
                trimmed.includes('prepared successfully') ||
                trimmed.includes('Session ID:') ||
                (trimmed.includes('Bundle:') && trimmed.includes('Provider:')) ||
                trimmed.includes('🧠 Thinking') ||
                trimmed === '============================================================' ||
                trimmed === '------------------------------------------------------------' ||
                trimmed === 'Thinking:' ||
                trimmed.includes('Token Usage') ||
                trimmed.includes('📊') ||
                trimmed.match(/^[│└─\s]+$/)) {
                return false;
            }
            
            return true;
        });
        
        // Rejoin and clean up whitespace
        cleaned = filtered.join('\n');
        cleaned = cleaned.replace(/\n{3,}/g, '\n\n'); // Max 2 newlines
        
        return cleaned;
    }

    /**
     * Get the workspace root directory
     */
    private getWorkspaceRoot(): string | undefined {
        const folders = vscode.workspace.workspaceFolders;
        if (!folders || folders.length === 0) {
            return undefined;
        }
        return folders[0].uri.fsPath;
    }

    /**
     * Extract the user's prompt from the message history
     */
    private extractUserPrompt(messages: readonly vscode.LanguageModelChatRequestMessage[]): string {
        const lastMessage = messages[messages.length - 1];
        if (!lastMessage) {
            return '';
        }
        return this.messageToString(lastMessage);
    }

    /**
     * Convert a message to a string
     */
    private messageToString(message: vscode.LanguageModelChatRequestMessage): string {
        const parts: string[] = [];
        
        for (const part of message.content) {
            if (part instanceof vscode.LanguageModelTextPart) {
                parts.push(part.value);
            }
        }

        return parts.join('\n');
    }

    /**
     * Check if bridge is available
     */
    private async checkBridgeAvailable(): Promise<boolean> {
        return new Promise((resolve) => {
            const { spawn } = require('child_process');
            const proc = spawn('python3', ['--version']);
            
            proc.on('close', (code: number) => {
                resolve(code === 0);
            });

            proc.on('error', () => {
                resolve(false);
            });
        });
    }

    /**
     * Shutdown the bridge process
     */
    async shutdown(): Promise<void> {
        if (this.bridgeProcess) {
            return new Promise((resolve) => {
                // Send shutdown command
                const command = JSON.stringify({ command: 'shutdown' }) + '\n';
                if (this.bridgeProcess?.stdin) {
                    this.bridgeProcess.stdin.write(command);
                }
                
                // Wait a bit for graceful shutdown
                setTimeout(() => {
                    if (this.bridgeProcess) {
                        this.bridgeProcess.kill();
                        this.bridgeProcess = undefined;
                    }
                    this.isInitialized = false;
                    resolve();
                }, 1000);
            });
        }
    }
}
