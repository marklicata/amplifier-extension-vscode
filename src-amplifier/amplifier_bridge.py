#!/usr/bin/env python3
"""
VSCode Bridge Service for Amplifier
====================================

Maintains a persistent Amplifier session and handles multiple prompts
from the VSCode extension via stdin/stdout communication.

Based on amplifier-foundation examples 08 (CLI app) and 14 (session persistence).
"""
import asyncio
import json
import logging
import os
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, AsyncIterator

from amplifier_foundation import load_bundle
from amplifier_core import AmplifierSession


# =============================================================================
# Configuration
# =============================================================================

@dataclass
class BridgeConfig:
    """Bridge service configuration."""
        
    # Workspace root (set by VSCode)
    workspace_root: str | None = None
    
    # Bundle configuration
    bundle_path: str | None = None
    
    # Logging
    log_level: str = "WARNING"  # Keep quiet for VSCode
    log_file: Path | None = None
    
    @classmethod
    def from_env(cls) -> "BridgeConfig":
        """Load configuration from environment."""
        log_file = os.getenv("AMPLIFIER_BRIDGE_LOG")
        return cls(
            log_level=os.getenv("AMPLIFIER_LOG_LEVEL", "WARNING"),
            log_file=Path(log_file) if log_file else None,
        )


# =============================================================================
# Bridge Service
# =============================================================================

class VSCodeAmplifierBridge:
    """Bridge service for VSCode extension.
    
    Maintains a persistent Amplifier session and handles:
    - Session initialization with workspace context
    - Multiple prompt executions on the same session
    - Streaming responses back to VSCode
    - Graceful shutdown
    """
    
    def __init__(self, config: BridgeConfig):
        self.config = config
        self.session = None
        self.workspace_root = None
        self.logger = self._setup_logging()
    
    def _setup_logging(self) -> logging.Logger:
        """Configure logging."""
        logger = logging.getLogger("amplifier_bridge")
        logger.setLevel(getattr(logging, self.config.log_level))
        
        # Log to file if specified, otherwise stderr (won't interfere with stdout)
        if self.config.log_file:
            handler = logging.FileHandler(self.config.log_file)
        else:
            handler = logging.StreamHandler(sys.stderr)
        
        handler.setFormatter(
            logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s")
        )
        logger.addHandler(handler)
        
        return logger
    
    async def initialize(self, workspace_root: str, bundle_path: str | None = None) -> dict[str, Any]:
        """Initialize Amplifier session.
        
        Args:
            workspace_root: Path to the VSCode workspace
            bundle_path: Path to the bundle YAML file
            
        Returns:
            Status response
        """
        self.logger.info(f"Initializing bridge with workspace: {workspace_root}")
        self.workspace_root = workspace_root
        
        try:
            # Use provided bundle path or default
            if bundle_path:
                self.config.bundle_path = bundle_path
            print(bundle_path)
            
            if not self.config.bundle_path:
                return {
                    "status": "error",
                    "error": "No bundle path provided"
                }
            
            bundle_file = Path(self.config.bundle_path)
            if not bundle_file.exists():
                return {
                    "status": "error",
                    "error": f"Bundle file not found: {bundle_file}"
                }
            
            self.logger.info(f"Loading bundle from: {bundle_file}")
            
            # Load the bundle configuration
            bundle = await load_bundle(str(bundle_file))
            
            # Prepare (download modules if needed)
            self.logger.info("Preparing bundle (may download modules)...")
            prepared = await bundle.prepare()
            
            # Create persistent session
            self.logger.info("Creating session...")
            self.session = await prepared.create_session()
            
            # Change to workspace directory
            if workspace_root:
                os.chdir(workspace_root)
                self.logger.info(f"Changed working directory to: {workspace_root}")
            
            self.logger.info("Session initialized successfully")
            return {
                "status": "initialized",
                "workspace_root": workspace_root,
                "bundle": str(bundle_file)
            }
            
        except Exception as e:
            self.logger.error(f"Initialization failed: {e}", exc_info=True)
            return {
                "status": "error",
                "error": str(e)
            }
    
    async def execute_prompt(self, prompt: str) -> AsyncIterator[dict[str, Any]]:
        """Execute prompt on the persistent session.
        
        Args:
            prompt: User prompt from VSCode
            
        Yields:
            Response chunks as they stream in
        """
        if not self.session:
            yield {
                "type": "error",
                "error": "Session not initialized. Call initialize first."
            }
            return
        
        try:
            self.logger.info(f"Executing prompt: {prompt[:100]}...")
            
            # Execute on the same session - context is maintained!
            # This is the key: session.execute() maintains conversation history
            response = await self.session.execute(prompt)
            
            # For now, return the complete response
            # TODO: Implement true streaming if Amplifier supports it
            yield {
                "type": "response",
                "content": response
            }
            
            self.logger.info("Execution completed")
            
        except Exception as e:
            self.logger.error(f"Execution failed: {e}", exc_info=True)
            yield {
                "type": "error",
                "error": str(e)
            }
    
    async def shutdown(self) -> dict[str, Any]:
        """Gracefully shutdown the session.
        
        Returns:
            Status response
        """
        self.logger.info("Shutting down bridge...")
        
        if self.session:
            try:
                await self.session.cleanup()
                self.logger.info("Session cleaned up")
            except Exception as e:
                self.logger.error(f"Cleanup error: {e}", exc_info=True)
        
        return {"status": "shutdown"}


# =============================================================================
# Main Loop
# =============================================================================

async def main():
    """Main stdin/stdout communication loop.
    
    Protocol:
    - Reads JSON commands from stdin (one per line)
    - Writes JSON responses to stdout (one per line)
    - Supports: initialize, execute, shutdown commands
    """
    config = BridgeConfig.from_env()
    bridge = VSCodeAmplifierBridge(config)
    
    # Main command loop
    while True:
        try:
            # Read command from stdin
            line = sys.stdin.readline()
            if not line:
                break  # EOF
            
            request = json.loads(line.strip())
            command = request.get("command")
            
            if command == "initialize":
                # Initialize session with workspace
                result = await bridge.initialize(
                    request.get("workspace_root", ""),
                    request.get("bundle_path")
                )
                print(json.dumps(result), flush=True)
                
            elif command == "execute":
                # Execute prompt on persistent session
                prompt = request.get("prompt", "")
                
                # Stream responses back
                async for chunk in bridge.execute_prompt(prompt):
                    print(json.dumps(chunk), flush=True)
                
                # Send completion marker
                print(json.dumps({"type": "done"}), flush=True)
                
            elif command == "shutdown":
                # Graceful shutdown
                result = await bridge.shutdown()
                print(json.dumps(result), flush=True)
                break  # Exit loop
                
            else:
                # Unknown command
                error_response = {
                    "type": "error",
                    "error": f"Unknown command: {command}"
                }
                print(json.dumps(error_response), flush=True)
                
        except json.JSONDecodeError as e:
            error_response = {
                "type": "error",
                "error": f"Invalid JSON: {e}"
            }
            print(json.dumps(error_response), flush=True)
            
        except Exception as e:
            error_response = {
                "type": "error",
                "error": str(e)
            }
            print(json.dumps(error_response), flush=True)


if __name__ == "__main__":
    # Run the bridge service
    asyncio.run(main())
