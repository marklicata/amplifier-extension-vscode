# Quick Start Guide

> ⚠️ **This extension requires VS Code Insiders** - It uses a proposed API that is not available in stable VS Code.

## What Changed

Your extension now uses a **persistent Python bridge** instead of spawning the CLI each time.

### Key Improvements

✅ **Session persistence** - One Amplifier session across all messages  
✅ **Conversation history** - Amplifier remembers previous exchanges automatically  
✅ **Faster** - No 5-10 second startup after the first message  
✅ **Cleaner architecture** - Python handles Amplifier, TypeScript handles UI  

## File Structure

```
vscode-amplifier/
├── src-amplifier/
│   ├── amplifier_bridge.py      # Python bridge service
│   └── amplifier_bundle.yaml    # Amplifier bundle configuration
├── src-extension/
│   ├── extension.ts              # Extension lifecycle
│   └── provider.ts               # Chat provider implementation
├── out/                          # Compiled TypeScript
├── package.json
├── tsconfig.json
└── README.md
```

## How It Works

```
1st Message: VSCode → spawn bridge.py → load bundle → create session → execute
2nd Message: VSCode → (bridge already running) → execute on same session
3rd Message: VSCode → (bridge already running) → execute on same session
...
```

**Key**: The Python bridge maintains `self.session` and reuses it!

## Prerequisites

### 1. VS Code Insiders (Required!)

This extension uses the **proposed `chatProvider` API** which only works in VS Code Insiders.

**Download**: https://code.visualstudio.com/insiders/

> ⚠️ The extension will install in stable VS Code, but **Amplifier will NOT appear in the model picker** without Insiders + proposed API enabled.

### 2. Install Python Dependencies

```bash
pip install amplifier-core amplifier-foundation

# Or with uv
uv pip install amplifier-core amplifier-foundation
```

### 3. Set API Key

```bash
export ANTHROPIC_API_KEY='your-key-here'
```

### 4. Verify Installation

```bash
python3 -c "from amplifier_core import AmplifierSession; print('OK')"
python3 -c "from amplifier_foundation import load_bundle; print('OK')"
```

## Testing

### 1. Launch Extension (Development)

In **VS Code Insiders** (with the `vscode-amplifier` folder open):
- Press **F5**
- Extension Development Host window opens
- Proposed APIs are **automatically enabled** in debug mode

### 2. Use the Extension

In the Extension Development Host window:

1. **Open a workspace folder** (File → Open Folder)
2. **Open Chat** - `Ctrl+Alt+I` (or `⌘+⌥+I` on Mac)
3. **Select "Amplifier (Persistent Session)"** from model picker
4. **Send first message** - Will see "_Initializing Amplifier..._" (takes 5-10 sec)
5. **Send second message** - Should be instant! (session already running)

> **Troubleshooting**: If "Amplifier" doesn't appear in the model picker, make sure you're using VS Code Insiders and the proposed API is enabled.

### 3. Test Conversation Persistence

Try this conversation:

```
You: "List the files in this workspace"
[Amplifier responds with file list]

You: "Tell me more about the first file you mentioned"
[Amplifier should remember which file from previous message!]

You: "Now analyze that file's structure"
[Continues building on context]
```

## Debugging

### Check Bridge Process

In the **Debug Console** of the main VSCode window (where you pressed F5):

```
[Bridge] Bridge service started
[Bridge] Command: initialize
[Bridge] Initializing with workspace: /path/to/workspace
[Bridge] Loading bundle: amplifier_bundle.yaml
[Bridge] Session initialized successfully
[Bridge] Command: execute
[Bridge] Executing: hello...
[Bridge] Execution complete
```

### Common Issues

**"Amplifier not installed" error**:
```bash
pip install amplifier-core amplifier-foundation
```

**Bridge process not starting**:
- Check Debug Console for Python errors
- Verify `python3` is in PATH
- Try running bridge manually:
  ```bash
  cd vscode-amplifier
  echo '{"command":"shutdown"}' | python3 src-amplifier/amplifier_bridge.py
  ```

**Session not initialized**:
- First message should show "_Initializing Amplifier..._"
- Check Debug Console for initialization errors
- Verify API key is set: `echo $ANTHROPIC_API_KEY`

## Fine-Tuning the UI

### Edit Output Filtering

Open `src-extension/provider.ts` and find the `cleanAmplifierOutput()` method (around line 280).

**To hide something**:
```typescript
// Skip specific text
if (trimmed.includes('Text you want to hide')) {
    return false;
}
```

**To show something currently hidden**:
```typescript
// Comment out the filter
// if (trimmed.includes('Previously hidden text')) {
//     return false;
// }
```

### Iteration Loop

1. Edit `src-extension/provider.ts`
2. Run `npm run compile` (or use `npm run watch` for auto-compile)
3. Reload extension: Press `Ctrl+R` in Extension Development Host window
4. Test your changes in chat
5. Check Debug Console to see what's being filtered

## Configuration

### Change Bundle

Edit `src-amplifier/amplifier_bundle.yaml` to customize:
- Different provider (OpenAI, Azure, etc.)
- Different tools
- Different orchestrator

### Change Provider

In `amplifier_bundle.yaml`:

```yaml
providers:
  - config:
      default_model: gpt-4
    module: provider-openai
    source: git+https://github.com/microsoft/amplifier-module-provider-openai@main
```

Then set appropriate API key:
```bash
export OPENAI_API_KEY='your-key-here'
```

## Next Steps

1. **Test multi-turn conversations** - Verify context is maintained
2. **Fine-tune UI filtering** - Hide/show what you want in chat
3. **Package for distribution** - `npm run package` creates `.vsix`
4. **Add features** - Streaming, progress indicators, etc.

## Distributing the Extension

### Package It
```bash
npm run package
# Creates: vscode-amplifier-0.1.0.vsix
```

### Share With Others

Recipients need:
1. **VS Code Insiders** - https://code.visualstudio.com/insiders/
2. **The `.vsix` file**
3. **Python + amplifier-foundation installed**
4. **Their own API key**

### Recipient Setup Instructions

```bash
# Install the extension
code-insiders --install-extension vscode-amplifier-0.1.0.vsix
```

Then enable the proposed API (one-time):
1. Open VS Code Insiders
2. Press `Ctrl+Shift+P` → "Preferences: Configure Runtime Arguments"
3. Add this to the JSON file:
   ```json
   {
       "enable-proposed-api": ["amplifier.vscode-amplifier"]
   }
   ```
4. Restart VS Code Insiders
5. Open Chat and select "Amplifier" from the model picker

> **Why Insiders?** The Language Model Chat Provider API is a "proposed API" that Microsoft is still finalizing. Once it becomes stable, this extension will work in regular VS Code and can be published to the Marketplace.

## Architecture Notes

Based on the proven pattern from `amplifier-chat.py`:

- **Lazy initialization** - Session created on first execute()
- **Session reuse** - Same session object across all prompts
- **Context auto-maintained** - Amplifier handles conversation history
- **Clean separation** - Python manages AI, TypeScript manages UI
