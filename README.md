# Amplifier for VSCode

Use [Amplifier](https://github.com/microsoft/amplifier) as a persistent language model in VSCode Chat.

> ⚠️ **Important**: This extension uses VS Code's proposed `chatProvider` API and **requires VS Code Insiders**. It will not work in the stable version of VS Code. See [Requirements](#requirements) for details.

## What This Does

This extension bridges VSCode's chat interface with Amplifier's AI orchestration system. Unlike traditional language models, this maintains a **persistent session** across all your chat interactions:

- **Single session** - Context maintained across all messages (no re-initialization)
- **Conversation history** - Amplifier remembers previous exchanges
- **Full capabilities** - Agents, tools, recipes, multi-step workflows
- **Workspace-aware** - Works in your project directory with file access

## Architecture

```
VSCode Chat UI
     ↓ (user prompts)
VSCode Extension
     ↓ (stdin/stdout JSON)
Python Bridge Service
     ↓ (Python API)
Persistent Amplifier Session
     ↓ (maintains context)
Agents + Tools
```

The bridge service:
1. Spawns once when extension activates
2. Maintains a single Amplifier session
3. Executes all prompts on the same session (context preserved!)
4. Only re-initializes if workspace changes or process crashes

## Requirements

### 1. VS Code Insiders (Required)

This extension uses the **proposed `chatProvider` API** which is only available in VS Code Insiders. The stable version of VS Code does not support custom language model providers.

**Why Insiders?**
- The Language Model Chat Provider API is still being finalized by Microsoft
- Proposed APIs are only enabled in Insiders builds
- Once the API stabilizes, this extension will work in stable VS Code

**Download**: [VS Code Insiders](https://code.visualstudio.com/insiders/)

### 2. Python and amplifier-foundation

```bash
# Install amplifier-foundation
pip install git+https://github.com/microsoft/amplifier-foundation

# Or with uv
uv pip install git+https://github.com/microsoft/amplifier-foundation
```

### 3. API Keys

Set your LLM provider API key:

```bash
# For Anthropic (default)
export ANTHROPIC_API_KEY='your-key-here'

# Or OpenAI
export OPENAI_API_KEY='your-key-here'
```

### 4. GitHub Copilot

You need an active Copilot subscription (Free, Pro, Business, or Enterprise) to use custom language model providers in VSCode.

## Installation

### From Source (Development)

1. Clone or download this repository
2. Install dependencies:
   ```bash
   cd vscode-amplifier
   npm install
   ```
3. Compile TypeScript:
   ```bash
   npm run compile
   ```
4. Open the folder in **VS Code Insiders**
5. Press `F5` to launch Extension Development Host (proposed APIs are automatically enabled in debug mode)

### From VSIX (For Distribution)

#### Step 1: Package the extension
```bash
npm run package
```

#### Step 2: Install in VS Code Insiders
```bash
code-insiders --install-extension vscode-amplifier-0.1.0.vsix
```

#### Step 3: Enable the proposed API (one-time setup)

The extension uses a proposed API that must be explicitly enabled. Choose one method:

**Option A: Configure permanently (Recommended)**

1. Open VS Code Insiders
2. Run command: `Preferences: Configure Runtime Arguments`
3. Add to the `argv.json` file:
   ```json
   {
       "enable-proposed-api": ["amplifier.vscode-amplifier"]
   }
   ```
4. Restart VS Code Insiders

**Option B: Launch with flag**

Always launch VS Code Insiders with:
```bash
code-insiders --enable-proposed-api=amplifier.vscode-amplifier
```

> **Note**: Without enabling the proposed API, the extension will install but Amplifier will NOT appear in the model picker.

## Usage

1. **Open a workspace** - Required for Amplifier to know where to work
2. **Open Chat** - `Ctrl+Alt+I` (Windows/Linux) or `⌘+⌥+I` (Mac)
3. **Select "Amplifier (Persistent Session)"** from model picker
4. **Start chatting** - Your first message initializes the session

### Example Conversation

```
You: "Analyze this codebase structure"
Amplifier: [analyzes files and provides overview]

You: "Add tests for the auth module"  
Amplifier: [remembers previous context, knows about auth module]

You: "Now refactor it to use dependency injection"
Amplifier: [continues same session, has full history]
```

**Key benefit**: Each message builds on previous context automatically!

## Configuration

### Change Provider

Default is Anthropic Claude Sonnet. To use a different provider:

```bash
# Set environment variable before starting VSCode
export AMPLIFIER_PROVIDER="openai-gpt4.yaml"
```

### Debug Logging

Enable bridge logging to troubleshoot issues:

```bash
export AMPLIFIER_LOG_LEVEL="INFO"
export AMPLIFIER_BRIDGE_LOG="/tmp/amplifier-bridge.log"
```

## How It Works

### Session Lifecycle

1. **First message**: Extension spawns Python bridge → Bridge creates Amplifier session → Executes prompt
2. **Subsequent messages**: Executed on the same session (context maintained!)
3. **Extension deactivation**: Bridge shuts down gracefully

### Communication Protocol

**VSCode Extension → Python Bridge** (stdin JSON):
```json
{"command": "initialize", "workspace_root": "/path/to/workspace"}
{"command": "execute", "prompt": "user message"}
{"command": "shutdown"}
```

**Python Bridge → VSCode Extension** (stdout JSON):
```json
{"status": "initialized"}
{"type": "response", "content": "Amplifier response text"}
{"type": "done"}
{"type": "error", "error": "error message"}
```

### Why This Design?

- **Persistent session** - Same Amplifier session across all messages (fast, context-aware)
- **Python API** - Direct access to amplifier-foundation (no CLI parsing)
- **Based on proven examples** - Uses patterns from amplifier-foundation examples 08 + 14
- **Clean separation** - TypeScript handles UI, Python handles AI orchestration

## Troubleshooting

### "Amplifier bridge not available"

**Check Python**:
```bash
python3 --version
```

**Check amplifier-foundation**:
```bash
python3 -c "import amplifier_foundation; print('OK')"
```

**Install if missing**:
```bash
pip install git+https://github.com/microsoft/amplifier-foundation
```

### "No workspace folder is open"

Amplifier needs a directory to work in:
- `File → Open Folder` (or `Ctrl+K Ctrl+O`)

### Bridge process crashes

Check the debug log:
```bash
tail -f /tmp/amplifier-bridge.log
```

Or check Debug Console in VSCode (`Ctrl+Shift+Y`) for error messages.

### Session not responding

**Restart the extension**:
1. `Ctrl+Shift+P` → "Developer: Reload Window"
2. Or close and reopen VSCode

This will spawn a fresh bridge process.

## Development

### Project Structure

```
vscode-amplifier/
├── src-amplifier/
│   ├── amplifier_bridge.py    # Python bridge service (persistent session)
│   └── amplifier_bundle.yaml  # Amplifier bundle configuration
├── src-extension/
│   ├── extension.ts           # Extension activation/deactivation
│   └── provider.ts            # LanguageModelChatProvider implementation
├── package.json               # Extension manifest
└── tsconfig.json             # TypeScript config
```

### Building

```bash
npm run compile      # Compile once
npm run watch        # Auto-compile on changes
```

### Packaging

```bash
npm run package      # Creates .vsix file
```

### Debugging

1. Open `vscode-amplifier` folder in VSCode
2. Press `F5` (Run → Start Debugging)
3. Extension Development Host window opens
4. Check Debug Console for bridge communication logs

## Performance Notes

- **First message**: ~5-10 seconds (downloads modules, creates session)
- **Subsequent messages**: Instant start (session already running)
- **Memory**: Bridge process stays in memory (~100-200MB)
- **Cleanup**: Automatic on VSCode exit or extension deactivation

## Future Enhancements

- [ ] True streaming support (chunk-by-chunk as Amplifier generates)
- [ ] Multi-workspace session management
- [ ] Settings UI for provider selection
- [ ] Session reset command
- [ ] Progress indicators for long operations

## Answers to Your Questions

### 1. How to fine-tune the UI?

**Edit `src/provider.ts` lines ~280-320** (the `cleanAmplifierOutput` method):

```typescript
// Skip specific lines
if (trimmed.includes('Some text to hide')) {
    return false;  // Skip this line
}

// Keep specific lines
if (trimmed.includes('Important info')) {
    return true;  // Show this line
}
```

**Quick iteration**:
1. Edit the filtering logic
2. Run `npm run compile` (or use `npm run watch` for auto-compile)
3. Reload extension: Press `Ctrl+R` in Extension Development Host window
4. Test your changes
5. Check Debug Console to see what's being filtered

### 2. Session persistence?

**✅ Already implemented!** The bridge maintains a single Amplifier session across all messages. Your conversation history is automatically preserved.

Benefits:
- No re-initialization between messages
- Context builds naturally across the conversation
- Much faster response times (no startup overhead)

## Distributing to Others

### What Recipients Need

1. **VS Code Insiders** - Download from [code.visualstudio.com/insiders](https://code.visualstudio.com/insiders/)
2. **The `.vsix` file** - Share `vscode-amplifier-0.1.0.vsix`
3. **Python + amplifier-foundation** - `pip install git+https://github.com/microsoft/amplifier-foundation`
4. **API key** - Their own Anthropic/OpenAI API key
5. **GitHub Copilot subscription** - Required for custom model providers

### Quick Setup Instructions for Recipients

```bash
# 1. Install the extension in Insiders
code-insiders --install-extension vscode-amplifier-0.1.0.vsix

# 2. Enable the proposed API (run this once)
code-insiders --enable-proposed-api=amplifier.vscode-amplifier
```

Then in VS Code Insiders:
1. Run command: `Preferences: Configure Runtime Arguments`
2. Add: `"enable-proposed-api": ["amplifier.vscode-amplifier"]`
3. Restart VS Code Insiders
4. Open Chat (`Ctrl+Alt+I`) and select "Amplifier" from the model picker

### Why Can't This Be Published to the Marketplace?

Extensions using proposed APIs cannot be published to the VS Code Marketplace. This is a Microsoft policy because proposed APIs:
- May change without notice
- Are not guaranteed to be stable
- Are still being finalized

Once the `chatProvider` API moves to stable, this extension can be published normally.

## License

MIT

## Links

- [Amplifier](https://github.com/microsoft/amplifier)
- [Amplifier Foundation](https://github.com/microsoft/amplifier-foundation)
- [VSCode Language Model Chat Provider API](https://code.visualstudio.com/api/extension-guides/ai/language-model-chat-provider)
- [VS Code Proposed API Documentation](https://code.visualstudio.com/api/advanced-topics/using-proposed-api)
